'use strict'

/**
 * Prisma driver adapter backed by the Aurora RDS Data API.
 *
 * Thin wrapper: holds an init(config) core client and reuses its query/retry/
 * result-formatting and transaction methods. New logic lives in prisma-types.ts
 * (column types) and prisma-params.ts (parameters / array rewrite).
 */

import { init } from '../client'
import type { DataAPIClient, DataAPIClientConfig } from '../types'
import { mapColumnType, ColumnType, type Engine } from './prisma-types'
import { buildQuery, type PrismaSqlQuery } from './prisma-params'
import { mapToPrismaError } from './errors'

const PROVIDER: Record<Engine, 'postgres' | 'mysql'> = { pg: 'postgres', mysql: 'mysql' }
const ADAPTER_NAME = 'data-api-client'
const NESTED_TX_MESSAGE = 'Nested transactions (savepoints) are not supported over the RDS Data API.'

interface SqlResultSet {
  columnNames: string[]
  columnTypes: number[]
  rows: unknown[][]
  lastInsertId?: string
}

class Queryable {
  readonly provider: 'postgres' | 'mysql'
  readonly adapterName = ADAPTER_NAME

  constructor(
    protected core: DataAPIClient,
    protected engine: Engine,
    protected transactionId?: string
  ) {
    this.provider = PROVIDER[engine]
  }

  protected async run(query: PrismaSqlQuery): Promise<any> {
    const { sql, parameters } = buildQuery(query, this.engine)
    const opts: any = { sql, parameters, hydrateColumnNames: false, includeResultMetadata: true }
    if (this.transactionId) opts.transactionId = this.transactionId
    try {
      return await this.core.query(opts)
    } catch (e) {
      throw mapToPrismaError(e, this.engine)
    }
  }

  async queryRaw(query: PrismaSqlQuery): Promise<SqlResultSet> {
    const result = await this.run(query)
    const meta = result.columnMetadata ?? []
    const columnTypes: number[] = meta.map((m: any) => mapColumnType(m.typeName ?? '', this.engine))

    // Prisma's query-plan interpreter expects JSON column values to be JSON strings,
    // not already-parsed objects.  The core client (results.ts) auto-parses JSONB/JSON
    // columns via formatRecordValue; re-serialize them so Prisma can parse them itself.
    const rawRows: unknown[][] = result.records ?? []
    const rows = rawRows.map((row) =>
      row.map((cell, i) => {
        if (columnTypes[i] === ColumnType.Json && cell !== null && typeof cell !== 'string') {
          return JSON.stringify(cell)
        }
        return cell
      })
    )

    return {
      columnNames: meta.map((m: any) => m.label ?? m.name ?? ''),
      columnTypes,
      rows,
      lastInsertId: result.insertId !== undefined ? String(result.insertId) : undefined
    }
  }

  async executeRaw(query: PrismaSqlQuery): Promise<number> {
    const result = await this.run(query)
    return result.numberOfRecordsUpdated ?? 0
  }
}

class DataApiTransaction extends Queryable {
  readonly options = { usePhantomQuery: false }
  constructor(core: DataAPIClient, engine: Engine, transactionId: string) {
    super(core, engine, transactionId)
  }
  async commit(): Promise<void> {
    await this.core.commitTransaction({ transactionId: this.transactionId } as any)
  }
  async rollback(): Promise<void> {
    await this.core.rollbackTransaction({ transactionId: this.transactionId } as any)
  }
  async createSavepoint(): Promise<void> {
    throw new Error(NESTED_TX_MESSAGE)
  }
  async rollbackToSavepoint(): Promise<void> {
    throw new Error(NESTED_TX_MESSAGE)
  }
  async releaseSavepoint(): Promise<void> {
    throw new Error(NESTED_TX_MESSAGE)
  }
}

class DataApiAdapter extends Queryable {
  async executeScript(script: string): Promise<void> {
    const statements = script
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    for (const stmt of statements) {
      await this.run({ sql: stmt, args: [], argTypes: [] })
    }
  }
  async startTransaction(): Promise<DataApiTransaction> {
    const res = await this.core.beginTransaction()
    return new DataApiTransaction(this.core, this.engine, (res as any).transactionId)
  }
  getConnectionInfo() {
    // Cap so Prisma chunks large IN(...) lists under the Data API param ceiling.
    return { supportsRelationJoins: false, maxBindValues: 1000 }
  }
  async dispose(): Promise<void> {
    /* nothing to release */
  }
}

class PrismaDataApiAdapterFactory {
  readonly provider: 'postgres' | 'mysql'
  readonly adapterName = ADAPTER_NAME
  constructor(
    private config: DataAPIClientConfig,
    private engine: Engine
  ) {
    this.provider = PROVIDER[engine]
  }
  async connect(): Promise<DataApiAdapter> {
    const core = init({
      ...this.config,
      engine: this.engine,
      // Pass raw strings so Prisma parses dates itself.
      formatOptions: { ...(this.config.formatOptions || {}), deserializeDate: false }
    } as DataAPIClientConfig)
    return new DataApiAdapter(core, this.engine)
  }
}

export function createPrismaPgAdapter(config: DataAPIClientConfig): PrismaDataApiAdapterFactory {
  return new PrismaDataApiAdapterFactory(config, 'pg')
}
export function createPrismaMySQLAdapter(config: DataAPIClientConfig): PrismaDataApiAdapterFactory {
  return new PrismaDataApiAdapterFactory(config, 'mysql')
}

// Exposed for unit testing with an injected fake core.
export const __AdapterForTest = DataApiAdapter
