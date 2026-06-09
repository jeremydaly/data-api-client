'use strict'

/**
 * Knex compatibility layer
 *
 * Unlike Kysely and Drizzle, Knex does not accept an injected pool/driver — it
 * constructs its own driver internally via `Client._driver()` (which normally
 * does `require('mysql2')` / `require('pg')`) and then builds connections from
 * it. The supported Knex extension point is passing a custom `client` (a
 * `Client` subclass), so we subclass the built-in dialect and override the
 * single `_driver()` method to hand Knex a Data API-backed connection instead
 * of a real database socket. Knex still owns all SQL generation, query
 * building, and result shaping.
 *
 * Usage:
 *   import knex from 'knex'
 *   import { createKnexMySQLClient, createKnexPgClient } from 'data-api-client/compat/knex'
 *
 *   const mysql = knex({ client: createKnexMySQLClient(dataApiConfig), connection: {} })
 *   const pg = knex({ client: createKnexPgClient(dataApiConfig), connection: {} })
 *
 * Requires `knex` to be installed (an optional peer dependency).
 *
 * LIMITATION — transactions: Knex transactions issue literal
 * BEGIN/COMMIT/ROLLBACK SQL through the raw connection, which the RDS Data API
 * does not honor as real transactions (it requires a threaded transactionId).
 * Use `client.transaction()` on the native data-api-client for transactional
 * work; Knex's `db.transaction()` is not supported.
 */

import { createMySQLConnection } from './mysql2'
import { createPgClient } from './pg'
import type { DataAPIClientConfig } from '../types'

/**
 * Build a Knex `client` class wired to the Data API via the mysql2 compat layer.
 * Returns a `Client` subclass suitable for `knex({ client: <this> })`.
 */
export function createKnexMySQLClient(config: DataAPIClientConfig): unknown {
  // Lazy require so importing this module does not make `knex` a hard dependency
  // of data-api-client — only callers who actually use Knex need it installed.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const Client_MySQL2 = require('knex/lib/dialects/mysql2')

  return class DataApiKnexMySQLClient extends Client_MySQL2 {
    // Knex calls `driver.createConnection(connectionSettings)` inside
    // acquireRawConnection(). We ignore the settings and hand back a Data
    // API-backed connection.
    _driver() {
      return {
        createConnection: () => {
          const conn = createMySQLConnection(config) as unknown as Record<string, unknown>
          // The mysql2 dialect's validateConnection() reads
          // `connection.stream.destroyed`; our Data API connection is always
          // "live", so expose a stable stream stub that never reports destroyed.
          if (!conn.stream) {
            conn.stream = { destroyed: false }
          }
          return conn
        }
      }
    }
  }
}

/**
 * Build a Knex `client` class wired to the Data API via the pg compat layer.
 * Returns a `Client` subclass suitable for `knex({ client: <this> })`.
 */
export function createKnexPgClient(config: DataAPIClientConfig): unknown {
  // Lazy require so importing this module does not make `knex` a hard dependency.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const Client_PG = require('knex/lib/dialects/postgres')

  return class DataApiKnexPgClient extends Client_PG {
    // The pg dialect does `new driver.Client(connectionSettings)` inside
    // _acquireOnlyConnection(). A constructor function that returns an object
    // makes `new` yield that object, so we hand back our Data API-backed
    // pg-compatible client. Knex then calls connect()/query()/end() on it and
    // runs its `select version();` check, all of which the compat client serves.
    _driver() {
      return {
        Client: function DataApiPgClient() {
          return createPgClient(config)
        }
      }
    }
  }
}
