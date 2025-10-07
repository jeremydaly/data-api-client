'use strict'

/**
 * Compatibility layer exports
 *
 * Provides compatibility interfaces for popular database clients:
 * - pg (node-postgres) for PostgreSQL
 * - mysql2 for MySQL
 */

export { createPgClient, createPgPool } from './pg'
export type { PgCompatClient, PgCompatPool, PgQueryResult } from './pg'

export { createMySQLConnection, createMySQLPool } from './mysql2'
export type { MySQL2Connection, MySQL2Pool, MySQL2QueryResult } from './mysql2'

export { mapToPostgresError, mapToMySQLError } from './errors'
export type { PostgresError, MySQLError } from './errors'
