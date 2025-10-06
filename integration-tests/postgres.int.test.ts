import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { RDSDataClient } from '@aws-sdk/client-rds-data'
import dataApiClient from '../src/index'
import type { Parameters } from '../src/types'
import {
  loadConfig,
  executeSQL,
  getSeedUsers,
  getSeedUsersBatch,
  getSeedProductsBatch,
  waitForCluster,
  postgresTables,
  type IntegrationTestConfig,
  type TestTable
} from './setup'

// Extended table schemas for testing advanced PostgreSQL types
const postgresAdvancedTables: TestTable[] = [
  {
    name: 'type_tests',
    schema: `
      CREATE TABLE IF NOT EXISTS type_tests (
        id SERIAL PRIMARY KEY,

        -- Numeric types
        smallint_col SMALLINT,
        int_col INT,
        bigint_col BIGINT,
        decimal_col DECIMAL(10, 4),
        numeric_col NUMERIC(12, 6),
        real_col REAL,
        double_col DOUBLE PRECISION,

        -- Boolean
        bool_col BOOL,

        -- String types
        char_col CHAR(10),
        varchar_col VARCHAR(255),
        text_col TEXT,

        -- Date/Time types
        date_col DATE,
        time_col TIME,
        timetz_col TIME WITH TIME ZONE,
        timestamp_col TIMESTAMP,
        timestamptz_col TIMESTAMP WITH TIME ZONE,

        -- Binary type
        bytea_col BYTEA,

        -- JSON types
        json_col JSON,
        jsonb_col JSONB,

        -- UUID type
        uuid_col UUID,

        -- Network types
        inet_col INET,
        cidr_col CIDR,
        macaddr_col MACADDR,

        -- Other types
        xml_col XML,
        money_col MONEY
      )
    `
  },
  {
    name: 'array_tests',
    schema: `
      CREATE TABLE IF NOT EXISTS array_tests (
        id SERIAL PRIMARY KEY,

        -- Integer array types
        int_array INT[],
        smallint_array SMALLINT[],
        bigint_array BIGINT[],

        -- Float array types
        real_array REAL[],
        double_array DOUBLE PRECISION[],
        numeric_array NUMERIC[],

        -- String array types
        text_array TEXT[],
        varchar_array VARCHAR[],

        -- Date/Time array types
        date_array DATE[],
        timestamp_array TIMESTAMP[],

        -- Other array types
        bool_array BOOL[],
        uuid_array UUID[],
        json_array JSON[],
        jsonb_array JSONB[]
      )
    `
  },
  {
    name: 'enum_tests',
    schema: `
      CREATE TABLE IF NOT EXISTS enum_tests (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        current_mood VARCHAR(20),
        mood_array VARCHAR(20)[]
      )
    `
  },
  {
    name: 'composite_tests',
    schema: `
      CREATE TABLE IF NOT EXISTS composite_tests (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        location VARCHAR(255)
      )
    `
  },
  {
    name: 'range_tests',
    schema: `
      CREATE TABLE IF NOT EXISTS range_tests (
        id SERIAL PRIMARY KEY,
        int_range INT4RANGE,
        bigint_range INT8RANGE,
        numeric_range NUMRANGE,
        date_range DATERANGE,
        timestamp_range TSRANGE,
        timestamptz_range TSTZRANGE
      )
    `
  }
]

const allTables = [...postgresTables, ...postgresAdvancedTables]

