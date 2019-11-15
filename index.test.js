const rewire = require('rewire')
const dataApiClient = rewire('./index')

// test('test', () => {
//   let client = dataApiClient({
//     secretArn: 'secretArn',
//     resourceArn: 'resourceArn',
//     database: 'db'
//   })
//
//   console.log(client);
// })

describe('utility', () => {

  test('error', async () => {
    const error = dataApiClient.__get__('error')
    let err = () => error('test error')
    expect(err).toThrow('test error')
  })

  test('omit', async () => {
    const omit = dataApiClient.__get__('omit')
    let result = omit({ a: 1, b: 2, c: 3},['c'])
    expect(result).toEqual({ a: 1, b: 2 })
  })

  test('pick', async () => {
    const pick = dataApiClient.__get__('pick')
    let result = pick({ a: 1, b: 2, c: 3},['a','c'])
    expect(result).toEqual({ a: 1, c: 3 })
  })

  // Deprecated
  // test('flatten', async () => {
  //   const flatten = dataApiClient.__get__('flatten')
  //   let result = flatten([[1,2,3],4,[5,6],7,8])
  //   expect(result).toEqual([1,2,3,4,5,6,7,8])
  // })

}) // end utility


describe('query parsing', () => {

  describe('parseSQL', () => {

    const parseSQL = dataApiClient.__get__('parseSQL')

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
  }) // end parseSQL


  describe('parseParams', () => {

    const parseParams = dataApiClient.__get__('parseParams')

    test('array', async () => {
      let result = parseParams(['query',[1,2]])
      expect(result).toEqual([1,2])
    })

    test('object', async () => {
      let result = parseParams(['query', { a: 1, b: 2}])
      expect(result).toEqual([{ a:1, b:2 }])
    })

    test('array (in object)', async () => {
      let result = parseParams([{ parameters: [1,2,3] }])
      expect(result).toEqual([1,2,3])
    })

    test('object (in object)', async () => {
      let result = parseParams([{ parameters: { a: 1, b: 2} }])
      expect(result).toEqual([{ a:1, b:2 }])
    })

    test('no params (empty array)', async () => {
      let result = parseParams(['query'])
      expect(result).toEqual([])
    })

    test('no params in object (empty array)', async () => {
      let result = parseParams([{ }])
      expect(result).toEqual([])
    })

    test('invalid type (error)', async () => {
      let result = () => parseParams(['query','string'])
      expect(result).toThrow('Parameters must be an object or array')
    })

    test('invalid type in object (error)', async () => {
      let result = () => parseParams([{ parameters: 'string' }])
      expect(result).toThrow(`'parameters' must be an object or array`)
    })

  }) // end parse params

}) // end query parsing


describe('query configuration parsing', () => {

  test('mergeConfig', async () => {
    const mergeConfig = dataApiClient.__get__('mergeConfig')
    let result = mergeConfig({ secretArn:'secretArn',resourceArn:'resourceArn' }, { database: 'db' })
    expect(result).toEqual({ secretArn:'secretArn',resourceArn:'resourceArn', database: 'db' })
  })

  describe('parseDatabase', () => {

    const parseDatabase = dataApiClient.__get__('parseDatabase')

    test('from config w/ transaction', async () => {
      let result = parseDatabase({ database: 'db', transactionId: 'txid'})
      expect(result).toBe('db')
    })

    test('from args', async () => {
      let result = parseDatabase({ database: 'db' }, [{ database: 'db2' }])
      expect(result).toBe('db2')
    })

    test('from args, not string (error)', async () => {
      let result = () => parseDatabase({ database: 'db' }, [{ database: 1 }])
      expect(result).toThrow(`'database' must be a string.`)
    })

    test('from config', async () => {
      let result = parseDatabase({ database: 'db' }, [{}])
      expect(result).toBe('db')
    })

    test('no database provided (error)', async () => {
      let result = () => parseDatabase({}, [{}])
      expect(result).toThrow(`No 'database' provided.`)
    })

  }) // end parseDatabase

  describe('parseHydrate', () => {

    const parseHydrate = dataApiClient.__get__('parseHydrate')

    test('parseHydrate - from args', async () => {
      let result = parseHydrate({ hydrateColumnNames: true },[{ hydrateColumnNames: false }])
      expect(result).toBe(false)
    })

    test('parseHydrate - from config', async () => {
      let result = parseHydrate({ hydrateColumnNames: true },[{ }])
      expect(result).toBe(true)
    })

    test('parseHydrate - from args, not boolean (error)', async () => {
      let result = () => parseHydrate({ hydrateColumnNames: true },[{ hydrateColumnNames: 'false' }])
      expect(result).toThrow(`'hydrateColumnNames' must be a boolean.`)
    })

  })


  describe('prepareParams', () => {

    const prepareParams = dataApiClient.__get__('prepareParams')

    test('prepareParams - omit specific args, merge others', async () => {
      let result = prepareParams({ secretArn:'secretArn',resourceArn:'resourceArn' },
        [{ hydrateColumnNames: true, parameters: [1,2,3], test: true }])
      expect(result).toEqual({ secretArn: 'secretArn', resourceArn: 'resourceArn', test: true })
    })

    test('prepareParams - no args', async () => {
      let result = prepareParams({ secretArn:'secretArn',resourceArn:'resourceArn' },[])
      expect(result).toEqual({ secretArn: 'secretArn', resourceArn: 'resourceArn' })
    })

  }) // end prepareParams

}) // end query config parsing


