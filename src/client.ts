'use strict'

/**
 * Client initialization and configuration
 */

import {
  RDSDataClient,
  ExecuteStatementCommand,
  BatchExecuteStatementCommand,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand
} from '@aws-sdk/client-rds-data'
import type { DataAPIClientConfig, InternalConfig, DataAPIClient, QueryOptions, QueryResult } from './types'
import { error } from './utils'
import { query } from './query'
import { transaction } from './transaction'

/**
 * Create a Data API client instance
 * @param {object} params
 * @param {'mysql'|'pg'} [params.engine=mysql] The type of database (MySQL or Postgres)
 * @param {string} params.resourceArn The ARN of your Aurora Serverless Cluster
 * @param {string} params.secretArn The ARN of the secret associated with your
 *   database credentials
 * @param {string} [params.database] The name of the database
 * @param {boolean} [params.hydrateColumnNames=true] Return objects with column
 *   names as keys
 * @param {object} [params.options={}] Configuration object passed directly
 *   into RDSDataService
 * @param {object} [params.formatOptions] Date-related formatting options
 * @param {boolean} [params.formatOptions.deserializeDate=false]
 * @param {boolean} [params.formatOptions.treatAsLocalDate=false]
 * @param {boolean} [params.keepAlive] DEPRECATED
 * @param {boolean} [params.sslEnabled=true] DEPRECATED
 * @param {string} [params.region] DEPRECATED
 *
 */
export const init = (params: DataAPIClientConfig): DataAPIClient => {
  // Set the options for the RDSDataClient
  const options: ConstructorParameters<typeof RDSDataClient>[0] =
    typeof params.options === 'object'
      ? params.options
      : params.options !== undefined
      ? error(`'options' must be an object`)
      : {}

  // Update the region if provided (deprecated, use options instead)
  if (typeof params.region === 'string') {
    options.region = params.region
  }

  // Note: sslEnabled is deprecated in AWS SDK v3
  // TLS is enabled by default. Use custom endpoint for local development
  if (params.sslEnabled === false) {
    // For local development, users should set options.endpoint
    console.warn('sslEnabled is deprecated. For local development, set options.endpoint instead.')
  }

  // Set the configuration for this instance
  const config: InternalConfig = {
    // Require engine
    engine: typeof params.engine === 'string' ? params.engine : 'mysql',

    // Require secretArn
    secretArn: typeof params.secretArn === 'string' ? params.secretArn : error(`'secretArn' string value required`),

    // Require resourceArn
    resourceArn:
      typeof params.resourceArn === 'string' ? params.resourceArn : error(`'resourceArn' string value required`),

    // Load optional database
    database:
      typeof params.database === 'string'
        ? params.database
        : params.database !== undefined
        ? error(`'database' must be a string`)
        : undefined,

    // Load optional schema DISABLED for now since this isn't used with MySQL
    // schema: typeof params.schema === 'string' ? params.schema
    //   : params.schema !== undefined ? error(`'schema' must be a string`)
    //   : undefined,

    // Set hydrateColumnNames (default to true)
    hydrateColumnNames: typeof params.hydrateColumnNames === 'boolean' ? params.hydrateColumnNames : true,

    // Value formatting options. For date the deserialization is enabled and (re)stored as UTC
    formatOptions: {
      deserializeDate:
        typeof params.formatOptions === 'object' && params.formatOptions.deserializeDate === false ? false : true,
      treatAsLocalDate:
        typeof params.formatOptions === 'object' && params.formatOptions.treatAsLocalDate ? true : false
    },

    // TODO: Put this in a separate module for testing?
    // Create an instance of RDSDataClient
    RDS: params.client ? params.client : new RDSDataClient(options)
  } // end config

  // Return public methods
  return {
    // Query method, pass config and parameters
    query: <T = any>(...x: any[]): Promise<QueryResult<T>> => query.call(undefined, config, ...x),
    // Transaction method, pass config and parameters
    transaction: (x?: Partial<QueryOptions>) => transaction(config, x),

    // Export command-based versions of the RDSDataClient methods
    batchExecuteStatement: async (args) =>
      config.RDS.send(
        new BatchExecuteStatementCommand({
          ...args,
          resourceArn: args.resourceArn || config.resourceArn,
          secretArn: args.secretArn || config.secretArn,
          database: args.database || config.database
        })
      ),
    beginTransaction: async (args) =>
      config.RDS.send(
        new BeginTransactionCommand({
          ...(args || {}),
          resourceArn: args?.resourceArn || config.resourceArn,
          secretArn: args?.secretArn || config.secretArn,
          database: args?.database || config.database
        })
      ),
    commitTransaction: async (args) =>
      config.RDS.send(
        new CommitTransactionCommand({
          ...args,
          resourceArn: args.resourceArn || config.resourceArn,
          secretArn: args.secretArn || config.secretArn
        })
      ),
    executeStatement: async (args) =>
      config.RDS.send(
        new ExecuteStatementCommand({
          ...args,
          resourceArn: args.resourceArn || config.resourceArn,
          secretArn: args.secretArn || config.secretArn,
          database: args.database || config.database
        })
      ),
    rollbackTransaction: async (args) =>
      config.RDS.send(
        new RollbackTransactionCommand({
          ...args,
          resourceArn: args.resourceArn || config.resourceArn,
          secretArn: args.secretArn || config.secretArn
        })
      )
  }
} // end init
