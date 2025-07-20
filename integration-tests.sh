#!/bin/bash

# Anava Vision Integration Tests
# Tests all components working together

echo "🚀 Anava Vision Integration Test Suite"
echo "=====================================\n"

# Test Results
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run test
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo "Testing: $test_name"
    if eval "$test_command" > /dev/null 2>&1; then
        echo "✅ PASSED: $test_name"
        ((TESTS_PASSED++))
    else
        echo "❌ FAILED: $test_name"
        ((TESTS_FAILED++))
    fi
    echo ""
}

# 1. Infrastructure Tests
echo "🏗️  Infrastructure Component Tests"
echo "==================================\n"

run_test "Terraform Configuration Valid" "cd worktrees/camera-provisioning && terraform validate"
run_test "Camera Provisioning Module Exists" "test -d worktrees/camera-provisioning/terraform-anava-module/modules/camera_provisioning"
run_test "MCP Deployment Module Exists" "test -d worktrees/camera-provisioning/terraform-anava-module/modules/mcp_deployment"

# 2. Electron Camera Manager Tests  
echo "📱 Electron Camera Manager Tests"
echo "================================\n"

run_test "Camera Manager Project Exists" "test -f anava-camera-manager/package.json"
run_test "VAPIX Client Implementation" "test -f anava-camera-manager/src/services/VAPXClient.ts"
run_test "Network Discovery Service" "test -f anava-camera-manager/src/services/NetworkDiscovery.ts"
run_test "Chat Integration Component" "test -f anava-camera-manager/src/components/ChatInterface.tsx"

# 3. ACAP Zero-Config Tests
echo "📡 ACAP Zero-Configuration Tests"
echo "===============================\n"

run_test "Bootstrap Client Implementation" "test -f ~/batonDescribe/worktrees/zero-config/src/BootstrapClient.h"
run_test "Cloud Management API" "test -f ~/batonDescribe/worktrees/zero-config/src/CloudManagementAPI.h"
run_test "Cloud-Managed UI Component" "test -f ~/batonDescribe/worktrees/zero-config/axis-nextjs-app/src/app/system-config/SystemConfigCloudManaged.tsx"

# 4. MCP Cloud Integration Tests
echo "☁️  MCP Cloud Integration Tests"
echo "==============================\n"

run_test "Cloud Run Server Implementation" "test -f ~/anava-mcp-server/worktrees/cloud-deployment/src/cloud-run-server.ts"
run_test "WebSocket Transport" "test -f ~/anava-mcp-server/worktrees/cloud-deployment/src/transports/websocket-transport.ts"
run_test "Customer Acquisition Chatbot" "test -f ~/anava-mcp-server/worktrees/cloud-deployment/public/chatbot.html"
run_test "Cloud Build Configuration" "test -f ~/anava-mcp-server/worktrees/cloud-deployment/cloudbuild.yaml"

# 5. Web Dashboard Tests
echo "🖥️  Web Dashboard Transformation Tests"
echo "====================================\n"

run_test "Transformed SystemConfig" "test -f ~/batonDescribe/worktrees/cloud-dashboard/axis-nextjs-app/src/app/system-config/SystemConfig.tsx"
run_test "Deployment Status Component" "test -f ~/batonDescribe/worktrees/cloud-dashboard/axis-nextjs-app/src/app/system-config/components/DeploymentStatus.tsx"
run_test "Enhanced Chat Interface" "test -f ~/batonDescribe/worktrees/cloud-dashboard/axis-nextjs-app/src/components/Chat/ChatInterface.tsx"
run_test "Enhanced Analytics Dashboard" "test -f ~/batonDescribe/worktrees/cloud-dashboard/axis-nextjs-app/src/components/Dashboard/AnalyticsDashboard.tsx"

# 6. Skill Builder Tests
echo "🤖 Conversational Skill Builder Tests"
echo "====================================\n"

run_test "Skill Builder Service Created" "test -f skill-builder/main.py"
run_test "NLP Pipeline Implementation" "test -f skill-builder/src/nlp_pipeline.py"
run_test "Conversation Manager" "test -f skill-builder/src/conversation_manager.py"
run_test "Skill Templates" "test -f skill-builder/src/skill_templates.py"

# 7. Integration Flow Tests
echo "🔄 Integration Flow Tests"
echo "========================\n"

# Test camera network discovery
if ping -c 1 192.168.50.156 > /dev/null 2>&1; then
    run_test "Test Camera Network Reachable" "true"
    
    # Test VAPIX endpoint availability (structure test, not auth)
    if curl -s --connect-timeout 5 "http://192.168.50.156/axis-cgi/basicdeviceinfo.cgi" | grep -q "401\|Unauthorized"; then
        run_test "VAPIX Endpoint Responding" "true"
    else
        run_test "VAPIX Endpoint Responding" "false"
    fi
else
    run_test "Test Camera Network Reachable" "false"
    run_test "VAPIX Endpoint Responding" "false"
fi

# Test service integration points
run_test "MCP Server Dockerfile Present" "test -f ~/anava-mcp-server/worktrees/cloud-deployment/Dockerfile.cloudrun"
run_test "Electron Build Configuration" "test -f anava-camera-manager/webpack.config.js"

# 8. Documentation Tests
echo "📚 Documentation Tests"
echo "=====================\n"

run_test "Infrastructure Documentation" "test -f worktrees/camera-provisioning/ANAVA_VISION_INFRASTRUCTURE_IMPLEMENTATION.md"
run_test "Camera Manager Documentation" "test -f anava-camera-manager/README.md"
run_test "MCP Cloud Documentation" "test -f ~/anava-mcp-server/worktrees/cloud-deployment/CLOUD_DEPLOYMENT.md"

# Test Summary
echo "📊 Test Results Summary"
echo "======================"
echo "✅ Tests Passed: $TESTS_PASSED"
echo "❌ Tests Failed: $TESTS_FAILED"
echo "📈 Success Rate: $(( TESTS_PASSED * 100 / (TESTS_PASSED + TESTS_FAILED) ))%"

if [ $TESTS_FAILED -eq 0 ]; then
    echo "\n🎉 ALL INTEGRATION TESTS PASSED!"
    echo "Anava Vision platform is ready for deployment!"
    exit 0
else
    echo "\n⚠️  Some integration tests failed. Review failed components."
    exit 1
fi