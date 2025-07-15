.PHONY: build build-docker build-multi run clean test lint format deps help

# Variables
APP_NAME := edge-gateway
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
GOVERSION := $(shell go version | cut -d' ' -f3)

# Go build flags
LDFLAGS := -ldflags="-w -s -X main.Version=$(VERSION) -X main.BuildTime=$(BUILD_TIME) -X main.GoVersion=$(GOVERSION)"

# Docker settings
DOCKER_IMAGE := $(APP_NAME)
DOCKER_TAG := $(VERSION)
PLATFORMS := linux/amd64,linux/arm64

help: ## Show this help message
	@echo "Edge Gateway Build System"
	@echo ""
	@echo "Available commands:"
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

deps: ## Download dependencies
	@echo "Downloading dependencies..."
	go mod download
	go mod tidy

format: ## Format Go code
	@echo "Formatting code..."
	go fmt ./...
	goimports -w .

lint: ## Run linters
	@echo "Running linters..."
	golangci-lint run ./...

test: ## Run tests
	@echo "Running tests..."
	go test -v -race -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html

build: deps ## Build binary for current platform
	@echo "Building $(APP_NAME) for current platform..."
	CGO_ENABLED=0 go build $(LDFLAGS) -o bin/$(APP_NAME) main.go

build-linux: deps ## Build binary for Linux AMD64
	@echo "Building $(APP_NAME) for Linux AMD64..."
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o bin/$(APP_NAME)-linux-amd64 main.go

build-arm64: deps ## Build binary for Linux ARM64
	@echo "Building $(APP_NAME) for Linux ARM64..."
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build $(LDFLAGS) -o bin/$(APP_NAME)-linux-arm64 main.go

build-all: build-linux build-arm64 ## Build binaries for all platforms

build-docker: ## Build Docker image for current platform
	@echo "Building Docker image..."
	docker build -t $(DOCKER_IMAGE):$(DOCKER_TAG) .
	docker tag $(DOCKER_IMAGE):$(DOCKER_TAG) $(DOCKER_IMAGE):latest

build-multi: ## Build multi-platform Docker image
	@echo "Building multi-platform Docker image..."
	docker buildx create --use --name multibuilder || true
	docker buildx build --platform $(PLATFORMS) -t $(DOCKER_IMAGE):$(DOCKER_TAG) -t $(DOCKER_IMAGE):latest .

push-multi: build-multi ## Build and push multi-platform Docker image
	@echo "Building and pushing multi-platform Docker image..."
	docker buildx build --platform $(PLATFORMS) -t $(DOCKER_IMAGE):$(DOCKER_TAG) -t $(DOCKER_IMAGE):latest --push .

run: build ## Run the application locally
	@echo "Running $(APP_NAME)..."
	./bin/$(APP_NAME)

run-docker: ## Run with Docker Compose
	@echo "Starting with Docker Compose..."
	docker-compose up -d

stop-docker: ## Stop Docker Compose
	@echo "Stopping Docker Compose..."
	docker-compose down

logs: ## View Docker logs
	docker-compose logs -f edge-gateway

clean: ## Clean build artifacts
	@echo "Cleaning build artifacts..."
	rm -rf bin/
	rm -f coverage.out coverage.html
	docker-compose down --rmi local --volumes --remove-orphans 2>/dev/null || true

release: build-all build-multi ## Build release artifacts
	@echo "Creating release artifacts..."
	mkdir -p release
	cp bin/$(APP_NAME)-linux-amd64 release/
	cp bin/$(APP_NAME)-linux-arm64 release/
	cp docker-compose.yml release/
	cp .env.example release/
	cp README.md release/
	cd release && tar -czf $(APP_NAME)-$(VERSION).tar.gz *

install-tools: ## Install development tools
	@echo "Installing development tools..."
	go install golang.org/x/tools/cmd/goimports@latest
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

dev-setup: install-tools deps ## Setup development environment
	@echo "Setting up development environment..."
	cp .env.example .env
	@echo "Development environment ready!"
	@echo "Please edit .env file with your configuration"

check-env: ## Check if .env file exists
	@if [ ! -f .env ]; then \
		echo "Warning: .env file not found. Creating from example..."; \
		cp .env.example .env; \
		echo "Please edit .env file with your configuration"; \
	fi

deploy: check-env build-docker run-docker ## Deploy locally with Docker

undeploy: stop-docker clean ## Stop and clean everything

status: ## Show service status
	@echo "=== Docker Compose Status ==="
	docker-compose ps
	@echo ""
	@echo "=== Container Logs (last 20 lines) ==="
	docker-compose logs --tail=20 edge-gateway 2>/dev/null || echo "Service not running"

monitor: ## Monitor service in real-time
	@echo "Monitoring $(APP_NAME)... (Press Ctrl+C to stop)"
	watch -n 2 'docker-compose ps && echo "" && docker-compose logs --tail=10 edge-gateway'

benchmark: ## Run performance benchmarks
	@echo "Running benchmarks..."
	go test -bench=. -benchmem ./...

security-scan: ## Run security scan
	@echo "Running security scan..."
	gosec ./...

docker-scan: build-docker ## Scan Docker image for vulnerabilities
	@echo "Scanning Docker image for vulnerabilities..."
	docker scout cves $(DOCKER_IMAGE):$(DOCKER_TAG)

version: ## Show version information
	@echo "Version: $(VERSION)"
	@echo "Build Time: $(BUILD_TIME)"
	@echo "Go Version: $(GOVERSION)"