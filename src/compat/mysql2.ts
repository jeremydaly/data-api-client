'use strict'

/**
 * MySQL2 compatibility layer
 *
 * Provides a mysql2-like interface for data-api-client, allowing drop-in
 * compatibility with tools like Drizzle, Kysely, and Knex that expect
 * a mysql2 connection.
 */

import { EventEmitter } from 'events'
import SqlString from 'sqlstring'
import { init } from '../client'
import type { DataAPIClientConfig, DataAPIClient, QueryResult as DataAPIQueryResult } from '../types'
import { mapToMySQLError } from './errors'

// Define our own compatible types instead of using mysql2's types
// This allows us to properly type the Promise-based interface

// Connection returned from pool has a release method
export interface PoolConnection extends Connection {
  release?: () => void
}

export interface Connection extends EventEmitter {
  connect(callback?: (err: Error | null) => void): Promise<void>
  end(callback?: (err?: Error) => void): Promise<void>
  // Query overloads - always return Promise for compatibility with mysql2
  query<R = any>(sql: string): Promise<[R[] | MySQL2QueryResult<R>, any]>
  query<R = any>(
    sql: string,
    callback: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
  ): Promise<void>
  query<R = any>(sql: string, params: any[] | Record<string, any>): Promise<[R[] | MySQL2QueryResult<R>, any]>
  query<R = any>(
    sql: string,
    params: any[] | Record<string, any>,
    callback: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
  ): Promise<void>
  query<R = any>(options: { sql: string; values?: any[]; namedPlaceholders?: boolean }): Promise<[R[] | MySQL2QueryResult<R>, any]>
  query<R = any>(
    options: { sql: string; values?: any[]; namedPlaceholders?: boolean },
    params: any[] | Record<string, any>
  ): Promise<[R[] | MySQL2QueryResult<R>, any]>
  query<R = any>(
    options: { sql: string; values?: any[]; namedPlaceholders?: boolean },
    callback: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
  ): Promise<void>
  query<R = any>(
    options: { sql: string; values?: any[]; namedPlaceholders?: boolean },
    params: any[] | Record<string, any>,
    callback: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
  ): Promise<void>
  // Execute overloads
  execute<R = any>(sql: string): Promise<[R[] | MySQL2QueryResult<R>, any]>
  execute<R = any>(
    sql: string,
    callback: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
  ): Promise<void>
  execute<R = any>(sql: string, params: any[] | Record<string, any>): Promise<[R[] | MySQL2QueryResult<R>, any]>
  execute<R = any>(
    sql: string,
    params: any[] | Record<string, any>,
    callback: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
  ): Promise<void>
  execute<R = any>(options: { sql: string; values?: any[]; namedPlaceholders?: boolean }): Promise<[R[] | MySQL2QueryResult<R>, any]>
  execute<R = any>(
    options: { sql: string; values?: any[]; namedPlaceholders?: boolean },
    params: any[] | Record<string, any>
  ): Promise<[R[] | MySQL2QueryResult<R>, any]>
  execute<R = any>(
    options: { sql: string; values?: any[]; namedPlaceholders?: boolean },
    callback: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
  ): Promise<void>
  execute<R = any>(
    options: { sql: string; values?: any[]; namedPlaceholders?: boolean },
    params: any[] | Record<string, any>,
    callback: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
  ): Promise<void>
  beginTransaction(callback?: (err: Error | null) => void): Promise<void>
  commit(callback?: (err?: Error) => void): Promise<void>
  rollback(callback?: (err?: Error) => void): Promise<void>
  ping(callback?: (err?: Error) => void): Promise<void>
}

