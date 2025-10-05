# Integration Test Scripts

Helper scripts for managing the Aurora Serverless v2 integration testing infrastructure.

## Setup Script

**`setup-integration-tests.sh`** - Deploys CloudFormation stack and configures environment variables

### Usage

```bash
./scripts/setup-integration-tests.sh
```

### Environment Variables

You can customize the setup with these environment variables:

```bash
export STACK_NAME="data-api-client-test"         # CloudFormation stack name
export AWS_REGION="us-east-1"                    # AWS region
export AWS_PROFILE="data-api-int-tests"          # AWS CLI profile (default: data-api-int-tests)
export MASTER_USERNAME="testadmin"               # Database master username
export DATABASE_NAME="testdb"                    # Default database name
export SECONDS_UNTIL_AUTO_PAUSE="300"            # Seconds before auto-pause (300-86400, default: 300 = 5 min)
export MASTER_PASSWORD="YourPassword123"         # Database password (prompted if not set)

./scripts/setup-integration-tests.sh
```

### What It Does

1. ✅ Validates AWS CLI is installed
2. ✅ Prompts for master password (if not set)
3. ✅ Deploys CloudFormation stack with Aurora Serverless v2 clusters
4. ✅ Waits for stack creation (10-15 minutes)
5. ✅ Retrieves stack outputs (ARNs, endpoints, etc.)
6. ✅ Creates `.env.local` file with environment variables
7. ✅ Displays GitHub secrets for CI/CD setup

### Output

- **`.env.local`** - Environment variables for local testing
- Stack outputs printed to console
- GitHub secrets commands for CI/CD

## Teardown Script

**`teardown-integration-tests.sh`** - Deletes CloudFormation stack and all resources

### Usage

```bash
./scripts/teardown-integration-tests.sh
```

### Environment Variables

```bash
export STACK_NAME="data-api-client-test"      # CloudFormation stack name
export AWS_REGION="us-east-1"                 # AWS region
export AWS_PROFILE="data-api-int-tests"       # AWS CLI profile (default: data-api-int-tests)

./scripts/teardown-integration-tests.sh
```

### What It Does

1. ✅ Validates AWS CLI is installed
2. ✅ Checks if stack exists
3. ✅ Displays warning about resource deletion
4. ✅ Prompts for confirmation
5. ✅ Deletes CloudFormation stack
6. ✅ Waits for stack deletion (10-15 minutes)
7. ✅ Removes `.env.local` file

### Warning

This script **permanently deletes**:
- Aurora MySQL Serverless v2 cluster
- Aurora PostgreSQL Serverless v2 cluster
- All test data in both databases
- Secrets Manager secrets
- VPC and networking resources

## Examples

### Setup with Custom Configuration

```bash
export STACK_NAME="my-custom-test-stack"
export AWS_REGION="us-west-2"
export AWS_PROFILE="dev-account"
export MASTER_USERNAME="customadmin"
export DATABASE_NAME="customdb"
export SECONDS_UNTIL_AUTO_PAUSE="600"          # 10 minutes
export MASTER_PASSWORD="MySecurePassword123"

./scripts/setup-integration-tests.sh
```

### Using AWS CLI Profiles

```bash
# Setup using a specific AWS profile
AWS_PROFILE=dev-account ./scripts/setup-integration-tests.sh

# Teardown using the same profile
AWS_PROFILE=dev-account ./scripts/teardown-integration-tests.sh
```

### Teardown Custom Stack

```bash
export STACK_NAME="my-custom-test-stack"
export AWS_REGION="us-west-2"
export AWS_PROFILE="dev-account"

./scripts/teardown-integration-tests.sh
```

### Running Integration Tests After Setup

```bash
# Source environment variables
source .env.local

# Run all integration tests
npm run test:integration

# Run MySQL tests only
npm run test:integration:mysql

# Run PostgreSQL tests only
npm run test:integration:postgres
```

## Troubleshooting

### AWS CLI Not Found

Install AWS CLI:
- macOS: `brew install awscli`
- Linux: `apt-get install awscli` or `yum install awscli`
- Windows: Download from https://aws.amazon.com/cli/

### Permission Denied

Make scripts executable:
```bash
chmod +x scripts/*.sh
```

### Stack Already Exists

Delete existing stack first:
```bash
./scripts/teardown-integration-tests.sh
```

Then run setup again:
```bash
./scripts/setup-integration-tests.sh
```

### AWS Credentials Not Configured

Configure AWS credentials:
```bash
aws configure
```

Or use a named profile:
```bash
aws configure --profile myprofile
AWS_PROFILE=myprofile ./scripts/setup-integration-tests.sh
```

Or set environment variables:
```bash
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
```

## Cost Management

The infrastructure is designed to minimize costs:

- **Serverless v2 Auto-Pause**: Clusters scale to 0 ACU after 5 minutes of inactivity
- **When Scaled to Zero**: $0/hour
- **When Active**: ~$0.12/hour per cluster (0.5 ACU × $0.24/ACU-hour)
- **Typical Monthly Cost**: ~$1.30/month (20 test runs × 15 min each)

To minimize costs:
1. Run `teardown-integration-tests.sh` when not actively testing
2. Let clusters auto-pause between test runs
3. Use scheduled CI/CD runs instead of on every commit
