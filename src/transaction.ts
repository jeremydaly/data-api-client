'use strict'

/**
 * Transaction management
 */

import { BeginTransactionCommand, CommitTransactionCommand } from '@aws-sdk/client-rds-data'
import type { InternalConfig, Transaction, QueryOptions } from './types'
import { parseDatabase, parseHydrate, parseFormatOptions, prepareParams } from './params'
import { pick } from './utils'
import { query } from './query'

// Init a transaction object and return methods
export const transaction = (config: InternalConfig, _args?: Partial<QueryOptions>): Transaction => {
  const args = typeof _args === 'object' ? [_args] : [{}]
  const queries: Array<(lastResult: any, allResults: any[]) => any[]> = [] // keep track of queries
  let rollback: (err: Error, status: any) => void = () => {} // default rollback event

  const txConfig: InternalConfig = Object.assign(prepareParams(config, args), {
    database: parseDatabase(config, args), // add database
    hydrateColumnNames: parseHydrate(config, args), // add hydrate
    formatOptions: parseFormatOptions(config, args), // add formatOptions
    RDS: config.RDS, // reference the RDSDataService instance
    engine: config.engine
  })

  return {
    query: function (...args: any[]): Transaction {
      if (typeof args[0] === 'function') {
        queries.push(args[0])
      } else {
        queries.push(() => [...args])
      }
      return this
    },
    rollback: function (fn: (err: Error, status: any) => void): Transaction {
      if (typeof fn === 'function') {
        rollback = fn
      }
      return this
    },
    commit: async function (): Promise<any[]> {
      return await commit(txConfig, queries, rollback)
    }
  }
}

// Commit transaction by running queries
export const commit = async (
  config: InternalConfig,
  queries: Array<(lastResult: any, allResults: any[]) => any[]>,
  rollback: (err: Error, status: any) => void
): Promise<any[]> => {
  const results: any[] = [] // keep track of results

  // Start a transaction
  const { transactionId } = await config.RDS.send(
    new BeginTransactionCommand(pick(config, ['resourceArn', 'secretArn', 'database']))
  )

  // Add transactionId to the config
  const txConfig: InternalConfig = Object.assign(config, { transactionId })

  // Loop through queries
  for (let i = 0; i < queries.length; i++) {
    // Execute the queries, pass the rollback as context
    const result = await query.apply({ rollback }, [config, queries[i](results[results.length - 1], results)])
    // Add the result to the main results accumulator
    results.push(result)
  }

  // Commit our transaction
  const { transactionStatus } = await txConfig.RDS.send(
    new CommitTransactionCommand({
      resourceArn: txConfig.resourceArn,
      secretArn: txConfig.secretArn,
      transactionId: txConfig.transactionId!
    })
  )

  // Add the transaction status to the results
  results.push({ transactionStatus })

  // Return the results
  return results
}
