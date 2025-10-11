'use strict'

/**
 * Utility functions for SQL parsing, type detection, and date handling
 */

import type { ParameterValue, SupportedType, SqlParamInfo } from './types'

// Supported value types in the Data API
export const supportedTypes: SupportedType[] = [
  'arrayValue',
  'blobValue',
  'booleanValue',
  'doubleValue',
  'isNull',
  'longValue',
  'stringValue',
  'structValue'
]

// Simple error function
export const error = (...err: any[]): never => {
  throw Error(...err)
}

// Parse SQL statement from provided arguments
export const parseSQL = (args: any[]): string =>
  typeof args[0] === 'string'
    ? args[0]
    : typeof args[0] === 'object' && typeof args[0].sql === 'string'
    ? args[0].sql
    : error(`No 'sql' statement provided.`)

// Utility function for removing certain keys from an object
export const omit = <T extends Record<string, any>>(obj: T, values: string[]): Partial<T> =>
  Object.keys(obj).reduce((acc, x) => (values.includes(x) ? acc : Object.assign(acc, { [x]: obj[x] })), {} as Partial<T>)

// Utility function for picking certain keys from an object
export const pick = <T extends Record<string, any>, K extends keyof T>(obj: T, values: K[]): Pick<T, K> =>
  Object.keys(obj).reduce(
    (acc, x) => (values.includes(x as K) ? Object.assign(acc, { [x]: obj[x] }) : acc),
    {} as Pick<T, K>
  )

// Utility function for flattening arrays
export const flatten = <T>(arr: T[][]): T[] => arr.reduce((acc, x) => acc.concat(x), [])

// Get all the sql parameters and assign them types
export const getSqlParams = (sql: string): Record<string, SqlParamInfo> => {
  // TODO: probably need to remove comments from the sql
  // TODO: placeholders?
  // sql.match(/\:{1,2}\w+|\?+/g).map((p,i) => {

  // Match :param and ::identifier, but NOT :param::type (PostgreSQL type casting)
  // Use negative lookbehind to exclude :: that follows :word
  const matches: string[] = []
  const regex = /:{1,2}\w+/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(sql)) !== null) {
    const matchedText = match[0]
    const matchIndex = match.index

    // If this is ::something, check if it's preceded by :word (type casting)
    if (matchedText.startsWith('::')) {
      // Look back to see if there's a :word immediately before this
      const beforeMatch = sql.substring(Math.max(0, matchIndex - 20), matchIndex)
      const hasParamBefore = /:\w+$/.test(beforeMatch)

      // Skip ::type if it's part of :param::type (PostgreSQL type casting)
      if (!hasParamBefore) {
        matches.push(matchedText)
      }
    } else {
      matches.push(matchedText)
    }
  }

  return matches
    .map((p) => {
      // TODO: future support for placeholder parsing?
      // return p === '??' ? { type: 'id' } // identifier
      //   : p === '?' ? { type: 'ph', label: '__d'+i  } // placeholder
      return p.startsWith('::')
        ? { type: 'n_id' as const, label: p.substr(2) } // named id
        : { type: 'n_ph' as const, label: p.substr(1) } // named placeholder
    })
    .reduce((acc, x) => {
      return Object.assign(acc, {
        [x.label]: {
          type: x.type
        }
      })
    }, {} as Record<string, SqlParamInfo>) // end reduce
}

// Gets the value type and returns the correct value field name
// TODO: Support more types as the are released
export const getType = (val: ParameterValue): SupportedType | null | undefined =>
  typeof val === 'string'
    ? 'stringValue'
    : typeof val === 'boolean'
    ? 'booleanValue'
    : typeof val === 'number' && parseInt(val.toString()) === val
    ? 'longValue'
    : typeof val === 'number' && parseFloat(val.toString()) === val
    ? 'doubleValue'
    : val === null
    ? 'isNull'
    : isDate(val)
    ? 'stringValue'
    : Buffer.isBuffer(val)
    ? 'blobValue'
    : // : Array.isArray(val) ? 'arrayValue' This doesn't work yet
    // TODO: there is a 'structValue' now for postgres
    typeof val === 'object' &&
      val !== null &&
      Object.keys(val).length === 1 &&
      supportedTypes.includes(Object.keys(val)[0] as SupportedType)
    ? null
    : undefined

