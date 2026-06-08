# CLAUDE.md - Context for AI-Assisted Development

## Project Overview

**data-api-client** is a lightweight wrapper for the Amazon Aurora Serverless Data API that simplifies database interactions by abstracting away field value type annotations. It acts as a "DocumentClient" equivalent for the RDS Data API.

- **Package Name**: data-api-client
- **Current Version**: 2.2.0
- **Author**: Jeremy Daly <jeremy@jeremydaly.com>
- **License**: MIT
- **Repository**: https://github.com/jeremydaly/data-api-client

## Project Status

Version 2.x (stable) supports:
- New RDS Data API for Aurora Serverless v2 and Aurora provisioned database instances
- Amazon Aurora PostgreSQL-Compatible Edition enhancements (default engine is now `'pg'`)
- AWS SDK v3 (migrated from v2)
- Full TypeScript implementation with type definitions
- Drop-in driver compat layers (`pg`, `mysql2`) plus a Knex adapter (`compat/knex`), with Drizzle, Kysely, and Knex support
- Automatic retries for Aurora Serverless v2 scale-to-zero wake-ups

## Architecture

### TypeScript Source with CommonJS Output
The library is written in TypeScript and compiled to CommonJS JavaScript for backward compatibility.

**Modular Source Structure**:
- `src/index.ts` - Entry point (exports `init` from client.ts)
- `src/client.ts` - Client initialization and configuration
- `src/types.ts` - TypeScript type definitions and interfaces
- `src/params.ts` - Parameter parsing, normalization, and processing
- `src/query.ts` - Query execution logic
- `src/results.ts` - Result formatting and record processing, including array value parsing
- `src/transaction.ts` - Transaction management
- `src/utils.ts` - Utility functions for SQL parsing, type detection, and date handling
- `src/pg-escape.ts` - Internal PostgreSQL identifier/string escaping (no external dependency)
- `src/retry.ts` - Automatic retry logic for scale-to-zero cluster wake-ups (see Retry Behavior)
- `src/compat/` - Drop-in driver compatibility layers (see Driver Compatibility Layers)
  - `compat/pg.ts` - node-postgres (`pg`) compatible client/pool
  - `compat/mysql2.ts` - mysql2 compatible connection/pool
  - `compat/errors.ts` - Maps Data API errors to pg/mysql2 error shapes
  - `compat/index.ts` - Compat layer exports
- Compiled output in `dist/`: `index.js`, `index.d.ts`, `types.js`, `types.d.ts`, plus `dist/compat/*`

**Key architectural decisions**:
1. **TypeScript with build step** - Written in TypeScript, compiled to JavaScript
2. **Modular architecture** - Code split into focused modules for maintainability
3. **Full type safety** - Comprehensive type definitions for all APIs
4. **CommonJS output** - Maintains backward compatibility with existing users
5. **AWS SDK v3** - Uses modular @aws-sdk/client-rds-data package (peer dependency)
6. **Minimal dependencies** - Only `sqlstring` in production (PostgreSQL escaping is handled internally)
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
  - PostgreSQL: Internal `ident()` function produces `"identifier"` (from src/pg-escape.ts)
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
- **Automatic JSONB casting (NEW)**: Plain JavaScript objects are automatically detected and cast as `::jsonb` in PostgreSQL queries
  - Detects plain objects (not Buffers, Dates, Arrays, or Data API objects)
  - Automatically serializes to JSON string
  - Appends `::jsonb` cast to parameter
  - Adds `JSON` typeHint for Data API
  - Explicit casts take precedence over automatic casting

**Date Handling** (utils.ts, results.ts)
- `formatOptions.deserializeDate` - Auto-parse date strings to Date objects (default: true)
- `formatOptions.treatAsLocalDate` - Treat dates as local time instead of UTC (default: false)
- Default format: `YYYY-MM-DD HH:MM:SS[.FFF]`

**Array Handling** (results.ts)
- PostgreSQL arrays are automatically converted from Data API `arrayValue` format to native JavaScript arrays
- Supports all primitive array types: `stringValues`, `longValues`, `doubleValues`, `booleanValues`
- Handles nested/multidimensional arrays recursively
- Array parameters must use workarounds (see Known Limitations)

## Driver Compatibility Layers (`src/compat/`)

In addition to the native `dataApiClient(...)` interface, the library ships drop-in
adapters that mimic the popular Node database drivers so ORMs and query builders can
run on the Data API unchanged. These are published as subpath exports (see Package
Entry Points) and are exercised by the ORM integration tests.

- **`data-api-client/compat/pg`** — `createPgClient` / `createPgPool` expose a
  node-postgres-shaped client (`query()` returning `{ rows, rowCount, command, fields }`,
  `EventEmitter`, `connect`/`end`). Targets Drizzle and Kysely Postgres dialects.
