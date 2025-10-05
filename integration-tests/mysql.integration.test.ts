import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { RDSDataClient } from '@aws-sdk/client-rds-data'
import dataApiClient from '../src/index'
import type { Parameters } from '../src/types'
import {
  loadConfig,
  createTables,
  dropTables,
  truncateTables,
  getSeedUsersBatch,
  getSeedProductsBatch,
  waitForCluster,
  mysqlTables,
  type IntegrationTestConfig
} from './setup'

describe('MySQL Integration Tests', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let client: ReturnType<typeof dataApiClient>

  beforeAll(async () => {
    config = loadConfig('mysql')
    rdsClient = new RDSDataClient({ region: config.region })

    // Wait for cluster to wake up if it's scaled to zero
    await waitForCluster(rdsClient, config)

    // Create tables
    await createTables(rdsClient, config, mysqlTables)

    // Initialize data-api-client
    client = dataApiClient({
      secretArn: config.secretArn,
      resourceArn: config.resourceArn,
      database: config.database,
      engine: 'mysql'
    })
  }, 60000) // 60 second timeout for setup

  afterAll(async () => {
    // Clean up tables
    await dropTables(rdsClient, config, mysqlTables)
    rdsClient.destroy()
  })

  beforeEach(async () => {
    // Truncate all tables before each test
    await truncateTables(rdsClient, config, mysqlTables)
  })

  describe('Basic Queries', () => {
    test('should execute simple SELECT query', async () => {
      const result = await client.query('SELECT 1 as num, "test" as str')
      expect(result.records).toEqual([{ num: 1, str: 'test' }])
    })

    test('should INSERT and SELECT with named parameters', async () => {
      const insertResult = await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
        { name: 'Mike Brady', email: 'mike@example.com', age: 52 }
      )

      expect(insertResult.insertId).toBeDefined()
      expect(insertResult.insertId).toBeGreaterThan(0)

      const selectResult = await client.query(
        'SELECT * FROM users WHERE id = :id',
        { id: insertResult.insertId! }
      )

      expect(selectResult.records).toHaveLength(1)
      expect(selectResult.records![0]).toMatchObject({
        name: 'Mike Brady',
        email: 'mike@example.com',
        age: 52
      })
    })

    test('should UPDATE records and return numberOfRecordsUpdated', async () => {
      // Insert test data
      await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
        { name: 'Carol Brady', email: 'carol@example.com', age: 50 }
      )

      const updateResult = await client.query(
        'UPDATE users SET age = :age WHERE email = :email',
        { age: 51, email: 'carol@example.com' }
      )

      expect(updateResult.numberOfRecordsUpdated).toBe(1)

      const selectResult = await client.query(
        'SELECT age FROM users WHERE email = :email',
        { email: 'carol@example.com' }
      )

      expect(selectResult.records![0].age).toBe(51)
    })

    test('should DELETE records and return numberOfRecordsUpdated', async () => {
      // Insert test data
      await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
        { name: 'Jan Brady', email: 'jan@example.com', age: 15 }
      )

      const deleteResult = await client.query(
        'DELETE FROM users WHERE email = :email',
        { email: 'jan@example.com' }
      )

      expect(deleteResult.numberOfRecordsUpdated).toBe(1)

      const selectResult = await client.query(
        'SELECT * FROM users WHERE email = :email',
        { email: 'jan@example.com' }
      )

      expect(selectResult.records).toHaveLength(0)
    })
  })

  describe('Batch Operations', () => {
    test('should perform batch INSERT', async () => {
      const users = getSeedUsersBatch()
      const result = await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
        users as unknown as Parameters[]
      )

      // Batch operations don't return individual records, but updateResults
      expect(result.updateResults).toBeDefined()
      expect(result.updateResults).toHaveLength(users.length)

      const selectResult = await client.query('SELECT COUNT(*) as count FROM users')
      expect(selectResult.records![0].count).toBe(users.length)
    })

    test('should perform batch UPDATE', async () => {
      // Insert test data
      const users = getSeedUsersBatch()
      await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
        users as unknown as Parameters[]
      )

      // Batch update ages
      const updates = users.map((user) => ([{
        email: user[0].email,
        age: ((user[0].age as number | null) || 0) + 1
      }]))

      await client.query(
        'UPDATE users SET age = :age WHERE email = :email',
        updates as unknown as Parameters[]
      )

      const selectResult = await client.query('SELECT * FROM users ORDER BY id')
      selectResult.records!.forEach((record, idx) => {
        expect(record.age).toBe(((users[idx][0].age as number | null) || 0) + 1)
      })
    })

    test('should perform batch DELETE', async () => {
      // Insert test data
      const users = getSeedUsersBatch()
      await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
        users as unknown as Parameters[]
      )

      // Delete first two users
      const deleteEmails = users.slice(0, 2).map((user) => ([{ email: user[0].email }]))
      await client.query('DELETE FROM users WHERE email = :email', deleteEmails as unknown as Parameters[])

      const selectResult = await client.query('SELECT COUNT(*) as count FROM users')
      expect(selectResult.records![0].count).toBe(users.length - 2)
    })
  })

  describe('Data Types', () => {
    test('should handle NULL values', async () => {
      await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
        { name: 'Alice Nelson', email: 'alice@example.com', age: null }
      )

      const result = await client.query(
        'SELECT * FROM users WHERE email = :email',
        { email: 'alice@example.com' }
      )

      expect(result.records![0].age).toBeNull()
    })

    test('should handle BOOLEAN values', async () => {
      // Create user first (required by foreign key)
      const userResult = await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
        { name: 'Greg Brady', email: 'greg@example.com', age: 18 }
      )

      await client.query(
        'INSERT INTO posts (user_id, title, content, published) VALUES (:userId, :title, :content, :published)',
        { userId: userResult.insertId!, title: 'Test', content: 'Content', published: true }
      )

      const result = await client.query(
        'SELECT published FROM posts WHERE title = :title',
        { title: 'Test' }
      )

      expect(result.records![0].published).toBe(true)
    })

    test('should handle DECIMAL values', async () => {
      const products = getSeedProductsBatch()
      await client.query(
        'INSERT INTO products (name, price, quantity, metadata) VALUES (:name, :price, :quantity, :metadata)',
        products as unknown as Parameters[]
      )

      const result = await client.query(
        'SELECT price FROM products WHERE name = :name',
        { name: 'Widget A' }
      )

      expect(result.records![0].price).toBe('19.99')
    })

    test('should handle JSON values', async () => {
      const jsonData = { key: 'value', nested: { data: 123 } }
      await client.query(
        'INSERT INTO products (name, price, quantity, metadata) VALUES (:name, :price, :quantity, :metadata)',
        {
          name: 'JSON Test',
          price: 9.99,
          quantity: 10,
          metadata: JSON.stringify(jsonData)
        }
      )

      const result = await client.query(
        'SELECT metadata FROM products WHERE name = :name',
        { name: 'JSON Test' }
      )

      // MySQL returns JSON as a string, so we need to parse it
      const metadata = typeof result.records![0].metadata === 'string'
        ? JSON.parse(result.records![0].metadata)
        : result.records![0].metadata
      expect(metadata).toEqual(jsonData)
    })

    test('should handle TIMESTAMP values', async () => {
      const now = new Date()
      await client.query(
        'INSERT INTO users (name, email, created_at) VALUES (:name, :email, :createdAt)',
        { name: 'Peter Brady', email: 'peter@example.com', createdAt: now }
      )

      const result = await client.query(
        'SELECT created_at FROM users WHERE email = :email',
        { email: 'peter@example.com' }
      )

      expect(result.records![0].created_at).toBeDefined()
    })
  })

  describe('Transactions', () => {
    test('should commit successful transaction', async () => {
      const transaction = client.transaction()

      transaction.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
        { name: 'Marcia Brady', email: 'marcia@example.com', age: 17 }
      )

      transaction.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
        { name: 'Cindy Brady', email: 'cindy@example.com', age: 12 }
      )

      const result = await transaction.commit()

      // Transaction commit returns query results + transaction status
      expect(result).toHaveLength(3)
      expect(result[0].insertId).toBeDefined()
      expect(result[1].insertId).toBeDefined()
      expect(result[2].transactionStatus).toBeDefined()

      const selectResult = await client.query('SELECT COUNT(*) as count FROM users')
      expect(selectResult.records![0].count).toBe(2)
    })

    test('should rollback failed transaction', async () => {
      const transaction = client.transaction()

      transaction.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
        { name: 'Bobby Brady', email: 'bobby@example.com', age: 12 }
      )

      // This should fail due to duplicate email
      transaction.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
        { name: 'Bobby Clone', email: 'bobby@example.com', age: 13 }
      )

      await expect(transaction.commit()).rejects.toThrow()

      const selectResult = await client.query('SELECT COUNT(*) as count FROM users')
      expect(selectResult.records![0].count).toBe(0)
    })

    test('should handle rollback callback', async () => {
      let rollbackCalled = false

      const transaction = client.transaction()

      transaction.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
        { name: 'Cousin Oliver', email: 'oliver@example.com', age: 10 }
      )

      transaction.query('INVALID SQL QUERY')

      transaction.rollback(() => {
        rollbackCalled = true
      })

      await expect(transaction.commit()).rejects.toThrow()
      expect(rollbackCalled).toBe(true)
    })
  })

  describe('Dynamic Identifiers', () => {
    test('should handle table name identifiers', async () => {
      const result = await client.query(
        'SELECT COUNT(*) as count FROM ::table',
        { table: 'users' }
      )

      expect(result.records![0].count).toBeDefined()
    })

    test('should handle column name identifiers', async () => {
      await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
        { name: 'Tiger', email: 'tiger@example.com', age: 4 }
      )

      const result = await client.query(
        'SELECT ::column FROM users WHERE email = :email',
        { column: 'name', email: 'tiger@example.com' }
      )

      expect(result.records![0].name).toBe('Tiger')
    })
  })

  describe('Format Options', () => {
    test('should hydrate column names by default', async () => {
      await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
        { name: 'Alice Nelson', email: 'alice2@example.com', age: 45 }
      )

      const result = await client.query(
        'SELECT id, name, email FROM users WHERE email = :email',
        { email: 'alice2@example.com' }
      )

      expect(result.records![0]).toHaveProperty('id')
      expect(result.records![0]).toHaveProperty('name')
      expect(result.records![0]).toHaveProperty('email')
    })

    test('should return arrays when hydrateColumnNames is false', async () => {
      const clientNoHydrate = dataApiClient({
        secretArn: config.secretArn,
        resourceArn: config.resourceArn,
        database: config.database,
        engine: 'mysql',
        hydrateColumnNames: false
      })

      await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
        { name: 'Sam Franklin', email: 'sam@example.com', age: 50 }
      )

      const result = await clientNoHydrate.query(
        'SELECT id, name, email FROM users WHERE email = :email',
        { email: 'sam@example.com' }
      )

      expect(Array.isArray(result.records![0])).toBe(true)
      expect(result.records![0]).toHaveLength(3)
    })
  })

  describe('Foreign Key Constraints', () => {
    test('should enforce foreign key constraints', async () => {
      // Insert user first (due to foreign key)
      await expect(
        client.query(
          'INSERT INTO posts (user_id, title, content) VALUES (:userId, :title, :content)',
          { userId: 9999, title: 'Invalid', content: 'This should fail' }
        )
      ).rejects.toThrow()
    })

    test('should cascade delete with foreign keys', async () => {
      // Insert user
      const userResult = await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
        { name: 'Mike Brady', email: 'mike2@example.com', age: 52 }
      )

      const userId = userResult.insertId!
      expect(userId).toBeDefined()

      // Insert posts for user
      await client.query(
        'INSERT INTO posts (user_id, title, content) VALUES (:userId, :title, :content)',
        { userId, title: 'Post 1', content: 'Content 1' }
      )

      await client.query(
        'INSERT INTO posts (user_id, title, content) VALUES (:userId, :title, :content)',
        { userId, title: 'Post 2', content: 'Content 2' }
      )

      // Delete user should cascade to posts
      await client.query('DELETE FROM users WHERE id = :id', { id: userId })

      const postsResult = await client.query(
        'SELECT COUNT(*) as count FROM posts WHERE user_id = :userId',
        { userId }
      )

      expect(postsResult.records![0].count).toBe(0)
    })
  })
})
