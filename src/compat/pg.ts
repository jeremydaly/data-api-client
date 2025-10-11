'use strict'

/**
 * PostgreSQL (node-postgres) compatibility layer
 *
 * Provides a pg-like interface for data-api-client, allowing drop-in
 * compatibility with tools like Drizzle, Kysely, and Knex that expect
 * a node-postgres client.
 */

import { EventEmitter } from 'events'
import pgEscape from 'pg-escape'
import { init } from '../client'
import type { DataAPIClientConfig, DataAPIClient, QueryResult as DataAPIQueryResult } from '../types'
import { mapToPostgresError, type PostgresError } from './errors'

// Pg-compatible types
export interface PgQueryResult<R = any> {
  rows: R[]
  rowCount: number
  command: string
  fields: Array<{ name: string; dataTypeID?: number }>
  oid?: number
}

export interface PgQueryConfig {
  name?: string
  text: string
  values?: any[]
  rowMode?: 'array' | 'object'
  types?: any
}

export interface PgCompatClient extends EventEmitter {
  connect(): Promise<void>
  connect(callback: (err: Error) => void): void
  end(): Promise<void>
  end(callback: (err?: Error) => void): void

  // Query method overloads matching pg.ClientBase
  query<T extends { submit: (connection: any) => void }>(queryStream: T): T
  query<R extends any[] = any[]>(
    queryConfig: { text: string; values?: any[]; rowMode: 'array' },
    values?: any[]
  ): Promise<{ rows: R[]; rowCount: number; command: string; fields: Array<{ name: string }> }>
  query<R = any>(queryConfig: { text: string; values?: any[] }): Promise<PgQueryResult<R>>
  query<R = any>(
    queryTextOrConfig: string | { text: string; values?: any[] },
    values?: any[]
  ): Promise<PgQueryResult<R>>
  query<R extends any[] = any[]>(
    queryConfig: { text: string; values?: any[]; rowMode: 'array' },
    callback: (err: Error, result: { rows: R[]; rowCount: number; command: string; fields: Array<{ name: string }> }) => void
  ): void
  query<R = any>(
    queryTextOrConfig: string | { text: string; values?: any[] },
    callback: (err: Error, result: PgQueryResult<R>) => void
  ): void
  query<R = any>(
    queryText: string,
    values: any[],
    callback: (err: Error, result: PgQueryResult<R>) => void
  ): void

  release(err?: Error | boolean): void

  // pg ClientBase compatibility methods (not supported by Data API, but required for type compatibility)
  copyFrom(queryText: string): any
  copyTo(queryText: string): any
  pauseDrain(): void
  resumeDrain(): void
  escapeIdentifier(str: string): string
  escapeLiteral(str: string): string
  setTypeParser(oid: number, format: string | ((text: string) => any), parseFn?: (text: string) => any): void
  getTypeParser(oid: number, format?: string): (text: string) => any

  // Event emitter methods (inherited from EventEmitter)
  on(event: 'drain', listener: () => void): this
  on(event: 'error', listener: (err: PostgresError) => void): this
  on(event: 'notice', listener: (notice: any) => void): this
  on(event: 'notification', listener: (message: any) => void): this
  on(event: 'end', listener: () => void): this
  on(event: string, listener: (...args: any[]) => void): this
}

export interface PgCompatPool extends EventEmitter {
  // Pool status properties (for pg.Pool compatibility)
  readonly totalCount: number
  readonly idleCount: number
  readonly waitingCount: number
  readonly expiredCount: number
  readonly ending: boolean
  readonly ended: boolean
  options: any // Pool options (pg.Pool compatibility)

  connect(): Promise<PgCompatClient>
  connect(callback: (err: Error | null, client?: PgCompatClient) => void): void
  end(): Promise<void>
  end(callback: (err?: Error) => void): void

  // Query method overloads matching pg.Pool
  query<T extends { submit: (connection: any) => void }>(queryStream: T): T
  query<R extends any[] = any[]>(
    queryConfig: { text: string; values?: any[]; rowMode: 'array' },
    values?: any[]
  ): Promise<{ rows: R[]; rowCount: number; command: string; fields: Array<{ name: string }> }>
  query<R = any>(queryConfig: { text: string; values?: any[] }): Promise<PgQueryResult<R>>
  query<R = any>(
    queryTextOrConfig: string | { text: string; values?: any[] },
    values?: any[]
  ): Promise<PgQueryResult<R>>
  query<R extends any[] = any[]>(
    queryConfig: { text: string; values?: any[]; rowMode: 'array' },
    callback: (err: Error, result: { rows: R[]; rowCount: number; command: string; fields: Array<{ name: string }> }) => void
  ): void
  query<R = any>(
    queryTextOrConfig: string | { text: string; values?: any[] },
    callback: (err: Error, result: PgQueryResult<R>) => void
  ): void
  query<R = any>(
    queryText: string,
    values: any[],
    callback: (err: Error, result: PgQueryResult<R>) => void
  ): void

