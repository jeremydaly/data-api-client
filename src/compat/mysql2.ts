'use strict'

/**
 * MySQL2 compatibility layer
 *
 * Provides a mysql2-like interface for data-api-client, allowing drop-in
 * compatibility with tools like Drizzle, Kysely, and Knex that expect
 * a mysql2 connection.
 */

import { EventEmitter } from 'events'
import { init } from '../client'
import type { DataAPIClientConfig, DataAPIClient, QueryResult as DataAPIQueryResult } from '../types'
import { mapToMySQLError, type MySQLError } from './errors'

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

export interface MySQL2Connection extends EventEmitter {
  connect(): Promise<void>
  connect(callback: (err: Error | null) => void): void
  end(): Promise<void>
  end(callback: (err?: Error) => void): void
  query<R = any>(sql: string, params?: any[]): Promise<[R[] | MySQL2QueryResult, any]>
  query<R = any>(
    sql: string,
    params: any[],
    callback: (err: Error | null, results: R[] | MySQL2QueryResult, fields: any) => void
  ): void
  query<R = any>(sql: string, callback: (err: Error | null, results: R[] | MySQL2QueryResult, fields: any) => void): void
  query<R = any>(options: { sql: string; values?: any[] }): Promise<[R[] | MySQL2QueryResult, any]>
  query<R = any>(
    options: { sql: string; values?: any[] },
    callback: (err: Error | null, results: R[] | MySQL2QueryResult, fields: any) => void
  ): void
  execute<R = any>(sql: string, params?: any[]): Promise<[R[] | MySQL2QueryResult, any]>
  execute<R = any>(
    sql: string,
    params: any[],
    callback: (err: Error | null, results: R[] | MySQL2QueryResult, fields: any) => void
  ): void
  execute<R = any>(
    sql: string,
    callback: (err: Error | null, results: R[] | MySQL2QueryResult, fields: any) => void
  ): void
  execute<R = any>(options: { sql: string; values?: any[] }): Promise<[R[] | MySQL2QueryResult, any]>
  execute<R = any>(
    options: { sql: string; values?: any[] },
    callback: (err: Error | null, results: R[] | MySQL2QueryResult, fields: any) => void
  ): void
  beginTransaction(): Promise<void>
  beginTransaction(callback: (err: Error | null) => void): void
  commit(): Promise<void>
  commit(callback: (err?: Error) => void): void
  rollback(): Promise<void>
  rollback(callback: (err?: Error) => void): void
  ping(): Promise<void>
  ping(callback: (err?: Error) => void): void
  release?(): void

  // Event emitter methods
  on(event: 'error', listener: (err: MySQLError) => void): this
  on(event: 'connect', listener: () => void): this
  on(event: 'end', listener: () => void): this
  on(event: string, listener: (...args: any[]) => void): this
}

export interface MySQL2Pool extends EventEmitter {
  getConnection(): Promise<MySQL2Connection>
  getConnection(callback: (err: Error | null, connection?: MySQL2Connection) => void): void
  end(): Promise<void>
  end(callback: (err?: Error) => void): void
  query<R = any>(sql: string, params?: any[]): Promise<[R[] | MySQL2QueryResult, any]>
  query<R = any>(
    sql: string,
    params: any[],
    callback: (err: Error | null, results: R[] | MySQL2QueryResult, fields: any) => void
  ): void
  query<R = any>(sql: string, callback: (err: Error | null, results: R[] | MySQL2QueryResult, fields: any) => void): void
  query<R = any>(options: { sql: string; values?: any[] }): Promise<[R[] | MySQL2QueryResult, any]>
  query<R = any>(
    options: { sql: string; values?: any[] },
    callback: (err: Error | null, results: R[] | MySQL2QueryResult, fields: any) => void
  ): void
  execute<R = any>(sql: string, params?: any[]): Promise<[R[] | MySQL2QueryResult, any]>
  execute<R = any>(
    sql: string,
    params: any[],
    callback: (err: Error | null, results: R[] | MySQL2QueryResult, fields: any) => void
  ): void
  execute<R = any>(
    sql: string,
    callback: (err: Error | null, results: R[] | MySQL2QueryResult, fields: any) => void
  ): void
  execute<R = any>(options: { sql: string; values?: any[] }): Promise<[R[] | MySQL2QueryResult, any]>
  execute<R = any>(
    options: { sql: string; values?: any[] },
    callback: (err: Error | null, results: R[] | MySQL2QueryResult, fields: any) => void
  ): void

