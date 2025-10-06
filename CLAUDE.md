# CLAUDE.md - Context for AI-Assisted Development

## Project Overview

**data-api-client** is a lightweight wrapper for the Amazon Aurora Serverless Data API that simplifies database interactions by abstracting away field value type annotations. It acts as a "DocumentClient" equivalent for the RDS Data API.

- **Package Name**: data-api-client
- **Current Version**: 2.0.0.beta.1
- **Author**: Jeremy Daly <jeremy@jeremydaly.com>
- **License**: MIT
- **Repository**: https://github.com/jeremydaly/data-api-client

## Project Status

Version 2.0 beta supports:
- New RDS Data API for Aurora Serverless v2 and Aurora provisioned database instances
- Amazon Aurora PostgreSQL-Compatible Edition enhancements
- AWS SDK v3 (migrated from v2)
- Full TypeScript implementation with type definitions

## Architecture

### TypeScript Source with CommonJS Output
The library is written in TypeScript and compiled to CommonJS JavaScript for backward compatibility.

**Modular Source Structure**:
- `src/index.ts` - Entry point (exports `init` from client.ts)
- `src/client.ts` - Client initialization and configuration (~155 lines)
- `src/types.ts` - TypeScript type definitions and interfaces (~171 lines)
- `src/params.ts` - Parameter parsing, normalization, and processing (~183 lines)
- `src/query.ts` - Query execution logic (~95 lines)
- `src/results.ts` - Result formatting and record processing, including array value parsing (~165 lines)
- `src/transaction.ts` - Transaction management (~87 lines)
- `src/utils.ts` - Utility functions for SQL parsing, type detection, and date handling (~154 lines)
- Compiled output in `dist/`: `index.js`, `index.d.ts`, `types.js`, `types.d.ts`, etc.

**Key architectural decisions**:
1. **TypeScript with build step** - Written in TypeScript, compiled to JavaScript
2. **Modular architecture** - Code split into focused modules for maintainability
3. **Full type safety** - Comprehensive type definitions for all APIs
4. **CommonJS output** - Maintains backward compatibility with existing users
5. **AWS SDK v3** - Uses modular @aws-sdk/client-rds-data package (peer dependency)
6. **Minimal dependencies** - Only `sqlstring` and `pg-escape` in production
7. **Functional approach** - Uses closures and function composition
8. **Command-based wrapper** - Uses AWS SDK v3 Commands with client.send() pattern

### Core Components

#### 1. Initialization (`init` function in client.ts)
- Creates a configuration object with defaults
- Instantiates RDSDataClient from AWS SDK v3
- Returns public API: `query()`, `transaction()`, and command-based RDS methods

#### 2. Query Execution (`query` function in query.ts)
- Parses SQL and parameters
- Detects batch vs single queries
- Handles parameter type conversion
- Formats results with/without column names
- Supports transactions via rollback context

#### 3. Transaction Management (transaction.ts)
- `transaction()` - Creates transaction object with method chaining
- `commit()` - Executes queries within a transaction
- Automatic rollback on error

#### 4. Type System (types.ts)
Supported types:
- `stringValue` - String, Date (converted to timestamp)
- `booleanValue` - Boolean
- `longValue` - Integer
- `doubleValue` - Float
- `isNull` - Null
- `blobValue` - Buffer
- `arrayValue` - Array support (Data API v2)
- `structValue` - For Postgres

#### 5. Special Features

**Named Identifiers** (params.ts)
- Uses `::` prefix for dynamic table/column names
- Auto-escapes using engine-specific escaping:
  - PostgreSQL: `pg-escape.ident()` produces `"identifier"`
  - MySQL: `sqlstring.escapeId()` produces `` `identifier` ``
- Example: `::tableName` becomes `` `table_value` `` (MySQL) or `"table_value"` (PostgreSQL)

**Named Parameters**
- Uses `:` prefix for query parameters
- Example: `:id` maps to `{ id: 123 }`

**Type Casting** (params.ts)
- Supports explicit type casting for Postgres/MySQL
- Example: `{ name: 'id', value: uuid, cast: 'uuid' }`
- PostgreSQL format: `:id::uuid`
- MySQL format: `CAST(:id AS uuid)`

