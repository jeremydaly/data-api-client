'use strict'

/**
 * Query execution logic
 */

import {
  ExecuteStatementCommand,
  BatchExecuteStatementCommand,
  RollbackTransactionCommand,
  type ExecuteStatementCommandOutput,
  type BatchExecuteStatementCommandOutput
} from '@aws-sdk/client-rds-data'
import type { InternalConfig, QueryResult } from './types'
import { parseSQL, getSqlParams, flatten, pick } from './utils'
import {
  parseParams,
  parseDatabase,
  parseHydrate,
  parseFormatOptions,
  prepareParams,
  normalizeParams,
  processParams
} from './params'
import { formatResults } from './results'

// Query function (use standard form for `this` context)
export const query = async function (
  this: { rollback?: (err: Error, status: any) => void } | undefined,
  config: InternalConfig,
  ..._args: any[]
): Promise<QueryResult> {
  // Flatten array if nested arrays (fixes #30)
  const args = Array.isArray(_args[0]) ? flatten(_args as any[][]) : _args

  // Parse and process sql
  const sql = parseSQL(args)
  const sqlParams = getSqlParams(sql)

  // Parse hydration setting
  const hydrateColumnNames = parseHydrate(config, args)

  // Parse data format settings
  const formatOptions = parseFormatOptions(config, args)

  // Parse and normalize parameters
  const parameters = normalizeParams(parseParams(args))

  // Process parameters and escape necessary SQL
  const { processedParams, escapedSql } = processParams(config.engine, sql, sqlParams, parameters, formatOptions)

  // Determine if this is a batch request
  const isBatch = processedParams.length > 0 && Array.isArray(processedParams[0])

  // Create/format the parameters
  const params: any = Object.assign(
    prepareParams(config, args),
    {
      database: parseDatabase(config, args), // add database
      sql: escapedSql // add escaped sql statement
    },
    // Only include parameters if they exist
    processedParams.length > 0
      ? // Batch statements require parameterSets instead of parameters
        { [isBatch ? 'parameterSets' : 'parameters']: processedParams }
      : {},
    // Force meta data if set and not a batch
    hydrateColumnNames && !isBatch ? { includeResultMetadata: true } : {},
    // If a transactionId is passed, overwrite any manual input
    config.transactionId ? { transactionId: config.transactionId } : {}
  ) // end params

  try {
    // attempt to run the query
    // console.log(`Executing ${isBatch ? 'batch ' : ''}query: `, params)
    // console.log(`Query parameters: `, JSON.stringify(params.parameters ?? params.parameterSets, null, 2))

    // Capture the result for debugging
    const result: ExecuteStatementCommandOutput | BatchExecuteStatementCommandOutput = await (isBatch
      ? config.RDS.send(new BatchExecuteStatementCommand(params))
      : config.RDS.send(new ExecuteStatementCommand(params)))

    // Format and return the results
    return formatResults(result, hydrateColumnNames, args[0].includeResultMetadata === true, formatOptions)
  } catch (e) {
    if (this && this.rollback) {
      const rollback = await config.RDS.send(
        new RollbackTransactionCommand(pick(params, ['resourceArn', 'secretArn', 'transactionId']))
      )

      this.rollback(e as Error, rollback)
    }
    // Throw the error
    throw e
  }
} // end query
