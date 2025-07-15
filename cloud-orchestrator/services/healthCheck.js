class HealthCheck {
  constructor(logger, deviceRegistry) {
    this.logger = logger;
    this.deviceRegistry = deviceRegistry;
    this.startTime = new Date();
    this.lastHealthCheck = new Date();
    
    // Start periodic health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000); // 30 seconds
  }
  
  getStatus() {
    const now = new Date();
    const uptime = now - this.startTime;
    const memoryUsage = process.memoryUsage();
    
    const status = {
      status: 'healthy',
      timestamp: now.toISOString(),
      uptime: Math.floor(uptime / 1000), // seconds
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024) // MB
      },
      connections: {
        active: this.deviceRegistry.activeConnections.size,
        devices: Array.from(this.deviceRegistry.activeConnections.keys()).length
      },
      version: process.env.npm_package_version || '1.0.0',
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development'
    };
    
    // Check if system is healthy
    if (memoryUsage.heapUsed > 1024 * 1024 * 1024) { // 1GB
      status.status = 'degraded';
      status.warnings = status.warnings || [];
      status.warnings.push('High memory usage detected');
    }
    
    const timeSinceLastCheck = now - this.lastHealthCheck;
    if (timeSinceLastCheck > 60000) { // 1 minute
      status.status = 'degraded';
      status.warnings = status.warnings || [];
      status.warnings.push('Health check interval exceeded');
    }
    
    return status;
  }
  
  async performHealthCheck() {
    try {
      this.lastHealthCheck = new Date();
      
      // Check Firebase connectivity
      await this.checkFirestore();
      
      // Check Redis connectivity if enabled
      if (this.deviceRegistry.useRedis) {
        await this.checkRedis();
      }
      
      // Log periodic status
      const status = this.getStatus();
      this.logger.info(`Health check completed: ${status.status}, Active connections: ${status.connections.active}`);
      
    } catch (error) {
      this.logger.error('Health check failed:', error);
    }
  }
  
  async checkFirestore() {
    try {
      // Simple read operation to test connectivity
      await this.deviceRegistry.firestore.collection('health-check').limit(1).get();
      return true;
    } catch (error) {
      this.logger.error('Firestore health check failed:', error);
      throw new Error('Firestore connectivity issue');
    }
  }
  
  async checkRedis() {
    try {
      if (this.deviceRegistry.redis) {
        await this.deviceRegistry.redis.ping();
      }
      return true;
    } catch (error) {
      this.logger.error('Redis health check failed:', error);
      throw new Error('Redis connectivity issue');
    }
  }
  
  shutdown() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}

module.exports = HealthCheck;