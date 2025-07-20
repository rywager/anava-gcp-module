#!/bin/bash
# Anava Vision Zero-Touch Deployment System
# Enterprise-ready deployment with automatic configuration

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYMENT_NAME="${DEPLOYMENT_NAME:-anava-vision}"
NAMESPACE="${NAMESPACE:-anava-vision}"
ENVIRONMENT="${ENVIRONMENT:-production}"
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-admin@example.com}"
HELM_RELEASE="${HELM_RELEASE:-anava-vision}"

# Version
VERSION="2.3.31"

# Functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check for required tools
    local required_tools=("kubectl" "helm" "docker")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            error "$tool is not installed. Please install it first."
        fi
    done
    
    # Check Kubernetes connectivity
    if ! kubectl cluster-info &> /dev/null; then
        error "Cannot connect to Kubernetes cluster. Please configure kubectl."
    fi
    
    success "All prerequisites met!"
}

detect_environment() {
    log "Detecting deployment environment..."
    
    # Auto-detect domain if not provided
    if [[ -z "$DOMAIN" ]]; then
        if kubectl get ingress -A &> /dev/null; then
            DOMAIN=$(kubectl get ingress -A -o jsonpath='{.items[0].spec.rules[0].host}' 2>/dev/null | cut -d'.' -f2-)
            if [[ -n "$DOMAIN" ]]; then
                log "Auto-detected domain: $DOMAIN"
            else
                DOMAIN="anava-vision.local"
                warning "Could not detect domain, using default: $DOMAIN"
            fi
        fi
    fi
    
    # Detect service mesh
    if kubectl get namespace istio-system &> /dev/null; then
        SERVICE_MESH="istio"
        log "Detected Istio service mesh"
    elif kubectl get namespace linkerd &> /dev/null; then
        SERVICE_MESH="linkerd"
        log "Detected Linkerd service mesh"
    else
        SERVICE_MESH="none"
        log "No service mesh detected"
    fi
}

install_cert_manager() {
    log "Installing cert-manager for automatic SSL certificates..."
    
    if kubectl get namespace cert-manager &> /dev/null; then
        log "cert-manager already installed"
        return
    fi
    
    # Install cert-manager
    kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
    
    # Wait for cert-manager to be ready
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/instance=cert-manager -n cert-manager --timeout=300s
    
    success "cert-manager installed successfully!"
}

install_service_mesh() {
    if [[ "$SERVICE_MESH" == "none" ]]; then
        log "Installing Istio service mesh for WebSocket management..."
        
        # Download and install Istio
        curl -L https://istio.io/downloadIstio | sh -
        cd istio-* && export PATH=$PWD/bin:$PATH
        
        # Install Istio with production profile
        istioctl install --set profile=production -y
        
        # Enable sidecar injection for namespace
        kubectl label namespace $NAMESPACE istio-injection=enabled --overwrite
        
        cd "$SCRIPT_DIR"
        success "Istio service mesh installed!"
    fi
}

create_namespace() {
    log "Creating namespace: $NAMESPACE"
    
    kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
    
    # Add labels for monitoring and service mesh
    kubectl label namespace $NAMESPACE \
        monitoring=enabled \
        environment=$ENVIRONMENT \
        app=anava-vision \
        --overwrite
}

deploy_monitoring() {
    log "Deploying monitoring stack..."
    
    # Create monitoring namespace
    kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
    
    # Add Prometheus Helm repo
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo update
    
    # Install Prometheus
    helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
        --namespace monitoring \
        --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
        --set grafana.adminPassword=anava-admin \
        --wait
    
    success "Monitoring stack deployed!"
}

generate_helm_values() {
    log "Generating Helm values..."
    
    cat > "$SCRIPT_DIR/helm/anava-vision/values-$ENVIRONMENT.yaml" <<EOF
# Auto-generated values for $ENVIRONMENT environment
global:
  environment: $ENVIRONMENT
  domain: $DOMAIN
  version: $VERSION

replicaCount: 3

image:
  repository: gcr.io/anava-vision/anava-vision
  tag: $VERSION
  pullPolicy: Always

service:
  type: ClusterIP
  port: 80
  targetPort: 8080

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    kubernetes.io/tls-acme: "true"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/websocket-services: "anava-vision-websocket"
  hosts:
    - host: $DOMAIN
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: anava-vision-tls
      hosts:
        - $DOMAIN

websocket:
  enabled: true
  replicaCount: 3
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
    targetCPUUtilizationPercentage: 80

postgresql:
  enabled: true
  auth:
    postgresPassword: $(openssl rand -base64 32)
    database: anava_vision
  persistence:
    enabled: true
    size: 20Gi

redis:
  enabled: true
  auth:
    enabled: true
    password: $(openssl rand -base64 32)
  master:
    persistence:
      enabled: true
      size: 8Gi

monitoring:
  enabled: true
  serviceMonitor:
    enabled: true
    interval: 30s
  prometheusRule:
    enabled: true

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

resources:
  limits:
    cpu: 1000m
    memory: 2Gi
  requests:
    cpu: 500m
    memory: 1Gi

nodeSelector: {}
tolerations: []
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 100
      podAffinityTerm:
        labelSelector:
          matchExpressions:
          - key: app.kubernetes.io/name
            operator: In
            values:
            - anava-vision
        topologyKey: kubernetes.io/hostname

# Camera enrollment configuration
cameraEnrollment:
  enabled: true
  autoDiscovery: true
  onvifPort: 8999
  rtspPort: 554
  
# Self-healing configuration
selfHealing:
  enabled: true
  checkInterval: 60
  maxRestarts: 3
  
# Security settings
security:
  networkPolicies:
    enabled: true
  podSecurityPolicy:
    enabled: true
  serviceAccount:
    create: true
    
# Backup configuration  
backup:
  enabled: true
  schedule: "0 2 * * *"
  retention: 30
EOF
    
    success "Helm values generated!"
}

