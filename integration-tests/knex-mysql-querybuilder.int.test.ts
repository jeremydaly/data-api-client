/**
 * Knex query-builder coverage over the Data API (MySQL).
 *
 * Mirrors knex-pg-querybuilder for the MySQL-supported subset of common
 * query-builder syntax from https://knexjs.org/guide/query-builder.html.
 * MySQL has no RETURNING (inserts yield insertId) and uses ON DUPLICATE KEY
 * UPDATE for upserts.
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import knexLib, { type Knex } from 'knex'
import { createKnexMySQLClient } from '../src/compat/knex'
import { loadConfig } from './setup'

const USERS = 'qb_mysql_users'
const POSTS = 'qb_mysql_posts'

describe('Knex query-builder coverage (MySQL)', () => {
  let db: Knex

  beforeAll(async () => {
    const cfg = loadConfig('mysql')
    db = knexLib({
      client: createKnexMySQLClient({
        resourceArn: cfg.resourceArn,
        secretArn: cfg.secretArn,
        database: cfg.database,
        options: { region: cfg.region }
      }) as never,
      connection: {},
      pool: { min: 0, max: 1 }
    })

    await db.schema.dropTableIfExists(POSTS)
    await db.schema.dropTableIfExists(USERS)
    await db.schema.createTable(USERS, (t) => {
      t.increments('id').primary()
      t.string('name').notNullable()
      t.string('email').unique().notNullable()
      t.integer('age')
      t.string('dept')
      t.boolean('active').defaultTo(true)
    })
    await db.schema.createTable(POSTS, (t) => {
      t.increments('id').primary()
      t.integer('user_id')
      t.string('title')
      t.integer('votes').defaultTo(0)
    })

    await db(USERS).insert([
      { name: 'Alice', email: 'alice@x.com', age: 30, dept: 'eng' },
      { name: 'Bob', email: 'bob@x.com', age: 25, dept: 'eng' },
      { name: 'Carol', email: 'carol@x.com', age: 35, dept: 'sales' },
      { name: 'Dave', email: 'dave@x.com', age: null, dept: 'sales' }
    ])
    await db(POSTS).insert([
      { user_id: 1, title: 'A1', votes: 5 },
      { user_id: 1, title: 'A2', votes: 3 },
      { user_id: 2, title: 'B1', votes: 10 }
    ])
  }, 90000)

  afterAll(async () => {
    if (db) {
      await db.schema.dropTableIfExists(POSTS)
      await db.schema.dropTableIfExists(USERS)
      await db.destroy()
    }
  })

  // ---- Selection & projection ----
  test('select specific columns + alias', async () => {
    const rows = await db(USERS).select('name', 'age as years').orderBy('id').limit(1)
    expect(rows[0]).toEqual({ name: 'Alice', years: 30 })
  })

  test('distinct', async () => {
    const rows = await db(USERS).distinct('dept').orderBy('dept')
    expect(rows.map((r) => r.dept)).toEqual(['eng', 'sales'])
  })

  test('pluck', async () => {
    const names = await db(USERS).orderBy('id').pluck('name')
    expect(names).toEqual(['Alice', 'Bob', 'Carol', 'Dave'])
  })

  test('first', async () => {
    const row = await db(USERS).where({ name: 'Bob' }).first()
    expect(row?.email).toBe('bob@x.com')
  })

  // ---- Where variants ----
  test('where / andWhere / orWhere', async () => {
    const rows = await db(USERS).where('dept', 'eng').andWhere('age', '>', 26).orWhere('name', 'Carol')
    expect(rows.map((r) => r.name).sort()).toEqual(['Alice', 'Carol'])
  })

  test('whereNot', async () => {
    const rows = await db(USERS).whereNot('dept', 'eng')
    expect(rows.every((r) => r.dept === 'sales')).toBe(true)
  })

  test('whereIn / whereNotIn', async () => {
    const inRows = await db(USERS).whereIn('name', ['Alice', 'Bob']).pluck('name')
    expect(inRows.sort()).toEqual(['Alice', 'Bob'])
    const notIn = await db(USERS).whereNotIn('name', ['Alice', 'Bob', 'Carol']).pluck('name')
    expect(notIn).toEqual(['Dave'])
  })

  test('whereNull / whereNotNull', async () => {
    expect(await db(USERS).whereNull('age').pluck('name')).toEqual(['Dave'])
    expect(await db(USERS).whereNotNull('age').pluck('name')).toHaveLength(3)
  })

  test('whereBetween', async () => {
    const rows = await db(USERS).whereBetween('age', [26, 34]).pluck('name')
    expect(rows).toEqual(['Alice'])
  })

  test('LIKE via where(col, "like", val)', async () => {
    // NOTE: Knex's dedicated whereLike() appends `COLLATE utf8_bin`, which MySQL
    // rejects on utf8mb4 columns (a Knex/MySQL quirk, not a compat-layer issue —
    // it affects real mysql2 too). The portable LIKE form works:
    const rows = await db(USERS).where('email', 'like', '%@x.com').pluck('name')
    expect(rows).toHaveLength(4)
  })

  test('whereRaw', async () => {
    const rows = await db(USERS).whereRaw('age > ?', [28]).pluck('name')
    expect(rows.sort()).toEqual(['Alice', 'Carol'])
  })

  test('whereExists (subquery)', async () => {
    const rows = await db(USERS)
      .whereExists(function () {
        this.select('*').from(POSTS).whereRaw(`${POSTS}.user_id = ${USERS}.id`)
      })
      .pluck('name')
    expect(rows.sort()).toEqual(['Alice', 'Bob'])
  })

  // ---- Joins ----
  test('innerJoin', async () => {
    const rows = await db(USERS)
      .innerJoin(POSTS, `${USERS}.id`, `${POSTS}.user_id`)
      .select(`${USERS}.name`, `${POSTS}.title`)
      .orderBy(`${POSTS}.title`)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ name: 'Alice', title: 'A1' })
  })

  test('leftJoin + count + groupBy', async () => {
    const rows = await db(USERS)
      .leftJoin(POSTS, `${USERS}.id`, `${POSTS}.user_id`)
      .select(`${USERS}.name`)
      .count(`${POSTS}.id as posts`)
      .groupBy(`${USERS}.name`)
    const carol = rows.find((r) => r.name === 'Carol')
    expect(Number(carol.posts)).toBe(0)
  })

  // ---- Grouping & aggregation ----
  test('groupBy + having + count', async () => {
    const rows = await db(USERS).select('dept').count('id as c').groupBy('dept').having(db.raw('count(id)'), '>', 1)
    expect(rows.every((r) => Number(r.c) > 1)).toBe(true)
  })

  test('aggregates min/max/sum/avg', async () => {
    const [agg] = await db(USERS).min('age as mn').max('age as mx').sum('age as sm').avg('age as av')
    expect(Number(agg.mn)).toBe(25)
    expect(Number(agg.mx)).toBe(35)
    expect(Number(agg.sm)).toBe(90)
    expect(Math.round(Number(agg.av))).toBe(30)
  })

  // ---- Ordering & pagination ----
  test('orderBy + limit + offset', async () => {
    const rows = await db(USERS).whereNotNull('age').orderBy('age', 'desc').limit(2).offset(1).pluck('name')
    expect(rows).toEqual(['Alice', 'Bob'])
  })

  // ---- Set operations ----
  test('union', async () => {
    const rows = await db(USERS)
      .select('name')
      .where('dept', 'eng')
      .union(function () {
        this.select('name').from(USERS).where('dept', 'sales')
      })
    expect(rows).toHaveLength(4)
  })

  // ---- Modification ----
  test('insert returns insertId', async () => {
    const [id] = await db(USERS).insert({ name: 'Eve', email: 'eve@x.com', age: 28, dept: 'eng' })
    expect(id).toBeGreaterThan(0)
    await db(USERS).where({ name: 'Eve' }).del()
  })

  test('batch insert', async () => {
    await db(USERS).insert([
      { name: 'F1', email: 'f1@x.com', dept: 'eng' },
      { name: 'F2', email: 'f2@x.com', dept: 'eng' }
    ])
    expect(await db(USERS).whereIn('name', ['F1', 'F2']).pluck('name')).toHaveLength(2)
    await db(USERS).whereIn('name', ['F1', 'F2']).del()
  })

  test('update returns affected count', async () => {
    const affected = await db(USERS).where({ name: 'Bob' }).update({ age: 26 })
    expect(affected).toBe(1)
    await db(USERS).where({ name: 'Bob' }).update({ age: 25 })
  })

  test('del returns affected count', async () => {
    await db(USERS).insert({ name: 'Tmp', email: 'tmp@x.com', dept: 'eng' })
    const deleted = await db(USERS).where({ name: 'Tmp' }).del()
    expect(deleted).toBe(1)
  })

  test('increment / decrement', async () => {
    await db(POSTS).where({ title: 'A1' }).increment('votes', 2)
    expect((await db(POSTS).where({ title: 'A1' }).first()).votes).toBe(7)
    await db(POSTS).where({ title: 'A1' }).decrement('votes', 2)
    expect((await db(POSTS).where({ title: 'A1' }).first()).votes).toBe(5)
  })

  test('onConflict merge (ON DUPLICATE KEY UPDATE)', async () => {
    await db(USERS)
      .insert({ name: 'Alice Updated', email: 'alice@x.com', age: 31, dept: 'eng' })
      .onConflict('email')
      .merge()
    expect((await db(USERS).where({ email: 'alice@x.com' }).first()).name).toBe('Alice Updated')
    await db(USERS).where({ email: 'alice@x.com' }).update({ name: 'Alice', age: 30 })
  })

  // ---- Advanced ----
  test('raw query', async () => {
    const [rows] = await db.raw('SELECT count(*) AS n FROM ??', [USERS])
    expect(Number(rows[0].n)).toBe(4)
  })

  test('subquery in where', async () => {
    const rows = await db(USERS)
      .whereIn('id', db(POSTS).distinct('user_id'))
      .pluck('name')
    expect(rows.sort()).toEqual(['Alice', 'Bob'])
  })
})
