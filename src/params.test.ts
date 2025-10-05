import {
  parseParams,
  parseDatabase,
  parseHydrate,
  prepareParams,
  splitParams,
  normalizeParams,
  formatType,
  formatParam,
  processParams
} from './params'

describe('parameter parsing', () => {
  describe('parseParams', () => {
    test('array', async () => {
      let result = parseParams(['query', [1, 2]])
      expect(result).toEqual([1, 2])
    })

    test('object', async () => {
      let result = parseParams(['query', { a: 1, b: 2 }])
      expect(result).toEqual([{ a: 1, b: 2 }])
    })

    test('array (in object)', async () => {
      let result = parseParams([{ parameters: [1, 2, 3] }])
      expect(result).toEqual([1, 2, 3])
    })

    test('object (in object)', async () => {
      let result = parseParams([{ parameters: { a: 1, b: 2 } }])
      expect(result).toEqual([{ a: 1, b: 2 }])
    })

    test('no params (empty array)', async () => {
      let result = parseParams(['query'])
      expect(result).toEqual([])
    })

    test('no params in object (empty array)', async () => {
      let result = parseParams([{}])
      expect(result).toEqual([])
    })

    test('invalid type (error)', async () => {
      let result = () => parseParams(['query', 'string'])
      expect(result).toThrow('Parameters must be an object or array')
    })

    test('invalid type in object (error)', async () => {
      let result = () => parseParams([{ parameters: 'string' }])
      expect(result).toThrow(`'parameters' must be an object or array`)
    })
  })
})

describe('configuration parsing', () => {
  describe('parseDatabase', () => {
    test('from config w/ transaction', async () => {
      let result = parseDatabase({ database: 'db', transactionId: 'txid' } as any, [])
      expect(result).toBe('db')
    })

    test('from args', async () => {
      let result = parseDatabase({ database: 'db' } as any, [{ database: 'db2' }])
      expect(result).toBe('db2')
    })

    test('from args, not string (error)', async () => {
      let result = () => parseDatabase({ database: 'db' } as any, [{ database: 1 }])
      expect(result).toThrow(`'database' must be a string.`)
    })

    test('from config', async () => {
      let result = parseDatabase({ database: 'db' } as any, [{}])
      expect(result).toBe('db')
    })

    test('no database provided (return undefined)', async () => {
      let result = parseDatabase({} as any, [{}])
      expect(result).toBeUndefined()
    })
  })

  describe('parseHydrate', () => {
    test('from args', async () => {
      let result = parseHydrate({ hydrateColumnNames: true } as any, [{ hydrateColumnNames: false }])
      expect(result).toBe(false)
    })

    test('from config', async () => {
      let result = parseHydrate({ hydrateColumnNames: true } as any, [{}])
      expect(result).toBe(true)
    })

    test('from args, not boolean (error)', async () => {
      let result = () => parseHydrate({ hydrateColumnNames: true } as any, [{ hydrateColumnNames: 'false' }])
      expect(result).toThrow(`'hydrateColumnNames' must be a boolean.`)
    })
  })

  describe('prepareParams', () => {
    test('omit specific args, merge others', async () => {
      let result = prepareParams(
        { secretArn: 'secretArn', resourceArn: 'resourceArn' } as any,
        [{ hydrateColumnNames: true, parameters: [1, 2, 3], test: true }]
      )
      expect(result).toEqual({ secretArn: 'secretArn', resourceArn: 'resourceArn', test: true })
    })

    test('no args', async () => {
      let result = prepareParams({ secretArn: 'secretArn', resourceArn: 'resourceArn' } as any, [])
      expect(result).toEqual({ secretArn: 'secretArn', resourceArn: 'resourceArn' })
    })
  })
})

