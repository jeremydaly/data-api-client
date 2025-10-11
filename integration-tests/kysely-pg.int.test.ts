/**
 * Kysely with PostgreSQL Compatibility Integration Tests
 *
 * Tests the Kysely query builder with the pg-compatible pool interface.
 * Kysely works well with the Data API compatibility layer because it uses
 * regular parameterized queries without relying on prepared statements.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { RDSDataClient } from '@aws-sdk/client-rds-data'
import { createPgPool } from '../src/compat/pg'
import { loadConfig, type IntegrationTestConfig } from './setup'

// Kysely imports
import { Kysely, PostgresDialect, Generated, Selectable, Insertable, Updateable, sql as kyselySql } from 'kysely'

describe('Kysely with PostgreSQL Compat', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let pool: ReturnType<typeof createPgPool>
  let db: Kysely<Database>

  // Define Kysely database types
  interface UserTable {
    id: Generated<number>
    name: string
    email: string
    age: number | null
    active: boolean
    created_at: Generated<Date>
  }

  interface PostTable {
    id: Generated<number>
    user_id: number
    title: string
    content: string | null
    published: boolean
    views: number
    created_at: Generated<Date>
  }

  interface ProductTable {
    id: Generated<number>
    name: string
    price: string
    quantity: number
    metadata: unknown | null
    created_at: Generated<Date>
  }

  interface Database {
    kysely_users: UserTable
    kysely_posts: PostTable
    kysely_products: ProductTable
  }

  type User = Selectable<UserTable>
  type NewUser = Insertable<UserTable>
  type UserUpdate = Updateable<UserTable>

  beforeAll(async () => {
    config = loadConfig('pg')
    rdsClient = new RDSDataClient({ region: config.region })

    // await waitForCluster(rdsClient, config) // No longer needed - automatic retry logic

    pool = createPgPool(config)

    db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool
      })
    })

    // Create test tables using raw SQL
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kysely_users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        age INTEGER,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS kysely_posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        published BOOLEAN DEFAULT false,
        views INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS kysely_products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        price NUMERIC(10, 2) NOT NULL,
        quantity INTEGER DEFAULT 0,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Clear any existing data
    await pool.query('DELETE FROM kysely_posts')
    await pool.query('DELETE FROM kysely_users')
    await pool.query('DELETE FROM kysely_products')
  }, 60000)

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS kysely_posts CASCADE')
    await pool.query('DROP TABLE IF EXISTS kysely_users CASCADE')
    await pool.query('DROP TABLE IF EXISTS kysely_products CASCADE')
    await pool.end()
    rdsClient.destroy()
  }, 60000)

  test('should insert records with Kysely', async () => {
    const result = await db
      .insertInto('kysely_users')
      .values({
        name: 'Alice',
        email: 'alice@example.com',
        age: 30,
        active: true
      })
      .execute()

    expect(result).toBeDefined()
  })

  test('should select records with Kysely', async () => {
    // Insert test data
    await db
      .insertInto('kysely_users')
      .values({
        name: 'Bob',
        email: 'bob@example.com',
        age: 25,
        active: true
      })
      .execute()

    const result = await db.selectFrom('kysely_users').selectAll().where('name', '=', 'Bob').execute()

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Bob')
    expect(result[0].email).toBe('bob@example.com')
    expect(result[0].age).toBe(25)
  })

  test('should select specific columns with Kysely', async () => {
    const result = await db
      .selectFrom('kysely_users')
      .select(['name', 'email'])
      .where('name', '=', 'Bob')
      .executeTakeFirst()

    expect(result).toBeDefined()
    expect(result?.name).toBe('Bob')
    expect(result?.email).toBe('bob@example.com')
    expect(result).not.toHaveProperty('age')
  })

  test('should update records with Kysely', async () => {
    // Insert test data
    await db
      .insertInto('kysely_users')
      .values({
        name: 'Charlie',
        email: 'charlie@example.com',
        age: 35,
        active: true
      })
      .execute()

    // Update the record
    const updateResult = await db
      .updateTable('kysely_users')
      .set({ age: 36 })
      .where('name', '=', 'Charlie')
      .execute()

    expect(updateResult).toBeDefined()

    // Verify update
    const result = await db.selectFrom('kysely_users').selectAll().where('name', '=', 'Charlie').executeTakeFirst()

    expect(result?.age).toBe(36)
  })

  test('should delete records with Kysely', async () => {
    // Insert test data
    await db
      .insertInto('kysely_users')
      .values({
        name: 'David',
        email: 'david@example.com',
        age: 40,
        active: true
      })
      .execute()

    // Delete the record
    await db.deleteFrom('kysely_users').where('name', '=', 'David').execute()

    // Verify deletion
    const result = await db.selectFrom('kysely_users').selectAll().where('name', '=', 'David').execute()

    expect(result).toHaveLength(0)
  })

  test('should handle complex WHERE clauses with Kysely', async () => {
    // Insert test data
    await db
      .insertInto('kysely_users')
      .values([
        { name: 'Eve', email: 'eve@example.com', age: 28, active: true },
        { name: 'Frank', email: 'frank@example.com', age: 32, active: false },
        { name: 'Grace', email: 'grace@example.com', age: 29, active: true }
      ])
      .execute()

    // Query with multiple conditions
    const result = await db
      .selectFrom('kysely_users')
      .selectAll()
      .where('active', '=', true)
      .where('age', '>=', 28)
      .execute()

    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result.every((u) => u.active === true)).toBe(true)
  })

  test('should handle ORDER BY with Kysely', async () => {
    const result = await db.selectFrom('kysely_users').selectAll().orderBy('age', 'asc').execute()

    expect(result.length).toBeGreaterThan(0)
    // Verify ascending order
    for (let i = 1; i < result.length; i++) {
      if (result[i].age !== null && result[i - 1].age !== null) {
        expect(result[i].age).toBeGreaterThanOrEqual(result[i - 1].age!)
      }
    }
  })

  test('should handle LIMIT and OFFSET with Kysely', async () => {
    const result = await db.selectFrom('kysely_users').selectAll().limit(2).offset(1).execute()

    expect(result.length).toBeLessThanOrEqual(2)
  })

  test('should handle NULL values with Kysely', async () => {
    await db
      .insertInto('kysely_users')
      .values({
        name: 'NullAge',
        email: 'nullage@example.com',
        age: null,
        active: true
      })
      .execute()

    const result = await db.selectFrom('kysely_users').selectAll().where('name', '=', 'NullAge').executeTakeFirst()

    expect(result?.age).toBeNull()
  })

  test('should handle aggregate functions with Kysely', async () => {
    const result = await db
      .selectFrom('kysely_users')
      .select((eb) => [eb.fn.count<number>('id').as('count'), eb.fn.avg<number>('age').as('avg_age')])
      .executeTakeFirst()

    expect(result?.count).toBeGreaterThan(0)
    expect(result?.avg_age).toBeDefined()
  })

  test('should handle raw SQL with Kysely', async () => {
    const result = await db
      .selectFrom('kysely_users')
      .selectAll()
      .where(({ eb }) => eb('age', '>', kyselySql<number>`25`))
      .execute()

    expect(result.length).toBeGreaterThan(0)
    expect(result.every((u) => u.age === null || u.age > 25)).toBe(true)
  })

  // Additional WHERE clause operators
  test('should handle OR conditions', async () => {
    const result = await db
      .selectFrom('kysely_users')
      .selectAll()
      .where(({ or, eb }) => or([eb('name', '=', 'Alice'), eb('name', '=', 'Bob')]))
      .execute()

    expect(result.length).toBeGreaterThanOrEqual(0)
  })

  test('should handle IN operator', async () => {
    await db
      .insertInto('kysely_users')
      .values([
        { name: 'InTest1', email: 'in1@example.com', age: 10, active: true },
        { name: 'InTest2', email: 'in2@example.com', age: 20, active: true },
        { name: 'InTest3', email: 'in3@example.com', age: 30, active: true }
      ])
      .execute()

    const result = await db
      .selectFrom('kysely_users')
      .selectAll()
      .where('age', 'in', [10, 20, 30])
      .execute()

    expect(result.some((u) => [10, 20, 30].includes(u.age as number))).toBe(true)
  })

  test('should handle LIKE operator', async () => {
    await db
      .insertInto('kysely_users')
      .values({
        name: 'PatternTest',
        email: 'pattern@example.com',
        age: 45,
        active: true
      })
      .execute()

    const result = await db.selectFrom('kysely_users').selectAll().where('name', 'like', 'Pattern%').execute()

    expect(result.some((u) => u.name.startsWith('Pattern'))).toBe(true)
  })

  test('should handle IS NULL and IS NOT NULL', async () => {
    const nullResults = await db.selectFrom('kysely_users').selectAll().where('age', 'is', null).execute()

    expect(nullResults.every((u) => u.age === null)).toBe(true)

    const notNullResults = await db.selectFrom('kysely_users').selectAll().where('age', 'is not', null).execute()

    expect(notNullResults.every((u) => u.age !== null)).toBe(true)
  })

  test('should handle BETWEEN operator', async () => {
    const result = await db
      .selectFrom('kysely_users')
      .selectAll()
      .where('age', '>=', 25)
      .where('age', '<=', 35)
      .execute()

    expect(result.every((u) => u.age === null || (u.age >= 25 && u.age <= 35))).toBe(true)
  })

  // Multiple ORDER BY
  test('should handle multiple ORDER BY columns', async () => {
    const result = await db
      .selectFrom('kysely_users')
      .selectAll()
      .orderBy('active', 'desc')
      .orderBy('age', 'asc')
      .execute()

    expect(result.length).toBeGreaterThan(0)
  })

  // Batch insert
  test('should handle batch inserts', async () => {
    const batchUsers = [
      { name: 'Batch1', email: 'batch1@example.com', age: 51, active: true },
      { name: 'Batch2', email: 'batch2@example.com', age: 52, active: true },
      { name: 'Batch3', email: 'batch3@example.com', age: 53, active: true }
    ]

    await db.insertInto('kysely_users').values(batchUsers).execute()

    const result = await db.selectFrom('kysely_users').selectAll().where('name', 'like', 'Batch%').execute()

    expect(result.length).toBeGreaterThanOrEqual(3)
  })

  // More aggregate functions
  test('should handle MIN and MAX aggregations', async () => {
    const result = await db
      .selectFrom('kysely_users')
      .select((eb) => [eb.fn.min<number>('age').as('min_age'), eb.fn.max<number>('age').as('max_age')])
      .executeTakeFirst()

    expect(result?.min_age).toBeDefined()
    expect(result?.max_age).toBeDefined()
  })

  test('should handle SUM aggregation', async () => {
    await db
      .insertInto('kysely_users')
      .values([
        { name: 'Sum1', email: 'sum1@example.com', age: 100, active: true },
        { name: 'Sum2', email: 'sum2@example.com', age: 200, active: true },
        { name: 'Sum3', email: 'sum3@example.com', age: 300, active: true }
      ])
      .execute()

    const result = await db
      .selectFrom('kysely_users')
      .select((eb) => eb.fn.sum<number>('age').as('total_age'))
      .where('name', 'like', 'Sum%')
      .executeTakeFirst()

    expect(result?.total_age).toBe(600)
  })

  // RETURNING clause
  test('should handle RETURNING on INSERT', async () => {
    const result = await db
      .insertInto('kysely_users')
      .values({
        name: 'ReturningTest',
        email: 'returning@example.com',
        age: 60,
        active: true
      })
      .returning(['id', 'name', 'email'])
      .executeTakeFirst()

    expect(result).toBeDefined()
    expect(result?.name).toBe('ReturningTest')
    expect(result?.id).toBeDefined()
  })

  test('should handle RETURNING on UPDATE', async () => {
    await db
      .insertInto('kysely_users')
      .values({
        name: 'UpdateReturning',
        email: 'updateret@example.com',
        age: 70,
        active: true
      })
      .execute()

    const result = await db
      .updateTable('kysely_users')
      .set({ age: 71 })
      .where('name', '=', 'UpdateReturning')
      .returning(['id', 'name', 'age'])
      .executeTakeFirst()

    expect(result).toBeDefined()
    expect(result?.age).toBe(71)
  })

  test('should handle RETURNING on DELETE', async () => {
    await db
      .insertInto('kysely_users')
      .values({
        name: 'DeleteReturning',
        email: 'deleteret@example.com',
        age: 80,
        active: true
      })
      .execute()

    const result = await db
      .deleteFrom('kysely_users')
      .where('name', '=', 'DeleteReturning')
      .returning(['id', 'name'])
      .executeTakeFirst()

    expect(result).toBeDefined()
    expect(result?.name).toBe('DeleteReturning')
  })

  // INNER JOIN
  test('should handle INNER JOIN', async () => {
    // Insert user and posts
    const [user] = await db
      .insertInto('kysely_users')
      .values({
        name: 'JoinUser',
        email: 'joinuser@example.com',
        age: 40,
        active: true
      })
      .returning('id')
      .execute()

    await db
      .insertInto('kysely_posts')
      .values([
        { user_id: user.id, title: 'First Post', content: 'Content 1', published: true, views: 10 },
        { user_id: user.id, title: 'Second Post', content: 'Content 2', published: false, views: 5 }
      ])
      .execute()

    const result = await db
      .selectFrom('kysely_users')
      .innerJoin('kysely_posts', 'kysely_users.id', 'kysely_posts.user_id')
      .select(['kysely_users.name', 'kysely_posts.title', 'kysely_posts.published'])
      .where('kysely_users.name', '=', 'JoinUser')
      .execute()

    expect(result.length).toBe(2)
    expect(result[0].name).toBe('JoinUser')
  })

  // LEFT JOIN
  test('should handle LEFT JOIN', async () => {
    await db
      .insertInto('kysely_users')
      .values({
        name: 'NoPostsUser',
        email: 'noposts@example.com',
        age: 50,
        active: true
      })
      .execute()

    const result = await db
      .selectFrom('kysely_users')
      .leftJoin('kysely_posts', 'kysely_users.id', 'kysely_posts.user_id')
      .select(['kysely_users.name', 'kysely_posts.title'])
      .where('kysely_users.name', '=', 'NoPostsUser')
      .execute()

    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0].name).toBe('NoPostsUser')
    expect(result[0].title).toBeNull()
  })

  // GROUP BY
  test('should handle GROUP BY with aggregations', async () => {
    await db
      .insertInto('kysely_posts')
      .values([
        { user_id: 1, title: 'Post A1', content: 'Content', published: true, views: 100 },
        { user_id: 1, title: 'Post A2', content: 'Content', published: true, views: 200 },
        { user_id: 2, title: 'Post B1', content: 'Content', published: true, views: 150 }
      ])
      .execute()

    const result = await db
      .selectFrom('kysely_posts')
      .select((eb) => [
        'user_id',
        eb.fn.count<number>('id').as('post_count'),
        eb.fn.sum<number>('views').as('total_views')
      ])
      .groupBy('user_id')
      .execute()

    expect(result.length).toBeGreaterThanOrEqual(2)
    const user1Stats = result.find((r) => r.user_id === 1)
    if (user1Stats) {
      expect(user1Stats.total_views).toBe(300)
    }
  })

  // HAVING clause
  test('should handle HAVING clause with GROUP BY', async () => {
    const result = await db
      .selectFrom('kysely_posts')
      .select((eb) => ['user_id', eb.fn.count<number>('id').as('post_count')])
      .groupBy('user_id')
      .having((eb) => eb.fn.count('id'), '>', 1)
      .execute()

    expect(result.every((r) => Number(r.post_count) > 1)).toBe(true)
  })

  // DISTINCT
  test('should handle SELECT DISTINCT', async () => {
    await db
      .insertInto('kysely_users')
      .values([
        { name: 'Distinct1', email: 'dist1@example.com', age: 99, active: true },
        { name: 'Distinct2', email: 'dist2@example.com', age: 99, active: true },
        { name: 'Distinct3', email: 'dist3@example.com', age: 100, active: true }
      ])
      .execute()

    const result = await db
      .selectFrom('kysely_users')
      .selectAll()
      .distinct()
      .where('age', '>=', 99)
      .execute()

    expect(result.length).toBeGreaterThan(0)
  })

  test('should handle DISTINCT ON specific columns', async () => {
    const result = await db.selectFrom('kysely_users').select('age').distinct().where('age', 'is not', null).execute()

    const ages = result.map((r) => r.age)
    const uniqueAges = [...new Set(ages)]
    expect(ages.length).toBe(uniqueAges.length)
  })

  // Subquery
  test('should handle subqueries in WHERE', async () => {
    const avgAge = db.selectFrom('kysely_users').select((eb) => eb.fn.avg<number>('age').as('avg_age'))

    const result = await db
      .selectFrom('kysely_users')
      .selectAll()
      .where('age', '>', avgAge)
      .execute()

    expect(result.length).toBeGreaterThanOrEqual(0)
  })

  // CTE (Common Table Expression)
  test('should handle CTEs (WITH clause)', async () => {
    const result = await db
      .with('active_users', (db) =>
        db.selectFrom('kysely_users').select(['id', 'name', 'email']).where('active', '=', true)
      )
      .selectFrom('active_users')
      .selectAll()
      .execute()

    expect(result.length).toBeGreaterThan(0)
  })

  test('should handle multiple CTEs', async () => {
    const result = await db
      .with('active_users', (db) => db.selectFrom('kysely_users').select('id').where('active', '=', true))
      .with('user_posts', (db) =>
        db
          .selectFrom('kysely_posts')
          .innerJoin('active_users', 'kysely_posts.user_id', 'active_users.id')
          .select(['kysely_posts.id', 'kysely_posts.title'])
      )
      .selectFrom('user_posts')
      .selectAll()
      .execute()

    expect(result).toBeDefined()
  })

  // JSONB operations
  test('should handle JSONB data type', async () => {
    await db
      .insertInto('kysely_products')
      .values({
        name: 'JSON Product',
        price: '99.99',
        quantity: 10,
        metadata: JSON.stringify({ color: 'blue', features: ['wireless', 'waterproof'] })
      })
      .execute()

    const result = await db.selectFrom('kysely_products').selectAll().where('name', '=', 'JSON Product').executeTakeFirst()

    // JSONB is returned as a string by the Data API, so we parse it
    const parsed = typeof result?.metadata === 'string' ? JSON.parse(result.metadata) : result?.metadata
    expect(parsed).toEqual({ color: 'blue', features: ['wireless', 'waterproof'] })
  })

  // CASE expression
  test('should handle CASE expressions', async () => {
    const result = await db
      .selectFrom('kysely_users')
      .select((eb) => [
        'name',
        'age',
        eb
          .case()
          .when('age', '<', 30)
          .then('Young')
          .when('age', '>=', 30)
          .then('Adult')
          .else('Unknown')
          .end()
          .as('age_group')
      ])
      .where('age', 'is not', null)
      .execute()

    expect(result.length).toBeGreaterThan(0)
    expect(result.every((r) => ['Young', 'Adult', 'Unknown'].includes(r.age_group as string))).toBe(true)
  })

  // COALESCE
  test('should handle COALESCE function', async () => {
    const result = await db
      .selectFrom('kysely_users')
      .select((eb) => ['name', eb.fn.coalesce('age', kyselySql`0`).as('age_or_zero')])
      .execute()

    expect(result.length).toBeGreaterThan(0)
    expect(result.every((r) => r.age_or_zero !== null)).toBe(true)
  })

  // CONCAT
  test('should handle string concatenation', async () => {
    const result = await db
      .selectFrom('kysely_users')
      .select((eb) => [
        'name',
        'email',
        kyselySql<string>`${eb.ref('name')} || ' <' || ${eb.ref('email')} || '>'`.as('full_contact')
      ])
      .limit(5)
      .execute()

    expect(result.length).toBeGreaterThan(0)
    expect(result[0].full_contact).toContain('<')
    expect(result[0].full_contact).toContain('>')
  })

  // UPDATE with expression
  test('should handle UPDATE with expressions', async () => {
    await db
      .insertInto('kysely_products')
      .values({
        name: 'Increment Product',
        price: '10.00',
        quantity: 5
      })
      .execute()

    await db
      .updateTable('kysely_products')
      .set((eb) => ({
        quantity: eb('quantity', '+', 10)
      }))
      .where('name', '=', 'Increment Product')
      .execute()

    const result = await db
      .selectFrom('kysely_products')
      .selectAll()
      .where('name', '=', 'Increment Product')
      .executeTakeFirst()

    expect(result?.quantity).toBe(15)
  })

  // executeTakeFirstOrThrow
  test('should handle executeTakeFirstOrThrow', async () => {
    const result = await db.selectFrom('kysely_users').selectAll().where('name', '=', 'Alice').executeTakeFirstOrThrow()

    expect(result.name).toBe('Alice')
  })

  test('should throw error with executeTakeFirstOrThrow when no results', async () => {
    await expect(
      db.selectFrom('kysely_users').selectAll().where('name', '=', 'NonExistentUser999').executeTakeFirstOrThrow()
    ).rejects.toThrow()
  })
})

describe('Kysely Transactions with PostgreSQL Compat', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let pool: ReturnType<typeof createPgPool>
  let db: Kysely<Database>

  interface UserTable {
    id: Generated<number>
    name: string
    email: string
  }

  interface Database {
    kysely_tx_test: UserTable
  }

  beforeAll(async () => {
    config = loadConfig('pg')
    rdsClient = new RDSDataClient({ region: config.region })

    // await waitForCluster(rdsClient, config) // No longer needed - automatic retry logic

    pool = createPgPool(config)

    db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool
      })
    })

    // Create test table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kysely_tx_test (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL
      )
    `)

    // Clear any existing data
    await pool.query('DELETE FROM kysely_tx_test')
  }, 60000)

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS kysely_tx_test CASCADE')
    await pool.end()
    rdsClient.destroy()
  }, 60000)

  test('should commit transaction with Kysely', async () => {
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto('kysely_tx_test')
        .values({
          name: 'TxUser1',
          email: 'txuser1@example.com'
        })
        .execute()

      await trx
        .insertInto('kysely_tx_test')
        .values({
          name: 'TxUser2',
          email: 'txuser2@example.com'
        })
        .execute()
    })

    // Verify both records were inserted
    const result = await db.selectFrom('kysely_tx_test').selectAll().execute()

    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result.some((r) => r.name === 'TxUser1')).toBe(true)
    expect(result.some((r) => r.name === 'TxUser2')).toBe(true)
  })

  test('should rollback transaction on error with Kysely', async () => {
    const initialCount = await db
      .selectFrom('kysely_tx_test')
      .select((eb) => eb.fn.count<number>('id').as('count'))
      .executeTakeFirst()

    try {
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto('kysely_tx_test')
          .values({
            name: 'TxRollback',
            email: 'rollback@example.com'
          })
          .execute()

        // Force error to trigger rollback
        throw new Error('Intentional rollback')
      })
    } catch (err) {
      // Expected error
    }

    // Verify record was NOT inserted
    const result = await db.selectFrom('kysely_tx_test').selectAll().where('name', '=', 'TxRollback').execute()

    expect(result).toHaveLength(0)

    // Verify count hasn't changed
    const finalCount = await db
      .selectFrom('kysely_tx_test')
      .select((eb) => eb.fn.count<number>('id').as('count'))
      .executeTakeFirst()

    expect(finalCount?.count).toBe(initialCount?.count)
  })
})
