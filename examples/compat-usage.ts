/**
 * Compatibility Layer Usage Examples
 *
 * This file demonstrates how to use the pg and mysql2 compatibility layers
 * with data-api-client for drop-in compatibility with ORMs and query builders.
 */

// ============================================================================
// PostgreSQL Compatibility Examples
// ============================================================================

import { createPgClient, createPgPool } from 'data-api-client/compat/pg'

// Example 1: Basic PostgreSQL client usage
async function pgClientExample() {
  const client = createPgClient({
    secretArn: process.env.DB_SECRET_ARN!,
    resourceArn: process.env.DB_RESOURCE_ARN!,
    database: 'mydb'
  })

  await client.connect()

  // Query with $1, $2 placeholders (pg style)
  const result = await client.query('SELECT * FROM users WHERE id = $1', [123])
  console.log(result.rows[0])

  // Query with { text, values } format
  const result2 = await client.query({
    text: 'SELECT * FROM users WHERE age > $1 AND active = $2',
    values: [18, true]
  })
  console.log(result2.rows)

  await client.end()
}

// Example 2: PostgreSQL pool usage
async function pgPoolExample() {
  const pool = createPgPool({
    secretArn: process.env.DB_SECRET_ARN!,
    resourceArn: process.env.DB_RESOURCE_ARN!,
    database: 'mydb'
  })

  // Direct pool query
  const result = await pool.query('SELECT NOW() as current_time')
  console.log(result.rows[0].current_time)

  // Get connection from pool
  const client = await pool.connect()
  try {
    const res = await client.query('SELECT $1::text as message', ['Hello'])
    console.log(res.rows[0].message)
  } finally {
    client.release?.() // No-op for Data API, but included for API parity
  }

  await pool.end()
}

// Example 3: Using with Drizzle ORM (PostgreSQL)
import { drizzle } from 'drizzle-orm/node-postgres'
import { pgTable, serial, text, integer } from 'drizzle-orm/pg-core'

async function drizzlePostgresExample() {
  const client = createPgClient({
    secretArn: process.env.DB_SECRET_ARN!,
    resourceArn: process.env.DB_RESOURCE_ARN!,
    database: 'mydb'
  })

  const db = drizzle(client)

  // Define schema
  const users = pgTable('users', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    age: integer('age')
  })

  // Query using Drizzle
  const allUsers = await db.select().from(users)
  console.log(allUsers)

  // Insert using Drizzle
  await db.insert(users).values({ name: 'Alice', age: 30 })
}

// ============================================================================
// MySQL2 Compatibility Examples
// ============================================================================

import { createMySQLConnection, createMySQLPool } from 'data-api-client/compat/mysql2'

// Example 4: Basic MySQL2 connection usage
async function mysql2ConnectionExample() {
  const connection = createMySQLConnection({
    secretArn: process.env.DB_SECRET_ARN!,
    resourceArn: process.env.DB_RESOURCE_ARN!,
    database: 'mydb'
  })

  await connection.connect()

  // Query with ? placeholders (mysql2 style)
  const [rows, fields] = await connection.query(
    'SELECT * FROM users WHERE id = ?',
    [123]
  )
  console.log(rows)

  // Query with { sql, values } format
  const [rows2, fields2] = await connection.query({
    sql: 'SELECT * FROM users WHERE age > ? AND active = ?',
    values: [18, true]
  })
  console.log(rows2)

  // Execute method (same as query for Data API)
  const [rows3, fields3] = await connection.execute(
    'SELECT * FROM users WHERE name = ?',
    ['Alice']
  )
  console.log(rows3)

  await connection.end()
}

// Example 5: MySQL2 pool usage
async function mysql2PoolExample() {
  const pool = createMySQLPool({
    secretArn: process.env.DB_SECRET_ARN!,
    resourceArn: process.env.DB_RESOURCE_ARN!,
    database: 'mydb'
  })

  // Direct pool query
  const [rows, fields] = await pool.query('SELECT NOW() as current_time')
  console.log(rows)

  // Get connection from pool
  const connection = await pool.getConnection()
  try {
    const [rows, fields] = await connection.query('SELECT ? as message', ['Hello'])
    console.log(rows)
  } finally {
    connection.release?.() // No-op for Data API, but included for API parity
  }

  await pool.end()
}

