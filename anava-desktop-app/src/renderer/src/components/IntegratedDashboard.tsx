import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Button,
  Alert,
  Chip,
  CircularProgress
} from '@mui/material';
import {
  Login as LoginIcon,
  CloudQueue as CloudIcon,
  Videocam as CameraIcon,
  CheckCircle as CheckIcon,
  RadioButtonUnchecked as PendingIcon
} from '@mui/icons-material';

import GCPLogin from './GCPLogin';
import InfrastructureDeployment from './InfrastructureDeployment';
import CameraDiscovery from './CameraDiscovery';
import ACAPDeployment from './ACAPDeployment';

interface SetupStep {
  label: string;
  description: string;
  component: React.ReactNode;
  isComplete: boolean;
}

const IntegratedDashboard: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasInfrastructure, setHasInfrastructure] = useState(false);
  const [selectedProject, setSelectedProject] = useState('');

  useEffect(() => {
    checkStatus();
    
    // Auto-proceed without user interaction
    const autoProgress = async () => {
      try {
        // Auto-check auth
        const authStatus = await window.electronAPI.gcpAPI.getAuthStatus();
        if (authStatus.isAuthenticated) {
          setIsAuthenticated(true);
          setActiveStep(1);
          
          // Auto-select project
          const projectId = await window.electronAPI.store.get('gcpProjectId');
          if (!projectId) {
            await window.electronAPI.store.set('gcpProjectId', 'ryanclean-20241006');
          }
          
          // Auto-proceed to deployment
          setTimeout(() => {
            setActiveStep(2);
          }, 1000);
        }
      } catch (err) {
        console.error('Auto-progress failed:', err);
      }
    };
    
    autoProgress();
  }, []);

  const checkStatus = async () => {
    try {
      // Check authentication
      const authStatus = await window.electronAPI.gcpAPI.getAuthStatus();
      setIsAuthenticated(authStatus.isAuthenticated);
      
      // Check project
      const projectId = await window.electronAPI.store.get('gcpProjectId');
      if (projectId) {
        setSelectedProject(projectId);
      }
      
      // Check infrastructure
      const tfStatus = await window.electronAPI.terraformAPI.getDeploymentStatus();
      setHasInfrastructure(!!tfStatus && !!tfStatus.api_gateway_url);
      
      // Set active step based on status
      if (!authStatus.isAuthenticated) {
        setActiveStep(0);
      } else if (!tfStatus || !tfStatus.api_gateway_url) {
        setActiveStep(1);
      } else {
        setActiveStep(2);
      }
    } catch (err) {
      console.error('Failed to check status:', err);
    }
  };

  const steps: SetupStep[] = [
    {
      label: 'Google Cloud Authentication',
      description: 'Sign in with your Google account to access Google Cloud Platform',
      component: <GCPLogin />,
      isComplete: isAuthenticated
    },
    {
      label: 'Deploy Infrastructure',
      description: 'Deploy the backend infrastructure including API Gateway, Cloud Functions, and Firebase',
      component: <InfrastructureDeployment />,
      isComplete: hasInfrastructure
    },
    {
      label: 'Camera Setup',
      description: 'Discover cameras on your network and deploy the ACAP application',
      component: (
        <Box>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <CameraDiscovery />
            </Grid>
            <Grid item xs={12} md={6}>
              <ACAPDeployment />
            </Grid>
          </Grid>
        </Box>
      ),
      isComplete: false
    }
  ];

  const handleStepClick = (stepIndex: number) => {
    // Only allow navigating to completed steps or the next step
    if (stepIndex <= activeStep + 1 && (stepIndex === 0 || steps[stepIndex - 1].isComplete)) {
      setActiveStep(stepIndex);
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h4" gutterBottom>
        Anava Vision Setup
      </Typography>
      
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="subtitle2">
          Welcome! Follow these steps to set up your Anava Vision system:
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          1. Authenticate with Google Cloud
          2. Deploy the backend infrastructure
          3. Connect and configure your cameras
        </Typography>
      </Alert>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Stepper activeStep={activeStep} orientation="vertical">
          {steps.map((step, index) => (
            <Step key={step.label}>
              <StepLabel
                onClick={() => handleStepClick(index)}
                sx={{ cursor: index <= activeStep + 1 ? 'pointer' : 'default' }}
                StepIconComponent={() => (
                  step.isComplete ? 
                    <CheckIcon color="success" /> : 
                    index === activeStep ? 
                      <CircularProgress size={24} /> : 
                      <PendingIcon color="disabled" />
                )}
              >
                <Box display="flex" alignItems="center" gap={1}>
                  {step.label}
                  {step.isComplete && (
                    <Chip label="Complete" size="small" color="success" />
                  )}
                </Box>
              </StepLabel>
              <StepContent>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                  {step.description}
                </Typography>
                
                <Box sx={{ mb: 4 }}>
                  {step.component}
                </Box>
                
                {index < steps.length - 1 && step.isComplete && (
                  <Button
                    variant="contained"
                    onClick={() => setActiveStep(index + 1)}
                    sx={{ mt: 2 }}
                  >
                    Continue to Next Step
                  </Button>
                )}
              </StepContent>
            </Step>
          ))}
        </Stepper>
      </Box>

      {activeStep === steps.length - 1 && steps.every(s => s.isComplete) && (
        <Card sx={{ mt: 3, bgcolor: 'success.main', color: 'white' }}>
          <CardContent>
            <Box display="flex" alignItems="center" gap={2}>
              <CheckIcon fontSize="large" />
              <Box>
                <Typography variant="h6">
                  Setup Complete!
                </Typography>
                <Typography variant="body2">
                  Your Anava Vision system is fully configured and ready to use.
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default IntegratedDashboard;