**Date Handling** (utils.ts, results.ts)
- `formatOptions.deserializeDate` - Auto-parse date strings to Date objects (default: true)
- `formatOptions.treatAsLocalDate` - Treat dates as local time instead of UTC (default: false)
- Default format: `YYYY-MM-DD HH:MM:SS[.FFF]`

**Array Handling** (results.ts)
- PostgreSQL arrays are automatically converted from Data API `arrayValue` format to native JavaScript arrays
- Supports all primitive array types: `stringValues`, `longValues`, `doubleValues`, `booleanValues`
- Handles nested/multidimensional arrays recursively
- Array parameters must use workarounds (see Known Limitations)

## Configuration Options

```javascript
{
  // Required
  secretArn: string,      // ARN of Secrets Manager secret
  resourceArn: string,    // ARN of Aurora Serverless cluster

  // Optional
  database: string,       // Default database name
  engine: 'mysql'|'pg',   // Database engine (default: 'mysql')
  hydrateColumnNames: boolean,  // Return objects vs arrays (default: true)
  options: object,        // Passed to RDSDataClient constructor
  client: RDSDataClient, // Custom RDSDataClient instance (for X-Ray, etc.)

  formatOptions: {
    deserializeDate: boolean,      // Parse date strings (default: true)
    treatAsLocalDate: boolean      // Use local time (default: false)
  },

  // Deprecated (set in options instead)
  region: string,
  sslEnabled: boolean,  // Note: TLS is always enabled in SDK v3, use options.endpoint for local dev
  keepAlive: boolean    // Note: Use AWS_NODEJS_CONNECTION_REUSE_ENABLED env var instead
}
```

## Testing

- **Framework**: Vitest (migrated from Jest)
- **Test structure**:
  - Unit tests: `src/*.test.ts` (4 test files colocated with source)
  - Integration tests: `integration-tests/*.test.ts` (4 test files for MySQL and PostgreSQL)
- **Config**: `vitest.config.mjs` (ES module format, requires `.mjs` extension)
- **IMPORTANT**: Before running integration tests, run `source .env.local` to load AWS credentials and cluster ARNs
- **Sample data**: `fixtures/sample-*-response.json` files (imported via `#fixtures/*` alias)
- **Run tests**:
  - `npm test` - Build + run unit tests
  - `npm run test:unit` - Build + run unit tests
  - `npm run test:integration` - Build + run all integration tests (requires `.env.local`)
  - `npm run test:integration:mysql` - Build + run MySQL integration tests (requires `.env.local`)
  - `npm run test:integration:postgres` - Build + run PostgreSQL integration tests (requires `.env.local`)
  - `npm run test-ci` - Build + lint + run unit tests (for CI)
  - For manual integration test runs: `source .env.local && npx vitest run integration-tests/<test-file>`
- **Global test functions**: Enabled via `globals: true` in config (no need to import describe/test/expect)
- **Test helpers**: Integration tests use `setup.ts` for database setup
- **Integration test credentials**: Stored in `.env.local` (not in git):
  - `MYSQL_RESOURCE_ARN`, `MYSQL_SECRET_ARN`, `MYSQL_DATABASE`
  - `POSTGRES_RESOURCE_ARN`, `POSTGRES_SECRET_ARN`, `POSTGRES_DATABASE`
  - `AWS_REGION`
- **PostgreSQL integration tests** cover:
  - All PostgreSQL data types (numeric, string, boolean, date/time, binary, JSON, UUID, network, range)
  - Array types with multiple workaround approaches
  - Transactions, batch operations, type casting
  - Known Data API limitations documented with `.fails()` tests in final section

## Code Style

### ESLint Configuration
- Base config: `eslint:recommended`, `prettier`
- TypeScript override for `*.ts` files:
  - Parser: `@typescript-eslint/parser`
  - Extends: `plugin:@typescript-eslint/recommended`
  - Project: `tsconfig.eslint.json`
- Environment: ES6, Node.js, Jest
- Key rules:
  - Unix line breaks
  - Single quotes (template literals allowed)
  - No semicolons
  - ECMAScript 2018
  - `@typescript-eslint/no-explicit-any`: off
  - `@typescript-eslint/no-unused-vars`: error (ignore args starting with `_`)

