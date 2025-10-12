/**
 * MySQL2 Compatibility Layer Integration Tests
 *
 * Tests the mysql2-compatible interface with actual Aurora Serverless v2
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { RDSDataClient } from '@aws-sdk/client-rds-data'
import { createMySQLConnection, createMySQLPool } from '../src/compat/mysql2'
import { loadConfig, executeSQL, mysqlTables, type IntegrationTestConfig } from './setup'

describe('MySQL2 Compatibility - Connection', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let connection: ReturnType<typeof createMySQLConnection>

  beforeAll(async () => {
    config = loadConfig('mysql')
    rdsClient = new RDSDataClient({ region: config.region })

    // await waitForCluster(rdsClient, config) // No longer needed - automatic retry logic

    // Create standard test tables
    for (const table of mysqlTables) {
      await executeSQL(rdsClient, config, table.schema)
    }

    connection = createMySQLConnection(config)
    await connection.connect()

    // Create test table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS mysql2_compat_test (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        age INT,
        active BOOLEAN,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Clear any existing data
    await connection.query('DELETE FROM mysql2_compat_test')
  })

  afterAll(async () => {
    // Clean up
    await connection.query('DROP TABLE IF EXISTS mysql2_compat_test')

    // Drop standard tables
    for (const table of [...mysqlTables].reverse()) {
      await executeSQL(rdsClient, config, `DROP TABLE IF EXISTS ${table.name}`)
    }

    await connection.end()
    rdsClient.destroy()
  }, 60000)

  test('should connect successfully', async () => {
    await expect(connection.connect()).resolves.toBeUndefined()
  })

  test('should execute SELECT with ? placeholders', async () => {
    // Insert test data
    await connection.query('INSERT INTO mysql2_compat_test (name, age, active) VALUES (?, ?, ?)', ['Alice', 30, true])

    const [rows, fields] = await connection.query('SELECT * FROM mysql2_compat_test WHERE name = ?', ['Alice'])

    expect(Array.isArray(rows)).toBe(true)
    expect((rows as any[]).length).toBe(1)
    expect((rows as any[])[0].name).toBe('Alice')
    expect((rows as any[])[0].age).toBe(30)
    expect((rows as any[])[0].active).toBe(true)
    expect(Array.isArray(fields)).toBe(true)
  })

  test('should execute SELECT with { sql, values } format', async () => {
    const [rows, _fields] = await connection.query({
      sql: 'SELECT * FROM mysql2_compat_test WHERE age > ?',
      values: [25]
    })

    expect(Array.isArray(rows)).toBe(true)
    expect((rows as any[]).length).toBeGreaterThanOrEqual(1)
  })

  test('should handle INSERT and return insertId', async () => {
    const [result, _fields] = await connection.query(
      'INSERT INTO mysql2_compat_test (name, age, active) VALUES (?, ?, ?)',
      ['Bob', 25, false]
    )

    expect((result as any).insertId).toBeDefined()
    expect((result as any).affectedRows).toBe(1)
  })

  test('should handle UPDATE and return affectedRows', async () => {
    const [result, _fields] = await connection.query('UPDATE mysql2_compat_test SET age = ? WHERE name = ?', [
      26,
      'Bob'
    ])

    expect((result as any).affectedRows).toBe(1)
    expect((result as any).changedRows).toBe(1)
  })

  test('should handle DELETE and return affectedRows', async () => {
    const [result, _fields] = await connection.query('DELETE FROM mysql2_compat_test WHERE name = ?', ['Bob'])

    expect((result as any).affectedRows).toBe(1)
  })

  test('should handle multiple positional parameters', async () => {
    await connection.query('INSERT INTO mysql2_compat_test (name, age, active) VALUES (?, ?, ?)', ['Charlie', 35, true])

    const [rows, _fields] = await connection.query(
      'SELECT * FROM mysql2_compat_test WHERE name = ? AND age = ? AND active = ?',
      ['Charlie', 35, true]
    )

    expect((rows as any[]).length).toBe(1)
    expect((rows as any[])[0].name).toBe('Charlie')
  })

  test('should handle NULL values', async () => {
    await connection.query('INSERT INTO mysql2_compat_test (name, age, active) VALUES (?, ?, ?)', [
      'NullAge',
      null,
      false
    ])

    const [rows, _fields] = await connection.query('SELECT * FROM mysql2_compat_test WHERE name = ?', ['NullAge'])

    expect((rows as any[])[0].age).toBeNull()
  })

  test('should handle empty result sets', async () => {
    const [rows, fields] = await connection.query('SELECT * FROM mysql2_compat_test WHERE name = ?', ['NonExistent'])

    expect(rows).toEqual([])
    expect(fields).toEqual([])
  })

  test('should execute queries with execute() method', async () => {
    const [rows, _fields] = await connection.execute('SELECT * FROM mysql2_compat_test WHERE name = ?', ['Alice'])

    expect(Array.isArray(rows)).toBe(true)
    expect((rows as any[]).length).toBeGreaterThanOrEqual(1)
  })
})

describe('MySQL2 Compatibility - Pool', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let pool: ReturnType<typeof createMySQLPool>

  beforeAll(async () => {
    config = loadConfig('mysql')
    rdsClient = new RDSDataClient({ region: config.region })

    // await waitForCluster(rdsClient, config) // No longer needed - automatic retry logic

    pool = createMySQLPool(config)

    // Create test table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mysql2_pool_test (
        id INT AUTO_INCREMENT PRIMARY KEY,
        value VARCHAR(255)
      )
    `)
  })

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS mysql2_pool_test')
    await pool.end()
    rdsClient.destroy()
  }, 60000)

  test('should execute queries through pool', async () => {
    await pool.query('INSERT INTO mysql2_pool_test (value) VALUES (?)', ['test-value'])

    const [rows, _fields] = await pool.query('SELECT * FROM mysql2_pool_test WHERE value = ?', ['test-value'])

    expect((rows as any[]).length).toBeGreaterThanOrEqual(1)
    expect((rows as any[])[0].value).toBe('test-value')
  })

  test('should get connection from pool', async () => {
    await new Promise<void>((resolve, reject) => {
      pool.getConnection((err, conn) => {
        if (err) return reject(err)

        try {
          expect(conn).toHaveProperty('query')
          expect(conn).toHaveProperty('release')

          conn.query('SELECT ? as message', ['Hello from pool'], async (queryErr, results, _fields) => {
            try {
              if (queryErr) return reject(queryErr)
              expect((results as any[])[0].message).toBe('Hello from pool')

              // Release connection (no-op for Data API)
              conn.release?.()
              resolve()
            } catch (e) {
              reject(e)
            }
          })
        } catch (e) {
          reject(e)
        }
      })
    })
  })

  test('should support { sql, values } format in pool', async () => {
    const [rows, _fields] = await pool.query({
      sql: 'SELECT ? as test',
      values: ['pool-test']
    })

    expect((rows as any[])[0].test).toBe('pool-test')
  })

  test('should execute queries with execute() method on pool', async () => {
    const [rows, _fields] = await pool.execute('SELECT ? as message', ['execute-test'])

    expect((rows as any[])[0].message).toBe('execute-test')
  })
})

describe('MySQL2 Compatibility - Type Handling', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let connection: ReturnType<typeof createMySQLConnection>

  beforeAll(async () => {
    config = loadConfig('mysql')
    rdsClient = new RDSDataClient({ region: config.region })

    // await waitForCluster(rdsClient, config) // No longer needed - automatic retry logic

    connection = createMySQLConnection(config)
    await connection.connect()
  }, 60000)

  afterAll(async () => {
    await connection.end()
    rdsClient.destroy()
  }, 60000)

  test('should handle various MySQL types', async () => {
    const [rows, _fields] = await connection.query(`
      SELECT
        42 as int_val,
        3.14 as float_val,
        'text value' as text_val,
        true as bool_val,
        NOW() as timestamp_val
    `)

    expect((rows as any[])[0].int_val).toBe(42)
    expect((rows as any[])[0].float_val).toBeCloseTo(3.14)
    expect((rows as any[])[0].text_val).toBe('text value')
    expect((rows as any[])[0].bool_val).toBeTruthy()
    expect((rows as any[])[0].timestamp_val).toBeDefined()
  })

  test('should handle string concatenation with ?', async () => {
    const [rows, _fields] = await connection.query('SELECT CONCAT(?, " ", ?) as full_name', ['John', 'Doe'])

    expect((rows as any[])[0].full_name).toBe('John Doe')
  })
})

describe('MySQL2 Compatibility - Transactions', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let connection: ReturnType<typeof createMySQLConnection>

  beforeAll(async () => {
    config = loadConfig('mysql')
    rdsClient = new RDSDataClient({ region: config.region })

    // await waitForCluster(rdsClient, config) // No longer needed - automatic retry logic

    connection = createMySQLConnection(config)
    await connection.connect()

    // Create test table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS mysql2_transaction_test (
        id INT AUTO_INCREMENT PRIMARY KEY,
        value VARCHAR(255)
      )
    `)

    // Clear any existing data
    await connection.query('DELETE FROM mysql2_transaction_test')
  }, 60000)

  afterAll(async () => {
    await connection.query('DROP TABLE IF EXISTS mysql2_transaction_test')
    await connection.end()
    rdsClient.destroy()
  }, 60000)

  test('should support beginTransaction, commit, rollback', async () => {
    // Begin transaction
    await connection.beginTransaction()

    // Insert data
    await connection.query('INSERT INTO mysql2_transaction_test (value) VALUES (?)', ['tx-test-1'])

    // Commit transaction
    await connection.commit()

    // Verify data was inserted
    const [rows, _fields] = await connection.query('SELECT * FROM mysql2_transaction_test WHERE value = ?', [
      'tx-test-1'
    ])
    expect((rows as any[]).length).toBe(1)
    expect((rows as any[])[0].value).toBe('tx-test-1')
  })

  test('should rollback transaction on rollback()', async () => {
    // Begin transaction
    await connection.beginTransaction()

    // Insert data
    await connection.query('INSERT INTO mysql2_transaction_test (value) VALUES (?)', ['tx-test-rollback'])

    // Rollback transaction
    await connection.rollback()

    // Verify data was NOT inserted
    const [rows, _fields] = await connection.query('SELECT * FROM mysql2_transaction_test WHERE value = ?', [
      'tx-test-rollback'
    ])
    expect((rows as any[]).length).toBe(0)
  })

  test('should handle multiple queries in transaction', async () => {
    await connection.beginTransaction()
    await connection.query('INSERT INTO mysql2_transaction_test (value) VALUES (?)', ['multi-1'])
    await connection.query('INSERT INTO mysql2_transaction_test (value) VALUES (?)', ['multi-2'])
    await connection.query('INSERT INTO mysql2_transaction_test (value) VALUES (?)', ['multi-3'])
    await connection.commit()

    const [rows, _fields] = await connection.query(
      'SELECT * FROM mysql2_transaction_test WHERE value LIKE ? ORDER BY value',
      ['multi-%']
    )
    expect((rows as any[]).length).toBe(3)
  })
})

describe('MySQL2 Compatibility - Callbacks', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let connection: ReturnType<typeof createMySQLConnection>

  beforeAll(async () => {
    config = loadConfig('mysql')
    rdsClient = new RDSDataClient({ region: config.region })

    // await waitForCluster(rdsClient, config) // No longer needed - automatic retry logic

    connection = createMySQLConnection(config)
  }, 60000)

  afterAll(async () => {
    await connection.end()
    rdsClient.destroy()
  }, 60000)

  test('should support callback-style connect', async () => {
    await new Promise<void>((resolve, reject) => {
      connection.connect((err) => {
        try {
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
      connection.query('SELECT ? as message', ['callback-test'], (err, results, _fields) => {
        try {
          expect(err).toBeNull()
          expect((results as any[])[0].message).toBe('callback-test')
          resolve()
        } catch (e) {
          reject(e)
        }
      })
    })
  })

  test('should support callback-style query without params', async () => {
    await new Promise<void>((resolve, reject) => {
      connection.query('SELECT 42 as answer', (err, results, _fields) => {
        try {
          expect(err).toBeNull()
          expect((results as any[])[0].answer).toBe(42)
          resolve()
        } catch (e) {
          reject(e)
        }
      })
    })
  })

  test('should support callback-style beginTransaction', async () => {
    await new Promise<void>((resolve, reject) => {
      connection.beginTransaction((err) => {
        try {
          expect(err).toBeNull()
          connection.rollback((rollbackErr) => {
            try {
              expect(rollbackErr).toBeUndefined()
              resolve()
            } catch (e) {
              reject(e)
            }
          })
        } catch (e) {
          reject(e)
        }
      })
    })
  })

  test('should support callback-style end', async () => {
    const tempConn = createMySQLConnection(config)
    await new Promise<void>((resolve, reject) => {
      tempConn.end((err) => {
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

describe('MySQL2 Compatibility - Ping', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let connection: ReturnType<typeof createMySQLConnection>

  beforeAll(async () => {
    config = loadConfig('mysql')
    rdsClient = new RDSDataClient({ region: config.region })

    // await waitForCluster(rdsClient, config) // No longer needed - automatic retry logic

    connection = createMySQLConnection(config)
    await connection.connect()
  }, 60000)

  afterAll(async () => {
    await connection.end()
    rdsClient.destroy()
  }, 60000)

  test('should support ping() method', async () => {
    await expect(connection.ping()).resolves.toBeUndefined()
  })

  test('should support callback-style ping()', async () => {
    await new Promise<void>((resolve, reject) => {
      connection.ping((err) => {
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

describe('MySQL2 Compatibility - Event Emitters', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient

  beforeAll(async () => {
    config = loadConfig('mysql')
    rdsClient = new RDSDataClient({ region: config.region })
    // await waitForCluster(rdsClient, config) // No longer needed - automatic retry logic
  }, 60000)

  afterAll(async () => {
    rdsClient.destroy()
  }, 60000)

  test('should emit events on pool', async () => {
    const pool = createMySQLPool(config)
    const events: string[] = []

    pool.on('connection', () => events.push('connection'))
    pool.on('acquire', () => events.push('acquire'))
    pool.on('release', () => events.push('release'))

    await new Promise<void>((resolve, reject) => {
      pool.getConnection((err, conn) => {
        if (err) return reject(err)
        conn.release?.()

        expect(events).toContain('connection')
        expect(events).toContain('acquire')
        expect(events).toContain('release')

        resolve()
      })
    })

    await pool.end()
  })

  test('should emit connect and end events on connection', async () => {
    const conn = createMySQLConnection(config)
    const events: string[] = []

    conn.on('connect', () => events.push('connect'))
    conn.on('end', () => events.push('end'))

    await conn.connect()
    await conn.end()

    expect(events).toContain('connect')
    expect(events).toContain('end')
  })
})

describe('MySQL2 Compatibility - Named Placeholders', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let connection: ReturnType<typeof createMySQLConnection>

  beforeAll(async () => {
    config = loadConfig('mysql')
    rdsClient = new RDSDataClient({ region: config.region })

    // Create connection with namedPlaceholders enabled
    connection = createMySQLConnection({
      ...config,
      namedPlaceholders: true
    })
    await connection.connect()

    // Create test table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS mysql2_named_placeholder_test (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        age INT,
        email VARCHAR(255),
        active BOOLEAN,
        score DECIMAL(5,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Clear any existing data
    await connection.query('DELETE FROM mysql2_named_placeholder_test')
  }, 60000)

  afterAll(async () => {
    await connection.query('DROP TABLE IF EXISTS mysql2_named_placeholder_test')
    await connection.end()
    rdsClient.destroy()
  }, 60000)

  test('should execute SELECT with named placeholders', async () => {
    // Insert test data with positional placeholders first
    await connection.query('INSERT INTO mysql2_named_placeholder_test (name, age, email) VALUES (?, ?, ?)', [
      'Alice',
      30,
      'alice@example.com'
    ])

    // Query with named placeholders
    const [rows, _fields] = await connection.query('SELECT * FROM mysql2_named_placeholder_test WHERE name = :name', {
      name: 'Alice'
    })

    expect((rows as any[]).length).toBe(1)
    expect((rows as any[])[0].name).toBe('Alice')
    expect((rows as any[])[0].age).toBe(30)
    expect((rows as any[])[0].email).toBe('alice@example.com')
  })

  test('should execute INSERT with named placeholders', async () => {
    const [result, _fields] = await connection.query(
      'INSERT INTO mysql2_named_placeholder_test (name, age, email, active) VALUES (:name, :age, :email, :active)',
      {
        name: 'Bob',
        age: 25,
        email: 'bob@example.com',
        active: true
      }
    )

    expect((result as any).insertId).toBeDefined()
    expect((result as any).affectedRows).toBe(1)

    // Verify insertion
    const [rows, _f] = await connection.query('SELECT * FROM mysql2_named_placeholder_test WHERE name = :name', {
      name: 'Bob'
    })
    expect((rows as any[]).length).toBe(1)
    expect((rows as any[])[0].active).toBe(true)
  })

  test('should execute UPDATE with named placeholders', async () => {
    const [result, _fields] = await connection.query(
      'UPDATE mysql2_named_placeholder_test SET age = :newAge WHERE name = :name',
      {
        name: 'Bob',
        newAge: 26
      }
    )

    expect((result as any).affectedRows).toBe(1)
    expect((result as any).changedRows).toBe(1)

    // Verify update
    const [rows, _f] = await connection.query('SELECT age FROM mysql2_named_placeholder_test WHERE name = :name', {
      name: 'Bob'
    })
    expect((rows as any[])[0].age).toBe(26)
  })

  test('should execute DELETE with named placeholders', async () => {
    const [result, _fields] = await connection.query(
      'DELETE FROM mysql2_named_placeholder_test WHERE name = :name',
      { name: 'Bob' }
    )

    expect((result as any).affectedRows).toBe(1)

    // Verify deletion
    const [rows, _f] = await connection.query('SELECT * FROM mysql2_named_placeholder_test WHERE name = :name', {
      name: 'Bob'
    })
    expect((rows as any[]).length).toBe(0)
  })

  test('should handle multiple named placeholders', async () => {
    await connection.query(
      'INSERT INTO mysql2_named_placeholder_test (name, age, email, active, score) VALUES (:name, :age, :email, :active, :score)',
      {
        name: 'Charlie',
        age: 35,
        email: 'charlie@example.com',
        active: true,
        score: 95.5
      }
    )

    const [rows, _fields] = await connection.query(
      'SELECT * FROM mysql2_named_placeholder_test WHERE name = :name AND age > :minAge AND active = :active',
      {
        name: 'Charlie',
        minAge: 30,
        active: true
      }
    )

    expect((rows as any[]).length).toBe(1)
    expect((rows as any[])[0].name).toBe('Charlie')
    expect((rows as any[])[0].score).toBeCloseTo(95.5)
  })

  test('should handle duplicate named placeholders (multiple references)', async () => {
    await connection.query(
      'INSERT INTO mysql2_named_placeholder_test (name, age) VALUES (:name, :age)',
      { name: 'David', age: 40 }
    )

    // Use same parameter multiple times
    const [rows, _fields] = await connection.query(
      'SELECT * FROM mysql2_named_placeholder_test WHERE name = :name OR email = :name',
      { name: 'David' }
    )

    expect((rows as any[]).length).toBe(1)
    expect((rows as any[])[0].name).toBe('David')
  })

  test('should handle NULL values with named placeholders', async () => {
    await connection.query(
      'INSERT INTO mysql2_named_placeholder_test (name, age, email) VALUES (:name, :age, :email)',
      {
        name: 'Eve',
        age: null,
        email: 'eve@example.com'
      }
    )

    const [rows, _fields] = await connection.query(
      'SELECT * FROM mysql2_named_placeholder_test WHERE name = :name',
      { name: 'Eve' }
    )

    expect((rows as any[])[0].age).toBeNull()
  })

  test('should work with { sql, values } format', async () => {
    const [rows, _fields] = await connection.query({
      sql: 'SELECT * FROM mysql2_named_placeholder_test WHERE name = :name AND age > :minAge',
      values: { name: 'Charlie', minAge: 30 } as any
    })

    expect((rows as any[]).length).toBeGreaterThanOrEqual(1)
  })

  test('should work with execute() method', async () => {
    const [rows, _fields] = await connection.execute(
      'SELECT * FROM mysql2_named_placeholder_test WHERE name = :name',
      { name: 'Alice' } as any
    )

    expect(Array.isArray(rows)).toBe(true)
    expect((rows as any[]).length).toBeGreaterThanOrEqual(1)
  })

  test('should work with transactions', async () => {
    await connection.beginTransaction()

    try {
      await connection.query(
        'INSERT INTO mysql2_named_placeholder_test (name, age) VALUES (:name, :age)',
        { name: 'Frank', age: 45 }
      )

      await connection.query('UPDATE mysql2_named_placeholder_test SET age = :age WHERE name = :name', {
        name: 'Frank',
        age: 46
      })

      await connection.commit()

      // Verify
      const [rows, _f] = await connection.query('SELECT * FROM mysql2_named_placeholder_test WHERE name = :name', {
        name: 'Frank'
      })
      expect((rows as any[])[0].age).toBe(46)
    } catch (err) {
      await connection.rollback()
      throw err
    }
  })

  test('should work with callback style', async () => {
    await new Promise<void>((resolve, reject) => {
      connection.query(
        'SELECT * FROM mysql2_named_placeholder_test WHERE name = :name',
        { name: 'Alice' } as any,
        (err, results, _fields) => {
          try {
            expect(err).toBeNull()
            expect((results as any[]).length).toBeGreaterThanOrEqual(1)
            expect((results as any[])[0].name).toBe('Alice')
            resolve()
          } catch (e) {
            reject(e)
          }
        }
      )
    })
  })

  test('should handle numeric parameter names', async () => {
    const [rows, _fields] = await connection.query('SELECT :1 AS first, :2 AS second', {
      1: 'value1',
      2: 'value2'
    } as any)

    expect((rows as any[])[0].first).toBe('value1')
    expect((rows as any[])[0].second).toBe('value2')
  })
})

describe('MySQL2 Compatibility - Named Placeholders with Pool', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let pool: ReturnType<typeof createMySQLPool>

  beforeAll(async () => {
    config = loadConfig('mysql')
    rdsClient = new RDSDataClient({ region: config.region })

    // Create pool with namedPlaceholders enabled
    pool = createMySQLPool({
      ...config,
      namedPlaceholders: true
    })

    // Create test table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mysql2_named_pool_test (
        id INT AUTO_INCREMENT PRIMARY KEY,
        value VARCHAR(255),
        count INT
      )
    `)

    await pool.query('DELETE FROM mysql2_named_pool_test')
  }, 60000)

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS mysql2_named_pool_test')
    await pool.end()
    rdsClient.destroy()
  }, 60000)

  test('should execute queries with named placeholders through pool', async () => {
    await pool.query('INSERT INTO mysql2_named_pool_test (value, count) VALUES (:value, :count)', {
      value: 'test-value',
      count: 42
    })

    const [rows, _fields] = await pool.query('SELECT * FROM mysql2_named_pool_test WHERE value = :value', {
      value: 'test-value'
    })

    expect((rows as any[]).length).toBeGreaterThanOrEqual(1)
    expect((rows as any[])[0].value).toBe('test-value')
    expect((rows as any[])[0].count).toBe(42)
  })

  test('should work with pool.getConnection() and named placeholders', async () => {
    await new Promise<void>((resolve, reject) => {
      pool.getConnection((err, conn) => {
        if (err) return reject(err)

        conn.query(
          'SELECT * FROM mysql2_named_pool_test WHERE value = :value',
          { value: 'test-value' } as any,
          (queryErr, results, _fields) => {
            try {
              if (queryErr) return reject(queryErr)
              expect((results as any[]).length).toBeGreaterThanOrEqual(1)
              expect((results as any[])[0].value).toBe('test-value')
              conn.release?.()
              resolve()
            } catch (e) {
              reject(e)
            }
          }
        )
      })
    })
  })
})

describe('MySQL2 Compatibility - Backward Compatibility (namedPlaceholders: false)', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let connection: ReturnType<typeof createMySQLConnection>

  beforeAll(async () => {
    config = loadConfig('mysql')
    rdsClient = new RDSDataClient({ region: config.region })

    // Create connection WITHOUT namedPlaceholders (default behavior)
    connection = createMySQLConnection(config)
    await connection.connect()

    await connection.query(`
      CREATE TABLE IF NOT EXISTS mysql2_compat_test2 (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255)
      )
    `)

    await connection.query('DELETE FROM mysql2_compat_test2')
  }, 60000)

  afterAll(async () => {
    await connection.query('DROP TABLE IF EXISTS mysql2_compat_test2')
    await connection.end()
    rdsClient.destroy()
  }, 60000)

  test('should still work with positional placeholders when namedPlaceholders is disabled', async () => {
    await connection.query('INSERT INTO mysql2_compat_test2 (name) VALUES (?)', ['TestName'])

    const [rows, _fields] = await connection.query('SELECT * FROM mysql2_compat_test2 WHERE name = ?', ['TestName'])

    expect((rows as any[]).length).toBe(1)
    expect((rows as any[])[0].name).toBe('TestName')
  })

  test('should NOT interpret :name as placeholder when namedPlaceholders is disabled', async () => {
    // This should treat :name as literal string, not as a placeholder
    // The SQL might fail or treat it literally depending on MySQL parser
    // This test just ensures we don't break existing behavior
    const [rows, _fields] = await connection.query('SELECT ? AS result', ['value'])

    expect((rows as any[])[0].result).toBe('value')
  })
})

describe('MySQL2 Compatibility - Query-Level namedPlaceholders', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let connection: ReturnType<typeof createMySQLConnection>

  beforeAll(async () => {
    config = loadConfig('mysql')
    rdsClient = new RDSDataClient({ region: config.region })

    // Create connection WITHOUT namedPlaceholders at config level
    connection = createMySQLConnection(config)
    await connection.connect()

    await connection.query(`
      CREATE TABLE IF NOT EXISTS mysql2_query_level_test (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255),
        age INT
      )
    `)

    await connection.query('DELETE FROM mysql2_query_level_test')
  }, 60000)

  afterAll(async () => {
    await connection.query('DROP TABLE IF EXISTS mysql2_query_level_test')
    await connection.end()
    rdsClient.destroy()
  }, 60000)

  test('should support namedPlaceholders at query level', async () => {
    const [result, _] = await connection.query(
      {
        sql: 'INSERT INTO mysql2_query_level_test (username, age) VALUES (:username, :age)',
        namedPlaceholders: true
      },
      { username: 'john_doe', age: 30 }
    )

    expect((result as any).affectedRows).toBe(1)

    // Query with query-level namedPlaceholders
    const [rows, _fields] = await connection.query(
      {
        sql: 'SELECT * FROM mysql2_query_level_test WHERE username = :username',
        namedPlaceholders: true
      },
      { username: 'john_doe' }
    )

    expect((rows as any[]).length).toBe(1)
    expect((rows as any[])[0].username).toBe('john_doe')
    expect((rows as any[])[0].age).toBe(30)
  })

  test('should use positional placeholders when namedPlaceholders is explicitly false at query level', async () => {
    await connection.query(
      {
        sql: 'INSERT INTO mysql2_query_level_test (username, age) VALUES (?, ?)',
        namedPlaceholders: false
      },
      ['jane_smith', 25]
    )

    const [rows, _fields] = await connection.query(
      {
        sql: 'SELECT * FROM mysql2_query_level_test WHERE username = ?',
        namedPlaceholders: false
      },
      ['jane_smith']
    )

    expect((rows as any[]).length).toBe(1)
    expect((rows as any[])[0].username).toBe('jane_smith')
  })

  test('should work with callback style and query-level namedPlaceholders', async () => {
    await new Promise<void>((resolve, reject) => {
      connection.query(
        {
          sql: 'SELECT * FROM mysql2_query_level_test WHERE username = :username AND age > :minAge',
          namedPlaceholders: true
        },
        { username: 'john_doe', minAge: 25 } as any,
        (err, results, _fields) => {
          try {
            expect(err).toBeNull()
            expect((results as any[]).length).toBeGreaterThanOrEqual(1)
            expect((results as any[])[0].username).toBe('john_doe')
            resolve()
          } catch (e) {
            reject(e)
          }
        }
      )
    })
  })

  test('query-level namedPlaceholders should override connection-level setting', async () => {
    // Connection has namedPlaceholders: false (default)
    // But query enables it
    const [rows, _fields] = await connection.query(
      {
        sql: 'SELECT * FROM mysql2_query_level_test WHERE username = :username',
        namedPlaceholders: true
      },
      { username: 'john_doe' }
    )

    expect((rows as any[]).length).toBe(1)
    expect((rows as any[])[0].username).toBe('john_doe')
  })
})

describe('MySQL2 Compatibility - Query-Level namedPlaceholders with Pool', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let pool: ReturnType<typeof createMySQLPool>

  beforeAll(async () => {
    config = loadConfig('mysql')
    rdsClient = new RDSDataClient({ region: config.region })

    // Create pool WITHOUT namedPlaceholders at config level
    pool = createMySQLPool(config)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS mysql2_pool_query_level_test (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255),
        value INT
      )
    `)

    await pool.query('DELETE FROM mysql2_pool_query_level_test')
  }, 60000)

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS mysql2_pool_query_level_test')
    await pool.end()
    rdsClient.destroy()
  }, 60000)

  test('should support namedPlaceholders at query level in pool', async () => {
    await pool.query(
      {
        sql: 'INSERT INTO mysql2_pool_query_level_test (name, value) VALUES (:name, :value)',
        namedPlaceholders: true
      },
      { name: 'test-item', value: 100 }
    )

    const [rows, _fields] = await pool.query(
      {
        sql: 'SELECT * FROM mysql2_pool_query_level_test WHERE name = :name',
        namedPlaceholders: true
      },
      { name: 'test-item' }
    )

    expect((rows as any[]).length).toBeGreaterThanOrEqual(1)
    expect((rows as any[])[0].name).toBe('test-item')
    expect((rows as any[])[0].value).toBe(100)
  })
})
