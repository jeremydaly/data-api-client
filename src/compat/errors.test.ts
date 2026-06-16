import { describe, test, expect } from 'vitest'
import { mapToPrismaError } from './errors'

describe('mapToPrismaError', () => {
  test('unique violation -> UniqueConstraintViolation', () => {
    const e = mapToPrismaError(
      new Error('duplicate key value violates unique constraint "users_email_key"'),
      'pg'
    ) as any
    expect(e.name).toBe('DriverAdapterError')
    expect(e.cause.kind).toBe('UniqueConstraintViolation')
  })

  test('undefined table -> TableDoesNotExist', () => {
    const e = mapToPrismaError(new Error('relation "missing" does not exist'), 'pg') as any
    expect(e.cause.kind).toBe('TableDoesNotExist')
  })

  test('falls back to provider error with original message', () => {
    const e = mapToPrismaError(new Error('something weird'), 'mysql') as any
    expect(e.cause.kind).toBe('mysql')
    expect(e.cause.message).toContain('something weird')
  })
})
