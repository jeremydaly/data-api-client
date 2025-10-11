import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { RDSDataClient } from '@aws-sdk/client-rds-data'
import dataApiClient from '../src/index'
import type { Parameters } from '../src/types'
import {
  loadConfig,
  executeSQL,
  getSeedUsersBatch,
  getSeedProductsBatch,
  mysqlTables,
  type IntegrationTestConfig,
  type TestTable
} from './setup'

// Extended table schemas for testing advanced MySQL types
const mysqlAdvancedTables: TestTable[] = [
  {
    name: 'type_tests',
    schema: `
      CREATE TABLE IF NOT EXISTS type_tests (
        id INT AUTO_INCREMENT PRIMARY KEY,

        -- Numeric types
        tinyint_col TINYINT,
        tinyint1_col TINYINT(1),
        bool_col BOOL,
        boolean_col BOOLEAN,
        smallint_col SMALLINT,
        smallint_unsigned_col SMALLINT UNSIGNED,
        smallint_signed_col SMALLINT SIGNED,
        mediumint_col MEDIUMINT,
        mediumint_unsigned_col MEDIUMINT UNSIGNED,
        mediumint_signed_col MEDIUMINT SIGNED,
        int_col INT,
        int_unsigned_col INT UNSIGNED,
        int_signed_col INT SIGNED,
        bigint_col BIGINT,
        bigint_unsigned_col BIGINT UNSIGNED,
        bigint_signed_col BIGINT SIGNED,

        -- Floating point types
        float_col FLOAT,
        double_col DOUBLE,
        decimal_col DECIMAL(10, 4),

        -- String types
        varchar_col VARCHAR(255),
        char_col CHAR(10),
        text_col TEXT,
        mediumtext_col MEDIUMTEXT,
        longtext_col LONGTEXT,

        -- Binary types
        varbinary_col VARBINARY(255),
        binary_col BINARY(16),
        blob_col BLOB,
        mediumblob_col MEDIUMBLOB,
        longblob_col LONGBLOB,

        -- Date/Time types
        date_col DATE,
        time_col TIME,
        datetime_col DATETIME,
        timestamp_col TIMESTAMP NULL DEFAULT NULL,
        year_col YEAR,

        -- Other types
        json_col JSON,
        bit_col BIT(8),
        enum_col ENUM('small', 'medium', 'large', 'xlarge')
      )
    `
  },
  {
    name: 'blob_tests',
    schema: `
      CREATE TABLE IF NOT EXISTS blob_tests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255),
        tiny_data TINYBLOB,
        normal_data BLOB,
        medium_data MEDIUMBLOB,
        long_data LONGBLOB,
        binary_data BINARY(32),
        varbinary_data VARBINARY(255)
      )
    `
  }
]

const allTables = [...mysqlTables, ...mysqlAdvancedTables]

