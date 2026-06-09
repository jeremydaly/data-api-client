'use strict'

/**
 * Transaction-control SQL classifier (shared by the pg and mysql2 compat layers).
 *
 * ORMs/query builders like Knex drive transactions by issuing literal SQL
 * (`BEGIN;`, `COMMIT;`, `ROLLBACK`, `SAVEPOINT s1;`, ...) through the raw
 * connection, rather than calling driver methods. The RDS Data API instead
 * needs `beginTransaction`/`commitTransaction`/`rollbackTransaction` commands
 * with a threaded `transactionId`. The compat connection intercepts these
 * statements (see classifyTransactionControl) and maps them to the Data API
 * transaction lifecycle, threading the transactionId onto subsequent queries.
 */

export type TransactionControl =
  | { kind: 'begin' }
  | { kind: 'commit' }
  | { kind: 'rollback' }
  | { kind: 'setTransaction' } // isolation-level prefix (e.g. SET TRANSACTION ...); no-op
  | { kind: 'savepoint'; name: string } // nested transaction — unsupported by the Data API
  | { kind: 'release'; name: string } // RELEASE SAVEPOINT — unsupported
  | { kind: 'rollbackTo'; name: string } // ROLLBACK TO SAVEPOINT — unsupported

// Normalize a statement for keyword matching: drop a trailing semicolon,
// collapse internal whitespace, and uppercase.
const normalize = (sql: string): string =>
  sql
    .trim()
    .replace(/;\s*$/, '')
    .replace(/\s+/g, ' ')
    .toUpperCase()

/**
 * Classify a SQL statement as a transaction-control command, or return null if
 * it is an ordinary query that should be executed normally.
 */
export const classifyTransactionControl = (sql: string): TransactionControl | null => {
  const n = normalize(sql)

  // Begin: BEGIN, BEGIN;, BEGIN TRANSACTION [mode], START TRANSACTION [mode]
  if (n === 'BEGIN' || n.startsWith('BEGIN ') || n.startsWith('BEGIN TRANSACTION') || n.startsWith('START TRANSACTION')) {
    return { kind: 'begin' }
  }
  if (n === 'COMMIT' || n === 'COMMIT WORK') return { kind: 'commit' }
  if (n === 'ROLLBACK' || n === 'ROLLBACK WORK') return { kind: 'rollback' }

  // Savepoint family (nested transactions) — captured so the connection can
  // raise a clear "unsupported" error rather than send invalid SQL.
  const savepoint = n.match(/^SAVEPOINT (.+)$/)
  if (savepoint) return { kind: 'savepoint', name: savepoint[1] }
  const release = n.match(/^RELEASE SAVEPOINT (.+)$/)
  if (release) return { kind: 'release', name: release[1] }
  const rollbackTo = n.match(/^ROLLBACK TO SAVEPOINT (.+)$/)
  if (rollbackTo) return { kind: 'rollbackTo', name: rollbackTo[1] }

  // Isolation-level prefix emitted before BEGIN by some dialects; the Data API
  // begins with default isolation, so this is a no-op.
  if (n.startsWith('SET TRANSACTION')) return { kind: 'setTransaction' }

  return null
}

/** Error thrown when a nested-transaction (savepoint) operation is attempted. */
export const NESTED_TRANSACTION_MESSAGE =
  'Nested transactions (SAVEPOINT) are not supported over the RDS Data API. ' +
  'Use a single top-level transaction.'
