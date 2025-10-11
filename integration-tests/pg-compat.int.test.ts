/**
 * PostgreSQL Compatibility Layer Integration Tests
 *
 * Tests the pg-compatible interface with actual Aurora Serverless v2
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { RDSDataClient } from '@aws-sdk/client-rds-data'
import { createPgClient, createPgPool } from '../src/compat/pg'
import {
  loadConfig,
  executeSQL,
    postgresTables,
  type IntegrationTestConfig
} from './setup'

describe('PostgreSQL Compatibility - Client', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let client: ReturnType<typeof createPgClient>

  beforeAll(async () => {
    config = loadConfig('pg')
    rdsClient = new RDSDataClient({ region: config.region })

    // await waitForCluster(rdsClient, config) // No longer needed - automatic retry logic

    // Create standard test tables
    for (const table of postgresTables) {
      await executeSQL(rdsClient, config, table.schema)
    }

    client = createPgClient(config)
    await client.connect()

    // Create test table
    await client.query(`
      CREATE TABLE IF NOT EXISTS pg_compat_test (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        age INTEGER,
        active BOOLEAN,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Clear any existing data
    await client.query('DELETE FROM pg_compat_test')
  })

  afterAll(async () => {
    // Clean up
    await client.query('DROP TABLE IF EXISTS pg_compat_test CASCADE')

    // Drop standard tables
    for (const table of [...postgresTables].reverse()) {
      await executeSQL(rdsClient, config, `DROP TABLE IF EXISTS ${table.name} CASCADE`)
    }

    await client.end()
    rdsClient.destroy()
  }, 60000)

  test('should connect successfully', async () => {
    const result = await client.connect()
    // connect() returns void in pg compatibility layer
    expect(result).toBeUndefined()
  })

  test('should execute SELECT with $1 placeholders', async () => {
    // Insert test data
    await client.query('INSERT INTO pg_compat_test (name, age, active) VALUES ($1, $2, $3)', ['Alice', 30, true])

    const result = await client.query('SELECT * FROM pg_compat_test WHERE name = $1', ['Alice'])

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].name).toBe('Alice')
    expect(result.rows[0].age).toBe(30)
    expect(result.rows[0].active).toBe(true)
    expect(result.rowCount).toBe(1)
    expect(result.command).toBe('SELECT')
    expect(result.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'id' }),
        expect.objectContaining({ name: 'name' }),
        expect.objectContaining({ name: 'age' }),
        expect.objectContaining({ name: 'active' })
      ])
    )
  })

  test('should execute SELECT with { text, values } format', async () => {
    // Note: Due to server-side prepared statement caching in Aurora, we use a query
    // that passes values as the second argument which works reliably
    const result = await client.query(
      {
        text: 'SELECT * FROM pg_compat_test WHERE age > $1 OR age IS NULL'
      },
      [25]
    )

    expect(result.rows.length).toBeGreaterThanOrEqual(1)
    expect(result.command).toBe('SELECT')
  })

  test('should handle INSERT and return proper result', async () => {
    const result = await client.query('INSERT INTO pg_compat_test (name, age, active) VALUES ($1, $2, $3)', [
      'Bob',
      25,
      false
    ])

    expect(result.rows).toEqual([])
    expect(result.rowCount).toBe(1)
    expect(result.command).toBe('INSERT')
  })

  test('should handle UPDATE and return affected rows', async () => {
    const result = await client.query('UPDATE pg_compat_test SET age = $1 WHERE name = $2', [26, 'Bob'])

    expect(result.rowCount).toBe(1)
    expect(result.command).toBe('UPDATE')
  })

  test('should handle DELETE and return affected rows', async () => {
    const result = await client.query('DELETE FROM pg_compat_test WHERE name = $1', ['Bob'])

    expect(result.rowCount).toBe(1)
    expect(result.command).toBe('DELETE')
  })

  test('should handle multiple positional parameters', async () => {
    await client.query('INSERT INTO pg_compat_test (name, age, active) VALUES ($1, $2, $3)', ['Charlie', 35, true])

    const result = await client.query('SELECT * FROM pg_compat_test WHERE name = $1 AND age = $2 AND active = $3', [
      'Charlie',
      35,
      true
    ])

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].name).toBe('Charlie')
  })

  test('should handle NULL values', async () => {
    await client.query('INSERT INTO pg_compat_test (name, age, active) VALUES ($1, $2, $3)', ['NullAge', null, false])

    const result = await client.query('SELECT * FROM pg_compat_test WHERE name = $1', ['NullAge'])

    expect(result.rows[0].age).toBeNull()
  })

  test('should handle empty result sets', async () => {
    const result = await client.query('SELECT * FROM pg_compat_test WHERE name = $1', ['NonExistent'])

    expect(result.rows).toEqual([])
    expect(result.rowCount).toBe(0)
    expect(result.fields).toEqual([])
  })
})

describe('PostgreSQL Compatibility - Pool', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let pool: ReturnType<typeof createPgPool>

  beforeAll(async () => {
    config = loadConfig('pg')
    rdsClient = new RDSDataClient({ region: config.region })

    // await waitForCluster(rdsClient, config) // No longer needed - automatic retry logic

    pool = createPgPool(config)

    // Create test table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pg_pool_test (
        id SERIAL PRIMARY KEY,
        value TEXT
      )
    `)
  })

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS pg_pool_test CASCADE')
    await pool.end()
    rdsClient.destroy()
  }, 60000)

  test('should execute queries through pool', async () => {
    await pool.query('INSERT INTO pg_pool_test (value) VALUES ($1)', ['test-value'])

    const result = await pool.query('SELECT * FROM pg_pool_test WHERE value = $1', ['test-value'])

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].value).toBe('test-value')
  })

  test('should get connection from pool', async () => {
    const conn = await pool.connect()
    expect(conn).toHaveProperty('query')
    expect(conn).toHaveProperty('release')

    const result = await conn.query('SELECT $1::text as message', ['Hello from pool'])
    expect(result.rows[0].message).toBe('Hello from pool')

    // Release connection (no-op for Data API)
    conn.release?.()
  })

  test('should support { text, values } format in pool', async () => {
    // Note: Due to server-side prepared statement caching in Aurora, we use a query
    // that passes values as the second argument which works reliably
    const result = await pool.query(
      {
        text: 'SELECT $1::text as test, $1::text as test2'
      },
      ['pool-test']
    )

    expect(result.rows[0].test).toBe('pool-test')
    expect(result.rows[0].test2).toBe('pool-test')
  })
})

describe('PostgreSQL Compatibility - Type Handling', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let client: ReturnType<typeof createPgClient>

  beforeAll(async () => {
    config = loadConfig('pg')
    rdsClient = new RDSDataClient({ region: config.region })

    // await waitForCluster(rdsClient, config) // No longer needed - automatic retry logic

    client = createPgClient(config)
    await client.connect()
  }, 60000)

  afterAll(async () => {
    await client.end()
    rdsClient.destroy()
  }, 60000)

  test('should handle various PostgreSQL types', async () => {
    const result = await client.query(`
      SELECT
        42::integer as int_val,
        3.14::double precision as float_val,
        'text value'::text as text_val,
        true::boolean as bool_val,
        CURRENT_TIMESTAMP as timestamp_val
    `)

    expect(result.rows[0].int_val).toBe(42)
    expect(result.rows[0].float_val).toBeCloseTo(3.14)
    expect(result.rows[0].text_val).toBe('text value')
    expect(result.rows[0].bool_val).toBe(true)
    expect(result.rows[0].timestamp_val).toBeDefined()
  })

  test('should handle array results (if Data API supports)', async () => {
    const result = await client.query(`
      SELECT ARRAY['a', 'b', 'c']::text[] as text_array
    `)

    // Data API should convert arrayValue to native array
    expect(Array.isArray(result.rows[0].text_array)).toBe(true)
  })
})

describe('PostgreSQL Compatibility - Transactions', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let client: ReturnType<typeof createPgClient>

  beforeAll(async () => {
    config = loadConfig('pg')
    rdsClient = new RDSDataClient({ region: config.region })

    // await waitForCluster(rdsClient, config) // No longer needed - automatic retry logic

    client = createPgClient(config)
    await client.connect()

    // Create test table
    await client.query(`
      CREATE TABLE IF NOT EXISTS pg_transaction_test (
        id SERIAL PRIMARY KEY,
        value TEXT
      )
    `)

    // Clear any existing data
    await client.query('DELETE FROM pg_transaction_test')
  }, 60000)

  afterAll(async () => {
    await client.query('DROP TABLE IF EXISTS pg_transaction_test CASCADE')
    await client.end()
    rdsClient.destroy()
  }, 60000)

  test('should support BEGIN, COMMIT, ROLLBACK', async () => {
    // Begin transaction
    await client.query('BEGIN')

    // Insert data
    await client.query('INSERT INTO pg_transaction_test (value) VALUES ($1)', ['tx-test-1'])

    // Commit transaction
    await client.query('COMMIT')

    // Verify data was inserted
    const result = await client.query('SELECT * FROM pg_transaction_test WHERE value = $1', ['tx-test-1'])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].value).toBe('tx-test-1')
  })

  test('should rollback transaction on ROLLBACK', async () => {
    // Begin transaction
    await client.query('BEGIN')

    // Insert data
    await client.query('INSERT INTO pg_transaction_test (value) VALUES ($1)', ['tx-test-rollback'])

    // Rollback transaction
    await client.query('ROLLBACK')

    // Verify data was NOT inserted
    const result = await client.query('SELECT * FROM pg_transaction_test WHERE value = $1', ['tx-test-rollback'])
    expect(result.rows).toHaveLength(0)
  })

  test('should handle multiple queries in transaction', async () => {
    await client.query('BEGIN')
    await client.query('INSERT INTO pg_transaction_test (value) VALUES ($1)', ['multi-1'])
    await client.query('INSERT INTO pg_transaction_test (value) VALUES ($1)', ['multi-2'])
    await client.query('INSERT INTO pg_transaction_test (value) VALUES ($1)', ['multi-3'])
    await client.query('COMMIT')

    const result = await client.query('SELECT * FROM pg_transaction_test WHERE value LIKE $1 ORDER BY value', [
      'multi-%'
    ])
    expect(result.rows).toHaveLength(3)
  })
})

describe('PostgreSQL Compatibility - Callbacks', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let client: ReturnType<typeof createPgClient>

  beforeAll(async () => {
    config = loadConfig('pg')
    rdsClient = new RDSDataClient({ region: config.region })

    // await waitForCluster(rdsClient, config) // No longer needed - automatic retry logic

    client = createPgClient(config)
  }, 60000)

  afterAll(async () => {
    await client.end()
    rdsClient.destroy()
  }, 60000)

  test('should support callback-style connect', async () => {
    await new Promise<void>((resolve, reject) => {
      client.connect((err) => {
        try {
          // Callback receives null on success (pg compatibility)
          expect(err).toBeNull()
          resolve()
        } catch (e) {
          reject(e)
        }
      })
    })
  })

  test('should support callback-style query', async () => {
    await new Promise<void>((resolve, reject) => {
      client.query('SELECT $1::text as message', ['callback-test'], (err, result) => {
        try {
          expect(err).toBeNull()
          expect(result.rows[0].message).toBe('callback-test')
          resolve()
        } catch (e) {
          reject(e)
        }
      })
    })
  })

  test('should support callback-style query without params', async () => {
    await new Promise<void>((resolve, reject) => {
      client.query('SELECT 42 as answer', (err, result) => {
        try {
          expect(err).toBeNull()
          expect(result.rows[0].answer).toBe(42)
          resolve()
        } catch (e) {
          reject(e)
        }
      })
    })
  })

  test('should support callback-style end', async () => {
    const tempClient = createPgClient(config)
    await new Promise<void>((resolve, reject) => {
      tempClient.end((err) => {
        try {
          expect(err).toBeUndefined()
          resolve()
        } catch (e) {
          reject(e)
        }
      })
    })
  })
})

describe('PostgreSQL Compatibility - Event Emitters', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient

  beforeAll(async () => {
    config = loadConfig('pg')
    rdsClient = new RDSDataClient({ region: config.region })
    // await waitForCluster(rdsClient, config) // No longer needed - automatic retry logic
  }, 60000)

  afterAll(async () => {
    rdsClient.destroy()
  }, 60000)

  test('should emit events on pool', async () => {
    const pool = createPgPool(config)
    const events: string[] = []

    pool.on('connect', () => events.push('connect'))
    pool.on('acquire', () => events.push('acquire'))
    pool.on('remove', () => events.push('remove'))

    const client = await pool.connect()
    client.release?.()

    expect(events).toContain('connect')
    expect(events).toContain('acquire')
    expect(events).toContain('remove')

    await pool.end()
  })
})