  // Event emitter methods
  on(event: 'error', listener: (err: PostgresError) => void): this
  on(event: 'connect', listener: (client: PgCompatClient) => void): this
  on(event: 'acquire', listener: (client: PgCompatClient) => void): this
  on(event: 'remove', listener: (client: PgCompatClient) => void): this
  on(event: string, listener: (...args: any[]) => void): this
}

/**
 * Convert PostgreSQL $1, $2, ... placeholders to named parameters :p1, :p2, ...
 */
function convertPgPlaceholders(sql: string, params: any[] = []): { sql: string; params: Record<string, any> } {
  const namedParams: Record<string, any> = {}
  const convertedSql = sql.replace(/\$(\d+)/g, (match, index) => {
    const paramIndex = parseInt(index, 10) - 1
    if (paramIndex >= 0 && paramIndex < params.length) {
      const key = `p${index}`
      namedParams[key] = params[paramIndex]
      return `:${key}`
    }
    return match
  })
  return { sql: convertedSql, params: namedParams }
}

/**
 * Infer SQL command type from query
 */
function inferCommand(sql: string): string {
  const match = sql.trim().split(/\s+/)[0]?.toUpperCase()
  const knownCommands = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TRUNCATE', 'GRANT', 'REVOKE']
  return knownCommands.includes(match) ? match : 'QUERY'
}

/**
 * Convert Data API result to pg-compatible result
 */
function convertToPgResult<R = any>(
  result: DataAPIQueryResult<R>,
  sql: string,
  rowMode?: 'array' | 'object'
): PgQueryResult<R> {
  // Handle different result types
  if (result.records && Array.isArray(result.records)) {
    // SELECT query with records
    let rows = result.records as R[]
    const fields =
      rows.length > 0 && typeof rows[0] === 'object' && rows[0] !== null
        ? Object.keys(rows[0] as any).map((name) => ({ name }))
        : []

    // Convert to array format if rowMode is 'array'
    if (rowMode === 'array' && rows.length > 0 && typeof rows[0] === 'object') {
      rows = rows.map((row) => Object.values(row as any)) as R[]
    }

    return {
      rows,
      rowCount: rows.length,
      command: inferCommand(sql),
      fields,
      oid: 0
    }
  } else if (result.numberOfRecordsUpdated !== undefined) {
    // UPDATE/DELETE query
    return {
      rows: [] as R[],
      rowCount: result.numberOfRecordsUpdated,
      command: inferCommand(sql),
      fields: [],
      oid: 0
    }
  } else if (result.insertId !== undefined) {
    // INSERT query (MySQL-style insertId)
    return {
      rows: [] as R[],
      rowCount: 1,
      command: 'INSERT',
      fields: [],
      oid: 0
    }
  } else {
    // Other queries or empty results
    return {
      rows: [] as R[],
      rowCount: 0,
      command: inferCommand(sql),
      fields: [],
      oid: 0
    }
  }
}

/**
 * Create a pg-compatible client
 */
