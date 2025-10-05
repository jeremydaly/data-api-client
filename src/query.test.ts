import { query } from './query'
import type { InternalConfig } from './types'

describe('query', () => {
  let parameters = {}

  const config: InternalConfig = {
    secretArn: 'secretArn',
    resourceArn: 'resourceArn',
    database: 'db',
    engine: 'mysql',
    hydrateColumnNames: false,
    formatOptions: { deserializeDate: false, treatAsLocalDate: false },
    RDS: {
      send: async (command: any) => {
        // capture the parameters for testing
        parameters = command.input
        return require('#fixtures/sample-query-response.json')
      }
    } as any
  }

  test('simple query', async () => {
    let result = await query.call(undefined, config, 'SELECT * FROM table WHERE id < :id', { id: 3 })

    expect(result).toEqual({
      records: [
        [1, 'Category 1', null, '2019-11-12 22:00:11', '2019-11-12 22:15:25', null],
        [2, 'Category 2', 'Description of Category 2', '2019-11-12 22:17:11', '2019-11-12 22:21:36', null]
      ]
    })
    expect(parameters).toEqual({
      secretArn: 'secretArn',
      resourceArn: 'resourceArn',
      database: 'db',
      sql: 'SELECT * FROM table WHERE id < :id',
      parameters: [{ name: 'id', value: { longValue: 3 } }]
    })
  })
})