### Prettier Configuration
- No trailing commas
- No semicolons
- Single quotes
- 120 character line width

## Dependencies

### Production
- **sqlstring** (^2.3.2) - SQL identifier escaping and string formatting (MySQL)
- **pg-escape** (^0.2.0) - PostgreSQL identifier escaping

### Development
- **@aws-sdk/client-rds-data** (^3.712.0) - AWS SDK v3 RDS Data API client (also peer dep)
- **typescript** (^5.9.3) - TypeScript compiler
- **@types/node** (^24.6.2) - Node.js type definitions
- **@types/sqlstring** (^2.3.2) - sqlstring type definitions
- **@types/pg-escape** (^0.2.3) - pg-escape type definitions
- **@typescript-eslint/parser** (^8.45.0) - TypeScript ESLint parser
- **@typescript-eslint/eslint-plugin** (^8.45.0) - TypeScript ESLint rules
- **eslint** (^8.12.0) + plugins - Linting
- **vitest** (^3.2.4) - Testing framework
- **@vitest/ui** (^3.2.4) - Vitest UI
- **prettier** (^2.6.2) - Code formatting
- **tsx** (^4.20.6) - TypeScript execution engine

### Peer Dependencies
- **@aws-sdk/client-rds-data** (^3.0.0) - Optional peer dependency (available in Lambda runtime or installed by user)

## Common Patterns

### Parameter Normalization
The library accepts parameters in multiple formats:
```javascript
// As second argument (object)
query('SELECT * FROM users WHERE id = :id', { id: 123 })

// As second argument (array of objects)
query('SELECT * FROM users WHERE id = :id', [{ id: 123 }])

// In config object
query({ sql: 'SELECT...', parameters: { id: 123 } })

// Native Data API format (passed through)
query('SELECT...', [{ name: 'id', value: { longValue: 123 } }])

// Batch format (nested arrays)
query('UPDATE...', [[{ id: 1 }], [{ id: 2 }]])
```

### Result Formatting
```javascript
// With hydrateColumnNames: true (default)
{ records: [{ id: 1, name: 'Alice' }] }

// With hydrateColumnNames: false
{ records: [[1, 'Alice']] }

// INSERT queries
{ insertId: 42 }

// UPDATE/DELETE queries
{ numberOfRecordsUpdated: 5 }

// PostgreSQL arrays (automatically converted to native JavaScript arrays)
{ records: [{ tags: ['admin', 'editor', 'viewer'] }] }
```

## Known Limitations and Workarounds

### Array Parameters (RDS Data API Limitation)
The RDS Data API does **not support binding array parameters** directly. Attempts to use `arrayValue` parameters result in `ValidationException: Array parameters are not supported`.

**Workarounds for PostgreSQL Arrays**:

1. **CSV string with `string_to_array()`**:
```javascript
// Convert to array in SQL
query('INSERT INTO table (int_array) VALUES (string_to_array(:csv, \',\')::int[])', {
  csv: '1,2,3'
})
```

2. **PostgreSQL array literal syntax**:
```javascript
// Pass array literal as string
query('INSERT INTO table (text_array) VALUES (:literal::text[])', {
  literal: '{"admin","editor","viewer"}'
})
```

3. **ARRAY[] constructor with individual parameters**:
```javascript
// Good for fixed, small arrays
query('INSERT INTO table (text_array) VALUES (ARRAY[:tag1, :tag2, :tag3])', {
  tag1: 'blue',
  tag2: 'sale',
  tag3: 'featured'
})
```

**Array Results**: Despite parameter limitations, array results ARE supported. PostgreSQL arrays in query results are automatically converted to native JavaScript arrays.

### Other Limitations

1. **No dynamic identifiers in native API** - Fixed with `::` prefix in this library
2. **Batch operations limited** - Only INSERT, UPDATE, DELETE
3. **No record counts in batch** - Batch operations don't return `numberOfRecordsUpdated`
4. **MACADDR type unsupported** - Network MACADDR type not supported by Data API
5. **Some range types unsupported** - INT8RANGE, DATERANGE, TSRANGE have casting issues
6. **NULL values in arrays** - May not work correctly in all cases
7. **Multidimensional arrays** - Limited support for arrays with more than one dimension

