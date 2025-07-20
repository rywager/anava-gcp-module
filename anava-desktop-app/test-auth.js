// Test if GCP authentication works
const { GCPAuthService } = require('./src/main/services/gcpAuthService');
const Store = require('electron-store');

const store = new Store();
const gcpAuth = new GCPAuthService(store);

async function testAuth() {
  console.log('Testing GCP authentication...');
  
  // Check if we have stored tokens
  const isAuth = await gcpAuth.isAuthenticated();
  console.log('Is authenticated:', isAuth);
  
  if (isAuth) {
    console.log('✅ Already authenticated with stored tokens');
    const user = await gcpAuth.getCurrentUser();
    console.log('Current user:', user);
    
    const projects = await gcpAuth.listProjects();
    console.log('Available projects:', projects.map(p => p.projectId));
  } else {
    console.log('❌ Not authenticated - would need OAuth flow');
  }
}

testAuth().catch(console.error);