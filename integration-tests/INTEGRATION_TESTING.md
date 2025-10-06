# Integration Testing Guide

This guide explains how to set up and run integration tests for the data-api-client library using Aurora Serverless v2 clusters.

## Overview

The integration testing strategy includes:

- **CloudFormation Infrastructure**: Two Aurora Serverless v2 clusters (MySQL and PostgreSQL)
- **Automatic Scaling**: Clusters scale to zero after 5 minutes of inactivity to minimize costs
- **Local Testing**: Run tests locally using AWS credentials
- **CI/CD Integration**: GitHub Actions workflow for automated testing
- **Comprehensive Test Coverage**: Tests for MySQL and PostgreSQL specific features

## Infrastructure Setup

### 1. Deploy CloudFormation Stack

Deploy the Aurora Serverless v2 infrastructure using the provided CloudFormation template:

```bash
aws cloudformation create-stack \
  --stack-name data-api-client-test \
  --template-body file://infra/integration-test-infra.yml \
  --parameters \
    ParameterKey=MasterUsername,ParameterValue=testadmin \
    ParameterKey=MasterPassword,ParameterValue=YourSecurePassword123 \
    ParameterKey=DatabaseName,ParameterValue=testdb \
    ParameterKey=SecondsUntilAutoPause,ParameterValue=300 \
  --capabilities CAPABILITY_IAM
```

**Important**: Choose a strong password and store it securely. You'll need it for local testing.

### 2. Wait for Stack Creation

Monitor the stack creation:

```bash
aws cloudformation wait stack-create-complete \
  --stack-name data-api-client-test
```

This typically takes 10-15 minutes as Aurora clusters are provisioned.

### 3. Retrieve Stack Outputs

Get the ARNs and endpoints:

```bash
aws cloudformation describe-stacks \
  --stack-name data-api-client-test \
  --query 'Stacks[0].Outputs'
```

You'll need these values:
- `MySQLClusterArn`
- `MySQLSecretArn`
- `PostgreSQLClusterArn`
- `PostgreSQLSecretArn`
- `DatabaseName`
- `Region`

## Local Testing

### 1. Set Environment Variables

Create a `.env.local` file (or export in your shell):

```bash
# AWS Configuration
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key

# MySQL Configuration
export MYSQL_RESOURCE_ARN=arn:aws:rds:us-east-1:123456789012:cluster:data-api-client-test-mysqlcluster-xxx
export MYSQL_SECRET_ARN=arn:aws:secretsmanager:us-east-1:123456789012:secret:data-api-client-test-mysql-secret-xxx
export MYSQL_DATABASE=testdb

# PostgreSQL Configuration
export POSTGRES_RESOURCE_ARN=arn:aws:rds:us-east-1:123456789012:cluster:data-api-client-test-postgresqlcluster-xxx
export POSTGRES_SECRET_ARN=arn:aws:secretsmanager:us-east-1:123456789012:secret:data-api-client-test-postgres-secret-xxx
export POSTGRES_DATABASE=testdb
```

### 2. Configure AWS Credentials

Ensure your AWS credentials have the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "rds-data:ExecuteStatement",
        "rds-data:BatchExecuteStatement",
        "rds-data:BeginTransaction",
        "rds-data:CommitTransaction",
        "rds-data:RollbackTransaction"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:*:*:secret:data-api-client-test-*"
      ]
    }
  ]
}
```

### 3. Run Integration Tests

Run all integration tests:

```bash
npm run build
npx vitest run integration-tests/
```

Run MySQL tests only:

```bash
npx vitest run integration-tests/mysql.integration.test.ts
```

Run PostgreSQL tests only:

```bash
npx vitest run integration-tests/postgres.integration.test.ts
```

Run in watch mode for development:

```bash
npx vitest integration-tests/
```

### 4. Run Specific Test Suites

```bash
# Run only transaction tests for MySQL
npx vitest run integration-tests/mysql.integration.test.ts -t "Transactions"

# Run only batch operations for PostgreSQL
npx vitest run integration-tests/postgres.integration.test.ts -t "Batch Operations"
```

## CI/CD Configuration

### GitHub Secrets Setup

Add the following secrets to your GitHub repository:

1. **AWS Credentials**:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION`

2. **MySQL Configuration**:
   - `MYSQL_RESOURCE_ARN`
   - `MYSQL_SECRET_ARN`
   - `MYSQL_DATABASE`

3. **PostgreSQL Configuration**:
   - `POSTGRES_RESOURCE_ARN`
   - `POSTGRES_SECRET_ARN`
   - `POSTGRES_DATABASE`

4. **NPM Publishing** (for publish workflow):
   - `NPM_TOKEN`

### Adding Secrets via GitHub CLI

```bash
# AWS credentials
gh secret set AWS_ACCESS_KEY_ID --body "your-access-key"
gh secret set AWS_SECRET_ACCESS_KEY --body "your-secret-key"
gh secret set AWS_REGION --body "us-east-1"

# MySQL configuration
gh secret set MYSQL_RESOURCE_ARN --body "arn:aws:rds:..."
gh secret set MYSQL_SECRET_ARN --body "arn:aws:secretsmanager:..."
gh secret set MYSQL_DATABASE --body "testdb"

# PostgreSQL configuration
gh secret set POSTGRES_RESOURCE_ARN --body "arn:aws:rds:..."
gh secret set POSTGRES_SECRET_ARN --body "arn:aws:secretsmanager:..."
gh secret set POSTGRES_DATABASE --body "testdb"

# NPM token (for publishing)
gh secret set NPM_TOKEN --body "npm_xxxxxxxxxxxx"
```

