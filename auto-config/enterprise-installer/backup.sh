#!/bin/bash
#
# Anava Vision Backup Script
# Creates comprehensive backups of all system components
#

set -euo pipefail

# Configuration
BACKUP_DIR="/var/backups/anava-vision"
INSTALL_DIR="/opt/anava-vision"
CONFIG_DIR="/etc/anava-vision"
DATA_DIR="/var/lib/anava-vision"
RETENTION_DAYS=30

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Create backup directory
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/backup_$TIMESTAMP"
mkdir -p "$BACKUP_PATH"

echo "Starting Anava Vision backup..."

# Stop services for consistent backup
echo "Stopping services..."
docker compose -f "$INSTALL_DIR/docker-compose.yml" stop

# Backup database
echo "Backing up database..."
docker compose -f "$INSTALL_DIR/docker-compose.yml" run --rm postgres \
    pg_dump -U anava -d anava_vision > "$BACKUP_PATH/database.sql"

# Backup configurations
echo "Backing up configurations..."
tar -czf "$BACKUP_PATH/configs.tar.gz" \
    "$CONFIG_DIR" \
    "$INSTALL_DIR/.env" \
    "$INSTALL_DIR/docker-compose.yml" \
    "$INSTALL_DIR/docker-compose.override.yml" 2>/dev/null || true

# Backup volumes
echo "Backing up Docker volumes..."
for volume in $(docker volume ls -q | grep anava); do
    docker run --rm \
        -v "$volume":/backup-source:ro \
        -v "$BACKUP_PATH":/backup-target \
        alpine tar -czf "/backup-target/volume_${volume}.tar.gz" -C /backup-source .
done

# Backup camera configurations
echo "Backing up camera data..."
cp -r "$CONFIG_DIR" "$BACKUP_PATH/camera-configs"

# Create backup manifest
cat > "$BACKUP_PATH/manifest.json" << EOF
{
    "timestamp": "$TIMESTAMP",
    "version": "$(docker compose version --short)",
    "hostname": "$(hostname)",
    "components": [
        "database",
        "configurations",
        "volumes",
        "camera-configs"
    ]
}
EOF

# Restart services
echo "Restarting services..."
docker compose -f "$INSTALL_DIR/docker-compose.yml" start

# Create compressed archive
echo "Creating backup archive..."
cd "$BACKUP_DIR"
tar -czf "anava_backup_$TIMESTAMP.tar.gz" "backup_$TIMESTAMP"
rm -rf "$BACKUP_PATH"

# Clean old backups
echo "Cleaning old backups..."
find "$BACKUP_DIR" -name "anava_backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete

# Calculate backup size
BACKUP_SIZE=$(du -h "$BACKUP_DIR/anava_backup_$TIMESTAMP.tar.gz" | cut -f1)

echo -e "${GREEN}Backup completed successfully!${NC}"
echo "Backup location: $BACKUP_DIR/anava_backup_$TIMESTAMP.tar.gz"
echo "Backup size: $BACKUP_SIZE"
echo "Retention: $RETENTION_DAYS days"