## Development Workflow

### Making Changes
1. Edit TypeScript source in `src/*.ts`
2. Add/update tests in `src/*.test.ts` or `integration-tests/*.test.ts`
3. Run `npm run build` to compile TypeScript
4. Run `npm run lint` to check code style (lints TypeScript source)
5. Run `npm test` to verify tests pass (builds + runs Vitest)
6. Update README.md if adding features

### TypeScript Development Notes
- Source code is in `src/` directory (TypeScript)
- Tests are colocated in `src/*.test.ts` (TypeScript)
- Integration tests in `integration-tests/*.test.ts`
- Test fixtures in `fixtures/` directory, imported via `#fixtures/*` alias
- Compiled output goes to `dist/` directory
- Type definitions are automatically generated in `dist/`
- ESLint has TypeScript-specific rules for `.ts` files
- Vitest config uses ES modules (`.mjs`) while output is CommonJS
- Package.json `imports` field provides `#fixtures/*` alias for cleaner imports

### Build Process
1. `npm run prebuild` - Cleans dist directory
2. `npm run build` - Compiles TypeScript with `tsc`
3. Output directory: `dist/` (all compiled files)
4. Package points to `dist/index.js` (main) and `dist/index.d.ts` (types)

### Version Updates
- Update version in `package.json`
- Run `npm install` to update `package-lock.json`
- Tag commits appropriately

### CI/CD
- Tests can be run via `npm run test-ci` (linting + tests)
- Ready for GitHub Actions or other modern CI/CD

## Key Files

```
.
├── src/
│   ├── index.ts             # Entry point (exports init from client.ts)
│   ├── client.ts            # Client initialization and configuration
│   ├── types.ts             # Type definitions and interfaces
│   ├── params.ts            # Parameter parsing, normalization, and processing
│   ├── query.ts             # Query execution logic
│   ├── results.ts           # Result formatting and record processing
│   ├── transaction.ts       # Transaction management
│   ├── utils.ts             # Utility functions
│   ├── params.test.ts       # Parameter processing tests
│   ├── query.test.ts        # Query execution tests
│   ├── results.test.ts      # Result formatting tests
│   └── utils.test.ts        # Utility function tests
├── integration-tests/
│   ├── setup.ts                      # Integration test setup
│   ├── mysql.int.test.ts             # MySQL integration tests
│   └── postgres.int.test.ts          # PostgreSQL integration tests (comprehensive)
├── dist/                    # Compiled output (gitignored, distributed in npm)
│   ├── index.js             # Compiled main file
│   ├── index.d.ts           # Type definitions
│   ├── types.js             # Compiled types (runtime)
│   ├── types.d.ts           # Exported type definitions
│   └── [other compiled files]
├── fixtures/
│   └── sample-*-response.json  # Mock API response fixtures (imported via #fixtures/*)
├── tsconfig.json            # TypeScript configuration
├── tsconfig.eslint.json     # TypeScript ESLint configuration
├── vitest.config.mjs        # Vitest configuration (ES module, requires .mjs)
├── package.json             # NPM configuration (main: dist/index.js, types: dist/index.d.ts)
├── package-lock.json        # Dependency lock file
├── README.md                # User documentation
├── CLAUDE.md                # AI development context (this file)
├── LICENSE                  # MIT license
├── .eslintrc.json          # Linting rules (with TypeScript support)
├── .eslintignore           # Files ignored by ESLint
├── .prettierrc.json        # Code formatting
└── .gitignore              # Git ignore (dist/ is gitignored but included in npm package)
```

## Important Implementation Notes

### Parameter Processing Flow
1. `parseParams()` - Extract parameters from arguments
2. `normalizeParams()` - Convert to standard format
3. `processParams()` - Type conversion and SQL escaping (engine-specific)
4. Send to AWS RDS Data API
5. `formatResults()` - Convert response to user-friendly format
   - `flattenArrayValue()` - Converts Data API arrayValue structure to native JavaScript arrays

### Result Formatting Flow
1. Check for `arrayValue` in field → convert to native array using `flattenArrayValue()`
2. Handle Uint8Array → convert to Buffer
3. Apply type-specific formatting (dates, JSON, etc.)
4. Return formatted value

