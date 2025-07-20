import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Alert,
  LinearProgress,
  Chip,
  Paper,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Collapse,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress
} from '@mui/material';
import {
  RocketLaunch as DeployIcon,
  Check as CheckIcon,
  Error as ErrorIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  ContentCopy as CopyIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';

interface DeploymentStep {
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  message?: string;
}

interface TerraformOutput {
  value: any;
  description?: string;
  sensitive?: boolean;
}

const InfrastructureDeployment: React.FC = () => {
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentComplete, setDeploymentComplete] = useState(false);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<Record<string, TerraformOutput>>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [projectId, setProjectId] = useState('');

  const steps: DeploymentStep[] = [
    { label: 'Validate Authentication', status: 'pending' },
    { label: 'Initialize Terraform', status: 'pending' },
    { label: 'Plan Infrastructure', status: 'pending' },
    { label: 'Deploy Resources', status: 'pending' },
    { label: 'Configure Services', status: 'pending' }
  ];

  const [deploymentSteps, setDeploymentSteps] = useState(steps);
  const [progressPercentage, setProgressPercentage] = useState(0);

  useEffect(() => {
    loadExistingDeployment();

    // Listen for deployment progress
    window.electronAPI.terraformAPI.onProgress((progress) => {
      addLog(progress.data);
      
      if (progress.stage) {
        updateStepStatus(progress.stage);
      }
    });

    window.electronAPI.terraformAPI.onComplete((result) => {
      setDeploymentComplete(true);
      setIsDeploying(false);
      if (result.outputs) {
        setOutputs(result.outputs);
      }
      updateStepStatus('complete');
    });

    window.electronAPI.terraformAPI.onError((error) => {
      setDeploymentError(error);
      setIsDeploying(false);
      updateStepStatus('error');
    });
  }, []);

  const loadExistingDeployment = async () => {
    try {
      const status = await window.electronAPI.terraformAPI.getDeploymentStatus();
      const savedProjectId = await window.electronAPI.store.get('gcpProjectId');
      
      if (status && status.api_gateway_url) {
        setDeploymentComplete(true);
        setOutputs(status);
        setActiveStep(4);
      }
      
      if (savedProjectId) {
        setProjectId(savedProjectId);
      }
    } catch (err) {
      console.error('Failed to load deployment status:', err);
    }
  };

  const updateStepStatus = (stage: string) => {
    const stepMap: Record<string, number> = {
      'auth': 0,      // Validate Authentication
      'init': 1,      // Initialize Terraform
      'plan': 2,      // Plan Infrastructure
      'apply': 3,     // Deploy Resources
      'configure': 4, // Configure Services
      'complete': 5,  // Completion (past all steps)
      'existing': 5,  // Using existing infrastructure
      'destroy': -1   // Special case for destroy
    };

    const stepIndex = stepMap[stage];
    if (stepIndex !== undefined && stepIndex >= 0) {
      setActiveStep(stepIndex);
      
      // Calculate progress percentage based on step
      const totalSteps = steps.length;
      const progressPercent = (stepIndex / totalSteps) * 100;
      setProgressPercentage(progressPercent);
      
      setDeploymentSteps(prev => prev.map((step, index) => ({
        ...step,
        status: index < stepIndex ? 'completed' : 
                index === stepIndex ? 'active' : 
                stage === 'error' && index === stepIndex ? 'error' : 'pending'
      })));
    } else if (stage === 'error') {
      // Mark current step as error
      setDeploymentSteps(prev => prev.map((step, index) => ({
        ...step,
        status: index === activeStep ? 'error' : step.status
      })));
    }
    
    // Set to 100% when complete
    if (stage === 'complete' || stage === 'existing') {
      setProgressPercentage(100);
    }
  };

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleDeploy = async () => {
    try {
      setIsDeploying(true);
      setDeploymentError(null);
      // Don't clear logs, just add to them
      setActiveStep(0);
      setProgressPercentage(0);
      
      addLog('Starting infrastructure deployment...');
      
      const result = await window.electronAPI.terraformAPI.deployInfrastructure(projectId);
      
      if (result.success) {
        addLog('Infrastructure deployed successfully!');
      }
    } catch (err: any) {
      setDeploymentError(err.message || 'Deployment failed');
      addLog(`Error: ${err.message}`);
    }
  };

  const handleDestroy = async () => {
    try {
      setConfirmDialog(false);
      setIsDeploying(true);
      setDeploymentError(null);
      // Don't clear logs, just add to them
      
      addLog('Destroying infrastructure...');
      
      await window.electronAPI.terraformAPI.destroyInfrastructure();
      
      setDeploymentComplete(false);
      setOutputs({});
      setActiveStep(0);
      addLog('Infrastructure destroyed successfully');
    } catch (err: any) {
      setDeploymentError(err.message || 'Destroy failed');
      addLog(`Error: ${err.message}`);
    } finally {
      setIsDeploying(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Infrastructure Deployment
      </Typography>

      {!deploymentComplete && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Deploy the backend infrastructure required for Anava Vision. This includes:
          API Gateway, Cloud Functions, Firebase, and all necessary Google Cloud services.
        </Alert>
      )}

      {deploymentError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {deploymentError}
        </Alert>
      )}

      {!deploymentComplete ? (
        <Card>
          <CardContent>
            <Stepper activeStep={activeStep} orientation="vertical">
              {deploymentSteps.map((step, index) => (
                <Step key={step.label}>
                  <StepLabel
                    error={step.status === 'error'}
                    StepIconComponent={() => 
                      step.status === 'completed' ? <CheckIcon color="success" /> :
                      step.status === 'error' ? <ErrorIcon color="error" /> :
                      step.status === 'active' ? <CircularProgress size={24} /> :
                      <div style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: '#ccc' }} />
                    }
                  >
                    {step.label}
                  </StepLabel>
                  <StepContent>
                    {step.status === 'active' && (
                      <LinearProgress 
                        variant="determinate" 
                        value={progressPercentage} 
                        sx={{ mb: 2 }} 
                      />
                    )}
                    {step.message && (
                      <Typography variant="body2" color="textSecondary">
                        {step.message}
                      </Typography>
                    )}
                  </StepContent>
                </Step>
              ))}
            </Stepper>

            {!isDeploying && activeStep === 0 && (
              <Box mt={4}>
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<DeployIcon />}
                  onClick={handleDeploy}
                  fullWidth
                >
                  Deploy Infrastructure
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>
      ) : (
        <Box>
          <Alert severity="success" sx={{ mb: 3 }}>
            <Typography variant="subtitle1">
              Infrastructure deployed successfully!
            </Typography>
            <Typography variant="body2">
              Your backend is ready. Use the outputs below to configure your applications.
            </Typography>
          </Alert>

          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Deployment Outputs
              </Typography>
              
              <List>
                {Object.entries(outputs).map(([key, output]) => (
                  <ListItem key={key} divider>
                    <ListItemText
                      primary={key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      secondary={
                        output.sensitive ? '••••••••' : 
                        typeof output.value === 'object' ? JSON.stringify(output.value, null, 2) :
                        output.value
                      }
                    />
                    {!output.sensitive && (
                      <IconButton 
                        size="small" 
                        onClick={() => copyToClipboard(
                          typeof output.value === 'object' ? JSON.stringify(output.value) : output.value
                        )}
                      >
                        <CopyIcon />
                      </IconButton>
                    )}
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>

          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setConfirmDialog(true)}
            disabled={isDeploying}
          >
            Destroy Infrastructure
          </Button>
        </Box>
      )}

      <Box mt={3}>
        <Button
          onClick={() => setShowLogs(!showLogs)}
          endIcon={showLogs ? <CollapseIcon /> : <ExpandIcon />}
        >
          {showLogs ? 'Hide' : 'Show'} Deployment Logs
        </Button>
        
        <Collapse in={showLogs}>
          <Paper sx={{ p: 2, mt: 2, bgcolor: 'grey.900', maxHeight: 400, overflow: 'auto' }}>
            <Typography
              component="pre"
              variant="body2"
              sx={{ fontFamily: 'monospace', color: 'grey.100', whiteSpace: 'pre-wrap' }}
            >
              {logs.join('\n')}
            </Typography>
          </Paper>
        </Collapse>
      </Box>

      <Dialog open={confirmDialog} onClose={() => setConfirmDialog(false)}>
        <DialogTitle>Confirm Infrastructure Destruction</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to destroy all deployed infrastructure? 
            This action cannot be undone and will remove all resources from Google Cloud.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(false)}>Cancel</Button>
          <Button onClick={handleDestroy} color="error" variant="contained">
            Yes, Destroy
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default InfrastructureDeployment;