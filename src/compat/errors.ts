'use strict'

/**
 * Error mapping utilities for database compatibility layers
 *
 * Maps AWS RDS Data API errors to PostgreSQL and MySQL error formats
 */

/**
 * PostgreSQL error interface
 */
export interface PostgresError extends Error {
  code?: string
  severity?: string
  detail?: string
  hint?: string
  position?: string
  internalPosition?: string
  internalQuery?: string
  where?: string
  schema?: string
  table?: string
  column?: string
  dataType?: string
  constraint?: string
  file?: string
  line?: string
  routine?: string
}

/**
 * MySQL error interface
 */
export interface MySQLError extends Error {
  code?: string
  errno?: number
  sqlState?: string
  sqlMessage?: string
  sql?: string
}

/**
 * Extract constraint name from PostgreSQL error message
 */
function extractConstraintName(message: string): string | undefined {
  const match = message.match(/constraint "([^"]+)"/)
  return match ? match[1] : undefined
}

/**
 * Extract table name from error message
 */
function extractTableName(message: string): string | undefined {
  const match = message.match(/table "([^"]+)"/)
  return match ? match[1] : undefined
}

/**
 * Extract column name from error message
 */
function extractColumnName(message: string): string | undefined {
  const match = message.match(/column "([^"]+)"/)
  return match ? match[1] : undefined
}

/**
 * Map AWS RDS Data API error to PostgreSQL error format
 */
export function mapToPostgresError(error: any): PostgresError {
  const pgError = new Error(error.message) as PostgresError
  pgError.name = 'error'
  pgError.severity = 'ERROR'

  const message = error.message || ''

  // Integrity constraint violations (23xxx)
  if (message.includes('duplicate key') || message.includes('already exists')) {
    pgError.code = '23505' // unique_violation
    pgError.constraint = extractConstraintName(message)
    pgError.detail = message.match(/Detail: (.+)/)?.[1]
  } else if (message.includes('violates foreign key constraint')) {
    pgError.code = '23503' // foreign_key_violation
    pgError.constraint = extractConstraintName(message)
    pgError.table = extractTableName(message)
  } else if (message.includes('violates not-null constraint')) {
    pgError.code = '23502' // not_null_violation
    pgError.column = extractColumnName(message)
    pgError.table = extractTableName(message)
  } else if (message.includes('violates check constraint')) {
    pgError.code = '23514' // check_violation
    pgError.constraint = extractConstraintName(message)
  }

  // Syntax errors (42xxx)
  else if (message.includes('syntax error')) {
    pgError.code = '42601' // syntax_error
    pgError.position = message.match(/at or near "(.+?)"/)?.[1]
  } else if (message.includes('column') && message.includes('does not exist')) {
    pgError.code = '42703' // undefined_column
    pgError.column = extractColumnName(message)
  } else if (message.includes('relation') && message.includes('does not exist')) {
    pgError.code = '42P01' // undefined_table
    pgError.table = extractTableName(message)
  } else if (message.includes('function') && message.includes('does not exist')) {
    pgError.code = '42883' // undefined_function
  }

  // Data exceptions (22xxx)
  else if (message.includes('invalid input syntax')) {
    pgError.code = '22P02' // invalid_text_representation
  } else if (message.includes('division by zero')) {
    pgError.code = '22012' // division_by_zero
  } else if (message.includes('value too long')) {
    pgError.code = '22001' // string_data_right_truncation
  }

  // Insufficient privilege (42501)
  else if (message.includes('permission denied')) {
    pgError.code = '42501' // insufficient_privilege
  }

  // Connection exceptions (08xxx)
  else if (message.includes('connection') || message.includes('timeout')) {
    pgError.code = '08006' // connection_failure
  }

  // Default for unknown errors
  else {
    pgError.code = 'EUNKNOWN'
  }

  return pgError
}

/**
 * Map AWS RDS Data API error to MySQL error format
 */