### Transaction Flow
1. Call `beginTransaction()` - Get `transactionId`
2. Execute queries with `transactionId` via `executeStatement()`
3. On error: `rollbackTransaction()` with optional callback
4. On success: `commitTransaction()`
5. Return array of all query results + transaction status

### Type Detection Logic
```javascript
typeof 'string' → stringValue
typeof boolean → booleanValue
integer → longValue
float → doubleValue
null → isNull (true)
Date object → stringValue + typeHint: 'TIMESTAMP'
Buffer → blobValue
{[supportedType]: value} → pass through
```

## TypeScript Type System

The project exports comprehensive TypeScript types:

**Main Types**:
- `DataAPIClientConfig` - Configuration options
- `DataAPIClient` - Main client interface
- `QueryOptions` - Query configuration
- `QueryResult<T>` - Generic query results
- `Transaction` - Transaction builder interface
- `Parameters` - Parameter types (object or array)
- `FormatOptions` - Date formatting options
- `SupportedType` - Data API value types

**Usage with TypeScript**:
```typescript
import dataApiClient from 'data-api-client'
import type { DataAPIClientConfig, QueryResult } from 'data-api-client/types'

const config: DataAPIClientConfig = {
  secretArn: 'arn:...',
  resourceArn: 'arn:...',
  database: 'mydb'
}

const client = dataApiClient(config)

interface User {
  id: number
  name: string
  email: string
}

const result: QueryResult<User> = await client.query<User>(
  'SELECT * FROM users WHERE id = :id',
  { id: 123 }
)
```

## AWS SDK v3 Migration

The project uses AWS SDK v3:

**Key Changes from v2**:
- **Package**: Changed from `aws-sdk` to modular `@aws-sdk/client-rds-data`
- **Client**: `RDSDataService` → `RDSDataClient`
- **API Pattern**: `.promise()` callbacks → Command pattern with `client.send(new Command(params))`
- **Imports**: Modular imports from `@aws-sdk/client-rds-data`
- **Configuration**: Custom client via `client` param instead of `AWS` param

**Benefits**:
- Smaller bundle size (only imports what's needed)
- Better tree-shaking support
- Faster cold starts in Lambda
- Modern async/await pattern
- TypeScript-first design

**Migration for Users**:
```typescript
// SDK v3 (recommended):
import { RDSDataClient } from '@aws-sdk/client-rds-data'
const rdsClient = new RDSDataClient({ region: 'us-east-1' })
const client = dataApiClient({
  client: rdsClient,
})

// Or use options (simpler):
const client = dataApiClient({
  options: { region: 'us-east-1' }
})
```

## Useful Commands

```bash
npm run build              # Compile TypeScript to JavaScript
npm run build:watch        # Compile TypeScript in watch mode
npm test                   # Build + run unit tests
npm run test:unit          # Build + run unit tests
npm run test:integration   # Build + run all integration tests
npm run test-ci            # Build + lint + tests (for CI)
npm run lint               # Run ESLint on TypeScript source
vitest                     # Run tests in watch mode (interactive)
vitest run                 # Run tests once
vitest --coverage          # Run tests with coverage report
tsc --noEmit               # Type-check without emitting files
```

## Contact & Support

- Author: Jeremy Daly (@jeremy_daly on Twitter)
- Issues: https://github.com/jeremydaly/data-api-client/issues
- Primary use case: AWS Lambda with Aurora Serverless

## Performance Notes

- **Connection Reuse**: Set `AWS_NODEJS_CONNECTION_REUSE_ENABLED=1` for best performance
- **Batch Operations**: Use batch queries for multiple similar operations (3-5x faster)
- **Transaction Overhead**: ~50-100ms additional latency for transaction setup/commit
- **Lambda Cold Starts**: AWS SDK initialization adds ~200-300ms on cold starts

## Security Considerations

- Never log SQL with parameters (potential credential exposure)
- Secrets Manager ARN restricts database access
- Data API doesn't support resource-level ARNs (uses `Resource: "*"`)
- SQL injection protection via parameterized queries and identifier escaping
- No direct VPC access required (security through IAM + Secrets Manager)