- **`data-api-client/compat/mysql2`** — `createMySQLConnection` / `createMySQLPool`
  expose a mysql2-shaped connection (`query()` returning `[rows, fields]`,
  `PoolConnection.release()`). Set `namedPlaceholders: true` in config to enable
  `:name` placeholder syntax mysql2 callers expect.
- **`data-api-client/compat/knex`** — `createKnexMySQLClient` / `createKnexPgClient`
  return custom Knex `client` classes (subclasses of Knex's mysql2/pg dialects with
  `_driver()` overridden) so Knex runs over the Data API. `knex` is an optional peer
  dependency, lazy-`require`d. See ORM support status for the transaction caveat.
- **`data-api-client/compat/errors`** — `mapToPostgresError` / `mapToMySQLError`
  translate Data API exceptions into pg/mysql2-shaped error objects (code, etc.) so
  ORM error handling behaves as expected.

**ORM support status**: Drizzle and Kysely work because they accept an injected
driver/dialect and call its `query()` methods, so a look-alike pool/client suffices.
**Knex is supported via `compat/knex`** using a different mechanism: Knex *constructs*
its own driver rather than accepting an injected pool, so the helpers subclass Knex's
mysql2/pg dialect and override the single `_driver()` method to hand Knex a Data
API-backed connection. Both engines are covered by real integration tests
(`integration-tests/knex-{mysql,pg}.int.test.ts`); `test:int:orm:knex` runs both
(with `:pg`/`:mysql` variants).

**Knex limitation — transactions**: Knex issues literal `BEGIN`/`COMMIT`/`ROLLBACK`
SQL through the raw connection, which the Data API does not honor (it needs a threaded
`transactionId`). Knex `db.transaction()` is therefore unsupported; use the native
`client.transaction()` for transactional work. Documented in the README and as skipped
tests in both Knex suites.

When adding features, keep the native client and compat layers in sync — a behavior
change in `query.ts`/`results.ts` usually needs matching compat tests.

## Retry Behavior (`src/retry.ts`)

`withRetry()` wraps every command send (`query()` and the raw `executeStatement` etc.
methods) to survive Aurora Serverless v2 **scale-to-zero wake-ups**. Enabled by default.

- **`DatabaseResumingException`** (cluster waking) → retried with wake-up-tuned delays
  (`0, 2, 5, 10, 15, 20, 25, 30, 35, 40s`), capped by `retryOptions.maxRetries` (default **9**)
- **Transient connection errors** (e.g. "Communications link failure", `StatementTimeoutException`)
  → 3 quick retries with exponential backoff (`0, 2, 4s`)
- **`retryOptions.retryableErrors`** → custom error codes/names to also retry with wake-up delays
- Disable with `retryOptions: { enabled: false }`

## Configuration Options

