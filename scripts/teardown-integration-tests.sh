#!/bin/bash

# Teardown script for integration testing infrastructure
# This script deletes the CloudFormation stack and all associated resources

set -e

STACK_NAME="${STACK_NAME:-data-api-client-test}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_PROFILE="${AWS_PROFILE:-data-api-int-tests}"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Data API Client Integration Test Teardown ===${NC}\n"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    exit 1
fi

# Build AWS CLI profile argument
PROFILE_ARG=""
if [ -n "$AWS_PROFILE" ]; then
    PROFILE_ARG="--profile $AWS_PROFILE"
    echo -e "${YELLOW}Using AWS Profile: $AWS_PROFILE${NC}"
fi

# Check if stack exists
STACK_STATUS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --query 'Stacks[0].StackStatus' \
  --output text \
  $PROFILE_ARG 2>/dev/null || echo "DOES_NOT_EXIST")

if [ "$STACK_STATUS" = "DOES_NOT_EXIST" ]; then
    echo -e "${YELLOW}Stack $STACK_NAME does not exist in region $AWS_REGION${NC}"
    exit 0
fi

echo -e "${RED}WARNING: This will permanently delete:${NC}"
echo "  - Aurora MySQL Serverless v2 cluster"
echo "  - Aurora PostgreSQL Serverless v2 cluster"
echo "  - All test data in both databases"
echo "  - Secrets Manager secrets"
echo "  - VPC and networking resources"
echo ""
echo -e "${YELLOW}Stack: $STACK_NAME${NC}"
echo -e "${YELLOW}Region: $AWS_REGION${NC}"
if [ -n "$AWS_PROFILE" ]; then
    echo -e "${YELLOW}Profile: $AWS_PROFILE${NC}"
fi
echo ""
read -p "Are you sure you want to delete this stack? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo -e "${GREEN}Deletion cancelled${NC}"
    exit 0
fi

echo -e "\n${GREEN}Deleting CloudFormation stack: ${STACK_NAME}${NC}\n"

# Delete the stack
aws cloudformation delete-stack \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  $PROFILE_ARG

echo -e "${YELLOW}Waiting for stack deletion (this may take 10-15 minutes)...${NC}\n"

# Wait for stack deletion
aws cloudformation wait stack-delete-complete \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  $PROFILE_ARG

echo -e "\n${GREEN}Stack deleted successfully!${NC}\n"

# Remove .env.local if it exists
if [ -f ".env.local" ]; then
    echo -e "${YELLOW}Removing .env.local file${NC}"
    rm .env.local
fi

echo -e "${GREEN}Teardown complete!${NC}"
