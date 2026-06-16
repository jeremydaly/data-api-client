import { describe, test, expect } from 'vitest'
import { buildQuery, type PrismaSqlQuery } from './prisma-params'

const scalar = (scalarType: string) => ({ scalarType, arity: 'scalar' as const })
const list = (scalarType: string) => ({ scalarType, arity: 'list' as const })

describe('buildQuery placeholder rewrite', () => {
  test('pg: $n -> :pn with typed params', () => {
    const q: PrismaSqlQuery = {
      sql: 'SELECT * FROM t WHERE id = $1 AND name = $2',
      args: [5, 'alice'],
      argTypes: [scalar('int'), scalar('string')]
    }
    const out = buildQuery(q, 'pg')
    expect(out.sql).toBe('SELECT * FROM t WHERE id = :p1 AND name = :p2')
    expect(out.parameters).toEqual([
      { name: 'p1', value: { longValue: 5 } },
      { name: 'p2', value: { stringValue: 'alice' } }
    ])
  })

  test('mysql: ? -> :pn sequentially', () => {
    const q: PrismaSqlQuery = {
      sql: 'SELECT * FROM t WHERE id = ? AND name = ?',
      args: [5, 'alice'],
      argTypes: [scalar('int'), scalar('string')]
    }
    const out = buildQuery(q, 'mysql')
    expect(out.sql).toBe('SELECT * FROM t WHERE id = :p1 AND name = :p2')
    expect(out.parameters.map((p) => p.name)).toEqual(['p1', 'p2'])
  })
})

describe('buildQuery typed params', () => {
  test('uuid/json/datetime/decimal/bytes/bool/null type hints', () => {
    const q: PrismaSqlQuery = {
      sql: 'x $1 $2 $3 $4 $5 $6 $7',
      args: ['11111111-1111-1111-1111-111111111111', { a: 1 }, new Date('2020-01-02T03:04:05.000Z'), '1.50', Buffer.from('hi'), true, null],
      argTypes: [scalar('uuid'), scalar('json'), scalar('datetime'), scalar('decimal'), scalar('bytes'), scalar('boolean'), scalar('string')]
    }
    const p = buildQuery(q, 'pg').parameters
    expect(p[0]).toMatchObject({ typeHint: 'UUID' })
    expect(p[1]).toMatchObject({ typeHint: 'JSON', value: { stringValue: '{"a":1}' } })
    expect(p[2]).toMatchObject({ typeHint: 'TIMESTAMP' })
    expect(p[3]).toMatchObject({ typeHint: 'DECIMAL', value: { stringValue: '1.50' } })
    expect(p[4].value.blobValue).toBeInstanceOf(Buffer)
    expect(p[5]).toMatchObject({ value: { booleanValue: true } })
    expect(p[6]).toMatchObject({ value: { isNull: true } })
  })
})

describe('buildQuery pg array rewrite', () => {
  test('list arg becomes ARRAY[...] with element params', () => {
    const q: PrismaSqlQuery = {
      sql: 'INSERT INTO t (tags) VALUES ($1)',
      args: [['x', 'y', 'z']],
      argTypes: [list('string')]
    }
    const out = buildQuery(q, 'pg')
    expect(out.sql).toBe('INSERT INTO t (tags) VALUES (ARRAY[:p1_0, :p1_1, :p1_2])')
    expect(out.parameters.map((p) => p.name)).toEqual(['p1_0', 'p1_1', 'p1_2'])
    expect(out.parameters.map((p) => p.value.stringValue)).toEqual(['x', 'y', 'z'])
  })

  test('array detected by VALUE even when arity reports scalar (hasSome quirk)', () => {
    const q: PrismaSqlQuery = {
      sql: 'SELECT * FROM t WHERE tags && $1',
      args: [['x', 'q']],
      argTypes: [scalar('string')]
    }
    const out = buildQuery(q, 'pg')
    expect(out.sql).toBe('SELECT * FROM t WHERE tags && ARRAY[:p1_0, :p1_1]')
  })

  test('empty array emits typed empty constructor', () => {
    const q: PrismaSqlQuery = { sql: 'x $1', args: [[]], argTypes: [list('int')] }
    const out = buildQuery(q, 'pg')
    expect(out.sql).toBe('x ARRAY[]::bigint[]')
    expect(out.parameters).toEqual([])
  })

  test('json array value is NOT treated as a pg array', () => {
    const q: PrismaSqlQuery = { sql: 'x $1', args: [[1, 2, 3]], argTypes: [scalar('json')] }
    const out = buildQuery(q, 'pg')
    expect(out.sql).toBe('x :p1')
    expect(out.parameters[0]).toMatchObject({ typeHint: 'JSON', value: { stringValue: '[1,2,3]' } })
  })
})