export function createPgClient(config: DataAPIClientConfig): PgCompatClient {
  // Force PostgreSQL engine
  const pgConfig: DataAPIClientConfig = {
    ...config,
    engine: 'pg',
    hydrateColumnNames: true // Always return objects for pg compatibility
  }

  const core: DataAPIClient = init(pgConfig)
  const eventEmitter = new EventEmitter()
  let transactionId: string | undefined

  // Helper to execute query logic
  async function executeQuery<R = any>(
    sqlOrConfig: string | PgQueryConfig,
    params?: any[]
  ): Promise<PgQueryResult<R>> {
    // Handle both query(sql, params) and query({ text, values }) formats
    let sql: string
    let values: any[] = []
    let rowMode: 'array' | 'object' | undefined

    if (typeof sqlOrConfig === 'string') {
      sql = sqlOrConfig
      values = params || []
    } else {
      sql = sqlOrConfig.text
      // If params are passed as second argument, they override config.values
      // This is how Drizzle calls it: query({name, text}, values)
      values = params !== undefined ? params : (sqlOrConfig.values || [])
      rowMode = sqlOrConfig.rowMode
      // IMPORTANT: We intentionally ignore sqlOrConfig.name
      // The RDS Data API interprets the 'name' field as a request for server-side
      // prepared statements, which causes "bind message" errors. Instead, we execute
      // each query directly without prepared statement caching.
      // Similarly, sqlOrConfig.types is ignored as the Data API handles type parsing.
    }

    // Check for transaction control commands
    const upperSql = sql.trim().toUpperCase()

    // BEGIN transaction
    if (upperSql === 'BEGIN' || upperSql.startsWith('BEGIN ')) {
      const txResult = await core.beginTransaction()
      transactionId = txResult.transactionId
      return {
        rows: [] as R[],
        rowCount: 0,
        command: 'BEGIN',
        fields: []
      }
    }

    // COMMIT transaction
    if (upperSql === 'COMMIT') {
      if (transactionId) {
        await core.commitTransaction({ transactionId } as any)
        transactionId = undefined
      }
      return {
        rows: [] as R[],
        rowCount: 0,
        command: 'COMMIT',
        fields: []
      }
    }

    // ROLLBACK transaction
    if (upperSql === 'ROLLBACK') {
      if (transactionId) {
        await core.rollbackTransaction({ transactionId } as any)
        transactionId = undefined
      }
      return {
        rows: [] as R[],
        rowCount: 0,
        command: 'ROLLBACK',
        fields: []
      }
    }

    // Convert $1, $2 placeholders to :p1, :p2
    const { sql: convertedSql, params: namedParams } = convertPgPlaceholders(sql, values)

    // Execute query through core client
    const queryOptions: any = {
      sql: convertedSql,
      parameters: namedParams
    }

    // Add transaction ID if in transaction
    if (transactionId) {
      queryOptions.transactionId = transactionId
    }

    const result = await core.query<R>(queryOptions)

    // Convert to pg-compatible result
    return convertToPgResult(result, sql, rowMode)
  }

  const client = Object.assign(eventEmitter, {
    connect(callback?: (err: Error) => void): any {
      // No-op for Data API (no connection needed)
      if (callback) {
        process.nextTick(() => callback(null as any))
        return
      }
      return Promise.resolve()
    },

    end(callback?: (err?: Error) => void): any {
      // No-op for Data API (no connection to close)
      if (callback) {
        process.nextTick(() => callback())
        return
      }
      return Promise.resolve()
    },

    // pg ClientBase compatibility methods (not supported by Data API)
    copyFrom(_queryText: string): any {
      throw new Error('COPY FROM is not supported by RDS Data API')
    },

    copyTo(_queryText: string): any {
      throw new Error('COPY TO is not supported by RDS Data API')
    },

    pauseDrain(): void {
      // No-op for Data API
    },

    resumeDrain(): void {
      // No-op for Data API
    },

    escapeIdentifier(str: string): string {
      // Use pg-escape for PostgreSQL identifier escaping
      return pgEscape.ident(str)
    },

    escapeLiteral(str: string): string {
      // Use pg-escape for PostgreSQL literal escaping
      return pgEscape.literal(str)
    },

    setTypeParser(_oid: number, _format: string | ((text: string) => any), _parseFn?: (text: string) => any): void {
      // Type parsing is handled by the Data API
      // This is a no-op for compatibility
    },

    getTypeParser(_oid: number, _format?: string): (text: string) => any {
      // Return identity function as Data API handles type parsing
      return (text: string) => text
    },

    release(_err?: Error | boolean): void {
      // No-op for standalone clients (only pool clients need to be released)
      // This is overridden when the client is obtained from a pool
    },

    query<R = any>(
      sqlOrConfig: string | PgQueryConfig | { submit: (connection: any) => void },
      paramsOrCallback?: any[] | ((err: Error | null, result: PgQueryResult<R>) => void),
      callback?: (err: Error | null, result: PgQueryResult<R>) => void
    ): any {
      // Handle query streams (Submittable)
      if (typeof sqlOrConfig === 'object' && 'submit' in sqlOrConfig) {
        throw new Error('Query streams are not supported by RDS Data API')
      }

      // Determine if callback style or promise style
      let params: any[] = []
      let cb: ((err: Error | null, result: PgQueryResult<R>) => void) | undefined

      if (typeof sqlOrConfig === 'object' && 'text' in sqlOrConfig) {
        // query({ text, values }, callback?) or query({ text, values }, values, callback?)
        if (typeof paramsOrCallback === 'function') {
          cb = paramsOrCallback
        } else if (Array.isArray(paramsOrCallback)) {
          // Override values from config with explicit values parameter
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
        executeQuery<R>(sqlOrConfig, params)
          .then((result) => cb(null, result))
          .catch((err) => {
            const pgError = mapToPostgresError(err)
            client.emit('error', pgError)
            cb(pgError, null as any)
          })
        return
      }

      // Promise style
      return executeQuery<R>(sqlOrConfig, params).catch((err) => {
        const pgError = mapToPostgresError(err)
        client.emit('error', pgError)
        throw pgError
      })
    }
  }) as PgCompatClient

  return client
}

/**
 * Create a pg-compatible pool
 *
 * Note: This is a lightweight wrapper that provides the same interface as a pg Pool,
 * but doesn't actually implement connection pooling since the Data API handles
 * connections internally.
 */
export function createPgPool(config: DataAPIClientConfig): PgCompatPool {
  const pgConfig: DataAPIClientConfig = {
    ...config,
    engine: 'pg',
    hydrateColumnNames: true
  }

  const core: DataAPIClient = init(pgConfig)
  const eventEmitter = new EventEmitter()

  // Helper to execute query logic
  async function executePoolQuery<R = any>(
    sqlOrConfig: string | PgQueryConfig,
    params?: any[]
  ): Promise<PgQueryResult<R>> {
    let sql: string
    let values: any[] = []
    let rowMode: 'array' | 'object' | undefined

    if (typeof sqlOrConfig === 'string') {
      sql = sqlOrConfig
      values = params || []
    } else {
      sql = sqlOrConfig.text
      // If params are passed as second argument, they override config.values
      // This is how Drizzle calls it: query({name, text}, values)
      values = params !== undefined ? params : (sqlOrConfig.values || [])
      rowMode = sqlOrConfig.rowMode
      // IMPORTANT: We intentionally ignore sqlOrConfig.name
      // The RDS Data API interprets the 'name' field as a request for server-side
      // prepared statements, which causes "bind message" errors. Instead, we execute
      // each query directly without prepared statement caching.
      // Similarly, sqlOrConfig.types is ignored as the Data API handles type parsing.
    }

    // Convert $1, $2 placeholders to :p1, :p2
    const { sql: convertedSql, params: namedParams } = convertPgPlaceholders(sql, values)

    const result = await core.query<R>({
      sql: convertedSql,
      parameters: namedParams
    })

    // Convert to pg-compatible result
    return convertToPgResult(result, sql, rowMode)
  }

  const pool = Object.assign(eventEmitter, {
    // Pool status properties (Data API doesn't have a real pool, so these are constants)
    get totalCount() {
      return 0
    },
    get idleCount() {
      return 0
    },
    get waitingCount() {
      return 0
    },
    get expiredCount() {
      return 0
    },
    get ending() {
      return false
    },
    get ended() {
      return false
    },
    // Pool options (empty object for Data API compatibility)
    options: {},

    connect(callback?: (err: Error | null, client?: PgCompatClient) => void): any {
      const getClient = () => {
        // Return a client-like object with release method
        const client = createPgClient(config)
        ;(client as any).release = () => {
          // No-op for Data API
          pool.emit('remove', client)
        }
        pool.emit('acquire', client)
        pool.emit('connect', client)
        return client
      }

      if (callback) {
        try {
          const client = getClient()
          process.nextTick(() => callback(null, client))
        } catch (err) {
          process.nextTick(() => callback(err as Error))
        }
        return
      }

      return Promise.resolve(getClient())
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
      sqlOrConfig: string | PgQueryConfig | { submit: (connection: any) => void },
      paramsOrCallback?: any[] | ((err: Error | null, result: PgQueryResult<R>) => void),
      callback?: (err: Error | null, result: PgQueryResult<R>) => void
    ): any {
      // Handle query streams (Submittable)
      if (typeof sqlOrConfig === 'object' && 'submit' in sqlOrConfig) {
        throw new Error('Query streams are not supported by RDS Data API')
      }

      // Determine if callback style or promise style
      let params: any[] = []
      let cb: ((err: Error | null, result: PgQueryResult<R>) => void) | undefined

      if (typeof sqlOrConfig === 'object' && 'text' in sqlOrConfig) {
        // query({ text, values }, callback?) or query({ text, values }, values, callback?)
        if (typeof paramsOrCallback === 'function') {
          cb = paramsOrCallback
        } else if (Array.isArray(paramsOrCallback)) {
          // Override values from config with explicit values parameter
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
        executePoolQuery<R>(sqlOrConfig, params)
          .then((result) => cb(null, result))
          .catch((err) => {
            const pgError = mapToPostgresError(err)
            pool.emit('error', pgError)
            cb(pgError, null as any)
          })
        return
      }

      // Promise style
      return executePoolQuery<R>(sqlOrConfig, params).catch((err) => {
        const pgError = mapToPostgresError(err)
        pool.emit('error', pgError)
        throw pgError
      })
    }
  }) as PgCompatPool

  return pool
}
