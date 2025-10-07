'use strict'

/**
 * PostgreSQL (node-postgres) compatibility layer
 *
 * Provides a pg-like interface for data-api-client, allowing drop-in
 * compatibility with tools like Drizzle, Kysely, and Knex that expect
 * a node-postgres client.
 */

import { EventEmitter } from 'events'
import { init } from '../client'
import type { DataAPIClientConfig, DataAPIClient, QueryResult as DataAPIQueryResult } from '../types'
import { mapToPostgresError, type PostgresError } from './errors'

// Pg-compatible types
export interface PgQueryResult<R = any> {
  rows: R[]
  rowCount: number
  command: string
  fields: Array<{ name: string; dataTypeID?: number }>
}

export interface PgCompatClient extends EventEmitter {
  connect(): Promise<PgCompatClient>
  connect(callback: (err: Error | null, client?: PgCompatClient) => void): void
  end(): Promise<void>
  end(callback: (err?: Error) => void): void
  query<R = any>(sql: string, params?: any[]): Promise<PgQueryResult<R>>
  query<R = any>(sql: string, params: any[], callback: (err: Error | null, result: PgQueryResult<R>) => void): void
  query<R = any>(sql: string, callback: (err: Error | null, result: PgQueryResult<R>) => void): void
  query<R = any>(config: { text: string; values?: any[] }): Promise<PgQueryResult<R>>
  query<R = any>(
    config: { text: string; values?: any[] },
    callback: (err: Error | null, result: PgQueryResult<R>) => void
  ): void
  release?(): void

  // Event emitter methods (inherited from EventEmitter)
  on(event: 'error', listener: (err: PostgresError) => void): this
  on(event: 'notice', listener: (notice: any) => void): this
  on(event: 'notification', listener: (message: any) => void): this
  on(event: string, listener: (...args: any[]) => void): this
}

export interface PgCompatPool extends EventEmitter {
  connect(): Promise<PgCompatClient>
  connect(callback: (err: Error | null, client?: PgCompatClient) => void): void
  end(): Promise<void>
  end(callback: (err?: Error) => void): void
  query<R = any>(sql: string, params?: any[]): Promise<PgQueryResult<R>>
  query<R = any>(sql: string, params: any[], callback: (err: Error | null, result: PgQueryResult<R>) => void): void
  query<R = any>(sql: string, callback: (err: Error | null, result: PgQueryResult<R>) => void): void
  query<R = any>(config: { text: string; values?: any[] }): Promise<PgQueryResult<R>>
  query<R = any>(
    config: { text: string; values?: any[] },
    callback: (err: Error | null, result: PgQueryResult<R>) => void
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
function convertToPgResult<R = any>(result: DataAPIQueryResult<R>, sql: string): PgQueryResult<R> {
  // Handle different result types
  if (result.records && Array.isArray(result.records)) {
    // SELECT query with records
    const rows = result.records as R[]
    const fields = rows.length > 0
      ? Object.keys(rows[0] as any).map(name => ({ name }))
      : []

    return {
      rows,
      rowCount: rows.length,
      command: inferCommand(sql),
      fields
    }
  } else if (result.numberOfRecordsUpdated !== undefined) {
    // UPDATE/DELETE query
    return {
      rows: [] as R[],
      rowCount: result.numberOfRecordsUpdated,
      command: inferCommand(sql),
      fields: []
    }
  } else if (result.insertId !== undefined) {
    // INSERT query (MySQL-style insertId)
    return {
      rows: [] as R[],
      rowCount: 1,
      command: 'INSERT',
      fields: []
    }
  } else {
    // Other queries or empty results
    return {
      rows: [] as R[],
      rowCount: 0,
      command: inferCommand(sql),
      fields: []
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
    sqlOrConfig: string | { text: string; values?: any[] },
    params?: any[]
  ): Promise<PgQueryResult<R>> {
    // Handle both query(sql, params) and query({ text, values }) formats
    let sql: string
    let values: any[] = []

    if (typeof sqlOrConfig === 'string') {
      sql = sqlOrConfig
      values = params || []
    } else {
      sql = sqlOrConfig.text
      values = sqlOrConfig.values || []
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
    return convertToPgResult(result, sql)
  }

  const client = Object.assign(eventEmitter, {
    connect(callback?: (err: Error | null, client?: PgCompatClient) => void): any {
      // No-op for Data API (no connection needed)
      if (callback) {
        process.nextTick(() => callback(null, client))
        return
      }
      return Promise.resolve(client)
    },

    end(callback?: (err?: Error) => void): any {
      // No-op for Data API (no connection to close)
      if (callback) {
        process.nextTick(() => callback())
        return
      }
      return Promise.resolve()
    },

    query<R = any>(
      sqlOrConfig: string | { text: string; values?: any[] },
      paramsOrCallback?: any[] | ((err: Error | null, result: PgQueryResult<R>) => void),
      callback?: (err: Error | null, result: PgQueryResult<R>) => void
    ): any {
      // Determine if callback style or promise style
      let params: any[] = []
      let cb: ((err: Error | null, result: PgQueryResult<R>) => void) | undefined

      if (typeof sqlOrConfig === 'object' && 'text' in sqlOrConfig) {
        // query({ text, values }, callback?)
        if (typeof paramsOrCallback === 'function') {
          cb = paramsOrCallback
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
    sqlOrConfig: string | { text: string; values?: any[] },
    params?: any[]
  ): Promise<PgQueryResult<R>> {
    let sql: string
    let values: any[] = []

    if (typeof sqlOrConfig === 'string') {
      sql = sqlOrConfig
      values = params || []
    } else {
      sql = sqlOrConfig.text
      values = sqlOrConfig.values || []
    }

    // Convert $1, $2 placeholders to :p1, :p2
    const { sql: convertedSql, params: namedParams } = convertPgPlaceholders(sql, values)

    const result = await core.query<R>({
      sql: convertedSql,
      parameters: namedParams
    })

    // Convert to pg-compatible result
    return convertToPgResult(result, sql)
  }

  const pool = Object.assign(eventEmitter, {
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
      sqlOrConfig: string | { text: string; values?: any[] },
      paramsOrCallback?: any[] | ((err: Error | null, result: PgQueryResult<R>) => void),
      callback?: (err: Error | null, result: PgQueryResult<R>) => void
    ): any {
      // Determine if callback style or promise style
      let params: any[] = []
      let cb: ((err: Error | null, result: PgQueryResult<R>) => void) | undefined

      if (typeof sqlOrConfig === 'object' && 'text' in sqlOrConfig) {
        // query({ text, values }, callback?)
        if (typeof paramsOrCallback === 'function') {
          cb = paramsOrCallback
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
