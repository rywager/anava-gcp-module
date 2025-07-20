const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;

// Configuration
const TEST_PROJECT = 'testies123'; // Change this to your test project
const DEPLOYMENT_TIMEOUT = 20 * 60 * 1000; // 20 minutes
const RETRY_COUNT = 3; // Number of times to retry the deployment

// Log file
const LOG_FILE = path.join(__dirname, 'deployment-test-results.log');

async function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage);
  await fs.appendFile(LOG_FILE, logMessage);
}

async function waitForSelector(page, selector, timeout = 30000) {
  try {
    await page.waitForSelector(selector, { visible: true, timeout });
    return true;
  } catch (error) {
    await log(`Failed to find selector: ${selector}`);
    return false;
  }
}

async function takeScreenshot(page, name) {
  const screenshotPath = path.join(__dirname, 'screenshots', `${name}-${Date.now()}.png`);
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await log(`Screenshot saved: ${screenshotPath}`);
}

async function runDeploymentTest(iteration) {
  await log(`\n=== Starting Deployment Test Iteration ${iteration} ===`);
  
  const browser = await puppeteer.launch({
    headless: false, // Set to true for background testing
    devtools: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1200, height: 800 }
  });

  try {
    const page = await browser.newPage();
    
    // Set page timeout to 25 minutes (longer than deployment timeout)
    page.setDefaultTimeout(25 * 60 * 1000);
    
    // Enable console logging
    page.on('console', msg => {
      if (msg.type() === 'log' || msg.type() === 'info') {
        log(`[Browser Console] ${msg.text()}`);
      }
    });
    
    // Monitor for errors
    page.on('error', error => {
      log(`[Page Error] ${error.message}`);
    });
    
    page.on('pageerror', error => {
      log(`[Page Error] ${error.toString()}`);
    });

    // Navigate to the app
    await log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    await takeScreenshot(page, 'initial-load');

    // Wait for the app to load
    await page.waitForTimeout(3000);

    // Check if we're already authenticated
    const isAuthenticated = await page.evaluate(() => {
      return window.localStorage.getItem('gcpTokens') !== null;
    });

    if (!isAuthenticated) {
      await log('Not authenticated, looking for sign-in button...');
      // Click sign in button if not authenticated
      const signInButton = await waitForSelector(page, 'button:has-text("Sign in with Google")');
      if (signInButton) {
        await page.click('button:has-text("Sign in with Google")');
        await log('Clicked sign-in button, waiting for authentication...');
        // Wait for authentication to complete (this would open external browser)
        await page.waitForTimeout(10000);
      }
    } else {
      await log('Already authenticated');
    }

    // Wait for project dropdown
    await log('Waiting for project dropdown...');
    const projectDropdown = await waitForSelector(page, 'div[role="combobox"]', 60000);
    if (!projectDropdown) {
      throw new Error('Project dropdown not found');
    }
    
    await takeScreenshot(page, 'project-selection');

    // Click on the project dropdown
    await page.click('div[role="combobox"]');
    await page.waitForTimeout(1000);

    // Select the test project
    await log(`Selecting project: ${TEST_PROJECT}`);
    const projectOption = await page.$(`li[data-value="${TEST_PROJECT}"]`);
    if (projectOption) {
      await projectOption.click();
    } else {
      // Try typing to search
      await page.type('input', TEST_PROJECT);
      await page.waitForTimeout(1000);
      await page.keyboard.press('Enter');
    }

    // Wait for billing check
    await log('Waiting for billing check to complete...');
    await page.waitForTimeout(5000);
    await takeScreenshot(page, 'billing-checked');

    // Check billing status
    const billingStatus = await page.evaluate(() => {
      const billingText = document.body.innerText;
      return {
        hasBilling: billingText.includes('Billing Active') || billingText.includes('Billing Enabled'),
        hasWarning: billingText.includes('Billing Status Unknown'),
        text: billingText
      };
    });

    await log(`Billing Status: ${JSON.stringify(billingStatus)}`);

    // Skip ACAP deploy (step 3) and go directly to Infrastructure
    await log('Looking for next/continue button to proceed to infrastructure...');
    
    // Click next button multiple times to get to infrastructure step
    for (let i = 0; i < 3; i++) {
      const nextButton = await page.$('button:has-text("Next"), button:has-text("Continue"), button:has-text("Skip")');
      if (nextButton) {
        await nextButton.click();
        await page.waitForTimeout(2000);
        await log(`Clicked next button ${i + 1}`);
      }
    }

    // Look for Deploy Infrastructure button
    await log('Looking for Deploy Infrastructure button...');
    const deployButton = await waitForSelector(page, 'button:has-text("Deploy Infrastructure")', 30000);
    if (!deployButton) {
      await takeScreenshot(page, 'no-deploy-button');
      throw new Error('Deploy Infrastructure button not found');
    }

    // Click Deploy Infrastructure
    await log('Clicking Deploy Infrastructure button...');
    await page.click('button:has-text("Deploy Infrastructure")');
    await takeScreenshot(page, 'deployment-started');

    // Monitor deployment progress
    await log('Monitoring deployment progress...');
    const startTime = Date.now();
    let lastProgress = '';
    
    while ((Date.now() - startTime) < DEPLOYMENT_TIMEOUT) {
      // Check for completion
      const isComplete = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        return bodyText.includes('Deployment Complete') || 
               bodyText.includes('Deployment Successful') ||
               bodyText.includes('Infrastructure Ready');
      });

      if (isComplete) {
        await log('Deployment completed successfully!');
        await takeScreenshot(page, 'deployment-complete');
        break;
      }

      // Check for errors
      const hasError = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        return bodyText.includes('Deployment Failed') || 
               bodyText.includes('Error:') ||
               bodyText.includes('failed');
      });

      if (hasError) {
        await log('Deployment failed with error');
        await takeScreenshot(page, 'deployment-error');
        const errorText = await page.evaluate(() => {
          const errorElements = document.querySelectorAll('[class*="error"], [class*="Error"]');
          return Array.from(errorElements).map(el => el.textContent).join('\n');
        });
        await log(`Error details: ${errorText}`);
        throw new Error('Deployment failed');
      }

      // Log progress
      const currentProgress = await page.evaluate(() => {
        const progressElements = document.querySelectorAll('[class*="progress"], [class*="Progress"]');
        return Array.from(progressElements).map(el => el.textContent).join(' | ');
      });
      
      if (currentProgress !== lastProgress) {
        await log(`Progress: ${currentProgress}`);
        lastProgress = currentProgress;
      }

      // Wait before checking again
      await page.waitForTimeout(5000);
    }

    // Check if we timed out
    if ((Date.now() - startTime) >= DEPLOYMENT_TIMEOUT) {
      await log('Deployment timed out after 20 minutes');
      await takeScreenshot(page, 'deployment-timeout');
      throw new Error('Deployment timeout');
    }

    await log('Deployment test completed successfully!');
    return { success: true, duration: Date.now() - startTime };

  } catch (error) {
    await log(`Test failed: ${error.message}`);
    await takeScreenshot(page, 'test-failure');
    return { success: false, error: error.message };
  } finally {
    await browser.close();
  }
}