```javascript
{
  // Required
  secretArn: string,      // ARN of Secrets Manager secret
  resourceArn: string,    // ARN of Aurora Serverless cluster

  // Optional
  database: string,       // Default database name
  engine: 'mysql'|'pg',   // Database engine (default: 'pg')
  hydrateColumnNames: boolean,  // Return objects vs arrays (default: true)
  namedPlaceholders: boolean,   // Enable :name placeholders for mysql2 compat layer (default: false)
  options: object,        // Passed to RDSDataClient constructor
  client: RDSDataClient, // Custom RDSDataClient instance (for X-Ray, etc.)

  formatOptions: {
    deserializeDate: boolean,      // Parse date strings (default: true)
    treatAsLocalDate: boolean      // Use local time (default: false)
  },

  retryOptions: {                  // Scale-to-zero wake-up retries (see Retry Behavior)
    enabled: boolean,              // default: true
    maxRetries: number,            // default: 9
    retryableErrors: string[]      // extra error codes/names to retry (default: [])
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
  - Unit tests: `src/*.test.ts` (colocated with source)
  - Integration tests: `integration-tests/*.int.test.ts`, grouped into three suites:
    - **core**: `mysql.int.test.ts`, `postgres.int.test.ts` (native client against each engine)
    - **compat**: `pg-compat.int.test.ts`, `mysql2-compat.int.test.ts` (driver compat layers)
    - **orm**: `drizzle-{pg,mysql}`, `kysely-{pg,mysql}`, `knex-{mysql,pg}` (all working; Knex `db.transaction()` excluded — see Driver Compatibility Layers)
  - See `integration-tests/INTEGRATION_TESTING.md` for the Aurora Serverless v2 CloudFormation setup (`infra/`)
- **Config**: `vitest.config.mjs` (ES module format, requires `.mjs` extension)
- **IMPORTANT**: Before running integration tests, run `source .env.local` to load AWS credentials and cluster ARNs
- **Sample data**: `fixtures/sample-*-response.json` files (imported via `#fixtures/*` alias)
- **Run tests** (script names match the suite grouping above):
  - `npm test` / `npm run test:unit` - Build + run unit tests
  - `npm run test:int:core` - Native client integration tests (both engines; `:mysql` / `:pg` variants)
  - `npm run test:int:compat` - Driver compat-layer integration tests (`:pg` / `:mysql` variants)
  - `npm run test:int:orm:kysely` / `:drizzle` / `:knex` - ORM integration tests (engine variants available)
  - `npm run test-ci` - Build + lint + run unit tests (for CI)
  - For manual runs: `source .env.local && npx vitest run integration-tests/<test-file>`
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
- **Note**: PostgreSQL escaping is handled by internal `src/pg-escape.ts` module (no external dependency)

### Development
- **@aws-sdk/client-rds-data** (^3.1048.0) - AWS SDK v3 RDS Data API client (also peer dep)
- **typescript** (^5.9.3) - TypeScript compiler
- **@types/node** (^24.6.2) - Node.js type definitions
- **@types/sqlstring** (^2.3.2) - sqlstring type definitions
- **@types/pg** (^8.15.5) - pg type definitions (for compat layer)
- **@typescript-eslint/parser** (^8.45.0) - TypeScript ESLint parser
- **@typescript-eslint/eslint-plugin** (^8.45.0) - TypeScript ESLint rules
- **eslint** (^8.12.0) + plugins - Linting
- **vitest** (^4.1.8) - Testing framework
- **@vitest/ui** (^4.1.8) - Vitest UI
- **prettier** (^2.6.2) - Code formatting
- **tsx** (^4.20.6) - TypeScript execution engine
- **pg**, **drizzle-orm**, **kysely**, **knex** - ORM/driver targets used only by compat integration tests

### Peer Dependencies
- **@aws-sdk/client-rds-data** (^3.1048.0) - Optional peer dependency (available in Lambda runtime or installed by user)

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
6. **Multidimensional arrays** - Limited support for arrays with more than one dimension

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

### Release Process

1. **Bump version**: `npm version patch|minor|major --no-git-tag-version`
2. **Commit version bump**: `git add package.json package-lock.json && git commit -m "chore: bump version to <version>"`
3. **Create annotated tag**: `git tag -a v<version> -m "Release v<version>"`
4. **Push commit and tag**: `git push origin main && git push origin v<version>`
5. **Create GitHub release**: Use `gh release create v<version> --draft` with release notes
6. **Publish release**: Publishing the GitHub release triggers the npm publish workflow automatically

### npm Publishing (OIDC Trusted Publishers)

Publishing to npm uses OIDC Trusted Publishers (no long-lived npm tokens). Configuration is in `.github/workflows/publish.yml`.

- **Permissions**: `id-token: write` must be at **top level** of the workflow (not job level)
- **Node version**: Node 24+ (for npm with built-in OIDC support)
- **Registry**: `registry-url: 'https://registry.npmjs.org'` on `actions/setup-node`
- **Auth**: No `NODE_AUTH_TOKEN` needed — OIDC handles authentication
- **Provenance**: Automatic with trusted publishing (no `--provenance` flag needed)
- **Triggers**: `release: [published]` (automatic) and `workflow_dispatch` (manual)
- **Trusted publisher** must be configured on npmjs.com package settings (org, repo, workflow filename)

### CI/CD
- Tests can be run via `npm run test-ci` (linting + tests)
- Publish workflow runs lint, build, unit tests, and integration tests before publishing

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
│   ├── retry.ts             # Scale-to-zero wake-up retry logic
│   ├── pg-escape.ts         # Internal PostgreSQL escaping utilities (no external deps)
│   ├── compat/              # Drop-in driver compatibility layers
│   │   ├── index.ts         # Compat exports
│   │   ├── pg.ts            # node-postgres (pg) compatible client/pool
│   │   ├── mysql2.ts        # mysql2 compatible connection/pool
│   │   └── errors.ts        # Data API → pg/mysql2 error mapping
│   └── *.test.ts            # Colocated unit tests (params, query, results, utils, retry, pg-escape)
├── integration-tests/
│   ├── setup.ts                      # Integration test setup
│   ├── INTEGRATION_TESTING.md         # Aurora Serverless v2 setup guide
│   ├── mysql.int.test.ts             # MySQL native client tests
│   ├── postgres.int.test.ts          # PostgreSQL native client tests (comprehensive)
│   ├── pg-compat.int.test.ts          # pg compat layer tests
│   ├── mysql2-compat.int.test.ts      # mysql2 compat layer tests
│   └── {drizzle,kysely,knex}-*.int.test.ts  # ORM integration tests
├── infra/                   # CloudFormation for integration-test Aurora clusters
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
├── package.json             # NPM config (main: dist/index.js; subpath exports: ./compat, ./compat/pg, ./compat/mysql2, ./types)
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
Plain JavaScript object → stringValue + typeHint: 'JSON' + auto ::jsonb cast (PostgreSQL only)
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
npm run test:int:core      # Build + run native client integration tests (requires .env.local)
npm run test:int:compat    # Build + run driver compat-layer integration tests
npm run test:int:orm:kysely  # Build + run Kysely ORM integration tests (also :drizzle, :knex)
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
