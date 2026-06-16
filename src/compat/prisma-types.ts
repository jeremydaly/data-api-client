'use strict'

/**
 * Prisma column-type mapping for the Data API compat layer.
 *
 * `ColumnType` mirrors @prisma/driver-adapter-utils' `ColumnTypeEnum` integer
 * values (stable wire constants) so this module carries NO runtime dependency
 * on Prisma packages. Keep in sync with that package if Prisma ever changes them.
 */

export const ColumnType = {
  Int32: 0,
  Int64: 1,
  Float: 2,
  Double: 3,
  Numeric: 4,
  Boolean: 5,
  Character: 6,
  Text: 7,
  Date: 8,
  Time: 9,
  DateTime: 10,
  Json: 11,
  Enum: 12,
  Bytes: 13,
  Uuid: 15,
  Int32Array: 64,
  Int64Array: 65,
  FloatArray: 66,
  DoubleArray: 67,
  NumericArray: 68,
  BooleanArray: 69,
  CharacterArray: 70,
  TextArray: 71,
  DateArray: 72,
  TimeArray: 73,
  DateTimeArray: 74,
  JsonArray: 75,
  BytesArray: 77,
  UuidArray: 78
} as const

export type Engine = 'pg' | 'mysql'

const PG_ARRAY: Record<string, number> = {
  _int2: ColumnType.Int32Array,
  _int4: ColumnType.Int32Array,
  _int8: ColumnType.Int64Array,
  _float4: ColumnType.FloatArray,
  _float8: ColumnType.DoubleArray,
  _numeric: ColumnType.NumericArray,
  _bool: ColumnType.BooleanArray,
  _text: ColumnType.TextArray,
  _varchar: ColumnType.TextArray,
  _bpchar: ColumnType.TextArray,
  _uuid: ColumnType.UuidArray,
  _json: ColumnType.JsonArray,
  _jsonb: ColumnType.JsonArray,
  _timestamp: ColumnType.DateTimeArray,
  _timestamptz: ColumnType.DateTimeArray,
  _date: ColumnType.DateArray,
  _time: ColumnType.TimeArray,
  _bytea: ColumnType.BytesArray
}

const PG_SCALAR: Record<string, number> = {
  int2: ColumnType.Int32,
  int4: ColumnType.Int32,
  serial: ColumnType.Int32,
  int8: ColumnType.Int64,
  bigserial: ColumnType.Int64,
  float4: ColumnType.Float,
  float8: ColumnType.Double,
  numeric: ColumnType.Numeric,
  money: ColumnType.Numeric,
  bool: ColumnType.Boolean,
  text: ColumnType.Text,
  varchar: ColumnType.Text,
  bpchar: ColumnType.Text,
  name: ColumnType.Text,
  citext: ColumnType.Text,
  char: ColumnType.Character,
  date: ColumnType.Date,
  time: ColumnType.Time,
  timetz: ColumnType.Time,
  timestamp: ColumnType.DateTime,
  timestamptz: ColumnType.DateTime,
  json: ColumnType.Json,
  jsonb: ColumnType.Json,
  uuid: ColumnType.Uuid,
  bytea: ColumnType.Bytes
}

function mapPg(typeName: string): number {
  const t = typeName.toLowerCase()
  if (t in PG_ARRAY) return PG_ARRAY[t]
  if (t in PG_SCALAR) return PG_SCALAR[t]
  return ColumnType.Text
}

function mapMysql(typeName: string): number {
  const raw = typeName.toUpperCase()
  // TINYINT(1) is MySQL's conventional boolean; bare TINYINT is an integer.
  if (raw.startsWith('TINYINT(1)')) return ColumnType.Boolean
  const t = raw.replace(/\(.*$/, '') // strip length/precision e.g. VARCHAR(255)
  const map: Record<string, number> = {
    TINYINT: ColumnType.Int32,
    SMALLINT: ColumnType.Int32,
    MEDIUMINT: ColumnType.Int32,
    INT: ColumnType.Int32,
    INTEGER: ColumnType.Int32,
    BIGINT: ColumnType.Int64,
    FLOAT: ColumnType.Float,
    DOUBLE: ColumnType.Double,
    DECIMAL: ColumnType.Numeric,
    NUMERIC: ColumnType.Numeric,
    BIT: ColumnType.Bytes,
    CHAR: ColumnType.Text,
    VARCHAR: ColumnType.Text,
    TINYTEXT: ColumnType.Text,
    TEXT: ColumnType.Text,
    MEDIUMTEXT: ColumnType.Text,
    LONGTEXT: ColumnType.Text,
    ENUM: ColumnType.Enum,
    DATE: ColumnType.Date,
    TIME: ColumnType.Time,
    YEAR: ColumnType.Int32,
    DATETIME: ColumnType.DateTime,
    TIMESTAMP: ColumnType.DateTime,
    JSON: ColumnType.Json,
    BINARY: ColumnType.Bytes,
    VARBINARY: ColumnType.Bytes,
    TINYBLOB: ColumnType.Bytes,
    BLOB: ColumnType.Bytes,
    MEDIUMBLOB: ColumnType.Bytes,
    LONGBLOB: ColumnType.Bytes
  }
  return t in map ? map[t] : ColumnType.Text
}

export function mapColumnType(typeName: string, engine: Engine): number {
  return engine === 'pg' ? mapPg(typeName) : mapMysql(typeName)
}
