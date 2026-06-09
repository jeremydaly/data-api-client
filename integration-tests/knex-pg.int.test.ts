/**
 * Knex with PostgreSQL via the Data API compatibility layer
 *
 * Uses createKnexPgClient (src/compat/knex.ts), which subclasses Knex's pg
 * dialect and overrides _driver() so Knex drives a Data API-backed pg client.
 * The pg dialect is stricter than mysql2 — it constructs `new driver.Client()`,
 * expects connect() to return a Promise, and runs a `select version();` check
 * on first acquire — so this exercises more of the connection contract.
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import knexLib, { type Knex } from 'knex'
import { createKnexPgClient } from '../src/compat/knex'
import { loadConfig } from './setup'

const TABLE = 'knex_pg_users'

describe('Knex with PostgreSQL via Data API compat', () => {
  let db: Knex

  beforeAll(async () => {
    const cfg = loadConfig('pg')
    db = knexLib({
      client: createKnexPgClient({
        resourceArn: cfg.resourceArn,
        secretArn: cfg.secretArn,
        database: cfg.database,
        options: { region: cfg.region }
      }) as never,
      connection: {},
      pool: { min: 0, max: 1 }
    })

    await db.schema.dropTableIfExists(TABLE)
    await db.schema.createTable(TABLE, (t) => {
      t.increments('id').primary()
      t.string('name').notNullable()
      t.string('email').notNullable()
      t.integer('age')
      t.boolean('active').defaultTo(true)
    })
  }, 90000)

  afterAll(async () => {
    if (db) {
      await db.schema.dropTableIfExists(TABLE)
      await db.destroy()
    }
  })

  test('insert with returning id', async () => {
    const rows = await db(TABLE).insert({ name: 'Alice', email: 'alice@example.com', age: 30 }).returning('id')
    expect(rows[0].id).toBeGreaterThan(0)
  })

  test('select all rows', async () => {
    await db(TABLE).insert({ name: 'Bob', email: 'bob@example.com', age: 25 })
    const rows = await db(TABLE).select('*').orderBy('id')
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(rows[0]).toHaveProperty('name')
  })

  test('where + first', async () => {
    const row = await db(TABLE).where({ email: 'alice@example.com' }).first()
    expect(row?.name).toBe('Alice')
    expect(row?.age).toBe(30)
  })

  test('parameterized where with $-bindings', async () => {
    const rows = await db(TABLE).where('age', '>', 26).select('name')
    const names = rows.map((r) => r.name)
    expect(names).toContain('Alice')
    expect(names).not.toContain('Bob')
  })

  test('update with returning', async () => {
    const rows = await db(TABLE).where({ name: 'Bob' }).update({ age: 26 }).returning(['id', 'age'])
    expect(rows[0].age).toBe(26)
  })

  test('count aggregate', async () => {
    const result = await db(TABLE).count<{ c: number }[]>({ c: '*' })
    expect(Number(result[0].c)).toBeGreaterThanOrEqual(2)
  })

  test('orderBy + limit', async () => {
    const rows = await db(TABLE).select('name').orderBy('age', 'desc').limit(1)
    expect(rows).toHaveLength(1)
  })

  test('delete returns affected row count', async () => {
    const deleted = await db(TABLE).where({ name: 'Bob' }).del()
    expect(deleted).toBe(1)
    const remaining = await db(TABLE).select('*')
    expect(remaining.every((r) => r.name !== 'Bob')).toBe(true)
  })

  // Transactions: Knex issues literal BEGIN/COMMIT/ROLLBACK SQL, which the
  // compat layer intercepts and maps to the Data API transaction lifecycle.
  test('transaction commits', async () => {
    await db.transaction(async (trx) => {
      await trx(TABLE).insert({ name: 'Txn Commit', email: 'txc@example.com', age: 40 })
    })
    const row = await db(TABLE).where({ email: 'txc@example.com' }).first()
    expect(row?.name).toBe('Txn Commit')
  })

  test('transaction rolls back on error', async () => {
    await expect(
      db.transaction(async (trx) => {
        await trx(TABLE).insert({ name: 'Txn Rollback', email: 'txr@example.com', age: 41 })
        throw new Error('force rollback')
      })
    ).rejects.toThrow('force rollback')
    const row = await db(TABLE).where({ email: 'txr@example.com' }).first()
    expect(row).toBeUndefined()
  })

  // Nested transactions need SAVEPOINTs, which the Data API does not support.
  test('nested transactions (savepoints) are rejected', async () => {
    await expect(
      db.transaction(async (trx) => {
        await trx.transaction(async () => {
          /* inner uses SAVEPOINT — unsupported */
        })
      })
    ).rejects.toThrow(/Nested transactions/)
  })
})
