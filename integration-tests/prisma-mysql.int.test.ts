/**
 * Prisma Client over the Data API (MySQL) integration tests.
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createPrismaMySQLAdapter } from '../src/compat/prisma'
import { loadConfig, type IntegrationTestConfig } from './setup'
import { PrismaClient } from './prisma/generated-mysql'

const DDL = `
DROP TABLE IF EXISTS prisma_it_post;
DROP TABLE IF EXISTS prisma_it_user;
CREATE TABLE prisma_it_user (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(191) UNIQUE NOT NULL,
  name VARCHAR(191),
  age INT,
  active TINYINT(1) NOT NULL DEFAULT 1
);
CREATE TABLE prisma_it_post (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(191) NOT NULL,
  authorId INT NOT NULL,
  CONSTRAINT fk_author FOREIGN KEY (authorId) REFERENCES prisma_it_user(id)
)`

describe('Prisma + Data API (MySQL)', () => {
  let config: IntegrationTestConfig
  let prisma: PrismaClient
  let factoryConfig: { resourceArn: string; secretArn: string; database: string }

  beforeAll(async () => {
    config = loadConfig('mysql')
    factoryConfig = { resourceArn: config.resourceArn, secretArn: config.secretArn, database: config.database }
    const factory = createPrismaMySQLAdapter(factoryConfig)
    const setup = await factory.connect()
    await setup.executeScript(DDL)
    prisma = new PrismaClient({ adapter: factory } as any)
  }, 120000)

  afterAll(async () => {
    if (prisma) {
      const factory = createPrismaMySQLAdapter(factoryConfig)
      const td = await factory.connect()
      await td.executeScript('DROP TABLE IF EXISTS prisma_it_post; DROP TABLE IF EXISTS prisma_it_user;')
      await prisma.$disconnect()
    }
  }, 60000)

  test('create returns autoincrement id (lastInsertId)', async () => {
    const u = await prisma.prismaUser.create({ data: { email: 'a@x.com', name: 'Alice', age: 30 } })
    expect(u.id).toBeGreaterThan(0)
    expect(u.active).toBe(true)
  })

  test('findUnique + update', async () => {
    await prisma.prismaUser.update({ where: { email: 'a@x.com' }, data: { age: 31 } })
    const found = await prisma.prismaUser.findUnique({ where: { email: 'a@x.com' } })
    expect(found?.age).toBe(31)
  })

  test('where id IN [...]', async () => {
    await prisma.prismaUser.create({ data: { email: 'b@x.com', name: 'Bob' } })
    const users = await prisma.prismaUser.findMany({ where: { email: { in: ['a@x.com', 'b@x.com'] } } })
    expect(users.length).toBe(2)
  })

  test('relation create + include', async () => {
    const bob = await prisma.prismaUser.findUniqueOrThrow({ where: { email: 'b@x.com' } })
    await prisma.prismaPost.create({ data: { title: 'Hello', authorId: bob.id } })
    const posts = await prisma.prismaPost.findMany({ include: { author: true } })
    expect(posts[0].author.name).toBe('Bob')
  })

  test('interactive transaction commit + rollback', async () => {
    await prisma.$transaction(async (tx) => {
      await tx.prismaUser.create({ data: { email: 'c@x.com', name: 'Carol' } })
    })
    expect(await prisma.prismaUser.findUnique({ where: { email: 'c@x.com' } })).not.toBeNull()

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.prismaUser.create({ data: { email: 'd@x.com', name: 'Dave' } })
        throw new Error('boom')
      })
    ).rejects.toThrow()
    expect(await prisma.prismaUser.findUnique({ where: { email: 'd@x.com' } })).toBeNull()
  })

  test('unique violation surfaces as a Prisma known error', async () => {
    await expect(prisma.prismaUser.create({ data: { email: 'a@x.com', name: 'dup' } })).rejects.toMatchObject({
      code: 'P2002'
    })
  })
})
