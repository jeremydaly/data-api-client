/**
 * Knex with MySQL2 Compatibility Integration Tests
 *
 * NOTE: These tests are skipped because Knex requires a different integration approach.
 * When you pass `connection: pool`, Knex tries to use it as a config object to create
 * a real MySQL2 connection, rather than using the pool's query methods directly.
 *
 * Knex works differently from Kysely - it expects to manage its own connection pool
 * and doesn't support drop-in pool replacement. To use Knex with Data API, you would
 * need to create a custom Knex dialect, which is beyond the scope of this compatibility layer.
 *
 * For a working ORM solution with the MySQL compatibility layer, consider using raw
 * mysql2 connection methods directly (see mysql2-compat.int.test.ts).
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { RDSDataClient } from '@aws-sdk/client-rds-data'
import { createMySQLPool } from '../src/compat/mysql2'
import { loadConfig, waitForCluster, type IntegrationTestConfig } from './setup'
import knex, { Knex } from 'knex'

describe.skip('Knex with MySQL2 Compat', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let pool: ReturnType<typeof createMySQLPool>
  let db: Knex

  beforeAll(async () => {
    config = loadConfig('mysql')
    rdsClient = new RDSDataClient({ region: config.region })

    await waitForCluster(rdsClient, config)

    pool = createMySQLPool(config)

    db = knex({
      client: 'mysql2',
      connection: pool as any
    })

    // Create test table using raw SQL
    await pool.query(`
      CREATE TABLE IF NOT EXISTS knex_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        age INT,
        active BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Clear any existing data
    await pool.query('DELETE FROM knex_users')
  }, 60000)

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS knex_users')
    await db.destroy()
    await pool.end()
    rdsClient.destroy()
  }, 60000)

  test('should insert records with Knex', async () => {
    const result = await db('knex_users').insert({
      name: 'Alice',
      email: 'alice@example.com',
      age: 30,
      active: true
    })

    expect(result[0]).toBeGreaterThan(0) // insertId
  })

  test('should select records with Knex', async () => {
    // Insert test data
    await db('knex_users').insert({
      name: 'Bob',
      email: 'bob@example.com',
      age: 25,
      active: true
    })

    const result = await db('knex_users').where({ name: 'Bob' }).select('*')

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Bob')
    expect(result[0].email).toBe('bob@example.com')
    expect(result[0].age).toBe(25)
  })

  test('should select specific columns with Knex', async () => {
    const result = await db('knex_users').where({ name: 'Bob' }).select('name', 'email')

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Bob')
    expect(result[0].email).toBe('bob@example.com')
    expect(result[0]).not.toHaveProperty('age')
  })

  test('should update records with Knex', async () => {
    // Insert test data
    await db('knex_users').insert({
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 35,
      active: true
    })

    // Update the record
    const updateResult = await db('knex_users').where({ name: 'Charlie' }).update({ age: 36 })

    expect(updateResult).toBe(1) // affectedRows

    // Verify update
    const result = await db('knex_users').where({ name: 'Charlie' }).first()

    expect(result.age).toBe(36)
  })

  test('should delete records with Knex', async () => {
    // Insert test data
    await db('knex_users').insert({
      name: 'David',
      email: 'david@example.com',
      age: 40,
      active: true
    })

    // Delete the record
    const deleteResult = await db('knex_users').where({ name: 'David' }).delete()

    expect(deleteResult).toBe(1) // affectedRows

    // Verify deletion
    const result = await db('knex_users').where({ name: 'David' })

    expect(result).toHaveLength(0)
  })

  test('should handle complex WHERE clauses with Knex', async () => {
    // Insert test data
    await db('knex_users').insert([
      { name: 'Eve', email: 'eve@example.com', age: 28, active: true },
      { name: 'Frank', email: 'frank@example.com', age: 32, active: false },
      { name: 'Grace', email: 'grace@example.com', age: 29, active: true }
    ])

    // Query with multiple conditions
    const result = await db('knex_users').where({ active: true }).andWhere('age', '>=', 28).select('*')

    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result.every((u) => u.active === true || u.active === 1)).toBe(true)
  })

  test('should handle OR conditions with Knex', async () => {
    const result = await db('knex_users').where({ name: 'Eve' }).orWhere({ name: 'Grace' }).select('*').orderBy('name')

    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result.map((r) => r.name).sort()).toEqual(expect.arrayContaining(['Eve', 'Grace']))
  })

  test('should handle ORDER BY with Knex', async () => {
    const result = await db('knex_users').select('*').orderBy('age', 'asc')

    expect(result.length).toBeGreaterThan(0)
    // Verify ascending order
    for (let i = 1; i < result.length; i++) {
      if (result[i].age !== null && result[i - 1].age !== null) {
        expect(result[i].age).toBeGreaterThanOrEqual(result[i - 1].age)
      }
    }
  })

  test('should handle LIMIT and OFFSET with Knex', async () => {
    const result = await db('knex_users').select('*').limit(2).offset(1)

    expect(result.length).toBeLessThanOrEqual(2)
  })

  test('should handle NULL values with Knex', async () => {
    await db('knex_users').insert({
      name: 'NullAge',
      email: 'nullage@example.com',
      age: null,
      active: true
    })

    const result = await db('knex_users').where({ name: 'NullAge' }).first()

    expect(result.age).toBeNull()
  })

  test('should handle whereNull with Knex', async () => {
    const result = await db('knex_users').whereNull('age').select('*')

    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result.every((r) => r.age === null)).toBe(true)
  })

  test('should handle whereNotNull with Knex', async () => {
    const result = await db('knex_users').whereNotNull('age').select('*')

    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result.every((r) => r.age !== null)).toBe(true)
  })

  test('should handle COUNT aggregate with Knex', async () => {
    const result = await db('knex_users').count('id as count').first()

    expect(result?.count).toBeGreaterThan(0)
  })

  test('should handle AVG aggregate with Knex', async () => {
    const result = await db('knex_users').avg('age as avg_age').first()

    expect(result?.avg_age).toBeDefined()
  })

  test('should handle MIN/MAX aggregates with Knex', async () => {
    const result = await db('knex_users').min('age as min_age').max('age as max_age').first()

    expect(result?.min_age).toBeDefined()
    expect(result?.max_age).toBeDefined()
    if (result?.min_age !== null && result?.max_age !== null) {
      expect(result.max_age).toBeGreaterThanOrEqual(result.min_age)
    }
  })

  test('should handle whereIn with Knex', async () => {
    const result = await db('knex_users').whereIn('name', ['Alice', 'Bob', 'Charlie']).select('*')

    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result.every((r) => ['Alice', 'Bob', 'Charlie'].includes(r.name))).toBe(true)
  })

  test('should handle whereBetween with Knex', async () => {
    const result = await db('knex_users').whereBetween('age', [25, 35]).select('*')

    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result.every((r) => r.age === null || (r.age >= 25 && r.age <= 35))).toBe(true)
  })

  test('should handle raw SQL with Knex', async () => {
    const result = await db.raw('SELECT * FROM knex_users WHERE age > ?', [25])

    expect(result[0].length).toBeGreaterThan(0)
    expect(result[0].every((r: any) => r.age === null || r.age > 25)).toBe(true)
  })

  test('should handle multiple inserts and return insert IDs', async () => {
    const result = await db('knex_users').insert([
      { name: 'Henry', email: 'henry@example.com', age: 45 },
      { name: 'Iris', email: 'iris@example.com', age: 33 }
    ])

    // First insert ID is returned
    expect(result[0]).toBeGreaterThan(0)
  })

  test('should handle distinct with Knex', async () => {
    // Insert duplicate ages
    await db('knex_users').insert([
      { name: 'Jack', email: 'jack@example.com', age: 50 },
      { name: 'Kate', email: 'kate@example.com', age: 50 }
    ])

    const result = await db('knex_users').distinct('age').whereNotNull('age').orderBy('age')

    const ages = result.map((r) => r.age)
    const uniqueAges = [...new Set(ages)]

    expect(ages).toEqual(uniqueAges)
  })
})

describe.skip('Knex Transactions with MySQL2 Compat', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let pool: ReturnType<typeof createMySQLPool>
  let db: Knex

  beforeAll(async () => {
    config = loadConfig('mysql')
    rdsClient = new RDSDataClient({ region: config.region })

    await waitForCluster(rdsClient, config)

    pool = createMySQLPool(config)

    db = knex({
      client: 'mysql2',
      connection: pool as any
    })

    // Create test table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS knex_tx_test (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL
      )
    `)

    // Clear any existing data
    await pool.query('DELETE FROM knex_tx_test')
  }, 60000)

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS knex_tx_test')
    await db.destroy()
    await pool.end()
    rdsClient.destroy()
  }, 60000)

  test('should commit transaction with Knex', async () => {
    await db.transaction(async (trx) => {
      await trx('knex_tx_test').insert({
        name: 'TxUser1',
        email: 'txuser1@example.com'
      })

      await trx('knex_tx_test').insert({
        name: 'TxUser2',
        email: 'txuser2@example.com'
      })
    })

    // Verify both records were inserted
    const result = await db('knex_tx_test').select('*')

    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result.some((r) => r.name === 'TxUser1')).toBe(true)
    expect(result.some((r) => r.name === 'TxUser2')).toBe(true)
  })

  test('should rollback transaction on error with Knex', async () => {
    const initialCount = await db('knex_tx_test').count('id as count').first()

    try {
      await db.transaction(async (trx) => {
        await trx('knex_tx_test').insert({
          name: 'TxRollback',
          email: 'rollback@example.com'
        })

        // Force error to trigger rollback
        throw new Error('Intentional rollback')
      })
    } catch (err) {
      // Expected error
    }

    // Verify record was NOT inserted
    const result = await db('knex_tx_test').where({ name: 'TxRollback' }).select('*')

    expect(result).toHaveLength(0)

    // Verify count hasn't changed
    const finalCount = await db('knex_tx_test').count('id as count').first()

    expect(finalCount?.count).toBe(initialCount?.count)
  })

  test('should handle multiple operations in transaction', async () => {
    await db.transaction(async (trx) => {
      // Insert
      await trx('knex_tx_test').insert({
        name: 'MultiOp1',
        email: 'multiop1@example.com'
      })

      // Update
      await trx('knex_tx_test').where({ name: 'MultiOp1' }).update({ email: 'updated@example.com' })

      // Select to verify
      const result = await trx('knex_tx_test').where({ name: 'MultiOp1' }).first()

      expect(result.email).toBe('updated@example.com')
    })

    // Verify changes were committed
    const result = await db('knex_tx_test').where({ name: 'MultiOp1' }).first()

    expect(result.email).toBe('updated@example.com')
  })
})

describe.skip('Knex Query Builder Features with MySQL2 Compat', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let pool: ReturnType<typeof createMySQLPool>
  let db: Knex

  beforeAll(async () => {
    config = loadConfig('mysql')
    rdsClient = new RDSDataClient({ region: config.region })

    await waitForCluster(rdsClient, config)

    pool = createMySQLPool(config)

    db = knex({
      client: 'mysql2',
      connection: pool as any
    })

    // Create test tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS knex_products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        category VARCHAR(100)
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS knex_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        quantity INT NOT NULL,
        FOREIGN KEY (product_id) REFERENCES knex_products(id)
      )
    `)

    // Clear existing data
    await pool.query('DELETE FROM knex_orders')
    await pool.query('DELETE FROM knex_products')

    // Insert test data
    const productIds = await db('knex_products').insert([
      { name: 'Laptop', price: 999.99, category: 'Electronics' },
      { name: 'Mouse', price: 29.99, category: 'Electronics' },
      { name: 'Desk', price: 299.99, category: 'Furniture' },
      { name: 'Chair', price: 199.99, category: 'Furniture' }
    ])

    // Insert orders using first product ID
    await db('knex_orders').insert([
      { product_id: productIds[0], quantity: 2 },
      { product_id: productIds[0], quantity: 1 }
    ])
  }, 60000)

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS knex_orders')
    await pool.query('DROP TABLE IF EXISTS knex_products')
    await db.destroy()
    await pool.end()
    rdsClient.destroy()
  }, 60000)

  test('should handle JOIN with Knex', async () => {
    const result = await db('knex_orders')
      .join('knex_products', 'knex_orders.product_id', 'knex_products.id')
      .select('knex_orders.*', 'knex_products.name as product_name', 'knex_products.price')

    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toHaveProperty('product_name')
    expect(result[0]).toHaveProperty('price')
  })

  test('should handle LEFT JOIN with Knex', async () => {
    const result = await db('knex_products')
      .leftJoin('knex_orders', 'knex_products.id', 'knex_orders.product_id')
      .select('knex_products.name', 'knex_orders.quantity')

    expect(result.length).toBeGreaterThanOrEqual(4) // All products
  })

  test('should handle GROUP BY with Knex', async () => {
    const result = await db('knex_products')
      .select('category')
      .count('id as count')
      .groupBy('category')
      .orderBy('category')

    expect(result.length).toBe(2) // Electronics and Furniture
    expect(result.every((r) => r.count >= 2)).toBe(true)
  })

  test('should handle HAVING with Knex', async () => {
    const result = await db('knex_products')
      .select('category')
      .count('id as count')
      .groupBy('category')
      .having('count', '>=', 2)

    expect(result.length).toBe(2)
  })

  test('should handle subqueries with Knex', async () => {
    const avgPrice = db('knex_products').avg('price as avg_price')

    const result = await db('knex_products').select('*').where('price', '>', avgPrice)

    expect(result.length).toBeGreaterThan(0)
  })

  test('should handle whereLike with Knex', async () => {
    const result = await db('knex_products').where('name', 'like', '%top%').select('*')

    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result.some((r) => r.name.toLowerCase().includes('top'))).toBe(true)
  })

  test('should handle orderBy multiple columns with Knex', async () => {
    const result = await db('knex_products').select('*').orderBy('category').orderBy('price', 'desc')

    expect(result.length).toBeGreaterThan(0)
    // Verify ordering
    for (let i = 1; i < result.length; i++) {
      if (result[i].category === result[i - 1].category) {
        expect(parseFloat(result[i].price)).toBeLessThanOrEqual(parseFloat(result[i - 1].price))
      }
    }
  })
})
