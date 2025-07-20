const fs = require('fs').promises;
const path = require('path');
const log = require('electron-log');

class DeploymentTracker {
  constructor(projectId, solutionPrefix) {
    this.projectId = projectId;
    this.solutionPrefix = solutionPrefix;
    this.manifest = null;
    this.state = {
      projectId,
      solutionPrefix,
      startTime: new Date().toISOString(),
      steps: {},
      currentStep: null,
      completedSteps: [],
      failedSteps: [],
      skippedSteps: []
    };
  }

  async loadManifest() {
    try {
      const manifestPath = path.join(__dirname, '../../deployment-manifest.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      this.manifest = JSON.parse(manifestContent);
      log.info('Deployment manifest loaded successfully');
      return true;
    } catch (error) {
      log.error('Failed to load deployment manifest:', error);
      return false;
    }
  }

  async loadExistingState(stateFile) {
    try {
      const stateContent = await fs.readFile(stateFile, 'utf8');
      const savedState = JSON.parse(stateContent);
      
      // Merge with current state
      this.state = {
        ...this.state,
        ...savedState,
        resumedAt: new Date().toISOString()
      };
      
      log.info(`Resumed deployment from step: ${this.state.currentStep}`);
      return true;
    } catch (error) {
      log.info('No existing state found, starting fresh deployment');
      return false;
    }
  }

  async saveState(stateFile) {
    try {
      await fs.writeFile(stateFile, JSON.stringify(this.state, null, 2));
      log.debug('Deployment state saved');
    } catch (error) {
      log.error('Failed to save deployment state:', error);
    }
  }

  startStep(stepId) {
    const step = this.manifest.deploymentSteps.find(s => s.id === stepId);
    if (!step) {
      log.error(`Unknown step: ${stepId}`);
      return;
    }

    this.state.currentStep = stepId;
    this.state.steps[stepId] = {
      name: step.name,
      startTime: new Date().toISOString(),
      status: 'in_progress'
    };

    log.info(`📍 Starting deployment step: ${step.name}`);
  }

  completeStep(stepId, result = {}) {
    if (!this.state.steps[stepId]) {
      log.error(`Cannot complete unstarted step: ${stepId}`);
      return;
    }

    this.state.steps[stepId] = {
      ...this.state.steps[stepId],
      endTime: new Date().toISOString(),
      status: 'completed',
      result
    };

    this.state.completedSteps.push(stepId);
    log.info(`✅ Completed step: ${this.state.steps[stepId].name}`);
  }

  failStep(stepId, error) {
    if (!this.state.steps[stepId]) {
      log.error(`Cannot fail unstarted step: ${stepId}`);
      return;
    }

    this.state.steps[stepId] = {
      ...this.state.steps[stepId],
      endTime: new Date().toISOString(),
      status: 'failed',
      error: error.message || error
    };

    this.state.failedSteps.push(stepId);
    log.error(`❌ Failed step: ${this.state.steps[stepId].name}`, error);
  }

  skipStep(stepId, reason) {
    const step = this.manifest.deploymentSteps.find(s => s.id === stepId);
    if (!step) return;

    this.state.steps[stepId] = {
      name: step.name,
      status: 'skipped',
      reason,
      skippedAt: new Date().toISOString()
    };

    this.state.skippedSteps.push(stepId);
    log.info(`⏭️  Skipped step: ${step.name} (${reason})`);
  }

  getNextStep() {
    if (!this.manifest) return null;

    const allStepIds = this.manifest.deploymentSteps.map(s => s.id);
    const processedSteps = [
      ...this.state.completedSteps,
      ...this.state.failedSteps,
      ...this.state.skippedSteps
    ];

    for (const stepId of allStepIds) {
      if (!processedSteps.includes(stepId)) {
        return this.manifest.deploymentSteps.find(s => s.id === stepId);
      }
    }

    return null;
  }

  shouldSkipStep(stepId, terraformError) {
    const step = this.manifest.deploymentSteps.find(s => s.id === stepId);
    if (!step) return false;

    // Check if error indicates resource already exists
    if (terraformError && terraformError.includes('already exists')) {
      if (step.canSkipIfExists) {
        log.info(`Resource already exists for step ${stepId}, checking if we can skip...`);
        return true;
      }
    }

    // Check for specific error codes
    if (terraformError) {
      for (const [errorCode, handling] of Object.entries(this.manifest.errorHandling)) {
        if (terraformError.includes(errorCode.replace('_', ' '))) {
          if (handling.action === 'skip_and_continue') {
            log.info(handling.log);
            return true;
          }
        }
      }
    }

    return false;
  }

  generateReport() {
    const duration = new Date() - new Date(this.state.startTime);
    const durationMinutes = Math.floor(duration / 60000);
    const durationSeconds = Math.floor((duration % 60000) / 1000);

    return {
      summary: {
        projectId: this.projectId,
        duration: `${durationMinutes}m ${durationSeconds}s`,
        totalSteps: this.manifest.deploymentSteps.length,
        completedSteps: this.state.completedSteps.length,
        failedSteps: this.state.failedSteps.length,
        skippedSteps: this.state.skippedSteps.length
      },
      steps: this.state.steps,
      nextSteps: this.state.failedSteps.length > 0 ? 
        this.generateRecoverySteps() : [],
      criticalFailures: this.getCriticalFailures()
    };
  }

  getCriticalFailures() {
    return this.state.failedSteps
      .map(stepId => {
        const step = this.manifest.deploymentSteps.find(s => s.id === stepId);
        return step && step.critical ? {
          stepId,
          name: step.name,
          error: this.state.steps[stepId].error
        } : null;
      })
      .filter(Boolean);
  }

  generateRecoverySteps() {
    const steps = [];
    
    // Check if we can continue with partial deployment
    const criticalFailures = this.getCriticalFailures();
    if (criticalFailures.length === 0) {
      steps.push({
        action: 'continue_deployment',
        description: 'Continue with remaining deployment steps',
        command: 'Resume deployment from next unprocessed step'
      });
    }

    // Add specific recovery options based on failures
    for (const failedStepId of this.state.failedSteps) {
      const step = this.manifest.deploymentSteps.find(s => s.id === failedStepId);
      const error = this.state.steps[failedStepId].error;

      if (error && error.includes('already exists') && step.alternativeAction === 'import_existing') {
        steps.push({
          action: 'import_resource',
          stepId: failedStepId,
          description: `Import existing ${step.name}`,
          command: `terraform import ${step.resource} <resource_id>`
        });
      }
    }

    return steps;
  }
}

module.exports = DeploymentTracker;