export interface Pool extends EventEmitter {
  getConnection(callback: (err: Error | null, connection: PoolConnection) => any): void
  getConnection(): Promise<PoolConnection>
  end(callback?: (err?: Error) => void): Promise<void>
  // Query overloads
  query<R = any>(sql: string): Promise<[R[] | MySQL2QueryResult<R>, any]>
  query<R = any>(
    sql: string,
    callback: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
  ): Promise<void>
  query<R = any>(sql: string, params: any[] | Record<string, any>): Promise<[R[] | MySQL2QueryResult<R>, any]>
  query<R = any>(
    sql: string,
    params: any[] | Record<string, any>,
    callback: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
  ): Promise<void>
  query<R = any>(options: { sql: string; values?: any[]; namedPlaceholders?: boolean }): Promise<[R[] | MySQL2QueryResult<R>, any]>
  query<R = any>(
    options: { sql: string; values?: any[]; namedPlaceholders?: boolean },
    params: any[] | Record<string, any>
  ): Promise<[R[] | MySQL2QueryResult<R>, any]>
  query<R = any>(
    options: { sql: string; values?: any[]; namedPlaceholders?: boolean },
    callback: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
  ): Promise<void>
  query<R = any>(
    options: { sql: string; values?: any[]; namedPlaceholders?: boolean },
    params: any[] | Record<string, any>,
    callback: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
  ): Promise<void>
  // Execute overloads
  execute<R = any>(sql: string): Promise<[R[] | MySQL2QueryResult<R>, any]>
  execute<R = any>(
    sql: string,
    callback: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
  ): Promise<void>
  execute<R = any>(sql: string, params: any[] | Record<string, any>): Promise<[R[] | MySQL2QueryResult<R>, any]>
  execute<R = any>(
    sql: string,
    params: any[] | Record<string, any>,
    callback: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
  ): Promise<void>
  execute<R = any>(options: { sql: string; values?: any[]; namedPlaceholders?: boolean }): Promise<[R[] | MySQL2QueryResult<R>, any]>
  execute<R = any>(
    options: { sql: string; values?: any[]; namedPlaceholders?: boolean },
    params: any[] | Record<string, any>
  ): Promise<[R[] | MySQL2QueryResult<R>, any]>
  execute<R = any>(
    options: { sql: string; values?: any[]; namedPlaceholders?: boolean },
    callback: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
  ): Promise<void>
  execute<R = any>(
    options: { sql: string; values?: any[]; namedPlaceholders?: boolean },
    params: any[] | Record<string, any>,
    callback: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
  ): Promise<void>
  releaseConnection(connection: PoolConnection): void
  promise(): Pool
  unprepare(sql: string): any
  config: DataAPIClientConfig
}

// MySQL2-compatible types
export interface MySQL2QueryResult<R = any> {
  // For SELECT queries
  rows?: R[]
  fields?: Array<{
    name: string
    type?: number
    table?: string
    database?: string
  }>
  // For INSERT queries
  insertId?: number
  affectedRows?: number
  // For UPDATE/DELETE queries
  changedRows?: number
  warningCount?: number
}

/**
 * Format MySQL query with parameters using SqlString.format()
 * This handles ? placeholders and escapes values properly.
 * Returns the fully formatted SQL string ready for Data API.
 */
function formatMySQLQuery(sql: string, params: any[] = []): string {
  // Use SqlString.format to replace ? placeholders with escaped values
  return SqlString.format(sql, params)
}

/**
 * Convert named placeholders (:name) to positional placeholders (?)
 * and create an ordered array of values.
 *
 * This mimics mysql2's namedPlaceholders behavior:
 * - Finds all :name patterns in SQL
 * - Replaces them with ? in order of appearance
 * - Creates array of values in the same order
 * - Supports multiple references to the same parameter (each gets its own ?)
 *
 * Example:
 *   Input: "SELECT * FROM users WHERE name = :name AND age > :age"
 *   Params: { name: 'Alice', age: 25 }
 *   Output: { sql: "SELECT * FROM users WHERE name = ? AND age > ?", values: ['Alice', 25] }
 *
 * Example with multiple references:
 *   Input: "SELECT :x + :x AS double"
 *   Params: { x: 5 }
 *   Output: { sql: "SELECT ? + ? AS double", values: [5, 5] }
 */
