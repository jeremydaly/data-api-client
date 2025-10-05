import type {
  RDSDataClient,
  RDSDataClientConfig,
  ExecuteStatementCommandOutput,
  BatchExecuteStatementCommandOutput,
  BeginTransactionCommandInput,
  BeginTransactionCommandOutput,
  CommitTransactionCommandInput,
  CommitTransactionCommandOutput,
  RollbackTransactionCommandInput,
  RollbackTransactionCommandOutput,
  ExecuteStatementCommandInput,
  BatchExecuteStatementCommandInput,
  ColumnMetadata,
  ResultSetOptions
} from '@aws-sdk/client-rds-data'

// Supported Data API value types
export type SupportedType =
  | 'arrayValue'
  | 'blobValue'
  | 'booleanValue'
  | 'doubleValue'
  | 'isNull'
  | 'longValue'
  | 'stringValue'
  | 'structValue'

// Configuration for the Data API Client
export interface DataAPIClientConfig {
  /** The ARN of your Aurora Serverless Cluster */
  resourceArn: string
  /** The ARN of the secret associated with your database credentials */
  secretArn: string
  /** Default database name */
  database?: string
  /** Database engine type */
  engine?: 'mysql' | 'pg'
  /** Return objects with column names as keys (default: true) */
  hydrateColumnNames?: boolean
  /** Date formatting options */
  formatOptions?: FormatOptions
  /** Configuration object passed to RDSDataClient constructor */
  options?: RDSDataClientConfig
  /** Custom RDS Data Client instance */
  client?: RDSDataClient
  /** @deprecated Set in options instead */
  region?: string
  /** @deprecated Set in options instead */
  sslEnabled?: boolean
  /** @deprecated Use AWS_NODEJS_CONNECTION_REUSE_ENABLED environment variable */
  keepAlive?: boolean
}

// Format options for dates
export interface FormatOptions {
  /** Auto-parse date strings to Date objects (default: true) */
  deserializeDate?: boolean
  /** Treat dates as local time instead of UTC (default: false) */
  treatAsLocalDate?: boolean
}

// Internal configuration (extends public config with required fields)
export interface InternalConfig {
  engine: 'mysql' | 'pg'
  secretArn: string
  resourceArn: string
  database?: string
  hydrateColumnNames: boolean
  formatOptions: Required<FormatOptions>
  RDS: RDSDataClient
  transactionId?: string
}

// Parameter value types
export type ParameterValue =
  | string
  | number
  | boolean
  | null
  | Date
  | Buffer
  | { [key in SupportedType]?: any }

// Named parameter format
export interface NamedParameter {
  name: string
  value: ParameterValue
  cast?: string
}

// Parameter can be an object of key-value pairs or an array of named parameters
export type Parameters = Record<string, ParameterValue> | NamedParameter[]

// Query options
export interface QueryOptions {
  /** SQL statement */
  sql: string
  /** Query parameters */
  parameters?: Parameters | Parameters[]
  /** Database name (overrides default) */
  database?: string
  /** Schema name (Postgres) */
  schema?: string
  /** Continue after timeout */
  continueAfterTimeout?: boolean
  /** Include result metadata */
  includeResultMetadata?: boolean
  /** Hydrate column names */
  hydrateColumnNames?: boolean
  /** Transaction ID */
  transactionId?: string
  /** Secret ARN (overrides default) */
  secretArn?: string
  /** Resource ARN (overrides default) */
  resourceArn?: string
  /** Result set options */
  resultSetOptions?: ResultSetOptions
  /** Format options */
  formatOptions?: FormatOptions
}

// Formatted parameter (internal)
export interface FormattedParameter {
  name: string
  value?: {
    [key in SupportedType]?: any
  }
  typeHint?: string
}

// SQL parameter info (internal)
export interface SqlParamInfo {
  type: 'n_ph' | 'n_id' // named placeholder or named identifier
}

// Query result
export interface QueryResult<T = any> {
  records?: T[]
  columnMetadata?: ColumnMetadata[]
  numberOfRecordsUpdated?: number
  insertId?: number
  updateResults?: UpdateResult[]
}

// Update result for batch operations
export interface UpdateResult {
  insertId?: number
}

// Transaction object
export interface Transaction {
  query(sql: string, params?: Parameters): Transaction
  query(options: QueryOptions): Transaction
  query(fn: (lastResult: any, allResults: any[]) => [string, Parameters?]): Transaction
  rollback(fn: (error: Error, status: any) => void): Transaction
  commit(): Promise<any[]>
}

// Main client interface
export interface DataAPIClient {
  query<T = any>(sql: string, params?: Parameters | Parameters[]): Promise<QueryResult<T>>
  query<T = any>(options: QueryOptions): Promise<QueryResult<T>>
  transaction(options?: Partial<QueryOptions>): Transaction
  batchExecuteStatement(args: BatchExecuteStatementCommandInput): Promise<BatchExecuteStatementCommandOutput>
  beginTransaction(args?: BeginTransactionCommandInput): Promise<BeginTransactionCommandOutput>
  commitTransaction(args: CommitTransactionCommandInput): Promise<CommitTransactionCommandOutput>
  executeStatement(args: ExecuteStatementCommandInput): Promise<ExecuteStatementCommandOutput>
  rollbackTransaction(args: RollbackTransactionCommandInput): Promise<RollbackTransactionCommandOutput>
}