export function mapToMySQLError(error: any): MySQLError {
  const mysqlError = new Error(error.message) as MySQLError
  mysqlError.sqlMessage = error.message || ''

  const message = error.message || ''

  // Duplicate entry (1062)
  if (message.includes('Duplicate entry') || message.includes('duplicate key')) {
    mysqlError.code = 'ER_DUP_ENTRY'
    mysqlError.errno = 1062
    mysqlError.sqlState = '23000'
  }

  // Foreign key constraint (1451, 1452)
  else if (message.includes('foreign key constraint fails')) {
    if (message.includes('Cannot delete or update a parent row')) {
      mysqlError.code = 'ER_ROW_IS_REFERENCED_2'
      mysqlError.errno = 1451
    } else {
      mysqlError.code = 'ER_NO_REFERENCED_ROW_2'
      mysqlError.errno = 1452
    }
    mysqlError.sqlState = '23000'
  }

  // Column cannot be null (1048)
  else if (message.includes('cannot be null') || message.includes('NOT NULL')) {
    mysqlError.code = 'ER_BAD_NULL_ERROR'
    mysqlError.errno = 1048
    mysqlError.sqlState = '23000'
  }

  // Table doesn't exist (1146)
  else if (message.includes("Table") && message.includes("doesn't exist")) {
    mysqlError.code = 'ER_NO_SUCH_TABLE'
    mysqlError.errno = 1146
    mysqlError.sqlState = '42S02'
  }

  // Unknown column (1054)
  else if (message.includes('Unknown column')) {
    mysqlError.code = 'ER_BAD_FIELD_ERROR'
    mysqlError.errno = 1054
    mysqlError.sqlState = '42S22'
  }

  // Syntax error (1064)
  else if (message.includes('syntax') || message.includes('SQL syntax')) {
    mysqlError.code = 'ER_PARSE_ERROR'
    mysqlError.errno = 1064
    mysqlError.sqlState = '42000'
  }

  // Data too long (1406)
  else if (message.includes('Data too long') || message.includes('too long')) {
    mysqlError.code = 'ER_DATA_TOO_LONG'
    mysqlError.errno = 1406
    mysqlError.sqlState = '22001'
  }

  // Division by zero (1365)
  else if (message.includes('Division by 0')) {
    mysqlError.code = 'ER_DIVISION_BY_ZERO'
    mysqlError.errno = 1365
    mysqlError.sqlState = '22012'
  }

  // Access denied (1045)
  else if (message.includes('Access denied')) {
    mysqlError.code = 'ER_ACCESS_DENIED_ERROR'
    mysqlError.errno = 1045
    mysqlError.sqlState = '28000'
  }

  // Deadlock (1213)
  else if (message.includes('Deadlock')) {
    mysqlError.code = 'ER_LOCK_DEADLOCK'
    mysqlError.errno = 1213
    mysqlError.sqlState = '40001'
  }

  // Lock wait timeout (1205)
  else if (message.includes('Lock wait timeout')) {
    mysqlError.code = 'ER_LOCK_WAIT_TIMEOUT'
    mysqlError.errno = 1205
    mysqlError.sqlState = 'HY000'
  }

  // Connection error (2003, 2006, 2013)
  else if (message.includes("Can't connect")) {
    mysqlError.code = 'ER_CONNECTION_ERROR'
    mysqlError.errno = 2003
    mysqlError.sqlState = 'HY000'
  } else if (message.includes('server has gone away')) {
    mysqlError.code = 'ER_SERVER_GONE_ERROR'
    mysqlError.errno = 2006
    mysqlError.sqlState = 'HY000'
  } else if (message.includes('Lost connection')) {
    mysqlError.code = 'ER_SERVER_LOST'
    mysqlError.errno = 2013
    mysqlError.sqlState = 'HY000'
  }

  // Default for unknown errors
  else {
    mysqlError.code = 'EUNKNOWN'
    mysqlError.errno = 0
    mysqlError.sqlState = 'HY000'
  }

  return mysqlError
}
