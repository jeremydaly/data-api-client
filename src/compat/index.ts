'use strict'

/**
 * Compatibility layer exports
 *
 * Provides compatibility interfaces for popular database clients:
 * - pg (node-postgres) for PostgreSQL
 * - mysql2 for MySQL
 * - knex (custom client classes for MySQL and PostgreSQL)
 */

export { createPgClient, createPgPool } from './pg'
export type { PgCompatClient, PgCompatPool, PgQueryResult } from './pg'

export { createMySQLConnection, createMySQLPool } from './mysql2'
export type { Connection, Pool, PoolConnection, MySQL2QueryResult } from './mysql2'

export { createKnexMySQLClient, createKnexPgClient } from './knex'

export { mapToPostgresError, mapToMySQLError } from './errors'
export type { PostgresError, MySQLError } from './errors'
