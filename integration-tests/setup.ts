import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data'
import type { ParameterValue } from '../src/types'

export interface IntegrationTestConfig {
  resourceArn: string
  secretArn: string
  database: string
  region: string
  engine: 'mysql' | 'pg'
}

export interface TestTable {
  name: string
  schema: string
}

/**
 * Load integration test configuration from environment variables
 */
export function loadConfig(engine: 'mysql' | 'pg'): IntegrationTestConfig {
  const prefix = engine === 'mysql' ? 'MYSQL' : 'POSTGRES'

  const resourceArn = process.env[`${prefix}_RESOURCE_ARN`]
  const secretArn = process.env[`${prefix}_SECRET_ARN`]
  const database = process.env[`${prefix}_DATABASE`] || 'testdb'
  const region = process.env.AWS_REGION || 'us-east-1'

  if (!resourceArn || !secretArn) {
    throw new Error(
      `Missing required environment variables for ${engine} integration tests. ` +
        `Required: ${prefix}_RESOURCE_ARN, ${prefix}_SECRET_ARN`
    )
  }

  return { resourceArn, secretArn, database, region, engine }
}

/**
 * Execute raw SQL statement using RDS Data API
 */
export async function executeSQL(
  client: RDSDataClient,
  config: IntegrationTestConfig,
  sql: string
): Promise<void> {
  const command = new ExecuteStatementCommand({
    resourceArn: config.resourceArn,
    secretArn: config.secretArn,
    database: config.database,
    sql
  })

  await client.send(command)
}

/**
 * MySQL table schemas for testing
 */
export const mysqlTables: TestTable[] = [
  {
    name: 'users',
    schema: `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        age INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `
  },
  {
    name: 'posts',
    schema: `
      CREATE TABLE IF NOT EXISTS posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        published BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `
  },
  {
    name: 'products',
    schema: `
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        quantity INT DEFAULT 0,
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  }
]

/**
 * PostgreSQL table schemas for testing
 */
export const postgresTables: TestTable[] = [
  {
    name: 'users',
    schema: `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        age INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  },
  {
    name: 'posts',
    schema: `
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        published BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `
  },
  {
    name: 'products',
    schema: `
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price NUMERIC(10, 2) NOT NULL,
        quantity INT DEFAULT 0,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  },
  {
    name: 'locations',
    schema: `
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        coordinates POINT,
        uuid UUID DEFAULT gen_random_uuid(),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
  }
]

/**
 * Create test tables
 */
export async function createTables(
  client: RDSDataClient,
  config: IntegrationTestConfig,
  tables: TestTable[]
): Promise<void> {
  for (const table of tables) {
    await executeSQL(client, config, table.schema)
  }
}

/**
 * Drop test tables
 */
export async function dropTables(
  client: RDSDataClient,
  config: IntegrationTestConfig,
  tables: TestTable[]
): Promise<void> {
  // Drop in reverse order to handle foreign key constraints
  for (const table of [...tables].reverse()) {
    const sql =
      config.engine === 'mysql'
        ? `DROP TABLE IF EXISTS ${table.name}`
        : `DROP TABLE IF EXISTS ${table.name} CASCADE`
    await executeSQL(client, config, sql)
  }
}

/**
 * Truncate all test tables
 */
export async function truncateTables(
  client: RDSDataClient,
  config: IntegrationTestConfig,
  tables: TestTable[]
): Promise<void> {
  // For MySQL, use DELETE instead of TRUNCATE to avoid foreign key issues
  // Delete in reverse order to handle foreign key constraints
  const tablesToClear = config.engine === 'mysql' ? [...tables].reverse() : tables

  for (const table of tablesToClear) {
    const sql = config.engine === 'mysql'
      ? `DELETE FROM ${table.name}`
      : `TRUNCATE TABLE ${table.name}`
    await executeSQL(client, config, sql)
  }

  // Reset auto-increment for MySQL tables
  if (config.engine === 'mysql') {
    for (const table of tables) {
      await executeSQL(client, config, `ALTER TABLE ${table.name} AUTO_INCREMENT = 1`)
    }
  }
}

/**
 * Seed test data for users table
 */
export function getSeedUsers(): Array<Record<string, ParameterValue>> {
  return [
    { name: 'Alice Johnson', email: 'alice@example.com', age: 30 },
    { name: 'Bob Smith', email: 'bob@example.com', age: 25 },
    { name: 'Carol Williams', email: 'carol@example.com', age: 35 },
    { name: 'David Brown', email: 'david@example.com', age: null }
  ]
}

/**
 * Seed test data for users table in batch format (array of arrays)
 */
export function getSeedUsersBatch(): Array<Array<Record<string, ParameterValue>>> {
  return getSeedUsers().map(user => [user])
}

/**
 * Seed test data for products table
 */
export function getSeedProducts(): Array<Record<string, ParameterValue>> {
  return [
    {
      name: 'Widget A',
      price: 19.99,
      quantity: 100,
      metadata: JSON.stringify({ color: 'red', size: 'large' })
    },
    {
      name: 'Widget B',
      price: 29.99,
      quantity: 50,
      metadata: JSON.stringify({ color: 'blue', size: 'medium' })
    },
    {
      name: 'Gadget X',
      price: 99.99,
      quantity: 25,
      metadata: JSON.stringify({ features: ['wireless', 'rechargeable'] })
    }
  ]
}

/**
 * Seed test data for products table in batch format (array of arrays)
 */
export function getSeedProductsBatch(): Array<Array<Record<string, ParameterValue>>> {
  return getSeedProducts().map(product => [product])
}

/**
 * Wait for cluster to wake up (for serverless v2 that has scaled to zero)
 * Makes a simple query and retries with exponential backoff
 */
export async function waitForCluster(
  client: RDSDataClient,
  config: IntegrationTestConfig,
  maxRetries = 5,
  initialDelay = 2000
): Promise<void> {
  let retries = 0
  let delay = initialDelay

  while (retries < maxRetries) {
    try {
      const sql = config.engine === 'mysql' ? 'SELECT 1' : 'SELECT 1 as test'
      await executeSQL(client, config, sql)
      return
    } catch (error) {
      retries++
      if (retries >= maxRetries) {
        throw new Error(
          `Failed to connect to cluster after ${maxRetries} attempts: ${error}`
        )
      }
      await new Promise((resolve) => setTimeout(resolve, delay))
      delay *= 2 // Exponential backoff
    }
  }
}
