import {
  error,
  parseSQL,
  omit,
  pick,
  flatten,
  getSqlParams,
  getType,
  getTypeHint,
  isDateString,
  isTimeString,
  isDecimalString,
  isUUIDString,
  isJSONString
} from './utils'

describe('utility', () => {
  test('error', async () => {
    let err = () => error('test error')
    expect(err).toThrow('test error')
  })

  test('omit', async () => {
    let result = omit({ a: 1, b: 2, c: 3 }, ['c'])
    expect(result).toEqual({ a: 1, b: 2 })
  })

  test('pick', async () => {
    let result = pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])
    expect(result).toEqual({ a: 1, c: 3 })
  })

  test('flatten', async () => {
    let result = flatten([[1, 2, 3], 4, [5, 6], 7, 8] as any)
    expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('SQL parsing', () => {
  describe('parseSQL', () => {
    test('string', async () => {
      let result = parseSQL([`SELECT * FROM myTable`])
      expect(result).toBe('SELECT * FROM myTable')
    })

    test('object', async () => {
      let result = parseSQL([{ sql: `SELECT * FROM myTable` }])
      expect(result).toBe('SELECT * FROM myTable')
    })

    test('no query (error)', async () => {
      let result = () => parseSQL([])
      expect(result).toThrow(`No 'sql' statement provided.`)
    })
  })

  describe('getSqlParams', () => {
    test('named parameters', async () => {
      let result = getSqlParams('SELECT * FROM myTable WHERE id = :id AND test = :test')
      expect(result).toEqual({ id: { type: 'n_ph' }, test: { type: 'n_ph' } })
    })

    test('named identifiers', async () => {
      let result = getSqlParams('SELECT ::name FROM myTable WHERE id = :id')
      expect(result).toEqual({ id: { type: 'n_ph' }, name: { type: 'n_id' } })
    })
  })
})

describe('type detection', () => {
  describe('getType', () => {
    test('stringValue', async () => {
      let result = getType('string')
      expect(result).toBe('stringValue')
    })

    test('booleanValue', async () => {
      let result = getType(true)
      expect(result).toBe('booleanValue')
    })

    test('longValue', async () => {
      let result = getType(123456789)
      expect(result).toBe('longValue')
    })

    test('doubleValue', async () => {
      let result = getType(1234.56789)
      expect(result).toBe('doubleValue')
    })

    test('isNull', async () => {
      let result = getType(null)
      expect(result).toBe('isNull')
    })

    test('blobValue', async () => {
      let result = getType(Buffer.from('data'))
      expect(result).toBe('blobValue')
    })

    test('invalid type (undefined)', async () => {
      let result = getType([]) // use array for now
      expect(result).toBeUndefined()
    })
  })

  describe('Type Hint Detection', () => {
    describe('isDateString', () => {
      test('valid DATE format', () => {
        expect(isDateString('2024-12-25')).toBe(true)
        expect(isDateString('2024-01-01')).toBe(true)
        expect(isDateString('1999-12-31')).toBe(true)
      })

      test('invalid DATE format', () => {
        expect(isDateString('2024-1-1')).toBe(false)
        expect(isDateString('12-25-2024')).toBe(false)
        expect(isDateString('2024-12-25 10:30:00')).toBe(false)
        expect(isDateString('not a date')).toBe(false)
      })
    })

    describe('isTimeString', () => {
      test('valid TIME format', () => {
        expect(isTimeString('14:30:45')).toBe(true)
        expect(isTimeString('00:00:00')).toBe(true)
        expect(isTimeString('23:59:59')).toBe(true)
        expect(isTimeString('12:34:56.789')).toBe(true)
        expect(isTimeString('12:34:56.1')).toBe(true)
      })

      test('invalid TIME format', () => {
        expect(isTimeString('14:30')).toBe(false)
        expect(isTimeString('1:30:45')).toBe(false)
        expect(isTimeString('14:30:45.1234')).toBe(false)
        expect(isTimeString('not a time')).toBe(false)
      })
    })

    describe('isDecimalString', () => {
      test('valid DECIMAL format', () => {
        expect(isDecimalString('123.45')).toBe(true)
        expect(isDecimalString('0.5')).toBe(true)
        expect(isDecimalString('-123.45')).toBe(true)
        expect(isDecimalString('999.9999')).toBe(true)
      })

      test('invalid DECIMAL format', () => {
        expect(isDecimalString('123')).toBe(false)
        expect(isDecimalString('123.')).toBe(false)
        expect(isDecimalString('.45')).toBe(false)
        expect(isDecimalString('not a decimal')).toBe(false)
      })
    })

    describe('isUUIDString', () => {
      test('valid UUID format', () => {
        expect(isUUIDString('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
        expect(isUUIDString('00000000-0000-0000-0000-000000000000')).toBe(true)
        expect(isUUIDString('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF')).toBe(true)
      })

      test('invalid UUID format', () => {
        expect(isUUIDString('550e8400-e29b-41d4-a716')).toBe(false)
        expect(isUUIDString('not-a-uuid')).toBe(false)
        expect(isUUIDString('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(false)
      })
    })

    describe('isJSONString', () => {
      test('valid JSON format', () => {
        expect(isJSONString('{"key": "value"}')).toBe(true)
        expect(isJSONString('[1, 2, 3]')).toBe(true)
        expect(isJSONString('{"nested": {"data": true}}')).toBe(true)
        expect(isJSONString('  {"whitespace": true}  ')).toBe(true)
      })

      test('invalid JSON format', () => {
        expect(isJSONString('not json')).toBe(false)
        expect(isJSONString('123')).toBe(false)
        expect(isJSONString('"just a string"')).toBe(false)
        expect(isJSONString('{"invalid": }')).toBe(false)
        expect(isJSONString('')).toBe(false)
      })
    })

    describe('getTypeHint', () => {
      test('Date object → TIMESTAMP', () => {
        expect(getTypeHint(new Date())).toBe('TIMESTAMP')
      })

      test('no hint for UUID strings (no auto-detection)', () => {
        expect(getTypeHint('550e8400-e29b-41d4-a716-446655440000')).toBeUndefined()
      })

      test('no hint for DATE strings (no auto-detection)', () => {
        expect(getTypeHint('2024-12-25')).toBeUndefined()
      })

      test('no hint for TIME strings (no auto-detection)', () => {
        expect(getTypeHint('14:30:45')).toBeUndefined()
        expect(getTypeHint('14:30:45.123')).toBeUndefined()
      })

      test('no hint for JSON strings (no auto-detection)', () => {
        expect(getTypeHint('{"key": "value"}')).toBeUndefined()
        expect(getTypeHint('[1, 2, 3]')).toBeUndefined()
      })

      test('no hint for DECIMAL strings (no auto-detection)', () => {
        expect(getTypeHint('123.45')).toBeUndefined()
        expect(getTypeHint('-999.9999')).toBeUndefined()
      })

      test('no hint for regular strings', () => {
        expect(getTypeHint('regular string')).toBeUndefined()
        expect(getTypeHint('123')).toBeUndefined()
      })

      test('no hint for numbers', () => {
        expect(getTypeHint(123)).toBeUndefined()
        expect(getTypeHint(123.45)).toBeUndefined()
      })

      test('no hint for booleans', () => {
        expect(getTypeHint(true)).toBeUndefined()
        expect(getTypeHint(false)).toBeUndefined()
      })

      test('no hint for null', () => {
        expect(getTypeHint(null)).toBeUndefined()
      })

      test('no hint for Buffer', () => {
        expect(getTypeHint(Buffer.from('data'))).toBeUndefined()
      })
    })
  })
})
