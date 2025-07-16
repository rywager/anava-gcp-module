import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Chip,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem
} from '@mui/material';
import {
  Videocam as VideocamIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  Visibility as VisibilityIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { Camera } from '../types';

const CameraDiscovery: React.FC = () => {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [credentialsDialog, setCredentialsDialog] = useState(false);
  const [credentials, setCredentials] = useState({ username: 'root', password: 'pass' });
  const [defaultCredentials, setDefaultCredentials] = useState({ username: 'root', password: 'pass' });
  const [scanProgress, setScanProgress] = useState<string>('');

  useEffect(() => {
    loadCameras();
  }, []);

  const loadCameras = async () => {
    try {
      setLoading(true);
      const storedCameras = await window.electronAPI.store.get('discoveredCameras') || [];
      setCameras(storedCameras);
    } catch (err) {
      setError('Failed to load cameras');
      console.error('Error loading cameras:', err);
    } finally {
      setLoading(false);
    }
  };

  const scanForCameras = async () => {
    try {
      setScanning(true);
      setError(null);
      
      const discoveredCameras = await window.electronAPI.scanNetworkForCameras();
      
      // Merge with existing cameras, avoiding duplicates
      const existingIps = cameras.map(cam => cam.ip);
      const newCameras = discoveredCameras.filter((cam: Camera) => !existingIps.includes(cam.ip));
      const updatedCameras = [...cameras, ...newCameras];
      
      setCameras(updatedCameras);
      
      // Store in Electron store
      await window.electronAPI.store.set('discoveredCameras', updatedCameras);
      
      if (newCameras.length === 0) {
        setError('No new cameras found');
      }
      
    } catch (err) {
      setError('Failed to scan for cameras');
      console.error('Error scanning for cameras:', err);
    } finally {
      setScanning(false);
    }
  };

  const quickScanCamera = async () => {
    try {
      setScanning(true);
      setError(null);
      setScanProgress('Starting quick scan...');
      
      console.log('Starting quick scan with credentials:', defaultCredentials.username, ':*****');
      
      // Update existing camera with new credentials if it exists
      const existingCamera = cameras.find(cam => cam.ip === '192.168.50.156');
      if (existingCamera && existingCamera.status === 'requires_auth') {
        setScanProgress('Updating camera credentials...');
        existingCamera.credentials = {
          username: defaultCredentials.username,
          password: defaultCredentials.password
        };
        // Re-validate with new credentials
      }
      
      setScanProgress('Checking camera at 192.168.50.156...');
      
      // Quick scan for the specific camera at 192.168.50.156 with current credentials
      const discoveredCameras = await window.electronAPI.quickScanCamera('192.168.50.156', defaultCredentials.username, defaultCredentials.password);
      
      console.log('Quick scan result:', discoveredCameras);
      
      if (discoveredCameras && discoveredCameras.length > 0) {
        // Update existing camera or add new one
        const updatedCameras = cameras.map(cam => {
          if (cam.ip === '192.168.50.156') {
            // Update existing camera with new status
            return discoveredCameras[0];
          }
          return cam;
        });
        
        // If camera wasn't in list, add it
        if (!cameras.find(cam => cam.ip === '192.168.50.156')) {
          updatedCameras.push(discoveredCameras[0]);
        }
        
        setCameras(updatedCameras);
        
        // Store in Electron store
        await window.electronAPI.store.set('discoveredCameras', updatedCameras);
        
        setError('✅ Successfully connected to camera at 192.168.50.156');
        setScanProgress('');
      } else {
        setError('❌ No camera found at 192.168.50.156. Check:\n1. IP address is correct\n2. Camera is powered on\n3. Camera is on same network\n4. Username/password are correct');
        setScanProgress('');
      }
      
    } catch (err: any) {
      console.error('Error scanning for camera:', err);
      setError(`❌ Failed to scan for camera: ${err.message || 'Unknown error'}`);
      setScanProgress('');
    } finally {
      setScanning(false);
    }
  };

  const removeCamera = async (cameraId: string) => {
    try {
      const updatedCameras = cameras.filter(cam => cam.id !== cameraId);
      setCameras(updatedCameras);
      await window.electronAPI.store.set('discoveredCameras', updatedCameras);
    } catch (err) {
      console.error('Error removing camera:', err);
    }
  };

  const openCredentialsDialog = (camera: Camera) => {
    setSelectedCamera(camera);
    setCredentials({
      username: camera.credentials?.username || 'root',
      password: camera.credentials?.password || 'pass'
    });
    setCredentialsDialog(true);
  };

  const saveCredentials = async () => {
    if (!selectedCamera) return;
    
    try {
      setLoading(true);
      
      console.log('Testing credentials for camera:', selectedCamera?.ip);
      
      // Test the credentials before saving
      const testResult = await window.electronAPI.testCameraCredentials(
        selectedCamera?.id,
        selectedCamera?.ip, 
        credentials.username, 
        credentials.password
      );
      
      console.log('Credential test result:', testResult);
      
      const updatedCameras = cameras.map(cam => 
        cam.id === selectedCamera.id 
          ? { 
              ...cam, 
              credentials,
              status: testResult.authenticated ? 'accessible' : 'requires_auth',
              authenticated: testResult.authenticated
            }
          : cam
      );
      
      setCameras(updatedCameras);
      await window.electronAPI.store.set('discoveredCameras', updatedCameras);
      setCredentialsDialog(false);
      setSelectedCamera(null);
      
      if (testResult.authenticated) {
        setError(null);
      } else {
        setError(`Authentication failed: ${testResult.message}`);
      }
    } catch (err) {
      console.error('Error saving credentials:', err);
      setError(`Error testing credentials: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accessible': return 'success';
      case 'requires_auth': return 'warning';
      case 'offline': return 'error';
      default: return 'default';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'accessible': return 'Accessible';
      case 'requires_auth': return 'Requires Auth';
      case 'offline': return 'Offline';
      default: return 'Unknown';
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" gutterBottom>
          Camera Discovery
        </Typography>
        <Box>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadCameras}
            disabled={loading || scanning}
            sx={{ mr: 2 }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={scanning ? <CircularProgress size={20} /> : <VideocamIcon />}
            onClick={quickScanCamera}
            disabled={scanning}
            sx={{ mr: 2 }}
          >
            {scanning ? 'Scanning...' : 'Quick Scan (192.168.50.156)'}
          </Button>
          <Button
            variant="outlined"
            startIcon={scanning ? <CircularProgress size={20} /> : <VideocamIcon />}
            onClick={scanForCameras}
            disabled={scanning}
          >
            {scanning ? 'Scanning...' : 'Scan Network'}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity={error.startsWith('✅') ? 'success' : 'error'} sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error.split('\n').map((line, idx) => (
            <div key={idx}>{line}</div>
          ))}
        </Alert>
      )}
      
      {scanning && scanProgress && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Box display="flex" alignItems="center" gap={2}>
            <CircularProgress size={20} />
            <Typography>{scanProgress}</Typography>
          </Box>
        </Alert>
      )}

      {/* Default Credentials Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Default Camera Credentials
          </Typography>
          <Box display="flex" gap={2} alignItems="center">
            <TextField
              label="Username"
              size="small"
              value={defaultCredentials.username}
              onChange={(e) => setDefaultCredentials({ ...defaultCredentials, username: e.target.value })}
              sx={{ minWidth: 120 }}
            />
            <TextField
              label="Password"
              size="small"
              type="password"
              value={defaultCredentials.password}
              onChange={(e) => setDefaultCredentials({ ...defaultCredentials, password: e.target.value })}
              sx={{ minWidth: 120 }}
            />
            <Typography variant="body2" color="textSecondary">
              These credentials will be used for camera discovery and quick scan.
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="primary">
                Total Cameras
              </Typography>
              <Typography variant="h3" fontWeight="bold">
                {cameras.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="success.main">
                Accessible
              </Typography>
              <Typography variant="h3" fontWeight="bold">
                {cameras.filter(cam => cam.status === 'accessible').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="warning.main">
                Requires Auth
              </Typography>
              <Typography variant="h3" fontWeight="bold">
                {cameras.filter(cam => cam.status === 'requires_auth').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Camera Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Discovered Cameras
          </Typography>
          
          {loading ? (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          ) : cameras.length === 0 ? (
            <Box textAlign="center" p={4}>
              <Typography variant="body1" color="textSecondary">
                No cameras discovered yet. Click "Scan Network" to start discovery.
              </Typography>
            </Box>
          ) : (
            <TableContainer component={Paper} elevation={0}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>IP Address</TableCell>
                    <TableCell>Manufacturer</TableCell>
                    <TableCell>Model</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Capabilities</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cameras.map((camera) => (
                    <TableRow key={camera.id}>
                      <TableCell>
                        <Box display="flex" alignItems="center">
                          <VideocamIcon sx={{ mr: 1, color: '#1976d2' }} />
                          {camera.ip}:{camera.port}
                        </Box>
                      </TableCell>
                      <TableCell>{camera.manufacturer}</TableCell>
                      <TableCell>{camera.model}</TableCell>
                      <TableCell>
                        {camera.type}
                        {camera.needsValidation && (
                          <Chip label="Needs validation" size="small" color="info" sx={{ ml: 1 }} />
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={getStatusText(camera.status)}
                          color={getStatusColor(camera.status) as any}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Box display="flex" gap={1} flexWrap="wrap">
                          {camera.capabilities.map((cap) => (
                            <Chip
                              key={cap}
                              label={cap}
                              size="small"
                              variant="outlined"
                            />
                          ))}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => openCredentialsDialog(camera)}
                          title="Configure credentials"
                        >
                          <SettingsIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => {/* Open camera view */}}
                          title="View camera"
                        >
                          <VisibilityIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => removeCamera(camera.id)}
                          title="Remove camera"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Credentials Dialog */}
      <Dialog open={credentialsDialog} onClose={() => setCredentialsDialog(false)}>
        <DialogTitle>Configure Camera Credentials</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            Camera: {selectedCamera?.ip} ({selectedCamera?.manufacturer} {selectedCamera?.model})
          </Typography>
          
          <TextField
            label="Username"
            fullWidth
            margin="normal"
            value={credentials.username}
            onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
          />
          
          <TextField
            label="Password"
            fullWidth
            margin="normal"
            type="password"
            value={credentials.password}
            onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCredentialsDialog(false)}>Cancel</Button>
          <Button onClick={saveCredentials} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CameraDiscovery;