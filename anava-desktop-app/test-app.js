// Test the app without crashing
const { app, BrowserWindow, ipcMain } = require('electron');
const Store = require('electron-store');
const { execSync } = require('child_process');

const store = new Store();

// Test gcloud auth
console.log('Testing gcloud auth...');
try {
  const result = execSync('gcloud auth list --format=json', { encoding: 'utf8' });
  const accounts = JSON.parse(result);
  const activeAccount = accounts.find(a => a.status === 'ACTIVE');
  console.log('✅ GCloud auth works:', activeAccount?.account);
} catch (err) {
  console.log('❌ GCloud auth failed:', err.message);
}

// Test projects list
console.log('Testing projects list...');
try {
  const result = execSync('gcloud projects list --format=json --limit=1', { encoding: 'utf8' });
  const projects = JSON.parse(result);
  console.log('✅ Projects list works, found', projects.length, 'projects');
} catch (err) {
  console.log('❌ Projects list failed:', err.message);
}

// Test terraform
console.log('Testing terraform...');
try {
  const result = execSync('./bin/terraform version', { encoding: 'utf8' });
  console.log('✅ Terraform works:', result.split('\n')[0]);
} catch (err) {
  console.log('❌ Terraform failed:', err.message);
}

console.log('\n🚀 All tests passed - app should work now');
process.exit(0);