function convertNamedPlaceholders(sql: string, params: Record<string, any>): { sql: string; values: any[] } {
  const values: any[] = []

  // Match :identifier or :number patterns
  // Use word boundary to avoid matching partial identifiers
  const regex = /:(\w+)\b/g

  const convertedSql = sql.replace(regex, (match, paramName) => {
    // Check if parameter exists in params object
    if (paramName in params) {
      values.push(params[paramName])
      return '?'
    }
    // If parameter not found, keep the original (will likely cause an error later)
    // This matches mysql2 behavior
    return match
  })

  return { sql: convertedSql, values }
}

/**
 * Convert Data API result to mysql2-compatible result
 */
function convertToMySQL2Result<R = any>(
  result: DataAPIQueryResult<R>,
  _sql: string
): [R[] | MySQL2QueryResult<R>, any] {
  if (result.records && Array.isArray(result.records)) {
    // SELECT query - return rows and fields
    // Note: The format (object vs array) is determined by hydrateColumnNames option
    // passed to core.query(), not here
    const rows = result.records as R[]

    // Generate field metadata
    // For arrays: use indices; for objects: use keys
    let fields: any[] = []
    if (rows.length > 0) {
      const firstRow = rows[0] as any
      if (Array.isArray(firstRow)) {
        // Array format - create field descriptors with indices
        fields = firstRow.map((_: any, index: number) => ({ name: index.toString() }))
      } else {
        // Object format - use property names
        fields = Object.keys(firstRow).map((name) => ({ name }))
      }
    }

    return [rows, fields]
  } else if (result.insertId !== undefined) {
    // INSERT query - check this before numberOfRecordsUpdated since INSERTs may have both
    const queryResult: MySQL2QueryResult<R> = {
      insertId: result.insertId,
      affectedRows: result.numberOfRecordsUpdated || 1,
      warningCount: 0
    }
    return [queryResult, []]
  } else if (result.numberOfRecordsUpdated !== undefined) {
    // UPDATE/DELETE query
    const queryResult: MySQL2QueryResult<R> = {
      affectedRows: result.numberOfRecordsUpdated,
      changedRows: result.numberOfRecordsUpdated,
      warningCount: 0
    }
    return [queryResult, []]
  } else {
    // Other queries
    const queryResult: MySQL2QueryResult<R> = {
      affectedRows: 0,
      warningCount: 0
    }
    return [queryResult, []]
  }
}

/**
 * Create a mysql2-compatible connection
 */
