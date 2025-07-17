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
  CircularProgress
} from '@mui/material';

interface AppState {
  isLoadingAuth: boolean;
  isDeploying: boolean;
  isAuthenticated: boolean | null;
  selectedProject: string;
  deploymentLogs: string[];
  error: string | null;
  deploymentSuccess: boolean | null;
}

const AutoDashboard: React.FC = () => {
  const [state, setState] = useState<AppState>({
    isLoadingAuth: true,
    isDeploying: false,
    isAuthenticated: null,
    selectedProject: '',
    deploymentLogs: [],
    error: null,
    deploymentSuccess: null
  });

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
      // Check auth status
      const authStatus = await window.electronAPI.gcpAPI.getAuthStatus();
      
      if (authStatus.isAuthenticated) {
        setState(prev => ({ 
          ...prev, 
          isAuthenticated: true, 
          isLoadingAuth: false 
        }));

        // Auto-select project
        let projectId = await window.electronAPI.store.get('gcpProjectId');
        if (!projectId) {
          projectId = 'ryanclean';
          await window.electronAPI.store.set('gcpProjectId', projectId);
        }
        
        setState(prev => ({ 
          ...prev, 
          selectedProject: projectId 
        }));

        // Auto-start deployment after 2 seconds
        setTimeout(() => {
          startDeployment(projectId);
        }, 2000);

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
      addLog(`📝 ${data.stage}: ${data.message}`);
    });

    window.electronAPI.on('terraform:error', (error) => {
      setState(prev => ({ 
        ...prev, 
        error: `Deployment error: ${error}`,
        isDeploying: false,
        deploymentSuccess: false
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

  if (state.isLoadingAuth) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Checking authentication...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Anava Infrastructure Deployment
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Status
              </Typography>
              
              {state.isAuthenticated === false && (
                <Alert severity="error">
                  Not authenticated with GCP. Run: gcloud auth login && gcloud auth application-default login
                </Alert>
              )}
              
              {state.isAuthenticated === true && (
                <Alert severity="success">
                  ✅ Authenticated with GCP. Project: {state.selectedProject}
                </Alert>
              )}
              
              {state.error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {state.error}
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
                  <Button 
                    variant="contained" 
                    onClick={() => startDeployment(state.selectedProject)}
                    disabled={!state.selectedProject}
                  >
                    Deploy Infrastructure
                  </Button>
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
    </Box>
  );
};

export default AutoDashboard;