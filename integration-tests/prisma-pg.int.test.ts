/**
 * Prisma Client over the Data API (PostgreSQL) integration tests.
 * Tables are created via raw DDL (Data API can't run prisma migrate).
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createPrismaPgAdapter } from '../src/compat/prisma'
import { loadConfig, type IntegrationTestConfig } from './setup'
import { PrismaClient } from './prisma/generated-pg'

const DDL = `
DROP TABLE IF EXISTS prisma_it_post;
DROP TABLE IF EXISTS prisma_it_user;
CREATE TABLE prisma_it_user (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  age INT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  meta JSONB
);
CREATE TABLE prisma_it_post (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  "authorId" INT NOT NULL REFERENCES prisma_it_user(id)
)`

describe('Prisma + Data API (PostgreSQL)', () => {
  let config: IntegrationTestConfig
  let prisma: PrismaClient

  beforeAll(async () => {
    config = loadConfig('pg')
    const factory = createPrismaPgAdapter({
      resourceArn: config.resourceArn,
      secretArn: config.secretArn,
      database: config.database
    })
    const setup = await factory.connect()
    await setup.executeScript(DDL)
    prisma = new PrismaClient({ adapter: factory } as any)
  }, 120000)

  afterAll(async () => {
    if (prisma) {
      const factory = createPrismaPgAdapter({
        resourceArn: config.resourceArn,
        secretArn: config.secretArn,
        database: config.database
      })
      const td = await factory.connect()
      await td.executeScript('DROP TABLE IF EXISTS prisma_it_post; DROP TABLE IF EXISTS prisma_it_user;')
      await prisma.$disconnect()
    }
  }, 60000)

  test('scalar create + findUnique', async () => {
    const u = await prisma.prismaUser.create({ data: { email: 'a@x.com', name: 'Alice', age: 30, meta: { role: 'admin' } } })
    expect(u.id).toBeGreaterThan(0)
    const found = await prisma.prismaUser.findUnique({ where: { email: 'a@x.com' } })
    expect(found?.name).toBe('Alice')
    expect(found?.meta).toEqual({ role: 'admin' })
  })

  test('array column write + read', async () => {
    const u = await prisma.prismaUser.create({ data: { email: 'b@x.com', name: 'Bob', tags: ['x', 'y', 'z'] } })
    const found = await prisma.prismaUser.findUnique({ where: { id: u.id } })
    expect(found?.tags).toEqual(['x', 'y', 'z'])
  })

  test('where id IN [...]', async () => {
    const users = await prisma.prismaUser.findMany({ where: { email: { in: ['a@x.com', 'b@x.com'] } } })
    expect(users.length).toBe(2)
  })

  test('array filter hasSome', async () => {
    const users = await prisma.prismaUser.findMany({ where: { tags: { hasSome: ['x', 'nope'] } } })
    expect(users.length).toBe(1)
  })

  test('relation create + include', async () => {
    const bob = await prisma.prismaUser.findUniqueOrThrow({ where: { email: 'b@x.com' } })
    await prisma.prismaPost.create({ data: { title: 'Hello', authorId: bob.id } })
    const posts = await prisma.prismaPost.findMany({ include: { author: true } })
    expect(posts[0].author.name).toBe('Bob')
  })

  test('interactive transaction commit', async () => {
    await prisma.$transaction(async (tx) => {
      await tx.prismaUser.create({ data: { email: 'c@x.com', name: 'Carol' } })
      await tx.prismaUser.update({ where: { email: 'c@x.com' }, data: { age: 40 } })
    })
    const c = await prisma.prismaUser.findUnique({ where: { email: 'c@x.com' } })
    expect(c?.age).toBe(40)
  })

  test('interactive transaction rollback', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.prismaUser.create({ data: { email: 'd@x.com', name: 'Dave' } })
        throw new Error('boom')
      })
    ).rejects.toThrow()
    const d = await prisma.prismaUser.findUnique({ where: { email: 'd@x.com' } })
    expect(d).toBeNull()
  })

  test('unique violation surfaces as a Prisma known error', async () => {
    await expect(prisma.prismaUser.create({ data: { email: 'a@x.com', name: 'dup' } })).rejects.toMatchObject({
      code: 'P2002'
    })
  })
})
