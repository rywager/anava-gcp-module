#!/bin/bash
#
# Anava Vision Health Check Script
# Comprehensive system health monitoring
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
INSTALL_DIR="/opt/anava-vision"
LOG_FILE="/var/log/anava-vision/health-check.log"

# Health check results
OVERALL_HEALTH="HEALTHY"
ISSUES=()

# Log function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check function with status
check_status() {
    local name=$1
    local status=$2
    local message=$3
    
    if [ "$status" = "OK" ]; then
        echo -e "${GREEN}✓${NC} $name: $message"
    elif [ "$status" = "WARNING" ]; then
        echo -e "${YELLOW}⚠${NC} $name: $message"
        OVERALL_HEALTH="WARNING"
        ISSUES+=("$name: $message")
    else
        echo -e "${RED}✗${NC} $name: $message"
        OVERALL_HEALTH="CRITICAL"
        ISSUES+=("$name: $message")
    fi
}

echo "======================================"
echo "   Anava Vision Health Check"
echo "   $(date)"
echo "======================================"
echo

# Check Docker
echo "Checking Docker Services..."
cd "$INSTALL_DIR"

# Get all services
SERVICES=$(docker compose ps --format json | jq -r '.[].Service')

for service in $SERVICES; do
    STATE=$(docker compose ps --format json | jq -r ".[] | select(.Service==\"$service\") | .State")
    HEALTH=$(docker compose ps --format json | jq -r ".[] | select(.Service==\"$service\") | .Health")
    
    if [[ "$STATE" == "running" ]]; then
        if [[ "$HEALTH" == "healthy" ]] || [[ "$HEALTH" == "" ]]; then
            check_status "Service: $service" "OK" "Running"
        else
            check_status "Service: $service" "WARNING" "Unhealthy"
        fi
    else
        check_status "Service: $service" "CRITICAL" "Not running"
    fi
done

echo

# Check system resources
echo "Checking System Resources..."

# CPU usage
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
CPU_USAGE=${CPU_USAGE%.*}
if [ "$CPU_USAGE" -lt 80 ]; then
    check_status "CPU Usage" "OK" "${CPU_USAGE}%"
elif [ "$CPU_USAGE" -lt 90 ]; then
    check_status "CPU Usage" "WARNING" "${CPU_USAGE}%"
else
    check_status "CPU Usage" "CRITICAL" "${CPU_USAGE}%"
fi

# Memory usage
MEM_USAGE=$(free | grep Mem | awk '{print ($3/$2) * 100.0}')
MEM_USAGE=${MEM_USAGE%.*}
if [ "$MEM_USAGE" -lt 80 ]; then
    check_status "Memory Usage" "OK" "${MEM_USAGE}%"
elif [ "$MEM_USAGE" -lt 90 ]; then
    check_status "Memory Usage" "WARNING" "${MEM_USAGE}%"
else
    check_status "Memory Usage" "CRITICAL" "${MEM_USAGE}%"
fi

# Disk usage
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -lt 80 ]; then
    check_status "Disk Usage" "OK" "${DISK_USAGE}%"
elif [ "$DISK_USAGE" -lt 90 ]; then
    check_status "Disk Usage" "WARNING" "${DISK_USAGE}%"
else
    check_status "Disk Usage" "CRITICAL" "${DISK_USAGE}%"
fi

echo

# Check cameras
echo "Checking Camera Status..."
if [ -f "/etc/anava-vision/cameras.yaml" ]; then
    TOTAL_CAMERAS=$(grep -c "id:" /etc/anava-vision/cameras.yaml || echo "0")
    ONLINE_CAMERAS=$(grep -c "status: online" /etc/anava-vision/cameras.yaml || echo "0")
    
    if [ "$TOTAL_CAMERAS" -eq 0 ]; then
        check_status "Cameras" "WARNING" "No cameras discovered"
    elif [ "$ONLINE_CAMERAS" -eq "$TOTAL_CAMERAS" ]; then
        check_status "Cameras" "OK" "$ONLINE_CAMERAS/$TOTAL_CAMERAS online"
    else
        check_status "Cameras" "WARNING" "$ONLINE_CAMERAS/$TOTAL_CAMERAS online"
    fi
else
    check_status "Cameras" "WARNING" "No camera configuration found"
fi

echo

# Check network connectivity
echo "Checking Network..."
if ping -c 1 google.com &> /dev/null; then
    check_status "Internet Connectivity" "OK" "Connected"
else
    check_status "Internet Connectivity" "CRITICAL" "No internet connection"
fi

# Check SSL certificates
if [ -f "$INSTALL_DIR/traefik/acme.json" ]; then
    CERT_COUNT=$(grep -c "certificate" "$INSTALL_DIR/traefik/acme.json" || echo "0")
    if [ "$CERT_COUNT" -gt 0 ]; then
        check_status "SSL Certificates" "OK" "$CERT_COUNT certificates found"
    else
        check_status "SSL Certificates" "WARNING" "No certificates found"
    fi
else
    check_status "SSL Certificates" "WARNING" "Certificate file not found"
fi

echo

# Check database
echo "Checking Database..."
if docker compose exec -T postgres pg_isready -U anava -d anava_vision &> /dev/null; then
    # Get table count
    TABLE_COUNT=$(docker compose exec -T postgres psql -U anava -d anava_vision -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d ' ')
    check_status "PostgreSQL" "OK" "Running, $TABLE_COUNT tables"
else
    check_status "PostgreSQL" "CRITICAL" "Not responding"
fi

# Check Redis
if docker compose exec -T redis redis-cli ping &> /dev/null; then
    check_status "Redis" "OK" "Running"
else
    check_status "Redis" "CRITICAL" "Not responding"
fi

echo

# Check logs for errors
echo "Checking Logs..."
ERROR_COUNT=0
for service in $SERVICES; do
    ERRORS=$(docker compose logs --tail=100 "$service" 2>&1 | grep -ci "error" || true)
    ERROR_COUNT=$((ERROR_COUNT + ERRORS))
done

if [ "$ERROR_COUNT" -eq 0 ]; then
    check_status "Application Logs" "OK" "No recent errors"
elif [ "$ERROR_COUNT" -lt 10 ]; then
    check_status "Application Logs" "WARNING" "$ERROR_COUNT errors in last 100 lines"
else
    check_status "Application Logs" "CRITICAL" "$ERROR_COUNT errors in last 100 lines"
fi

echo
echo "======================================"
echo "   Overall Health: $OVERALL_HEALTH"
echo "======================================"

if [ ${#ISSUES[@]} -gt 0 ]; then
    echo
    echo "Issues found:"
    for issue in "${ISSUES[@]}"; do
        echo "  - $issue"
    done
fi

echo

# Write health status to file for monitoring
cat > /var/lib/anava-vision/health-status.json << EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "status": "$OVERALL_HEALTH",
    "issues": $(printf '%s\n' "${ISSUES[@]}" | jq -R . | jq -s .),
    "metrics": {
        "cpu_usage": $CPU_USAGE,
        "memory_usage": $MEM_USAGE,
        "disk_usage": $DISK_USAGE,
        "cameras_online": ${ONLINE_CAMERAS:-0},
        "cameras_total": ${TOTAL_CAMERAS:-0},
        "error_count": $ERROR_COUNT
    }
}
EOF

# Exit with appropriate code
if [ "$OVERALL_HEALTH" = "CRITICAL" ]; then
    exit 2
elif [ "$OVERALL_HEALTH" = "WARNING" ]; then
    exit 1
else
    exit 0
fi