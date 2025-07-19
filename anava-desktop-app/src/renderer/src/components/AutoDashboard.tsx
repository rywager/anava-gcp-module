import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  LinearProgress,
  Paper,
  Grid,
  CircularProgress,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import DeploymentConfig from './DeploymentConfig';
import SetupGuide from './SetupGuide';
import GoogleIcon from '@mui/icons-material/Google';
import CloudIcon from '@mui/icons-material/Cloud';
import WarningIcon from '@mui/icons-material/Warning';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';

interface AppState {
  isLoadingAuth: boolean;
  isDeploying: boolean;
  isAuthenticated: boolean | null;
  selectedProject: string;
  deploymentLogs: string[];
  error: string | null;
  deploymentSuccess: boolean | null;
  projects: any[];
  user: any | null;
  showBillingError: boolean;
}

const AutoDashboard: React.FC = () => {
  const [state, setState] = useState<AppState>({
    isLoadingAuth: true,
    isDeploying: false,
    isAuthenticated: null,
    selectedProject: '',
    deploymentLogs: [],
    error: null,
    deploymentSuccess: null,
    projects: [],
    user: null,
    showBillingError: false
  });
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    initializeApp();
    
    // Cleanup event listeners on unmount
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
      // Check for existing deployment first
      try {
        const deployedConfig = await window.electronAPI.terraformAPI.getDeployedConfig();
        if (deployedConfig) {
          // Check if user wants to keep existing deployment
          const savedProject = await window.electronAPI.store.get('gcpProjectId');
          if (savedProject) {
            setState(prev => ({ 
              ...prev, 
              isAuthenticated: true, 
              isLoadingAuth: false,
              deploymentSuccess: true,
              selectedProject: savedProject
            }));
            addLog('✅ Found existing Terraform deployment');
            setActiveTab(1); // Switch to Configuration tab
            return;
          }
        }
      } catch (e) {
        console.log('No deployment found, continuing...');
      }

      // Check auth status - actual GCP authentication
      const authStatus = await window.electronAPI.gcpAPI.getAuthStatus();
      
      if (authStatus.isAuthenticated) {
        setState(prev => ({ 
          ...prev, 
          isAuthenticated: true, 
          isLoadingAuth: false,
          user: authStatus.user
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
          } else if (projectList.length > 0) {
            // No saved project, don't auto-select
            addLog('Please select a Google Cloud project to continue');
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
          error: 'Not authenticated with GCP. Run: gcloud auth login'
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

  const startDeployment = async (projectId: string) => {
    setState(prev => ({ 
      ...prev, 
      isDeploying: true, 
      deploymentLogs: ['🚀 Starting Terraform deployment...'],
      error: null 
    }));

    // Listen for real-time progress updates
    window.electronAPI.on('terraform:progress', (data) => {
      // Handle both formats: {stage, message} and {type, data}
      if (data.stage && data.message) {
        addLog(`📝 ${data.stage}: ${data.message}`);
      } else if (data.type && data.data) {
        // Format terraform output properly
        const logMessage = data.data.trim();
        if (logMessage && logMessage !== 'undefined') {
          if (data.type === 'progress') {
            addLog(`🔧 ${data.resource || 'Resource'} ${data.action || 'processing'}...`);
          } else if (data.type === 'stderr' && !logMessage.includes('[INFO]') && !logMessage.includes('[DEBUG]')) {
            addLog(`⚠️  ${logMessage}`);
          } else if (data.type === 'stdout') {
            addLog(`📋 ${logMessage}`);
          }
        }
      }
    });

    window.electronAPI.on('terraform:error', (error) => {
      // Check if it's a billing error
      const errorMessage = typeof error === 'string' ? error : error.message || 'Unknown error';
      const isBillingError = errorMessage.includes('Billing is not enabled') || 
                             errorMessage.includes('Billing account') ||
                             errorMessage.includes('billing must be enabled');
      
      setState(prev => ({ 
        ...prev, 
        error: errorMessage,
        isDeploying: false,
        deploymentSuccess: false,
        showBillingError: isBillingError
      }));
    });

    window.electronAPI.on('terraform:complete', (data) => {
      setState(prev => ({ 
        ...prev, 
        deploymentSuccess: true,
        deploymentLogs: [...prev.deploymentLogs, '✅ Deployment completed successfully!'],
        isDeploying: false
      }));
    });

    try {
      const result = await window.electronAPI.terraformAPI.deploy(projectId);
      
      if (!result.success) {
        setState(prev => ({ 
          ...prev, 
          error: 'Deployment failed. Check logs above.',
          deploymentSuccess: false,
          isDeploying: false
        }));
      }
    } catch (err) {
      setState(prev => ({ 
        ...prev, 
        error: `Deployment error: ${err}`,
        isDeploying: false,
        deploymentSuccess: false
      }));
    }
  };

  const addLog = (message: string) => {
    setState(prev => ({ 
      ...prev, 
      deploymentLogs: [...prev.deploymentLogs, message]
    }));
  };

  const handleProjectSelect = async (projectId: string) => {
    setState(prev => ({ 
      ...prev, 
      selectedProject: projectId,
      error: null,
      showBillingError: false,
      deploymentSuccess: null
    }));
    await window.electronAPI.store.set('gcpProjectId', projectId);
    await window.electronAPI.gcpAPI.setProject(projectId);
    addLog(`Selected project: ${projectId}`);
  };

  const handleLogin = async () => {
    setState(prev => ({ ...prev, error: null }));
    try {
      await window.electronAPI.gcpAPI.login();
      // Re-initialize after login
      setTimeout(() => initializeApp(), 1000);
    } catch (err) {
      setState(prev => ({ 
        ...prev, 
        error: 'Login failed. Please try running: gcloud auth login'
      }));
    }
  };

  const handleReset = async () => {
    if (window.confirm('This will clear the stored project and deployment data. Continue?')) {
      // Clear stored data
      await window.electronAPI.store.set('gcpProjectId', null);
      await window.electronAPI.store.set('terraformOutputs', null);
      
      // Reset state
      setState({
        isLoadingAuth: true,
        isDeploying: false,
        isAuthenticated: null,
        selectedProject: '',
        deploymentLogs: [],
        error: null,
        deploymentSuccess: null,
        projects: [],
        user: null
      });
      
      // Re-initialize
      setTimeout(() => initializeApp(), 100);
    }
  };

  if (state.isLoadingAuth) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Checking authentication...</Typography>
      </Box>
    );
  }

  // Show authentication screen if not authenticated
  if (state.isAuthenticated === false) {
    return (
      <Box sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
        <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <GoogleIcon /> Google Cloud Authentication
        </Typography>
        
        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Authentication Required
            </Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Please authenticate with Google Cloud to continue.
            </Typography>
            
            <Alert severity="info" sx={{ mb: 2 }}>
              Run the following command in your terminal:
              <br />
              <code>gcloud auth login && gcloud auth application-default login</code>
            </Alert>
            
            {state.error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {state.error}
              </Alert>
            )}
            
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button 
                variant="contained" 
                onClick={handleLogin}
                startIcon={<GoogleIcon />}
              >
                Login with Google Cloud
              </Button>
              <Button 
                variant="outlined" 
                onClick={initializeApp}
              >
                Check Again
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">
          Anava Infrastructure Management
        </Typography>
        <Button 
          variant="outlined" 
          color="secondary"
          onClick={handleReset}
          size="small"
        >
          Reset Project
        </Button>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab label="Deploy Infrastructure" />
          <Tab label="Configuration" disabled={!state.deploymentSuccess} />
          <Tab label="Setup Guide" />
        </Tabs>
      </Box>

      {activeTab === 0 && (
        <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Status
              </Typography>
              
              {state.isAuthenticated === true && (
                <>
                  <Alert severity="success" sx={{ mb: 2 }}>
                    ✅ Authenticated as {state.user?.email || 'user'}
                  </Alert>
                  
                  <FormControl fullWidth sx={{ mb: 2 }}>
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
                  
                  {state.selectedProject && (
                    <Alert severity="info">
                      Selected project: <strong>{state.selectedProject}</strong>
                    </Alert>
                  )}
                </>
              )}
              
              {state.error && !state.showBillingError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {state.error}
                </Alert>
              )}
              
              {state.showBillingError && (
                <Alert 
                  severity="warning" 
                  icon={<AccountBalanceWalletIcon />}
                  sx={{ mt: 2 }}
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      endIcon={<OpenInNewIcon />}
                      onClick={() => {
                        const projectUrl = state.selectedProject 
                          ? `https://console.cloud.google.com/billing/linkedaccount?project=${state.selectedProject}`
                          : 'https://console.cloud.google.com/billing';
                        window.open(projectUrl, '_blank');
                      }}
                    >
                      Enable Billing
                    </Button>
                  }
                >
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>Billing is not enabled for this project</strong>
                  </Typography>
                  <Typography variant="body2">
                    To deploy infrastructure, you need to enable billing for project "{state.selectedProject}".
                    Click "Enable Billing" to open the Google Cloud Console and link a billing account.
                  </Typography>
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {state.isAuthenticated && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Deployment Progress
                </Typography>
                
                {state.isDeploying && (
                  <Box sx={{ mb: 2 }}>
                    <LinearProgress />
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      Deploying infrastructure...
                    </Typography>
                  </Box>
                )}
                
                {state.deploymentSuccess === true && (
                  <Alert severity="success">
                    🎉 Infrastructure deployed successfully!
                  </Alert>
                )}
                
                {state.deploymentSuccess === false && (
                  <Alert severity="error">
                    💥 Infrastructure deployment failed!
                  </Alert>
                )}
                
                {!state.isDeploying && !state.deploymentSuccess && (
                  <Box>
                    {!state.selectedProject && (
                      <Alert severity="warning" sx={{ mb: 2 }}>
                        Please select a Google Cloud project above before deploying.
                      </Alert>
                    )}
                    <Button 
                      variant="contained" 
                      onClick={() => startDeployment(state.selectedProject)}
                      disabled={!state.selectedProject}
                      size="large"
                      sx={{ minWidth: 200 }}
                    >
                      Deploy Anava Infrastructure
                    </Button>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}

        <Grid item xs={12}>
          <Paper sx={{ 
            p: 2, 
            bgcolor: '#1e1e1e', 
            color: '#fff', 
            fontFamily: 'monospace',
            maxHeight: '400px',
            overflow: 'auto'
          }}>
            <Typography variant="h6" gutterBottom sx={{ color: '#fff' }}>
              Deployment Logs
            </Typography>
            {state.deploymentLogs.map((log, index) => (
              <div key={index} style={{ marginBottom: '4px' }}>
                {log}
              </div>
            ))}
            {state.deploymentLogs.length === 0 && (
              <Typography variant="body2" sx={{ color: '#888' }}>
                No logs yet...
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>
      )}

      {activeTab === 1 && (
        <DeploymentConfig />
      )}

      {activeTab === 2 && (
        <SetupGuide projectId={state.selectedProject || 'your-project'} />
      )}
    </Box>
  );
};

export default AutoDashboard;