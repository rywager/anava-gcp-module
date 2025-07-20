#!/bin/bash
# Generate Helm chart for Anava Vision

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELM_DIR="$SCRIPT_DIR/../helm/anava-vision"

# Create Chart.yaml
cat > "$HELM_DIR/Chart.yaml" <<EOF
apiVersion: v2
name: anava-vision
description: Enterprise-ready AI-powered security camera monitoring system
type: application
version: 2.3.31
appVersion: "2.3.31"
keywords:
  - security
  - ai
  - monitoring
  - cameras
  - websocket
home: https://anava-vision.com
sources:
  - https://github.com/anava-vision/anava-vision
maintainers:
  - name: Anava Vision Team
    email: support@anava-vision.com
dependencies:
  - name: postgresql
    version: "~12.0.0"
    repository: https://charts.bitnami.com/bitnami
    condition: postgresql.enabled
  - name: redis
    version: "~17.0.0"
    repository: https://charts.bitnami.com/bitnami
    condition: redis.enabled
EOF

# Create values.yaml
cat > "$HELM_DIR/values.yaml" <<EOF
# Default values for anava-vision
replicaCount: 3

image:
  repository: gcr.io/anava-vision/anava-vision
  pullPolicy: Always
  tag: ""

imagePullSecrets: []
nameOverride: ""
fullnameOverride: ""

serviceAccount:
  create: true
  annotations: {}
  name: ""

podAnnotations: {}

podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000

securityContext:
  capabilities:
    drop:
    - ALL
  readOnlyRootFilesystem: true
  runAsNonRoot: true
  runAsUser: 1000

service:
  type: ClusterIP
  port: 80

ingress:
  enabled: false
  className: ""
  annotations: {}
  hosts:
    - host: chart-example.local
      paths:
        - path: /
          pathType: ImplementationSpecific
  tls: []

resources:
  limits:
    cpu: 1000m
    memory: 2Gi
  requests:
    cpu: 500m
    memory: 1Gi

autoscaling:
  enabled: false
  minReplicas: 3
  maxReplicas: 100
  targetCPUUtilizationPercentage: 80
  targetMemoryUtilizationPercentage: 80

nodeSelector: {}

tolerations: []

affinity: {}

postgresql:
  enabled: true
  
redis:
  enabled: true
EOF

# Create templates directory
mkdir -p "$HELM_DIR/templates"

# Create deployment template
cat > "$HELM_DIR/templates/deployment.yaml" <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "anava-vision.fullname" . }}
  labels:
    {{- include "anava-vision.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "anava-vision.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      {{- with .Values.podAnnotations }}
      annotations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      labels:
        {{- include "anava-vision.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      serviceAccountName: {{ include "anava-vision.serviceAccountName" . }}
      securityContext:
        {{- toYaml .Values.podSecurityContext | nindent 8 }}
      containers:
        - name: {{ .Chart.Name }}
          securityContext:
            {{- toYaml .Values.securityContext | nindent 12 }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: 8080
              protocol: TCP
          livenessProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/ready
              port: http
            initialDelaySeconds: 10
            periodSeconds: 5
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "anava-vision.fullname" . }}-db
                  key: database-url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "anava-vision.fullname" . }}-redis
                  key: redis-url
            - name: ENVIRONMENT
              value: {{ .Values.global.environment | default "production" }}
          volumeMounts:
            - name: tmp
              mountPath: /tmp
            - name: cache
              mountPath: /app/cache
      volumes:
        - name: tmp
          emptyDir: {}
        - name: cache
          emptyDir: {}
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
EOF

# Create service template
cat > "$HELM_DIR/templates/service.yaml" <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: {{ include "anava-vision.fullname" . }}
  labels:
    {{- include "anava-vision.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "anava-vision.selectorLabels" . | nindent 4 }}
EOF

# Create ingress template
cat > "$HELM_DIR/templates/ingress.yaml" <<'EOF'
{{- if .Values.ingress.enabled -}}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "anava-vision.fullname" . }}
  labels:
    {{- include "anava-vision.labels" . | nindent 4 }}
  {{- with .Values.ingress.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  {{- if .Values.ingress.className }}
  ingressClassName: {{ .Values.ingress.className }}
  {{- end }}
  {{- if .Values.ingress.tls }}
  tls:
    {{- range .Values.ingress.tls }}
    - hosts:
        {{- range .hosts }}
        - {{ . | quote }}
        {{- end }}
      secretName: {{ .secretName }}
    {{- end }}
  {{- end }}
  rules:
    {{- range .Values.ingress.hosts }}
    - host: {{ .host | quote }}
      http:
        paths:
          {{- range .paths }}
          - path: {{ .path }}
            pathType: {{ .pathType }}
            backend:
              service:
                name: {{ include "anava-vision.fullname" $ }}
                port:
                  number: {{ $.Values.service.port }}
          {{- end }}
    {{- end }}
{{- end }}
EOF

# Create HPA template
cat > "$HELM_DIR/templates/hpa.yaml" <<'EOF'
{{- if .Values.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "anava-vision.fullname" . }}
  labels:
    {{- include "anava-vision.labels" . | nindent 4 }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "anava-vision.fullname" . }}
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
  metrics:
    {{- if .Values.autoscaling.targetCPUUtilizationPercentage }}
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetCPUUtilizationPercentage }}
    {{- end }}
    {{- if .Values.autoscaling.targetMemoryUtilizationPercentage }}
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetMemoryUtilizationPercentage }}
    {{- end }}
{{- end }}
EOF

