/**
 * Comprehensive Prisma Client API coverage test over the Aurora RDS Data API (MySQL).
 *
 * This file exercises the full Prisma query API against the Data API adapter
 * (createPrismaMySQLAdapter) to audit pass/fail coverage.
 *
 * Tables are created via raw DDL in beforeAll and dropped in afterAll.
 * Credentials must be sourced in the same command:
 *   source .env.local && npx vitest run integration-tests/prisma-mysql-coverage.int.test.ts
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createPrismaMySQLAdapter } from '../src/compat/prisma'
import { loadConfig } from './setup'
import { PrismaClient, Prisma } from './prisma/generated-mysql-coverage'

// ---------------------------------------------------------------------------
// DDL
// ---------------------------------------------------------------------------
const CREATE_DDL = `
DROP TABLE IF EXISTS prisma_cov_post;
DROP TABLE IF EXISTS prisma_cov_user;
CREATE TABLE prisma_cov_user (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  email     VARCHAR(191) UNIQUE NOT NULL,
  name      VARCHAR(191),
  age       INT,
  score     DECIMAL(10, 2),
  balance   BIGINT,
  active    TINYINT(1) NOT NULL DEFAULT 1,
  category  VARCHAR(191),
  meta      JSON,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE prisma_cov_post (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  title    VARCHAR(191) NOT NULL,
  views    INT NOT NULL DEFAULT 0,
  authorId INT NOT NULL,
  CONSTRAINT fk_cov_author FOREIGN KEY (authorId) REFERENCES prisma_cov_user(id)
)
`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type FactoryConfig = { resourceArn: string; secretArn: string; database: string }
let prisma: PrismaClient
let factoryConfig: FactoryConfig

// Seed data — inserted once before each top-level describe group.
// We teardown+re-seed within each group so groups are independent.
const SEED_USERS = [
  { email: 'alice@cov.test', name: 'Alice', age: 30, score: new Prisma.Decimal('9.50'), balance: BigInt(1000000), active: true, category: 'admin' },
  { email: 'bob@cov.test', name: 'Bob', age: 25, score: new Prisma.Decimal('7.25'), balance: BigInt(500000), active: true, category: 'user' },
  { email: 'carol@cov.test', name: 'Carol', age: 35, score: new Prisma.Decimal('8.00'), balance: BigInt(250000), active: false, category: 'user' },
  { email: 'dave@cov.test', name: null, age: null, score: null, balance: null, active: true, category: 'admin' },
]

async function truncate() {
  await prisma.$executeRawUnsafe('DELETE FROM prisma_cov_post')
  await prisma.$executeRawUnsafe('DELETE FROM prisma_cov_user')
}

async function seed() {
  await truncate()
  for (const u of SEED_USERS) {
    await prisma.covUser.create({ data: u })
  }
}

// ---------------------------------------------------------------------------
// Global setup / teardown
// ---------------------------------------------------------------------------
beforeAll(async () => {
  const cfg = loadConfig('mysql')
  factoryConfig = { resourceArn: cfg.resourceArn, secretArn: cfg.secretArn, database: cfg.database }
  const factory = createPrismaMySQLAdapter(factoryConfig)
  const setup = await factory.connect()
  await setup.executeScript(CREATE_DDL)
  prisma = new PrismaClient({ adapter: factory } as any)
}, 120000)

afterAll(async () => {
  if (prisma) {
    const factory = createPrismaMySQLAdapter(factoryConfig)
    const td = await factory.connect()
    await td.executeScript('DROP TABLE IF EXISTS prisma_cov_post; DROP TABLE IF EXISTS prisma_cov_user;')
    await prisma.$disconnect()
  }
}, 60000)

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
describe('CRUD', () => {
  beforeEach(seed)

  test('create — returns autoincrement id', async () => {
    const u = await prisma.covUser.create({
      data: { email: 'new@cov.test', name: 'New', age: 20, category: 'user' },
    })
    expect(u.id).toBeGreaterThan(0)
    expect(u.name).toBe('New')
    expect(u.active).toBe(true) // default
  })

  test('createMany — inserts multiple rows', async () => {
    await truncate()
    const result = await prisma.covUser.createMany({
      data: [
        { email: 'x@cov.test', name: 'X', age: 10, category: 'user' },
        { email: 'y@cov.test', name: 'Y', age: 20, category: 'user' },
      ],
    })
    expect(result.count).toBe(2)
  })

  test('createMany — skipDuplicates ignores unique conflicts', async () => {
    // alice already exists from seed
    const result = await prisma.covUser.createMany({
      data: [
        { email: 'alice@cov.test', name: 'AliceDup', age: 99, category: 'user' },
        { email: 'zzz@cov.test', name: 'ZZZ', age: 5, category: 'user' },
      ],
      skipDuplicates: true,
    })
    expect(result.count).toBe(1) // only zzz inserted
  })

  test('findUnique — by unique field', async () => {
    const u = await prisma.covUser.findUnique({ where: { email: 'alice@cov.test' } })
    expect(u?.name).toBe('Alice')
  })

  test('findUniqueOrThrow — throws when not found', async () => {
    await expect(
      prisma.covUser.findUniqueOrThrow({ where: { email: 'nobody@cov.test' } })
    ).rejects.toMatchObject({ code: 'P2025' })
  })

  test('findFirst — returns first matching row', async () => {
    // MySQL sorts NULLs first in ASC order, so exclude null-age rows.
    const u = await prisma.covUser.findFirst({
      where: { active: true, age: { not: null } },
      orderBy: { age: 'asc' },
    })
    expect(u?.email).toBe('bob@cov.test') // Bob age 25, smallest active with non-null age
  })

  test('findFirstOrThrow — throws when not found', async () => {
    await expect(
      prisma.covUser.findFirstOrThrow({ where: { email: 'nobody@cov.test' } })
    ).rejects.toMatchObject({ code: 'P2025' })
  })

  test('findMany — returns all rows', async () => {
    const users = await prisma.covUser.findMany()
    expect(users.length).toBe(4)
  })

  test('update — modifies a field', async () => {
    const updated = await prisma.covUser.update({
      where: { email: 'alice@cov.test' },
      data: { age: 99 },
    })
    expect(updated.age).toBe(99)
  })

  test('updateMany — updates multiple rows', async () => {
    const result = await prisma.covUser.updateMany({
      where: { category: 'user' },
      data: { active: false },
    })
    expect(result.count).toBeGreaterThanOrEqual(2)
  })

  test('upsert — create path (record does not exist)', async () => {
    const u = await prisma.covUser.upsert({
      where: { email: 'upsert-new@cov.test' },
      create: { email: 'upsert-new@cov.test', name: 'UpsertNew', age: 1, category: 'user' },
      update: { age: 99 },
    })
    expect(u.name).toBe('UpsertNew')
    expect(u.age).toBe(1)
  })

  test('upsert — update path (record exists)', async () => {
    const u = await prisma.covUser.upsert({
      where: { email: 'alice@cov.test' },
      create: { email: 'alice@cov.test', name: 'AliceNew', age: 0, category: 'user' },
      update: { age: 42 },
    })
    expect(u.age).toBe(42)
  })

  test('delete — removes a row', async () => {
    await prisma.covUser.delete({ where: { email: 'dave@cov.test' } })
    const found = await prisma.covUser.findUnique({ where: { email: 'dave@cov.test' } })
    expect(found).toBeNull()
  })

  test('deleteMany — removes multiple rows', async () => {
    const result = await prisma.covUser.deleteMany({ where: { category: 'user' } })
    expect(result.count).toBeGreaterThanOrEqual(2)
  })

  // createManyAndReturn: Prisma 7.x exposes this method on MySQL but it requires
  // the underlying driver to support RETURNING, which MySQL does not. The method
  // exists but Prisma throws at query-plan time when used against MySQL.
  // We document that the method exists (function) but execution throws.
  test('createManyAndReturn — method exists but MySQL lacks RETURNING (EXPECTED-UNSUPPORTED)', async () => {
    // The method is present as a function on newer Prisma clients even for MySQL
    expect(typeof prisma.covUser.createManyAndReturn).toBe('function')
    // Attempting to call it should throw a Prisma error about unsupported feature
    await expect(
      prisma.covUser.createManyAndReturn({
        data: [{ email: 'cmar@cov.test', name: 'CmarUser', category: 'user' }],
      })
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Filtering operators
// ---------------------------------------------------------------------------
describe('Filtering operators', () => {
  beforeEach(seed)

  test('equals (implicit)', async () => {
    const users = await prisma.covUser.findMany({ where: { name: 'Alice' } })
    expect(users.length).toBe(1)
  })

  test('not (scalar)', async () => {
    const users = await prisma.covUser.findMany({ where: { name: { not: 'Alice' } } })
    // Bob, Carol, Dave(null) — not returns rows with non-matching values; null handling depends on Prisma
    // Dave has name=null, which Prisma's `not` skips (SQL IS NULL != != 'Alice')
    expect(users.some((u) => u.name === 'Bob')).toBe(true)
  })

  test('in', async () => {
    const users = await prisma.covUser.findMany({ where: { email: { in: ['alice@cov.test', 'bob@cov.test'] } } })
    expect(users.length).toBe(2)
  })

  test('notIn', async () => {
    const users = await prisma.covUser.findMany({ where: { email: { notIn: ['alice@cov.test', 'bob@cov.test'] } } })
    expect(users.length).toBe(2) // Carol, Dave
  })

  test('lt', async () => {
    const users = await prisma.covUser.findMany({ where: { age: { lt: 30 } } })
    expect(users.every((u) => (u.age ?? 99) < 30)).toBe(true)
  })

  test('lte', async () => {
    const users = await prisma.covUser.findMany({ where: { age: { lte: 30 } } })
    expect(users.every((u) => (u.age ?? 99) <= 30)).toBe(true)
  })

  test('gt', async () => {
    const users = await prisma.covUser.findMany({ where: { age: { gt: 30 } } })
    expect(users.every((u) => (u.age ?? 0) > 30)).toBe(true)
  })

  test('gte', async () => {
    const users = await prisma.covUser.findMany({ where: { age: { gte: 30 } } })
    expect(users.every((u) => (u.age ?? 0) >= 30)).toBe(true)
  })

  test('contains', async () => {
    const users = await prisma.covUser.findMany({ where: { name: { contains: 'li' } } })
    expect(users.some((u) => u.name === 'Alice')).toBe(true)
  })

  test('startsWith', async () => {
    const users = await prisma.covUser.findMany({ where: { name: { startsWith: 'Al' } } })
    expect(users.length).toBe(1)
    expect(users[0].name).toBe('Alice')
  })

  test('endsWith', async () => {
    const users = await prisma.covUser.findMany({ where: { name: { endsWith: 'ob' } } })
    expect(users.length).toBe(1)
    expect(users[0].name).toBe('Bob')
  })

  test('AND (explicit)', async () => {
    const users = await prisma.covUser.findMany({
      where: { AND: [{ age: { gte: 25 } }, { active: true }] },
    })
    expect(users.every((u) => (u.age ?? 0) >= 25 && u.active)).toBe(true)
  })

  test('OR', async () => {
    const users = await prisma.covUser.findMany({
      where: { OR: [{ email: 'alice@cov.test' }, { email: 'bob@cov.test' }] },
    })
    expect(users.length).toBe(2)
  })

  test('NOT (top-level)', async () => {
    const users = await prisma.covUser.findMany({
      where: { NOT: { email: 'alice@cov.test' } },
    })
    expect(users.every((u) => u.email !== 'alice@cov.test')).toBe(true)
  })

  test('null filter — { field: null }', async () => {
    const users = await prisma.covUser.findMany({ where: { name: null } })
    expect(users.every((u) => u.name === null)).toBe(true)
    expect(users.length).toBe(1) // Dave
  })

  test('null filter — { field: { not: null } }', async () => {
    const users = await prisma.covUser.findMany({ where: { name: { not: null } } })
    expect(users.every((u) => u.name !== null)).toBe(true)
    expect(users.length).toBe(3)
  })

  test('nested AND+OR combination', async () => {
    const users = await prisma.covUser.findMany({
      where: {
        AND: [
          { active: true },
          { OR: [{ category: 'admin' }, { age: { lt: 28 } }] },
        ],
      },
    })
    // Alice (active, admin), Bob (active, age 25 < 28), Dave (active, admin, null age)
    expect(users.length).toBeGreaterThanOrEqual(2)
  })

  // mode: 'insensitive' is NOT supported on MySQL by Prisma (MySQL is case-insensitive by default
  // via collation, but Prisma does not expose the `mode` option for MySQL).
  // Prisma throws a validation error when you attempt to use it.
  test('mode: insensitive — EXPECTED-UNSUPPORTED on MySQL', async () => {
    await expect(
      prisma.covUser.findMany({
        where: {
          // @ts-expect-error - mode not supported on MySQL
          name: { contains: 'alice', mode: 'insensitive' },
        },
      })
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Pagination / sorting
// ---------------------------------------------------------------------------
describe('Pagination and sorting', () => {
  beforeEach(seed)

  test('take', async () => {
    const users = await prisma.covUser.findMany({ take: 2, orderBy: { id: 'asc' } })
    expect(users.length).toBe(2)
  })

  test('skip', async () => {
    const all = await prisma.covUser.findMany({ orderBy: { id: 'asc' } })
    const skipped = await prisma.covUser.findMany({ skip: 1, orderBy: { id: 'asc' } })
    expect(skipped[0].id).toBe(all[1].id)
  })

  test('cursor', async () => {
    const all = await prisma.covUser.findMany({ orderBy: { id: 'asc' } })
    const cursor = all[1].id
    const page = await prisma.covUser.findMany({ cursor: { id: cursor }, orderBy: { id: 'asc' } })
    expect(page[0].id).toBe(cursor)
  })

  test('orderBy asc', async () => {
    const users = await prisma.covUser.findMany({ orderBy: { age: 'asc' }, where: { age: { not: null } } })
    for (let i = 1; i < users.length; i++) {
      expect((users[i].age ?? 0) >= (users[i - 1].age ?? 0)).toBe(true)
    }
  })

  test('orderBy desc', async () => {
    const users = await prisma.covUser.findMany({ orderBy: { age: 'desc' }, where: { age: { not: null } } })
    for (let i = 1; i < users.length; i++) {
      expect((users[i].age ?? 99) <= (users[i - 1].age ?? 0)).toBe(true)
    }
  })

  test('multi-field orderBy', async () => {
    const users = await prisma.covUser.findMany({ orderBy: [{ category: 'asc' }, { age: 'asc' }] })
    expect(users.length).toBe(4)
  })

  test('distinct', async () => {
    const rows = await prisma.covUser.findMany({
      select: { category: true },
      distinct: ['category'],
      where: { category: { not: null } },
    })
    const cats = rows.map((r) => r.category)
    expect(cats.length).toBe(new Set(cats).size)
    expect(cats.length).toBe(2) // admin, user
  })
})

// ---------------------------------------------------------------------------
// Field selection
// ---------------------------------------------------------------------------
describe('Field selection', () => {
  beforeEach(seed)

  test('select (subset of fields)', async () => {
    const users = await prisma.covUser.findMany({ select: { id: true, email: true } })
    expect(users[0]).toHaveProperty('id')
    expect(users[0]).toHaveProperty('email')
    expect(users[0]).not.toHaveProperty('name')
  })

  test('include (relation)', async () => {
    const alice = await prisma.covUser.findUniqueOrThrow({ where: { email: 'alice@cov.test' } })
    await prisma.covPost.create({ data: { title: 'Test Post', authorId: alice.id } })
    const user = await prisma.covUser.findUnique({ where: { email: 'alice@cov.test' }, include: { posts: true } })
    expect(Array.isArray(user?.posts)).toBe(true)
    expect(user?.posts.length).toBe(1)
  })

  test('omit (exclude a field)', async () => {
    const user = await prisma.covUser.findFirst({ omit: { meta: true } })
    expect(user).not.toHaveProperty('meta')
    expect(user).toHaveProperty('email')
  })

  test('nested select on relation', async () => {
    const alice = await prisma.covUser.findUniqueOrThrow({ where: { email: 'alice@cov.test' } })
    await prisma.covPost.create({ data: { title: 'Nested Select Post', authorId: alice.id } })
    const posts = await prisma.covPost.findMany({
      select: {
        title: true,
        author: { select: { name: true } },
      },
    })
    expect(posts[0]).toHaveProperty('title')
    expect(posts[0].author).toHaveProperty('name')
    expect(posts[0].author).not.toHaveProperty('email')
  })
})

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------
describe('Aggregation', () => {
  beforeEach(seed)

  test('count — total rows', async () => {
    const result = await prisma.covUser.count()
    expect(result).toBe(4)
  })

  test('count — with where', async () => {
    const result = await prisma.covUser.count({ where: { active: true } })
    expect(result).toBe(3)
  })

  test('aggregate — _count, _avg, _sum, _min, _max', async () => {
    const result = await prisma.covUser.aggregate({
      _count: { id: true },
      _avg: { age: true },
      _sum: { age: true },
      _min: { age: true },
      _max: { age: true },
      where: { age: { not: null } },
    })
    expect(result._count.id).toBe(3)
    expect(result._avg.age).toBeCloseTo((30 + 25 + 35) / 3, 1)
    expect(result._sum.age).toBe(90)
    expect(result._min.age).toBe(25)
    expect(result._max.age).toBe(35)
  })

  test('groupBy — by category with _count', async () => {
    const groups = await prisma.covUser.groupBy({
      by: ['category'],
      _count: { id: true },
      where: { category: { not: null } },
    })
    expect(groups.length).toBe(2) // admin, user
    const adminGroup = groups.find((g) => g.category === 'admin')
    expect(adminGroup?._count.id).toBe(2)
  })

  test('groupBy — with having', async () => {
    const groups = await prisma.covUser.groupBy({
      by: ['category'],
      _count: { id: true },
      having: { id: { _count: { gt: 1 } } },
      where: { category: { not: null } },
    })
    // Both admin and user have 2 members, so both qualify
    expect(groups.length).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// Atomic number updates
// ---------------------------------------------------------------------------
describe('Atomic number operations', () => {
  beforeEach(async () => {
    await seed()
    const alice = await prisma.covUser.findUniqueOrThrow({ where: { email: 'alice@cov.test' } })
    // Give Alice a post to work with
    await prisma.covPost.create({ data: { title: 'Atomic Post', views: 10, authorId: alice.id } })
  })

  test('increment', async () => {
    const post = await prisma.covPost.findFirst({ where: { title: 'Atomic Post' } })
    const updated = await prisma.covPost.update({
      where: { id: post!.id },
      data: { views: { increment: 5 } },
    })
    expect(updated.views).toBe(15)
  })

  test('decrement', async () => {
    const post = await prisma.covPost.findFirst({ where: { title: 'Atomic Post' } })
    const updated = await prisma.covPost.update({
      where: { id: post!.id },
      data: { views: { decrement: 3 } },
    })
    expect(updated.views).toBe(7)
  })

  test('multiply', async () => {
    const post = await prisma.covPost.findFirst({ where: { title: 'Atomic Post' } })
    const updated = await prisma.covPost.update({
      where: { id: post!.id },
      data: { views: { multiply: 2 } },
    })
    expect(updated.views).toBe(20)
  })

  test('divide', async () => {
    const post = await prisma.covPost.findFirst({ where: { title: 'Atomic Post' } })
    const updated = await prisma.covPost.update({
      where: { id: post!.id },
      data: { views: { divide: 2 } },
    })
    expect(updated.views).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// JSON field
// ---------------------------------------------------------------------------
describe('JSON field', () => {
  beforeEach(seed)

  test('write meta object and read it back', async () => {
    const created = await prisma.covUser.create({
      data: { email: 'json@cov.test', name: 'JsonUser', category: 'user', meta: { role: 'admin', level: 3 } },
    })
    expect(created.meta).toEqual({ role: 'admin', level: 3 })
  })

  test('update meta', async () => {
    await prisma.covUser.update({
      where: { email: 'alice@cov.test' },
      data: { meta: { updated: true } },
    })
    const found = await prisma.covUser.findUnique({ where: { email: 'alice@cov.test' } })
    expect(found?.meta).toEqual({ updated: true })
  })

  test('meta null by default', async () => {
    const found = await prisma.covUser.findUnique({ where: { email: 'bob@cov.test' } })
    expect(found?.meta).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Special types
// ---------------------------------------------------------------------------
describe('Special types', () => {
  beforeEach(seed)

  test('Decimal round-trip', async () => {
    const found = await prisma.covUser.findUnique({ where: { email: 'alice@cov.test' } })
    // Prisma returns Decimal as a Decimal.js instance.
    // MySQL may strip trailing zeros (9.50 → 9.5), so compare numerically.
    expect(found?.score?.toNumber()).toBeCloseTo(9.5, 2)
    // Confirm the value is a Prisma Decimal (not a plain number/string)
    expect(found?.score).toBeInstanceOf(Prisma.Decimal)
  })

  test('BigInt round-trip', async () => {
    const found = await prisma.covUser.findUnique({ where: { email: 'alice@cov.test' } })
    expect(found?.balance).toBe(BigInt(1000000))
  })

  test('DateTime round-trip + date range filter', async () => {
    const past = new Date('2020-01-01T00:00:00Z')
    const future = new Date('2099-01-01T00:00:00Z')
    const users = await prisma.covUser.findMany({
      where: { createdAt: { gte: past, lte: future } },
    })
    expect(users.length).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// Relations + nested writes
// ---------------------------------------------------------------------------
describe('Relations and nested writes', () => {
  beforeEach(seed)

  test('nested create — user with posts in one call', async () => {
    const user = await prisma.covUser.create({
      data: {
        email: 'nested@cov.test',
        name: 'NestedUser',
        category: 'user',
        posts: {
          create: [{ title: 'Post One' }, { title: 'Post Two' }],
        },
      },
      include: { posts: true },
    })
    expect(user.posts.length).toBe(2)
  })

  test('connect — attach an existing user as post author', async () => {
    const alice = await prisma.covUser.findUniqueOrThrow({ where: { email: 'alice@cov.test' } })
    const post = await prisma.covPost.create({
      data: { title: 'Connect Post', author: { connect: { id: alice.id } } },
    })
    expect(post.authorId).toBe(alice.id)
  })

  test('connectOrCreate — creates user if not found, connects if found', async () => {
    const post = await prisma.covPost.create({
      data: {
        title: 'ConnectOrCreate Post',
        author: {
          connectOrCreate: {
            where: { email: 'coc@cov.test' },
            create: { email: 'coc@cov.test', name: 'CocUser', category: 'user' },
          },
        },
      },
      include: { author: true },
    })
    expect(post.author.email).toBe('coc@cov.test')
  })

  test('nested update — update post title through user', async () => {
    const alice = await prisma.covUser.findUniqueOrThrow({ where: { email: 'alice@cov.test' } })
    await prisma.covPost.create({ data: { title: 'Before Update', authorId: alice.id } })
    const post = await prisma.covPost.findFirst({ where: { title: 'Before Update' } })
    await prisma.covUser.update({
      where: { email: 'alice@cov.test' },
      data: {
        posts: {
          update: {
            where: { id: post!.id },
            data: { title: 'After Update' },
          },
        },
      },
    })
    const updated = await prisma.covPost.findUnique({ where: { id: post!.id } })
    expect(updated?.title).toBe('After Update')
  })

  test('nested upsert — upsert post through user relation', async () => {
    const alice = await prisma.covUser.findUniqueOrThrow({ where: { email: 'alice@cov.test' } })
    const p = await prisma.covPost.create({ data: { title: 'Upsert Post', authorId: alice.id } })
    await prisma.covUser.update({
      where: { email: 'alice@cov.test' },
      data: {
        posts: {
          upsert: {
            where: { id: p.id },
            create: { title: 'Upsert Create' },
            update: { title: 'Upsert Updated' },
          },
        },
      },
    })
    const found = await prisma.covPost.findUnique({ where: { id: p.id } })
    expect(found?.title).toBe('Upsert Updated')
  })

  test('nested delete — delete post through user relation', async () => {
    const alice = await prisma.covUser.findUniqueOrThrow({ where: { email: 'alice@cov.test' } })
    const p = await prisma.covPost.create({ data: { title: 'To Be Deleted', authorId: alice.id } })
    await prisma.covUser.update({
      where: { email: 'alice@cov.test' },
      data: {
        posts: {
          delete: { id: p.id },
        },
      },
    })
    const found = await prisma.covPost.findUnique({ where: { id: p.id } })
    expect(found).toBeNull()
  })

  test('disconnect — detach is not supported on non-optional 1-M (FK required)', async () => {
    // On a required foreign key (authorId NOT NULL), disconnect is not possible.
    // Prisma should throw an error.
    const alice = await prisma.covUser.findUniqueOrThrow({ where: { email: 'alice@cov.test' } })
    const p = await prisma.covPost.create({ data: { title: 'Disconnect Test', authorId: alice.id } })
    await expect(
      prisma.covUser.update({
        where: { email: 'alice@cov.test' },
        data: {
          posts: {
            // @ts-expect-error - disconnect not allowed on required relation
            disconnect: { id: p.id },
          },
        },
      })
    ).rejects.toThrow()
  })

  test('set — replace posts collection', async () => {
    const alice = await prisma.covUser.findUniqueOrThrow({ where: { email: 'alice@cov.test' } })
    // Create two posts
    await prisma.covPost.createMany({
      data: [
        { title: 'Set Post 1', authorId: alice.id },
        { title: 'Set Post 2', authorId: alice.id },
      ],
    })
    // `set` on required 1-M can only set to existing (already-owned) posts.
    // Setting to an empty array disconnects all — but authorId NOT NULL prevents it.
    // On MySQL with required FK, `set` is not supported. Document the behavior.
    await expect(
      prisma.covUser.update({
        where: { email: 'alice@cov.test' },
        data: {
          posts: {
            // @ts-expect-error - set not supported on required relation
            set: [],
          },
        },
      })
    ).rejects.toThrow()
  })

  test('relation filter — some', async () => {
    const alice = await prisma.covUser.findUniqueOrThrow({ where: { email: 'alice@cov.test' } })
    await prisma.covPost.create({ data: { title: 'Some Filter Post', authorId: alice.id } })
    const users = await prisma.covUser.findMany({
      where: { posts: { some: { title: { contains: 'Filter' } } } },
    })
    expect(users.some((u) => u.email === 'alice@cov.test')).toBe(true)
  })

  test('relation filter — every', async () => {
    const alice = await prisma.covUser.findUniqueOrThrow({ where: { email: 'alice@cov.test' } })
    await prisma.covPost.createMany({
      data: [
        { title: 'Every Post A', authorId: alice.id },
        { title: 'Every Post B', authorId: alice.id },
      ],
    })
    const users = await prisma.covUser.findMany({
      where: { posts: { every: { title: { startsWith: 'Every' } } } },
    })
    // Alice's posts all start with 'Every'; users with no posts also satisfy 'every'
    expect(users.length).toBeGreaterThanOrEqual(1)
  })

  test('relation filter — none', async () => {
    // Users with no posts
    const users = await prisma.covUser.findMany({
      where: { posts: { none: {} } },
    })
    // Bob, Carol, Dave have no posts
    expect(users.length).toBeGreaterThanOrEqual(3)
  })

  test('relation filter — is (to-one)', async () => {
    const alice = await prisma.covUser.findUniqueOrThrow({ where: { email: 'alice@cov.test' } })
    await prisma.covPost.create({ data: { title: 'Is Filter Post', authorId: alice.id } })
    const posts = await prisma.covPost.findMany({
      where: { author: { is: { email: 'alice@cov.test' } } },
    })
    expect(posts.every((p) => p.authorId === alice.id)).toBe(true)
  })

  test('relation filter — isNot (to-one)', async () => {
    const alice = await prisma.covUser.findUniqueOrThrow({ where: { email: 'alice@cov.test' } })
    const bob = await prisma.covUser.findUniqueOrThrow({ where: { email: 'bob@cov.test' } })
    await prisma.covPost.create({ data: { title: 'IsNot Post A', authorId: alice.id } })
    await prisma.covPost.create({ data: { title: 'IsNot Post B', authorId: bob.id } })
    const posts = await prisma.covPost.findMany({
      where: { author: { isNot: { email: 'alice@cov.test' } } },
    })
    expect(posts.every((p) => p.authorId !== alice.id)).toBe(true)
  })

  test('include with nested where and orderBy', async () => {
    const alice = await prisma.covUser.findUniqueOrThrow({ where: { email: 'alice@cov.test' } })
    await prisma.covPost.createMany({
      data: [
        { title: 'Nested Where A', views: 10, authorId: alice.id },
        { title: 'Nested Where B', views: 20, authorId: alice.id },
        { title: 'Nested Where C', views: 5, authorId: alice.id },
      ],
    })
    const user = await prisma.covUser.findUnique({
      where: { email: 'alice@cov.test' },
      include: {
        posts: {
          where: { views: { gte: 10 } },
          orderBy: { views: 'desc' },
        },
      },
    })
    expect(user?.posts.length).toBe(2)
    expect(user?.posts[0].views).toBeGreaterThanOrEqual(user?.posts[1].views ?? 0)
  })
})

// ---------------------------------------------------------------------------
// Raw queries
// ---------------------------------------------------------------------------
describe('Raw queries', () => {
  beforeEach(seed)

  test('$queryRaw — tagged template with a param', async () => {
    // Use 1 instead of true: MySQL TINYINT(1) active column compares correctly to integer 1.
    // Prisma's raw query template maps boolean true to 1 for MySQL but the binding
    // goes through the Data API as booleanValue which MySQL may not coerce in WHERE.
    const rows = await prisma.$queryRaw<{ cnt: bigint }[]>`SELECT COUNT(*) as cnt FROM prisma_cov_user WHERE active = ${1}`
    expect(Number(rows[0].cnt)).toBe(3)
  })

  test('$queryRawUnsafe — string query', async () => {
    const rows = await prisma.$queryRawUnsafe<{ email: string }[]>(
      'SELECT email FROM prisma_cov_user WHERE email = ?',
      'alice@cov.test'
    )
    expect(rows[0].email).toBe('alice@cov.test')
  })

  test('$executeRaw — tagged template', async () => {
    const count = await prisma.$executeRaw`UPDATE prisma_cov_user SET age = ${99} WHERE email = ${'alice@cov.test'}`
    expect(count).toBe(1)
  })

  test('$executeRawUnsafe — string query', async () => {
    const count = await prisma.$executeRawUnsafe(
      'UPDATE prisma_cov_user SET age = ? WHERE email = ?',
      88,
      'bob@cov.test'
    )
    expect(count).toBe(1)
    const bob = await prisma.covUser.findUnique({ where: { email: 'bob@cov.test' } })
    expect(bob?.age).toBe(88)
  })
})

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------
describe('Transactions', () => {
  beforeEach(seed)

  test('sequential array form — $transaction([...])', async () => {
    const [created, updated] = await prisma.$transaction([
      prisma.covUser.create({ data: { email: 'tx-array@cov.test', name: 'TxArray', category: 'user' } }),
      prisma.covUser.update({ where: { email: 'alice@cov.test' }, data: { age: 55 } }),
    ])
    expect((created as any).email).toBe('tx-array@cov.test')
    expect((updated as any).age).toBe(55)
  })

  test('interactive transaction — commit', async () => {
    await prisma.$transaction(async (tx) => {
      await tx.covUser.create({ data: { email: 'tx-commit@cov.test', name: 'TxCommit', category: 'user' } })
      await tx.covUser.update({ where: { email: 'alice@cov.test' }, data: { age: 77 } })
    })
    const user = await prisma.covUser.findUnique({ where: { email: 'tx-commit@cov.test' } })
    expect(user).not.toBeNull()
    const alice = await prisma.covUser.findUnique({ where: { email: 'alice@cov.test' } })
    expect(alice?.age).toBe(77)
  })

  test('interactive transaction — rollback on throw', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.covUser.create({ data: { email: 'tx-rollback@cov.test', name: 'TxRollback', category: 'user' } })
        throw new Error('intentional rollback')
      })
    ).rejects.toThrow('intentional rollback')
    const user = await prisma.covUser.findUnique({ where: { email: 'tx-rollback@cov.test' } })
    expect(user).toBeNull()
  })
})