describe('parameter processing', () => {
  test('splitParams', async () => {
    let result = splitParams({ param1: 'p1', param2: 'p2' })
    expect(result).toEqual([
      { name: 'param1', value: 'p1' },
      { name: 'param2', value: 'p2' }
    ])
  })

  test('normalizeParams', async () => {
    let result = normalizeParams([
      { name: 'param1', value: 'p1' },
      { param2: 'p2' },
      [{ name: 'param3', value: 'p3' }, { param4: 'p4' }],
      { name: 'param5', value: 'p5', param6: 'p6' }
    ] as any)
    expect(result).toEqual([
      { name: 'param1', value: 'p1' },
      { name: 'param2', value: 'p2' },
      [
        { name: 'param3', value: 'p3' },
        { name: 'param4', value: 'p4' }
      ],
      { name: 'name', value: 'param5' },
      { name: 'value', value: 'p5' },
      { name: 'param6', value: 'p6' }
    ])
  })

  describe('formatType', () => {
    test('stringValue', async () => {
      let result = formatType('param', 'string val', 'stringValue', undefined, {
        deserializeDate: false,
        treatAsLocalDate: false
      })
      expect(result).toEqual({ name: 'param', value: { stringValue: 'string val' } })
    })

    test('booleanValue', async () => {
      let result = formatType('param', true, 'booleanValue', undefined, {
        deserializeDate: false,
        treatAsLocalDate: false
      })
      expect(result).toEqual({ name: 'param', value: { booleanValue: true } })
    })

    test('longValue', async () => {
      let result = formatType('param', 1234567890, 'longValue', undefined, {
        deserializeDate: false,
        treatAsLocalDate: false
      })
      expect(result).toEqual({ name: 'param', value: { longValue: 1234567890 } })
    })

    test('existing type', async () => {
      let result = formatType('param', { stringValue: 'string' }, null, undefined, {
        deserializeDate: false,
        treatAsLocalDate: false
      })
      expect(result).toEqual({ name: 'param', value: { stringValue: 'string' } })
    })

    test('undefined (error)', async () => {
      let result = () =>
        formatType('param', 'invalid type', undefined, undefined, {
          deserializeDate: false,
          treatAsLocalDate: false
        })
      expect(result).toThrow(`'param' is an invalid type`)
    })
  })

  describe('formatParam', () => {
    test('stringValue', async () => {
      let result = formatParam('param', 'string', { deserializeDate: false, treatAsLocalDate: false })
      expect(result).toEqual({ name: 'param', value: { stringValue: 'string' } })
    })

    test('booleanValue', async () => {
      let result = formatParam('param', true, { deserializeDate: false, treatAsLocalDate: false })
      expect(result).toEqual({ name: 'param', value: { booleanValue: true } })
    })

    test('longValue', async () => {
      let result = formatParam('param', 123456789, { deserializeDate: false, treatAsLocalDate: false })
      expect(result).toEqual({ name: 'param', value: { longValue: 123456789 } })
    })

    test('doubleValue', async () => {
      let result = formatParam('param', 1234.56789, { deserializeDate: false, treatAsLocalDate: false })
      expect(result).toEqual({ name: 'param', value: { doubleValue: 1234.56789 } })
    })

    test('isNull', async () => {
      let result = formatParam('param', null, { deserializeDate: false, treatAsLocalDate: false })
      expect(result).toEqual({ name: 'param', value: { isNull: true } })
    })

    test('blobValue', async () => {
      let result = formatParam('param', Buffer.from('data'), { deserializeDate: false, treatAsLocalDate: false })
      expect(result).toEqual({
        name: 'param',
        value: { blobValue: Buffer.from('data') }
      })
    })

    test('supplied type', async () => {
      let result = formatParam('param', { stringValue: 'string' }, { deserializeDate: false, treatAsLocalDate: false })
      expect(result).toEqual({
        name: 'param',
        value: { stringValue: 'string' }
      })
    })

    test('invalid type (error)', async () => {
      let result = () => formatParam('param', [], { deserializeDate: false, treatAsLocalDate: false })
      expect(result).toThrow(`'param' is an invalid type`)
    })
  })

  describe('processParams', () => {
    test('single param, single record', async () => {
      let { processedParams, escapedSql } = processParams(
        'pg',
        'SELECT * FROM myTable WHERE id = :id',
        { id: { type: 'n_ph' } },
        [{ name: 'id', value: 1 }],
        { deserializeDate: false, treatAsLocalDate: false }
      )
      expect(escapedSql).toBe('SELECT * FROM myTable WHERE id = :id')
      expect(processedParams).toEqual([{ name: 'id', value: { longValue: 1 } }])
    })

    test('multiple params, named param, single record', async () => {
      let { processedParams, escapedSql } = processParams(
        'pg',
        'SELECT ::columnName FROM myTable WHERE id = :id AND id2 = :id2',
        { id: { type: 'n_ph' }, id2: { type: 'n_ph' }, columnName: { type: 'n_id' } },
        [
          { name: 'id', value: 1 },
          { name: 'id2', value: 2 },
          { name: 'columnName', value: 'testColumn' }
        ],
        { deserializeDate: false, treatAsLocalDate: false }
      )
      expect(escapedSql).toBe('SELECT `testColumn` FROM myTable WHERE id = :id AND id2 = :id2')
      expect(processedParams).toEqual([
        { name: 'id', value: { longValue: 1 } },
        { name: 'id2', value: { longValue: 2 } }
      ])
    })

    test('single param, multiple records', async () => {
      let { processedParams, escapedSql } = processParams(
        'pg',
        'SELECT * FROM myTable WHERE id = :id',
        { id: { type: 'n_ph' } },
        [[{ name: 'id', value: 1 }], [{ name: 'id', value: 2 }]] as any,
        { deserializeDate: false, treatAsLocalDate: false }
      )
      expect(escapedSql).toBe('SELECT * FROM myTable WHERE id = :id')
      expect(processedParams).toEqual([
        [{ name: 'id', value: { longValue: 1 } }],
        [{ name: 'id', value: { longValue: 2 } }]
      ])
    })

    test('multiple params, multiple records', async () => {
      let { processedParams, escapedSql } = processParams(
        'pg',
        'SELECT * FROM myTable WHERE id = :id',
        { id: { type: 'n_ph' }, id2: { type: 'n_ph' } },
        [
          [
            { name: 'id', value: 1 },
            { name: 'id2', value: 2 }
          ],
          [
            { name: 'id', value: 2 },
            { name: 'id2', value: 3 }
          ]
        ] as any,
        { deserializeDate: false, treatAsLocalDate: false }
      )
      expect(escapedSql).toBe('SELECT * FROM myTable WHERE id = :id')
      expect(processedParams).toEqual([
        [
          { name: 'id', value: { longValue: 1 } },
          { name: 'id2', value: { longValue: 2 } }
        ],
        [
          { name: 'id', value: { longValue: 2 } },
          { name: 'id2', value: { longValue: 3 } }
        ]
      ])
    })

    test('multiple params, named params, multiple records', async () => {
      let { processedParams, escapedSql } = processParams(
        'pg',
        'SELECT ::columnName FROM myTable WHERE id = :id AND id2 = :id2',
        { id: { type: 'n_ph' }, id2: { type: 'n_ph' }, columnName: { type: 'n_id' } },
        [
          [
            { name: 'id', value: 1 },
            { name: 'id2', value: 2 },
            { name: 'columnName', value: 'testColumn' }
          ],
          [
            { name: 'id', value: 2 },
            { name: 'id2', value: 3 },
            { name: 'columnName', value: 'testColumnx' } // ignored
          ]
        ] as any,
        { deserializeDate: false, treatAsLocalDate: false }
      )
      expect(escapedSql).toBe('SELECT `testColumn` FROM myTable WHERE id = :id AND id2 = :id2')
      expect(processedParams).toEqual([
        [
          { name: 'id', value: { longValue: 1 } },
          { name: 'id2', value: { longValue: 2 } }
        ],
        [
          { name: 'id', value: { longValue: 2 } },
          { name: 'id2', value: { longValue: 3 } }
        ]
      ])
    })

    test('typecasting params', async () => {
      let { processedParams, escapedSql } = processParams(
        'pg',
        'INSERT INTO users(id, name, meta) VALUES(:id, :name, :meta)',
        { id: { type: 'n_ph' }, name: { type: 'n_ph' }, meta: { type: 'n_ph' } },
        [
          { name: 'id', value: '0bb99248-2e7d-4007-a4b2-579b00649ce1', cast: 'uuid' },
          { name: 'name', value: 'Test' },
          { name: 'meta', value: '{"extra": true}', cast: 'jsonb' }
        ] as any,
        { deserializeDate: false, treatAsLocalDate: false }
      )
      expect(escapedSql).toBe('INSERT INTO users(id, name, meta) VALUES(:id::uuid, :name, :meta::jsonb)')
      expect(processedParams).toEqual([
        { name: 'id', value: { stringValue: '0bb99248-2e7d-4007-a4b2-579b00649ce1' } },
        { name: 'name', value: { stringValue: 'Test' } },
        { name: 'meta', value: { stringValue: '{"extra": true}' } }
      ])
    })
  })
})