export function createMySQLConnection(config: DataAPIClientConfig): Connection {
  // Force MySQL engine
  // Note: hydrateColumnNames is controlled per-query based on rowsAsArray option
  const mysqlConfig: DataAPIClientConfig = {
    ...config,
    engine: 'mysql'
  }

  const core: DataAPIClient = init(mysqlConfig)
  const eventEmitter = new EventEmitter()
  let transactionId: string | undefined

  // Helper to execute query logic
  async function executeQuery<R = any>(
    sqlOrOptions: string | { sql: string; values?: any[]; rowsAsArray?: boolean; namedPlaceholders?: boolean },
    params?: any[] | Record<string, any>
  ): Promise<[R[] | MySQL2QueryResult<R>, any]> {
    let sql: string
    let values: any[] | Record<string, any> = []
    let rowsAsArray = false
    let useNamedPlaceholders = mysqlConfig.namedPlaceholders || false

    if (typeof sqlOrOptions === 'string') {
      sql = sqlOrOptions
      values = params || []
    } else {
      sql = sqlOrOptions.sql
      // Handle both formats:
      // 1. { sql, values } - standard format
      // 2. query({ sql }, params) - Drizzle format
      values = sqlOrOptions.values || params || []
      rowsAsArray = sqlOrOptions.rowsAsArray || false
      // Query-level namedPlaceholders option takes precedence over config
      if (sqlOrOptions.namedPlaceholders !== undefined) {
        useNamedPlaceholders = sqlOrOptions.namedPlaceholders
      }
    }

    // Handle named placeholders if enabled and params is an object (not an array)
    let formattedSql: string
    if (useNamedPlaceholders && !Array.isArray(values) && typeof values === 'object' && Object.keys(values).length > 0) {
      // Convert :name placeholders to ? and create ordered array
      const converted = convertNamedPlaceholders(sql, values)
      formattedSql = formatMySQLQuery(converted.sql, converted.values)
    } else {
      // Use standard positional placeholder formatting
      formattedSql = formatMySQLQuery(sql, Array.isArray(values) ? values : [])
    }

    // Execute query through core client
    const queryOptions: any = {
      sql: formattedSql,
      // No parameters needed as formatMySQLQuery inlines values
      // Use hydrateColumnNames to control object vs array format
      // When rowsAsArray is true, return arrays; otherwise return objects
      hydrateColumnNames: !rowsAsArray,
      // Always include metadata for proper type conversion (JSON parsing, etc.)
      includeResultMetadata: true
    }

    // Add transaction ID if in transaction
    if (transactionId) {
      queryOptions.transactionId = transactionId
    }

    const result = await core.query<R>(queryOptions)

    // Convert to mysql2-compatible result
    return convertToMySQL2Result(result, sql)
  }

  const connection = Object.assign(eventEmitter, {
    connect(callback?: (err: Error | null) => void): any {
      // No-op for Data API (no connection needed)
      if (callback) {
        process.nextTick(() => {
          connection.emit('connect')
          callback(null)
        })
        return
      }
      connection.emit('connect')
      return Promise.resolve()
    },

    end(callback?: (err?: Error) => void): any {
      // No-op for Data API (no connection to close)
      if (callback) {
        process.nextTick(() => {
          connection.emit('end')
          callback()
        })
        return
      }
      connection.emit('end')
      return Promise.resolve()
    },

    query<R = any>(
      sqlOrOptions: string | { sql: string; values?: any[] },
      paramsOrCallback?: any[] | Record<string, any> | ((err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void),
      callback?: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
    ): any {
      // Determine if callback style or promise style
      let params: any[] | Record<string, any> = []
      let cb: ((err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void) | undefined

      if (typeof sqlOrOptions === 'object' && 'sql' in sqlOrOptions) {
        // query({ sql, values? }, params?, callback?)
        // Drizzle calls query({ sql }, params) - params come as second arg
        if (typeof paramsOrCallback === 'function') {
          cb = paramsOrCallback as ((err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void)
        } else if (paramsOrCallback !== undefined) {
          params = paramsOrCallback
          if (callback !== undefined) {
            cb = callback
          }
        }
      } else {
        // query(sql, params?, callback?)
        if (typeof paramsOrCallback === 'function') {
          cb = paramsOrCallback as ((err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void)
        } else if (paramsOrCallback !== undefined) {
          params = paramsOrCallback
          if (callback !== undefined) {
            cb = callback
          }
        }
      }

      // Callback style
      if (cb) {
        return executeQuery<R>(sqlOrOptions, params)
          .then(([results, fields]) => {
            cb(null, results, fields)
          })
          .catch((err) => {
            const mysqlError = mapToMySQLError(err)
            connection.emit('error', mysqlError)
            cb(mysqlError, null as any, null)
          })
      }

      // Promise style
      return executeQuery<R>(sqlOrOptions, params).catch((err) => {
        const mysqlError = mapToMySQLError(err)
        connection.emit('error', mysqlError)
        throw mysqlError
      })
    },

    execute<R = any>(
      sqlOrOptions: string | { sql: string; values?: any[] },
      paramsOrCallback?: any[] | ((err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void),
      callback?: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
    ): any {
      // execute() is the same as query() for Data API (no prepared statements)
      return connection.query<R>(sqlOrOptions as any, paramsOrCallback as any, callback as any)
    },

    beginTransaction(callback?: (err: Error | null) => void): any {
      const doBegin = async () => {
        const txResult = await core.beginTransaction()
        transactionId = txResult.transactionId
      }

      if (callback) {
        doBegin()
          .then(() => callback(null))
          .catch((err) => {
            const mysqlError = mapToMySQLError(err)
            connection.emit('error', mysqlError)
            callback(mysqlError)
          })
        return
      }

      return doBegin().catch((err) => {
        const mysqlError = mapToMySQLError(err)
        connection.emit('error', mysqlError)
        throw mysqlError
      })
    },

    commit(callback?: (err?: Error) => void): any {
      const doCommit = async () => {
        if (transactionId) {
          await core.commitTransaction({ transactionId } as any)
          transactionId = undefined
        }
      }

      if (callback) {
        doCommit()
          .then(() => callback())
          .catch((err) => {
            const mysqlError = mapToMySQLError(err)
            connection.emit('error', mysqlError)
            callback(mysqlError)
          })
        return
      }

      return doCommit().catch((err) => {
        const mysqlError = mapToMySQLError(err)
        connection.emit('error', mysqlError)
        throw mysqlError
      })
    },

    rollback(callback?: (err?: Error) => void): any {
      const doRollback = async () => {
        if (transactionId) {
          await core.rollbackTransaction({ transactionId } as any)
          transactionId = undefined
        }
      }

      if (callback) {
        doRollback()
          .then(() => callback())
          .catch((err) => {
            const mysqlError = mapToMySQLError(err)
            connection.emit('error', mysqlError)
            callback(mysqlError)
          })
        return
      }

      return doRollback().catch((err) => {
        const mysqlError = mapToMySQLError(err)
        connection.emit('error', mysqlError)
        throw mysqlError
      })
    },

    ping(callback?: (err?: Error) => void): any {
      const doPing = async () => {
        await core.query('SELECT 1')
      }

      if (callback) {
        doPing()
          .then(() => callback())
          .catch((err) => {
            const mysqlError = mapToMySQLError(err)
            connection.emit('error', mysqlError)
            callback(mysqlError)
          })
        return
      }

      return doPing().catch((err) => {
        const mysqlError = mapToMySQLError(err)
        connection.emit('error', mysqlError)
        throw mysqlError
      })
    }
  })

  return connection as Connection
}

/**
 * Create a mysql2-compatible pool
 *
 * Note: This is a lightweight wrapper that provides the same interface as a mysql2 Pool,
 * but doesn't actually implement connection pooling since the Data API handles
 * connections internally.
 */
export function createMySQLPool(config: DataAPIClientConfig): Pool {
  // Note: hydrateColumnNames is controlled per-query based on rowsAsArray option
  const mysqlConfig: DataAPIClientConfig = {
    ...config,
    engine: 'mysql'
  }

  const core: DataAPIClient = init(mysqlConfig)
  const eventEmitter = new EventEmitter()

  // Helper to execute query logic
  async function executePoolQuery<R = any>(
    sqlOrOptions: string | { sql: string; values?: any[]; rowsAsArray?: boolean; namedPlaceholders?: boolean },
    params?: any[] | Record<string, any>
  ): Promise<[R[] | MySQL2QueryResult<R>, any]> {
    let sql: string
    let values: any[] | Record<string, any> = []
    let rowsAsArray = false
    let useNamedPlaceholders = mysqlConfig.namedPlaceholders || false

    if (typeof sqlOrOptions === 'string') {
      sql = sqlOrOptions
      values = params || []
    } else {
      sql = sqlOrOptions.sql
      // Handle both formats:
      // 1. { sql, values } - standard format
      // 2. query({ sql }, params) - Drizzle format
      values = sqlOrOptions.values || params || []
      rowsAsArray = sqlOrOptions.rowsAsArray || false
      // Query-level namedPlaceholders option takes precedence over config
      if (sqlOrOptions.namedPlaceholders !== undefined) {
        useNamedPlaceholders = sqlOrOptions.namedPlaceholders
      }
    }

    // Handle named placeholders if enabled and params is an object (not an array)
    let formattedSql: string
    if (useNamedPlaceholders && !Array.isArray(values) && typeof values === 'object' && Object.keys(values).length > 0) {
      // Convert :name placeholders to ? and create ordered array
      const converted = convertNamedPlaceholders(sql, values)
      formattedSql = formatMySQLQuery(converted.sql, converted.values)
    } else {
      // Use standard positional placeholder formatting
      formattedSql = formatMySQLQuery(sql, Array.isArray(values) ? values : [])
    }

    const result = await core.query<R>({
      sql: formattedSql,
      // No parameters needed as formatMySQLQuery inlines values
      // Use hydrateColumnNames to control object vs array format
      // When rowsAsArray is true, return arrays; otherwise return objects
      hydrateColumnNames: !rowsAsArray,
      // Always include metadata for proper type conversion (JSON parsing, etc.)
      includeResultMetadata: true
    })

    // Convert to mysql2-compatible result
    return convertToMySQL2Result(result, sql)
  }

  const pool = Object.assign(eventEmitter, {
    getConnection(callback?: (err: Error | null, connection: PoolConnection) => any): void | Promise<PoolConnection> {
      const getConn = (): PoolConnection => {
        // Return a connection-like object with release method
        const connection = createMySQLConnection(config) as PoolConnection
        connection.release = () => {
          // No-op for Data API
          pool.emit('release', connection)
        }
        pool.emit('acquire', connection)
        pool.emit('connection', connection)
        return connection
      }

      // Promise style (no callback)
      if (!callback) {
        return Promise.resolve(getConn())
      }

      // Callback style
      try {
        const connection = getConn()
        process.nextTick(() => callback(null, connection))
      } catch (err) {
        process.nextTick(() => callback(err as Error, null as any))
      }
    },

    end(callback?: (err?: Error) => void): any {
      // No-op for Data API
      if (callback) {
        process.nextTick(() => callback())
        return
      }
      return Promise.resolve()
    },

    query<R = any>(
      sqlOrOptions: string | { sql: string; values?: any[] },
      paramsOrCallback?: any[] | Record<string, any> | ((err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void),
      callback?: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
    ): any {
      // Determine if callback style or promise style
      let params: any[] | Record<string, any> = []
      let cb: ((err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void) | undefined

      if (typeof sqlOrOptions === 'object' && 'sql' in sqlOrOptions) {
        // query({ sql, values? }, params?, callback?)
        // Drizzle calls query({ sql }, params) - params come as second arg
        if (typeof paramsOrCallback === 'function') {
          cb = paramsOrCallback as ((err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void)
        } else if (paramsOrCallback !== undefined) {
          params = paramsOrCallback
          if (callback !== undefined) {
            cb = callback
          }
        }
      } else {
        // query(sql, params?, callback?)
        if (typeof paramsOrCallback === 'function') {
          cb = paramsOrCallback as ((err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void)
        } else if (paramsOrCallback !== undefined) {
          params = paramsOrCallback
          if (callback !== undefined) {
            cb = callback
          }
        }
      }

      // Callback style
      if (cb) {
        return executePoolQuery<R>(sqlOrOptions, params)
          .then(([results, fields]) => {
            cb(null, results, fields)
          })
          .catch((err) => {
            const mysqlError = mapToMySQLError(err)
            pool.emit('error', mysqlError)
            cb(mysqlError, null as any, null)
          })
      }

      // Promise style
      return executePoolQuery<R>(sqlOrOptions, params).catch((err) => {
        const mysqlError = mapToMySQLError(err)
        pool.emit('error', mysqlError)
        throw mysqlError
      })
    },

    execute<R = any>(
      sqlOrOptions: string | { sql: string; values?: any[] },
      paramsOrCallback?: any[] | ((err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void),
      callback?: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
    ): any {
      // execute() is the same as query() for Data API (no prepared statements)
      return pool.query<R>(sqlOrOptions as any, paramsOrCallback as any, callback as any)
    },

    // Additional methods required for mysql2 compatibility
    releaseConnection(_connection: PoolConnection): void {
      // No-op for Data API (connections are managed internally)
    },

    promise(): any {
      // Return the pool itself since it already has promise-based methods
      return pool
    },

    unprepare(_sql: string): any {
      // No-op for Data API (no prepared statements)
      return { sql: _sql }
    },

    // Pool configuration (for compatibility)
    config: mysqlConfig
  })

  return pool as Pool
}