### Workflows

#### Integration Tests Workflow

Automatically runs on:
- Push to `main` or `v2.0.0` branches
- Pull requests to `main` or `v2.0.0` branches
- Manual trigger via `workflow_dispatch`

```bash
# Manually trigger integration tests
gh workflow run integration-tests.yml
```

#### Publish Workflow

Runs on:
- GitHub releases
- Manual trigger with optional version override

```bash
# Manually trigger publish with version
gh workflow run publish.yml -f version=2.0.0
```

## Test Structure

### Setup and Teardown

Each test suite follows this pattern:

1. **beforeAll**:
   - Load configuration from environment
   - Initialize RDS Data Client
   - Wait for cluster to wake (if scaled to zero)
   - Create test tables
   - Initialize data-api-client

2. **beforeEach**:
   - Truncate all tables for clean state

3. **afterAll**:
   - Drop all test tables
   - Destroy RDS client

### Test Categories

Both MySQL and PostgreSQL tests include:

- **Basic Queries**: SELECT, INSERT, UPDATE, DELETE
- **Batch Operations**: Bulk INSERT, UPDATE, DELETE
- **Data Types**: NULL, BOOLEAN, DECIMAL, JSON, TIMESTAMP, etc.
- **Transactions**: Commit, rollback, error handling
- **Dynamic Identifiers**: Table and column name substitution
- **Format Options**: Column hydration, array vs object results
- **Foreign Key Constraints**: Enforcement and cascading

### PostgreSQL-Specific Tests

- RETURNING clause
- Type casting with `::`
- SERIAL auto-increment
- UUID type
- POINT geometric type
- JSONB operations

## Cost Optimization

The infrastructure is designed to minimize costs:

1. **Serverless v2 Auto-Pause**:
   - Min capacity: 0 ACU (enables auto-pause)
   - Max capacity: 1 ACU
   - Auto-pause after 300 seconds (5 minutes) of inactivity

2. **Minimal Backups**:
   - 1 day retention period
   - Off-peak backup windows

3. **Development-Only**:
   - Not for production use
   - Can be torn down when not needed

### Estimated Costs

When scaled to zero: **$0/hour**

When active (running tests):
- MySQL: ~$0.24/hour (1 ACU max at $0.24/ACU-hour)
- PostgreSQL: ~$0.24/hour (1 ACU max at $0.24/ACU-hour)
- Secrets Manager: ~$0.05/month per secret

When paused (after 5 minutes of inactivity):
- **$0/hour** for compute (only storage costs apply)

**Typical monthly cost** (assuming 20 test runs × 15 min each):
- Compute: ~$1.20
- Secrets: ~$0.10
- **Total: ~$1.30/month**

## Cleanup

### Delete Stack

When you're done with testing:

```bash
aws cloudformation delete-stack --stack-name data-api-client-test
```

**Warning**: This will permanently delete:
- Both Aurora clusters
- All test data
- Secrets Manager secrets
- VPC and networking resources

### Verify Deletion

```bash
aws cloudformation wait stack-delete-complete \
  --stack-name data-api-client-test
```

## Troubleshooting

### Cluster Not Waking Up

If tests timeout waiting for cluster:

1. Check cluster status in AWS Console
2. Increase wait timeout in test (default: 5 retries × 2s)
3. Manually wake cluster with a query in AWS Console

### Permission Denied Errors

Ensure your IAM user/role has:
- `rds-data:*` permissions
- `secretsmanager:GetSecretValue` for test secrets
- Secrets must be in the same region as clusters

### Connection Timeout

- Verify security group allows Data API access
- Confirm `EnableHttpEndpoint` is true on clusters
- Check AWS region matches in all configurations

### Tests Failing Due to Previous Data

- Verify `beforeEach` truncation is working
- Manually truncate: `npx tsx scripts/truncate-tables.ts`
- Or drop/recreate tables in `beforeAll`

## Advanced Usage

### Running Against Different Environments

You can test against multiple environments:

```bash
# Staging environment
MYSQL_RESOURCE_ARN=$STAGING_MYSQL_ARN \
MYSQL_SECRET_ARN=$STAGING_MYSQL_SECRET \
npx vitest run integration-tests/mysql.integration.test.ts

# Production verification (read-only tests)
MYSQL_RESOURCE_ARN=$PROD_MYSQL_ARN \
MYSQL_SECRET_ARN=$PROD_MYSQL_SECRET \
npx vitest run integration-tests/mysql.integration.test.ts -t "Basic Queries"
```

### Custom Test Data

Modify seed functions in [integration-tests/setup.ts](integration-tests/setup.ts):

```typescript
export function getCustomSeedData() {
  return [
    // Your custom test data
  ]
}
```

### Performance Testing

Add performance benchmarks:

```typescript
test('should handle large batch insert efficiently', async () => {
  const start = Date.now()
  const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
    name: `User ${i}`,
    email: `user${i}@example.com`,
    age: 20 + (i % 50)
  }))

  await client.query(
    'INSERT INTO users (name, email, age) VALUES (:name, :email, :age)',
    largeDataset
  )

  const duration = Date.now() - start
  expect(duration).toBeLessThan(5000) // Should complete in < 5 seconds
})
```

## Additional Resources

- [Aurora Serverless v2 Documentation](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.html)
- [RDS Data API Documentation](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [Vitest Documentation](https://vitest.dev/)
