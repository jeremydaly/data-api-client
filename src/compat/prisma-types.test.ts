import { describe, test, expect } from 'vitest'
import { ColumnType, mapColumnType } from './prisma-types'

describe('mapColumnType (postgres)', () => {
  test('maps common scalar pg type names', () => {
    expect(mapColumnType('int4', 'pg')).toBe(ColumnType.Int32)
    expect(mapColumnType('int8', 'pg')).toBe(ColumnType.Int64)
    expect(mapColumnType('float8', 'pg')).toBe(ColumnType.Double)
    expect(mapColumnType('numeric', 'pg')).toBe(ColumnType.Numeric)
    expect(mapColumnType('bool', 'pg')).toBe(ColumnType.Boolean)
    expect(mapColumnType('text', 'pg')).toBe(ColumnType.Text)
    expect(mapColumnType('varchar', 'pg')).toBe(ColumnType.Text)
    expect(mapColumnType('timestamp', 'pg')).toBe(ColumnType.DateTime)
    expect(mapColumnType('uuid', 'pg')).toBe(ColumnType.Uuid)
    expect(mapColumnType('jsonb', 'pg')).toBe(ColumnType.Json)
    expect(mapColumnType('bytea', 'pg')).toBe(ColumnType.Bytes)
  })

  test('maps pg array type names (underscore prefix)', () => {
    expect(mapColumnType('_int4', 'pg')).toBe(ColumnType.Int32Array)
    expect(mapColumnType('_text', 'pg')).toBe(ColumnType.TextArray)
    expect(mapColumnType('_numeric', 'pg')).toBe(ColumnType.NumericArray)
  })

  test('falls back to Text for unknown pg types', () => {
    expect(mapColumnType('some_custom_type', 'pg')).toBe(ColumnType.Text)
  })
})

describe('mapColumnType (mysql)', () => {
  test('maps common mysql type names (case-insensitive)', () => {
    expect(mapColumnType('INT', 'mysql')).toBe(ColumnType.Int32)
    expect(mapColumnType('BIGINT', 'mysql')).toBe(ColumnType.Int64)
    expect(mapColumnType('DOUBLE', 'mysql')).toBe(ColumnType.Double)
    expect(mapColumnType('DECIMAL', 'mysql')).toBe(ColumnType.Numeric)
    expect(mapColumnType('VARCHAR', 'mysql')).toBe(ColumnType.Text)
    expect(mapColumnType('DATETIME', 'mysql')).toBe(ColumnType.DateTime)
    expect(mapColumnType('JSON', 'mysql')).toBe(ColumnType.Json)
    expect(mapColumnType('BLOB', 'mysql')).toBe(ColumnType.Bytes)
  })

  test('maps TINYINT(1) to Boolean but TINYINT to Int32', () => {
    expect(mapColumnType('TINYINT(1)', 'mysql')).toBe(ColumnType.Boolean)
    expect(mapColumnType('TINYINT', 'mysql')).toBe(ColumnType.Int32)
  })
})
