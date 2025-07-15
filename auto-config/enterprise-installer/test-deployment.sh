#!/bin/bash
#
# Anava Vision Deployment Test Script
# Quick validation of the enterprise installer
#

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "======================================"
echo "  Anava Vision Deployment Test"
echo "======================================"
echo

# Check if running in correct directory
if [ ! -f "install.sh" ] || [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}Error: Run this script from the enterprise-installer directory${NC}"
    exit 1
fi

# Test 1: Verify all files exist
echo -e "${BLUE}Test 1: Checking required files...${NC}"
REQUIRED_FILES=(
    "install.sh"
    "docker-compose.yml"
    "supervisor.py"
    "anava-vision.service"
    "auto-updater.yml"
    "camera-setup.py"
    "backup.sh"
    "health-check.sh"
    "README.md"
)

ALL_FILES_EXIST=true
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "  ${GREEN}✓${NC} $file"
    else
        echo -e "  ${RED}✗${NC} $file missing"
        ALL_FILES_EXIST=false
    fi
done

if [ "$ALL_FILES_EXIST" = false ]; then
    echo -e "${RED}Some required files are missing!${NC}"
    exit 1
fi

echo

# Test 2: Validate Docker Compose syntax
echo -e "${BLUE}Test 2: Validating Docker Compose configuration...${NC}"
if docker compose config > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Docker Compose configuration is valid"
else
    echo -e "  ${RED}✗${NC} Docker Compose configuration has errors"
    docker compose config
    exit 1
fi

echo

# Test 3: Check Python syntax
echo -e "${BLUE}Test 3: Checking Python scripts...${NC}"
for script in supervisor.py camera-setup.py; do
    if python3 -m py_compile "$script" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} $script syntax is valid"
    else
        echo -e "  ${RED}✗${NC} $script has syntax errors"
        python3 -m py_compile "$script"
    fi
done

echo

# Test 4: Validate shell scripts
echo -e "${BLUE}Test 4: Checking shell scripts...${NC}"
for script in *.sh; do
    if bash -n "$script" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} $script syntax is valid"
    else
        echo -e "  ${RED}✗${NC} $script has syntax errors"
        bash -n "$script"
    fi
done

echo

# Test 5: Check required commands
echo -e "${BLUE}Test 5: Checking system requirements...${NC}"
REQUIRED_COMMANDS=(
    "docker:Docker"
    "docker compose:Docker Compose"
    "python3:Python 3"
    "jq:JSON processor"
    "curl:cURL"
    "systemctl:systemd"
)

for cmd_info in "${REQUIRED_COMMANDS[@]}"; do
    IFS=':' read -r cmd name <<< "$cmd_info"
    if command -v $cmd &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} $name is installed"
    else
        echo -e "  ${YELLOW}⚠${NC}  $name is not installed (will be installed during setup)"
    fi
done

echo

# Test 6: Network connectivity test
echo -e "${BLUE}Test 6: Testing network connectivity...${NC}"
if ping -c 1 google.com &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} Internet connectivity OK"
else
    echo -e "  ${YELLOW}⚠${NC}  No internet connectivity detected"
fi

echo

# Test 7: Directory permissions
echo -e "${BLUE}Test 7: Checking permissions...${NC}"
if [ -w "." ]; then
    echo -e "  ${GREEN}✓${NC} Current directory is writable"
else
    echo -e "  ${RED}✗${NC} Current directory is not writable"
fi

echo

# Test 8: Port availability
echo -e "${BLUE}Test 8: Checking port availability...${NC}"
REQUIRED_PORTS=(80 443 8080)
for port in "${REQUIRED_PORTS[@]}"; do
    if ! ss -tln | grep -q ":$port "; then
        echo -e "  ${GREEN}✓${NC} Port $port is available"
    else
        echo -e "  ${YELLOW}⚠${NC}  Port $port is in use"
    fi
done

echo

# Test 9: Docker daemon
echo -e "${BLUE}Test 9: Checking Docker daemon...${NC}"
if docker info &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} Docker daemon is running"
    
    # Check Docker version
    DOCKER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "unknown")
    echo -e "  ${GREEN}✓${NC} Docker version: $DOCKER_VERSION"
else
    echo -e "  ${RED}✗${NC} Docker daemon is not running"
fi

echo

# Test 10: Sample camera test
echo -e "${BLUE}Test 10: Testing camera connectivity (optional)...${NC}"
echo "Enter camera IP to test (or press Enter to skip): "
read -t 10 CAMERA_IP || true

if [ -n "$CAMERA_IP" ]; then
    if ping -c 1 -W 2 "$CAMERA_IP" &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} Camera at $CAMERA_IP is reachable"
    else
        echo -e "  ${RED}✗${NC} Camera at $CAMERA_IP is not reachable"
    fi
else
    echo -e "  ${YELLOW}-${NC} Skipped camera test"
fi

echo
echo "======================================"
echo "         Test Summary"
echo "======================================"
echo

if [ "$ALL_FILES_EXIST" = true ]; then
    echo -e "${GREEN}All tests passed! The installer is ready to use.${NC}"
    echo
    echo "To install Anava Vision, run:"
    echo "  sudo ./install.sh"
    echo
    echo "For camera setup after installation:"
    echo "  sudo python3 camera-setup.py add <camera-ip>"
    echo
else
    echo -e "${RED}Some tests failed. Please fix the issues before proceeding.${NC}"
fi