describe('PostgreSQL Integration Tests', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let client: ReturnType<typeof dataApiClient>

  beforeAll(async () => {
    config = loadConfig('pg')
    rdsClient = new RDSDataClient({ region: config.region })

    await waitForCluster(rdsClient, config)

    // Create all tables
    for (const table of allTables) {
      await executeSQL(rdsClient, config, table.schema)
    }

    client = dataApiClient({
      secretArn: config.secretArn,
      resourceArn: config.resourceArn,
      database: config.database,
      engine: 'pg'
    })
  }, 60000)

  afterAll(async () => {
    // Drop all tables in reverse order
    await executeSQL(rdsClient, config, 'DROP TABLE IF EXISTS range_tests CASCADE')
    await executeSQL(rdsClient, config, 'DROP TABLE IF EXISTS composite_tests CASCADE')
    await executeSQL(rdsClient, config, 'DROP TABLE IF EXISTS enum_tests CASCADE')
    await executeSQL(rdsClient, config, 'DROP TABLE IF EXISTS array_tests CASCADE')
    await executeSQL(rdsClient, config, 'DROP TABLE IF EXISTS type_tests CASCADE')

    for (const table of [...postgresTables].reverse()) {
      const sql = `DROP TABLE IF EXISTS ${table.name} CASCADE`
      await executeSQL(rdsClient, config, sql)
    }

    rdsClient.destroy()
  })

  beforeEach(async () => {
    // Truncate advanced tables
    await executeSQL(rdsClient, config, 'TRUNCATE TABLE type_tests RESTART IDENTITY CASCADE')
    await executeSQL(rdsClient, config, 'TRUNCATE TABLE array_tests RESTART IDENTITY CASCADE')
    await executeSQL(rdsClient, config, 'TRUNCATE TABLE enum_tests RESTART IDENTITY CASCADE')
    await executeSQL(rdsClient, config, 'TRUNCATE TABLE composite_tests RESTART IDENTITY CASCADE')
    await executeSQL(rdsClient, config, 'TRUNCATE TABLE range_tests RESTART IDENTITY CASCADE')

    // Truncate standard tables (except locations which has UUID)
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

      expect(result.updateResults).toBeDefined()
      expect(result.updateResults).toHaveLength(users.length)

      const selectResult = await client.query('SELECT COUNT(*) as count FROM users')
      expect(selectResult.records![0].count).toBe(users.length)
    })

    test('should perform batch UPDATE', async () => {
      const users = getSeedUsers()
      const insertedIds: number[] = []
      for (const user of users) {
        const result = await client.query(
          'INSERT INTO users (name, email, age) VALUES (:name, :email, :age) RETURNING id',
          user
        )
        insertedIds.push(result.records![0].id)
      }

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
      const users = getSeedUsers()
      const insertedIds: number[] = []
      for (const user of users) {
        const result = await client.query(
          'INSERT INTO users (name, email, age) VALUES (:name, :email, :age) RETURNING id',
          user
        )
        insertedIds.push(result.records![0].id)
      }

      const deleteIds = insertedIds.slice(0, 2).map((id) => [{ id }])
      await client.query('DELETE FROM users WHERE id = :id', deleteIds as unknown as Parameters[])

      const selectResult = await client.query('SELECT COUNT(*) as count FROM users')
      expect(selectResult.records![0].count).toBe(users.length - 2)
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

    test('should handle inline array operations', async () => {
      const result = await client.query('SELECT ARRAY[1, 2, 3, 4, 5] as numbers')

      expect(result.records![0].numbers).toBeDefined()
    })

    test('should handle JSON as composite type replacement', async () => {
      const address = {
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zip: '62701'
      }

      await client.query('INSERT INTO composite_tests (name, location) VALUES (:name, :location)', {
        name: 'HQ',
        location: JSON.stringify(address)
      })

      const result = await client.query('SELECT name, location FROM composite_tests')

      // Parse the returned JSON string and compare objects (handles key ordering differences)
      const returnedLocation = JSON.parse(result.records![0].location)
      expect(returnedLocation).toEqual(address)
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
      await expect(
        client.query('INSERT INTO posts (user_id, title, content) VALUES (:userId, :title, :content)', {
          userId: 9999,
          title: 'Invalid',
          content: 'This should fail'
        })
      ).rejects.toThrow()
    })

    test('should cascade delete with foreign keys', async () => {
      const userResult = await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age) RETURNING id',
        { name: 'Mike Brady', email: 'mike2@example.com', age: 52 }
      )

      const userId = userResult.records![0].id

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

      await client.query('DELETE FROM users WHERE id = :id', { id: userId })

      const postsResult = await client.query('SELECT COUNT(*) as count FROM posts WHERE user_id = :userId', { userId })

      expect(postsResult.records![0].count).toBe(0)
    })
  })

  describe('PostgreSQL Data Types', () => {
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

  describe('PostgreSQL Numeric Types', () => {
    test('should handle SMALLINT values', async () => {
      await client.query('INSERT INTO type_tests (smallint_col) VALUES (:value)', { value: 32767 })

      const result = await client.query('SELECT smallint_col FROM type_tests')
      expect(result.records![0].smallint_col).toBe(32767)
    })

    test('should handle INT values', async () => {
      await client.query('INSERT INTO type_tests (int_col) VALUES (:value)', { value: 2147483647 })

      const result = await client.query('SELECT int_col FROM type_tests')
      expect(result.records![0].int_col).toBe(2147483647)
    })

    test('should handle BIGINT values', async () => {
      await client.query('INSERT INTO type_tests (bigint_col) VALUES (:value)', { value: 9007199254740991 })

      const result = await client.query('SELECT bigint_col FROM type_tests')
      expect(result.records![0].bigint_col).toBe(9007199254740991)
    })

    test('should handle DECIMAL values with precision', async () => {
      await client.query('INSERT INTO type_tests (decimal_col) VALUES (:value)', { value: 123456.789 })

      const result = await client.query('SELECT decimal_col FROM type_tests')
      expect(result.records![0].decimal_col).toBe('123456.7890')
    })

    test('should handle NUMERIC values with precision', async () => {
      await client.query('INSERT INTO type_tests (numeric_col) VALUES (:value)', { value: 999999.123456 })

      const result = await client.query('SELECT numeric_col FROM type_tests')
      expect(result.records![0].numeric_col).toBe('999999.123456')
    })

    test('should handle REAL (float4) values', async () => {
      await client.query('INSERT INTO type_tests (real_col) VALUES (:value)', { value: 3.14159 })

      const result = await client.query('SELECT real_col FROM type_tests')
      expect(result.records![0].real_col).toBeCloseTo(3.14159, 4)
    })

    test('should handle DOUBLE PRECISION (float8) values', async () => {
      await client.query('INSERT INTO type_tests (double_col) VALUES (:value)', { value: 2.718281828459045 })

      const result = await client.query('SELECT double_col FROM type_tests')
      expect(result.records![0].double_col).toBeCloseTo(2.718281828459045, 10)
    })
  })

  describe('PostgreSQL String Types', () => {
    test('should handle VARCHAR values', async () => {
      await client.query('INSERT INTO type_tests (varchar_col) VALUES (:value)', { value: 'This is a varchar string' })

      const result = await client.query('SELECT varchar_col FROM type_tests')
      expect(result.records![0].varchar_col).toBe('This is a varchar string')
    })

    test('should handle CHAR values', async () => {
      await client.query('INSERT INTO type_tests (char_col) VALUES (:value)', { value: 'CHAR' })

      const result = await client.query('SELECT char_col FROM type_tests')
      expect(result.records![0].char_col.trim()).toBe('CHAR')
    })

    test('should handle TEXT values', async () => {
      const longText = 'A'.repeat(100000)
      await client.query('INSERT INTO type_tests (text_col) VALUES (:value)', { value: longText })

      const result = await client.query('SELECT text_col FROM type_tests')
      expect(result.records![0].text_col).toBe(longText)
    })

    test('should handle Unicode strings', async () => {
      const unicodeText = 'Hello 世界 🌍 Привет مرحبا'
      await client.query('INSERT INTO type_tests (text_col) VALUES (:value)', { value: unicodeText })

      const result = await client.query('SELECT text_col FROM type_tests')
      expect(result.records![0].text_col).toBe(unicodeText)
    })
  })

  describe('PostgreSQL Boolean Type', () => {
    test('should handle TRUE boolean values', async () => {
      await client.query('INSERT INTO type_tests (bool_col) VALUES (:value)', { value: true })

      const result = await client.query('SELECT bool_col FROM type_tests')
      expect(result.records![0].bool_col).toBe(true)
    })

    test('should handle FALSE boolean values', async () => {
      await client.query('INSERT INTO type_tests (bool_col) VALUES (:value)', { value: false })

      const result = await client.query('SELECT bool_col FROM type_tests')
      expect(result.records![0].bool_col).toBe(false)
    })
  })

  describe('PostgreSQL Date and Time Types', () => {
    test('should handle DATE values', async () => {
      await client.query('INSERT INTO type_tests (date_col) VALUES (:value)', { value: '2024-12-25' })

      const result = await client.query('SELECT date_col FROM type_tests')
      expect(result.records![0].date_col).toBeDefined()
    })

    test('should handle TIME values', async () => {
      await client.query('INSERT INTO type_tests (time_col) VALUES (:value)', { value: '14:30:45' })

      const result = await client.query('SELECT time_col FROM type_tests')
      expect(result.records![0].time_col).toBeDefined()
    })

    test('should handle TIMESTAMP values', async () => {
      const timestamp = new Date('2024-12-25T14:30:45.123Z')
      await client.query('INSERT INTO type_tests (timestamp_col) VALUES (:value)', { value: timestamp })

      const result = await client.query('SELECT timestamp_col FROM type_tests')
      expect(result.records![0].timestamp_col).toBeDefined()
    })

    test('should handle TIMESTAMP WITH TIME ZONE values', async () => {
      const timestamptz = new Date('2024-12-25T14:30:45.123Z')
      await client.query('INSERT INTO type_tests (timestamptz_col) VALUES (:value)', { value: timestamptz })

      const result = await client.query('SELECT timestamptz_col FROM type_tests')
      expect(result.records![0].timestamptz_col).toBeDefined()
    })
  })

  describe('PostgreSQL Binary Type (BYTEA)', () => {
    test('should handle BYTEA values with Buffer', async () => {
      const binaryData = Buffer.from('Binary data content', 'utf-8')
      await client.query('INSERT INTO type_tests (bytea_col) VALUES (:value)', { value: binaryData })

      const result = await client.query('SELECT bytea_col FROM type_tests')
      expect(Buffer.isBuffer(result.records![0].bytea_col)).toBe(true)
      expect(result.records![0].bytea_col.toString('utf-8')).toBe('Binary data content')
    })

    test('should handle large BYTEA values', async () => {
      const largeData = Buffer.alloc(1024 * 500)
      largeData.fill('X')

      await client.query('INSERT INTO type_tests (bytea_col) VALUES (:value)', { value: largeData })

      const result = await client.query('SELECT bytea_col FROM type_tests')
      expect(Buffer.isBuffer(result.records![0].bytea_col)).toBe(true)
      expect(result.records![0].bytea_col.length).toBe(1024 * 500)
    })
  })

  describe('PostgreSQL JSON and JSONB Types', () => {
    test('should handle JSON values', async () => {
      const jsonData = { name: 'Alice', age: 30, active: true }
      await client.query('INSERT INTO type_tests (json_col) VALUES (:value::json)', { value: JSON.stringify(jsonData) })

      const result = await client.query('SELECT json_col FROM type_tests')
      const parsed = JSON.parse(result.records![0].json_col)
      expect(parsed).toEqual(jsonData)
    })

    test('should handle JSONB values', async () => {
      const jsonbData = { name: 'Bob', tags: ['admin', 'verified'], score: 95.5 }
      await client.query('INSERT INTO type_tests (jsonb_col) VALUES (:value::jsonb)', {
        value: JSON.stringify(jsonbData)
      })

      const result = await client.query('SELECT jsonb_col FROM type_tests')
      const parsed = JSON.parse(result.records![0].jsonb_col)
      expect(parsed).toEqual(jsonbData)
    })

    test('should handle nested JSON structures', async () => {
      const complexJson = {
        user: {
          id: 1,
          profile: {
            name: 'Charlie',
            settings: {
              theme: 'dark',
              notifications: true
            }
          }
        },
        metadata: {
          created: '2024-01-01',
          tags: ['premium', 'active']
        }
      }

      await client.query('INSERT INTO type_tests (jsonb_col) VALUES (:value::jsonb)', {
        value: JSON.stringify(complexJson)
      })

      const result = await client.query('SELECT jsonb_col FROM type_tests')
      const parsed = JSON.parse(result.records![0].jsonb_col)
      expect(parsed).toEqual(complexJson)
    })
  })

  describe('PostgreSQL UUID Type', () => {
    test('should handle UUID values with inline casting', async () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000'
      await client.query('INSERT INTO type_tests (uuid_col) VALUES (:value::uuid)', { value: uuid })

      const result = await client.query('SELECT uuid_col FROM type_tests')
      expect(result.records![0].uuid_col).toBe(uuid)
    })

    test('should handle UUID values with explicit cast parameter', async () => {
      const uuid = '660e8400-e29b-41d4-a716-446655440001'
      await client.query('INSERT INTO type_tests (uuid_col) VALUES (:value)', [
        { name: 'value', value: uuid, cast: 'uuid' }
      ])

      const result = await client.query('SELECT uuid_col FROM type_tests')
      expect(result.records![0].uuid_col).toBe(uuid)
    })

    test('should handle UUID generation with gen_random_uuid()', async () => {
      await client.query('INSERT INTO type_tests (uuid_col) VALUES (gen_random_uuid())')

      const result = await client.query('SELECT uuid_col FROM type_tests')
      expect(result.records![0].uuid_col).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    })
  })

  describe('PostgreSQL Network Types', () => {
    test('should handle INET values', async () => {
      await client.query('INSERT INTO type_tests (inet_col) VALUES (:value::inet)', { value: '192.168.1.1' })

      const result = await client.query('SELECT inet_col FROM type_tests')
      expect(result.records![0].inet_col).toBeDefined()
    })

    test('should handle INET with CIDR notation', async () => {
      await client.query('INSERT INTO type_tests (inet_col) VALUES (:value::inet)', { value: '192.168.1.0/24' })

      const result = await client.query('SELECT inet_col FROM type_tests')
      expect(result.records![0].inet_col).toBeDefined()
    })

    test('should handle CIDR values', async () => {
      await client.query('INSERT INTO type_tests (cidr_col) VALUES (:value::cidr)', { value: '10.0.0.0/8' })

      const result = await client.query('SELECT cidr_col FROM type_tests')
      expect(result.records![0].cidr_col).toBeDefined()
    })
  })

  describe('PostgreSQL Range Types', () => {
    test('should handle INT4RANGE values', async () => {
      await client.query('INSERT INTO range_tests (int_range) VALUES (:range::INT4RANGE)', { range: '[1,10)' })

      const result = await client.query('SELECT int_range FROM range_tests')
      expect(result.records![0].int_range).toBeDefined()
    })

    test('should handle NUMRANGE values', async () => {
      await client.query('INSERT INTO range_tests (numeric_range) VALUES (:range::NUMRANGE)', { range: '[0.0,1.0)' })

      const result = await client.query('SELECT numeric_range FROM range_tests')
      expect(result.records![0].numeric_range).toBeDefined()
    })

    test('should handle unbounded ranges', async () => {
      await client.query('INSERT INTO range_tests (int_range) VALUES (:range::INT4RANGE)', { range: '[1,)' })

      const result = await client.query('SELECT int_range FROM range_tests')
      expect(result.records![0].int_range).toBeDefined()
    })
  })

  describe('PostgreSQL Enum-like String Arrays', () => {
    test('should handle string-based enum values', async () => {
      await client.query('INSERT INTO enum_tests (name, current_mood) VALUES (:name, :mood)', {
        name: 'Alice',
        mood: 'happy'
      })

      const result = await client.query('SELECT current_mood FROM enum_tests WHERE name = :name', { name: 'Alice' })
      expect(result.records![0].current_mood).toBe('happy')
    })

    test('should handle all enum string options', async () => {
      const moods = ['sad', 'ok', 'happy']

      for (const mood of moods) {
        await client.query('INSERT INTO enum_tests (name, current_mood) VALUES (:name, :mood)', {
          name: `Person ${mood}`,
          mood
        })
      }

      const result = await client.query('SELECT current_mood FROM enum_tests ORDER BY id')
      expect(result.records![0].current_mood).toBe('sad')
      expect(result.records![1].current_mood).toBe('ok')
      expect(result.records![2].current_mood).toBe('happy')
    })
  })

  describe('PostgreSQL Type Combinations', () => {
    test('should handle multiple advanced types in single INSERT', async () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000'
      const params = {
        smallint_col: 100,
        int_col: 1000000,
        decimal_col: 999.9999,
        text_col: 'Multi-type test',
        bool_col: true,
        bytea_col: Buffer.from('Binary'),
        jsonb_col: JSON.stringify({ test: true }),
        uuid_col: uuid,
        inet_col: '192.168.1.1',
        date_col: '2024-06-15'
      }

      await client.query(
        `INSERT INTO type_tests (
          smallint_col, int_col, decimal_col, text_col, bool_col,
          bytea_col, jsonb_col, uuid_col, inet_col, date_col
        ) VALUES (
          :smallint_col, :int_col, :decimal_col, :text_col, :bool_col,
          :bytea_col, :jsonb_col, :uuid_col, :inet_col::inet, :date_col
        )`,
        params
      )

      const result = await client.query(
        `SELECT smallint_col, int_col, decimal_col, text_col, bool_col,
                bytea_col, jsonb_col, uuid_col, inet_col, date_col
         FROM type_tests`
      )
      expect(result.records).toHaveLength(1)
      expect(result.records![0].smallint_col).toBe(100)
      expect(result.records![0].bool_col).toBe(true)
      expect(result.records![0].date_col).toBeDefined()
    })
  })

  describe('PostgreSQL Type Edge Cases', () => {
    test('should handle empty string vs NULL', async () => {
      await client.query('INSERT INTO type_tests (text_col, varchar_col) VALUES (:text, :varchar)', {
        text: '',
        varchar: null
      })

      const result = await client.query('SELECT text_col, varchar_col FROM type_tests')
      expect(result.records![0].text_col).toBe('')
      expect(result.records![0].varchar_col).toBeNull()
    })

    test('should handle zero vs NULL in numeric types', async () => {
      await client.query('INSERT INTO type_tests (int_col, decimal_col) VALUES (:int, :decimal)', {
        int: 0,
        decimal: null
      })

      const result = await client.query('SELECT int_col, decimal_col FROM type_tests')
      expect(result.records![0].int_col).toBe(0)
      expect(result.records![0].decimal_col).toBeNull()
    })
  })

  describe('PostgreSQL Array Types', () => {
    test('should handle INT[] arrays - using string_to_array workaround', async () => {
      // Workaround: Pass CSV string and convert to array in SQL
      await client.query("INSERT INTO array_tests (int_array) VALUES (string_to_array(:csv, ',')::int[])", {
        csv: '1,2,3'
      })

      const result = await client.query('SELECT int_array FROM array_tests')

      expect(result.records![0].int_array).toBeDefined()
      expect(result.records![0].int_array).toEqual([1, 2, 3])
    })

    test('should handle TEXT[] arrays - using array literal syntax', async () => {
      // Workaround: Pass Postgres array literal as string and cast
      await client.query('INSERT INTO array_tests (text_array) VALUES (:literal::text[])', {
        literal: '{"admin","editor","content creator"}'
      })

      const result = await client.query('SELECT text_array FROM array_tests')

      expect(result.records![0].text_array).toBeDefined()
      expect(result.records![0].text_array).toEqual(['admin', 'editor', 'content creator'])
    })

    test('should handle TEXT[] arrays - using ARRAY constructor with parameters', async () => {
      // Workaround: Use ARRAY[] constructor with individual parameters
      await client.query('INSERT INTO array_tests (text_array) VALUES (ARRAY[:tag1, :tag2, :tag3])', {
        tag1: 'blue',
        tag2: 'sale',
        tag3: 'featured'
      })

      const result = await client.query('SELECT text_array FROM array_tests')

      expect(result.records![0].text_array).toBeDefined()
      expect(result.records![0].text_array).toEqual(['blue', 'sale', 'featured'])
    })

    test('should handle SMALLINT[] arrays', async () => {
      await client.query('INSERT INTO array_tests (smallint_array) VALUES (:value::smallint[])', {
        value: '{10,20,30}'
      })

      const result = await client.query('SELECT smallint_array FROM array_tests')
      expect(result.records![0].smallint_array).toEqual([10, 20, 30])
    })

    test('should handle BIGINT[] arrays', async () => {
      await client.query('INSERT INTO array_tests (bigint_array) VALUES (:value::bigint[])', {
        value: '{1000000,2000000}'
      })

      const result = await client.query('SELECT bigint_array FROM array_tests')
      expect(result.records![0].bigint_array).toEqual([1000000, 2000000])
    })

    // TODO: Fix empty array handling (investigate further)
    test.fails('should handle empty integer arrays', async () => {
      await client.query('INSERT INTO array_tests (int_array) VALUES (:value::int[])', { value: '{}' })

      const result = await client.query('SELECT int_array FROM array_tests')
      expect(result.records![0].int_array).toEqual([])
    })

    test('should handle REAL[] arrays', async () => {
      await client.query('INSERT INTO array_tests (real_array) VALUES (:value::real[])', {
        value: '{3.14,2.71}'
      })

      const result = await client.query('SELECT real_array FROM array_tests')
      expect(result.records![0].real_array).toEqual([3.14, 2.71])
    })

    test('should handle DOUBLE PRECISION[] arrays', async () => {
      await client.query('INSERT INTO array_tests (double_array) VALUES (:value::double precision[])', {
        value: '{1.414213,1.73205}'
      })

      const result = await client.query('SELECT double_array FROM array_tests')
      expect(result.records![0].double_array[0]).toBeCloseTo(1.414213, 5)
      expect(result.records![0].double_array[1]).toBeCloseTo(1.73205, 5)
    })

    test('should handle VARCHAR[] arrays', async () => {
      await client.query('INSERT INTO array_tests (varchar_array) VALUES (:value::varchar[])', {
        value: '{"alpha","beta","gamma"}'
      })

      const result = await client.query('SELECT varchar_array FROM array_tests')
      expect(result.records![0].varchar_array).toEqual(['alpha', 'beta', 'gamma'])
    })

    // TODO: Fix special character handling in arrays
    test.fails('should handle TEXT[] with special characters', async () => {
      await client.query('INSERT INTO array_tests (text_array) VALUES (:value::text[])', {
        value: '{"Hello \\"World\\"","It\'s working","Line 1\\nLine 2"}'
      })

      const result = await client.query('SELECT text_array FROM array_tests')
      expect(result.records![0].text_array).toEqual(['Hello "World"', "It's working", 'Line 1\nLine 2'])
    })

    test('should handle DATE[] arrays', async () => {
      await client.query('INSERT INTO array_tests (date_array) VALUES (:value::date[])', {
        value: '{"2024-01-01","2024-06-15","2024-12-31"}'
      })

      const result = await client.query('SELECT date_array FROM array_tests')
      expect(result.records![0].date_array).toHaveLength(3)
      expect(result.records![0].date_array).toContain('2024-01-01')
    })

    test('should handle TIMESTAMP[] arrays', async () => {
      await client.query('INSERT INTO array_tests (timestamp_array) VALUES (:value::timestamp[])', {
        value: '{"2024-06-15 10:30:00","2024-12-25 14:30:45"}'
      })

      const result = await client.query('SELECT timestamp_array FROM array_tests')
      expect(result.records![0].timestamp_array).toHaveLength(2)
    })

    test('should handle BOOL[] arrays', async () => {
      await client.query('INSERT INTO array_tests (bool_array) VALUES (:value::bool[])', {
        value: '{true,false,true}'
      })

      const result = await client.query('SELECT bool_array FROM array_tests')
      expect(result.records![0].bool_array).toEqual([true, false, true])
    })

    test('should handle UUID[] arrays', async () => {
      await client.query('INSERT INTO array_tests (uuid_array) VALUES (:value::uuid[])', {
        value: '{"550e8400-e29b-41d4-a716-446655440000","660e8400-e29b-41d4-a716-446655440001"}'
      })

      const result = await client.query('SELECT uuid_array FROM array_tests')
      expect(result.records![0].uuid_array).toEqual([
        '550e8400-e29b-41d4-a716-446655440000',
        '660e8400-e29b-41d4-a716-446655440001'
      ])
    })

    test('should handle JSON[] arrays', async () => {
      await client.query('INSERT INTO array_tests (json_array) VALUES (:value::json[])', {
        value: `{"{\\"key\\":\\"value1\\"}","{\\"key\\":\\"value2\\"}"}`
      })

      const result = await client.query('SELECT json_array FROM array_tests')
      expect(result.records![0].json_array).toHaveLength(2)
    })

    test('should handle JSONB[] arrays', async () => {
      await client.query('INSERT INTO array_tests (jsonb_array) VALUES (:value::jsonb[])', {
        value: `{"{\\"name\\":\\"Alice\\",\\"age\\":30}","{\\"name\\":\\"Bob\\",\\"age\\":25}"}`
      })

      const result = await client.query('SELECT jsonb_array FROM array_tests')
      expect(result.records![0].jsonb_array).toHaveLength(2)
    })

    // TODO: Fix NULL handling in arrays
    test.fails('should handle NULL values in integer arrays', async () => {
      await client.query('INSERT INTO array_tests (int_array) VALUES (:value::int[])', {
        value: '{1,NULL,3}'
      })

      const result = await client.query('SELECT int_array FROM array_tests')
      expect(result.records![0].int_array).toEqual([1, null, 3])
    })

    // TODO: Fix NULL handling in arrays
    test.fails('should handle NULL values in text arrays', async () => {
      await client.query('INSERT INTO array_tests (text_array) VALUES (:value::text[])', {
        value: '{"first",NULL,"third"}'
      })

      const result = await client.query('SELECT text_array FROM array_tests')
      expect(result.records![0].text_array).toEqual(['first', null, 'third'])
    })

    test('should handle string arrays (enum-like)', async () => {
      await client.query('INSERT INTO enum_tests (name, mood_array) VALUES (:name, :moods::varchar[])', {
        name: 'Bob',
        moods: '{"happy","ok","sad"}'
      })

      const result = await client.query('SELECT mood_array FROM enum_tests WHERE name = :name', { name: 'Bob' })
      expect(result.records![0].mood_array).toEqual(['happy', 'ok', 'sad'])
    })

    test('should handle batch operations with arrays', async () => {
      const batch = [[{ int_array: '{1,2}' }], [{ int_array: '{3,4}' }], [{ int_array: '{5,6}' }]]

      await client.query(
        'INSERT INTO array_tests (int_array) VALUES (:int_array::int[])',
        batch as unknown as Parameters[]
      )

      const result = await client.query('SELECT int_array FROM array_tests ORDER BY id')
      expect(result.records).toHaveLength(3)
      expect(result.records![0].int_array).toEqual([1, 2])
      expect(result.records![1].int_array).toEqual([3, 4])
      expect(result.records![2].int_array).toEqual([5, 6])
    })

    test('should handle very large arrays', async () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => i).join(',')
      await client.query('INSERT INTO array_tests (int_array) VALUES (:value::int[])', { value: `{${largeArray}}` })

      const result = await client.query('SELECT array_length(int_array, 1) as len FROM array_tests')
      expect(result.records![0].len).toBe(1000)
    })

    test('should handle NUMERIC[] arrays', async () => {
      await client.query('INSERT INTO array_tests (numeric_array) VALUES (ARRAY[123.45, 678.90]::NUMERIC[])')

      const result = await client.query('SELECT numeric_array FROM array_tests')
      expect(result.records![0].numeric_array).toBeDefined()
    })

    test('should handle NULL array column', async () => {
      await client.query('INSERT INTO array_tests (int_array) VALUES (:value)', { value: null })

      const result = await client.query('SELECT int_array FROM array_tests')
      expect(result.records![0].int_array).toBeNull()
    })
  })

  // ========================================
  // Known Limitations and Failing Tests
  // ========================================
  // These tests document Data API limitations and unsupported features

  describe('Known Data API Limitations', () => {
    describe('Network Types - MACADDR', () => {
      test.fails('should handle MACADDR values - UNSUPPORTED by Data API', async () => {
        // MACADDR type is not supported by the RDS Data API
        await client.query('INSERT INTO type_tests (macaddr_col) VALUES (:value::macaddr)', {
          value: '08:00:2b:01:02:03'
        })

        const result = await client.query('SELECT macaddr_col FROM type_tests')
        expect(result.records![0].macaddr_col).toBeDefined()
      })
    })

    describe('Array Types - Edge Cases', () => {
      test.fails('should handle empty integer arrays', async () => {
        await client.query('INSERT INTO array_tests (int_array) VALUES (:value::int[])', { value: '{}' })

        const result = await client.query('SELECT int_array FROM array_tests')
        expect(result.records![0].int_array).toEqual([])
      })

      test.fails('should handle TEXT[] with special characters', async () => {
        await client.query('INSERT INTO array_tests (text_array) VALUES (:value::text[])', {
          value: '{"Hello \\"World\\"","It\'s working","Line 1\\nLine 2"}'
        })

        const result = await client.query('SELECT text_array FROM array_tests')
        expect(result.records![0].text_array).toEqual(['Hello "World"', "It's working", 'Line 1\nLine 2'])
      })

      test.fails('should handle NULL values in integer arrays', async () => {
        await client.query('INSERT INTO array_tests (int_array) VALUES (:value::int[])', {
          value: '{1,NULL,3}'
        })

        const result = await client.query('SELECT int_array FROM array_tests')
        expect(result.records![0].int_array).toEqual([1, null, 3])
      })

      test.fails('should handle NULL values in text arrays', async () => {
        await client.query('INSERT INTO array_tests (text_array) VALUES (:value::text[])', {
          value: '{"first",NULL,"third"}'
        })

        const result = await client.query('SELECT text_array FROM array_tests')
        expect(result.records![0].text_array).toEqual(['first', null, 'third'])
      })

      test.fails('should handle 2D integer arrays - UNSUPPORTED by Data API', async () => {
        await client.query("INSERT INTO array_tests (int_array) VALUES ('{{1,2,3},{4,5,6}}'::INT[])")

        const result = await client.query('SELECT int_array FROM array_tests')
        expect(result.records![0].int_array).toBeDefined()
      })

      test.fails('should handle 2D text arrays - UNSUPPORTED by Data API', async () => {
        await client.query('INSERT INTO array_tests (text_array) VALUES (\'{{"a","b"},{"c","d"}}\'::TEXT[])')

        const result = await client.query('SELECT text_array FROM array_tests')
        expect(result.records![0].text_array).toBeDefined()
      })
    })

    describe('Range Types', () => {
      test.fails('should handle INT8RANGE values - Cannot cast jsonb to int8range', async () => {
        await client.query('INSERT INTO range_tests (bigint_range) VALUES (:range::INT8RANGE)', {
          range: '[1000000,2000000]'
        })

        const result = await client.query('SELECT bigint_range FROM range_tests')
        expect(result.records![0].bigint_range).toBeDefined()
      })

      test.fails('should handle DATERANGE values - UNSUPPORTED by Data API', async () => {
        await client.query('INSERT INTO range_tests (date_range) VALUES (:range::DATERANGE)', {
          range: '[2024-01-01,2024-12-31]'
        })

        const result = await client.query('SELECT date_range FROM range_tests')
        expect(result.records![0].date_range).toBeDefined()
      })

      test.fails('should handle TSRANGE values - UNSUPPORTED by Data API', async () => {
        await client.query('INSERT INTO range_tests (timestamp_range) VALUES (:range::TSRANGE)', {
          range: '[2024-01-01 00:00:00,2024-12-31 23:59:59]'
        })

        const result = await client.query('SELECT timestamp_range FROM range_tests')
        expect(result.records![0].timestamp_range).toBeDefined()
      })
    })
  })
})
