const http = require('http');

describe('Cloud Orchestrator Health Check', () => {
  const PORT = process.env.PORT || 8080;
  const HOST = 'localhost';
  
  test('Health endpoint should return 200', (done) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: '/health',
      method: 'GET'
    };
    
    const req = http.request(options, (res) => {
      expect(res.statusCode).toBe(200);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const health = JSON.parse(data);
        expect(health.status).toBeDefined();
        expect(health.timestamp).toBeDefined();
        expect(health.uptime).toBeDefined();
        done();
      });
    });
    
    req.on('error', (error) => {
      done(error);
    });
    
    req.end();
  });
});