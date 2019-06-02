# Aurora Serverless Data API Client

**THIS IS A WORK IN PROGRESS AND HAS NOT BEEN PUBLISHED TO NPM YET!**

The **Data API Client** is a lightweight wrapper that simplifies working with the Amazon Aurora Serverless Data API by abstracting away the notion of field values. This abstraction annotates native JavaScript types supplied as input parameters, as well as converts annotated response data to native JavaScript types. It's basically a [DocumentClient](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html]) for the Data API. It also promisifies the `AWS.RDSDataService` client to make working with `async/await` or Promise chains easier.

For more information about the Aurora Serverless Data API, you can review the [official documentation](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html) or read [Aurora Serverless Data API: An (updated) First Look](https://www.jeremydaly.com/aurora-serverless-data-api-a-first-look/) for some more insights on performance.

## Simple Examples

The **Data API Client** makes working with the Aurora Serverless Data API super simple. Require and instantiate the library with basic configuration information, then use the `query()` method to manage your workflows. Below are some examples.

```javascript
// Require and instantiate data-api-client with secret and cluster
const data = require('data-api-client')({
  secretArn: 'arn:aws:secretsmanager:us-east-1:XXXXXXXXXXXX:secret:mySecret',
  resourceArn: 'arn:aws:rds:us-east-1:XXXXXXXXXXXX:cluster:my-cluster-name',
  database: 'myDatabase' // default database
})

/*** Assuming we're in an async function ***/

// Simple SELECT
let result = await data.query(`SELECT * FROM myTable`)
// [ { id: 1, name: 'Alice', age: null },
//   { id: 2, name: 'Mike', age: 52 },
//   { id: 3, name: 'Carol', age: 50 } ]

// SELECT with named parameters
let resultParams = await data.query(
  `SELECT * FROM myTable WHERE id = :id`,
  { id: 2 }
)
// [ { id: 2, name: 'Mike', age: 52 } ]

// INSERT with named parameters
let insert = await data.query(
  `INSERT INTO myTable (name,age,has_curls) VALUES(:name,:age,:curls)`,
  { name: 'Greg',   age: 18,  curls: false }
)

// BATCH INSERT with named parameters
let batchInsert = await data.query(
  `INSERT INTO myTable (name,age,has_curls) VALUES(:name,:age,:curls)`,
  [
    { name: 'Marcia', age: 17,  curls: false },
    { name: 'Peter',  age: 15,  curls: false },
    { name: 'Jan',    age: 15,  curls: false },
    { name: 'Cindy',  age: 12,  curls: true  },
    { name: 'Bobby',  age: 12,  curls: false }
  ]
)

// Update with named parameters
let update = await data.query(
  `UPDATE myTable SET age = :age WHERE id = :id`,
  { age: 13, id: 5 }
)

// Delete with named parameters
let remove = await data.query(
  `DELETE FROM myTable WHERE name = :name`,
  { name: 'Jan' } // Sorry Jan :(
)

// A slightly more advanced example
let custom = data.query({
  sql: `SELECT * FROM myOtherTable WHERE id = :id AND active = :isActive`,
  continueAfterTimeout: true,
  database: 'myOtherDatabase',
  parameters: [
    { id: 123},
    { name: 'isActive', value: { booleanValue: true } }
  ]
})
```

## Why do I need this?
The [Data API](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html) requires you to specify data types when passing in parameters. The basic `INSERT` example above would look like this using the native `AWS.RDSDataService` class:

```javascript
const AWS = require('aws-sdk')
const data = new AWS.RDSDataService()

/*** Assuming we're in an async function ***/

// INSERT with named parameters
let insert = await data.executeStatement({
  secretArn: 'arn:aws:secretsmanager:us-east-1:XXXXXXXXXXXX:secret:mySecret',
  resourceArn: 'arn:aws:rds:us-east-1:XXXXXXXXXXXX:cluster:my-cluster-name',
  database: 'myDatabase',
  sql: 'INSERT INTO myTable (name,age,has_curls) VALUES(:name,:age,:curls)',
  parameters: [
    { name: 'name', value: { stringValue: 'Cousin Oliver' } },
    { name: 'age', value: { longValue: 10 } },
    { name: 'curls', value: { booleanValue: false } }
  ]
).promise()
```

Specifying all of those data types in the parameters is a bit clunky, plus every query requires you to pass in the `secretArn`, `resourceArn`, `database`, and any other method parameters you might need.

In addition to requiring types for parameters, it also returns each field as an object containing all possible data types, like this:

```javascript
{ // id field
  "blobValue": null,
  "booleanValue": null,
  "doubleValue": null,
  "isNull": null,
  "longValue": 9,
  "stringValue": null
},
{ // name field
  "blobValue": null,
  "booleanValue": null,
  "doubleValue": null,
  "isNull": null,
  "longValue": null,
  "stringValue": "Cousin Oliver"
},
{ // age field
  "blobValue": null,
  "booleanValue": null,
  "doubleValue": null,
  "isNull": null,
  "longValue": 10,
  "stringValue": null
},
{ // has_curls field
  "blobValue": null,
  "booleanValue": false,
  "doubleValue": null,
  "isNull": null,
  "longValue": null,
  "stringValue": null
}
```
Not only are there no column names, but you have to remove all `null` fields and pull the value from the remaining data type. Lots of extra work that the **Data API Client** handles automatically for you. 😀

## Installation



## Required Permissions

In order to use the Data API, your execution environment requires several IAM permissions. Below are the minimum permissions required.

**YAML:**
```yaml
Statement:
  - Effect: "Allow"
    Action:
      - "rds-data:ExecuteSql"
      - "rds-data:ExecuteStatement"
      - "rds-data:BatchExecuteStatement"
      - "rds-data:BeginTransaction"
      - "rds-data:RollbackTransaction"
      - "rds-data:CommitTransaction"
    Resource: "arn:aws:rds:{REGION}:{ACCOUNT-ID}:cluster:{YOUR-CLUSTER-NAME}"
  - Effect: "Allow"
    Action:
      - "secretsmanager:GetSecretValue"
    Resource: "arn:aws:secretsmanager:{REGION}:{ACCOUNT-ID}:secret:{PATH-TO-SECRET}/*"
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
    "Resource": "arn:aws:rds:{REGION}:{ACCOUNT-ID}:cluster:{YOUR-CLUSTER-NAME}"
  },
  {
    "Effect": "Allow",
    "Action": [ "secretsmanager:GetSecretValue" ],
    "Resource": "arn:aws:secretsmanager:{REGION}:{ACCOUNT-ID}:secret:{PATH-TO-SECRET}/*"
  }
]
```

## Usage

*WIP*

### Transactions

*WIP*

## Data API Limitations / Wonkiness
The first GA release of the Data API has *a lot* of promise, unfortunately, there are still quite a few things that make it a bit wonky and may require you to implement some workarounds. I've outline some of my findings below.

### You can't send in an array of values
The GitHub repo for RDSDataService mentions something about `arrayValues`, but I've been unable to get arrays (including TypedArrays and Buffers) to be used for parameters with `IN` clauses. For example, the following query will **NOT** work:

```javascript
let insert = await data.executeStatement({
  secretArn: 'arn:aws:secretsmanager:us-east-1:XXXXXXXXXXXX:secret:mySecret',
  resourceArn: 'arn:aws:rds:us-east-1:XXXXXXXXXXXX:cluster:my-cluster-name',
  database: 'myDatabase',
  sql: 'SELECT * FROM myTable WHERE id IN (:ids)',
  parameters: [
    { name: 'id', value: { blobValue: [1,2,3,4,5] } }
  ]
).promise()
```

I'm using `blobValue` because it's the only generic value field. You could send it in as a string, but then it only uses the first value. Hopefully they will add an `arrayValues` or something similar to support this in the future.

### Named parameters MUST be sent in order
Read that again if you need to. So parameters have to be **BOTH** named and *in order*, otherwise the query **may** fail. I stress **may**, because if you send in two fields of compatible type in the wrong order, the query will work, just with your values flipped. 🤦🏻‍♂️ Watch out for this one.

### Batch statements do not give you updated record counts
This one is a bit frustrating. If you execute a standard `executeStatement`, then it will return a `numberOfRecordsUpdated` for `UPDATE` and `DELETE` queries. This is handy for knowing if your query succeeded. Unfortunately, a `batchExecuteStatement` does not return this field for you.

## Contributions
Contributions, ideas and bug reports are welcome and greatly appreciated. Please add [issues](https://github.com/jeremydaly/data-api-client/issues) for suggestions and bug reports or create a pull request.
