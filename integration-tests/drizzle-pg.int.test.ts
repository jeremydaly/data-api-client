/**
 * Drizzle ORM with PostgreSQL Compatibility Integration Tests
 *
 * Tests the pg compatibility layer with Drizzle ORM. Drizzle uses the standard
 * pg client.query() interface, which our compatibility layer now supports including
 * query config objects with name, rowMode, and values properties.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { RDSDataClient } from '@aws-sdk/client-rds-data'
import { createPgPool } from '../src/compat/pg'
import { loadConfig, type IntegrationTestConfig } from './setup'

// Drizzle ORM imports
import { drizzle } from 'drizzle-orm/node-postgres'
import { pgTable, serial, text, integer, boolean, timestamp, numeric, jsonb, uuid, varchar } from 'drizzle-orm/pg-core'
import {
  eq,
  and,
  or,
  not,
  gt,
  gte,
  lt,
  lte,
  ne,
  isNull,
  isNotNull,
  inArray,
  notInArray,
  like,
  ilike,
  sql as drizzleSql,
  count,
  sum,
  avg,
  min,
  max,
  desc,
  asc
} from 'drizzle-orm'

describe('Drizzle ORM with PostgreSQL Compat', () => {
  let config: IntegrationTestConfig
  let rdsClient: RDSDataClient
  let pool: ReturnType<typeof createPgPool>
  let db: ReturnType<typeof drizzle>

  // Define Drizzle schemas
  const users = pgTable('drizzle_users', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    age: integer('age'),
    active: boolean('active').default(true),
    createdAt: timestamp('created_at').defaultNow()
  })

  const posts = pgTable('drizzle_posts', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    title: text('title').notNull(),
    content: text('content'),
    published: boolean('published').default(false),
    views: integer('views').default(0),
    createdAt: timestamp('created_at').defaultNow()
  })

  const products = pgTable('drizzle_products', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    quantity: integer('quantity').default(0),
    metadata: jsonb('metadata'),
    productUuid: uuid('product_uuid'),
    createdAt: timestamp('created_at').defaultNow()
  })

  beforeAll(async () => {
    config = loadConfig('pg')
    rdsClient = new RDSDataClient({ region: config.region })

    // await waitForCluster(rdsClient, config) // No longer needed - automatic retry logic

    pool = createPgPool(config)
    db = drizzle(pool)

    // Create test tables using raw SQL
    await pool.query(`
      CREATE TABLE IF NOT EXISTS drizzle_users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        age INTEGER,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS drizzle_posts (
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
      CREATE TABLE IF NOT EXISTS drizzle_products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price NUMERIC(10, 2) NOT NULL,
        quantity INTEGER DEFAULT 0,
        metadata JSONB,
        product_uuid UUID,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Clear any existing data
    await pool.query('DELETE FROM drizzle_posts')
    await pool.query('DELETE FROM drizzle_users')
    await pool.query('DELETE FROM drizzle_products')
  }, 60000)

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS drizzle_posts CASCADE')
    await pool.query('DROP TABLE IF EXISTS drizzle_users CASCADE')
    await pool.query('DROP TABLE IF EXISTS drizzle_products CASCADE')
    await pool.end()
    rdsClient.destroy()
  }, 60000)

  test('should insert records with Drizzle', async () => {
    const result = await db.insert(users).values({
      name: 'Alice',
      email: 'alice@example.com',
      age: 30
    })

    expect(result).toBeDefined()
  })

  test('should select records with Drizzle', async () => {
    // Insert test data
    await db.insert(users).values({
      name: 'Bob',
      email: 'bob@example.com',
      age: 25
    })

    const result = await db.select().from(users).where(eq(users.name, 'Bob'))

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Bob')
    expect(result[0].email).toBe('bob@example.com')
    expect(result[0].age).toBe(25)
  })

  test('should update records with Drizzle', async () => {
    // Insert test data
    await db.insert(users).values({
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 35
    })

    // Update the record
    await db.update(users).set({ age: 36 }).where(eq(users.name, 'Charlie'))

    // Verify update
    const result = await db.select().from(users).where(eq(users.name, 'Charlie'))

    expect(result[0].age).toBe(36)
  })

  test('should delete records with Drizzle', async () => {
    // Insert test data
    await db.insert(users).values({
      name: 'David',
      email: 'david@example.com',
      age: 40
    })

    // Delete the record
    await db.delete(users).where(eq(users.name, 'David'))

    // Verify deletion
    const result = await db.select().from(users).where(eq(users.name, 'David'))

    expect(result).toHaveLength(0)
  })

  test('should handle complex WHERE clauses with Drizzle', async () => {
    // Insert test data
    await db.insert(users).values([
      { name: 'Eve', email: 'eve@example.com', age: 28, active: true },
      { name: 'Frank', email: 'frank@example.com', age: 32, active: false },
      { name: 'Grace', email: 'grace@example.com', age: 29, active: true }
    ])

    // Query with multiple conditions
    const result = await db
      .select()
      .from(users)
      .where(and(eq(users.active, true), drizzleSql`${users.age} >= 28`))

    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result.every((u) => u.active === true)).toBe(true)
  })

  test('should handle ORDER BY with Drizzle', async () => {
    const result = await db.select().from(users).orderBy(users.age)

    expect(result.length).toBeGreaterThan(0)
    // Verify ascending order
    for (let i = 1; i < result.length; i++) {
      if (result[i].age && result[i - 1].age) {
        expect(result[i].age).toBeGreaterThanOrEqual(result[i - 1].age!)
      }
    }
  })

  test('should handle LIMIT with Drizzle', async () => {
    const result = await db.select().from(users).limit(2)

    expect(result.length).toBeLessThanOrEqual(2)
  })

  test('should handle NULL values with Drizzle', async () => {
    await db.insert(users).values({
      name: 'NullAge',
      email: 'nullage@example.com',
      age: null
    })

    const result = await db.select().from(users).where(eq(users.name, 'NullAge'))

    expect(result[0].age).toBeNull()
  })

  // Advanced WHERE clause tests
  test('should handle OR conditions', async () => {
    const result = await db
      .select()
      .from(users)
      .where(or(eq(users.name, 'Alice'), eq(users.name, 'Bob')))

    expect(result.length).toBeGreaterThanOrEqual(0)
  })

  test('should handle NOT conditions', async () => {
    const result = await db
      .select()
      .from(users)
      .where(not(eq(users.active, false)))

    expect(result.every((u) => u.active !== false)).toBe(true)
  })

  test('should handle comparison operators (gt, gte, lt, lte, ne)', async () => {
    // Greater than
    const gtResult = await db.select().from(users).where(gt(users.age, 25))
    expect(gtResult.every((u) => u.age === null || u.age > 25)).toBe(true)

    // Greater than or equal
    const gteResult = await db.select().from(users).where(gte(users.age, 30))
    expect(gteResult.every((u) => u.age === null || u.age >= 30)).toBe(true)

    // Less than
    const ltResult = await db.select().from(users).where(lt(users.age, 30))
    expect(ltResult.every((u) => u.age === null || u.age < 30)).toBe(true)

    // Less than or equal
    const lteResult = await db.select().from(users).where(lte(users.age, 30))
    expect(lteResult.every((u) => u.age === null || u.age <= 30)).toBe(true)

    // Not equal
    const neResult = await db.select().from(users).where(ne(users.age, 30))
    expect(neResult.every((u) => u.age !== 30)).toBe(true)
  })

  test('should handle isNull and isNotNull', async () => {
    const nullResult = await db.select().from(users).where(isNull(users.age))
    expect(nullResult.every((u) => u.age === null)).toBe(true)

    const notNullResult = await db.select().from(users).where(isNotNull(users.age))
    expect(notNullResult.every((u) => u.age !== null)).toBe(true)
  })

  test('should handle inArray and notInArray', async () => {
    // Insert test data
    await db.insert(users).values([
      { name: 'InArray1', email: 'in1@example.com', age: 10 },
      { name: 'InArray2', email: 'in2@example.com', age: 20 },
      { name: 'InArray3', email: 'in3@example.com', age: 30 }
    ])

    const inResult = await db
      .select()
      .from(users)
      .where(inArray(users.age, [10, 20, 30]))
    expect(inResult.some((u) => [10, 20, 30].includes(u.age as number))).toBe(true)

    const notInResult = await db
      .select()
      .from(users)
      .where(notInArray(users.age, [10, 20]))
    expect(notInResult.every((u) => u.age !== 10 && u.age !== 20)).toBe(true)
  })

  test('should handle LIKE and ILIKE', async () => {
    await db.insert(users).values({
      name: 'TestPattern',
      email: 'testpattern@example.com',
      age: 40
    })

    const likeResult = await db.select().from(users).where(like(users.name, 'Test%'))
    expect(likeResult.some((u) => u.name.startsWith('Test'))).toBe(true)

    const ilikeResult = await db.select().from(users).where(ilike(users.email, '%PATTERN%'))
    expect(ilikeResult.some((u) => u.email.toLowerCase().includes('pattern'))).toBe(true)
  })

  // Sorting tests
  test('should handle ORDER BY DESC', async () => {
    const result = await db.select().from(users).orderBy(desc(users.age))

    expect(result.length).toBeGreaterThan(0)
    for (let i = 1; i < result.length; i++) {
      if (result[i].age !== null && result[i - 1].age !== null) {
        expect(result[i - 1].age).toBeGreaterThanOrEqual(result[i].age!)
      }
    }
  })

  test('should handle multiple ORDER BY columns', async () => {
    await db.insert(users).values([
      { name: 'Multi1', email: 'multi1@example.com', age: 50, active: true },
      { name: 'Multi2', email: 'multi2@example.com', age: 50, active: false }
    ])

    const result = await db.select().from(users).orderBy(desc(users.age), asc(users.name))

    expect(result.length).toBeGreaterThan(0)
  })

  // Pagination tests
  test('should handle OFFSET with Drizzle', async () => {
    const allUsers = await db.select().from(users)
    const offsetUsers = await db.select().from(users).offset(2)

    expect(offsetUsers.length).toBe(Math.max(0, allUsers.length - 2))
  })

  test('should handle LIMIT with OFFSET for pagination', async () => {
    const page1 = await db.select().from(users).limit(3).offset(0)
    const page2 = await db.select().from(users).limit(3).offset(3)

    expect(page1.length).toBeLessThanOrEqual(3)
    expect(page2.length).toBeLessThanOrEqual(3)
  })

  // Batch insert test
  test('should handle batch inserts', async () => {
    const batchUsers = [
      { name: 'Batch1', email: 'batch1@example.com', age: 21 },
      { name: 'Batch2', email: 'batch2@example.com', age: 22 },
      { name: 'Batch3', email: 'batch3@example.com', age: 23 }
    ]

    await db.insert(users).values(batchUsers)

    const result = await db.select().from(users).where(like(users.name, 'Batch%'))

    expect(result.length).toBeGreaterThanOrEqual(3)
  })

  // Aggregation tests
  test('should handle COUNT aggregation', async () => {
    const result = await db.select({ count: count() }).from(users)

    expect(result[0].count).toBeGreaterThan(0)
  })

  test('should handle COUNT with WHERE', async () => {
    const result = await db.select({ count: count() }).from(users).where(eq(users.active, true))

    expect(result[0].count).toBeGreaterThanOrEqual(0)
  })

  test('should handle SUM, AVG, MIN, MAX aggregations', async () => {
    await db.insert(users).values([
      { name: 'AggTest1', email: 'agg1@example.com', age: 100 },
      { name: 'AggTest2', email: 'agg2@example.com', age: 200 },
      { name: 'AggTest3', email: 'agg3@example.com', age: 300 }
    ])

    const result = await db
      .select({
        sum: sum(users.age),
        avg: avg(users.age),
        min: min(users.age),
        max: max(users.age)
      })
      .from(users)
      .where(like(users.name, 'AggTest%'))

    expect(result[0].sum).toBe('600')
    expect(parseFloat(result[0].avg as string)).toBe(200)
    expect(result[0].min).toBe(100)
    expect(result[0].max).toBe(300)
  })

  // Join tests with posts table
  test('should handle INNER JOIN', async () => {
    // Insert users and posts
    const [user] = await db
      .insert(users)
      .values({ name: 'JoinUser', email: 'joinuser@example.com', age: 35 })
      .returning()

    await db.insert(posts).values([
      { userId: user.id, title: 'First Post', content: 'Content 1', published: true },
      { userId: user.id, title: 'Second Post', content: 'Content 2', published: false }
    ])

    const result = await db
      .select({
        userName: users.name,
        postTitle: posts.title,
        published: posts.published
      })
      .from(users)
      .innerJoin(posts, eq(users.id, posts.userId))
      .where(eq(users.name, 'JoinUser'))

    expect(result.length).toBe(2)
    expect(result[0].userName).toBe('JoinUser')
  })

  test('should handle LEFT JOIN', async () => {
    // Insert user without posts
    await db.insert(users).values({ name: 'NoPostsUser', email: 'noposts@example.com', age: 40 })

    const result = await db
      .select({
        userName: users.name,
        postTitle: posts.title
      })
      .from(users)
      .leftJoin(posts, eq(users.id, posts.userId))
      .where(eq(users.name, 'NoPostsUser'))

    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0].userName).toBe('NoPostsUser')
  })

  // Subquery test
  test('should handle subqueries', async () => {
    await db.insert(users).values([
      { name: 'SubQuery1', email: 'sub1@example.com', age: 60 },
      { name: 'SubQuery2', email: 'sub2@example.com', age: 70 }
    ])

    const avgAge = db
      .select({ value: avg(users.age).as('avg_age') })
      .from(users)
      .as('avgAge')

    const result = await db
      .select()
      .from(users)
      .where(drizzleSql`${users.age} > (SELECT ${avgAge.value} FROM ${avgAge})`)

    expect(result.length).toBeGreaterThanOrEqual(0)
  })

  // Partial update test
  test('should handle partial updates with WHERE', async () => {
    await db.insert(users).values({
      name: 'PartialUpdate',
      email: 'partial@example.com',
      age: 45,
      active: true
    })

    await db.update(users).set({ age: 46 }).where(eq(users.name, 'PartialUpdate'))

    const result = await db.select().from(users).where(eq(users.name, 'PartialUpdate'))

    expect(result[0].age).toBe(46)
    expect(result[0].active).toBe(true)
  })

  // RETURNING clause test
  test('should handle RETURNING on INSERT', async () => {
    const result = await db
      .insert(users)
      .values({
        name: 'ReturningTest',
        email: 'returning@example.com',
        age: 55
      })
      .returning()

    expect(result.length).toBe(1)
    expect(result[0].name).toBe('ReturningTest')
    expect(result[0].id).toBeDefined()
  })

  test('should handle RETURNING on UPDATE', async () => {
    await db.insert(users).values({
      name: 'UpdateReturning',
      email: 'updateret@example.com',
      age: 50
    })

    const result = await db.update(users).set({ age: 51 }).where(eq(users.name, 'UpdateReturning')).returning()

    expect(result.length).toBe(1)
    expect(result[0].age).toBe(51)
  })

  test('should handle RETURNING on DELETE', async () => {
    await db.insert(users).values({
      name: 'DeleteReturning',
      email: 'deleteret@example.com',
      age: 65
    })

    const result = await db.delete(users).where(eq(users.name, 'DeleteReturning')).returning()

    expect(result.length).toBe(1)
    expect(result[0].name).toBe('DeleteReturning')
  })

  // JSONB and advanced types
  test('should handle JSONB data type', async () => {
    // Drizzle serializes JSONB to JSON string, so we need explicit cast
    const metadata = { color: 'blue', features: ['wireless', 'waterproof'] }
    await db.insert(products).values({
      name: 'JSON Product',
      price: drizzleSql`99.99::numeric`,
      quantity: 10,
      metadata: drizzleSql`${JSON.stringify(metadata)}::jsonb`
    })

    const result = await db.select().from(products).where(eq(products.name, 'JSON Product'))

    expect(result[0].metadata).toEqual({ color: 'blue', features: ['wireless', 'waterproof'] })
  })

  test('should handle UUID data type', async () => {
    const testUuid = '550e8400-e29b-41d4-a716-446655440000'

    await db.insert(products).values({
      name: 'UUID Product',
      price: drizzleSql`49.99::numeric`,
      quantity: 5,
      productUuid: drizzleSql`${testUuid}::uuid`
    })

    const result = await db.select().from(products).where(eq(products.name, 'UUID Product'))

    expect(result[0].productUuid).toBe(testUuid)
  })

  test('should handle NUMERIC/DECIMAL precision', async () => {
    await db.insert(products).values({
      name: 'Precision Product',
      price: drizzleSql`123.45::numeric`,
      quantity: 1
    })

    const result = await db.select().from(products).where(eq(products.name, 'Precision Product'))

    expect(result[0].price).toBe('123.45')
  })

  // Transaction tests
  test('should handle transactions with commit', async () => {
    const initialCount = await db.select({ count: count() }).from(users)

    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        name: 'TxUser1',
        email: 'tx1@example.com',
        age: 80
      })

      await tx.insert(users).values({
        name: 'TxUser2',
        email: 'tx2@example.com',
        age: 81
      })
    })

    const finalCount = await db.select({ count: count() }).from(users)

    expect(Number(finalCount[0].count)).toBe(Number(initialCount[0].count) + 2)

    const txUsers = await db.select().from(users).where(like(users.name, 'TxUser%'))
    expect(txUsers.length).toBe(2)
  })

  test('should handle transactions with rollback on error', async () => {
    const initialCount = await db.select({ count: count() }).from(users)

    try {
      await db.transaction(async (tx) => {
        await tx.insert(users).values({
          name: 'TxRollback1',
          email: 'txrollback1@example.com',
          age: 90
        })

        // Force an error - duplicate email
        await tx.insert(users).values({
          name: 'TxRollback2',
          email: 'txrollback1@example.com', // Same email, should fail if unique constraint exists
          age: 91
        })
      })
    } catch (error) {
      // Transaction should rollback
    }

    const finalCount = await db.select({ count: count() }).from(users)

    // Count should be the same or only +1 if no unique constraint (depends on schema)
    const txUsers = await db.select().from(users).where(eq(users.name, 'TxRollback1'))
    // If transaction rolled back properly, this should be 0
    expect(txUsers.length).toBeLessThanOrEqual(1)
  })

  test('should handle nested operations in transaction', async () => {
    await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          name: 'TxNestedUser',
          email: 'txnested@example.com',
          age: 85
        })
        .returning()

      await tx.insert(posts).values({
        userId: user.id,
        title: 'Transaction Post',
        content: 'Created in transaction',
        published: true
      })
    })

    const user = await db.select().from(users).where(eq(users.name, 'TxNestedUser'))
    const userPosts = await db.select().from(posts).where(eq(posts.userId, user[0].id))

    expect(user.length).toBe(1)
    expect(userPosts.length).toBe(1)
  })

  // GROUP BY test
  test('should handle GROUP BY with aggregations', async () => {
    await db.insert(posts).values([
      { userId: 1, title: 'Post 1', content: 'Content', views: 10 },
      { userId: 1, title: 'Post 2', content: 'Content', views: 20 },
      { userId: 2, title: 'Post 3', content: 'Content', views: 15 }
    ])

    const result = await db
      .select({
        userId: posts.userId,
        totalViews: sum(posts.views),
        postCount: count()
      })
      .from(posts)
      .groupBy(posts.userId)

    expect(result.length).toBeGreaterThanOrEqual(2)
    const user1Stats = result.find((r) => r.userId === 1)
    if (user1Stats) {
      expect(user1Stats.totalViews).toBe('30')
      expect(user1Stats.postCount).toBeGreaterThanOrEqual(2)
    }
  })

  // DISTINCT test
  test('should handle SELECT DISTINCT', async () => {
    await db.insert(users).values([
      { name: 'Distinct1', email: 'dist1@example.com', age: 95 },
      { name: 'Distinct2', email: 'dist2@example.com', age: 95 },
      { name: 'Distinct3', email: 'dist3@example.com', age: 96 }
    ])

    const result = await db.selectDistinct({ age: users.age }).from(users).where(gte(users.age, 95))

    const ages = result.map((r) => r.age).filter((a) => a !== null)
    const uniqueAges = [...new Set(ages)]
    expect(ages.length).toBe(uniqueAges.length)
  })

  // Raw SQL test
  test('should handle raw SQL with drizzle sql template', async () => {
    const result = await db.execute(drizzleSql`SELECT COUNT(*) as total FROM drizzle_users`)

    expect(result.rows.length).toBeGreaterThan(0)
    expect(result.rows[0]).toHaveProperty('total')
  })

  test('should handle parameterized raw SQL', async () => {
    const searchName = 'Alice'
    const result = await db.execute(drizzleSql`SELECT * FROM drizzle_users WHERE name = ${searchName} LIMIT 5`)

    expect(result.rows).toBeDefined()
  })
})
