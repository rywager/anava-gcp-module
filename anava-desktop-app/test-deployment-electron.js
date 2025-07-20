const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs').promises;

// Configuration
const TEST_PROJECT = 'testies123'; // Change this to your test project
const DEPLOYMENT_TIMEOUT = 20 * 60 * 1000; // 20 minutes
const RETRY_COUNT = 3; // Number of times to retry

// Log file
const LOG_FILE = path.join(__dirname, 'deployment-test-electron.log');

async function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage);
  await fs.appendFile(LOG_FILE, logMessage).catch(console.error);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDeploymentTest(mainWindow, iteration) {
  await log(`\n=== Starting Deployment Test Iteration ${iteration} ===`);
  
  try {
    // Execute JavaScript in the renderer to automate the flow
    const result = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const log = (msg) => console.log('[Test Automation] ' + msg);
        
        try {
          log('Starting automated deployment test...');
          
          // Wait for app to load
          await new Promise(r => setTimeout(r, 3000));
          
          // Check if authenticated
          const authStatus = await window.electronAPI.gcpAPI.getAuthStatus();
          log('Auth status: ' + JSON.stringify(authStatus));
          
          if (!authStatus.isAuthenticated) {
            log('Not authenticated, please sign in manually');
            return { success: false, error: 'Not authenticated' };
          }
          
          // Get project list
          log('Getting project list...');
          const projects = await window.electronAPI.gcpAPI.listProjects();
          log('Found ' + projects.length + ' projects');
          
          // Find test project
          const testProject = projects.find(p => p.projectId === '${TEST_PROJECT}');
          if (!testProject) {
            return { success: false, error: 'Test project ${TEST_PROJECT} not found' };
          }
          
          // Select project (this should trigger billing check)
          log('Selecting project: ${TEST_PROJECT}');
          
          // Find and click the dropdown
          const dropdown = document.querySelector('div[role="combobox"]');
          if (dropdown) {
            dropdown.click();
            await new Promise(r => setTimeout(r, 1000));
            
            // Find and click the project option
            const option = document.querySelector('li[data-value="${TEST_PROJECT}"]');
            if (option) {
              option.click();
            }
          }
          
          // Wait for billing check
          log('Waiting for billing check...');
          await new Promise(r => setTimeout(r, 5000));
          
          // Try to proceed to infrastructure deployment
          log('Looking for deploy button...');
          
          // Try to click through steps
          for (let i = 0; i < 5; i++) {
            const buttons = Array.from(document.querySelectorAll('button'));
            const nextButton = buttons.find(b => 
              b.textContent.includes('Next') || 
              b.textContent.includes('Continue') ||
              b.textContent.includes('Skip')
            );
            
            if (nextButton && !nextButton.disabled) {
              log('Clicking: ' + nextButton.textContent);
              nextButton.click();
              await new Promise(r => setTimeout(r, 2000));
            }
          }
          
          // Look for deploy infrastructure button
          const deployButton = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.includes('Deploy Infrastructure'));
          
          if (!deployButton) {
            return { success: false, error: 'Deploy Infrastructure button not found' };
          }
          
          if (deployButton.disabled) {
            return { success: false, error: 'Deploy Infrastructure button is disabled' };
          }
          
          log('Clicking Deploy Infrastructure...');
          deployButton.click();
          
          // Return success - monitoring will continue outside
          return { success: true, deploymentStarted: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `);
    
    await log(`Automation result: ${JSON.stringify(result)}`);
    
    if (!result.success) {
      throw new Error(result.error);
    }
    
    if (result.deploymentStarted) {
      // Monitor deployment progress
      await log('Deployment started, monitoring progress...');
      const startTime = Date.now();
      
      while ((Date.now() - startTime) < DEPLOYMENT_TIMEOUT) {
        const status = await mainWindow.webContents.executeJavaScript(`
          (() => {
            const bodyText = document.body.innerText;
            return {
              isComplete: bodyText.includes('Deployment Complete') || 
                         bodyText.includes('Deployment Successful') ||
                         bodyText.includes('Infrastructure Ready'),
              hasError: bodyText.includes('Deployment Failed') || 
                       bodyText.includes('Error:'),
              progress: Array.from(document.querySelectorAll('[class*="progress"], [class*="Progress"]'))
                       .map(el => el.textContent).join(' | ')
            };
          })();
        `);
        
        if (status.isComplete) {
          await log('Deployment completed successfully!');
          return { success: true, duration: Date.now() - startTime };
        }
        
        if (status.hasError) {
          await log('Deployment failed with error');
          throw new Error('Deployment failed');
        }
        
        await log(`Progress: ${status.progress}`);
        await sleep(10000); // Check every 10 seconds
      }
      
      throw new Error('Deployment timeout after 20 minutes');
    }
    
  } catch (error) {
    await log(`Test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  await app.whenReady();
  
  await log('=== Starting Automated Deployment Tests ===');
  await log(`Test Project: ${TEST_PROJECT}`);
  await log(`Timeout: ${DEPLOYMENT_TIMEOUT / 1000} seconds`);
  await log(`Retry Count: ${RETRY_COUNT}`);
  
  // Create window
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'src/main/preload.js')
    }
  });
  
  // Load the app
  await mainWindow.loadURL('http://localhost:3000');
  
  // Open DevTools for debugging
  mainWindow.webContents.openDevTools();
  
  const results = [];
  
  for (let i = 1; i <= RETRY_COUNT; i++) {
    try {
      const result = await runDeploymentTest(mainWindow, i);
      results.push({ iteration: i, ...result });
      
      if (result.success) {
        await log(`Iteration ${i} succeeded in ${result.duration / 1000} seconds`);
      } else {
        await log(`Iteration ${i} failed: ${result.error}`);
      }
      
      // Wait between tests
      if (i < RETRY_COUNT) {
        await log('Waiting 60 seconds before next test...');
        await sleep(60000);
        
        // Reload page for fresh start
        await mainWindow.reload();
        await sleep(5000);
      }
    } catch (error) {
      await log(`Iteration ${i} crashed: ${error.message}`);
      results.push({ iteration: i, success: false, error: error.message });
    }
  }
  
  // Summary
  await log('\n=== Test Summary ===');
  const successful = results.filter(r => r.success).length;
  await log(`Total Tests: ${RETRY_COUNT}`);
  await log(`Successful: ${successful}`);
  await log(`Failed: ${RETRY_COUNT - successful}`);
  
  // Close window and exit
  mainWindow.close();
  app.quit();
}

// Run tests when app is ready
app.whenReady().then(runTests).catch(error => {
  console.error('Test runner failed:', error);
  app.quit();
});