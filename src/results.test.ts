import { formatRecords, formatUpdateResults, formatResults } from './results'

describe('formatRecords', () => {
  test('with columnMetadata', async () => {
    let { records, columnMetadata } = require('#fixtures/sample-query-response.json')
    let result = formatRecords(records, columnMetadata, true, { deserializeDate: false, treatAsLocalDate: false })
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
    let { records } = require('#fixtures/sample-query-response.json')
    let result = formatRecords(records, undefined, false, { deserializeDate: false, treatAsLocalDate: false })
    expect(result).toEqual([
      [1, 'Category 1', null, '2019-11-12 22:00:11', '2019-11-12 22:15:25', null],
      [2, 'Category 2', 'Description of Category 2', '2019-11-12 22:17:11', '2019-11-12 22:21:36', null]
    ])
  })
})

describe('formatUpdateResults', () => {
  test('with insertIds', async () => {
    let { updateResults } = require('#fixtures/sample-batch-insert-response.json')
    let result = formatUpdateResults(updateResults)
    expect(result).toEqual([{ insertId: 316 }, { insertId: 317 }])
  })

  test('without insertIds', async () => {
    let { updateResults } = require('#fixtures/sample-batch-update-response.json')
    let result = formatUpdateResults(updateResults)
    expect(result).toEqual([{}, {}])
  })
})

describe('formatResults', () => {
  test('select (hydrate)', async () => {
    let response = require('#fixtures/sample-query-response.json')
    let result = formatResults(response, true, false, { deserializeDate: false, treatAsLocalDate: false })
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

  test('select (hydrate) with date deserialization', async () => {
    let response = require('#fixtures/sample-query-response.json')
    let result = formatResults(response, true, false, { deserializeDate: true, treatAsLocalDate: false })
    expect(result).toEqual({
      records: [
        {
          created: new Date('2019-11-12T22:00:11Z'),
          deleted: null,
          description: null,
          id: 1,
          modified: new Date('2019-11-12T22:15:25Z'),
          name: 'Category 1'
        },
        {
          created: new Date('2019-11-12T22:17:11Z'),
          deleted: null,
          description: 'Description of Category 2',
          id: 2,
          modified: new Date('2019-11-12T22:21:36Z'),
          name: 'Category 2'
        }
      ]
    })
  })

  test('select (no hydrate)', async () => {
    let response = require('#fixtures/sample-query-response.json')
    let result = formatResults(response, false, false, { deserializeDate: false, treatAsLocalDate: false })
    expect(result).toEqual({
      records: [
        [1, 'Category 1', null, '2019-11-12 22:00:11', '2019-11-12 22:15:25', null],
        [2, 'Category 2', 'Description of Category 2', '2019-11-12 22:17:11', '2019-11-12 22:21:36', null]
      ]
    })
  })

  test('select (with metadata)', async () => {
    let response = require('#fixtures/sample-query-response.json')
    let { columnMetadata } = require('#fixtures/sample-query-response.json')
    let result = formatResults(response, false, true, { deserializeDate: false, treatAsLocalDate: false })
    expect(result).toEqual({
      columnMetadata,
      records: [
        [1, 'Category 1', null, '2019-11-12 22:00:11', '2019-11-12 22:15:25', null],
        [2, 'Category 2', 'Description of Category 2', '2019-11-12 22:17:11', '2019-11-12 22:21:36', null]
      ]
    })
  })

  test('select (with date deserialization to UTC)', async () => {
    let response = require('#fixtures/sample-query-response.json')
    let result = formatResults(response, false, false, { deserializeDate: true, treatAsLocalDate: false })
    expect(result).toEqual({
      records: [
        [1, 'Category 1', null, new Date('2019-11-12T22:00:11.000Z'), new Date('2019-11-12T22:15:25.000Z'), null],
        [
          2,
          'Category 2',
          'Description of Category 2',
          new Date('2019-11-12T22:17:11.000Z'),
          new Date('2019-11-12T22:21:36.000Z'),
          null
        ]
      ]
    })
  })

  test('select (with date deserialization to local TZ)', async () => {
    let response = require('#fixtures/sample-query-response.json')
    let result = formatResults(response, false, false, { deserializeDate: true, treatAsLocalDate: true })
    expect(result).toEqual({
      records: [
        [1, 'Category 1', null, new Date('2019-11-12 22:00:11'), new Date('2019-11-12 22:15:25'), null],
        [
          2,
          'Category 2',
          'Description of Category 2',
          new Date('2019-11-12 22:17:11'),
          new Date('2019-11-12 22:21:36'),
          null
        ]
      ]
    })
  })

  test('update', async () => {
    let response = require('#fixtures/sample-update-response.json')
    let result = formatResults(response, false, false, { deserializeDate: false, treatAsLocalDate: false })
    expect(result).toEqual({
      numberOfRecordsUpdated: 1
    })
  })

  test('delete', async () => {
    let response = require('#fixtures/sample-delete-response.json')
    let result = formatResults(response, false, false, { deserializeDate: false, treatAsLocalDate: false })
    expect(result).toEqual({
      numberOfRecordsUpdated: 1
    })
  })

  test('insert', async () => {
    let response = require('#fixtures/sample-insert-response.json')
    let result = formatResults(response, false, false, { deserializeDate: false, treatAsLocalDate: false })
    expect(result).toEqual({
      insertId: 315,
      numberOfRecordsUpdated: 1
    })
  })

  test('batch update', async () => {
    let response = require('#fixtures/sample-batch-update-response.json')
    let result = formatResults(response, false, false, { deserializeDate: false, treatAsLocalDate: false })
    expect(result).toEqual({
      updateResults: [{}, {}]
    })
  })

  test('batch delete', async () => {
    let response = require('#fixtures/sample-batch-delete-response.json')
    let result = formatResults(response, false, false, { deserializeDate: false, treatAsLocalDate: false })
    expect(result).toEqual({
      updateResults: [{}, {}]
    })
  })

  test('batch insert', async () => {
    let response = require('#fixtures/sample-batch-insert-response.json')
    let result = formatResults(response, false, false, { deserializeDate: false, treatAsLocalDate: false })
    expect(result).toEqual({
      updateResults: [{ insertId: 316 }, { insertId: 317 }]
    })
  })
})