# Create helpers template
cat > "$HELM_DIR/templates/_helpers.tpl" <<'EOF'
{{/*
Expand the name of the chart.
*/}}
{{- define "anava-vision.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "anava-vision.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "anava-vision.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "anava-vision.labels" -}}
helm.sh/chart: {{ include "anava-vision.chart" . }}
{{ include "anava-vision.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "anava-vision.selectorLabels" -}}
app.kubernetes.io/name: {{ include "anava-vision.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "anava-vision.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "anava-vision.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
EOF

# Create ServiceAccount template
cat > "$HELM_DIR/templates/serviceaccount.yaml" <<'EOF'
{{- if .Values.serviceAccount.create -}}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ include "anava-vision.serviceAccountName" . }}
  labels:
    {{- include "anava-vision.labels" . | nindent 4 }}
  {{- with .Values.serviceAccount.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
{{- end }}
EOF

# Create WebSocket deployment template
cat > "$HELM_DIR/templates/websocket-deployment.yaml" <<'EOF'
{{- if .Values.websocket.enabled }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "anava-vision.fullname" . }}-websocket
  labels:
    {{- include "anava-vision.labels" . | nindent 4 }}
    component: websocket
spec:
  {{- if not .Values.websocket.autoscaling.enabled }}
  replicas: {{ .Values.websocket.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "anava-vision.selectorLabels" . | nindent 6 }}
      component: websocket
  template:
    metadata:
      labels:
        {{- include "anava-vision.selectorLabels" . | nindent 8 }}
        component: websocket
    spec:
      serviceAccountName: {{ include "anava-vision.serviceAccountName" . }}
      containers:
        - name: websocket
          image: "{{ .Values.image.repository }}-websocket:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: ws
              containerPort: 8081
              protocol: TCP
          env:
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "anava-vision.fullname" . }}-redis
                  key: redis-url
          livenessProbe:
            tcpSocket:
              port: ws
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            tcpSocket:
              port: ws
            initialDelaySeconds: 5
            periodSeconds: 5
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
{{- end }}
EOF

# Create WebSocket service template
cat > "$HELM_DIR/templates/websocket-service.yaml" <<'EOF'
{{- if .Values.websocket.enabled }}
apiVersion: v1
kind: Service
metadata:
  name: {{ include "anava-vision.fullname" . }}-websocket
  labels:
    {{- include "anava-vision.labels" . | nindent 4 }}
    component: websocket
spec:
  type: ClusterIP
  ports:
    - port: 8081
      targetPort: ws
      protocol: TCP
      name: ws
  selector:
    {{- include "anava-vision.selectorLabels" . | nindent 4 }}
    component: websocket
{{- end }}
EOF

# Create secrets template
cat > "$HELM_DIR/templates/secrets.yaml" <<'EOF'
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "anava-vision.fullname" . }}-db
  labels:
    {{- include "anava-vision.labels" . | nindent 4 }}
type: Opaque
stringData:
  database-url: "postgresql://postgres:{{ .Values.postgresql.auth.postgresPassword }}@{{ include "anava-vision.fullname" . }}-postgresql:5432/{{ .Values.postgresql.auth.database }}"
---
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "anava-vision.fullname" . }}-redis
  labels:
    {{- include "anava-vision.labels" . | nindent 4 }}
