import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Container,
  Fade,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  LinearProgress,
  IconButton,
  Collapse
} from '@mui/material';
import {
  Google as GoogleIcon,
  Cloud as CloudIcon,
  Check as CheckIcon,
  Warning as WarningIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Security as SecurityIcon,
  Storage as StorageIcon,
  Api as ApiIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  OpenInNew as OpenInNewIcon
} from '@mui/icons-material';
import WorkflowStepper, { WorkflowStep } from './WorkflowStepper';
import StatusBanner from './StatusBanner';
import DeploymentConfigNew from './DeploymentConfigNew';
import SetupGuide from './SetupGuide';
import DeploymentProgress, { DeploymentTask } from './DeploymentProgress';
import ACAPDeploySimple from './ACAPDeploySimple';
import { designTokens } from '../theme';

// Define workflow steps
const WORKFLOW_STEPS: WorkflowStep[] = [
  { label: 'Google Login', estimatedTime: '2 min' },
  { label: 'Project Selection', estimatedTime: '1 min' },
  { label: 'ACAP Deploy', estimatedTime: '5-10 min' },
  { label: 'Infrastructure', estimatedTime: '15-20 min' },
  { label: 'Configure', estimatedTime: '5 min' },
  { label: 'Complete', estimatedTime: '' }
];

interface SetupWizardState {
  currentStep: number;
  isLoadingAuth: boolean;
  isDeploying: boolean;
  isAuthenticated: boolean | null;
  selectedProject: string;
  deploymentProgress: number;
  deploymentTasks: DeploymentTask[];
  error: string | null;
  deploymentSuccess: boolean | null;
  projects: any[];
  user: any | null;
  showLogs: boolean;
  deploymentLogs: string[];
  authError?: boolean;
  existingResourcesError?: boolean;
}

interface DeploymentTask {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  detail?: string;
}