describe('query parameter processing', () => {

  test('splitParams', async () => {
    const splitParams = dataApiClient.__get__('splitParams')
    let result = splitParams({ param1: 'p1', param2: 'p2' })
    expect(result).toEqual([
      { name: 'param1', value: 'p1' },
      { name: 'param2', value: 'p2' }
    ])
  })

  test('normalizeParams', async () => {
    const normalizeParams = dataApiClient.__get__('normalizeParams')
    let result = normalizeParams([
      { name: 'param1', value: 'p1' },
      { param2: 'p2' },
      [ { name: 'param3', value: 'p3' }, { param4: 'p4'} ],
      { name: 'param5', value: 'p5', param6: 'p6' }
    ])
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

    const formatType = dataApiClient.__get__('formatType')

    test('stringValue', async () => {
      let result = formatType('param','string val','stringValue')
      expect(result).toEqual({ name: 'param', value: { stringValue: 'string val' }})
    })

    test('booleanValue', async () => {
      let result = formatType('param',true,'booleanValue')
      expect(result).toEqual({ name: 'param', value: { booleanValue: true }})
    })

    test('longValue', async () => {
      let result = formatType('param',1234567890,'longValue')
      expect(result).toEqual({ name: 'param', value: { longValue: 1234567890 }})
    })

    test('existing type', async () => {
      let result = formatType('param',{ stringValue: 'string' },null)
      expect(result).toEqual({ name: 'param', value: { stringValue: 'string' }})
    })

    test('undefined (error)', async () => {
      let result = () => formatType('param','invalid type',undefined)
      expect(result).toThrow(`'param' is an invalid type`)
    })

  })


  describe('getType', () => {

    const getType = dataApiClient.__get__('getType')

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



  describe('formatParam', () => {

    const formatParam = dataApiClient.__get__('formatParam')

    test('stringValue', async () => {
      let result = formatParam('param','string')
      expect(result).toEqual({ name: 'param', value: { stringValue: 'string' }})
    })

    test('booleanValue', async () => {
      let result = formatParam('param',true)
      expect(result).toEqual({ name: 'param', value: { booleanValue: true }})
    })

    test('longValue', async () => {
      let result = formatParam('param',123456789)
      expect(result).toEqual({ name: 'param', value: { longValue: 123456789 }})
    })

    test('doubleValue', async () => {
      let result = formatParam('param',1234.56789)
      expect(result).toEqual({ name: 'param', value: { doubleValue: 1234.56789 }})
    })

    test('isNull', async () => {
      let result = formatParam('param',null)
      expect(result).toEqual({ name: 'param', value: { isNull: true }})
    })

    test('blobValue', async () => {
      let result = formatParam('param',Buffer.from('data'))
      expect(result).toEqual({
        name: 'param',
        value: { blobValue: Buffer.from('data') }
      })
    })

    test('supplied type', async () => {
      let result = formatParam('param',{ stringValue: 'string' })
      expect(result).toEqual({
        name: 'param',
        value: { stringValue: 'string' }
      })
    })

    test('invalid type (error)', async () => {
      let result = () => formatParam('param',[]) // use array for now
      expect(result).toThrow(`'param' is an invalid type`)
    })

  })

  describe('getSqlParams', () => {

    const getSqlParams = dataApiClient.__get__('getSqlParams')

    test('named parameters', async () => {
      let result = getSqlParams('SELECT * FROM myTable WHERE id = :id AND test = :test')
      expect(result).toEqual({ id: { type: 'n_ph'}, test: { type: 'n_ph'} })
    })

    test('named identifiers', async () => {
      let result = getSqlParams('SELECT ::name FROM myTable WHERE id = :id')
      expect(result).toEqual({ id: { type: 'n_ph'}, name: { type: 'n_id'} })
    })

  }) // end getSqlParams


  describe('processParams', () => {

    const processParams = dataApiClient.__get__('processParams')

    test('single param, single record', async () => {
      let { processedParams,escapedSql } = processParams(
        'SELECT * FROM myTable WHERE id = :id',
        { id: { type: 'n_ph' } },
        [{ name: 'id', value: 1 }]
      )
      expect(escapedSql).toBe('SELECT * FROM myTable WHERE id = :id')
      expect(processedParams).toEqual([
        { name: 'id', value: { longValue: 1 } }
      ])
    })

    test('mulitple params, named param, single record', async () => {
      let { processedParams,escapedSql } = processParams(
        'SELECT ::columnName FROM myTable WHERE id = :id AND id2 = :id2',
        { id: { type: 'n_ph' }, id2: { type: 'n_ph' }, columnName: { type: 'n_id' } },
        [
          { name: 'id', value: 1 },
          { name: 'id2', value: 2 },
          { name: 'columnName', value: 'testColumn' }
        ]
      )
      expect(escapedSql).toBe('SELECT `testColumn` FROM myTable WHERE id = :id AND id2 = :id2')
      expect(processedParams).toEqual([
        { name: 'id', value: { longValue: 1 } },
        { name: 'id2', value: { longValue: 2 } }
      ])
    })

    test('single param, multiple records', async () => {
      let { processedParams,escapedSql } = processParams(
        'SELECT * FROM myTable WHERE id = :id',
        { id: { type: 'n_ph' } },
        [
          [{ name: 'id', value: 1 }],
          [{ name: 'id', value: 2 }]
        ]
      )
      expect(escapedSql).toBe('SELECT * FROM myTable WHERE id = :id')
      expect(processedParams).toEqual([
        [ { name: 'id', value: { longValue: 1 } } ],
        [ { name: 'id', value: { longValue: 2 } } ]
      ])
    })

    test('multiple params, multiple records', async () => {
      let { processedParams,escapedSql } = processParams(
        'SELECT * FROM myTable WHERE id = :id',
        { id: { type: 'n_ph' }, id2: { type: 'n_ph' } },
        [
          [{ name: 'id', value: 1 }, { name: 'id2', value: 2 } ],
          [{ name: 'id', value: 2 }, { name: 'id2', value: 3 } ]
        ]
      )
      expect(escapedSql).toBe('SELECT * FROM myTable WHERE id = :id')
      expect(processedParams).toEqual([
        [ { name: 'id', value: { longValue: 1 } }, { name: 'id2', value: { longValue: 2 } } ],
        [ { name: 'id', value: { longValue: 2 } }, { name: 'id2', value: { longValue: 3 } } ]
      ])
    })

    test('mulitple params, named params, multiple records', async () => {
      let { processedParams,escapedSql } = processParams(
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
        ]
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

  }) // end processParams

})

describe('querying', () => {

  describe('query', () => {

    const query = dataApiClient.__get__('query')

    let parameters = {}

    const config = {
      secretArn: 'secretArn',
      resourceArn: 'resourceArn',
      database: 'db',
      RDS: {
        executeStatement: (params) => {
          // capture the parameters for testing
          parameters = params
          return {
            promise: () => {
              return require('./test/sample-query-response.json')
            }
          }
        }
      }
    }

    test('simple query', async () => {

      let result = await query(config,'SELECT * FROM table WHERE id < :id',{ id: 3 })

      expect(result).toEqual({
        records: [
          [ 1, 'Category 1', null, '2019-11-12 22:00:11', '2019-11-12 22:15:25', null ],
          [ 2, 'Category 2', 'Description of Category 2', '2019-11-12 22:17:11', '2019-11-12 22:21:36', null ]
        ]
      })
      expect(parameters).toEqual({
        secretArn: 'secretArn',
        resourceArn: 'resourceArn',
        database: 'db',
        sql: 'SELECT * FROM table WHERE id < :id',
        parameters: [ { name: 'id', value: { longValue: 3 } } ]
      })

    })
  }) // end query

  describe('formatRecords', () => {

    const formatRecords = dataApiClient.__get__('formatRecords')

    test('with columnMetadata', async () => {
      let { records, columnMetadata } = require('./test/sample-query-response.json')
      let result = formatRecords(records, columnMetadata)
      expect(result).toEqual([
        {
          created: '2019-11-12 22:00:11',
          deleted: null,
          description: null,
          id: 1,
          modified: '2019-11-12 22:15:25',
          name: 'Category 1'
        },
        {
          created: '2019-11-12 22:17:11',
          deleted: null,
          description: 'Description of Category 2',
          id: 2,
          modified: '2019-11-12 22:21:36',
          name: 'Category 2'
        }
      ])
    })

    test('without columnMetadata', async () => {
      let { records } = require('./test/sample-query-response.json')
      let result = formatRecords(records, false)
      expect(result).toEqual([
        [ 1, 'Category 1', null, '2019-11-12 22:00:11', '2019-11-12 22:15:25', null ],
        [ 2, 'Category 2', 'Description of Category 2', '2019-11-12 22:17:11', '2019-11-12 22:21:36', null ]
      ])
    })
  }) // end formatRecords


  describe('formatUpdateResults', () => {

    const formatUpdateResults = dataApiClient.__get__('formatUpdateResults')

    test('with insertIds', async () => {
      let { updateResults } = require('./test/sample-batch-insert-response.json')
      let result = formatUpdateResults(updateResults)
      expect(result).toEqual([
        { insertId: 316 },
        { insertId: 317 }
      ])
    })

    test('without insertIds', async () => {
      let { updateResults } = require('./test/sample-batch-update-response.json')
      let result = formatUpdateResults(updateResults)
      expect(result).toEqual([
        { },
        { }
      ])
    })

  })


describe('formatResults', () => {

  const formatResults = dataApiClient.__get__('formatResults')

  test('select (hydrate)', async () => {
    let response = require('./test/sample-query-response.json')
    let result = formatResults(response,true,false)
    expect(result).toEqual({
      records: [
        {
          created: '2019-11-12 22:00:11',
          deleted: null,
          description: null,
          id: 1,
          modified: '2019-11-12 22:15:25',
          name: 'Category 1'
        },
        {
          created: '2019-11-12 22:17:11',
          deleted: null,
          description: 'Description of Category 2',
          id: 2,
          modified: '2019-11-12 22:21:36',
          name: 'Category 2'
        }
      ]
    })
  })


  test('select (no hydrate)', async () => {
    let response = require('./test/sample-query-response.json')
    let result = formatResults(response,false,false)
    expect(result).toEqual({
      records: [
        [ 1, 'Category 1', null, '2019-11-12 22:00:11', '2019-11-12 22:15:25', null ],
        [ 2, 'Category 2', 'Description of Category 2', '2019-11-12 22:17:11', '2019-11-12 22:21:36', null ]
      ]
    })
  })

  test('select (with metadata)', async () => {
    let response = require('./test/sample-query-response.json')
    let { columnMetadata } = require('./test/sample-query-response.json')
    let result = formatResults(response,false,true)
    expect(result).toEqual({
      columnMetadata,
      records: [
        [ 1, 'Category 1', null, '2019-11-12 22:00:11', '2019-11-12 22:15:25', null ],
        [ 2, 'Category 2', 'Description of Category 2', '2019-11-12 22:17:11', '2019-11-12 22:21:36', null ]
      ]
    })
  })

  test('update', async () => {
    let response = require('./test/sample-update-response.json')
    let result = formatResults(response,false,false)
    expect(result).toEqual({
      numberOfRecordsUpdated: 1
    })
  })

  test('delete', async () => {
    let response = require('./test/sample-delete-response.json')
    let result = formatResults(response,false,false)
    expect(result).toEqual({
      numberOfRecordsUpdated: 1
    })
  })

  test('insert', async () => {
    let response = require('./test/sample-insert-response.json')
    let result = formatResults(response,false,false)
    expect(result).toEqual({
      insertId: 315,
      numberOfRecordsUpdated: 1
    })
  })

  test('batch update', async () => {
    let response = require('./test/sample-batch-update-response.json')
    let result = formatResults(response,false,false)
    expect(result).toEqual({
      updateResults: [ {}, {} ]
    })
  })

  test('batch delete', async () => {
    let response = require('./test/sample-batch-delete-response.json')
    let result = formatResults(response,false,false)
    expect(result).toEqual({
      updateResults: [ {}, {} ]
    })
  })

  test('batch insert', async () => {
    let response = require('./test/sample-batch-insert-response.json')
    let result = formatResults(response,false,false)
    expect(result).toEqual({
      updateResults: [ { insertId: 316 }, { insertId: 317 } ]
    })
  })


  // Formats the results of a query response
  // const formatResults = (
  //   { // destructure results
  //     columnMetadata, // ONLY when hydrate or includeResultMetadata is true
  //     numberOfRecordsUpdated, // ONLY for executeStatement method
  //     records, // ONLY for executeStatement method
  //     generatedFields, // ONLY for INSERTS
  //     updateResults // ONLY on batchExecuteStatement
  //   },
  //   hydrate,
  //   includeMeta
  // ) =>
  //   Object.assign(
  //     includeMeta ? { columnMetadata } : {},
  //     numberOfRecordsUpdated !== undefined && !records ? { numberOfRecordsUpdated } : {},
  //     records ? {
  //       records: formatRecords(records, hydrate ? columnMetadata : false)
  //     } : {},
  //     updateResults ? { updateResults: formatUpdateResults(updateResults) } : {},
  //     generatedFields && generatedFields.length > 0 ?
  //       { insertId: generatedFields[0].longValue } : {}
  //   )


})


})