async function runTests() {
  await log('=== Starting Automated Deployment Tests ===');
  await log(`Test Project: ${TEST_PROJECT}`);
  await log(`Timeout: ${DEPLOYMENT_TIMEOUT / 1000} seconds`);
  await log(`Retry Count: ${RETRY_COUNT}`);
  
  const results = [];
  
  for (let i = 1; i <= RETRY_COUNT; i++) {
    try {
      const result = await runDeploymentTest(i);
      results.push({ iteration: i, ...result });
      
      if (result.success) {
        await log(`Iteration ${i} succeeded in ${result.duration / 1000} seconds`);
      } else {
        await log(`Iteration ${i} failed: ${result.error}`);
      }
      
      // Wait between tests
      if (i < RETRY_COUNT) {
        await log('Waiting 30 seconds before next test...');
        await new Promise(resolve => setTimeout(resolve, 30000));
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
  
  results.forEach(r => {
    if (r.success) {
      await log(`  Iteration ${r.iteration}: SUCCESS (${r.duration / 1000}s)`);
    } else {
      await log(`  Iteration ${r.iteration}: FAILED - ${r.error}`);
    }
  });
}

// Check if puppeteer is installed
try {
  require.resolve('puppeteer');
} catch (e) {
  console.log('Puppeteer not installed. Installing...');
  require('child_process').execSync('npm install puppeteer', { stdio: 'inherit' });
}

// Run the tests
runTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});