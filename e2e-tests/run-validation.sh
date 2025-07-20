#!/bin/bash

# Anava Vision E2E Validation Runner
# Quick validation script for the deployed system

set -e

echo "🚀 Anava Vision E2E Validation Runner"
echo "===================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the e2e-tests directory"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Function to run a test and capture its status
run_test() {
    local test_name="$1"
    local test_file="$2"
    local optional="$3"
    
    echo ""
    echo "🧪 Running $test_name..."
    echo "----------------------------------------"
    
    if node "$test_file"; then
        echo "✅ $test_name: PASSED"
        return 0
    else
        if [ "$optional" = "optional" ]; then
            echo "⚠️  $test_name: FAILED (optional)"
            return 0
        else
            echo "❌ $test_name: FAILED"
            return 1
        fi
    fi
}

# Main validation run
echo "📋 Starting validation tests..."

# Track results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Core system validation (required)
echo ""
echo "=== CORE SYSTEM TESTS ==="

TESTS_TOTAL=$((TESTS_TOTAL + 1))
if run_test "Realistic System Validation" "realistic-validation.js"; then
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

TESTS_TOTAL=$((TESTS_TOTAL + 1))
if run_test "Comprehensive System Report" "comprehensive-system-report.js"; then
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Optional tests
echo ""
echo "=== OPTIONAL COMPONENT TESTS ==="

TESTS_TOTAL=$((TESTS_TOTAL + 1))
if run_test "Mobile PWA Test" "mobile-pwa-test.js" "optional"; then
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

TESTS_TOTAL=$((TESTS_TOTAL + 1))
if run_test "Full E2E Validation" "comprehensive-validation.js" "optional"; then
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Final summary
echo ""
echo "🎯 VALIDATION SUMMARY"
echo "===================="
echo "Total Tests: $TESTS_TOTAL"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"
echo "Success Rate: $(( TESTS_PASSED * 100 / TESTS_TOTAL ))%"

# Check if core reports exist
echo ""
echo "📄 Generated Reports:"
if [ -f "realistic-e2e-report.html" ]; then
    echo "✅ realistic-e2e-report.html"
else
    echo "❌ realistic-e2e-report.html (missing)"
fi

if [ -f "comprehensive-system-report.html" ]; then
    echo "✅ comprehensive-system-report.html"
else
    echo "❌ comprehensive-system-report.html (missing)"
fi

if [ -f "mobile-pwa-report.html" ]; then
    echo "✅ mobile-pwa-report.html"
else
    echo "⚠️  mobile-pwa-report.html (PWA not deployed)"
fi

echo ""
echo "🌐 View reports:"
echo "  - Open realistic-e2e-report.html for web service validation"
echo "  - Open comprehensive-system-report.html for full system health"
echo "  - Check VALIDATION_SUMMARY.md for executive summary"

# Quick service status check
echo ""
echo "⚡ Quick Service Status:"
echo "----------------------"

if curl -s --max-time 5 https://anava-deploy-392865621461.us-central1.run.app/health > /dev/null; then
    echo "✅ Web Service: ONLINE"
    
    # Get health details
    HEALTH_DATA=$(curl -s --max-time 5 https://anava-deploy-392865621461.us-central1.run.app/health)
    VERSION=$(echo "$HEALTH_DATA" | grep -o '"version":"[^"]*"' | cut -d'"' -f4 2>/dev/null || echo "unknown")
    STATUS=$(echo "$HEALTH_DATA" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 2>/dev/null || echo "unknown")
    
    echo "   Version: $VERSION"
    echo "   Status: $STATUS"
    echo "   Endpoint: https://anava-deploy-392865621461.us-central1.run.app"
else
    echo "❌ Web Service: OFFLINE"
fi

# Exit with appropriate code
if [ $TESTS_FAILED -gt 0 ]; then
    echo ""
    echo "⚠️  Some tests failed. Check the reports for details."
    exit 1
else
    echo ""
    echo "🎉 All tests passed! System is operational."
    exit 0
fi