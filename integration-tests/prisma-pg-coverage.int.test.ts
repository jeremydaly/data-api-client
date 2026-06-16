/**
 * Comprehensive Prisma Client query API coverage test over the Aurora RDS Data API (PostgreSQL).
 * This test suite audits every major Prisma query API surface area.
 *
 * Run: source .env.local && npx vitest run integration-tests/prisma-pg-coverage.int.test.ts
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createPrismaPgAdapter } from '../src/compat/prisma'
import { loadConfig, type IntegrationTestConfig } from './setup'
import { PrismaClient, Prisma } from './prisma/generated-pg-coverage'

const DDL = `
DROP TABLE IF EXISTS prisma_cov_post;
DROP TABLE IF EXISTS prisma_cov_user;
CREATE TABLE prisma_cov_user (
  id        SERIAL PRIMARY KEY,
  email     TEXT UNIQUE NOT NULL,
  name      TEXT,
  age       INT,
  score     NUMERIC(10,4),
  balance   BIGINT,
  active    BOOLEAN NOT NULL DEFAULT TRUE,
  category  TEXT,
  tags      TEXT[] NOT NULL DEFAULT '{}',
  meta      JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE prisma_cov_post (
  id        SERIAL PRIMARY KEY,
  title     TEXT NOT NULL,
  views     INT NOT NULL DEFAULT 0,
  "authorId" INT REFERENCES prisma_cov_user(id)
)
`

const DROP_DDL = `DROP TABLE IF EXISTS prisma_cov_post; DROP TABLE IF EXISTS prisma_cov_user`

describe('Prisma Coverage (PostgreSQL)', () => {
  let config: IntegrationTestConfig
  let prisma: PrismaClient
  let factory: ReturnType<typeof createPrismaPgAdapter>

  // Seeded user IDs for tests that need existing records
  let aliceId: number
  let bobId: number
  let carolId: number
  let daveId: number
  let eveId: number

  beforeAll(async () => {
    config = loadConfig('pg')
    factory = createPrismaPgAdapter({
      resourceArn: config.resourceArn,
      secretArn: config.secretArn,
      database: config.database
    })
    const setup = await factory.connect()
    await setup.executeScript(DDL)
    prisma = new PrismaClient({ adapter: factory } as any)

    // Seed varied users
    const alice = await prisma.covUser.create({
      data: {
        email: 'alice@cov.test',
        name: 'Alice',
        age: 30,
        score: new Prisma.Decimal('9.5'),
        balance: BigInt(100000),
        category: 'admin',
        tags: ['admin', 'editor'],
        meta: { role: 'admin', level: 1 },
        active: true
      }
    })
    aliceId = alice.id

    const bob = await prisma.covUser.create({
      data: {
        email: 'bob@cov.test',
        name: 'Bob',
        age: 25,
        score: new Prisma.Decimal('7.0'),
        balance: BigInt(50000),
        category: 'user',
        tags: ['viewer'],
        meta: { role: 'user', level: 2 },
        active: true
      }
    })
    bobId = bob.id

    const carol = await prisma.covUser.create({
      data: {
        email: 'carol@cov.test',
        name: 'Carol',
        age: 35,
        score: new Prisma.Decimal('8.25'),
        balance: BigInt(75000),
        category: 'admin',
        tags: ['editor', 'viewer'],
        meta: { role: 'admin', level: 3 },
        active: false
      }
    })
    carolId = carol.id

    const dave = await prisma.covUser.create({
      data: {
        email: 'dave@cov.test',
        name: 'Dave',
        age: null,
        score: null,
        balance: null,
        category: 'user',
        tags: [],
        meta: null,
        active: true
      }
    })
    daveId = dave.id

    const eve = await prisma.covUser.create({
      data: {
        email: 'eve@cov.test',
        name: null,
        age: 28,
        score: new Prisma.Decimal('6.0'),
        balance: BigInt(10000),
        category: 'user',
        tags: ['admin'],
        meta: { role: 'user', level: 1 },
        active: true
      }
    })
    eveId = eve.id

    // Seed posts
    await prisma.covPost.createMany({
      data: [
        { title: 'First Post', views: 10, authorId: aliceId },
        { title: 'Second Post', views: 50, authorId: aliceId },
        { title: 'Bob Post', views: 5, authorId: bobId }
      ]
    })
  }, 120000)

  afterAll(async () => {
    if (factory) {
      const td = await factory.connect()
      await td.executeScript(DROP_DDL)
    }
    if (prisma) {
      await prisma.$disconnect()
    }
  }, 60000)

  // ─────────────────────────────────────────────────────────────────────────────
  // CRUD
  // ─────────────────────────────────────────────────────────────────────────────
  describe('CRUD', () => {
    test('create - basic record creation', async () => {
      const u = await prisma.covUser.create({
        data: { email: 'crud-create@cov.test', name: 'CrudCreate', age: 20, category: 'user' }
      })
      expect(u.id).toBeGreaterThan(0)
      expect(u.email).toBe('crud-create@cov.test')
      expect(u.name).toBe('CrudCreate')
      await prisma.covUser.delete({ where: { id: u.id } })
    })

    test('createMany - insert multiple records', async () => {
      const result = await prisma.covUser.createMany({
        data: [
          { email: 'many1@cov.test', name: 'Many1', category: 'user' },
          { email: 'many2@cov.test', name: 'Many2', category: 'user' }
        ]
      })
      expect(result.count).toBe(2)
      await prisma.covUser.deleteMany({ where: { email: { in: ['many1@cov.test', 'many2@cov.test'] } } })
    })

    test('createMany - skipDuplicates ignores conflicts', async () => {
      const result = await prisma.covUser.createMany({
        data: [
          { email: 'alice@cov.test', name: 'DupAlice', category: 'user' }, // duplicate
          { email: 'skip-unique@cov.test', name: 'NewSkip', category: 'user' }
        ],
        skipDuplicates: true
      })
      expect(result.count).toBe(1) // only the new one
      await prisma.covUser.deleteMany({ where: { email: 'skip-unique@cov.test' } })
    })

    test('createManyAndReturn - returns created records (PG)', async () => {
      const records = await (prisma.covUser as any).createManyAndReturn({
        data: [
          { email: 'ret1@cov.test', name: 'Ret1', category: 'user' },
          { email: 'ret2@cov.test', name: 'Ret2', category: 'user' }
        ]
      })
      expect(Array.isArray(records)).toBe(true)
      expect(records.length).toBe(2)
      expect(records[0].id).toBeGreaterThan(0)
      await prisma.covUser.deleteMany({ where: { email: { in: ['ret1@cov.test', 'ret2@cov.test'] } } })
    })

    test('findUnique - by unique field', async () => {
      const u = await prisma.covUser.findUnique({ where: { email: 'alice@cov.test' } })
      expect(u?.name).toBe('Alice')
    })

    test('findUnique - returns null for missing record', async () => {
      const u = await prisma.covUser.findUnique({ where: { email: 'nonexistent@cov.test' } })
      expect(u).toBeNull()
    })

    test('findUniqueOrThrow - returns record', async () => {
      const u = await prisma.covUser.findUniqueOrThrow({ where: { email: 'alice@cov.test' } })
      expect(u.name).toBe('Alice')
    })

    test('findUniqueOrThrow - throws for missing record', async () => {
      await expect(
        prisma.covUser.findUniqueOrThrow({ where: { email: 'ghost@cov.test' } })
      ).rejects.toThrow()
    })

    test('findFirst - returns first matching record', async () => {
      const u = await prisma.covUser.findFirst({ where: { category: 'admin' } })
      expect(u).not.toBeNull()
      expect(u?.category).toBe('admin')
    })

    test('findFirst - returns null when no match', async () => {
      const u = await prisma.covUser.findFirst({ where: { category: 'nonexistent' } })
      expect(u).toBeNull()
    })

    test('findFirstOrThrow - returns record', async () => {
      const u = await prisma.covUser.findFirstOrThrow({ where: { category: 'admin' } })
      expect(u.category).toBe('admin')
    })

    test('findFirstOrThrow - throws when no match', async () => {
      await expect(
        prisma.covUser.findFirstOrThrow({ where: { category: 'nonexistent-xyz' } })
      ).rejects.toThrow()
    })

    test('findMany - returns all matching', async () => {
      const users = await prisma.covUser.findMany({ where: { category: 'user' } })
      expect(users.length).toBeGreaterThanOrEqual(3) // bob, dave, eve + any temp
    })

    test('update - single record', async () => {
      const u = await prisma.covUser.update({ where: { id: bobId }, data: { age: 26 } })
      expect(u.age).toBe(26)
    })

    test('updateMany - multiple records', async () => {
      const result = await prisma.covUser.updateMany({
        where: { category: 'admin' },
        data: { active: true }
      })
      expect(result.count).toBeGreaterThanOrEqual(1)
    })

    test('updateManyAndReturn - returns updated records (PG)', async () => {
      const records = await (prisma.covUser as any).updateManyAndReturn({
        where: { category: 'admin' },
        data: { active: true }
      })
      expect(Array.isArray(records)).toBe(true)
      expect(records.length).toBeGreaterThanOrEqual(1)
    })

    test('upsert - create path (record does not exist)', async () => {
      const u = await prisma.covUser.upsert({
        where: { email: 'upsert-new@cov.test' },
        create: { email: 'upsert-new@cov.test', name: 'UpsertNew', category: 'user' },
        update: { name: 'UpsertUpdated' }
      })
      expect(u.name).toBe('UpsertNew')
      await prisma.covUser.delete({ where: { email: 'upsert-new@cov.test' } })
    })

    test('upsert - update path (record exists)', async () => {
      await prisma.covUser.create({ data: { email: 'upsert-existing@cov.test', name: 'UpsertOld', category: 'user' } })
      const u = await prisma.covUser.upsert({
        where: { email: 'upsert-existing@cov.test' },
        create: { email: 'upsert-existing@cov.test', name: 'ShouldNotCreate', category: 'user' },
        update: { name: 'UpsertUpdated' }
      })
      expect(u.name).toBe('UpsertUpdated')
      await prisma.covUser.delete({ where: { email: 'upsert-existing@cov.test' } })
    })

    test('delete - single record by unique', async () => {
      const tmp = await prisma.covUser.create({ data: { email: 'del@cov.test', name: 'Del', category: 'user' } })
      const deleted = await prisma.covUser.delete({ where: { id: tmp.id } })
      expect(deleted.id).toBe(tmp.id)
      const found = await prisma.covUser.findUnique({ where: { id: tmp.id } })
      expect(found).toBeNull()
    })

    test('deleteMany - multiple records', async () => {
      await prisma.covUser.createMany({
        data: [
          { email: 'delmany1@cov.test', name: 'DelMany1', category: 'temp' },
          { email: 'delmany2@cov.test', name: 'DelMany2', category: 'temp' }
        ]
      })
      const result = await prisma.covUser.deleteMany({ where: { category: 'temp' } })
      expect(result.count).toBeGreaterThanOrEqual(2)
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // Filtering operators
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Filtering operators', () => {
    test('equals (implicit)', async () => {
      const u = await prisma.covUser.findMany({ where: { name: 'Alice' } })
      expect(u.length).toBe(1)
      expect(u[0].email).toBe('alice@cov.test')
    })

    test('not - not equal', async () => {
      const u = await prisma.covUser.findMany({ where: { category: { not: 'admin' } } })
      expect(u.every(x => x.category !== 'admin')).toBe(true)
    })

    test('in - value in list', async () => {
      const u = await prisma.covUser.findMany({ where: { email: { in: ['alice@cov.test', 'bob@cov.test'] } } })
      expect(u.length).toBe(2)
    })

    test('notIn - value not in list', async () => {
      const u = await prisma.covUser.findMany({ where: { category: { notIn: ['admin'] } } })
      expect(u.every(x => x.category !== 'admin')).toBe(true)
    })

    test('lt - less than', async () => {
      const u = await prisma.covUser.findMany({ where: { age: { lt: 30 } } })
      expect(u.every(x => (x.age ?? Infinity) < 30)).toBe(true)
    })

    test('lte - less than or equal', async () => {
      const u = await prisma.covUser.findMany({ where: { age: { lte: 30 } } })
      expect(u.every(x => (x.age ?? Infinity) <= 30)).toBe(true)
    })

    test('gt - greater than', async () => {
      const u = await prisma.covUser.findMany({ where: { age: { gt: 30 } } })
      expect(u.every(x => (x.age ?? -Infinity) > 30)).toBe(true)
    })

    test('gte - greater than or equal', async () => {
      const u = await prisma.covUser.findMany({ where: { age: { gte: 30 } } })
      expect(u.every(x => (x.age ?? -Infinity) >= 30)).toBe(true)
    })

    test('contains - substring match', async () => {
      const u = await prisma.covUser.findMany({ where: { name: { contains: 'li' } } })
      expect(u.some(x => x.name?.includes('li'))).toBe(true)
    })

    test('startsWith', async () => {
      const u = await prisma.covUser.findMany({ where: { name: { startsWith: 'Ali' } } })
      expect(u.every(x => x.name?.startsWith('Ali'))).toBe(true)
    })

    test('endsWith', async () => {
      const u = await prisma.covUser.findMany({ where: { name: { endsWith: 'rol' } } })
      expect(u.every(x => x.name?.endsWith('rol'))).toBe(true)
    })

    test('AND - all conditions must match', async () => {
      const u = await prisma.covUser.findMany({
        where: { AND: [{ category: 'admin' }, { active: true }] }
      })
      expect(u.every(x => x.category === 'admin' && x.active === true)).toBe(true)
    })

    test('OR - at least one condition matches', async () => {
      const u = await prisma.covUser.findMany({
        where: { OR: [{ category: 'admin' }, { age: { lt: 26 } }] }
      })
      expect(u.length).toBeGreaterThanOrEqual(2)
    })

    test('NOT - negation of condition', async () => {
      const u = await prisma.covUser.findMany({
        where: { NOT: { category: 'admin' } }
      })
      expect(u.every(x => x.category !== 'admin')).toBe(true)
    })

    test('null filter - field is null', async () => {
      const u = await prisma.covUser.findMany({ where: { name: null } })
      expect(u.every(x => x.name === null)).toBe(true)
      expect(u.length).toBeGreaterThanOrEqual(1) // Eve has null name
    })

    test('null filter - field is not null', async () => {
      const u = await prisma.covUser.findMany({ where: { name: { not: null } } })
      expect(u.every(x => x.name !== null)).toBe(true)
    })

    test('mode insensitive - case-insensitive contains (PG)', async () => {
      const u = await prisma.covUser.findMany({
        where: { name: { contains: 'alice', mode: 'insensitive' } }
      })
      expect(u.some(x => x.email === 'alice@cov.test')).toBe(true)
    })

    test('nested combination - AND + OR', async () => {
      const u = await prisma.covUser.findMany({
        where: {
          AND: [
            { active: true },
            { OR: [{ category: 'admin' }, { age: { lt: 26 } }] }
          ]
        }
      })
      expect(u.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // Pagination / Sorting
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Pagination and sorting', () => {
    test('take - limit results', async () => {
      const u = await prisma.covUser.findMany({ take: 2 })
      expect(u.length).toBe(2)
    })

    test('skip - offset results', async () => {
      const all = await prisma.covUser.findMany({ orderBy: { id: 'asc' } })
      const skipped = await prisma.covUser.findMany({ orderBy: { id: 'asc' }, skip: 1 })
      expect(skipped[0].id).toBe(all[1].id)
    })

    test('cursor - cursor-based pagination', async () => {
      const first = await prisma.covUser.findMany({ orderBy: { id: 'asc' }, take: 1 })
      const afterFirst = await prisma.covUser.findMany({
        orderBy: { id: 'asc' },
        cursor: { id: first[0].id },
        skip: 1,
        take: 2
      })
      expect(afterFirst.length).toBeLessThanOrEqual(2)
      expect(afterFirst.every(u => u.id > first[0].id)).toBe(true)
    })

    test('orderBy asc', async () => {
      const u = await prisma.covUser.findMany({ orderBy: { age: 'asc' }, where: { age: { not: null } } })
      const ages = u.map(x => x.age).filter(a => a != null) as number[]
      expect(ages).toEqual([...ages].sort((a, b) => a - b))
    })

    test('orderBy desc', async () => {
      const u = await prisma.covUser.findMany({ orderBy: { age: 'desc' }, where: { age: { not: null } } })
      const ages = u.map(x => x.age).filter(a => a != null) as number[]
      expect(ages).toEqual([...ages].sort((a, b) => b - a))
    })

    test('multi-field orderBy', async () => {
      const u = await prisma.covUser.findMany({
        orderBy: [{ category: 'asc' }, { name: 'asc' }]
      })
      expect(u.length).toBeGreaterThan(0)
      // Verify outer sort by category
      const cats = u.map(x => x.category ?? '').filter(Boolean)
      expect(cats).toEqual([...cats].sort())
    })

    test('orderBy with nulls last', async () => {
      const u = await prisma.covUser.findMany({
        orderBy: { age: { sort: 'asc', nulls: 'last' } }
      })
      // nulls should come last
      const lastFew = u.slice(-2)
      const hasNull = lastFew.some(x => x.age === null)
      expect(hasNull).toBe(true)
    })

    test('distinct - unique values', async () => {
      const u = await prisma.covUser.findMany({
        distinct: ['category'],
        orderBy: { category: 'asc' }
      })
      const cats = u.map(x => x.category)
      const uniqueCats = [...new Set(cats)]
      expect(cats.length).toBe(uniqueCats.length)
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // Field selection
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Field selection', () => {
    test('select - subset of fields', async () => {
      const u = await prisma.covUser.findUnique({
        where: { email: 'alice@cov.test' },
        select: { id: true, email: true }
      })
      expect(u?.id).toBeDefined()
      expect(u?.email).toBe('alice@cov.test')
      // @ts-expect-error: name should not be on this type
      expect((u as any).name).toBeUndefined()
    })

    test('include - load relation', async () => {
      const u = await prisma.covUser.findUnique({
        where: { email: 'alice@cov.test' },
        include: { posts: true }
      })
      expect(u?.posts).toBeDefined()
      expect(u?.posts.length).toBeGreaterThanOrEqual(2)
    })

    test('omit - exclude specific field', async () => {
      const u = await (prisma.covUser as any).findUnique({
        where: { email: 'alice@cov.test' },
        omit: { meta: true }
      })
      expect(u?.email).toBe('alice@cov.test')
      expect((u as any).meta).toBeUndefined()
    })

    test('nested select on relation', async () => {
      const u = await prisma.covUser.findUnique({
        where: { email: 'alice@cov.test' },
        select: {
          name: true,
          posts: { select: { title: true } }
        }
      })
      expect(u?.name).toBe('Alice')
      expect(u?.posts[0]).toHaveProperty('title')
      // @ts-expect-error: views should not be present
      expect((u?.posts[0] as any).views).toBeUndefined()
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // Aggregation
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Aggregation', () => {
    test('count - total records', async () => {
      const n = await prisma.covUser.count()
      expect(n).toBeGreaterThanOrEqual(5)
    })

    test('count - with where filter', async () => {
      const n = await prisma.covUser.count({ where: { category: 'admin' } })
      expect(n).toBeGreaterThanOrEqual(2)
    })

    test('aggregate _count', async () => {
      const agg = await prisma.covUser.aggregate({ _count: { _all: true } })
      expect(agg._count._all).toBeGreaterThanOrEqual(5)
    })

    test('aggregate _avg', async () => {
      const agg = await prisma.covUser.aggregate({
        _avg: { age: true },
        where: { age: { not: null } }
      })
      expect(agg._avg.age).not.toBeNull()
    })

    test('aggregate _sum', async () => {
      const agg = await prisma.covUser.aggregate({
        _sum: { age: true },
        where: { age: { not: null } }
      })
      expect(agg._sum.age).not.toBeNull()
    })

    test('aggregate _min', async () => {
      const agg = await prisma.covUser.aggregate({
        _min: { age: true },
        where: { age: { not: null } }
      })
      expect(agg._min.age).not.toBeNull()
    })

    test('aggregate _max', async () => {
      const agg = await prisma.covUser.aggregate({
        _max: { age: true },
        where: { age: { not: null } }
      })
      expect(agg._max.age).not.toBeNull()
    })

    test('groupBy by category with _count', async () => {
      const groups = await prisma.covUser.groupBy({
        by: ['category'],
        _count: { _all: true }
      })
      expect(groups.length).toBeGreaterThanOrEqual(2)
      const adminGroup = groups.find(g => g.category === 'admin')
      expect(adminGroup?._count._all).toBeGreaterThanOrEqual(2)
    })

    test('groupBy with having clause', async () => {
      const groups = await prisma.covUser.groupBy({
        by: ['category'],
        _count: { _all: true },
        having: { category: { not: null } }
      })
      expect(groups.every(g => g.category !== null)).toBe(true)
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // Atomic number updates
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Atomic number updates', () => {
    let postId: number

    beforeAll(async () => {
      const p = await prisma.covPost.findFirst({ where: { authorId: aliceId } })
      postId = p!.id
    })

    test('increment', async () => {
      const before = await prisma.covPost.findUnique({ where: { id: postId } })
      const after = await prisma.covPost.update({
        where: { id: postId },
        data: { views: { increment: 5 } }
      })
      expect(after.views).toBe((before!.views ?? 0) + 5)
    })

    test('decrement', async () => {
      const before = await prisma.covPost.findUnique({ where: { id: postId } })
      const after = await prisma.covPost.update({
        where: { id: postId },
        data: { views: { decrement: 2 } }
      })
      expect(after.views).toBe((before!.views ?? 0) - 2)
    })

    test('multiply', async () => {
      const before = await prisma.covPost.findUnique({ where: { id: postId } })
      const after = await prisma.covPost.update({
        where: { id: postId },
        data: { views: { multiply: 2 } }
      })
      expect(after.views).toBe((before!.views ?? 0) * 2)
    })

    test('divide', async () => {
      const before = await prisma.covPost.findUnique({ where: { id: postId } })
      const after = await prisma.covPost.update({
        where: { id: postId },
        data: { views: { divide: 2 } }
      })
      expect(after.views).toBe(Math.floor((before!.views ?? 0) / 2))
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // Scalar arrays (PG)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Scalar arrays (PG)', () => {
    test('create with tags array', async () => {
      const u = await prisma.covUser.create({
        data: { email: 'arr-create@cov.test', tags: ['a', 'b', 'c'], category: 'user' }
      })
      expect(u.tags).toEqual(['a', 'b', 'c'])
      await prisma.covUser.delete({ where: { id: u.id } })
    })

    test('read tags array (Alice)', async () => {
      const u = await prisma.covUser.findUnique({ where: { id: aliceId } })
      expect(u?.tags).toEqual(['admin', 'editor'])
    })

    test('filter has - array contains element', async () => {
      const u = await prisma.covUser.findMany({ where: { tags: { has: 'admin' } } })
      expect(u.some(x => x.id === aliceId)).toBe(true)
    })

    test('filter hasEvery - array contains all elements', async () => {
      const u = await prisma.covUser.findMany({ where: { tags: { hasEvery: ['admin', 'editor'] } } })
      expect(u.every(x => x.tags.includes('admin') && x.tags.includes('editor'))).toBe(true)
    })

    test('filter hasSome - array contains any element', async () => {
      const u = await prisma.covUser.findMany({ where: { tags: { hasSome: ['editor', 'nope'] } } })
      expect(u.every(x => x.tags.includes('editor'))).toBe(true)
    })

    test('filter isEmpty - empty array', async () => {
      const u = await prisma.covUser.findMany({ where: { tags: { isEmpty: true } } })
      expect(u.some(x => x.id === daveId)).toBe(true) // Dave has []
    })

    test('update set - replace array', async () => {
      await prisma.covUser.update({
        where: { id: bobId },
        data: { tags: { set: ['new-tag'] } }
      })
      const u = await prisma.covUser.findUnique({ where: { id: bobId } })
      expect(u?.tags).toEqual(['new-tag'])
    })

    test('update push - append to array', async () => {
      await prisma.covUser.update({
        where: { id: bobId },
        data: { tags: { push: ['pushed'] } }
      })
      const u = await prisma.covUser.findUnique({ where: { id: bobId } })
      expect(u?.tags).toContain('pushed')
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // JSON field
  // ─────────────────────────────────────────────────────────────────────────────
  describe('JSON field', () => {
    test('write meta object and read it back', async () => {
      const u = await prisma.covUser.findUnique({ where: { id: aliceId } })
      expect(typeof u?.meta).toBe('object')
      expect((u?.meta as any)?.role).toBe('admin')
    })

    test('update meta', async () => {
      await prisma.covUser.update({
        where: { id: aliceId },
        data: { meta: { role: 'superadmin', level: 99 } }
      })
      const u = await prisma.covUser.findUnique({ where: { id: aliceId } })
      expect((u?.meta as any)?.role).toBe('superadmin')
      expect((u?.meta as any)?.level).toBe(99)
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // Special types
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Special types', () => {
    test('Decimal round-trip (score)', async () => {
      const u = await prisma.covUser.findUnique({ where: { id: carolId } })
      // Prisma returns a Decimal; trailing zeros may be stripped by toString()
      expect(u?.score).not.toBeNull()
      expect(parseFloat(u?.score?.toString() ?? '0')).toBeCloseTo(8.25, 4)
    })

    test('BigInt round-trip (balance)', async () => {
      const u = await prisma.covUser.findUnique({ where: { id: aliceId } })
      expect(u?.balance).toBe(BigInt(100000))
    })

    test('DateTime round-trip (createdAt)', async () => {
      const u = await prisma.covUser.findUnique({ where: { id: aliceId } })
      expect(u?.createdAt).toBeInstanceOf(Date)
    })

    test('DateTime where filter - date range', async () => {
      const past = new Date(Date.now() - 1000 * 60 * 60) // 1 hour ago
      const future = new Date(Date.now() + 1000 * 60 * 60) // 1 hour ahead
      const u = await prisma.covUser.findMany({
        where: {
          createdAt: { gte: past, lte: future }
        }
      })
      expect(u.length).toBeGreaterThanOrEqual(5)
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // Relations and nested writes
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Relations and nested writes', () => {
    test('nested create - create user with posts', async () => {
      const u = await prisma.covUser.create({
        data: {
          email: 'nested-create@cov.test',
          name: 'NestedCreate',
          category: 'user',
          posts: {
            create: [{ title: 'Nested Post 1' }, { title: 'Nested Post 2' }]
          }
        },
        include: { posts: true }
      })
      expect(u.posts.length).toBe(2)
      await prisma.covPost.deleteMany({ where: { authorId: u.id } })
      await prisma.covUser.delete({ where: { id: u.id } })
    })

    test('connect - associate existing post with user', async () => {
      const tmpPost = await prisma.covPost.create({ data: { title: 'Tmp Post', authorId: bobId } })
      const u = await prisma.covUser.update({
        where: { id: carolId },
        data: { posts: { connect: { id: tmpPost.id } } },
        include: { posts: true }
      })
      expect(u.posts.some(p => p.id === tmpPost.id)).toBe(true)
      await prisma.covPost.delete({ where: { id: tmpPost.id } })
    })

    test('connectOrCreate - connect if exists, create if not', async () => {
      // This is on the to-one side: creating a post and connecting to Alice
      const u = await prisma.covPost.create({
        data: {
          title: 'ConnOrCreate Post',
          author: {
            connectOrCreate: {
              where: { email: 'alice@cov.test' },
              create: { email: 'alice@cov.test', name: 'AliceNew', category: 'admin' }
            }
          }
        },
        include: { author: true }
      })
      expect(u.author.email).toBe('alice@cov.test')
      await prisma.covPost.delete({ where: { id: u.id } })
    })

    test('disconnect - remove relation (to-many, optional FK)', async () => {
      // disconnect sets authorId to NULL on the post (optional relation)
      const tmpPost = await prisma.covPost.create({ data: { title: 'Disconnect Post', authorId: aliceId } })
      await prisma.covUser.update({
        where: { id: aliceId },
        data: { posts: { disconnect: { id: tmpPost.id } } }
      })
      const u = await prisma.covUser.findUnique({ where: { id: aliceId }, include: { posts: true } })
      expect(u?.posts.some(p => p.id === tmpPost.id)).toBe(false)
      // Cleanup orphaned post
      await prisma.covPost.delete({ where: { id: tmpPost.id } })
    })

    test('set - replace all related posts (optional FK)', async () => {
      // set disconnects posts not in the list (sets their authorId to NULL)
      const p1 = await prisma.covPost.create({ data: { title: 'Set Post 1', authorId: daveId } })
      const p2 = await prisma.covPost.create({ data: { title: 'Set Post 2', authorId: daveId } })
      await prisma.covUser.update({
        where: { id: daveId },
        data: { posts: { set: [{ id: p1.id }] } }
      })
      const u = await prisma.covUser.findUnique({ where: { id: daveId }, include: { posts: true } })
      expect(u?.posts.length).toBe(1)
      expect(u?.posts[0].id).toBe(p1.id)
      await prisma.covPost.deleteMany({ where: { id: { in: [p1.id, p2.id] } } })
    })

    test('nested update - update related post via user', async () => {
      const p = await prisma.covPost.findFirst({ where: { authorId: aliceId } })
      await prisma.covUser.update({
        where: { id: aliceId },
        data: {
          posts: { update: { where: { id: p!.id }, data: { title: 'Updated Title' } } }
        }
      })
      const updated = await prisma.covPost.findUnique({ where: { id: p!.id } })
      expect(updated?.title).toBe('Updated Title')
    })

    test('nested upsert - upsert related record', async () => {
      const p = await prisma.covPost.findFirst({ where: { authorId: aliceId } })
      await prisma.covUser.update({
        where: { id: aliceId },
        data: {
          posts: {
            upsert: {
              where: { id: p!.id },
              update: { title: 'Upserted Title' },
              create: { title: 'Would Be New' }
            }
          }
        }
      })
      const upserted = await prisma.covPost.findUnique({ where: { id: p!.id } })
      expect(upserted?.title).toBe('Upserted Title')
    })

    test('nested delete - delete related post via user', async () => {
      const tmpPost = await prisma.covPost.create({ data: { title: 'To Delete', authorId: aliceId } })
      await prisma.covUser.update({
        where: { id: aliceId },
        data: { posts: { delete: { id: tmpPost.id } } }
      })
      const deleted = await prisma.covPost.findUnique({ where: { id: tmpPost.id } })
      expect(deleted).toBeNull()
    })

    test('relation filter some - users with at least one matching post', async () => {
      const u = await prisma.covUser.findMany({
        where: { posts: { some: { views: { gt: 0 } } } }
      })
      expect(u.length).toBeGreaterThanOrEqual(1)
    })

    test('relation filter every - users where all posts match', async () => {
      const u = await prisma.covUser.findMany({
        where: { posts: { every: { views: { gte: 0 } } } }
      })
      expect(u.length).toBeGreaterThanOrEqual(1)
    })

    test('relation filter none - users with no posts matching', async () => {
      const u = await prisma.covUser.findMany({
        where: { posts: { none: { views: { gt: 1000 } } } }
      })
      expect(u.length).toBeGreaterThanOrEqual(1)
    })

    test('to-one is - filter by exact related record', async () => {
      const posts = await prisma.covPost.findMany({
        where: { author: { is: { email: 'alice@cov.test' } } }
      })
      expect(posts.every(p => p.authorId === aliceId)).toBe(true)
    })

    test('to-one isNot - filter excluding related record', async () => {
      const posts = await prisma.covPost.findMany({
        where: { author: { isNot: { email: 'alice@cov.test' } } }
      })
      expect(posts.every(p => p.authorId !== aliceId)).toBe(true)
    })

    test('include with nested where', async () => {
      const u = await prisma.covUser.findUnique({
        where: { id: aliceId },
        include: {
          posts: { where: { views: { gt: 5 } } }
        }
      })
      expect(u?.posts.every(p => p.views > 5)).toBe(true)
    })

    test('include with nested orderBy', async () => {
      const u = await prisma.covUser.findUnique({
        where: { id: aliceId },
        include: {
          posts: { orderBy: { views: 'desc' } }
        }
      })
      const views = u?.posts.map(p => p.views) ?? []
      expect(views).toEqual([...views].sort((a, b) => b - a))
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // Raw queries
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Raw queries', () => {
    test('$queryRaw - tagged template with param', async () => {
      const results = await prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*)::bigint AS total FROM prisma_cov_user WHERE category = ${'admin'}
      `
      expect(Array.isArray(results)).toBe(true)
      expect(Number(results[0].total)).toBeGreaterThanOrEqual(2)
    })

    test('$queryRawUnsafe - string SQL with params', async () => {
      const results = await prisma.$queryRawUnsafe<{ id: number }[]>(
        'SELECT id FROM prisma_cov_user WHERE email = $1',
        'alice@cov.test'
      )
      expect(Array.isArray(results)).toBe(true)
      expect(results[0].id).toBe(aliceId)
    })

    test('$executeRaw - tagged template', async () => {
      const count = await prisma.$executeRaw`
        UPDATE prisma_cov_user SET active = true WHERE category = ${'admin'}
      `
      expect(typeof count).toBe('number')
      expect(count).toBeGreaterThanOrEqual(1)
    })

    test('$executeRawUnsafe - string SQL with params', async () => {
      const count = await prisma.$executeRawUnsafe(
        'UPDATE prisma_cov_user SET active = true WHERE id = $1',
        aliceId
      )
      expect(typeof count).toBe('number')
      expect(count).toBeGreaterThanOrEqual(1)
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // Transactions
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Transactions', () => {
    test('sequential array form - all succeed', async () => {
      const [u1, u2] = await prisma.$transaction([
        prisma.covUser.create({ data: { email: 'txarr1@cov.test', name: 'TxArr1', category: 'user' } }),
        prisma.covUser.create({ data: { email: 'txarr2@cov.test', name: 'TxArr2', category: 'user' } })
      ])
      expect(u1.email).toBe('txarr1@cov.test')
      expect(u2.email).toBe('txarr2@cov.test')
      await prisma.covUser.deleteMany({ where: { email: { in: ['txarr1@cov.test', 'txarr2@cov.test'] } } })
    })

    test('interactive transaction - commit', async () => {
      await prisma.$transaction(async (tx) => {
        const u = await tx.covUser.create({
          data: { email: 'tx-commit@cov.test', name: 'TxCommit', category: 'user' }
        })
        await tx.covUser.update({ where: { id: u.id }, data: { age: 99 } })
      })
      const u = await prisma.covUser.findUnique({ where: { email: 'tx-commit@cov.test' } })
      expect(u?.age).toBe(99)
      await prisma.covUser.delete({ where: { email: 'tx-commit@cov.test' } })
    })

    test('interactive transaction - rollback on error', async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.covUser.create({ data: { email: 'tx-rollback@cov.test', name: 'TxRollback', category: 'user' } })
          throw new Error('Intentional rollback')
        })
      ).rejects.toThrow('Intentional rollback')

      const u = await prisma.covUser.findUnique({ where: { email: 'tx-rollback@cov.test' } })
      expect(u).toBeNull()
    })
  })
})
