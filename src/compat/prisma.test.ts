import { describe, test, expect, vi } from 'vitest'
import { __AdapterForTest } from './prisma'

// A fake core client capturing the query options it receives.
function fakeCore(queryReturn: any) {
  return {
    query: vi.fn(async () => queryReturn),
    beginTransaction: vi.fn(async () => ({ transactionId: 'tx-1' })),
    commitTransaction: vi.fn(async () => ({})),
    rollbackTransaction: vi.fn(async () => ({}))
  } as any
}

describe('Adapter.queryRaw', () => {
  test('returns columnNames/columnTypes/rows from core result', async () => {
    const core = fakeCore({
      records: [[1, 'alice']],
      columnMetadata: [
        { label: 'id', typeName: 'int4' },
        { label: 'name', typeName: 'text' }
      ]
    })
    const adapter = new __AdapterForTest(core, 'pg')
    const res = await adapter.queryRaw({ sql: 'SELECT id, name FROM t', args: [], argTypes: [] })
    expect(res.columnNames).toEqual(['id', 'name'])
    expect(res.columnTypes).toEqual([0, 7]) // Int32, Text
    expect(res.rows).toEqual([[1, 'alice']])
    expect(core.query).toHaveBeenCalledWith(
      expect.objectContaining({ hydrateColumnNames: false, includeResultMetadata: true })
    )
  })
})

describe('Adapter.executeRaw', () => {
  test('returns numberOfRecordsUpdated', async () => {
    const core = fakeCore({ numberOfRecordsUpdated: 3 })
    const adapter = new __AdapterForTest(core, 'pg')
    const n = await adapter.executeRaw({ sql: 'DELETE FROM t', args: [], argTypes: [] })
    expect(n).toBe(3)
  })
})

describe('Adapter.startTransaction', () => {
  test('threads transactionId through queries and commits', async () => {
    const core = fakeCore({ records: [], columnMetadata: [] })
    const adapter = new __AdapterForTest(core, 'pg')
    const tx = await adapter.startTransaction()
    await tx.queryRaw({ sql: 'SELECT 1', args: [], argTypes: [] })
    expect(core.query).toHaveBeenCalledWith(expect.objectContaining({ transactionId: 'tx-1' }))
    await tx.commit()
    expect(core.commitTransaction).toHaveBeenCalledWith({ transactionId: 'tx-1' })
  })
})