// Helper functions to detect type hint formats

// Check if value is a Date object
export const isDate = (val: any): val is Date => val instanceof Date

// Check if string matches DATE format: YYYY-MM-DD
export const isDateString = (val: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(val)

// Check if string matches TIME format: HH:MM:SS[.FFF]
export const isTimeString = (val: string): boolean =>
  /^\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(val)

// Check if string matches DECIMAL format (numeric string with decimal point)
export const isDecimalString = (val: string): boolean =>
  /^-?\d+\.\d+$/.test(val)

// Check if string matches UUID format
export const isUUIDString = (val: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)

// Check if string is valid JSON (object or array)
export const isJSONString = (val: string): boolean => {
  if (typeof val !== 'string') return false
  const trimmed = val.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false
  try {
    const parsed = JSON.parse(val)
    return typeof parsed === 'object' && parsed !== null
  } catch {
    return false
  }
}

// Hint to specify the underlying object type for data type mapping
// Auto-detects typeHint based on value format to prevent type errors
export const getTypeHint = (val: ParameterValue, engine?: string): string | undefined => {
  // Date objects → TIMESTAMP
  if (isDate(val)) {
    return 'TIMESTAMP'
  }

  // Auto-detect string formats for type hints
  if (typeof val === 'string') {
    // UUID format (most specific, check first)
    // Note: UUID typeHint is PostgreSQL-specific, skip for MySQL
    if (isUUIDString(val) && engine !== 'mysql') {
      return 'UUID'
    }

    // DATE format: YYYY-MM-DD
    if (isDateString(val)) {
      return 'DATE'
    }

    // TIME format: HH:MM:SS[.FFF]
    if (isTimeString(val)) {
      return 'TIME'
    }

    // JSON format (objects/arrays)
    // Note: JSON typeHint is PostgreSQL-specific (JSONB), skip for MySQL
    if (isJSONString(val) && engine !== 'mysql') {
      return 'JSON'
    }

    // DECIMAL format (numeric with decimal point)
    if (isDecimalString(val)) {
      return 'DECIMAL'
    }
  }

  return undefined
}

// Formats the (UTC) date to the AWS accepted YYYY-MM-DD HH:MM:SS[.FFF] format
// See https://docs.aws.amazon.com/rdsdataservice/latest/APIReference/API_SqlParameter.html
export const formatToTimeStamp = (date: Date, treatAsLocalDate: boolean): string => {
  const pad = (val: number, num: number = 2): string => '0'.repeat(num - (val + '').length) + val

  const year = treatAsLocalDate ? date.getFullYear() : date.getUTCFullYear()
  const month = (treatAsLocalDate ? date.getMonth() : date.getUTCMonth()) + 1 // Convert to human month
  const day = treatAsLocalDate ? date.getDate() : date.getUTCDate()

  const hours = treatAsLocalDate ? date.getHours() : date.getUTCHours()
  const minutes = treatAsLocalDate ? date.getMinutes() : date.getUTCMinutes()
  const seconds = treatAsLocalDate ? date.getSeconds() : date.getUTCSeconds()
  const ms = treatAsLocalDate ? date.getMilliseconds() : date.getUTCMilliseconds()

  const fraction = ms <= 0 ? '' : `.${pad(ms, 3)}`

  return `${year}-${pad(month)}-${pad(day)} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}${fraction}`
}

// Converts the string value to a Date object.
// If standard TIMESTAMP format (YYYY-MM-DD[ HH:MM:SS[.FFF]]) without TZ + treatAsLocalDate=false then assume UTC Date
// In all other cases convert value to datetime as-is (also values with TZ info)
export const formatFromTimeStamp = (value: string, treatAsLocalDate: boolean): Date =>
  !treatAsLocalDate && /^\d{4}-\d{2}-\d{2}(\s\d{2}:\d{2}:\d{2}(\.\d+)?)?$/.test(value)
    ? new Date(value + 'Z')
    : new Date(value)