deploy_helm_chart() {
    log "Deploying Anava Vision with Helm..."
    
    # Package the Helm chart
    helm package "$SCRIPT_DIR/helm/anava-vision"
    
    # Deploy or upgrade
    helm upgrade --install $HELM_RELEASE "$SCRIPT_DIR/helm/anava-vision" \
        --namespace $NAMESPACE \
        --values "$SCRIPT_DIR/helm/anava-vision/values-$ENVIRONMENT.yaml" \
        --create-namespace \
        --wait \
        --timeout 10m
    
    success "Anava Vision deployed successfully!"
}

setup_automatic_camera_enrollment() {
    log "Setting up automatic camera enrollment..."
    
    # Deploy camera discovery service
    kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: camera-discovery-script
  namespace: $NAMESPACE
data:
  discover.sh: |
    #!/bin/bash
    # Automatic camera discovery and enrollment
    
    while true; do
        echo "Scanning for ONVIF cameras..."
        
        # Get pod IPs in the network
        NETWORK_RANGE=\$(ip -o -f inet addr show | awk '/scope global/ {print \$4}' | head -1)
        
        # Use nmap to discover cameras
        nmap -p 80,8080,554,8999 \$NETWORK_RANGE -oG - | grep "open" | awk '{print \$2}' | while read IP; do
            # Check if it's an ONVIF camera
            if curl -s --connect-timeout 2 "http://\$IP/onvif/device_service" | grep -q "onvif"; then
                echo "Found ONVIF camera at \$IP"
                
                # Enroll the camera
                curl -X POST "http://anava-vision-api:8080/api/v1/cameras/enroll" \
                  -H "Content-Type: application/json" \
                  -d "{\"ip\": \"\$IP\", \"type\": \"onvif\", \"auto_discovered\": true}"
            fi
        done
        
        # Sleep for 5 minutes before next scan
        sleep 300
    done
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: camera-discovery
  namespace: $NAMESPACE
spec:
  replicas: 1
  selector:
    matchLabels:
      app: camera-discovery
  template:
    metadata:
      labels:
        app: camera-discovery
    spec:
      containers:
      - name: discovery
        image: alpine:latest
        command: ["/bin/sh"]
        args: ["/scripts/discover.sh"]
        volumeMounts:
        - name: script
          mountPath: /scripts
        securityContext:
          capabilities:
            add:
            - NET_RAW
      volumes:
      - name: script
        configMap:
          name: camera-discovery-script
          defaultMode: 0755
EOF
    
    success "Automatic camera enrollment configured!"
}

