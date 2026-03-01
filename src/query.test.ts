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

describe('batch queries', () => {
  test('batch INSERT without RETURNING uses BatchExecuteStatementCommand', async () => {
    const capturedCommands: any[] = []

    const config: InternalConfig = {
      secretArn: 'secretArn',
      resourceArn: 'resourceArn',
      database: 'db',
      engine: 'pg',
      hydrateColumnNames: false,
      formatOptions: { deserializeDate: false, treatAsLocalDate: false },
      RDS: {
        send: async (command: any) => {
          capturedCommands.push(command)
          return { updateResults: [{ generatedFields: [] }, { generatedFields: [] }] }
        }
      } as any
    }

    await query.call(
      undefined,
      config,
      'INSERT INTO users (name, email) VALUES (:name, :email)',
      [[{ name: 'Alice', email: 'alice@test.com' }], [{ name: 'Bob', email: 'bob@test.com' }]]
    )

    // Should use a single BatchExecuteStatementCommand
    expect(capturedCommands).toHaveLength(1)
    expect(capturedCommands[0].constructor.name).toBe('BatchExecuteStatementCommand')
    expect(capturedCommands[0].input.parameterSets).toBeDefined()
    expect(capturedCommands[0].input.parameters).toBeUndefined()
  })

  test('batch INSERT with RETURNING uses individual ExecuteStatementCommands', async () => {
    const capturedCommands: any[] = []
    let callCount = 0

    const config: InternalConfig = {
      secretArn: 'secretArn',
      resourceArn: 'resourceArn',
      database: 'db',
      engine: 'pg',
      hydrateColumnNames: true,
      formatOptions: { deserializeDate: false, treatAsLocalDate: false },
      RDS: {
        send: async (command: any) => {
          capturedCommands.push(command)
          callCount++
          return {
            columnMetadata: [
              { label: 'id', name: 'id', typeName: 'int4' }
            ],
            records: [[{ longValue: callCount }]],
            numberOfRecordsUpdated: 1
          }
        }
      } as any
    }

    const result = await query.call(
      undefined,
      config,
      'INSERT INTO users (name, email) VALUES (:name, :email) RETURNING id',
      [[{ name: 'Alice', email: 'alice@test.com' }], [{ name: 'Bob', email: 'bob@test.com' }]]
    )

    // Should use individual ExecuteStatementCommands (one per parameter set)
    expect(capturedCommands).toHaveLength(2)
    for (const cmd of capturedCommands) {
      expect(cmd.constructor.name).toBe('ExecuteStatementCommand')
      expect(cmd.input.parameters).toBeDefined()
      expect(cmd.input.parameterSets).toBeUndefined()
    }

    // Should merge records from all individual results
    expect(result.records).toHaveLength(2)
    expect(result.records).toEqual([{ id: 1 }, { id: 2 }])
  })

  test('batch INSERT with RETURNING (case-insensitive) is detected', async () => {
    const capturedCommands: any[] = []

    const config: InternalConfig = {
      secretArn: 'secretArn',
      resourceArn: 'resourceArn',
      database: 'db',
      engine: 'pg',
      hydrateColumnNames: false,
      formatOptions: { deserializeDate: false, treatAsLocalDate: false },
      RDS: {
        send: async (command: any) => {
          capturedCommands.push(command)
          return {
            records: [[{ longValue: 1 }]],
            numberOfRecordsUpdated: 1
          }
        }
      } as any
    }

    await query.call(
      undefined,
      config,
      'INSERT INTO users (name) VALUES (:name) returning id',
      [[{ name: 'Alice' }]]
    )

    // Should detect lowercase "returning" and use ExecuteStatementCommand
    expect(capturedCommands).toHaveLength(1)
    expect(capturedCommands[0].constructor.name).toBe('ExecuteStatementCommand')
  })

  test('batch INSERT with RETURNING returns empty object when no records', async () => {
    const config: InternalConfig = {
      secretArn: 'secretArn',
      resourceArn: 'resourceArn',
      database: 'db',
      engine: 'pg',
      hydrateColumnNames: false,
      formatOptions: { deserializeDate: false, treatAsLocalDate: false },
      RDS: {
        send: async () => {
          return {
            records: [],
            numberOfRecordsUpdated: 1
          }
        }
      } as any
    }

    const result = await query.call(
      undefined,
      config,
      'INSERT INTO users (name) VALUES (:name) RETURNING id',
      [[{ name: 'Alice' }]]
    )

    expect(result).toEqual({})
  })

  test('non-batch query with RETURNING works normally', async () => {
    const capturedCommands: any[] = []

    const config: InternalConfig = {
      secretArn: 'secretArn',
      resourceArn: 'resourceArn',
      database: 'db',
      engine: 'pg',
      hydrateColumnNames: false,
      formatOptions: { deserializeDate: false, treatAsLocalDate: false },
      RDS: {
        send: async (command: any) => {
          capturedCommands.push(command)
          return {
            records: [[{ longValue: 42 }]],
            numberOfRecordsUpdated: 1
          }
        }
      } as any
    }

    await query.call(
      undefined,
      config,
      'INSERT INTO users (name) VALUES (:name) RETURNING id',
      { name: 'Alice' }
    )

    // Single query with RETURNING should use standard ExecuteStatementCommand (not batch path)
    expect(capturedCommands).toHaveLength(1)
    expect(capturedCommands[0].constructor.name).toBe('ExecuteStatementCommand')
  })
})
