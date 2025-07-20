// Simple automated deployment test
// This script runs in the browser console to automate deployment testing

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function log(message) {
  console.log(`[Auto Test ${new Date().toISOString()}] ${message}`);
}

async function runDeploymentTest() {
  try {
    log('Starting automated deployment test...');
    
    // Check authentication
    const authStatus = await window.electronAPI.gcpAPI.getAuthStatus();
    log(`Auth status: ${JSON.stringify(authStatus)}`);
    
    if (!authStatus.isAuthenticated) {
      log('ERROR: Not authenticated. Please sign in first.');
      return;
    }
    
    // Find and click project dropdown
    log('Looking for project dropdown...');
    await sleep(2000);
    
    // Try to find the select element or MUI dropdown
    let dropdown = document.querySelector('div[role="combobox"]') || 
                  document.querySelector('div[role="button"][aria-haspopup="listbox"]') ||
                  document.querySelector('input[type="text"][role="combobox"]')?.parentElement;
    
    if (!dropdown) {
      // Try to find by label
      const labels = Array.from(document.querySelectorAll('label'));
      const projectLabel = labels.find(l => l.textContent.includes('Project'));
      if (projectLabel) {
        dropdown = projectLabel.nextElementSibling || projectLabel.parentElement.querySelector('div[role="combobox"]');
      }
    }
    
    if (dropdown) {
      log('Found dropdown, clicking...');
      dropdown.click();
      await sleep(1000);
      
      // Look for testies123 option
      const options = document.querySelectorAll('li[role="option"], li[data-value]');
      let found = false;
      
      for (const option of options) {
        if (option.textContent.includes('testies123') || option.getAttribute('data-value') === 'testies123') {
          log('Found testies123, clicking...');
          option.click();
          found = true;
          break;
        }
      }
      
      if (!found) {
        log('Project testies123 not found in dropdown');
      }
    } else {
      log('ERROR: Could not find project dropdown');
    }
    
    // Wait for billing check
    log('Waiting for billing check to complete...');
    await sleep(5000);
    
    // Check billing status in UI
    const bodyText = document.body.innerText;
    log(`Billing status shown: ${bodyText.includes('Billing Active') ? 'Active' : 'Unknown'}`);
    
    // Try to proceed through steps
    log('Attempting to navigate to infrastructure deployment...');
    
    for (let i = 0; i < 5; i++) {
      await sleep(2000);
      
      // Find buttons
      const buttons = Array.from(document.querySelectorAll('button'));
      
      // Look for next/continue/skip buttons
      const proceedButton = buttons.find(b => {
        const text = b.textContent.toLowerCase();
        return (text.includes('next') || 
                text.includes('continue') || 
                text.includes('skip') ||
                text.includes('proceed')) &&
               !b.disabled;
      });
      
      if (proceedButton) {
        log(`Clicking button: ${proceedButton.textContent}`);
        proceedButton.click();
        await sleep(2000);
      }
      
      // Check if we've reached the deploy button
      const deployButton = buttons.find(b => 
        b.textContent.includes('Deploy Infrastructure') && !b.disabled
      );
      
      if (deployButton) {
        log('Found Deploy Infrastructure button!');
        log('WARNING: Not clicking deploy button in test mode. Uncomment next line to enable.');
        // deployButton.click(); // UNCOMMENT THIS TO ACTUALLY DEPLOY
        log('Test completed successfully - deployment button is available');
        return;
      }
    }
    
    log('Could not find Deploy Infrastructure button after navigation');
    
  } catch (error) {
    log(`ERROR: ${error.message}`);
    console.error(error);
  }
}

// Run the test
log('=== Automated Deployment Test ===');
log('This test will:');
log('1. Check authentication status');
log('2. Select project testies123');
log('3. Wait for billing check');
log('4. Navigate to deployment screen');
log('5. Verify Deploy Infrastructure button is available');
log('');
log('Starting in 3 seconds...');

setTimeout(runDeploymentTest, 3000);