  // Event emitter methods
  on(event: 'error', listener: (err: MySQLError) => void): this
  on(event: 'connection', listener: (connection: MySQL2Connection) => void): this
  on(event: 'acquire', listener: (connection: MySQL2Connection) => void): this
  on(event: 'release', listener: (connection: MySQL2Connection) => void): this
  on(event: string, listener: (...args: any[]) => void): this
}

/**
 * Convert MySQL ? placeholders to named parameters :param1, :param2, ...
 * Handles DEFAULT keywords by removing those columns from INSERT statements.
 */
function convertMySQLPlaceholders(sql: string, params: any[] = []): { sql: string; params: Record<string, any> } {
  const namedParams: Record<string, any> = {}
  let processedSql = sql
  let paramIndex = 0

  // Step 1: Handle INSERT statements with DEFAULT keywords
  // Match: INSERT INTO table (col1, col2, ...) VALUES ...
  const insertRegex = /insert\s+into\s+([`\w]+)\s*\(([^)]+)\)\s*values\s*(.+)/gi

  processedSql = processedSql.replace(insertRegex, (match, table, columnsPart, allValuesPart) => {
    const columns = columnsPart.split(',').map((c: string) => c.trim())

    // Extract all value sets: (val1, val2), (val3, val4), ...
    const valueSetsRegex = /\(([^)]+)\)/g
    const valueSets: string[] = []
    let valueSetMatch
    while ((valueSetMatch = valueSetsRegex.exec(allValuesPart)) !== null) {
      valueSets.push(valueSetMatch[1])
    }

    if (valueSets.length === 0) return match

    // Check first value set to see which columns have DEFAULT
    const firstValues = valueSets[0].split(',').map((v: string) => v.trim())
    const filtered = columns
      .map((col: string, i: number) => ({ col, idx: i, hasDefault: firstValues[i]?.toLowerCase() === 'default' }))
      .filter((item: { col: string; idx: number; hasDefault: boolean }) => !item.hasDefault)

    if (filtered.length === columns.length) {
      // No DEFAULTs found, return as-is
      return match
    }

    // Rebuild all value sets without DEFAULT positions
    const newValueSets = valueSets.map((valueSet: string) => {
      const values = valueSet.split(',').map((v: string) => v.trim())
      const filteredValues = filtered.map((item: { idx: number }) => values[item.idx])
      return `(${filteredValues.join(', ')})`
    })

    // Rebuild INSERT without DEFAULT columns
    const newColumns = filtered.map((item: { col: string }) => item.col).join(', ')
    return `insert into ${table} (${newColumns}) values ${newValueSets.join(', ')}`
  })

  // Step 2: Convert ? placeholders to :param1, :param2, etc.
  processedSql = processedSql.replace(/\?/g, () => {
    if (paramIndex < params.length) {
      const key = `param${paramIndex + 1}`
      namedParams[key] = params[paramIndex]
      paramIndex++
      return `:${key}`
    }
    return '?'
  })

  return { sql: processedSql, params: namedParams }
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
        fields = Object.keys(firstRow).map(name => ({ name }))
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
export function createMySQLConnection(config: DataAPIClientConfig): MySQL2Connection {
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
    sqlOrOptions: string | { sql: string; values?: any[]; rowsAsArray?: boolean },
    params?: any[]
  ): Promise<[R[] | MySQL2QueryResult<R>, any]> {
    let sql: string
    let values: any[] = []
    let rowsAsArray = false

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
    }

    // Convert ? placeholders to :param1, :param2
    const { sql: convertedSql, params: namedParams } = convertMySQLPlaceholders(sql, values)

    // Execute query through core client
    const queryOptions: any = {
      sql: convertedSql,
      parameters: namedParams,
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
      paramsOrCallback?: any[] | ((err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void),
      callback?: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
    ): any {
      // Determine if callback style or promise style
      let params: any[] = []
      let cb: ((err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void) | undefined

      if (typeof sqlOrOptions === 'object' && 'sql' in sqlOrOptions) {
        // query({ sql, values? }, params?, callback?)
        // Drizzle calls query({ sql }, params) - params come as second arg
        if (typeof paramsOrCallback === 'function') {
          cb = paramsOrCallback
        } else if (Array.isArray(paramsOrCallback)) {
          params = paramsOrCallback
          cb = callback
        }
      } else {
        // query(sql, params?, callback?)
        if (typeof paramsOrCallback === 'function') {
          cb = paramsOrCallback
        } else if (Array.isArray(paramsOrCallback)) {
          params = paramsOrCallback
          cb = callback
        }
      }

      // Callback style
      if (cb) {
        executeQuery<R>(sqlOrOptions, params)
          .then(([results, fields]) => cb(null, results, fields))
          .catch((err) => {
            const mysqlError = mapToMySQLError(err)
            connection.emit('error', mysqlError)
            cb(mysqlError, null as any, null)
          })
        return
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
      return connection.query(sqlOrOptions as any, paramsOrCallback as any, callback as any)
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
  }) as MySQL2Connection

  return connection
}

/**
 * Create a mysql2-compatible pool
 *
 * Note: This is a lightweight wrapper that provides the same interface as a mysql2 Pool,
 * but doesn't actually implement connection pooling since the Data API handles
 * connections internally.
 */
export function createMySQLPool(config: DataAPIClientConfig): MySQL2Pool {
  // Note: hydrateColumnNames is controlled per-query based on rowsAsArray option
  const mysqlConfig: DataAPIClientConfig = {
    ...config,
    engine: 'mysql'
  }

  const core: DataAPIClient = init(mysqlConfig)
  const eventEmitter = new EventEmitter()

  // Helper to execute query logic
  async function executePoolQuery<R = any>(
    sqlOrOptions: string | { sql: string; values?: any[]; rowsAsArray?: boolean },
    params?: any[]
  ): Promise<[R[] | MySQL2QueryResult<R>, any]> {
    let sql: string
    let values: any[] = []
    let rowsAsArray = false

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
    }

    // Convert ? placeholders to :param1, :param2
    const { sql: convertedSql, params: namedParams } = convertMySQLPlaceholders(sql, values)

    const result = await core.query<R>({
      sql: convertedSql,
      parameters: namedParams,
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
    getConnection(callback?: (err: Error | null, connection?: MySQL2Connection) => void): any {
      const getConn = () => {
        // Return a connection-like object with release method
        const connection = createMySQLConnection(config)
        ;(connection as any).release = () => {
          // No-op for Data API
          pool.emit('release', connection)
        }
        pool.emit('acquire', connection)
        pool.emit('connection', connection)
        return connection
      }

      if (callback) {
        try {
          const connection = getConn()
          process.nextTick(() => callback(null, connection))
        } catch (err) {
          process.nextTick(() => callback(err as Error))
        }
        return
      }

      return Promise.resolve(getConn())
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
      paramsOrCallback?: any[] | ((err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void),
      callback?: (err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void
    ): any {
      // Determine if callback style or promise style
      let params: any[] = []
      let cb: ((err: Error | null, results: R[] | MySQL2QueryResult<R>, fields: any) => void) | undefined

      if (typeof sqlOrOptions === 'object' && 'sql' in sqlOrOptions) {
        // query({ sql, values? }, params?, callback?)
        // Drizzle calls query({ sql }, params) - params come as second arg
        if (typeof paramsOrCallback === 'function') {
          cb = paramsOrCallback
        } else if (Array.isArray(paramsOrCallback)) {
          params = paramsOrCallback
          cb = callback
        }
      } else {
        // query(sql, params?, callback?)
        if (typeof paramsOrCallback === 'function') {
          cb = paramsOrCallback
        } else if (Array.isArray(paramsOrCallback)) {
          params = paramsOrCallback
          cb = callback
        }
      }

      // Callback style
      if (cb) {
        executePoolQuery<R>(sqlOrOptions, params)
          .then(([results, fields]) => cb(null, results, fields))
          .catch((err) => {
            const mysqlError = mapToMySQLError(err)
            pool.emit('error', mysqlError)
            cb(mysqlError, null as any, null)
          })
        return
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
      return pool.query(sqlOrOptions as any, paramsOrCallback as any, callback as any)
    }
  }) as MySQL2Pool

  return pool
}