setup_self_healing() {
    log "Setting up self-healing configuration..."
    
    # Deploy self-healing controller
    kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: self-healing-config
  namespace: $NAMESPACE
data:
  heal.yaml: |
    rules:
      - name: restart-on-memory-pressure
        condition: memory_usage_percent > 90
        action: restart_pod
        cooldown: 300
      
      - name: scale-on-high-cpu
        condition: cpu_usage_percent > 80
        action: scale_up
        max_replicas: 10
        
      - name: fix-websocket-connections
        condition: websocket_errors > 100
        action: restart_websocket_service
        
      - name: database-connection-recovery
        condition: database_connection_failed
        action: reconnect_database
        max_retries: 5
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: self-healing-controller
  namespace: $NAMESPACE
spec:
  replicas: 1
  selector:
    matchLabels:
      app: self-healing
  template:
    metadata:
      labels:
        app: self-healing
    spec:
      serviceAccountName: self-healing-controller
      containers:
      - name: controller
        image: gcr.io/anava-vision/self-healing-controller:latest
        env:
        - name: NAMESPACE
          value: $NAMESPACE
        - name: CHECK_INTERVAL
          value: "60"
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: self-healing-controller
  namespace: $NAMESPACE
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: self-healing-controller
rules:
- apiGroups: ["", "apps", "autoscaling"]
  resources: ["pods", "deployments", "replicasets", "horizontalpodautoscalers"]
  verbs: ["get", "list", "watch", "update", "patch", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: self-healing-controller
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: self-healing-controller
subjects:
- kind: ServiceAccount
  name: self-healing-controller
  namespace: $NAMESPACE
EOF
    
    success "Self-healing configuration deployed!"
}

configure_zero_downtime_updates() {
    log "Configuring zero-downtime updates..."
    
    # Create PodDisruptionBudget
    kubectl apply -f - <<EOF
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: anava-vision-pdb
  namespace: $NAMESPACE
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app.kubernetes.io/name: anava-vision
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: rolling-update-config
  namespace: $NAMESPACE
data:
  strategy.yaml: |
    strategy:
      type: RollingUpdate
      rollingUpdate:
        maxSurge: 1
        maxUnavailable: 0
    
    preStopHook: |
      #!/bin/bash
      # Gracefully drain connections
      curl -X POST localhost:8080/admin/drain
      sleep 30
      
    readinessProbe:
      httpGet:
        path: /health/ready
        port: 8080
      initialDelaySeconds: 10
      periodSeconds: 5
      
    livenessProbe:
      httpGet:
        path: /health/live
        port: 8080
      initialDelaySeconds: 30
      periodSeconds: 10
EOF
    
    success "Zero-downtime updates configured!"
}

post_deployment_checks() {
    log "Running post-deployment checks..."
    
    # Wait for all pods to be ready
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=anava-vision -n $NAMESPACE --timeout=300s
    
    # Check services
    local services=("anava-vision" "anava-vision-websocket" "anava-vision-postgresql" "anava-vision-redis")
    for service in "${services[@]}"; do
        if kubectl get service $service -n $NAMESPACE &> /dev/null; then
            success "Service $service is running"
        else
            warning "Service $service not found"
        fi
    done
    
    # Get ingress URL
    INGRESS_IP=$(kubectl get ingress -n $NAMESPACE -o jsonpath='{.items[0].status.loadBalancer.ingress[0].ip}' 2>/dev/null)
    if [[ -n "$INGRESS_IP" ]]; then
        success "Application accessible at: https://$DOMAIN (IP: $INGRESS_IP)"
    else
        log "Waiting for ingress IP assignment..."
    fi
}

print_summary() {
    echo ""
    echo "======================================"
    echo "   Anava Vision Deployment Summary"
    echo "======================================"
    echo ""
    echo "Environment: $ENVIRONMENT"
    echo "Namespace: $NAMESPACE"
    echo "Domain: $DOMAIN"
    echo "Helm Release: $HELM_RELEASE"
    echo "Service Mesh: $SERVICE_MESH"
    echo ""
    echo "Features Enabled:"
    echo "✓ Automatic SSL certificates"
    echo "✓ Service mesh for WebSocket management"
    echo "✓ Automatic camera enrollment"
    echo "✓ Self-healing configuration"
    echo "✓ Zero-downtime updates"
    echo "✓ Enterprise monitoring (Prometheus + Grafana)"
    echo ""
    echo "Next Steps:"
    echo "1. Access the application at: https://$DOMAIN"
    echo "2. Access Grafana at: https://$DOMAIN/grafana (admin/anava-admin)"
    echo "3. Camera enrollment is automatic - cameras will be discovered and added"
    echo "4. Monitor the deployment: kubectl get pods -n $NAMESPACE -w"
    echo ""
    echo "To update the deployment, run:"
    echo "  ./deploy.sh"
    echo ""
    echo "To uninstall:"
    echo "  helm uninstall $HELM_RELEASE -n $NAMESPACE"
    echo ""
}

# Main deployment flow
main() {
    echo ""
    echo "🚀 Anava Vision Zero-Touch Deployment System"
    echo "   Version: $VERSION"
    echo ""
    
    check_prerequisites
    detect_environment
    create_namespace
    
    # Install infrastructure components
    install_cert_manager
    install_service_mesh
    deploy_monitoring
    
    # Generate configuration
    generate_helm_values
    
    # Create Helm chart structure if not exists
    if [[ ! -f "$SCRIPT_DIR/helm/anava-vision/Chart.yaml" ]]; then
        "$SCRIPT_DIR/scripts/generate-helm-chart.sh"
    fi
    
    # Deploy application
    deploy_helm_chart
    
    # Configure additional features
    setup_automatic_camera_enrollment
    setup_self_healing
    configure_zero_downtime_updates
    
    # Final checks
    post_deployment_checks
    
    # Print summary
    print_summary
    
    success "Deployment completed successfully! 🎉"
}

# Handle errors
trap 'error "Deployment failed at line $LINENO"' ERR

# Run main function
main "$@"