const SetupWizard: React.FC = () => {
  const [state, setState] = useState<SetupWizardState>({
    currentStep: 0,
    isLoadingAuth: true,
    isDeploying: false,
    isAuthenticated: null,
    selectedProject: '',
    deploymentProgress: 0,
    deploymentTasks: [],
    error: null,
    deploymentSuccess: null,
    projects: [],
    user: null,
    showLogs: false,
    deploymentLogs: []
  });

  useEffect(() => {
    initializeApp();
    
    return () => {
      if (window.electronAPI && window.electronAPI.removeAllListeners) {
        window.electronAPI.removeAllListeners('terraform:progress');
        window.electronAPI.removeAllListeners('terraform:error');
        window.electronAPI.removeAllListeners('terraform:complete');
      }
    };
  }, []);

  const initializeApp = async () => {
    try {
      // FIRST check auth status - authentication is required before anything else
      const authStatus = await window.electronAPI.gcpAPI.getAuthStatus();
      
      if (authStatus.isAuthenticated) {
        // User is authenticated, check for existing deployment
        try {
          const [deployedConfig, savedProject, deployedProjectId] = await Promise.all([
            window.electronAPI.terraformAPI.getDeployedConfig(),
            window.electronAPI.store.get('gcpProjectId'),
            window.electronAPI.store.get('deployedProjectId')
          ]);
          
          // Only jump to complete if we have a deployment AND it matches current/saved project
          if (deployedConfig && (savedProject || deployedProjectId)) {
            const projectToUse = savedProject || deployedProjectId;
            
            // Verify the deployment is for the correct project
            if (deployedConfig.firebaseConfig?.projectId === projectToUse) {
              setState(prev => ({ 
                ...prev, 
                isAuthenticated: true, 
                isLoadingAuth: false,
                user: authStatus.user,
                deploymentSuccess: true,
                selectedProject: projectToUse,
                currentStep: 5 // Jump to complete
              }));
              return;
            } else {
              console.log('Deployment found but for different project, starting fresh');
              // Clear mismatched deployment
              await window.electronAPI.store.delete('terraformOutputs');
            }
          }
        } catch (e) {
          console.log('No deployment found, continuing with normal flow');
        }

        // No deployment found, proceed with normal flow
        setState(prev => ({ 
          ...prev, 
          isAuthenticated: true, 
          isLoadingAuth: false,
          user: authStatus.user,
          currentStep: 1 // Move to project selection
        }));

        // Load projects
        try {
          const projectList = await window.electronAPI.gcpAPI.listProjects();
          setState(prev => ({ 
            ...prev, 
            projects: projectList 
          }));
          
          // Check for saved project
          let projectId = await window.electronAPI.store.get('gcpProjectId');
          if (projectId && projectList.find(p => p.projectId === projectId)) {
            setState(prev => ({ 
              ...prev, 
              selectedProject: projectId 
            }));
          }
        } catch (err) {
          console.error('Failed to load projects:', err);
          setState(prev => ({ 
            ...prev, 
            error: 'Failed to load Google Cloud projects' 
          }));
        }
      } else {
        setState(prev => ({ 
          ...prev, 
          isAuthenticated: false, 
          isLoadingAuth: false,
          currentStep: 0
        }));
      }
    } catch (err) {
      setState(prev => ({ 
        ...prev, 
        error: `Initialization failed: ${err}`,
        isLoadingAuth: false 
      }));
    }
  };

  const handleLogin = async () => {
    setState(prev => ({ ...prev, error: null, isLoadingAuth: true }));
    try {
      await window.electronAPI.gcpAPI.login();
      setTimeout(() => initializeApp(), 1000);
    } catch (err) {
      setState(prev => ({ 
        ...prev, 
        error: 'Login failed. Please try running: gcloud auth login',
        isLoadingAuth: false
      }));
    }
  };

  const handleProjectSelect = async (projectId: string) => {
    setState(prev => ({ 
      ...prev, 
      selectedProject: projectId,
      error: null
    }));
    await window.electronAPI.store.set('gcpProjectId', projectId);
    await window.electronAPI.gcpAPI.setProject(projectId);
  };

  const handleNextStep = () => {
    setState(prev => ({ ...prev, currentStep: prev.currentStep + 1 }));
  };

  const handlePreviousStep = () => {
    setState(prev => ({ ...prev, currentStep: Math.max(0, prev.currentStep - 1) }));
  };

  const startDeployment = async () => {
    console.log('Starting deployment for project:', state.selectedProject);
    
    setState(prev => ({ 
      ...prev, 
      isDeploying: true,
      deploymentProgress: 0,
      deploymentTasks: [
        { name: 'Project validation', status: 'running' },
        { name: 'Service accounts', status: 'pending' },
        { name: 'Firebase initialization', status: 'pending' },
        { name: 'API Gateway setup', status: 'pending' },
        { name: 'Security policies', status: 'pending' },
        { name: 'Final validation', status: 'pending' }
      ],
      deploymentLogs: ['Starting Terraform deployment...'],
      error: null 
    }));

    // Setup event listeners
    window.electronAPI.on('terraform:progress', (data) => {
      const log = `${data.stage}: ${data.message}`;
      setState(prev => ({ 
        ...prev, 
        deploymentLogs: [...prev.deploymentLogs, log]
      }));

      // Update task status based on progress
      if (data.type === 'progress' && data.resource) {
        // Update based on actual resource creation
        const resourceMap: { [key: string]: string } = {
          'service_account': 'Service accounts',
          'firebase': 'Firebase initialization',
          'api_gateway': 'API Gateway setup',
          'iam': 'Security policies'
        };
        
        Object.entries(resourceMap).forEach(([key, taskName]) => {
          if (data.resource.toLowerCase().includes(key)) {
            updateTaskStatus(taskName, 'running');
            // Update previous tasks as completed
            const taskIndex = state.deploymentTasks.findIndex(t => t.name === taskName);
            if (taskIndex > 0) {
              state.deploymentTasks.slice(0, taskIndex).forEach(t => {
                if (t.status !== 'completed') {
                  updateTaskStatus(t.name, 'completed');
                }
              });
            }
          }
        });
        
        // Update progress based on task completion
        const completedTasks = state.deploymentTasks.filter(t => t.status === 'completed').length;
        const totalTasks = state.deploymentTasks.length;
        setState(prev => ({ 
          ...prev, 
          deploymentProgress: Math.round((completedTasks / totalTasks) * 100) 
        }));
      } else if (data.stage) {
        // Fallback to stage-based updates
        if (data.stage.includes('validation')) {
          updateTaskStatus('Project validation', 'completed');
          updateTaskStatus('Service accounts', 'running');
          setState(prev => ({ ...prev, deploymentProgress: 20 }));
        } else if (data.stage.includes('service')) {
          updateTaskStatus('Service accounts', 'completed');
          updateTaskStatus('Firebase initialization', 'running');
          setState(prev => ({ ...prev, deploymentProgress: 40 }));
        } else if (data.stage.includes('Firebase')) {
          updateTaskStatus('Firebase initialization', 'completed');
          updateTaskStatus('API Gateway setup', 'running');
          setState(prev => ({ ...prev, deploymentProgress: 60 }));
        } else if (data.stage.includes('API')) {
          updateTaskStatus('API Gateway setup', 'completed');
          updateTaskStatus('Security policies', 'running');
          setState(prev => ({ ...prev, deploymentProgress: 80 }));
        }
      }
    });

    window.electronAPI.on('terraform:error', (error) => {
      console.error('Terraform error received:', error);
      
      // Mark the currently running task as failed
      const runningTask = state.deploymentTasks.find(t => t.status === 'running');
      if (runningTask) {
        updateTaskStatus(runningTask.name, 'failed');
      }
      
      // Handle different error types
      let errorMessage = '';
      let authError = false;
      
      if (typeof error === 'string') {
        errorMessage = `Deployment error: ${error}`;
      } else if (error && typeof error === 'object') {
        errorMessage = `Deployment error: ${error.message || error.toString() || JSON.stringify(error)}`;
      } else {
        errorMessage = 'Deployment error: Unknown error occurred';
      }
      
      // Check if it's an authentication error
      const errorStr = errorMessage.toLowerCase();
      if (errorStr.includes('invalid_grant') || errorStr.includes('invalid_rapt') || errorStr.includes('authentication expired')) {
        authError = true;
        errorMessage = 'Google Cloud authentication expired. This happens when Google requires re-verification for sensitive operations. Please sign in again to continue.';
      }
      
      // Check if resources already exist
      if (errorStr.includes('already exists')) {
        errorMessage = 'Infrastructure resources already exist in this project. You can either use the existing infrastructure or destroy it first before redeploying.';
        // Add special flag for existing resources error
        setState(prev => ({ 
          ...prev, 
          existingResourcesError: true
        }));
      }
      
      setState(prev => ({ 
        ...prev, 
        error: errorMessage,
        isDeploying: false,
        deploymentSuccess: false,
        deploymentLogs: [...prev.deploymentLogs, `ERROR: ${error}`],
        authError
      }));
    });

    window.electronAPI.on('terraform:complete', (data) => {
      console.log('Terraform complete:', data);
      
      if (data.existing) {
        // Using existing infrastructure
        setState(prev => ({ 
          ...prev, 
          deploymentSuccess: true,
          deploymentProgress: 100,
          isDeploying: false,
          deploymentLogs: [...prev.deploymentLogs, 'Using existing infrastructure. Configuration retrieved successfully.']
        }));
      } else {
        updateTaskStatus('Security policies', 'completed');
        updateTaskStatus('Final validation', 'completed');
        setState(prev => ({ 
          ...prev, 
          deploymentSuccess: true,
          deploymentProgress: 100,
          isDeploying: false
        }));
      }
      
      // Auto-advance to next step after short delay
      setTimeout(() => handleNextStep(), 2000);
    });

    try {
      console.log('Calling terraform deploy for project:', state.selectedProject);
      const result = await window.electronAPI.terraformAPI.deploy(state.selectedProject);
      console.log('Deploy result:', result);
      
      if (!result.success) {
        setState(prev => ({ 
          ...prev, 
          error: 'Deployment failed. Check logs for details.',
          deploymentSuccess: false,
          isDeploying: false
        }));
      }
    } catch (err) {
      console.error('Deploy error caught:', err);
      const errorMessage = err instanceof Error ? err.message : 
                          typeof err === 'string' ? err : 
                          JSON.stringify(err);
      setState(prev => ({ 
        ...prev, 
        error: `Deployment error: ${errorMessage}`,
        isDeploying: false,
        deploymentSuccess: false
      }));
    }
  };

  const updateTaskStatus = (taskName: string, status: DeploymentTask['status']) => {
    setState(prev => ({
      ...prev,
      deploymentTasks: prev.deploymentTasks.map(task =>
        task.name === taskName ? { ...task, status } : task
      )
    }));
  };

  // Render step content based on current step
  const renderStepContent = () => {
    switch (state.currentStep) {
      case 0:
        return renderAuthenticationStep();
      case 1:
        return renderProjectSelectionStep();
      case 2:
        return renderACAPDeploymentStep();
      case 3:
        return renderInfrastructureDeploymentStep();
      case 4:
        return renderCameraConfigurationStep();
      case 5:
        return renderCompletionStep();
      default:
        return null;
    }
  };

  const renderAuthenticationStep = () => (
    <Fade in timeout={500}>
      <Box sx={{ maxWidth: 600, mx: 'auto' }}>
        <Card elevation={3}>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="h3" gutterBottom>
                Welcome to Anava
              </Typography>
              <Typography variant="h4" color="primary" gutterBottom>
                Personal Cloud
              </Typography>
            </Box>

            <Box sx={{ my: 4 }}>
              {/* Placeholder for Anava logo */}
              <CloudIcon sx={{ fontSize: 80, color: designTokens.colors.primary.main, mb: 2 }} />
            </Box>

            <Typography variant="body1" sx={{ mb: 4 }}>
              Deploy enterprise-grade camera infrastructure in minutes
            </Typography>

            <Button
              variant="contained"
              size="large"
              fullWidth
              startIcon={<GoogleIcon />}
              onClick={handleLogin}
              disabled={state.isLoadingAuth}
              sx={{
                py: 1.5,
                mb: 3,
                fontSize: 16,
                fontWeight: 500
              }}
            >
              {state.isLoadingAuth ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                'Sign in with Google'
              )}
            </Button>

            <Box sx={{ textAlign: 'left' }}>
              <Typography variant="body2" gutterBottom sx={{ fontWeight: 500 }}>
                Requirements:
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CheckIcon fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText primary="Google Cloud account" />
                </ListItem>
                <ListItem>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CheckIcon fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText primary="Project with billing enabled" />
                </ListItem>
                <ListItem>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CheckIcon fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText primary="15-20 minutes for setup" />
                </ListItem>
              </List>
            </Box>

            {state.error && (
              <StatusBanner
                type="error"
                title="Authentication Error"
                message={state.error}
                action={{
                  label: 'Learn More',
                  onClick: () => console.log('Show help')
                }}
              />
            )}
          </CardContent>
        </Card>
      </Box>
    </Fade>
  );

  const renderProjectSelectionStep = () => {
    const [refreshing, setRefreshing] = React.useState(false);
    
    const handleRefreshProjects = async () => {
      setRefreshing(true);
      try {
        const projects = await window.electronAPI.gcpAPI.listProjects();
        setState(prev => ({ ...prev, projects }));
      } catch (error) {
        console.error('Failed to refresh projects:', error);
      } finally {
        setRefreshing(false);
      }
    };
    
    return (
      <Fade in timeout={500}>
        <Box sx={{ maxWidth: 800, mx: 'auto' }}>
          <Typography variant="h4" gutterBottom>
            Select Your Project
          </Typography>
          <Typography variant="body1" sx={{ mb: 3, color: designTokens.colors.text.secondary }}>
            Choose a Google Cloud project for your Anava Personal Cloud deployment
          </Typography>

          <Card elevation={2}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <FormControl fullWidth>
                    <InputLabel>Google Cloud Project</InputLabel>
                    <Select
                      value={state.selectedProject}
                      onChange={(e) => handleProjectSelect(e.target.value)}
                      displayEmpty
                    >
                      {state.projects.length === 0 && (
                        <MenuItem disabled value="">
                          No projects available
                        </MenuItem>
                      )}
                      {state.projects.map((project) => (
                        <MenuItem key={project.projectId} value={project.projectId}>
                          {project.name} ({project.projectId})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
                <Box sx={{ ml: 2 }}>
                  <IconButton
                    onClick={handleRefreshProjects}
                    disabled={refreshing}
                    title="Refresh projects"
                    sx={{ 
                      border: '1px solid',
                      borderColor: 'divider',
                      '&:hover': {
                        bgcolor: 'action.hover'
                      }
                    }}
                  >
                    {refreshing ? <CircularProgress size={24} /> : <RefreshIcon />}
                  </IconButton>
                </Box>
              </Box>
              
              {/* Create new project section */}
              <Box sx={{ 
                mt: 3, 
                p: 2, 
                bgcolor: designTokens.colors.background.hover,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider'
              }}>
                <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 500 }}>
                  Need a new project?
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => window.open('https://console.cloud.google.com/projectcreate', '_blank')}
                  >
                    Create New Project
                  </Button>
                  <Button
                    variant="text"
                    size="small"
                    startIcon={<OpenInNewIcon />}
                    onClick={() => window.open('https://console.cloud.google.com/billing', '_blank')}
                  >
                    Set Up Billing
                  </Button>
                </Box>
                <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'text.secondary' }}>
                  After creating a project, click the refresh button to see it in the list
                </Typography>
              </Box>

              {state.selectedProject && (
                <Paper sx={{ p: 2, bgcolor: designTokens.colors.background.default, mt: 3 }}>
                  <Typography variant="body2" gutterBottom sx={{ fontWeight: 500 }}>
                    Selected: {state.selectedProject}
                  </Typography>
                  <Box sx={{ mt: 1 }}>
                    <Chip
                      size="small"
                      icon={<CheckIcon />}
                      label="Billing Active"
                      color="success"
                      sx={{ mr: 1 }}
                    />
                    <Chip
                      size="small"
                      icon={<WarningIcon />}
                      label="3 of 5 APIs enabled"
                      color="warning"
                    />
                  </Box>
                  <StatusBanner
                    type="info"
                    title="Required APIs will be enabled automatically during deployment"
                    show={true}
                  />
                </Paper>
              )}
            </CardContent>
          </Card>

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
            <Button
              variant="outlined"
              onClick={handlePreviousStep}
            >
              Previous
            </Button>
            <Button
              variant="contained"
              onClick={handleNextStep}
              disabled={!state.selectedProject}
              endIcon={<CloudIcon />}
            >
              Continue
            </Button>
          </Box>
        </Box>
      </Fade>
    );
  };

  const renderACAPDeploymentStep = () => (
    <Fade in timeout={500}>
      <Box sx={{ maxWidth: 800, mx: 'auto' }}>
        <Typography variant="h4" gutterBottom>
          Deploy Camera Software
        </Typography>
        <Typography variant="body1" sx={{ mb: 3, color: designTokens.colors.text.secondary }}>
          We're scanning your network for Axis cameras and preparing to install Anava software
        </Typography>

        <ACAPDeploySimple />

        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
          <Button
            variant="outlined"
            onClick={handlePreviousStep}
          >
            Previous
          </Button>
          <Button
            variant="contained"
            onClick={handleNextStep}
          >
            Continue to Infrastructure
          </Button>
        </Box>
      </Box>
    </Fade>
  );

  const renderInfrastructureDeploymentStep = () => (
    <Fade in timeout={500}>
      <Box sx={{ maxWidth: 800, mx: 'auto' }}>
        <Typography variant="h4" gutterBottom>
          Building Your Cloud
        </Typography>
        <Typography variant="body1" sx={{ mb: 3, color: designTokens.colors.text.secondary }}>
          Creating your private infrastructure
        </Typography>

        <Card elevation={2}>
          <CardContent sx={{ p: 3 }}>
            {!state.isDeploying && !state.deploymentSuccess && (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Ready to Deploy
                </Typography>
                <Typography variant="body2" sx={{ mb: 3, color: designTokens.colors.text.secondary }}>
                  This will create all necessary infrastructure in your Google Cloud project
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  onClick={startDeployment}
                  startIcon={<CloudIcon />}
                >
                  Deploy Anava Infrastructure
                </Button>
              </Box>
            )}

            {(state.isDeploying || state.deploymentSuccess) && (
              <Box>
                <DeploymentProgress
                  tasks={state.deploymentTasks}
                  overallProgress={state.deploymentProgress}
                  estimatedTimeRemaining={
                    state.isDeploying
                      ? `${Math.max(1, Math.round((100 - state.deploymentProgress) * 0.15))} min`
                      : undefined
                  }
                />

                <Box sx={{ mt: 2 }}>
                  <Button
                    size="small"
                    onClick={() => setState(prev => ({ ...prev, showLogs: !prev.showLogs }))}
                    endIcon={state.showLogs ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  >
                    {state.showLogs ? 'Hide' : 'View'} Logs
                  </Button>
                  <Collapse in={state.showLogs}>
                    <Paper
                      sx={{
                        mt: 1,
                        p: 2,
                        bgcolor: '#1e1e1e',
                        color: '#fff',
                        fontFamily: 'monospace',
                        fontSize: 12,
                        maxHeight: 200,
                        overflow: 'auto'
                      }}
                    >
                      {state.deploymentLogs.map((log, index) => (
                        <div key={index}>{log}</div>
                      ))}
                    </Paper>
                  </Collapse>
                </Box>
              </Box>
            )}

            {state.error && (
              <StatusBanner
                type="error"
                title="Deployment Failed"
                message={state.error}
                action={state.authError ? {
                  label: 'Sign In Again',
                  onClick: async () => {
                    setState(prev => ({ ...prev, error: null, authError: false, isLoadingAuth: true }));
                    try {
                      // Force logout and re-login
                      await window.electronAPI.gcpAPI.logout();
                      await window.electronAPI.gcpAPI.login();
                      // Refresh the page to re-initialize
                      setTimeout(() => {
                        window.location.reload();
                      }, 1000);
                    } catch (err) {
                      setState(prev => ({ 
                        ...prev, 
                        error: 'Failed to re-authenticate. Please try again.',
                        isLoadingAuth: false
                      }));
                    }
                  }
                } : state.existingResourcesError ? {
                  label: 'Use Existing Infrastructure',
                  onClick: () => {
                    // Try to complete with existing resources
                    setState(prev => ({ 
                      ...prev, 
                      error: null, 
                      existingResourcesError: false,
                      deploymentSuccess: true,
                      isDeploying: false
                    }));
                    setTimeout(() => handleNextStep(), 1000);
                  }
                } : {
                  label: 'Retry',
                  onClick: startDeployment
                }}
              />
            )}
          </CardContent>
        </Card>

        {state.deploymentSuccess && (
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              onClick={handleNextStep}
            >
              Continue to Configuration
            </Button>
          </Box>
        )}
      </Box>
    </Fade>
  );

  const renderCameraConfigurationStep = () => (
    <Fade in timeout={500}>
      <Box sx={{ maxWidth: 800, mx: 'auto' }}>
        <Typography variant="h4" gutterBottom>
          Configure Cameras
        </Typography>
        <Typography variant="body1" sx={{ mb: 3, color: designTokens.colors.text.secondary }}>
          Send secure configuration to your cameras
        </Typography>

        <DeploymentConfigNew />

        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
          <Button
            variant="outlined"
            onClick={handlePreviousStep}
          >
            Previous
          </Button>
          <Button
            variant="contained"
            onClick={handleNextStep}
          >
            Complete Setup
          </Button>
        </Box>
      </Box>
    </Fade>
  );

  const renderCompletionStep = () => (
    <Fade in timeout={500}>
      <Box sx={{ maxWidth: 800, mx: 'auto', textAlign: 'center' }}>
        <Box sx={{ mb: 4 }}>
          <CheckIcon sx={{ fontSize: 80, color: designTokens.colors.success }} />
        </Box>
        
        <Typography variant="h3" gutterBottom>
          Setup Complete!
        </Typography>
        <Typography variant="h5" sx={{ mb: 4, color: designTokens.colors.text.secondary }}>
          Your Anava Personal Cloud is ready
        </Typography>

        <Card elevation={2} sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Deployment Summary
            </Typography>
            <List>
              <ListItem>
                <ListItemIcon>
                  <SecurityIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="Security configured"
                  secondary="Authentication and encryption enabled"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <ApiIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="Infrastructure active"
                  secondary="API Gateway and services deployed"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <StorageIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="Data storage ready"
                  secondary="Firebase and cloud storage configured"
                />
              </ListItem>
            </List>
          </CardContent>
        </Card>

        <Card elevation={2}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              What's Next?
            </Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Chat with your cameras - AI-powered insights coming soon
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button variant="contained">
                Open Camera List
              </Button>
              <Button variant="outlined">
                Explore Documentation
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Fade>
  );

  if (state.isLoadingAuth) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <CircularProgress size={48} />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <WorkflowStepper
        currentStep={state.currentStep}
        steps={WORKFLOW_STEPS}
        onStepClick={(step) => setState(prev => ({ ...prev, currentStep: step }))}
      />
      
      <Box sx={{ mt: 4 }}>
        {renderStepContent()}
      </Box>
    </Container>
  );
};

export default SetupWizard;