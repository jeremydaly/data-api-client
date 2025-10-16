![Aurora Serverless Data API Client](https://github.com/jeremydaly/data-api-client/blob/main/data-api-client-logo-v2.png?raw=true)

[![npm](https://img.shields.io/npm/v/data-api-client.svg)](https://www.npmjs.com/package/data-api-client)
[![npm](https://img.shields.io/npm/l/data-api-client.svg)](https://www.npmjs.com/package/data-api-client)

> **Note:** Version 2.1.0 introduces mysql2 and pg compatibility layers with full ORM support! We welcome your feedback and bug reports. Please [open an issue](https://github.com/jeremydaly/data-api-client/issues) if you encounter any problems or have suggestions for improvement.
>
> **Using v1.x?** See [README_v1.md](README_v1.md) for v1.x documentation.

The **Data API Client** is a lightweight wrapper that simplifies working with the Amazon Aurora Serverless Data API by abstracting away the notion of field values. This abstraction annotates native JavaScript types supplied as input parameters, as well as converts annotated response data to native JavaScript types. It's basically a [DocumentClient](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html) for the Data API. It also dramatically simplifies **transactions**, provides **automatic retry logic** for scale-to-zero clusters, and includes **compatibility layers** for mysql2 and pg with full **ORM support**.

**Version 2.1** adds mysql2 and pg compatibility layers, automatic retry logic for cluster wake-ups, and verified support for Drizzle ORM and Kysely query builder.

**Version 2.0** introduced support for the new [RDS Data API for Aurora Serverless v2 and Aurora provisioned database instances](https://aws.amazon.com/about-aws/whats-new/2024/09/amazon-aurora-mysql-rds-data-api/), enhanced [Amazon Aurora PostgreSQL-Compatible Edition](https://aws.amazon.com/about-aws/whats-new/2023/12/amazon-aurora-postgresql-rds-data-api/) support, migration to AWS SDK v3, full TypeScript implementation, and comprehensive PostgreSQL data type coverage including **automatic array handling**.

For more information about the Aurora Serverless Data API, you can review the [official documentation](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html) or read [Aurora Serverless Data API: An (updated) First Look](https://www.jeremydaly.com/aurora-serverless-data-api-a-first-look/) for some more insights on performance.

## What's New in v2.1

- **Automatic Retry Logic**: Built-in retry handling for Aurora Serverless scale-to-zero wake-ups
  - Smart detection of `DatabaseResumingException` with optimized retry delays
  - Automatic handling of connection errors with exponential backoff
  - Configurable and enabled by default
- **mysql2 Compatibility Layer**: Drop-in replacement for the `mysql2/promise` library
  - Full support for connection pools and transactions
  - Works seamlessly with ORMs like Drizzle and Kysely
- **pg Compatibility Layer**: Drop-in replacement for the `pg` (node-postgres) library
  - Promise-based and callback-based APIs
  - Compatible with ORMs and query builders
- **ORM Support**: Tested and verified with popular ORMs:
  - **Drizzle ORM**: Full support for both MySQL and PostgreSQL
  - **Kysely**: Query builder support for both engines

## What's New in v2.0

- **AWS SDK v3**: Migrated from AWS SDK v2 to v3 for smaller bundle sizes and better tree-shaking
- **TypeScript**: Full TypeScript implementation with comprehensive type definitions
- **PostgreSQL Array Support**: Automatic conversion of PostgreSQL arrays to native JavaScript arrays in query results
- **Comprehensive Data Type Coverage**: Extensive support for PostgreSQL data types including:
  - All numeric types (SMALLINT, INT, BIGINT, DECIMAL, NUMERIC, REAL, DOUBLE PRECISION)
  - String types (CHAR, VARCHAR, TEXT)
  - Boolean, Date/Time types (DATE, TIME, TIMESTAMP, TIMESTAMPTZ)
  - Binary data (BYTEA)
  - JSON and JSONB with nested structures
  - UUID with type casting support
  - Network types (INET, CIDR)
  - Range types (INT4RANGE, NUMRANGE, TSTZRANGE)
  - Arrays of all supported types
- **Modern Build System**: TypeScript compilation with ES6+ output
- **Enhanced Type Casting**: Improved support for PostgreSQL type casting with inline (`::type`) and parameter-based casting
- **Better Error Handling**: More informative error messages and validation

## Simple Examples

The **Data API Client** makes working with the Aurora Serverless Data API super simple. Import and instantiate the library with basic configuration information, then use the `query()` method to manage your workflows. Below are some examples.

```javascript
// Import and instantiate data-api-client with secret and cluster
import dataApiClient from 'data-api-client'

const data = dataApiClient({
  secretArn: 'arn:aws:secretsmanager:us-east-1:XXXXXXXXXXXX:secret:mySecret',
  resourceArn: 'arn:aws:rds:us-east-1:XXXXXXXXXXXX:cluster:my-cluster-name',
  database: 'myDatabase', // default database
  engine: 'pg' // or 'mysql'
})

/*** Assuming we're in an async function ***/

// Simple SELECT
let result = await data.query(`SELECT * FROM myTable`)
// {
//   records: [
//     { id: 1, name: 'Alice', age: null },
//     { id: 2, name: 'Mike', age: 52 },
//     { id: 3, name: 'Carol', age: 50 }
//   ]
// }

// SELECT with named parameters
let resultParams = await data.query(`SELECT * FROM myTable WHERE id = :id`, { id: 2 })
// { records: [ { id: 2, name: 'Mike', age: 52 } ] }

// INSERT with named parameters (PostgreSQL with RETURNING)
let insert = await data.query(`INSERT INTO myTable (name, age, has_curls) VALUES(:name, :age, :curls) RETURNING id`, {
  name: 'Greg',
  age: 18,
  curls: false
})

// BATCH INSERT with named parameters
let batchInsert = await data.query(`INSERT INTO myTable (name, age, has_curls) VALUES(:name, :age, :curls)`, [
  [{ name: 'Marcia', age: 17, curls: false }],
  [{ name: 'Peter', age: 15, curls: false }],
  [{ name: 'Jan', age: 15, curls: false }],
  [{ name: 'Cindy', age: 12, curls: true }],
  [{ name: 'Bobby', age: 12, curls: false }]
])

// Update with named parameters
let update = await data.query(`UPDATE myTable SET age = :age WHERE id = :id`, { age: 13, id: 5 })

// Delete with named parameters
let remove = await data.query(
  `DELETE FROM myTable WHERE name = :name`,
  { name: 'Jan' } // Sorry Jan :(
)

// PostgreSQL with automatic JSONB casting for plain objects
let pgExample = await data.query(`INSERT INTO users (id, email, metadata) VALUES(:id, :email, :metadata)`, [
  { name: 'id', value: '550e8400-e29b-41d4-a716-446655440000', cast: 'uuid' },
  { name: 'email', value: 'user@example.com' },
  { name: 'metadata', value: { role: 'admin', permissions: ['read', 'write'] } } // Automatically cast as JSONB!
])

// PostgreSQL array result (automatically converted to native JavaScript array)
let arrayResult = await data.query(`SELECT tags FROM products WHERE id = :id`, { id: 123 })
// { records: [ { tags: ['new', 'featured', 'sale'] } ] }
```

## Why do I need this?

The [Data API](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html) requires you to specify data types when passing in parameters. The basic `INSERT` example above would look like this using the native AWS SDK v3:

```javascript
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data'
const client = new RDSDataClient()

/*** Assuming we're in an async function ***/

// INSERT with named parameters
let insert = await client.send(
  new ExecuteStatementCommand({
    secretArn: 'arn:aws:secretsmanager:us-east-1:XXXXXXXXXXXX:secret:mySecret',
    resourceArn: 'arn:aws:rds:us-east-1:XXXXXXXXXXXX:cluster:my-cluster-name',
    database: 'myDatabase',
    sql: 'INSERT INTO myTable (name, age, has_curls) VALUES(:name, :age, :curls)',
    parameters: [
      { name: 'name', value: { stringValue: 'Cousin Oliver' } },
      { name: 'age', value: { longValue: 10 } },
      { name: 'curls', value: { booleanValue: false } }
    ]
  })
)
```

Specifying all of those data types in the parameters is a bit clunky. In addition to requiring types for parameters, it also returns each field as an object with its value assigned to a key that represents its data type, like this:

```javascript
{
  // id field
  longValue: 9
},
{
  // name field
  stringValue: 'Cousin Oliver'
},
{
  // age field
  longValue: 10
},
{
  // has_curls field
  booleanValue: false
}
```

Not only are there no column names, but you have to pull the value from the data type field. And if you're using PostgreSQL arrays, you get a complex nested structure:

```javascript
{
  // tags field (PostgreSQL array)
  arrayValue: {
    stringValues: ['admin', 'editor', 'viewer']
  }
}
```

Lots of extra work that the **Data API Client** handles automatically for you, converting arrays to native JavaScript arrays and providing clean, usable data. 😀

### Why not use the Data API's built-in JSON support?

The AWS Data API offers a [built-in JSON format option](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api-json.html) via the `formatRecordsAs: 'JSON'` parameter. While this simplifies basic result parsing, the **Data API Client** provides significantly more value:

**Type Fidelity:** AWS's JSON format converts everything to basic JSON types, losing database-specific type information. The Data API Client preserves PostgreSQL-specific types (UUID, MACADDR, range types, etc.) using `columnMetadata.typeName` for intelligent type handling.

**Advanced Type Conversion:**
- **PostgreSQL arrays**: Automatically flattens complex `arrayValue` structures to native JavaScript arrays
- **Binary data**: Converts `Uint8Array` to Node.js `Buffer` objects
- **JSON columns**: Auto-parses JSON strings to objects
- **Date handling**: Configurable deserialization with `deserializeDate` and `treatAsLocalDate` options
- **MySQL YEAR type**: Converts strings to integers automatically

**Flexible Output Formats:** AWS JSON only returns objects. The Data API Client lets you choose between object format (`hydrateColumnNames: true`) for easy access by name, or array format (`hydrateColumnNames: false`) for better performance when column names aren't needed.

**Richer Result Information:** Beyond just formatted records, you get `numberOfRecordsUpdated`, `insertId`, `columnMetadata` (optional), and batch `updateResults` for comprehensive operation feedback.

**No Additional Limitations:** AWS's JSON support requires unique column names and has a 10MB response limit. The Data API Client works with any column configuration and imposes no additional size restrictions.

In summary, AWS's JSON support is a basic convenience feature, while the **Data API Client** provides true type intelligence, format flexibility, and seamless handling of complex PostgreSQL features that the native Data API doesn't support well.

## Installation and Setup

```
npm i data-api-client
```

The library has AWS SDK v3's `@aws-sdk/client-rds-data` as an optional peer dependency. In AWS Lambda, the SDK is provided by the runtime. For local development or other environments, install it separately:

```
npm i @aws-sdk/client-rds-data
```

For more information on enabling Data API, see [Enabling Data API](#enabling-data-api).

## Configuration Options

Below is a table containing all of the possible configuration options for the `data-api-client`. Additional details are provided throughout the documentation.

| Property           | Type            | Description                                                                                                                                                                                                                                         | Default                                          |
| ------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| client             | `RDSDataClient` | A custom `@aws-sdk/client-rds-data` instance (for X-Ray tracing, custom config, etc.)                                                                                                                                                               |                                                  |
| resourceArn        | `string`        | The ARN of your Aurora Serverless Cluster. This value is _required_, but can be overridden when querying.                                                                                                                                           |                                                  |
| secretArn          | `string`        | The ARN of the secret associated with your database credentials. This is _required_, but can be overridden when querying.                                                                                                                           |                                                  |
| database           | `string`        | _Optional_ default database to use with queries. Can be overridden when querying.                                                                                                                                                                   |                                                  |
| engine             | `mysql` or `pg` | The type of database engine you're connecting to (MySQL or Postgres).                                                                                                                                                                               | `pg`                                             |
| hydrateColumnNames | `boolean`       | When `true`, results will be returned as objects with column names as keys. If `false`, results will be returned as an array of values.                                                                                                             | `true`                                           |
| namedPlaceholders  | `boolean`       | Enable named placeholders (`:name` syntax) for mysql2 compatibility layer. When `true`, parameters use object format. Only applies to mysql2 compat layer.                                                                                          | `false`                                          |
| options            | `object`        | An _optional_ configuration object that is passed directly into the RDSDataClient constructor. See [AWS SDK docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-rds-data/classes/rdsdataclient.html) for available options. | `{}`                                             |
| formatOptions      | `object`        | Formatting options to auto parse dates and coerce native JavaScript date objects to supported date formats. Valid keys are `deserializeDate` and `treatAsLocalDate`. Both accept boolean values.                                                    | `deserializeDate: true, treatAsLocalDate: false` |
| retryOptions       | `object`        | Configuration for automatic retry logic. Valid keys are `enabled` (boolean), `maxRetries` (number), and `retryableErrors` (string array).                                                                                                           | `enabled: true, maxRetries: 9`                   |

### Automatic Retry Logic

Version 2.1 includes built-in retry logic to handle Aurora Serverless scale-to-zero cluster wake-ups automatically. When your cluster is paused and needs to resume, the client will automatically retry your queries with optimized delays.

**Features:**

- **Smart Error Detection**: Automatically detects `DatabaseResumingException` and connection errors
- **Strategy-Based Retries**: Different retry strategies based on error type:
  - DatabaseResumingException: Up to 10 attempts with progressive delays (0s, 2s, 5s, 10s, 15s, 20s, 25s, 30s, 35s, 40s)
  - Connection errors: 3 quick retries with exponential backoff (0s, 2s, 4s)
- **Enabled by Default**: Works automatically without any configuration
- **Configurable**: Customize retry behavior per your needs

**Configuration:**

```javascript
const data = dataApiClient({
  secretArn: 'arn:...',
  resourceArn: 'arn:...',
  database: 'myDatabase',
  retryOptions: {
    enabled: true, // Enable/disable retries (default: true)
    maxRetries: 9, // Maximum retry attempts (default: 9 for up to 40s total)
    retryableErrors: [] // Additional error patterns to retry (optional)
  }
})
```

**Disable retries** (not recommended for scale-to-zero clusters):

```javascript
const data = dataApiClient({
  secretArn: 'arn:...',
  resourceArn: 'arn:...',
  retryOptions: { enabled: false }
})
```

The retry logic works seamlessly across all operations: queries, transactions, batch operations, and compatibility layer methods.

### Connection Reuse

It is recommended to enable connection reuse as this dramatically decreases the latency of subsequent calls to the AWS API. This can be done by setting an environment variable `AWS_NODEJS_CONNECTION_REUSE_ENABLED=1`. For more information see the [AWS SDK documentation](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/node-reusing-connections.html).

## How to use this module

The **Data API Client** wraps the [RDSDataClient Class](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-rds-data/classes/rdsdataclient.html), providing you with a number of convenience features to make your workflow easier. The module also exposes all the standard `RDSDataClient` methods with your default configuration information already merged in. 😉

To use the Data API Client, import the module and instantiate it with your [Configuration options](#configuration-options). If you are using it with AWS Lambda, require it **OUTSIDE** your main handler function. This will allow you to reuse the initialized module on subsequent invocations.

```javascript
// Import and instantiate data-api-client with secret and cluster arns
import dataApiClient from 'data-api-client'

const data = dataApiClient({
  secretArn: 'arn:aws:secretsmanager:us-east-1:XXXXXXXXXXXX:secret:mySecret',
  resourceArn: 'arn:aws:rds:us-east-1:XXXXXXXXXXXX:cluster:my-cluster-name',
  database: 'myDatabase', // set a default database
  engine: 'pg' // specify 'pg' for PostgreSQL or 'mysql' for MySQL
})
```

### Running a query

Once initialized, running a query is super simple. Use the `query()` method and pass in your SQL statement:

```javascript
let result = await data.query(`SELECT * FROM myTable`)
```

By default, this will return your rows as an array of objects with column names as property names:

```javascript
;[
  { id: 1, name: 'Alice', age: null },
  { id: 2, name: 'Mike', age: 52 },
  { id: 3, name: 'Carol', age: 50 }
]
```

To query with parameters, you can use named parameters in your SQL, and then provide an object containing your parameters as the second argument to the `query()` method:

```javascript
let result = await data.query(
  `
  SELECT * FROM myTable WHERE id = :id AND created > :createDate`,
  { id: 2, createDate: '2019-06-01' }
)
```

The Data API Client will automatically convert your parameters into the correct Data API parameter format using native JavaScript types. If you prefer more control over the data type, you can use the extended parameter format:

```javascript
let result = await data.query(`SELECT * FROM myTable WHERE id = :id AND created > :createDate`, [
  // An array of objects is totally cool, too. We'll merge them for you.
  { id: 2 },
  // Extended format for more control
  { name: 'createDate', value: '2019-06-01' }
])
```

If you want even more control, you can pass in an `object` as the first parameter. This will allow you to add additional configuration options and override defaults as well.

```javascript
let result = await data.query({
  sql: `SELECT * FROM myTable WHERE id = :id`,
  parameters: [{ id: 2 }], // or just { id: 2 }
  database: 'someOtherDatabase', // override default database
  continueAfterTimeout: true, // RDSDataService config option (non-batch only)
  includeResultMetadata: true, // RDSDataService config option (non-batch only)
  hydrateColumnNames: false, // Returns each record as an arrays of values
  transactionId: 'AQC5SRDIm...ZHXP/WORU=' // RDSDataService config option
})
```

Sometimes you might want to have _dynamic identifiers_ in your SQL statements. Unfortunately, the native Data API doesn't support this, but the **Data API Client** does! Use a double colon (`::`) prefix to create _named identifiers_ and you can do cool things like this:

```javascript
let result = await data.query(`SELECT ::fields FROM ::table WHERE id > :id`, {
  fields: ['id', 'name', 'created'],
  table: 'table_' + someScaryUserInput, // someScaryUserInput = 123abc
  id: 1
})
```

Which will produce a query like this for PostgreSQL:

```sql
SELECT "id", "name", "created" FROM "table_123abc" WHERE id > :id
```

Or for MySQL:

```sql
SELECT `id`, `name`, `created` FROM `table_123abc` WHERE id > :id
```

You'll notice that we leave the _named parameters_ alone. Anything that Data API and the native SDK currently handles, we defer to them.

### Type-Casting

The Aurora Data API can sometimes give you trouble with certain data types, such as uuid or jsonb in PostgreSQL, unless you explicitly cast them. While you can certainly do this manually in your SQL string using PostgreSQL's `::` cast syntax, the Data API Client offers an easy way to handle this for you using the parameter `cast` property.

#### Automatic JSONB Type Casting (PostgreSQL)

**New in v2.x:** The Data API Client now **automatically detects and casts plain JavaScript objects as JSONB** in PostgreSQL queries. This eliminates the need for manual `JSON.stringify()` or explicit `::jsonb` casts in most cases:

```javascript
// Plain JavaScript objects are automatically cast as JSONB
const metadata = { role: 'admin', permissions: ['read', 'write'], score: 95.5 }

await data.query('INSERT INTO users (email, metadata) VALUES (:email, :metadata)', {
  email: 'user@example.com',
  metadata: metadata // Automatically serialized and cast as ::jsonb
})

// Works with nested objects too
const complexData = {
  user: { name: 'Alice', age: 30 },
  tags: ['admin', 'editor'],
  settings: { theme: 'dark', notifications: true }
}

await data.query('INSERT INTO products (name, data) VALUES (:name, :data)', {
  name: 'Product A',
  data: complexData // Automatically handled
})
```

**How it works:**

- Plain JavaScript objects (not Buffers, Dates, Arrays, or Data API objects) are automatically detected
- The object is serialized to a JSON string
- A `::jsonb` cast is automatically appended to the parameter in PostgreSQL queries
- A `JSON` typeHint is provided to the Data API for proper handling

**When automatic casting applies:**

- ✅ Plain objects: `{ key: 'value' }`
- ✅ Nested objects: `{ user: { name: 'Alice' } }`
- ❌ Buffers: `Buffer.from('data')`
- ❌ Dates: `new Date()`
- ❌ Arrays: `[1, 2, 3]`
- ❌ Already-formatted Data API objects: `{ stringValue: 'text' }`

**Explicit casting still supported:**

You can still use explicit casts when needed (e.g., for UUID, custom types, or to override automatic behavior):

**PostgreSQL inline casting:**

```javascript
const result = await data.query('INSERT INTO users(id, email, metadata) VALUES(:id, :email, :metadata::jsonb)', {
  id: newUserId,
  email: email,
  metadata: JSON.stringify(userMetadata) // explicit ::jsonb in SQL
})
```

**Parameter-based casting:**

```javascript
const result = await data.query(
  'INSERT INTO users(id, email, full_name, metadata) VALUES(:id, :email, :fullName, :metadata)',
  [
    {
      name: 'id',
      value: newUserId,
      cast: 'uuid'
    },
    {
      name: 'email',
      value: email
    },
    {
      name: 'fullName',
      value: fullName
    },
    {
      name: 'metadata',
      value: JSON.stringify(userMetadata),
      cast: 'jsonb'
    }
  ]
)
```

**Note:** Explicit casts (inline `::type` or parameter `cast` property) always take precedence over automatic casting.

### Batch Queries

The Data API provides a `batchExecuteStatement` method that allows you to execute a prepared statement multiple times using different parameter sets. This is only allowed for `INSERT`, `UPDATE` and `DELETE` queries, but is much more efficient than issuing multiple `executeStatement` calls. The Data API Client handles the switching for you based on _how_ you send in your parameters.

To issue a batch query, use the `query()` method (either by passing an object or using the two arity form), and provide multiple parameter sets as nested arrays. For example, if you wanted to update multiple records at once, your query might look like this:

```javascript
let result = await data.query(`UPDATE myTable SET name = :newName WHERE id = :id`, [
  [{ id: 1, newName: 'Alice Franklin' }],
  [{ id: 7, newName: 'Jan Glass' }]
])
```

You can also use _named identifiers_ in batch queries, which will update and escape your SQL statement. **ONLY** parameters from the first parameter set will be used to update the query. Subsequent parameter sets will only update _named parameters_ supported by the Data API.

Whenever a batch query is executed, it returns an `updateResults` field. Other than for `INSERT` statements, however, there is no useful feedback provided by this field.

### Retrieving Insert IDs

The Data API returns a `generatedFields` array that contains the value of auto-incrementing primary keys. If this value is returned, the Data API Client will parse this and return it as the `insertId`. This also works for batch queries as well.

For PostgreSQL, use the `RETURNING` clause to get generated values:

```javascript
let result = await data.query(`INSERT INTO users (name, email) VALUES (:name, :email) RETURNING id`, {
  name: 'Alice',
  email: 'alice@example.com'
})
// result.records[0].id contains the generated ID
```

## Transaction Support

Transaction support in the Data API Client has been dramatically simplified. Start a new transaction using the `transaction()` method, and then chain queries using the `query()` method. The `query()` method supports all standard query options. Alternatively, you can specify a function as the only argument in a `query()` method call and return the arguments as an array of values. The function receives two arguments, the result of the last query executed, and an array containing all the previous query results. This is useful if you need values from a previous query as part of your transaction.

You can specify an optional `rollback()` method in the chain. This will receive the `error` object and the `transactionStatus` object, allowing you to add additional logging or perform some other action. Call the `commit()` method when you are ready to execute the queries.

```javascript
let results = await data
  .transaction()
  .query('INSERT INTO myTable (name) VALUES(:name)', { name: 'Tiger' })
  .query('UPDATE myTable SET age = :age WHERE name = :name', { age: 4, name: 'Tiger' })
  .rollback((e, status) => {
    /* do something with the error */
  }) // optional
  .commit() // execute the queries
```

With a function to get the `insertId` from the previous query:

```javascript
let results = await data
  .transaction()
  .query('INSERT INTO myTable (name) VALUES(:name) RETURNING id', { name: 'Tiger' })
  .query((r) => ['UPDATE myTable SET age = :age WHERE id = :id', { age: 4, id: r.records[0].id }])
  .rollback((e, status) => {
    /* do something with the error */
  }) // optional
  .commit() // execute the queries
```

Transactions work with batch queries, too! 👊

By default, the `transaction()` method will use the `resourceArn`, `secretArn` and `database` values you set at initialization. Any or all of these values can be overwritten by passing an object into the `transaction()` method. Since transactions are for a specific database, you can't overwrite their values when chaining queries. You can, however, overwrite the `includeResultMetadata` and `hydrateColumnNames` settings per query.

### Using native methods directly

The Data API Client exposes the five RDSDataClient command methods. These are:

- `batchExecuteStatement`
- `beginTransaction`
- `commitTransaction`
- `executeStatement`
- `rollbackTransaction`

The default configuration information (`resourceArn`, `secretArn`, and `database`) are merged with your supplied parameters, so supplying those values are optional.

```javascript
let result = await data.executeStatement({
  sql: `SELECT * FROM myTable WHERE id = :id`,
  parameters: [{ name: 'id', value: { longValue: 1 } }],
  transactionId: 'AQC5SRDIm...ZHXP/WORU='
})
```

## Custom AWS SDK Client

`data-api-client` allows for introducing a custom RDSDataClient instance as a parameter. This parameter is optional. If not present, `data-api-client` will create a default instance.

```javascript
import { RDSDataClient } from '@aws-sdk/client-rds-data'
import dataApiClient from 'data-api-client'

// Create a custom client instance
const rdsClient = new RDSDataClient({
  region: 'us-east-1'
  // other configuration options
})

// Instantiate data-api-client with the custom client
const data = dataApiClient({
  client: rdsClient,
  secretArn: 'arn:aws:secretsmanager:us-east-1:XXXXXXXXXXXX:secret:mySecret',
  resourceArn: 'arn:aws:rds:us-east-1:XXXXXXXXXXXX:cluster:my-cluster-name'
})
```

Custom client parameter allows you to introduce X-Ray tracing:

```javascript
import { RDSDataClient } from '@aws-sdk/client-rds-data'
import { captureAWSv3Client } from 'aws-xray-sdk-core'
import dataApiClient from 'data-api-client'

const rdsClient = captureAWSv3Client(new RDSDataClient({ region: 'us-east-1' }))

const data = dataApiClient({
  client: rdsClient,
  secretArn: 'arn:aws:secretsmanager:us-east-1:XXXXXXXXXXXX:secret:mySecret',
  resourceArn: 'arn:aws:rds:us-east-1:XXXXXXXXXXXX:cluster:my-cluster-name'
})
```

## mysql2 and pg Compatibility Layers

Version 2.1 introduces compatibility layers that allow you to use the Data API Client as a drop-in replacement for popular database libraries. This makes it easy to migrate existing applications or use ORMs without modification.

### mysql2 Compatibility

Use the Data API Client as a replacement for `mysql2/promise`:

```javascript
import { createMySQLConnection, createMySQLPool } from 'data-api-client/compat/mysql2'

// Create a connection
const connection = createMySQLConnection({
  resourceArn: 'arn:aws:rds:us-east-1:XXXXXXXXXXXX:cluster:my-cluster',
  secretArn: 'arn:aws:secretsmanager:us-east-1:XXXXXXXXXXXX:secret:mySecret',
  database: 'myDatabase'
})

// Use like mysql2/promise with positional placeholders
const [rows, fields] = await connection.query('SELECT * FROM users WHERE id = ?', [123])
await connection.execute('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'alice@example.com'])

// Note: connection.end() is optional - it's a no-op for Data API (no connection to close)

// Create a pool for connection pooling
const pool = createMySQLPool({
  resourceArn: 'arn:...',
  secretArn: 'arn:...',
  database: 'myDatabase'
})

// Get connection from pool
pool.getConnection((err, connection) => {
  if (err) throw err
  connection.query('SELECT * FROM users', (err, results) => {
    connection.release() // Optional - no-op for Data API
    // Handle results
  })
})

// Or use promises
const connection = await pool.getConnection()
const [rows] = await connection.query('SELECT * FROM users')
connection.release() // Optional - no-op for Data API
```

#### Named Placeholders Support

The mysql2 compatibility layer supports **named placeholders** (`:name` syntax), matching the behavior of the native mysql2 library's `namedPlaceholders` option:

```javascript
import { createMySQLConnection, createMySQLPool } from 'data-api-client/compat/mysql2'

// Create a connection with namedPlaceholders enabled
const connection = createMySQLConnection({
  resourceArn: 'arn:aws:rds:us-east-1:XXXXXXXXXXXX:cluster:my-cluster',
  secretArn: 'arn:aws:secretsmanager:us-east-1:XXXXXXXXXXXX:secret:mySecret',
  database: 'myDatabase',
  namedPlaceholders: true // Enable named placeholders
})

// Use named placeholders with object parameters
const [users] = await connection.query('SELECT * FROM users WHERE name = :name AND age > :age', {
  name: 'Alice',
  age: 25
})

// INSERT with named placeholders
await connection.query('INSERT INTO users (name, email, active) VALUES (:name, :email, :active)', {
  name: 'Bob',
  email: 'bob@example.com',
  active: true
})

// UPDATE with named placeholders
await connection.query('UPDATE users SET age = :newAge WHERE id = :id', { id: 123, newAge: 30 })

// Named placeholders work with transactions
await connection.beginTransaction()
try {
  await connection.query('INSERT INTO orders (user_id, total) VALUES (:userId, :total)', { userId: 123, total: 99.99 })
  await connection.query('UPDATE users SET last_order = NOW() WHERE id = :userId', { userId: 123 })
  await connection.commit()
} catch (err) {
  await connection.rollback()
}

// Named placeholders also work with pools
const pool = createMySQLPool({
  resourceArn: 'arn:...',
  secretArn: 'arn:...',
  database: 'myDatabase',
  namedPlaceholders: true
})

const [results] = await pool.query('SELECT * FROM products WHERE category = :category AND price < :maxPrice', {
  category: 'electronics',
  maxPrice: 500
})
```

**Named Placeholders Features:**

- Use `:paramName` syntax in SQL (colon followed by identifier)
- Pass parameters as objects: `{ paramName: value }`
- Same parameter can be referenced multiple times in the query
- Works with all query types (SELECT, INSERT, UPDATE, DELETE)
- Fully compatible with transactions, pools, and callbacks
- Backward compatible: positional `?` placeholders still work when `namedPlaceholders` is disabled (default)

**Query-Level namedPlaceholders:**

You can also enable or disable named placeholders on a per-query basis, which overrides the connection-level setting:

```javascript
// Connection WITHOUT namedPlaceholders at config level
const connection = createMySQLConnection({
  resourceArn: 'arn:...',
  secretArn: 'arn:...',
  database: 'myDatabase'
  // namedPlaceholders NOT set (defaults to false)
})

// Enable namedPlaceholders for specific queries
const [rows] = await connection.query(
  {
    sql: 'SELECT * FROM users WHERE username = :username AND age > :minAge',
    namedPlaceholders: true // Enable for this query only
  },
  { username: 'john_doe', minAge: 25 }
)

// Or explicitly disable for a specific query (when connection has it enabled)
const [rows2] = await connection.query(
  {
    sql: 'SELECT * FROM users WHERE id = ?',
    namedPlaceholders: false // Use positional placeholders for this query
  },
  [123]
)
```

This allows you to:

- Use named placeholders in specific queries without enabling it globally
- Mix named and positional placeholders in different queries
- Override connection-level settings when needed

### pg Compatibility

Use the Data API Client as a replacement for `pg` (node-postgres):

```javascript
import { createPgClient, createPgPool } from 'data-api-client/compat/pg'

// Create a client
const client = createPgClient({
  resourceArn: 'arn:aws:rds:us-east-1:XXXXXXXXXXXX:cluster:my-cluster',
  secretArn: 'arn:aws:secretsmanager:us-east-1:XXXXXXXXXXXX:secret:mySecret',
  database: 'myDatabase'
})

// Note: client.connect() is optional - it's a no-op for Data API (no connection needed)
await client.connect() // Optional

// Use like pg
const result = await client.query('SELECT * FROM users WHERE id = $1', [123])
console.log(result.rows)

// With callback style
client.query('SELECT * FROM users', (err, result) => {
  console.log(result.rows)
})

// Note: client.end() is optional - it's a no-op for Data API (no connection to close)
await client.end() // Optional

// Create a pool
const pool = createPgPool({
  resourceArn: 'arn:...',
  secretArn: 'arn:...',
  database: 'myDatabase'
})

const result = await pool.query('SELECT * FROM users WHERE id = $1', [123])
```

### Using with ORMs

The compatibility layers work seamlessly with popular ORMs:

#### Drizzle ORM

**MySQL with Drizzle:**

```typescript
import { drizzle } from 'drizzle-orm/mysql2'
import { createMySQLPool } from 'data-api-client/compat/mysql2'

const pool = createMySQLPool({
  resourceArn: 'arn:...',
  secretArn: 'arn:...',
  database: 'myDatabase'
})

const db = drizzle(pool as any)

// Use Drizzle normally
const users = await db.select().from(usersTable).where(eq(usersTable.id, 123))
```

**PostgreSQL with Drizzle:**

```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import { createPgClient } from 'data-api-client/compat/pg'

const client = createPgClient({
  resourceArn: 'arn:...',
  secretArn: 'arn:...',
  database: 'myDatabase'
})

// Note: client.connect() is optional (no-op for Data API)
await client.connect() // Optional - can be omitted
const db = drizzle(client as any)

// Use Drizzle normally
const users = await db.select().from(usersTable).where(eq(usersTable.id, 123))
```

#### Kysely Query Builder

**MySQL with Kysely:**

```typescript
import { Kysely, MysqlDialect } from 'kysely'
import { createMySQLPool } from 'data-api-client/compat/mysql2'

const pool = createMySQLPool({
  resourceArn: 'arn:...',
  secretArn: 'arn:...',
  database: 'myDatabase'
})

const db = new Kysely<Database>({
  dialect: new MysqlDialect({ pool: pool as any })
})

// Use Kysely normally
const users = await db.selectFrom('users').selectAll().where('id', '=', 123).execute()
```

**PostgreSQL with Kysely:**

```typescript
import { Kysely, PostgresDialect } from 'kysely'
import { createPgPool } from 'data-api-client/compat/pg'

const pool = createPgPool({
  resourceArn: 'arn:...',
  secretArn: 'arn:...',
  database: 'myDatabase'
})

const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool: pool as any })
})

// Use Kysely normally
const users = await db.selectFrom('users').selectAll().where('id', '=', 123).execute()
```

**Benefits of Compatibility Layers:**

- **Zero code changes** when migrating from mysql2 or pg
- **Full ORM support** (Drizzle, Kysely)
- **Automatic retry logic** for cluster wake-ups
- **Connection pooling simulation** (getConnection, release)
- **Both Promise and callback APIs** supported
- **No-op connection management**: `connect()`, `end()`, and `release()` are optional since the Data API is connectionless - they're included only for backward compatibility with existing code

## PostgreSQL Array Support

One of the most powerful features in v2.0 is automatic PostgreSQL array handling. While the Data API has limitations with array _parameters_, array _results_ are fully supported and automatically converted to native JavaScript arrays.

### Array Results (Automatic Conversion)

When you query PostgreSQL arrays, the Data API Client automatically converts them to native JavaScript arrays:

```javascript
// Query returns PostgreSQL array
let result = await data.query(`SELECT tags FROM products WHERE id = :id`, { id: 123 })

// Automatic conversion to JavaScript array
// result.records[0].tags = ['new', 'featured', 'sale']
```

**Supported Array Types:**

- Integer arrays: `INT[]`, `SMALLINT[]`, `BIGINT[]`
- Float arrays: `REAL[]`, `DOUBLE PRECISION[]`, `NUMERIC[]`
- String arrays: `TEXT[]`, `VARCHAR[]`
- Boolean arrays: `BOOL[]`
- Date/Time arrays: `DATE[]`, `TIMESTAMP[]`
- Other types: `UUID[]`, `JSON[]`, `JSONB[]`

### Array Parameters (Workarounds Required)

The RDS Data API does **not support binding array parameters** directly. You'll need to use one of these workarounds:

**1. CSV string with `string_to_array()` (for integer arrays):**

```javascript
await data.query("INSERT INTO products (tags) VALUES (string_to_array(:csv, ',')::int[])", {
  csv: '1,2,3'
})
```

**2. PostgreSQL array literal syntax:**

```javascript
await data.query('INSERT INTO products (tags) VALUES (:literal::text[])', {
  literal: '{"admin","editor","viewer"}'
})
```

**3. ARRAY[] constructor with individual parameters:**

```javascript
await data.query('INSERT INTO products (tags) VALUES (ARRAY[:tag1, :tag2, :tag3])', {
  tag1: 'blue',
  tag2: 'sale',
  tag3: 'featured'
})
```

Despite these input limitations, **all array results are automatically converted to native JavaScript arrays**, making it easy to work with PostgreSQL array data in your application.

## PostgreSQL Data Type Support

Version 2.0 provides comprehensive support for PostgreSQL data types:

### Numeric Types

- `SMALLINT`, `INT`, `BIGINT` - Integer types of various sizes
- `DECIMAL`, `NUMERIC` - Exact numeric types with precision
- `REAL`, `DOUBLE PRECISION` - Floating-point types

```javascript
await data.query('INSERT INTO products (price, quantity) VALUES (:price, :quantity)', {
  price: 19.99,
  quantity: 100
})
```

### String Types

- `CHAR`, `VARCHAR`, `TEXT` - Character types
- Full Unicode support

```javascript
await data.query('INSERT INTO posts (title, content) VALUES (:title, :content)', {
  title: 'Hello 世界 🌍',
  content: 'A very long text...'
})
```

### Boolean Type

```javascript
await data.query('INSERT INTO users (active) VALUES (:active)', { active: true })
```

### Date and Time Types

- `DATE` - Calendar date
- `TIME`, `TIME WITH TIME ZONE` - Time of day
- `TIMESTAMP`, `TIMESTAMP WITH TIME ZONE` - Date and time

```javascript
await data.query('INSERT INTO events (event_date, event_time) VALUES (:date, :time)', {
  date: '2024-12-25',
  time: new Date()
})
```

### Binary Data (BYTEA)

```javascript
const binaryData = Buffer.from('Binary content', 'utf-8')
await data.query('INSERT INTO files (content) VALUES (:content)', { content: binaryData })
```

### JSON and JSONB

**Automatic JSONB Casting (New in v2.x):**

The Data API Client now automatically detects and casts plain JavaScript objects as JSONB in PostgreSQL:

```javascript
// Automatic JSONB casting - no manual JSON.stringify() needed!
const metadata = { role: 'admin', permissions: ['read', 'write'] }
await data.query('INSERT INTO users (metadata) VALUES (:metadata)', {
  metadata: metadata // Automatically serialized and cast as ::jsonb
})

// Works with nested objects
const complexData = { user: { name: 'Alice' }, settings: { theme: 'dark' } }
await data.query('INSERT INTO users (data) VALUES (:data)', {
  data: complexData // Automatically handled
})

// Query result
let result = await data.query('SELECT metadata FROM users WHERE id = :id', { id: 1 })
const parsed = JSON.parse(result.records[0].metadata)
```

**Manual casting (still supported):**

You can still use explicit casting when needed:

```javascript
const metadata = { role: 'admin', permissions: ['read', 'write'] }
await data.query('INSERT INTO users (metadata) VALUES (:metadata::jsonb)', {
  metadata: JSON.stringify(metadata) // Manual approach
})
```

### UUID

```javascript
await data.query('INSERT INTO sessions (session_id) VALUES (:id::uuid)', {
  id: '550e8400-e29b-41d4-a716-446655440000'
})

// Or with explicit cast parameter
await data.query('INSERT INTO sessions (session_id) VALUES (:id)', [
  { name: 'id', value: '550e8400-e29b-41d4-a716-446655440000', cast: 'uuid' }
])
```

### Network Types

- `INET` - IPv4 or IPv6 host address
- `CIDR` - IPv4 or IPv6 network

```javascript
await data.query('INSERT INTO servers (ip_address, network) VALUES (:ip::inet, :net::cidr)', {
  ip: '192.168.1.1',
  net: '10.0.0.0/8'
})
```

### Range Types

- `INT4RANGE`, `NUMRANGE` - Numeric ranges
- `TSTZRANGE` - Timestamp ranges

```javascript
await data.query('INSERT INTO bookings (date_range) VALUES (:range::INT4RANGE)', {
  range: '[1,10)'
})
```

## TypeScript Support

Version 2.0 is written in TypeScript and provides comprehensive type definitions:

```typescript
import dataApiClient from 'data-api-client'
import type { DataAPIClientConfig, QueryResult } from 'data-api-client/types'

const config: DataAPIClientConfig = {
  secretArn: 'arn:...',
  resourceArn: 'arn:...',
  database: 'mydb',
  engine: 'pg'
}

const client = dataApiClient(config)

interface User {
  id: number
  name: string
  email: string
  tags: string[]
}

const result: QueryResult<User> = await client.query<User>('SELECT * FROM users WHERE id = :id', { id: 123 })
```

## Data API Limitations / Wonkiness

While the Data API is powerful, there are some limitations to be aware of:

### Array Parameters Not Supported

The RDS Data API does **not support binding array parameters** directly. Attempts to use `arrayValue` parameters result in `ValidationException: Array parameters are not supported`. See [PostgreSQL Array Support](#postgresql-array-support) for workarounds.

### Array Results ARE Supported

Despite parameter limitations, array **results** work great! The Data API Client automatically converts PostgreSQL arrays in query results to native JavaScript arrays.

### Some Advanced Types Have Limitations

- **MACADDR**: Not supported by the Data API
- **Multidimensional Arrays**: Limited support for arrays with more than one dimension
- **NULL values in arrays**: May not work correctly in all cases
- **Some Range Types**: INT8RANGE, DATERANGE, TSRANGE have casting issues

### Batch operations have limited feedback

Batch operations don't return `numberOfRecordsUpdated` for UPDATE/DELETE statements.

## Enabling Data API

In order to use the Data API, you must enable it on your Aurora Serverless Cluster and create a Secret. You also must grant your execution environment a number of permissions as outlined in the following sections.

### Enable Data API on your Aurora Cluster

![Enable Data API in Network & Security settings of your cluster](https://user-images.githubusercontent.com/2053544/58768968-79ee4300-8570-11e9-9266-1433182e0db2.png)

You need to modify your Aurora cluster by clicking "ACTIONS" and then "Modify Cluster". Check the Data API box in the _Network & Security_ section and you're good to go. This works for Aurora Serverless v1, Aurora Serverless v2, and Aurora provisioned clusters.

### Set up a secret in the Secrets Manager

Next you need to set up a secret in the Secrets Manager. This is actually quite straightforward. User name, password, encryption key (the default is probably fine for you), and select the database you want to access with the secret.

![Enter database credentials and select database to access](https://user-images.githubusercontent.com/2053544/58768974-912d3080-8570-11e9-8878-636dfb742b00.png)

Next we give it a name, this is important, because this will be part of the arn when we set up permissions later. You can give it a description as well so you don't forget what this secret is about when you look at it in a few weeks.

![Give your secret a name and add a description](https://user-images.githubusercontent.com/2053544/58768984-a7d38780-8570-11e9-8b21-199db5548c73.png)

You can then configure your rotation settings, if you want, and then you review and create your secret. Then you can click on your newly created secret and grab the arn, we're gonna need that next.

![Click on your secret to get the arn.](https://user-images.githubusercontent.com/2053544/58768989-bae65780-8570-11e9-94fb-51f6fa7d34bf.png)

### Required Permissions

In order to use the Data API, your execution environment requires several IAM permissions. Below are the minimum permissions required. **Please Note:** The `Resource: "*"` permission for `rds-data` is recommended by AWS (see [here](https://docs.aws.amazon.com/IAM/latest/UserGuide/list_amazonrdsdataapi.html#amazonrdsdataapi-resources-for-iam-policies)) because Amazon RDS Data API does not support specifying a resource ARN. The credentials specified in Secrets Manager can be used to restrict access to specific databases.

**YAML:**

```yaml
Statement:
  - Effect: 'Allow'
    Action:
      - 'rds-data:ExecuteSql'
      - 'rds-data:ExecuteStatement'
      - 'rds-data:BatchExecuteStatement'
      - 'rds-data:BeginTransaction'
      - 'rds-data:RollbackTransaction'
      - 'rds-data:CommitTransaction'
    Resource: '*'
  - Effect: 'Allow'
    Action:
      - 'secretsmanager:GetSecretValue'
    Resource: 'arn:aws:secretsmanager:{REGION}:{ACCOUNT-ID}:secret:{PATH-TO-SECRET}/*'
```

**JSON:**

```javascript
"Statement" : [
  {
    "Effect": "Allow",
    "Action": [
      "rds-data:ExecuteSql",
      "rds-data:ExecuteStatement",
      "rds-data:BatchExecuteStatement",
      "rds-data:BeginTransaction",
      "rds-data:RollbackTransaction",
      "rds-data:CommitTransaction"
    ],
    "Resource": "*"
  },
  {
    "Effect": "Allow",
    "Action": [ "secretsmanager:GetSecretValue" ],
    "Resource": "arn:aws:secretsmanager:{REGION}:{ACCOUNT-ID}:secret:{PATH-TO-SECRET}/*"
  }
]
```

## Contributions

Contributions, ideas and bug reports are welcome and greatly appreciated. Please add [issues](https://github.com/jeremydaly/data-api-client/issues) for suggestions and bug reports or create a pull request. You can also contact me on X: [@jeremy_daly](https://x.com/jeremy_daly) or LinkedIn: [https://www.linkedin.com/in/jeremydaly/](https://www.linkedin.com/in/jeremydaly/).
