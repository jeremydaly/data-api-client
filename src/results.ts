'use strict'

/**
 * Result formatting and record processing functions
 */

import type {
  ExecuteStatementCommandOutput,
  BatchExecuteStatementCommandOutput,
  Field
} from '@aws-sdk/client-rds-data'
import type { QueryResult, UpdateResult, FormatOptions } from './types'
import { formatFromTimeStamp } from './utils'

// Formats the results of a query response
export const formatResults = (
  result: ExecuteStatementCommandOutput | BatchExecuteStatementCommandOutput,
  hydrate: boolean,
  includeMeta: boolean,
  formatOptions: Required<FormatOptions>
): QueryResult => {
  const {
    // destructure results
    columnMetadata, // ONLY when hydrate or includeResultMetadata is true
    numberOfRecordsUpdated, // ONLY for executeStatement method
    records, // ONLY for executeStatement method
    generatedFields, // ONLY for INSERTS
    updateResults // ONLY on batchExecuteStatement
  } = result as any

  return Object.assign(
    includeMeta ? { columnMetadata } : {},
    numberOfRecordsUpdated !== undefined && !records ? { numberOfRecordsUpdated } : {},
    records
      ? {
          records: formatRecords(records, columnMetadata, hydrate, formatOptions)
        }
      : {},
    updateResults ? { updateResults: formatUpdateResults(updateResults) } : {},
    generatedFields && generatedFields.length > 0 ? { insertId: generatedFields[0].longValue } : {}
  )
}

// Processes records and either extracts Typed Values into an array, or
// object with named column labels
export const formatRecords = (
  recs: Field[][] | undefined,
  columns: { label?: string; typeName?: string }[] | undefined,
  hydrate: boolean,
  formatOptions: Required<FormatOptions>
): any[] => {
  // Create map for efficient value parsing
  const fmap: Array<{ label?: string; typeName?: string; field?: string }> =
    recs && recs[0]
      ? recs[0].map((_field, i) => {
          return Object.assign({}, columns ? { label: columns[i].label, typeName: columns[i].typeName } : {}) // add column label and typeName
        })
      : []

  // Map over all the records (rows)
  return recs
    ? recs.map((rec) => {
        // Reduce each field in the record (row)
        return rec.reduce(
          (acc: any, field, i) => {
            // If the field is null, always return null
            if (field.isNull === true) {
              return hydrate // object if hydrate, else array
                ? Object.assign(acc, { [fmap[i].label!]: null })
                : acc.concat(null)

              // If the field is mapped, return the mapped field
            } else if (fmap[i] && fmap[i].field) {
              const value = formatRecordValue((field as any)[fmap[i].field!], fmap[i].typeName, formatOptions)
              return hydrate // object if hydrate, else array
                ? Object.assign(acc, { [fmap[i].label!]: value })
                : acc.concat(value)

              // Else discover the field type
            } else {
              // Look for non-null fields
              Object.keys(field).map((type) => {
                if (type !== 'isNull' && (field as any)[type] !== null) {
                  fmap[i]['field'] = type
                }
              })

              // Return the mapped field (this should NEVER be null)
              const value = formatRecordValue((field as any)[fmap[i].field!], fmap[i].typeName, formatOptions)
              return hydrate // object if hydrate, else array
                ? Object.assign(acc, { [fmap[i].label!]: value })
                : acc.concat(value)
            }
          },
          hydrate ? {} : []
        ) // init object if hydrate, else init array
      })
    : [] // empty record set returns an array
} // end formatRecords

// Format record value based on its value, the database column's typeName and the formatting options
export const formatRecordValue = (
  value: any,
  typeName: string | undefined,
  formatOptions: Required<FormatOptions>
): any => {
  if (
    formatOptions &&
    formatOptions.deserializeDate &&
    typeName &&
    ['DATE', 'DATETIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'TIMESTAMP WITH TIME ZONE'].includes(typeName.toUpperCase())
  ) {
    return formatFromTimeStamp(
      value,
      (formatOptions && formatOptions.treatAsLocalDate) || typeName === 'TIMESTAMP WITH TIME ZONE'
    )
  } else if (typeName === 'JSON') {
    return JSON.parse(value)
  } else {
    return value
  }
}

// Format updateResults and extract insertIds
export const formatUpdateResults = (res: { generatedFields?: Field[] }[]): UpdateResult[] =>
  res.map((x) => {
    return x.generatedFields && x.generatedFields.length > 0 ? { insertId: x.generatedFields[0].longValue } : {}
  })
