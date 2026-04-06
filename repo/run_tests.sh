#!/bin/bash

cleanup() {
  echo ""
  echo "Cleaning up..."
  echo "----------------------------------------"

  echo "Stopping docker compose services and removing local images..."
  docker compose down --remove-orphans --rmi local || true

  echo "Restoring original .env.example..."
  if [ -f .env.example.backup ]; then
    mv .env.example.backup .env.example
    echo "Original .env.example restored."
  fi

  echo "Cleanup complete."
}

teardown_and_exit() {
  local exit_code=$1
  cleanup
  exit $exit_code
}

# Backup original .env.example and create test version
if [ -f .env.example ] && [ ! -f .env.example.backup ]; then
  echo "Backing up original .env.example..."
  mv .env.example .env.example.backup
fi

echo "Creating .env.example with test credentials..."
cat > .env.example << 'EOF'
NODE_ENV=development
PORT=5000
LOG_LEVEL=info

MONGODB_URI=mongodb://mongodb:27017/motorlot?replicaSet=rs0&directConnection=true
REDIS_URL=redis://redis:6379

JWT_SECRET=test-jwt-secret-key-should-be-changed-in-production
JWT_REFRESH_SECRET=test-refresh-secret-key-should-be-changed-in-production
HMAC_SECRET=test-hmac-secret-key-should-be-changed-in-production

MASTER_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

UPLOAD_DIR=/app/uploads
QUARANTINE_DIR=/app/quarantine

ADMIN_EMAIL=admin@motorlot.com
ADMIN_PASSWORD=MotorLot@Admin2024!
ADMIN_FIRST_NAME=Admin
ADMIN_LAST_NAME=User

STAFF_EMAIL=staff@motorlot.com
STAFF_PASSWORD=MotorLot@Staff2024!
STAFF_FIRST_NAME=Staff
STAFF_LAST_NAME=User

FINANCE_EMAIL=finance@motorlot.com
FINANCE_PASSWORD=MotorLot@Finance2024!
FINANCE_FIRST_NAME=Finance
FINANCE_LAST_NAME=Reviewer

BUYER_EMAIL=buyer@motorlot.com
BUYER_PASSWORD=MotorLot@Buyer2024!
BUYER_FIRST_NAME=Buyer
BUYER_LAST_NAME=User
EOF
echo ".env.example created with test credentials"

# Load environment variables
if [ -f .env.example ]; then
  set -a
  source .env.example
  set +a
fi

echo "========================================"
echo "  MotorLot DealerOps - Test Runner"
echo "========================================"
echo ""

echo "Preparing services..."
echo "----------------------------------------"
echo "Building and starting services with docker compose..."
if ! docker compose up -d --build; then
  echo "Docker compose build/start failed. Aborting test run."
  teardown_and_exit 1
fi

echo "Waiting for services to be healthy..."
sleep 5

echo "Verifying MongoDB is ready..."
for i in {1..30}; do
  if docker compose exec -T mongodb mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
    echo "MongoDB is ready."
    break
  fi
  if [ $i -eq 30 ]; then
    echo "MongoDB failed to become ready. Aborting."
    teardown_and_exit 1
  fi
  echo "  Waiting for MongoDB... ($i/30)"
  sleep 1
done

echo "Running database seeds..."
if ! docker compose exec -T server npm run seed 2>&1; then
  echo "Seed failed. Server logs:"
  docker compose logs server | tail -50
  teardown_and_exit 1
fi

echo "Seeds complete. Verifying test accounts created..."
ACCOUNT_COUNT=$(docker compose exec -T mongodb mongosh motorlot --eval "db.users.countDocuments()" 2>&1 | grep -oE '[0-9]+' | tail -1)
if [ "$ACCOUNT_COUNT" -lt 4 ]; then
  echo "Warning: Only $ACCOUNT_COUNT accounts created (expected 4). Checking MongoDB state..."
  docker compose exec -T mongodb mongosh motorlot --eval "db.users.find({}, {email: 1}).pretty()" | head -20
