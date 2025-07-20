import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Avatar,
  Chip,
  CircularProgress,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import {
  Google as GoogleIcon,
  Cloud as CloudIcon,
  Logout as LogoutIcon
} from '@mui/icons-material';

interface GCPUser {
  email: string;
  name: string;
  picture?: string;
}

interface GCPProject {
  projectId: string;
  projectNumber: string;
  name: string;
  lifecycleState: string;
}

const GCPLogin: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<GCPUser | null>(null);
  const [projects, setProjects] = useState<GCPProject[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);

  useEffect(() => {
    checkAuthStatus();
    
    // Listen for auth state changes
    window.electronAPI.gcpAPI.onAuthStateChange((event, data) => {
      setIsAuthenticated(data.isAuthenticated);
      if (data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    });
  }, []);

  const checkAuthStatus = async () => {
    try {
      const status = await window.electronAPI.gcpAPI.getAuthStatus();
      setIsAuthenticated(status.isAuthenticated);
      setUser(status.user);
      
      if (status.isAuthenticated) {
        loadProjects();
      }
    } catch (err) {
      console.error('Failed to check auth status:', err);
    }
  };

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await window.electronAPI.gcpAPI.login();
      setUser(result.user);
      setIsAuthenticated(true);
      
      // Store tokens
      await window.electronAPI.store.set('gcpTokens', result.tokens);
      await window.electronAPI.store.set('gcpUser', result.user);
      
      // Load projects after login
      await loadProjects();
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate with Google Cloud');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await window.electronAPI.gcpAPI.logout();
      setIsAuthenticated(false);
      setUser(null);
      setProjects([]);
      setSelectedProject('');
    } catch (err: any) {
      setError(err.message || 'Failed to logout');
    }
  };

  const loadProjects = async () => {
    try {
      setLoadingProjects(true);
      const projectList = await window.electronAPI.gcpAPI.listProjects();
      setProjects(projectList);
      
      // Auto-select first active project
      const activeProject = projectList.find(p => p.lifecycleState === 'ACTIVE');
      if (activeProject && !selectedProject) {
        setSelectedProject(activeProject.projectId);
        await window.electronAPI.gcpAPI.setProject(activeProject.projectId);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleProjectChange = async (projectId: string) => {
    try {
      setSelectedProject(projectId);
      await window.electronAPI.gcpAPI.setProject(projectId);
      await window.electronAPI.store.set('gcpProjectId', projectId);
    } catch (err: any) {
      setError(err.message || 'Failed to set project');
    }
  };

  if (!isAuthenticated) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Google Cloud Authentication
        </Typography>
        
        <Card>
          <CardContent>
            <Box display="flex" flexDirection="column" alignItems="center" gap={3} p={4}>
              <CloudIcon sx={{ fontSize: 64, color: 'primary.main' }} />
              
              <Typography variant="h6" textAlign="center">
                Connect to Google Cloud Platform
              </Typography>
              
              <Typography variant="body2" textAlign="center" color="textSecondary" maxWidth={400}>
                Sign in with your Google account to deploy infrastructure and manage your Anava Vision backend.
              </Typography>
              
              <Button
                variant="contained"
                size="large"
                startIcon={loading ? <CircularProgress size={20} /> : <GoogleIcon />}
                onClick={handleLogin}
                disabled={loading}
                sx={{ mt: 2 }}
              >
                {loading ? 'Authenticating...' : 'Sign in with Google'}
              </Button>
              
              {error && (
                <Alert severity="error" sx={{ mt: 2, width: '100%' }}>
                  {error}
                </Alert>
              )}
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Google Cloud Platform
      </Typography>
      
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center" gap={2}>
              {user?.picture && (
                <Avatar src={user.picture} alt={user.name} />
              )}
              <Box>
                <Typography variant="h6">{user?.name}</Typography>
                <Typography variant="body2" color="textSecondary">
                  {user?.email}
                </Typography>
              </Box>
              <Chip
                label="Authenticated"
                color="success"
                size="small"
              />
            </Box>
            
            <Button
              variant="outlined"
              startIcon={<LogoutIcon />}
              onClick={handleLogout}
            >
              Logout
            </Button>
          </Box>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Project Selection
          </Typography>
          
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Google Cloud Project</InputLabel>
            <Select
              value={selectedProject}
              onChange={(e) => handleProjectChange(e.target.value)}
              disabled={loadingProjects}
              label="Google Cloud Project"
            >
              {projects.map((project) => (
                <MenuItem key={project.projectId} value={project.projectId}>
                  <Box>
                    <Typography>{project.name}</Typography>
                    <Typography variant="caption" color="textSecondary">
                      {project.projectId}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          {loadingProjects && (
            <Box display="flex" justifyContent="center" mt={2}>
              <CircularProgress size={24} />
            </Box>
          )}
          
          {selectedProject && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Selected project: <strong>{selectedProject}</strong>
            </Alert>
          )}
          
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default GCPLogin;