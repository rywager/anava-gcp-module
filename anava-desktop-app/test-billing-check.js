// Test billing check repeatedly
// Run this in the Electron DevTools console

async function testBillingCheck(projectId = 'testies123') {
    console.log(`\n🧪 Testing billing check for project: ${projectId}`);
    console.log('-------------------------------------------');
    
    try {
        // Check current auth status
        const authStatus = await window.electronAPI.gcpAPI.getAuthStatus();
        console.log('✓ Auth status:', authStatus.isAuthenticated ? 'Authenticated' : 'Not authenticated');
        
        if (!authStatus.isAuthenticated) {
            console.error('❌ Not authenticated! Please sign in first.');
            return;
        }
        
        // Time the billing check
        console.log(`⏱️  Starting billing check at ${new Date().toLocaleTimeString()}...`);
        const startTime = Date.now();
        
        // Run billing check
        const billingResult = await window.electronAPI.gcpAPI.checkBilling(projectId);
        
        const duration = Date.now() - startTime;
        console.log(`⏱️  Billing check completed in ${duration}ms`);
        
        // Display results
        console.log('📊 Billing Check Result:');
        console.log('  - Enabled:', billingResult.enabled ? '✅ YES' : '❌ NO');
        console.log('  - Method:', billingResult.method || 'unknown');
        if (billingResult.error) {
            console.log('  - Error:', billingResult.error);
        }
        if (billingResult.requiresManualCheck) {
            console.log('  - ⚠️  Requires manual verification');
        }
        
        return billingResult;
        
    } catch (error) {
        console.error('❌ Billing check failed:', error.message);
        return { error: error.message };
    }
}

// Function to run multiple tests
async function runBillingTests(projects = ['testies123', 'ryanwillfinishthis'], iterations = 3) {
    console.log('🚀 Starting Billing Check Test Suite');
    console.log(`📋 Projects to test: ${projects.join(', ')}`);
    console.log(`🔄 Iterations per project: ${iterations}`);
    console.log('=====================================\n');
    
    const results = [];
    
    for (const project of projects) {
        for (let i = 1; i <= iterations; i++) {
            console.log(`\n📍 Test ${i}/${iterations} for project: ${project}`);
            
            const result = await testBillingCheck(project);
            results.push({
                project,
                iteration: i,
                timestamp: new Date().toISOString(),
                ...result
            });
            
            // Wait between tests
            if (i < iterations) {
                console.log('⏳ Waiting 3 seconds before next test...');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
    }
    
    // Summary
    console.log('\n\n📊 TEST SUMMARY');
    console.log('=====================================');
    console.log(`Total tests run: ${results.length}`);
    console.log(`Successful: ${results.filter(r => r.enabled).length}`);
    console.log(`Failed: ${results.filter(r => r.error).length}`);
    console.log(`Requires manual check: ${results.filter(r => r.requiresManualCheck).length}`);
    
    // Detailed results
    console.log('\nDetailed Results:');
    console.table(results.map(r => ({
        Project: r.project,
        Iteration: r.iteration,
        Enabled: r.enabled ? '✅' : '❌',
        Method: r.method || '-',
        Error: r.error || '-',
        Time: new Date(r.timestamp).toLocaleTimeString()
    })));
    
    return results;
}

// Quick test for single project
console.log('🎯 Billing Check Test Tool Ready!');
console.log('Usage:');
console.log('  - testBillingCheck("project-id")     // Test single project');
console.log('  - runBillingTests()                  // Test multiple projects');
console.log('  - runBillingTests(["proj1"], 10)    // Test one project 10 times');

// Auto-run a single test
testBillingCheck('testies123');