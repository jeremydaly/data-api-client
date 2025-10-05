import { error, parseSQL, omit, pick, flatten, getSqlParams, getType } from './utils'

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
})