fi

echo "Waiting for server to be ready..."
sleep 2

echo "Services are up and seeded. Starting tests..."
echo ""

UNIT_PASSED=0
UNIT_FAILED=0
API_PASSED=0
API_FAILED=0
API_SKIPPED=0

# --- Unit Tests ---
echo "Running Unit Tests..."
echo "----------------------------------------"

for test_file in unit_tests/*.test.js; do
  echo ""
  echo "Running $test_file..."
  if docker compose run --rm --no-deps -T \
      -v "$(pwd):/workspace" \
      -w /workspace \
      -e NODE_PATH=/app/node_modules \
      server node "$test_file"; then
    UNIT_PASSED=$((UNIT_PASSED + 1))
  else
    UNIT_FAILED=$((UNIT_FAILED + 1))
  fi
done

echo ""
echo "========================================"
echo "  Unit Tests Summary"
echo "  Suites passed: $UNIT_PASSED"
echo "  Suites failed: $UNIT_FAILED"
echo "========================================"

# --- API Tests ---
# Exit code convention from test files:
#   0 = tests ran and all passed
#   3 = skipped (server not reachable)
#   anything else = tests ran and some failed
echo ""
echo "Running API Tests..."
echo "----------------------------------------"
echo "Waiting for server at ${API_URL:-http://server:5000}..."

docker compose run --rm --no-deps -T \
  -v "$(pwd):/workspace" \
  -w /workspace \
  -e API_URL=http://server:5000 \
  server node API_tests/api-tests.js
API_EXIT=$?
if [ $API_EXIT -eq 0 ]; then
  API_PASSED=$((API_PASSED + 1))
elif [ $API_EXIT -eq 3 ]; then
  API_SKIPPED=$((API_SKIPPED + 1))
else
  API_FAILED=$((API_FAILED + 1))
fi

echo ""
echo "Running Integration Tests..."
echo "----------------------------------------"

docker compose run --rm --no-deps -T \
  -v "$(pwd):/workspace" \
  -w /workspace \
  -e API_URL=http://server:5000 \
  server node API_tests/integration-tests.js
INTEG_EXIT=$?
if [ $INTEG_EXIT -eq 0 ]; then
  API_PASSED=$((API_PASSED + 1))
elif [ $INTEG_EXIT -eq 3 ]; then
  API_SKIPPED=$((API_SKIPPED + 1))
else
  API_FAILED=$((API_FAILED + 1))
fi

echo ""
echo "========================================"
echo "  API Tests Summary"
echo "  Suites passed:  $API_PASSED"
echo "  Suites failed:  $API_FAILED"
echo "  Suites skipped: $API_SKIPPED"
echo "========================================"

# --- Final Summary ---
TOTAL_PASSED=$((UNIT_PASSED + API_PASSED))
TOTAL_FAILED=$((UNIT_FAILED + API_FAILED))
TOTAL_SKIPPED=$API_SKIPPED

echo ""
echo "========================================"
echo "  FINAL SUMMARY"
echo "  Total suites passed:  $TOTAL_PASSED"
echo "  Total suites failed:  $TOTAL_FAILED"
echo "  Total suites skipped: $TOTAL_SKIPPED"

if [ $TOTAL_FAILED -gt 0 ]; then
  echo "  Result: SOME TESTS FAILED"
elif [ $TOTAL_SKIPPED -gt 0 ]; then
  echo "  Result: INCOMPLETE — $TOTAL_SKIPPED API suite(s) skipped (server not running)"
  echo "  Check Docker health/startup logs, then re-run to get full results."
else
  echo "  Result: ALL TESTS PASSED"
fi
echo "========================================"

# Fail if any tests failed OR if any were skipped (skip is not a pass)
if [ $TOTAL_FAILED -gt 0 ]; then
  teardown_and_exit 1
fi
if [ $TOTAL_SKIPPED -gt 0 ]; then
  teardown_and_exit 2
fi
teardown_and_exit 0
