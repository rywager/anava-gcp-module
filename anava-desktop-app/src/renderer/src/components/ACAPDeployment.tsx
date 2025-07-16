import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  LinearProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  IconButton,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  FolderOpen as FolderOpenIcon,
  Visibility as VisibilityIcon
} from '@mui/icons-material';
import { Camera, ACAPDeployment } from '../types';
import { useCameraContext } from '../context/CameraContext';

const ACAPDeploymentComponent: React.FC = () => {
  const { cameras } = useCameraContext();
  const [deployments, setDeployments] = useState<ACAPDeployment[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [deployDialog, setDeployDialog] = useState(false);
  const [acapFile, setAcapFile] = useState<string>('');
  const [credentials, setCredentials] = useState({ username: 'root', password: 'pass' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [logsDialog, setLogsDialog] = useState(false);

  const accessibleCameras = cameras.filter(camera => 
    (camera.status === 'accessible' || camera.authenticated) && 
    camera.capabilities.includes('ACAP') &&
    camera.type !== 'Unknown Device' && // Exclude unvalidated devices
    camera.manufacturer === 'Axis Communications' && // Only Axis cameras support ACAP
    !camera.needsValidation // Only show fully validated cameras
  );

  useEffect(() => {
    loadDeployments();
  }, []);

  const loadDeployments = async () => {
    try {
      const storedDeployments = await window.electronAPI.store.get('acapDeployments') || [];
      setDeployments(storedDeployments);
    } catch (error) {
      console.error('Error loading deployments:', error);
    }
  };

  const saveDeployments = async (deployments: ACAPDeployment[]) => {
    try {
      await window.electronAPI.store.set('acapDeployments', deployments);
    } catch (error) {
      console.error('Error saving deployments:', error);
    }
  };

  const openDeployDialog = (camera: Camera) => {
    setSelectedCamera(camera);
    setCredentials({
      username: camera.credentials?.username || 'root',
      password: camera.credentials?.password || 'pass'
    });
    setDeployDialog(true);
  };

  const selectAcapFile = async () => {
    try {
      const result = await window.electronAPI.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'ACAP Files', extensions: ['eap'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePaths.length > 0) {
        setAcapFile(result.filePaths[0]);
      }
    } catch (error) {
      console.error('Error selecting ACAP file:', error);
    }
  };

  const deployACAP = async () => {
    if (!selectedCamera || !acapFile) return;

    const deploymentId = `${selectedCamera.id}-${Date.now()}`;
    const deployment: ACAPDeployment = {
      id: deploymentId,
      cameraId: selectedCamera.id,
      packageId: acapFile,
      status: 'pending',
      progress: 0,
      message: 'Starting deployment...',
      startedAt: new Date().toISOString()
    };

    try {
      setLoading(true);
      setError(null);

      // Add deployment to list
      const updatedDeployments = [...deployments, deployment];
      setDeployments(updatedDeployments);
      await saveDeployments(updatedDeployments);

      // Start deployment
      const result = await window.electronAPI.deployACAP(
        selectedCamera.ip,
        acapFile,
        credentials
      );

      // Update deployment status
      const completedDeployment = {
        ...deployment,
        status: result.success ? 'completed' : 'failed',
        progress: result.success ? 100 : 0,
        message: result.message,
        completedAt: new Date().toISOString(),
        error: result.success ? undefined : result.message
      };

      const finalDeployments = updatedDeployments.map(d => 
        d.id === deploymentId ? completedDeployment : d
      );
      setDeployments(finalDeployments);
      await saveDeployments(finalDeployments);

      setDeployDialog(false);
      setAcapFile('');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Deployment failed';
      setError(errorMessage);

      // Update deployment with error
      const failedDeployment = {
        ...deployment,
        status: 'failed' as const,
        progress: 0,
        message: errorMessage,
        completedAt: new Date().toISOString(),
        error: errorMessage
      };

      const failedDeployments = deployments.map(d => 
        d.id === deploymentId ? failedDeployment : d
      );
      setDeployments(failedDeployments);
      await saveDeployments(failedDeployments);

    } finally {
      setLoading(false);
    }
  };

  const removeDeployment = async (deploymentId: string) => {
    const updatedDeployments = deployments.filter(d => d.id !== deploymentId);
    setDeployments(updatedDeployments);
    await saveDeployments(updatedDeployments);
  };

  const viewLogs = async (deployment: ACAPDeployment) => {
    const camera = cameras.find(c => c.id === deployment.cameraId);
    if (!camera) return;

    try {
      // In a real implementation, this would fetch actual logs from the camera
      const mockLogs = `[${new Date().toISOString()}] ACAP deployment started
[${new Date().toISOString()}] Uploading package...
[${new Date().toISOString()}] Installation in progress...
[${new Date().toISOString()}] ACAP ${deployment.status === 'completed' ? 'started successfully' : 'failed'}`;
      
      setLogs(mockLogs);
      setLogsDialog(true);
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'failed': return 'error';
      case 'pending': return 'info';
      default: return 'warning';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getCameraName = (cameraId: string) => {
    const camera = cameras.find(c => c.id === cameraId);
    return camera ? `${camera.manufacturer} ${camera.model} (${camera.ip})` : 'Unknown Camera';
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">
          ACAP Deployment
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={loadDeployments}
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Quick Deploy Section */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Quick Deploy
              </Typography>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Deploy ACAP to available cameras
              </Typography>
              
              {accessibleCameras.length === 0 ? (
                <Alert severity="info">
                  No ACAP-capable cameras found. Discover cameras first.
                </Alert>
              ) : (
                <Box>
                  <FormControl fullWidth margin="normal">
                    <InputLabel>Select Camera</InputLabel>
                    <Select
                      value={selectedCamera?.id || ''}
                      onChange={(e) => {
                        const camera = accessibleCameras.find(c => c.id === e.target.value);
                        setSelectedCamera(camera || null);
                      }}
                    >
                      {accessibleCameras.map((camera) => (
                        <MenuItem key={camera.id} value={camera.id}>
                          {camera.manufacturer} {camera.model} ({camera.ip})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  
                  <Button
                    variant="contained"
                    startIcon={<CloudUploadIcon />}
                    onClick={() => selectedCamera && openDeployDialog(selectedCamera)}
                    disabled={!selectedCamera}
                    fullWidth
                    sx={{ mt: 2 }}
                  >
                    Deploy ACAP
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Deployment Statistics
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Total</Typography>
                  <Typography variant="h4">{deployments.length}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Successful</Typography>
                  <Typography variant="h4" color="success.main">
                    {deployments.filter(d => d.status === 'completed').length}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Failed</Typography>
                  <Typography variant="h4" color="error.main">
                    {deployments.filter(d => d.status === 'failed').length}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">In Progress</Typography>
                  <Typography variant="h4" color="warning.main">
                    {deployments.filter(d => !['completed', 'failed'].includes(d.status)).length}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Deployments Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Deployment History
          </Typography>
          
          {deployments.length === 0 ? (
            <Box textAlign="center" py={4}>
              <Typography variant="body2" color="textSecondary">
                No deployments yet. Deploy your first ACAP above.
              </Typography>
            </Box>
          ) : (
            <TableContainer component={Paper} elevation={0}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Camera</TableCell>
                    <TableCell>Package</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Progress</TableCell>
                    <TableCell>Started</TableCell>
                    <TableCell>Completed</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {deployments.map((deployment) => (
                    <TableRow key={deployment.id}>
                      <TableCell>{getCameraName(deployment.cameraId)}</TableCell>
                      <TableCell>{deployment.packageId.split('/').pop()}</TableCell>
                      <TableCell>
                        <Chip
                          label={deployment.status}
                          color={getStatusColor(deployment.status) as any}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          <LinearProgress
                            variant="determinate"
                            value={deployment.progress}
                            sx={{ flexGrow: 1 }}
                          />
                          <Typography variant="body2">
                            {deployment.progress}%
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>{formatDate(deployment.startedAt)}</TableCell>
                      <TableCell>
                        {deployment.completedAt ? formatDate(deployment.completedAt) : '-'}
                      </TableCell>
                      <TableCell>
                        <Tooltip title="View logs">
                          <IconButton size="small" onClick={() => viewLogs(deployment)}>
                            <VisibilityIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Remove">
                          <IconButton size="small" onClick={() => removeDeployment(deployment.id)}>
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Deploy Dialog */}
      <Dialog open={deployDialog} onClose={() => setDeployDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Deploy ACAP Package</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Camera: {selectedCamera?.ip} ({selectedCamera?.manufacturer} {selectedCamera?.model})
          </Typography>
          
          <Box display="flex" alignItems="center" gap={2} my={2}>
            <TextField
              label="ACAP File"
              value={acapFile}
              fullWidth
              InputProps={{
                readOnly: true
              }}
            />
            <Button
              variant="outlined"
              startIcon={<FolderOpenIcon />}
              onClick={selectAcapFile}
            >
              Browse
            </Button>
          </Box>
          
          <TextField
            label="Username"
            value={credentials.username}
            onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
            fullWidth
            margin="normal"
          />
          
          <TextField
            label="Password"
            type="password"
            value={credentials.password}
            onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
            fullWidth
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeployDialog(false)}>Cancel</Button>
          <Button 
            onClick={deployACAP} 
            variant="contained"
            disabled={!acapFile || loading}
            startIcon={loading ? <LinearProgress size={20} /> : <CloudUploadIcon />}
          >
            {loading ? 'Deploying...' : 'Deploy'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Logs Dialog */}
      <Dialog open={logsDialog} onClose={() => setLogsDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Deployment Logs</DialogTitle>
        <DialogContent>
          <Paper sx={{ p: 2, backgroundColor: '#f5f5f5', fontFamily: 'monospace' }}>
            <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
              {logs}
            </Typography>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogsDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ACAPDeploymentComponent;