describe('MySQL Integration Tests', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let client: ReturnType<typeof dataApiClient>

  beforeAll(async () => {
    config = loadConfig('mysql')
    rdsClient = new RDSDataClient({ region: config.region })

    // await waitForCluster(rdsClient, config) // No longer needed - automatic retry logic

    // Create all tables
    for (const table of allTables) {
      await executeSQL(rdsClient, config, table.schema)
    }

    client = dataApiClient({
      secretArn: config.secretArn,
      resourceArn: config.resourceArn,
      database: config.database,
      engine: 'mysql'
    })
  }, 60000)

  afterAll(async () => {
    // Drop all tables
    for (const table of [...allTables].reverse()) {
      await executeSQL(rdsClient, config, `DROP TABLE IF EXISTS ${table.name}`)
    }
    rdsClient.destroy()
  })

  beforeEach(async () => {
    // Truncate all tables
    for (const table of [...allTables].reverse()) {
      await executeSQL(rdsClient, config, `DELETE FROM ${table.name}`)
    }
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

      expect(result.updateResults).toBeDefined()
      expect(result.updateResults).toHaveLength(users.length)

      const selectResult = await client.query('SELECT COUNT(*) as count FROM users')
      expect(selectResult.records![0].count).toBe(users.length)
    })

    test('should perform batch UPDATE', async () => {
      const users = getSeedUsersBatch()
      await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
        users as unknown as Parameters[]
      )

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
      const users = getSeedUsersBatch()
      await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
        users as unknown as Parameters[]
      )

      const deleteEmails = users.slice(0, 2).map((user) => ([{ email: user[0].email }]))
      await client.query('DELETE FROM users WHERE email = :email', deleteEmails as unknown as Parameters[])

      const selectResult = await client.query('SELECT COUNT(*) as count FROM users')
      expect(selectResult.records![0].count).toBe(users.length - 2)
    })

    test('should handle binary data with batch operations', async () => {
      const batch = [
        [{ name: 'Binary 1', normal_data: Buffer.from('Data 1') }],
        [{ name: 'Binary 2', normal_data: Buffer.from('Data 2') }],
        [{ name: 'Binary 3', normal_data: Buffer.from('Data 3') }]
      ]

      await client.query(
        'INSERT INTO blob_tests (name, normal_data) VALUES (:name, :normal_data)',
        batch as unknown as Parameters[]
      )

      const result = await client.query('SELECT name, normal_data FROM blob_tests ORDER BY id')
      expect(result.records).toHaveLength(3)
      expect(result.records![0].normal_data.toString()).toBe('Data 1')
      expect(result.records![1].normal_data.toString()).toBe('Data 2')
      expect(result.records![2].normal_data.toString()).toBe('Data 3')
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
      await expect(
        client.query(
          'INSERT INTO posts (user_id, title, content) VALUES (:userId, :title, :content)',
          { userId: 9999, title: 'Invalid', content: 'This should fail' }
        )
      ).rejects.toThrow()
    })

    test('should cascade delete with foreign keys', async () => {
      const userResult = await client.query(
        'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
        { name: 'Mike Brady', email: 'mike2@example.com', age: 52 }
      )

      const userId = userResult.insertId!
      expect(userId).toBeDefined()

      await client.query(
        'INSERT INTO posts (user_id, title, content) VALUES (:userId, :title, :content)',
        { userId, title: 'Post 1', content: 'Content 1' }
      )

      await client.query(
        'INSERT INTO posts (user_id, title, content) VALUES (:userId, :title, :content)',
        { userId, title: 'Post 2', content: 'Content 2' }
      )

      await client.query('DELETE FROM users WHERE id = :id', { id: userId })

      const postsResult = await client.query(
        'SELECT COUNT(*) as count FROM posts WHERE user_id = :userId',
        { userId }
      )

      expect(postsResult.records![0].count).toBe(0)
    })
  })

  describe('MySQL Numeric Types', () => {
    test('should handle TINYINT values', async () => {
      await client.query(
        'INSERT INTO type_tests (tinyint_col) VALUES (:value)',
        { value: 127 }
      )

      const result = await client.query('SELECT tinyint_col FROM type_tests')
      expect(result.records![0].tinyint_col).toBe(127)
    })

    test('should handle TINYINT negative values', async () => {
      await client.query(
        'INSERT INTO type_tests (tinyint_col) VALUES (:value)',
        { value: -128 }
      )

      const result = await client.query('SELECT tinyint_col FROM type_tests')
      expect(result.records![0].tinyint_col).toBe(-128)
    })

    test('should handle TINYINT(1) as boolean-like with 0 and 1', async () => {
      await client.query(
        'INSERT INTO type_tests (tinyint1_col) VALUES (:value)',
        { value: 1 }
      )

      const result = await client.query('SELECT tinyint1_col FROM type_tests')
      // MySQL TINYINT(1) is automatically converted to boolean by the Data API
      expect(result.records![0].tinyint1_col).toBe(true)

      await executeSQL(rdsClient, config, 'DELETE FROM type_tests')

      await client.query(
        'INSERT INTO type_tests (tinyint1_col) VALUES (:value)',
        { value: 0 }
      )

      const result2 = await client.query('SELECT tinyint1_col FROM type_tests')
      // MySQL TINYINT(1) is automatically converted to boolean by the Data API
      expect(result2.records![0].tinyint1_col).toBe(false)
    })

    test('should handle BOOL values', async () => {
      await client.query(
        'INSERT INTO type_tests (bool_col) VALUES (:value)',
        { value: true }
      )

      const result = await client.query('SELECT bool_col FROM type_tests')
      expect(result.records![0].bool_col).toBe(true)

      await executeSQL(rdsClient, config, 'DELETE FROM type_tests')

      await client.query(
        'INSERT INTO type_tests (bool_col) VALUES (:value)',
        { value: false }
      )

      const result2 = await client.query('SELECT bool_col FROM type_tests')
      expect(result2.records![0].bool_col).toBe(false)
    })

    test('should handle BOOLEAN values', async () => {
      await client.query(
        'INSERT INTO type_tests (boolean_col) VALUES (:value)',
        { value: true }
      )

      const result = await client.query('SELECT boolean_col FROM type_tests')
      expect(result.records![0].boolean_col).toBe(true)

      await executeSQL(rdsClient, config, 'DELETE FROM type_tests')

      await client.query(
        'INSERT INTO type_tests (boolean_col) VALUES (:value)',
        { value: false }
      )

      const result2 = await client.query('SELECT boolean_col FROM type_tests')
      expect(result2.records![0].boolean_col).toBe(false)
    })

    test('should handle SMALLINT values', async () => {
      await client.query(
        'INSERT INTO type_tests (smallint_col) VALUES (:value)',
        { value: 32767 }
      )

      const result = await client.query('SELECT smallint_col FROM type_tests')
      expect(result.records![0].smallint_col).toBe(32767)
    })

    test('should handle SMALLINT UNSIGNED values', async () => {
      await client.query(
        'INSERT INTO type_tests (smallint_unsigned_col) VALUES (:value)',
        { value: 65535 }
      )

      const result = await client.query('SELECT smallint_unsigned_col FROM type_tests')
      expect(result.records![0].smallint_unsigned_col).toBe(65535)
    })

    test('should handle SMALLINT SIGNED values', async () => {
      await client.query(
        'INSERT INTO type_tests (smallint_signed_col) VALUES (:value)',
        { value: -32768 }
      )

      const result = await client.query('SELECT smallint_signed_col FROM type_tests')
      expect(result.records![0].smallint_signed_col).toBe(-32768)
    })

    test('should handle MEDIUMINT values', async () => {
      await client.query(
        'INSERT INTO type_tests (mediumint_col) VALUES (:value)',
        { value: 8388607 }
      )

      const result = await client.query('SELECT mediumint_col FROM type_tests')
      expect(result.records![0].mediumint_col).toBe(8388607)
    })

    test('should handle MEDIUMINT UNSIGNED values', async () => {
      await client.query(
        'INSERT INTO type_tests (mediumint_unsigned_col) VALUES (:value)',
        { value: 16777215 }
      )

      const result = await client.query('SELECT mediumint_unsigned_col FROM type_tests')
      expect(result.records![0].mediumint_unsigned_col).toBe(16777215)
    })

    test('should handle MEDIUMINT SIGNED values', async () => {
      await client.query(
        'INSERT INTO type_tests (mediumint_signed_col) VALUES (:value)',
        { value: -8388608 }
      )

      const result = await client.query('SELECT mediumint_signed_col FROM type_tests')
      expect(result.records![0].mediumint_signed_col).toBe(-8388608)
    })

    test('should handle INT UNSIGNED values', async () => {
      await client.query(
        'INSERT INTO type_tests (int_unsigned_col) VALUES (:value)',
        { value: 4294967295 }
      )

      const result = await client.query('SELECT int_unsigned_col FROM type_tests')
      expect(result.records![0].int_unsigned_col).toBe(4294967295)
    })

    test('should handle INT SIGNED values', async () => {
      await client.query(
        'INSERT INTO type_tests (int_signed_col) VALUES (:value)',
        { value: -2147483648 }
      )

      const result = await client.query('SELECT int_signed_col FROM type_tests')
      expect(result.records![0].int_signed_col).toBe(-2147483648)
    })

    test('should handle BIGINT values', async () => {
      await client.query(
        'INSERT INTO type_tests (bigint_col) VALUES (:value)',
        { value: 9007199254740991 }
      )

      const result = await client.query('SELECT bigint_col FROM type_tests')
      expect(result.records![0].bigint_col).toBe(9007199254740991)
    })

    test('should handle BIGINT UNSIGNED values', async () => {
      await client.query(
        'INSERT INTO type_tests (bigint_unsigned_col) VALUES (:value)',
        { value: 9007199254740991 }
      )

      const result = await client.query('SELECT bigint_unsigned_col FROM type_tests')
      expect(result.records![0].bigint_unsigned_col).toBe(9007199254740991)
    })

    test('should handle BIGINT SIGNED negative values', async () => {
      await client.query(
        'INSERT INTO type_tests (bigint_signed_col) VALUES (:value)',
        { value: -9007199254740991 }
      )

      const result = await client.query('SELECT bigint_signed_col FROM type_tests')
      expect(result.records![0].bigint_signed_col).toBe(-9007199254740991)
    })

    test('should handle FLOAT values', async () => {
      await client.query(
        'INSERT INTO type_tests (float_col) VALUES (:value)',
        { value: 3.14159 }
      )

      const result = await client.query('SELECT float_col FROM type_tests')
      expect(result.records![0].float_col).toBeCloseTo(3.14159, 4)
    })

    test('should handle DOUBLE values', async () => {
      await client.query(
        'INSERT INTO type_tests (double_col) VALUES (:value)',
        { value: 2.718281828459045 }
      )

      const result = await client.query('SELECT double_col FROM type_tests')
      expect(result.records![0].double_col).toBeCloseTo(2.718281828459045, 10)
    })

    test('should handle DECIMAL values with precision', async () => {
      await client.query(
        'INSERT INTO type_tests (decimal_col) VALUES (:value)',
        { value: 123456.7890 }
      )

      const result = await client.query('SELECT decimal_col FROM type_tests')
      expect(result.records![0].decimal_col).toBe('123456.7890')
    })
  })

  describe('MySQL String Types', () => {
    test('should handle VARCHAR values', async () => {
      await client.query(
        'INSERT INTO type_tests (varchar_col) VALUES (:value)',
        { value: 'This is a varchar string with 255 character limit' }
      )

      const result = await client.query('SELECT varchar_col FROM type_tests')
      expect(result.records![0].varchar_col).toBe('This is a varchar string with 255 character limit')
    })

    test('should handle CHAR values with padding', async () => {
      await client.query(
        'INSERT INTO type_tests (char_col) VALUES (:value)',
        { value: 'CHAR' }
      )

      const result = await client.query('SELECT char_col FROM type_tests')
      expect(result.records![0].char_col).toBe('CHAR')
    })

    test('should handle TEXT values', async () => {
      const longText = 'A'.repeat(10000)
      await client.query(
        'INSERT INTO type_tests (text_col) VALUES (:value)',
        { value: longText }
      )

      const result = await client.query('SELECT text_col FROM type_tests')
      expect(result.records![0].text_col).toBe(longText)
    })

    test('should handle MEDIUMTEXT values', async () => {
      const mediumText = 'B'.repeat(50000)
      await client.query(
        'INSERT INTO type_tests (mediumtext_col) VALUES (:value)',
        { value: mediumText }
      )

      const result = await client.query('SELECT mediumtext_col FROM type_tests')
      expect(result.records![0].mediumtext_col).toBe(mediumText)
    })

    test('should handle LONGTEXT values', async () => {
      const longText = 'C'.repeat(100000)
      await client.query(
        'INSERT INTO type_tests (longtext_col) VALUES (:value)',
        { value: longText }
      )

      const result = await client.query('SELECT longtext_col FROM type_tests')
      expect(result.records![0].longtext_col).toBe(longText)
    })

    test('should handle special characters in strings', async () => {
      const specialText = "String with 'quotes' and \"double quotes\" and\nnewlines\tand\ttabs"
      await client.query(
        'INSERT INTO type_tests (text_col) VALUES (:value)',
        { value: specialText }
      )

      const result = await client.query('SELECT text_col FROM type_tests')
      expect(result.records![0].text_col).toBe(specialText)
    })

    test('should handle Unicode strings', async () => {
      const unicodeText = 'Hello 世界 🌍 Привет مرحبا'
      await client.query(
        'INSERT INTO type_tests (varchar_col) VALUES (:value)',
        { value: unicodeText }
      )

      const result = await client.query('SELECT varchar_col FROM type_tests')
      expect(result.records![0].varchar_col).toBe(unicodeText)
    })
  })

  describe('MySQL Binary Types', () => {
    test('should handle BLOB values with Buffer', async () => {
      const binaryData = Buffer.from('Binary data content', 'utf-8')
      await client.query(
        'INSERT INTO type_tests (blob_col) VALUES (:value)',
        { value: binaryData }
      )

      const result = await client.query('SELECT blob_col FROM type_tests')
      expect(Buffer.isBuffer(result.records![0].blob_col)).toBe(true)
      expect(result.records![0].blob_col.toString('utf-8')).toBe('Binary data content')
    })

    test('should handle VARBINARY values', async () => {
      const varbinaryData = Buffer.from([0x48, 0x65, 0x6C, 0x6C, 0x6F])
      await client.query(
        'INSERT INTO type_tests (varbinary_col) VALUES (:value)',
        { value: varbinaryData }
      )

      const result = await client.query('SELECT varbinary_col FROM type_tests')
      expect(Buffer.isBuffer(result.records![0].varbinary_col)).toBe(true)
      expect(result.records![0].varbinary_col).toEqual(varbinaryData)
    })

    test('should handle BINARY values with fixed length', async () => {
      const binaryData = Buffer.alloc(16)
      binaryData.write('Fixed16')

      await client.query(
        'INSERT INTO type_tests (binary_col) VALUES (:value)',
        { value: binaryData }
      )

      const result = await client.query('SELECT binary_col FROM type_tests')
      expect(Buffer.isBuffer(result.records![0].binary_col)).toBe(true)
      expect(result.records![0].binary_col.length).toBe(16)
    })

    test('should handle MEDIUMBLOB values', async () => {
      const mediumBlob = Buffer.alloc(1024 * 100)
      mediumBlob.fill('M')

      await client.query(
        'INSERT INTO type_tests (mediumblob_col) VALUES (:value)',
        { value: mediumBlob }
      )

      const result = await client.query('SELECT mediumblob_col FROM type_tests')
      expect(Buffer.isBuffer(result.records![0].mediumblob_col)).toBe(true)
      expect(result.records![0].mediumblob_col.length).toBe(1024 * 100)
    })

    test('should handle LONGBLOB values', async () => {
      const longBlob = Buffer.alloc(1024 * 500)
      longBlob.fill('L')

      await client.query(
        'INSERT INTO type_tests (longblob_col) VALUES (:value)',
        { value: longBlob }
      )

      const result = await client.query('SELECT longblob_col FROM type_tests')
      expect(Buffer.isBuffer(result.records![0].longblob_col)).toBe(true)
      expect(result.records![0].longblob_col.length).toBe(1024 * 500)
    })
  })

  describe('MySQL Date and Time Types', () => {
    test('should handle DATE values', async () => {
      await client.query(
        'INSERT INTO type_tests (date_col) VALUES (:value)',
        { value: '2024-12-25' }
      )

      const result = await client.query('SELECT date_col FROM type_tests')
      expect(result.records![0].date_col).toBeDefined()
    })

    test('should handle TIME values', async () => {
      await client.query(
        'INSERT INTO type_tests (time_col) VALUES (:value)',
        { value: '14:30:45' }
      )

      const result = await client.query('SELECT time_col FROM type_tests')
      expect(result.records![0].time_col).toBeDefined()
    })

    test('should handle DATETIME values', async () => {
      const datetime = new Date('2024-12-25T14:30:45.123Z')
      await client.query(
        'INSERT INTO type_tests (datetime_col) VALUES (:value)',
        { value: datetime }
      )

      const result = await client.query('SELECT datetime_col FROM type_tests')
      expect(result.records![0].datetime_col).toBeDefined()
    })

    test('should handle TIMESTAMP values', async () => {
      const timestamp = new Date('2024-01-15T10:20:30Z')
      await client.query(
        'INSERT INTO type_tests (timestamp_col) VALUES (:value)',
        { value: timestamp }
      )

      const result = await client.query('SELECT timestamp_col FROM type_tests')
      expect(result.records![0].timestamp_col).toBeDefined()
    })

    test('should handle YEAR values', async () => {
      await client.query(
        'INSERT INTO type_tests (year_col) VALUES (:value)',
        { value: 2024 }
      )

      const result = await client.query('SELECT year_col FROM type_tests')
      expect(result.records![0].year_col).toBe(2024)
    })

    test('should handle NULL datetime values', async () => {
      await client.query(
        'INSERT INTO type_tests (timestamp_col) VALUES (:value)',
        { value: null }
      )

      const result = await client.query('SELECT timestamp_col FROM type_tests')
      expect(result.records![0].timestamp_col).toBeNull()
    })
  })

  describe('MySQL JSON Type', () => {
    test('should handle JSON object values', async () => {
      const jsonData = { name: 'John', age: 30, active: true }
      await client.query(
        'INSERT INTO type_tests (json_col) VALUES (:value)',
        { value: JSON.stringify(jsonData) }
      )

      const result = await client.query('SELECT json_col FROM type_tests')
      expect(result.records![0].json_col).toEqual(jsonData)
    })

    test('should handle JSON array values', async () => {
      const jsonArray = [1, 2, 3, 'four', { five: 5 }]
      await client.query(
        'INSERT INTO type_tests (json_col) VALUES (:value)',
        { value: JSON.stringify(jsonArray) }
      )

      const result = await client.query('SELECT json_col FROM type_tests')
      expect(result.records![0].json_col).toEqual(jsonArray)
    })

    test('should handle nested JSON structures', async () => {
      const complexJson = {
        user: {
          id: 1,
          profile: {
            name: 'Alice',
            settings: {
              theme: 'dark',
              notifications: true
            }
          }
        },
        tags: ['admin', 'verified']
      }

      await client.query(
        'INSERT INTO type_tests (json_col) VALUES (:value)',
        { value: JSON.stringify(complexJson) }
      )

      const result = await client.query('SELECT json_col FROM type_tests')
      expect(result.records![0].json_col).toEqual(complexJson)
    })

    test('should handle JSON with special characters', async () => {
      const jsonWithSpecial = {
        message: "String with 'quotes' and \"double quotes\"",
        unicode: '世界 🌍',
        escaped: 'Line 1\nLine 2\tTabbed'
      }

      await client.query(
        'INSERT INTO type_tests (json_col) VALUES (:value)',
        { value: JSON.stringify(jsonWithSpecial) }
      )

      const result = await client.query('SELECT json_col FROM type_tests')
      expect(result.records![0].json_col).toEqual(jsonWithSpecial)
    })
  })

  describe('MySQL ENUM Type', () => {
    test('should handle ENUM values', async () => {
      await client.query(
        'INSERT INTO type_tests (enum_col) VALUES (:value)',
        { value: 'medium' }
      )

      const result = await client.query('SELECT enum_col FROM type_tests')
      expect(result.records![0].enum_col).toBe('medium')
    })

    test('should handle all ENUM options', async () => {
      const enumValues = ['small', 'medium', 'large', 'xlarge']

      for (const enumValue of enumValues) {
        await executeSQL(rdsClient, config, 'DELETE FROM type_tests')
        await client.query(
          'INSERT INTO type_tests (enum_col) VALUES (:value)',
          { value: enumValue }
        )

        const result = await client.query('SELECT enum_col FROM type_tests')
        expect(result.records![0].enum_col).toBe(enumValue)
      }
    })

    test('should handle ENUM in batch operations', async () => {
      const batch = [
        [{ enum_col: 'small' }],
        [{ enum_col: 'medium' }],
        [{ enum_col: 'large' }],
        [{ enum_col: 'xlarge' }]
      ]

      await client.query(
        'INSERT INTO type_tests (enum_col) VALUES (:enum_col)',
        batch as unknown as Parameters[]
      )

      const result = await client.query('SELECT enum_col FROM type_tests ORDER BY id')
      expect(result.records![0].enum_col).toBe('small')
      expect(result.records![1].enum_col).toBe('medium')
      expect(result.records![2].enum_col).toBe('large')
      expect(result.records![3].enum_col).toBe('xlarge')
    })
  })

  describe('MySQL BIT Type', () => {
    test('should handle BIT values', async () => {
      await client.query(
        'INSERT INTO type_tests (bit_col) VALUES (:value)',
        { value: 255 }
      )

      const result = await client.query('SELECT bit_col FROM type_tests')
      expect(result.records![0].bit_col).toBeDefined()
    })

    test('should handle BIT values as binary', async () => {
      const bitValue = Buffer.from([0b10101010])
      await client.query(
        'INSERT INTO type_tests (bit_col) VALUES (:value)',
        { value: bitValue }
      )

      const result = await client.query('SELECT bit_col FROM type_tests')
      expect(result.records![0].bit_col).toBeDefined()
    })
  })

  describe('MySQL Type Combinations', () => {
    test('should handle multiple types in single INSERT', async () => {
      const params = {
        tinyint_col: 100,
        smallint_col: 20000,
        int_col: 1000000,
        float_col: 3.14,
        double_col: 2.71828,
        decimal_col: 999.9999,
        varchar_col: 'Multi-type test',
        text_col: 'Long text content',
        blob_col: Buffer.from('Binary content'),
        date_col: '2024-06-15',
        time_col: '12:30:45',
        json_col: JSON.stringify({ test: true }),
        enum_col: 'large'
      }

      await client.query(
        `INSERT INTO type_tests (
          tinyint_col, smallint_col, int_col, float_col, double_col, decimal_col,
          varchar_col, text_col, blob_col, date_col, time_col, json_col, enum_col
        ) VALUES (
          :tinyint_col, :smallint_col, :int_col, :float_col, :double_col, :decimal_col,
          :varchar_col, :text_col, :blob_col, :date_col, :time_col, :json_col, :enum_col
        )`,
        params
      )

      const result = await client.query('SELECT * FROM type_tests')
      expect(result.records).toHaveLength(1)
      expect(result.records![0].tinyint_col).toBe(100)
      expect(result.records![0].varchar_col).toBe('Multi-type test')
      expect(result.records![0].enum_col).toBe('large')
    })

    test('should handle NULL values across different types', async () => {
      await client.query(
        `INSERT INTO type_tests (
          tinyint_col, varchar_col, blob_col, timestamp_col, json_col
        ) VALUES (
          :tinyint_col, :varchar_col, :blob_col, :timestamp_col, :json_col
        )`,
        {
          tinyint_col: null,
          varchar_col: null,
          blob_col: null,
          timestamp_col: null,
          json_col: null
        }
      )

      const result = await client.query('SELECT * FROM type_tests')
      expect(result.records![0].tinyint_col).toBeNull()
      expect(result.records![0].varchar_col).toBeNull()
      expect(result.records![0].blob_col).toBeNull()
      expect(result.records![0].timestamp_col).toBeNull()
      expect(result.records![0].json_col).toBeNull()
    })
  })

  describe('MySQL Type Edge Cases', () => {
    test('should handle empty string values', async () => {
      await client.query(
        'INSERT INTO type_tests (varchar_col, text_col) VALUES (:varchar, :text)',
        { varchar: '', text: '' }
      )

      const result = await client.query('SELECT varchar_col, text_col FROM type_tests')
      expect(result.records![0].varchar_col).toBe('')
      expect(result.records![0].text_col).toBe('')
    })

    test('should handle zero values', async () => {
      await client.query(
        'INSERT INTO type_tests (tinyint_col, int_col, float_col, decimal_col) VALUES (:ti, :i, :f, :d)',
        { ti: 0, i: 0, f: 0.0, d: 0.0000 }
      )

      const result = await client.query('SELECT tinyint_col, int_col, float_col, decimal_col FROM type_tests')
      expect(result.records![0].tinyint_col).toBe(0)
      expect(result.records![0].int_col).toBe(0)
      expect(result.records![0].float_col).toBe(0)
      expect(result.records![0].decimal_col).toBe('0.0000')
    })

    test('should handle empty Buffer', async () => {
      const emptyBuffer = Buffer.alloc(0)
      await client.query(
        'INSERT INTO type_tests (blob_col) VALUES (:value)',
        { value: emptyBuffer }
      )

      const result = await client.query('SELECT blob_col FROM type_tests')
      expect(result.records![0].blob_col.length).toBe(0)
    })

    test('should handle very large numbers', async () => {
      await client.query(
        'INSERT INTO type_tests (bigint_col, double_col) VALUES (:bigint, :double)',
        { bigint: 9007199254740991, double: 1.7976931348623157e+100 }
      )

      const result = await client.query('SELECT bigint_col, double_col FROM type_tests')
      expect(result.records![0].bigint_col).toBe(9007199254740991)
      expect(result.records![0].double_col).toBeDefined()
    })
  })
})
