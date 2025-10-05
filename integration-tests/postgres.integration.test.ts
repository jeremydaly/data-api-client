import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { RDSDataClient } from '@aws-sdk/client-rds-data'
import dataApiClient from '../src/index'
import type { Parameters } from '../src/types'
import {
  loadConfig,
  createTables,
  dropTables,
  getSeedUsers,
  getSeedUsersBatch,
  getSeedProductsBatch,
  waitForCluster,
  postgresTables,
  type IntegrationTestConfig
} from './setup'

describe('PostgreSQL Integration Tests', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let client: ReturnType<typeof dataApiClient>

  beforeAll(async () => {
    config = loadConfig('pg')
    rdsClient = new RDSDataClient({ region: config.region })

    // Wait for cluster to wake up if it's scaled to zero
    await waitForCluster(rdsClient, config)

    // Create tables
    await createTables(rdsClient, config, postgresTables)

    // Initialize data-api-client
    client = dataApiClient({
      secretArn: config.secretArn,
      resourceArn: config.resourceArn,
      database: config.database,
      engine: 'pg'
    })
  }, 60000) // 60 second timeout for setup

  afterAll(async () => {
    // Clean up tables
    await dropTables(rdsClient, config, postgresTables)
    rdsClient.destroy()
  })

  beforeEach(async () => {
    // Truncate all tables before each test (except locations which has UUID)
    const truncateTables = postgresTables.filter((t) => t.name !== 'locations').map((t) => t.name)

    for (const table of truncateTables) {
      await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
    }

    // For locations, delete all rows
    await client.query('DELETE FROM locations')
  })

  describe('Basic Queries', () => {
    test('should execute simple SELECT query', async () => {
      const result = await client.query("SELECT 1 as num, 'test' as str")
      expect(result.records).toEqual([{ num: 1, str: 'test' }])
    })

    test('should INSERT and SELECT with named parameters', async () => {
      const insertResult = await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age) RETURNING id',
        { name: 'Mike Brady', email: 'mike@example.com', age: 52 }
      )

      expect(insertResult.records).toHaveLength(1)
      expect(insertResult.records![0].id).toBeGreaterThan(0)

      const userId = insertResult.records![0].id

      const selectResult = await client.query('SELECT * FROM users WHERE id = :id', { id: userId })

      expect(selectResult.records).toHaveLength(1)
      expect(selectResult.records![0]).toMatchObject({
        name: 'Mike Brady',
        email: 'mike@example.com',
        age: 52
      })
    })

    test('should UPDATE records', async () => {
      // Insert test data
      const insertResult = await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age) RETURNING id',
        { name: 'Carol Brady', email: 'carol@example.com', age: 50 }
      )

      const userId = insertResult.records![0].id

      await client.query('UPDATE users SET age = :age WHERE id = :id', {
        age: 51,
        id: userId
      })

      const selectResult = await client.query('SELECT age FROM users WHERE id = :id', { id: userId })

      expect(selectResult.records![0].age).toBe(51)
    })

    test('should DELETE records', async () => {
      // Insert test data
      const insertResult = await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age) RETURNING id',
        { name: 'Jan Brady', email: 'jan@example.com', age: 15 }
      )

      const userId = insertResult.records![0].id

      await client.query('DELETE FROM users WHERE id = :id', { id: userId })

      const selectResult = await client.query('SELECT * FROM users WHERE id = :id', { id: userId })

      expect(selectResult.records).toHaveLength(0)
    })
  })

  describe('Batch Operations', () => {
    test('should perform batch INSERT with RETURNING', async () => {
      const users = getSeedUsersBatch()
      const result = await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age) RETURNING id',
        users as unknown as Parameters[]
      )

      // Batch operations don't return individual records, but updateResults
      expect(result.updateResults).toBeDefined()
      expect(result.updateResults).toHaveLength(users.length)

      const selectResult = await client.query('SELECT COUNT(*) as count FROM users')
      expect(selectResult.records![0].count).toBe(users.length)
    })

    test('should perform batch UPDATE', async () => {
      // Insert test data one at a time to get IDs (batch INSERT doesn't return individual records)
      const users = getSeedUsers()
      const insertedIds: number[] = []
      for (const user of users) {
        const result = await client.query(
          'INSERT INTO users (name, email, age) VALUES (:name, :email, :age) RETURNING id',
          user
        )
        insertedIds.push(result.records![0].id)
      }

      // Batch update ages
      const updates = insertedIds.map((id, idx) => [
        {
          id,
          age: ((users[idx].age as number | null) || 0) + 1
        }
      ])

      await client.query('UPDATE users SET age = :age WHERE id = :id', updates as unknown as Parameters[])

      const selectResult = await client.query('SELECT * FROM users ORDER BY id')
      selectResult.records!.forEach((record, idx) => {
        expect(record.age).toBe(((users[idx].age as number | null) || 0) + 1)
      })
    })

    test('should perform batch DELETE', async () => {
      // Insert test data one at a time to get IDs
      const users = getSeedUsers()
      const insertedIds: number[] = []
      for (const user of users) {
        const result = await client.query(
          'INSERT INTO users (name, email, age) VALUES (:name, :email, :age) RETURNING id',
          user
        )
        insertedIds.push(result.records![0].id)
      }

      // Delete first two users
      const deleteIds = insertedIds.slice(0, 2).map((id) => [{ id }])
      await client.query('DELETE FROM users WHERE id = :id', deleteIds as unknown as Parameters[])

      const selectResult = await client.query('SELECT COUNT(*) as count FROM users')
      expect(selectResult.records![0].count).toBe(users.length - 2)
    })
  })

  describe('Data Types', () => {
    test('should handle NULL values', async () => {
      await client.query('INSERT INTO users (name, email, age) VALUES (:name, :email, :age)', {
        name: 'Alice Nelson',
        email: 'alice@example.com',
        age: null
      })

      const result = await client.query('SELECT * FROM users WHERE email = :email', { email: 'alice@example.com' })

      expect(result.records![0].age).toBeNull()
    })

    test('should handle BOOLEAN values', async () => {
      // Insert user first
      const userResult = await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age) RETURNING id',
        { name: 'Greg Brady', email: 'greg@example.com', age: 18 }
      )

      await client.query(
        'INSERT INTO posts (user_id, title, content, published) VALUES (:userId, :title, :content, :published)',
        {
          userId: userResult.records![0].id,
          title: 'Test',
          content: 'Content',
          published: true
        }
      )

      const result = await client.query('SELECT published FROM posts WHERE title = :title', { title: 'Test' })

      expect(result.records![0].published).toBe(true)
    })

    test('should handle NUMERIC/DECIMAL values', async () => {
      const products = getSeedProductsBatch()
      await client.query(
        'INSERT INTO products (name, price, quantity, metadata) VALUES (:name, :price, :quantity, :metadata::jsonb)',
        products as unknown as Parameters[]
      )

      const result = await client.query('SELECT price FROM products WHERE name = :name', { name: 'Widget A' })

      expect(result.records![0].price).toBe('19.99')
    })

    test('should handle JSONB values', async () => {
      await client.query(
        'INSERT INTO products (name, price, quantity, metadata) VALUES (:name, :price, :quantity, :metadata::jsonb)',
        {
          name: 'JSON Test',
          price: 9.99,
          quantity: 10,
          metadata: JSON.stringify({ key: 'value', nested: { data: 123 } })
        }
      )

      const result = await client.query('SELECT metadata FROM products WHERE name = :name', { name: 'JSON Test' })

      const metadata = JSON.parse(result.records![0].metadata)
      expect(metadata).toEqual({ key: 'value', nested: { data: 123 } })
    })

    test('should handle TIMESTAMP values', async () => {
      const now = new Date()
      await client.query('INSERT INTO users (name, email, created_at) VALUES (:name, :email, :createdAt)', {
        name: 'Peter Brady',
        email: 'peter@example.com',
        createdAt: now
      })

      const result = await client.query('SELECT created_at FROM users WHERE email = :email', {
        email: 'peter@example.com'
      })

      expect(result.records![0].created_at).toBeDefined()
    })

    test('should handle UUID type with inline casting', async () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000'

      await client.query('INSERT INTO locations (name, uuid) VALUES (:name, :uuid::uuid)', { name: 'Location 1', uuid })

      const result = await client.query('SELECT uuid FROM locations WHERE name = :name', { name: 'Location 1' })

      expect(result.records![0].uuid).toBe(uuid)
    })

    test('should handle explicit cast parameter', async () => {
      const uuid = '660e8400-e29b-41d4-a716-446655440001'

      // Test explicit cast parameter format: { name, value, cast }
      await client.query('INSERT INTO locations (name, uuid) VALUES (:name, :uuid)', [
        {
          name: 'name',
          value: 'Location 2'
        },
        {
          name: 'uuid',
          value: uuid,
          cast: 'uuid'
        }
      ])

      const result = await client.query('SELECT uuid, name FROM locations WHERE uuid = :uuid::uuid', { uuid })

      expect(result.records![0].uuid).toBe(uuid)
      expect(result.records![0].name).toBe('Location 2')
    })

    test('should handle explicit cast parameter with jsonb', async () => {
      const metadata = { color: 'purple', tags: ['test', 'cast'] }

      // Test explicit cast parameter format with JSONB
      await client.query(
        'INSERT INTO products (name, price, quantity, metadata) VALUES (:name, :price, :quantity, :metadata)',
        [
          {
            name: 'name',
            value: 'Cast Test Product'
          },
          {
            name: 'price',
            value: 49.99
          },
          {
            name: 'quantity',
            value: 10
          },
          {
            name: 'metadata',
            value: JSON.stringify(metadata),
            cast: 'jsonb'
          }
        ]
      )

      const result = await client.query('SELECT metadata FROM products WHERE name = :name', {
        name: 'Cast Test Product'
      })

      expect(JSON.parse(result.records![0].metadata)).toEqual(metadata)
    })
  })

  describe('Transactions', () => {
    test('should commit successful transaction', async () => {
      const transaction = client.transaction()

      transaction.query('INSERT INTO users (name, email, age) VALUES (:name, :email, :age) RETURNING id', {
        name: 'Marcia Brady',
        email: 'marcia@example.com',
        age: 17
      })

      transaction.query('INSERT INTO users (name, email, age) VALUES (:name, :email, :age) RETURNING id', {
        name: 'Cindy Brady',
        email: 'cindy@example.com',
        age: 12
      })

      const result = await transaction.commit()

      // Transaction commit returns query results + transaction status
      expect(result).toHaveLength(3)
      expect(result[0].records![0].id).toBeDefined()
      expect(result[1].records![0].id).toBeDefined()
      expect(result[2].transactionStatus).toBeDefined()

      const selectResult = await client.query('SELECT COUNT(*) as count FROM users')
      expect(selectResult.records![0].count).toBe(2)
    })

    test('should rollback failed transaction', async () => {
      const transaction = client.transaction()

      transaction.query('INSERT INTO users (name, email, age) VALUES (:name, :email, :age)', {
        name: 'Bobby Brady',
        email: 'bobby@example.com',
        age: 12
      })

      // This should fail due to duplicate email
      transaction.query('INSERT INTO users (name, email, age) VALUES (:name, :email, :age)', {
        name: 'Bobby Clone',
        email: 'bobby@example.com',
        age: 13
      })

      await expect(transaction.commit()).rejects.toThrow()

      const selectResult = await client.query('SELECT COUNT(*) as count FROM users')
      expect(selectResult.records![0].count).toBe(0)
    })

    test('should handle rollback callback', async () => {
      let rollbackCalled = false

      const transaction = client.transaction()

      transaction.query('INSERT INTO users (name, email, age) VALUES (:name, :email, :age)', {
        name: 'Cousin Oliver',
        email: 'oliver@example.com',
        age: 10
      })

      transaction.query('INVALID SQL QUERY')

      transaction.rollback(() => {
        rollbackCalled = true
      })

      await expect(transaction.commit()).rejects.toThrow()
      expect(rollbackCalled).toBe(true)
    })
  })

  describe('PostgreSQL Specific Features', () => {
    test('should use RETURNING clause', async () => {
      const result = await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age) RETURNING id, name, email',
        { name: 'Sam Franklin', email: 'sam@example.com', age: 40 }
      )

      expect(result.records).toHaveLength(1)
      expect(result.records![0]).toHaveProperty('id')
      expect(result.records![0]).toHaveProperty('name')
      expect(result.records![0]).toHaveProperty('email')
      expect(result.records![0].name).toBe('Sam Franklin')
    })

    test('should handle type casting with ::', async () => {
      const result = await client.query('SELECT :value::integer as int_value, :text::text as text_value', {
        value: '123',
        text: 456
      })

      expect(result.records![0].int_value).toBe(123)
      expect(result.records![0].text_value).toBe('456')
    })

    test('should use SERIAL auto-increment', async () => {
      await client.query('INSERT INTO users (name, email, age) VALUES (:name, :email, :age)', {
        name: 'Tiger',
        email: 'tiger@example.com',
        age: 4
      })

      await client.query('INSERT INTO users (name, email, age) VALUES (:name, :email, :age)', {
        name: 'Fluffy',
        email: 'fluffy@example.com',
        age: 3
      })

      const result = await client.query('SELECT id FROM users ORDER BY id')
      expect(result.records![0].id).toBe(1)
      expect(result.records![1].id).toBe(2)
    })

    test('should handle array operations', async () => {
      // PostgreSQL arrays (if supported by Data API)
      const result = await client.query('SELECT ARRAY[1, 2, 3, 4, 5] as numbers')

      expect(result.records![0].numbers).toBeDefined()
    })
  })

  describe('Dynamic Identifiers', () => {
    test('should handle table name identifiers', async () => {
      const result = await client.query('SELECT COUNT(*) as count FROM ::table', { table: 'users' })

      expect(result.records![0].count).toBeDefined()
    })

    test('should handle column name identifiers', async () => {
      await client.query('INSERT INTO users (name, email, age) VALUES (:name, :email, :age)', {
        name: 'Tiger',
        email: 'tiger2@example.com',
        age: 4
      })

      const result = await client.query('SELECT ::column FROM users WHERE email = :email', {
        column: 'name',
        email: 'tiger2@example.com'
      })

      expect(result.records![0].name).toBe('Tiger')
    })
  })

  describe('Format Options', () => {
    test('should hydrate column names by default', async () => {
      await client.query('INSERT INTO users (name, email, age) VALUES (:name, :email, :age)', {
        name: 'Alice Nelson',
        email: 'alice2@example.com',
        age: 45
      })

      const result = await client.query('SELECT id, name, email FROM users WHERE email = :email', {
        email: 'alice2@example.com'
      })

      expect(result.records![0]).toHaveProperty('id')
      expect(result.records![0]).toHaveProperty('name')
      expect(result.records![0]).toHaveProperty('email')
    })

    test('should return arrays when hydrateColumnNames is false', async () => {
      const clientNoHydrate = dataApiClient({
        secretArn: config.secretArn,
        resourceArn: config.resourceArn,
        database: config.database,
        engine: 'pg',
        hydrateColumnNames: false
      })

      await client.query('INSERT INTO users (name, email, age) VALUES (:name, :email, :age)', {
        name: 'Sam Franklin',
        email: 'sam2@example.com',
        age: 50
      })

      const result = await clientNoHydrate.query('SELECT id, name, email FROM users WHERE email = :email', {
        email: 'sam2@example.com'
      })

      expect(Array.isArray(result.records![0])).toBe(true)
      expect(result.records![0]).toHaveLength(3)
    })
  })

  describe('Foreign Key Constraints', () => {
    test('should enforce foreign key constraints', async () => {
      // Insert post without user (should fail)
      await expect(
        client.query('INSERT INTO posts (user_id, title, content) VALUES (:userId, :title, :content)', {
          userId: 9999,
          title: 'Invalid',
          content: 'This should fail'
        })
      ).rejects.toThrow()
    })

    test('should cascade delete with foreign keys', async () => {
      // Insert user
      const userResult = await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age) RETURNING id',
        { name: 'Mike Brady', email: 'mike2@example.com', age: 52 }
      )

      const userId = userResult.records![0].id

      // Insert posts for user
      await client.query('INSERT INTO posts (user_id, title, content) VALUES (:userId, :title, :content)', {
        userId,
        title: 'Post 1',
        content: 'Content 1'
      })

      await client.query('INSERT INTO posts (user_id, title, content) VALUES (:userId, :title, :content)', {
        userId,
        title: 'Post 2',
        content: 'Content 2'
      })

      // Delete user should cascade to posts
      await client.query('DELETE FROM users WHERE id = :id', { id: userId })

      const postsResult = await client.query('SELECT COUNT(*) as count FROM posts WHERE user_id = :userId', { userId })

      expect(postsResult.records![0].count).toBe(0)
    })
  })
})
