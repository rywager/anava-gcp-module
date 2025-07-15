# Multi-stage build for both arm64 and amd64
FROM --platform=$BUILDPLATFORM golang:1.21-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git gcc musl-dev

# Set working directory
WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build arguments for cross-compilation
ARG TARGETOS
ARG TARGETARCH

# Build the application
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -ldflags="-w -s" -o edge-gateway main.go

# Final stage - minimal runtime image
FROM alpine:3.19

# Install runtime dependencies
RUN apk add --no-cache ca-certificates tzdata

# Create non-root user
RUN addgroup -g 1000 edge && \
    adduser -u 1000 -G edge -s /bin/sh -D edge

# Copy binary from builder
COPY --from=builder /app/edge-gateway /usr/local/bin/edge-gateway

# Change ownership
RUN chown edge:edge /usr/local/bin/edge-gateway

# Switch to non-root user
USER edge

# Environment variables with defaults
ENV CLOUD_ORCHESTRATOR_URL="wss://orchestrator.example.com/gateway" \
    CAMERA_USERNAME="root" \
    CAMERA_PASSWORD="pass" \
    LOG_LEVEL="info"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD pgrep -f edge-gateway || exit 1

# Run the application
ENTRYPOINT ["/usr/local/bin/edge-gateway"]