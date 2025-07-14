# Multi-stage build for optimized coturn image
FROM alpine:3.19 AS builder

# Install build dependencies
RUN apk add --no-cache \
    gcc \
    g++ \
    make \
    libevent-dev \
    openssl-dev \
    postgresql-dev \
    hiredis-dev \
    sqlite-dev \
    linux-headers \
    git

# Clone and build coturn from source for latest features
RUN git clone https://github.com/coturn/coturn.git /tmp/coturn && \
    cd /tmp/coturn && \
    ./configure --prefix=/usr/local \
        --enable-prometheus \
        --enable-redis \
        --enable-postgresql && \
    make && \
    make install

# Production image
FROM alpine:3.19

# Install runtime dependencies
RUN apk add --no-cache \
    libevent \
    openssl \
    postgresql-libs \
    hiredis \
    sqlite-libs \
    ca-certificates \
    bash \
    gettext \
    curl

# Copy built coturn from builder
COPY --from=builder /usr/local /usr/local

# Create coturn user and directories
RUN adduser -D -s /bin/false coturn && \
    mkdir -p /var/lib/coturn /var/log/coturn /etc/coturn/certs && \
    chown -R coturn:coturn /var/lib/coturn /var/log/coturn /etc/coturn

# Copy configuration template
COPY turnserver.conf /etc/coturn/turnserver.conf.template

# Copy startup script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Generate DH parameters for enhanced security (this takes time, so we do it during build)
RUN openssl dhparam -out /etc/coturn/dhparam.pem 2048

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Expose ports
# STUN/TURN
EXPOSE 3478/tcp 3478/udp
# STUN/TURN over TLS
EXPOSE 5349/tcp 5349/udp
# Alternative ports
EXPOSE 8080/tcp 8080/udp
EXPOSE 8443/tcp 8443/udp
# Relay ports (simplified range for container)
EXPOSE 49152-65535/tcp 49152-65535/udp
# CLI (internal only)
EXPOSE 5766/tcp

# Switch to non-root user
USER coturn

# Set working directory
WORKDIR /var/lib/coturn

# Entry point
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["turnserver", "-c", "/etc/coturn/turnserver.conf"]