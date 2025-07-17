import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';

const SimpleAuth: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Just check if gcloud is authenticated
      const result = await window.electronAPI.gcpAPI.getAuthStatus();
      setIsAuthenticated(true);
      setUser({ email: 'ryan@anava.ai', name: 'Ryan' });
      
      // Load projects
      const projectList = await window.electronAPI.gcpAPI.listProjects();
      setProjects(projectList);
      
      // Set default project
      const savedProject = await window.electronAPI.store.get('gcpProjectId');
      if (savedProject) {
        setSelectedProject(savedProject);
      } else if (projectList.length > 0) {
        const ryanClean = projectList.find(p => p.projectId === 'ryanclean-20241006');
        if (ryanClean) {
          setSelectedProject('ryanclean-20241006');
          await window.electronAPI.store.set('gcpProjectId', 'ryanclean-20241006');
        }
      }
    } catch (err) {
      console.log('Not authenticated yet');
      setIsAuthenticated(false);
    }
  };

  const handleProjectSelect = async (projectId: string) => {
    setSelectedProject(projectId);
    await window.electronAPI.store.set('gcpProjectId', projectId);
    await window.electronAPI.gcpAPI.setProject(projectId);
  };

  if (!isAuthenticated) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Google Cloud Authentication Required
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            Run: <code>gcloud auth login && gcloud auth application-default login</code>
          </Alert>
          <Button variant="contained" onClick={checkAuth}>
            Check Authentication
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          ✅ Authenticated as {user?.email}
        </Typography>
        
        <FormControl fullWidth sx={{ mt: 2 }}>
          <InputLabel>Select Project</InputLabel>
          <Select
            value={selectedProject}
            onChange={(e) => handleProjectSelect(e.target.value)}
          >
            {projects.map((project) => (
              <MenuItem key={project.projectId} value={project.projectId}>
                {project.name} ({project.projectId})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        
        {selectedProject && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Project selected: {selectedProject}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default SimpleAuth;