# Compatibility Layer

The `data-api-client` compatibility layer provides drop-in replacements for popular database clients, allowing you to use existing ORMs and query builders with the AWS RDS Data API.

## Features

- 🔄 **Drop-in compatibility** with `pg` (node-postgres) and `mysql2`
- 🚀 **Zero code changes** for most use cases
- 🎯 **ORM support** for Drizzle, Kysely, Knex, and more
- 📦 **Tree-shakable** - only import what you need
- 🔒 **Type-safe** with full TypeScript support

## Installation

```bash
npm install data-api-client @aws-sdk/client-rds-data
```

## PostgreSQL Compatibility

### Basic Usage

```typescript
import { createPgClient } from 'data-api-client/compat/pg'

const client = createPgClient({
  secretArn: process.env.DB_SECRET_ARN,
  resourceArn: process.env.DB_RESOURCE_ARN,
  database: 'mydb'
})

await client.connect()

// Use $1, $2 placeholders like node-postgres
const result = await client.query('SELECT * FROM users WHERE id = $1', [123])
console.log(result.rows[0])

await client.end()
```

### Pool Usage

```typescript
import { createPgPool } from 'data-api-client/compat/pg'

const pool = createPgPool({
  secretArn: process.env.DB_SECRET_ARN,
  resourceArn: process.env.DB_RESOURCE_ARN,
  database: 'mydb'
})

// Direct query
const result = await pool.query('SELECT * FROM users')
console.log(result.rows)

// Get connection from pool
const client = await pool.connect()
try {
  await client.query('SELECT * FROM users WHERE id = $1', [123])
} finally {
  client.release()
}
```

### API Compatibility

The pg compatibility layer implements:

- ✅ `client.connect()` - No-op (included for API parity)
- ✅ `client.query(sql, params)` - Query with `$1, $2` placeholders
- ✅ `client.query({ text, values })` - Named query format
- ✅ `client.end()` - No-op (included for API parity)
- ✅ `pool.connect()` - Returns client with `release()` method
- ✅ `pool.query()` - Direct pool queries

### Result Format

```typescript
interface PgQueryResult<R = any> {
  rows: R[]              // Query results as objects
  rowCount: number       // Number of rows
  command: string        // SQL command (SELECT, INSERT, etc.)
  fields: Array<{        // Column metadata
    name: string
  }>
}
```

## MySQL2 Compatibility

### Basic Usage

```typescript
import { createMySQLConnection } from 'data-api-client/compat/mysql2'

const connection = createMySQLConnection({
  secretArn: process.env.DB_SECRET_ARN,
  resourceArn: process.env.DB_RESOURCE_ARN,
  database: 'mydb'
})

await connection.connect()

// Use ? placeholders like mysql2
const [rows, fields] = await connection.query(
  'SELECT * FROM users WHERE id = ?',
  [123]
)
console.log(rows[0])

await connection.end()
```

### Pool Usage

```typescript
import { createMySQLPool } from 'data-api-client/compat/mysql2'

const pool = createMySQLPool({
  secretArn: process.env.DB_SECRET_ARN,
  resourceArn: process.env.DB_RESOURCE_ARN,
  database: 'mydb'
})

// Direct query
const [rows, fields] = await pool.query('SELECT * FROM users')
console.log(rows)

// Get connection from pool
const connection = await pool.getConnection()
try {
  await connection.query('SELECT * FROM users WHERE id = ?', [123])
} finally {
  connection.release()
}
```

### API Compatibility

The mysql2 compatibility layer implements:

- ✅ `connection.connect()` - No-op (included for API parity)
- ✅ `connection.query(sql, params)` - Query with `?` placeholders
- ✅ `connection.query({ sql, values })` - Named query format
- ✅ `connection.execute(sql, params)` - Same as query (no prepared statements)
- ✅ `connection.end()` - No-op (included for API parity)
- ✅ `pool.getConnection()` - Returns connection with `release()` method
- ✅ `pool.query()` - Direct pool queries

### Result Format

```typescript
// Returns tuple: [rows | result, fields]

// For SELECT:
const [rows, fields] = await connection.query('SELECT ...')
// rows: Array of objects
// fields: Array of field metadata

// For INSERT:
const [result, fields] = await connection.query('INSERT ...')
// result: { insertId, affectedRows }

// For UPDATE/DELETE:
const [result, fields] = await connection.query('UPDATE ...')
// result: { affectedRows, changedRows }
```

## ORM Integration

### Drizzle ORM

**PostgreSQL:**

```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import { createPgClient } from 'data-api-client/compat/pg'

const client = createPgClient({ ... })
const db = drizzle(client)

// Use Drizzle normally
const users = await db.select().from(usersTable)
```

**MySQL:**

```typescript
import { drizzle } from 'drizzle-orm/mysql2'
import { createMySQLConnection } from 'data-api-client/compat/mysql2'

const connection = createMySQLConnection({ ... })
const db = drizzle(connection)

// Use Drizzle normally
const users = await db.select().from(usersTable)
```

### Kysely

```typescript
import { Kysely, PostgresDialect } from 'kysely'
import { createPgPool } from 'data-api-client/compat/pg'

const db = new Kysely({
  dialect: new PostgresDialect({
    pool: createPgPool({ ... })
  })
})

// Use Kysely normally
const users = await db
  .selectFrom('users')
  .selectAll()
  .execute()
```

