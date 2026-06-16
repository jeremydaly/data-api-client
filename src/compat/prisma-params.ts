'use strict'

/**
 * Converts Prisma's positional SQL + argTypes into data-api-client native
 * passthrough parameters, and rewrites Postgres array params into ARRAY[...]
 * constructors (the Data API cannot bind array parameters).
 */

import type { Engine } from './prisma-types'

export type Arity = 'scalar' | 'list'
export interface PrismaArgType {
  scalarType: string
  arity: Arity
  dbType?: string
}
export interface PrismaSqlQuery {
  sql: string
  args: unknown[]
  argTypes: PrismaArgType[]
}
export interface DataApiParam {
  name: string
  value: Record<string, unknown>
  typeHint?: string
  cast?: string
}
export interface BuiltQuery {
  sql: string
  parameters: DataApiParam[]
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Postgres element-type cast for empty-array constructors.
const PG_EMPTY_ARRAY_CAST: Record<string, string> = {
  int: 'bigint',
  bigint: 'bigint',
  float: 'double precision',
  decimal: 'numeric',
  boolean: 'boolean',
  uuid: 'uuid',
  datetime: 'timestamp',
  string: 'text',
  enum: 'text'
}

function buildScalarParam(name: string, value: unknown, argType: PrismaArgType): DataApiParam {
  if (value === null || value === undefined) {
    return { name, value: { isNull: true } }
  }
  switch (argType.scalarType) {
    case 'int':
      return { name, value: { longValue: Number(value) } }
    case 'bigint': {
      const n = typeof value === 'bigint' ? value : BigInt(value as string | number)
      if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER)) {
        return { name, value: { stringValue: n.toString() } }
      }
      return { name, value: { longValue: Number(n) } }
    }
    case 'float':
      return { name, value: { doubleValue: Number(value) } }
    case 'decimal':
      return { name, value: { stringValue: String(value) }, typeHint: 'DECIMAL' }
    case 'boolean':
      return { name, value: { booleanValue: Boolean(value) } }
    case 'uuid':
      return { name, value: { stringValue: String(value) }, typeHint: 'UUID' }
    case 'json':
      return {
        name,
        value: { stringValue: typeof value === 'string' ? value : JSON.stringify(value) },
        typeHint: 'JSON'
      }
    case 'datetime': {
      const d = value instanceof Date ? value : new Date(value as string)
      const iso = d.toISOString().replace('T', ' ').replace('Z', '')
      return { name, value: { stringValue: iso }, typeHint: 'TIMESTAMP' }
    }
    case 'bytes': {
      const buf = typeof value === 'string' ? Buffer.from(value, 'base64') : Buffer.from(value as Uint8Array)
      return { name, value: { blobValue: buf } }
    }
    case 'enum':
    case 'string':
    default:
      return { name, value: { stringValue: String(value) } }
  }
}

export function buildQuery(query: PrismaSqlQuery, engine: Engine): BuiltQuery {
  // First normalize placeholders to :pN. PG uses $n; MySQL uses sequential ?.
  let sql: string
  if (engine === 'pg') {
    sql = query.sql.replace(/\$(\d+)/g, (_m, n) => `:p${n}`)
  } else {
    let i = 0
    sql = query.sql.replace(/\?/g, () => `:p${++i}`)
  }

  const parameters: DataApiParam[] = []

  query.args.forEach((arg, idx) => {
    const argType = query.argTypes[idx] ?? { scalarType: 'unknown', arity: 'scalar' as const }
    const name = `p${idx + 1}`

    // Detect array values by VALUE (hasSome reports arity 'scalar' for arrays).
    // JSON values may legitimately be JS arrays, so exclude them.
    const isPgArray = engine === 'pg' && Array.isArray(arg) && argType.scalarType !== 'json'

    if (isPgArray) {
      const elements = arg as unknown[]
      const placeholder = `:p${idx + 1}`
      if (elements.length === 0) {
        const cast = PG_EMPTY_ARRAY_CAST[argType.scalarType] ?? 'text'
        sql = sql.replace(new RegExp(escapeRe(placeholder) + '\\b', 'g'), `ARRAY[]::${cast}[]`)
        return
      }
      const names = elements.map((el, k) => {
        const pname = `p${idx + 1}_${k}`
        parameters.push(buildScalarParam(pname, el, { ...argType, arity: 'scalar' }))
        return `:${pname}`
      })
      sql = sql.replace(new RegExp(escapeRe(placeholder) + '\\b', 'g'), `ARRAY[${names.join(', ')}]`)
      return
    }

    const param = buildScalarParam(name, arg, argType)
    // PostgreSQL JSONB columns require an explicit ::jsonb cast; the Data API
    // passes json values as text so without it Aurora rejects them.
    if (engine === 'pg' && argType.scalarType === 'json') {
      param.cast = 'jsonb'
    }
    parameters.push(param)
  })

  return { sql, parameters }
}