type: Opaque
stringData:
  redis-url: "redis://:{{ .Values.redis.auth.password }}@{{ include "anava-vision.fullname" . }}-redis-master:6379"
EOF

# Create NetworkPolicy template
cat > "$HELM_DIR/templates/networkpolicy.yaml" <<'EOF'
{{- if .Values.security.networkPolicies.enabled }}
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ include "anava-vision.fullname" . }}
  labels:
    {{- include "anava-vision.labels" . | nindent 4 }}
spec:
  podSelector:
    matchLabels:
      {{- include "anava-vision.selectorLabels" . | nindent 6 }}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
        - namespaceSelector:
            matchLabels:
              name: {{ .Release.Namespace }}
      ports:
        - protocol: TCP
          port: 8080
        - protocol: TCP
          port: 8081
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              name: {{ .Release.Namespace }}
      ports:
        - protocol: TCP
          port: 5432
        - protocol: TCP
          port: 6379
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 53
        - protocol: UDP
          port: 53
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 169.254.169.254/32
      ports:
        - protocol: TCP
          port: 443
        - protocol: TCP
          port: 80
        - protocol: TCP
          port: 554
        - protocol: TCP
          port: 8999
{{- end }}
EOF

# Create ServiceMonitor template for Prometheus
cat > "$HELM_DIR/templates/servicemonitor.yaml" <<'EOF'
{{- if and .Values.monitoring.enabled .Values.monitoring.serviceMonitor.enabled }}
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: {{ include "anava-vision.fullname" . }}
  labels:
    {{- include "anava-vision.labels" . | nindent 4 }}
spec:
  selector:
    matchLabels:
      {{- include "anava-vision.selectorLabels" . | nindent 6 }}
  endpoints:
    - port: http
      path: /metrics
      interval: {{ .Values.monitoring.serviceMonitor.interval }}
{{- end }}
EOF

# Create PrometheusRule template
cat > "$HELM_DIR/templates/prometheusrule.yaml" <<'EOF'
{{- if and .Values.monitoring.enabled .Values.monitoring.prometheusRule.enabled }}
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: {{ include "anava-vision.fullname" . }}
  labels:
    {{- include "anava-vision.labels" . | nindent 4 }}
spec:
  groups:
    - name: anava-vision.rules
      interval: 30s
      rules:
        - alert: AnavaVisionDown
          expr: up{job="{{ include "anava-vision.fullname" . }}"} == 0
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Anava Vision is down"
            description: "Anava Vision instance {{ $labels.instance }} has been down for more than 5 minutes."
        
        - alert: AnavaVisionHighMemory
          expr: container_memory_usage_bytes{pod=~"{{ include "anava-vision.fullname" . }}.*"} / container_spec_memory_limit_bytes > 0.9
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "High memory usage"
            description: "Pod {{ $labels.pod }} memory usage is above 90%"
        
        - alert: AnavaVisionHighCPU
          expr: rate(container_cpu_usage_seconds_total{pod=~"{{ include "anava-vision.fullname" . }}.*"}[5m]) > 0.8
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "High CPU usage"
            description: "Pod {{ $labels.pod }} CPU usage is above 80%"
        
        - alert: AnavaVisionWebSocketErrors
          expr: rate(anava_vision_websocket_errors_total[5m]) > 10
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "High WebSocket error rate"
            description: "WebSocket error rate is {{ $value }} errors per second"
{{- end }}
EOF

echo "Helm chart generated successfully!"