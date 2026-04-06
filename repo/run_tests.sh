#!/bin/bash

cleanup() {
  echo ""
  echo "Cleaning up..."
  echo "----------------------------------------"

  echo "Stopping docker compose services and removing local images..."
  docker compose down --remove-orphans --rmi local || true

  echo "Cleanup complete."
}

teardown_and_exit() {
  local exit_code=$1
  cleanup
  exit $exit_code
}

# Load environment variables if .env file exists
if [ -f .env ]; then
  set -a
  source .env
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

echo "Services are up. Starting tests..."
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
echo "Waiting for server at ${API_URL:-http://localhost:5000}..."

node API_tests/api-tests.js
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

node API_tests/integration-tests.js
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