// Example 6: Using with Drizzle ORM (MySQL)
import { drizzle as drizzleMysql } from 'drizzle-orm/mysql2'
import { mysqlTable, serial as mysqlSerial, varchar, int } from 'drizzle-orm/mysql-core'

async function drizzleMysqlExample() {
  const connection = createMySQLConnection({
    secretArn: process.env.DB_SECRET_ARN!,
    resourceArn: process.env.DB_RESOURCE_ARN!,
    database: 'mydb'
  })

  const db = drizzleMysql(connection as any)

  // Define schema
  const users = mysqlTable('users', {
    id: mysqlSerial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    age: int('age')
  })

  // Query using Drizzle
  const allUsers = await db.select().from(users)
  console.log(allUsers)

  // Insert using Drizzle
  await db.insert(users).values({ name: 'Bob', age: 25 })
}

// ============================================================================
// Advanced Usage Examples
// ============================================================================

// Example 7: Using with Kysely query builder (PostgreSQL)
import { Kysely, PostgresDialect } from 'kysely'

interface Database {
  users: {
    id: number
    name: string
    age: number | null
  }
}

async function kyselyExample() {
  const client = createPgClient({
    secretArn: process.env.DB_SECRET_ARN!,
    resourceArn: process.env.DB_RESOURCE_ARN!,
    database: 'mydb'
  })

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: createPgPool({
        secretArn: process.env.DB_SECRET_ARN!,
        resourceArn: process.env.DB_RESOURCE_ARN!,
        database: 'mydb'
      }) as any
    })
  })

  // Query using Kysely
  const users = await db
    .selectFrom('users')
    .select(['id', 'name', 'age'])
    .where('age', '>', 18)
    .execute()

  console.log(users)
}

// Example 8: Error handling
async function errorHandlingExample() {
  const client = createPgClient({
    secretArn: process.env.DB_SECRET_ARN!,
    resourceArn: process.env.DB_RESOURCE_ARN!,
    database: 'mydb'
  })

  try {
    await client.connect()
    const result = await client.query('SELECT * FROM nonexistent_table')
    console.log(result.rows)
  } catch (error) {
    console.error('Query error:', error)
  } finally {
    await client.end()
  }
}

// Example 9: Using format options
async function formatOptionsExample() {
  const client = createPgClient({
    secretArn: process.env.DB_SECRET_ARN!,
    resourceArn: process.env.DB_RESOURCE_ARN!,
    database: 'mydb',
    formatOptions: {
      deserializeDate: true,  // Auto-parse date strings to Date objects
      treatAsLocalDate: false // Use UTC (default)
    }
  })

  const result = await client.query('SELECT NOW() as timestamp')
  console.log(result.rows[0].timestamp instanceof Date) // true
}

// ============================================================================
// Migration Guide
// ============================================================================

/**
 * To migrate from node-postgres to data-api-client:
 *
 * 1. Replace pg import:
 *    FROM: import { Client } from 'pg'
 *    TO:   import { createPgClient } from 'data-api-client/compat/pg'
 *
 * 2. Update client creation:
 *    FROM: const client = new Client({ host, port, database, user, password })
 *    TO:   const client = createPgClient({ secretArn, resourceArn, database })
 *
 * 3. No other code changes needed! All query methods work the same.
 */

/**
 * To migrate from mysql2 to data-api-client:
 *
 * 1. Replace mysql2 import:
 *    FROM: import mysql from 'mysql2/promise'
 *    TO:   import { createMySQLConnection } from 'data-api-client/compat/mysql2'
 *
 * 2. Update connection creation:
 *    FROM: const connection = await mysql.createConnection({ host, user, password, database })
 *    TO:   const connection = createMySQLConnection({ secretArn, resourceArn, database })
 *
 * 3. No other code changes needed! All query methods work the same.
 */