### Knex

```typescript
import knex from 'knex'
import { createPgClient } from 'data-api-client/compat/pg'

const db = knex({
  client: 'pg',
  connection: createPgClient({ ... })
})

// Use Knex normally
const users = await db('users').select('*')
```

## Migration Guide

### From node-postgres (pg)

**Before:**

```typescript
import { Client } from 'pg'

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'user',
  password: 'pass'
})

await client.connect()
const result = await client.query('SELECT * FROM users WHERE id = $1', [123])
await client.end()
```

**After:**

```typescript
import { createPgClient } from 'data-api-client/compat/pg'

const client = createPgClient({
  secretArn: process.env.DB_SECRET_ARN,
  resourceArn: process.env.DB_RESOURCE_ARN,
  database: 'mydb'
})

await client.connect()
const result = await client.query('SELECT * FROM users WHERE id = $1', [123])
await client.end()
```

### From mysql2

**Before:**

```typescript
import mysql from 'mysql2/promise'

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'user',
  password: 'pass',
  database: 'mydb'
})

const [rows, fields] = await connection.query('SELECT * FROM users WHERE id = ?', [123])
await connection.end()
```

**After:**

```typescript
import { createMySQLConnection } from 'data-api-client/compat/mysql2'

const connection = createMySQLConnection({
  secretArn: process.env.DB_SECRET_ARN,
  resourceArn: process.env.DB_RESOURCE_ARN,
  database: 'mydb'
})

const [rows, fields] = await connection.query('SELECT * FROM users WHERE id = ?', [123])
await connection.end()
```

## Configuration Options

All configuration options from the core `data-api-client` are supported:

```typescript
import { createPgClient } from 'data-api-client/compat/pg'

const client = createPgClient({
  // Required
  secretArn: string,
  resourceArn: string,

  // Optional
  database: string,
  formatOptions: {
    deserializeDate: boolean,    // Auto-parse dates (default: true)
    treatAsLocalDate: boolean    // Use local time (default: false)
  },
  options: {
    region: string,
    // ... other RDSDataClient options
  }
})
```

## Limitations

### Connection Pooling

- Pool methods like `pool.connect()` and `connection.release()` are no-ops
- The Data API handles connection management internally
- Pool size configuration has no effect

### Transactions

- Transaction support through the Data API is automatic
- Manual transaction control (BEGIN, COMMIT, ROLLBACK) works but may not behave exactly like traditional clients
- Use the core `transaction()` API for better control

### Prepared Statements

- `execute()` method works but doesn't use actual prepared statements
- The Data API doesn't support client-side prepared statements
- Performance is similar to regular queries

## Advanced Usage

### Custom AWS Client

```typescript
import { RDSDataClient } from '@aws-sdk/client-rds-data'
import { createPgClient } from 'data-api-client/compat/pg'

const rdsClient = new RDSDataClient({
  region: 'us-east-1',
  // X-Ray tracing, custom endpoints, etc.
})

const client = createPgClient({
  client: rdsClient,
  secretArn: '...',
  resourceArn: '...'
})
```

### Error Handling

```typescript
try {
  const result = await client.query('SELECT * FROM users')
} catch (error) {
  if (error.name === 'BadRequestException') {
    // Invalid SQL or parameters
  } else if (error.name === 'StatementTimeoutException') {
    // Query timeout
  }
}
```

## Type Safety

Full TypeScript support with generics:

```typescript
interface User {
  id: number
  name: string
  email: string
}

// PostgreSQL
const result = await client.query<User>(
  'SELECT * FROM users WHERE id = $1',
  [123]
)
result.rows // Type: User[]

// MySQL
const [rows, fields] = await connection.query<User>(
  'SELECT * FROM users WHERE id = ?',
  [123]
)
rows // Type: User[]
```

## Performance

- **No connection overhead** - Data API handles connections
- **Lambda optimized** - No VPC configuration needed
- **Cold start impact** - Minimal (~50-100ms for SDK initialization)
- **Warm requests** - Sub-100ms query execution

## Troubleshooting

### "Module not found" errors

Make sure you have the correct import path:

```typescript
// ✅ Correct
import { createPgClient } from 'data-api-client/compat/pg'

// ❌ Wrong
import { createPgClient } from 'data-api-client/compat'
```

### "secretArn is required" errors

Ensure environment variables are set:

```typescript
const client = createPgClient({
  secretArn: process.env.DB_SECRET_ARN!,  // Must be set
  resourceArn: process.env.DB_RESOURCE_ARN!,  // Must be set
  database: process.env.DB_NAME!
})
```

### Parameter conversion issues

The compatibility layer automatically converts placeholders:

- PostgreSQL: `$1, $2` → `:p1, :p2`
- MySQL: `?` → `:p1, :p2`

If you experience issues, use the core API directly.

## Examples

See [compat-usage.ts](./compat-usage.ts) for comprehensive examples including:

- Basic CRUD operations
- ORM integration (Drizzle, Kysely)
- Error handling
- Advanced configuration
- Migration guides

## Contributing

Found a bug or want to add a feature? Please open an issue or PR on the [GitHub repository](https://github.com/jeremydaly/data-api-client).

## License

MIT - see LICENSE file for details
