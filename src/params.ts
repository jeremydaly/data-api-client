'use strict'

/**
 * Parameter parsing, normalization, and processing functions
 */

import sqlString from 'sqlstring'
import pgEscape from 'pg-escape'
import type {
  InternalConfig,
  Parameters,
  ParameterValue,
  NamedParameter,
  FormattedParameter,
  SqlParamInfo,
  FormatOptions,
  SupportedType
} from './types'
import { error, getType, getTypeHint, isDate, formatToTimeStamp } from './utils'

// Parse the parameters from provided arguments
export const parseParams = (args: any[]): Parameters[] =>
  Array.isArray(args[0].parameters)
    ? args[0].parameters
    : typeof args[0].parameters === 'object'
    ? [args[0].parameters]
    : Array.isArray(args[1])
    ? args[1]
    : typeof args[1] === 'object'
    ? [args[1]]
    : args[0].parameters
    ? error(`'parameters' must be an object or array`)
    : args[1]
    ? error('Parameters must be an object or array')
    : []

// Parse the supplied database, or default to config
export const parseDatabase = (config: InternalConfig, args: any[]): string | undefined =>
  config.transactionId
    ? config.database
    : typeof args[0].database === 'string'
    ? args[0].database
    : args[0].database
    ? error(`'database' must be a string.`)
    : config.database
    ? config.database
    : undefined // removed for #47 - error('No \'database\' provided.')

// Parse the supplied hydrateColumnNames command, or default to config
export const parseHydrate = (config: InternalConfig, args: any[]): boolean =>
  typeof args[0].hydrateColumnNames === 'boolean'
    ? args[0].hydrateColumnNames
    : args[0].hydrateColumnNames
    ? error(`'hydrateColumnNames' must be a boolean.`)
    : config.hydrateColumnNames

// Parse the supplied format options, or default to config
export const parseFormatOptions = (config: InternalConfig, args: any[]): Required<FormatOptions> =>
  typeof args[0].formatOptions === 'object'
    ? {
        deserializeDate:
          typeof args[0].formatOptions.deserializeDate === 'boolean'
            ? args[0].formatOptions.deserializeDate
            : args[0].formatOptions.deserializeDate
            ? error(`'formatOptions.deserializeDate' must be a boolean.`)
            : config.formatOptions.deserializeDate,
        treatAsLocalDate:
          typeof args[0].formatOptions.treatAsLocalDate == 'boolean'
            ? args[0].formatOptions.treatAsLocalDate
            : args[0].formatOptions.treatAsLocalDate
            ? error(`'formatOptions.treatAsLocalDate' must be a boolean.`)
            : config.formatOptions.treatAsLocalDate
      }
    : args[0].formatOptions
    ? error(`'formatOptions' must be an object.`)
    : config.formatOptions

// Prepare method params w/ supplied inputs if an object is passed
export const prepareParams = (
  { secretArn, resourceArn }: InternalConfig,
  args: any[]
): { secretArn: string; resourceArn: string; [key: string]: any } => {
  return Object.assign(
    { secretArn, resourceArn }, // return Arns
    typeof args[0] === 'object' ? omit(args[0], ['hydrateColumnNames', 'parameters']) : {} // merge any inputs
  )
}

// Utility function for removing certain keys from an object (duplicated from utils to avoid circular dependency)
const omit = <T extends Record<string, any>>(obj: T, values: string[]): Partial<T> =>
  Object.keys(obj).reduce((acc, x) => (values.includes(x) ? acc : Object.assign(acc, { [x]: obj[x] })), {} as Partial<T>)

// Normalize parameters so that they are all in standard format
export const normalizeParams = (params: Parameters[]): (NamedParameter | NamedParameter[])[] =>
  params.reduce(
    (acc: (NamedParameter | NamedParameter[])[], p: Parameters) =>
      Array.isArray(p)
        ? acc.concat([normalizeParams(p as unknown as Parameters[]) as unknown as NamedParameter[]])
        : (Object.keys(p).length === 2 && 'name' in p && typeof (p as any).value !== 'undefined') ||
          (Object.keys(p).length === 3 &&
            'name' in p &&
            typeof (p as any).value !== 'undefined' &&
            'cast' in p)
        ? acc.concat(p as unknown as NamedParameter)
        : acc.concat(...splitParams(p as Record<string, ParameterValue>)),
    []
  ) // end reduce

// Prepare parameters
export const processParams = (
  engine: string,
  sql: string,
  sqlParams: Record<string, SqlParamInfo>,
  params: (NamedParameter | NamedParameter[])[],
  formatOptions: Required<FormatOptions>,
  row: number = 0
): { processedParams: (FormattedParameter | FormattedParameter[])[]; escapedSql: string } => {
  return {
    processedParams: params.reduce((acc: (FormattedParameter | FormattedParameter[])[], p) => {
      if (Array.isArray(p)) {
        const result = processParams(engine, sql, sqlParams, p, formatOptions, row)
        if (row === 0) {
          sql = result.escapedSql
          row++
        }
        return acc.concat([result.processedParams as FormattedParameter[]])
      } else if (sqlParams[p.name]) {
        if (sqlParams[p.name].type === 'n_ph') {
          if (p.cast) {
            const regex = new RegExp(':' + p.name + '\\b', 'g')
            sql = sql.replace(regex, engine === 'pg' ? `:${p.name}::${p.cast}` : `CAST(:${p.name} AS ${p.cast})`)
          }
          acc.push(formatParam(p.name, p.value, formatOptions, engine))
        } else if (row === 0) {
          const regex = new RegExp('::' + p.name + '\\b', 'g')
          // Use engine-specific identifier escaping
          const escapedId = engine === 'pg'
            ? pgEscape.ident(p.value as string)  // PostgreSQL: "identifier"
            : sqlString.escapeId(p.value as string)  // MySQL: `identifier`
          sql = sql.replace(regex, escapedId)
        }
        return acc
      } else {
        return acc
      }
    }, []),
    escapedSql: sql
  }
}

// Converts parameter to the name/value format
export const formatParam = (n: string, v: ParameterValue, formatOptions: Required<FormatOptions>, engine?: string): FormattedParameter =>
  formatType(n, v, getType(v), getTypeHint(v, engine), formatOptions)

// Converts object params into name/value format
export const splitParams = (p: Record<string, ParameterValue>): NamedParameter[] =>
  Object.keys(p).reduce((arr: NamedParameter[], x) => arr.concat({ name: x, value: p[x] }), [])

// Creates a standard Data API parameter using the supplied inputs
export const formatType = (
  name: string,
  value: ParameterValue,
  type: SupportedType | null | undefined,
  typeHint: string | undefined,
  formatOptions: Required<FormatOptions>
): FormattedParameter => {
  return Object.assign(
    typeHint != null ? { name, typeHint } : { name },
    type === null
      ? { value }
      : {
          value: {
            [type ? type : error(`'${name}' is an invalid type`)]:
              type === 'isNull'
                ? true
                : isDate(value)
                ? formatToTimeStamp(value, formatOptions && formatOptions.treatAsLocalDate)
                : value
          }
        }
  ) as FormattedParameter
} // end formatType
