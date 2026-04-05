#!/bin/bash
set -e

echo "========================================"
echo "  MotorLot DealerOps - Test Runner"
echo "========================================"
echo ""

UNIT_PASSED=0
UNIT_FAILED=0
API_PASSED=0
API_FAILED=0

# --- Unit Tests ---
echo "Running Unit Tests..."
echo "----------------------------------------"

for test_file in unit_tests/*.test.js; do
  echo ""
  echo "Running $test_file..."
  if node "$test_file"; then
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
echo ""
echo "Running API Tests..."
echo "----------------------------------------"
echo "Waiting for server at ${API_URL:-http://localhost:5000}..."

if node API_tests/api-tests.js; then
  API_PASSED=1
else
  API_FAILED=1
fi

echo ""
echo "========================================"
echo "  API Tests Summary"
echo "  Suites passed: $API_PASSED"
echo "  Suites failed: $API_FAILED"
echo "========================================"

# --- Final Summary ---
TOTAL_PASSED=$((UNIT_PASSED + API_PASSED))
TOTAL_FAILED=$((UNIT_FAILED + API_FAILED))

echo ""
echo "========================================"
echo "  FINAL SUMMARY"
echo "  Total suites passed: $TOTAL_PASSED"
echo "  Total suites failed: $TOTAL_FAILED"
if [ $TOTAL_FAILED -eq 0 ]; then
  echo "  Result: ALL TESTS PASSED"
else
  echo "  Result: SOME TESTS FAILED"
fi
echo "========================================"

exit $TOTAL_FAILED
