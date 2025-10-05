#!/bin/bash

# Setup script for integration testing infrastructure
# This script deploys the CloudFormation stack and retrieves the necessary outputs

set -e

STACK_NAME="${STACK_NAME:-data-api-client-test}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_PROFILE="${AWS_PROFILE:-data-api-int-tests}"
MASTER_USERNAME="${MASTER_USERNAME:-testadmin}"
DATABASE_NAME="${DATABASE_NAME:-testdb}"
SECONDS_UNTIL_AUTO_PAUSE="${SECONDS_UNTIL_AUTO_PAUSE:-300}"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Data API Client Integration Test Setup ===${NC}\n"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    echo "Please install it from: https://aws.amazon.com/cli/"
    exit 1
fi

# Build AWS CLI profile argument
PROFILE_ARG=""
if [ -n "$AWS_PROFILE" ]; then
    PROFILE_ARG="--profile $AWS_PROFILE"
    echo -e "${YELLOW}Using AWS Profile: $AWS_PROFILE${NC}"
fi

# Prompt for master password if not set
if [ -z "$MASTER_PASSWORD" ]; then
    echo -e "${YELLOW}Enter master password for database (min 8 characters):${NC}"
    read -s MASTER_PASSWORD
    echo ""

    if [ ${#MASTER_PASSWORD} -lt 8 ]; then
        echo -e "${RED}Error: Password must be at least 8 characters${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}Deploying CloudFormation stack: ${STACK_NAME}${NC}"
echo "Region: $AWS_REGION"
echo "Master Username: $MASTER_USERNAME"
echo "Database Name: $DATABASE_NAME"
echo "Auto-Pause After: $SECONDS_UNTIL_AUTO_PAUSE seconds ($((SECONDS_UNTIL_AUTO_PAUSE / 60)) minutes)"
echo ""

# Deploy the stack
aws cloudformation create-stack \
  --stack-name "$STACK_NAME" \
  --template-body file://infra/integration-test-infra.yml \
  --parameters \
    ParameterKey=MasterUsername,ParameterValue="$MASTER_USERNAME" \
    ParameterKey=MasterPassword,ParameterValue="$MASTER_PASSWORD" \
    ParameterKey=DatabaseName,ParameterValue="$DATABASE_NAME" \
    ParameterKey=SecondsUntilAutoPause,ParameterValue="$SECONDS_UNTIL_AUTO_PAUSE" \
  --region "$AWS_REGION" \
  $PROFILE_ARG

echo -e "\n${YELLOW}Waiting for stack creation (this may take 10-15 minutes)...${NC}\n"

# Wait for stack creation
aws cloudformation wait stack-create-complete \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  $PROFILE_ARG

echo -e "\n${GREEN}Stack created successfully!${NC}\n"

# Get stack outputs
echo -e "${GREEN}=== Stack Outputs ===${NC}\n"

OUTPUTS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --query 'Stacks[0].Outputs' \
  --output json \
  $PROFILE_ARG)

MYSQL_CLUSTER_ARN=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="MySQLClusterArn") | .OutputValue')
MYSQL_SECRET_ARN=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="MySQLSecretArn") | .OutputValue')
POSTGRES_CLUSTER_ARN=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="PostgreSQLClusterArn") | .OutputValue')
POSTGRES_SECRET_ARN=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="PostgreSQLSecretArn") | .OutputValue')

echo "MySQL Cluster ARN: $MYSQL_CLUSTER_ARN"
echo "MySQL Secret ARN: $MYSQL_SECRET_ARN"
echo "PostgreSQL Cluster ARN: $POSTGRES_CLUSTER_ARN"
echo "PostgreSQL Secret ARN: $POSTGRES_SECRET_ARN"
echo ""

# Create .env.local file
ENV_FILE=".env.local"
cat > "$ENV_FILE" << EOF
# AWS Configuration
export AWS_REGION=$AWS_REGION

# MySQL Configuration
export MYSQL_RESOURCE_ARN=$MYSQL_CLUSTER_ARN
export MYSQL_SECRET_ARN=$MYSQL_SECRET_ARN
export MYSQL_DATABASE=$DATABASE_NAME

# PostgreSQL Configuration
export POSTGRES_RESOURCE_ARN=$POSTGRES_CLUSTER_ARN
export POSTGRES_SECRET_ARN=$POSTGRES_SECRET_ARN
export POSTGRES_DATABASE=$DATABASE_NAME
EOF

echo -e "${GREEN}Environment variables saved to $ENV_FILE${NC}"
echo ""
echo -e "${YELLOW}To use these variables, run:${NC}"
echo -e "  source $ENV_FILE"
echo ""
echo -e "${YELLOW}To run integration tests:${NC}"
echo -e "  npm run test:integration"
echo ""
echo -e "${GREEN}=== GitHub Secrets (for CI/CD) ===${NC}\n"
echo "Add these secrets to your GitHub repository:"
echo ""
echo "gh secret set AWS_REGION --body \"$AWS_REGION\""
echo "gh secret set MYSQL_RESOURCE_ARN --body \"$MYSQL_CLUSTER_ARN\""
echo "gh secret set MYSQL_SECRET_ARN --body \"$MYSQL_SECRET_ARN\""
echo "gh secret set MYSQL_DATABASE --body \"$DATABASE_NAME\""
echo "gh secret set POSTGRES_RESOURCE_ARN --body \"$POSTGRES_CLUSTER_ARN\""
echo "gh secret set POSTGRES_SECRET_ARN --body \"$POSTGRES_SECRET_ARN\""
echo "gh secret set POSTGRES_DATABASE --body \"$DATABASE_NAME\""
echo ""
echo -e "${GREEN}Setup complete!${NC}"
