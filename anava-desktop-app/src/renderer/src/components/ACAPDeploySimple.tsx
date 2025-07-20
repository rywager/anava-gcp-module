import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  LinearProgress,
  Chip
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Upload as UploadIcon,
  Search as SearchIcon,
  Lock as LockIcon,
  OpenInNew as OpenInNewIcon
} from '@mui/icons-material';

interface Camera {
  id: string;
  ip: string;
  model: string;
  manufacturer: string;
  status: 'accessible' | 'requires_auth' | 'unknown';
  authenticated?: boolean;
  credentials?: {
    username: string;
    password: string;
  };
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  assets: GitHubAsset[];
}

interface BuildOption {
  asset: GitHubAsset;
  architecture: string;
  os: string;
  osVersion?: string;
}

interface DeploymentStatus {
  cameraId: string;
  status: 'idle' | 'downloading' | 'uploading' | 'installing' | 'success' | 'error';
  progress?: number;
  message?: string;
  appUrl?: string;
}

const ACAPDeploySimple: React.FC = () => {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [releases, setReleases] = useState<GitHubRelease[]>([]);
  const [selectedRelease, setSelectedRelease] = useState<string>('');
  const [selectedCameras, setSelectedCameras] = useState<string[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [deploymentStatus, setDeploymentStatus] = useState<Map<string, DeploymentStatus>>(new Map());
  const [credentialsDialog, setCredentialsDialog] = useState<{ open: boolean; cameraId?: string }>({ open: false });
  const [tempCredentials, setTempCredentials] = useState({ username: 'root', password: '' });
  const [buildSelectionDialog, setBuildSelectionDialog] = useState<{ open: boolean; camera?: Camera; options?: BuildOption[]; resolve?: (value: BuildOption | null) => void }>({ open: false });
  const [selectedBuild, setSelectedBuild] = useState<BuildOption | null>(null);

  useEffect(() => {
    fetchReleases();
    // Don't auto-start camera discovery - require manual scan
  }, []);

  const fetchReleases = async () => {
    setLoadingReleases(true);
    try {
      const response = await fetch('https://api.github.com/repos/AnavaAcap/acap-releases/releases');
      const data = await response.json();
      setReleases(data);
      if (data.length > 0) {
        setSelectedRelease(data[0].tag_name);
      }
    } catch (error) {
      console.error('Failed to fetch releases:', error);
    } finally {
      setLoadingReleases(false);
    }
  };

  const discoverCameras = async () => {
    setDiscovering(true);
    try {
      const discovered = await window.electronAPI.scanNetworkCameras();
      setCameras(discovered);
    } catch (error) {
      console.error('Failed to discover cameras:', error);
    } finally {
      setDiscovering(false);
    }
  };

  const testCredentials = async (cameraId: string) => {
    const camera = cameras.find(c => c.id === cameraId);
    if (!camera) return;

    setCredentialsDialog({ open: true, cameraId });
  };

  const handleSaveCredentials = async () => {
    if (!credentialsDialog.cameraId) return;

    const camera = cameras.find(c => c.id === credentialsDialog.cameraId);
    if (!camera) return;

    try {
      const result = await window.electronAPI.testCameraCredentials(
        camera.id,
        camera.ip,
        tempCredentials.username,
        tempCredentials.password
      );

      if (result.success) {
        // Update camera with valid credentials
        setCameras(prev => prev.map(c => 
          c.id === camera.id 
            ? { ...c, authenticated: true, credentials: tempCredentials, status: 'accessible' as const }
            : c
        ));
        setCredentialsDialog({ open: false });
      } else {
        alert('Invalid credentials');
      }
    } catch (error) {
      console.error('Failed to test credentials:', error);
    }
  };

  const parseAssetInfo = (assetName: string): { architecture: string; os: string; osVersion?: string } | null => {
    // Match pattern like: signed_Anava_-_Analyze_3_7_22_aarch64_os11.eap
    const archMatch = assetName.match(/(aarch64|armv7hf)/i);
    const osMatch = assetName.match(/_(os\d+)\./i); // Match _os11. or _os12.
    
    if (archMatch) {
      return {
        architecture: archMatch[1].toLowerCase(),
        os: 'axis',
        osVersion: osMatch ? osMatch[1] : undefined
      };
    }
    return null;
  };

  const getBuildOptions = (release: GitHubRelease): BuildOption[] => {
    const acapAssets = release.assets.filter(a => a.name.endsWith('.eap'));
    return acapAssets.map(asset => {
      const info = parseAssetInfo(asset.name);
      return {
        asset,
        architecture: info?.architecture || 'unknown',
        os: info?.os || 'unknown',
        osVersion: info?.osVersion
      };
    }).filter(option => option.architecture !== 'unknown');
  };

  const getRecommendedBuild = (camera: Camera, buildOptions: BuildOption[]): BuildOption | null => {
    if (!camera.architecture || camera.architecture === 'unknown') {
      return null;
    }
    
    // Try to match architecture
    const matching = buildOptions.filter(b => 
      b.architecture === camera.architecture.toLowerCase()
    );
    
    if (matching.length === 0) return null;
    
    // If multiple matches, prefer the latest OS version
    if (matching.length > 1) {
      const sorted = [...matching].sort((a, b) => {
        const aVersion = a.osVersion ? parseInt(a.osVersion.replace('os', '')) : 0;
        const bVersion = b.osVersion ? parseInt(b.osVersion.replace('os', '')) : 0;
        return bVersion - aVersion; // Higher version first
      });
      return sorted[0];
    }
    
    return matching[0];
  };

  const deployToCamera = async (camera: Camera, selectedBuild?: BuildOption) => {
    if (!selectedRelease || !camera.authenticated) return;

    const release = releases.find(r => r.tag_name === selectedRelease);
    if (!release) return;

    let acapAsset: GitHubAsset;
    
    if (selectedBuild) {
      acapAsset = selectedBuild.asset;
    } else {
      // Try to auto-select based on camera architecture
      const buildOptions = getBuildOptions(release);
      const recommended = getRecommendedBuild(camera, buildOptions);
      
      if (recommended) {
        acapAsset = recommended.asset;
      } else if (buildOptions.length > 0) {
        // No architecture match, but we have builds - auto-select the latest OS version
        const sorted = [...buildOptions].sort((a, b) => {
          // First sort by architecture (prefer aarch64 over armv7hf)
          if (a.architecture !== b.architecture) {
            return a.architecture === 'aarch64' ? -1 : 1;
          }
          // Then by OS version
          const aVersion = a.osVersion ? parseInt(a.osVersion.replace('os', '')) : 0;
          const bVersion = b.osVersion ? parseInt(b.osVersion.replace('os', '')) : 0;
          return bVersion - aVersion;
        });
        acapAsset = sorted[0].asset;
      } else {
        alert('No ACAP files found in this release');
        return;
      }
    }

    // Update status
    setDeploymentStatus(prev => new Map(prev).set(camera.id, {
      cameraId: camera.id,
      status: 'downloading',
      progress: 0,
      message: 'Downloading ACAP...'
    }));

    try {
      // Download the ACAP file
      const response = await fetch(acapAsset.browser_download_url);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Update status to uploading
      setDeploymentStatus(prev => new Map(prev).set(camera.id, {
        cameraId: camera.id,
        status: 'uploading',
        progress: 50,
        message: 'Uploading to camera...'
      }));

      // Deploy to camera using the deployment service
      const result = await window.electronAPI.deployACAP({
        cameraIp: camera.ip,
        username: camera.credentials!.username,
        password: camera.credentials!.password,
        acapFile: Array.from(uint8Array),
        acapFileName: acapAsset.name
      });

      if (result.success) {
        setDeploymentStatus(prev => new Map(prev).set(camera.id, {
          cameraId: camera.id,
          status: 'success',
          progress: 100,
          message: 'Deployment successful! ACAP is running.',
          appUrl: `http://${camera.ip}/camera/index.html#/apps`
        }));
      } else {
        throw new Error(result.error || 'Deployment failed');
      }
    } catch (error: any) {
      setDeploymentStatus(prev => new Map(prev).set(camera.id, {
        cameraId: camera.id,
        status: 'error',
        progress: 0,
        message: error.message
      }));
    }
  };

  const deployToSelected = async () => {
    const selectedCameraObjects = cameras.filter(c => 
      selectedCameras.includes(c.id) && c.authenticated
    );

    for (const camera of selectedCameraObjects) {
      await deployToCamera(camera);
    }
  };


  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        ACAP Deployment
      </Typography>

      {/* Release Selection */}
      <Card elevation={2} sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Select Release</Typography>
            <IconButton onClick={fetchReleases} disabled={loadingReleases}>
              <RefreshIcon />
            </IconButton>
          </Box>

          {loadingReleases ? (
            <CircularProgress size={24} />
          ) : (
            <FormControl fullWidth>
              <InputLabel>ACAP Release</InputLabel>
              <Select
                value={selectedRelease}
                onChange={(e) => setSelectedRelease(e.target.value)}
                label="ACAP Release"
              >
                {releases.map(release => (
                  <MenuItem key={release.tag_name} value={release.tag_name}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <Typography>{release.name || release.tag_name}</Typography>
                      <Typography variant="caption" sx={{ ml: 2 }}>
                        {new Date(release.published_at).toLocaleDateString()}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {selectedRelease && (() => {
            const release = releases.find(r => r.tag_name === selectedRelease);
            if (!release) return null;
            const buildOptions = getBuildOptions(release);
            
            return (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Available builds:
                </Typography>
                {buildOptions.map((option, index) => (
                  <Alert 
                    key={index} 
                    severity="info" 
                    sx={{ mb: 0.5 }}
                    icon={false}
                  >
                    <Typography variant="body2">
                      <strong>{option.architecture}</strong> ({option.os}) - 
                      {option.asset.name} ({(option.asset.size / 1024 / 1024).toFixed(2)} MB)
                    </Typography>
                  </Alert>
                ))}
                {buildOptions.length === 0 && (
                  <Alert severity="warning">
                    No ACAP files found in this release
                  </Alert>
                )}
              </Box>
            );
          })()}
        </CardContent>
      </Card>

      {/* Camera Discovery */}
      <Card elevation={2} sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Cameras</Typography>
            <Button
              variant="outlined"
              startIcon={discovering ? <CircularProgress size={16} /> : <RefreshIcon />}
              onClick={discoverCameras}
              disabled={discovering}
            >
              {discovering ? 'Scanning Network...' : 'Refresh'}
            </Button>
          </Box>

          {cameras.length === 0 ? (
            discovering ? (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <CircularProgress size={40} sx={{ mb: 2 }} />
                <Typography variant="body2" color="textSecondary">
                  Scanning network for Axis cameras...
                </Typography>
              </Box>
            ) : (
              <Alert severity="info">
                No cameras found on your network. Make sure your cameras are powered on and connected to the same network.
              </Alert>
            )
          ) : (
            <List>
              {cameras.map(camera => {
                const status = deploymentStatus.get(camera.id);
                return (
                  <ListItem key={camera.id} divider>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography>{camera.ip}</Typography>
                          {camera.authenticated && (
                            <CheckCircleIcon color="success" fontSize="small" />
                          )}
                          {!camera.authenticated && (
                            <LockIcon color="action" fontSize="small" />
                          )}
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2">
                            {camera.manufacturer} {camera.model}
                          </Typography>
                          {camera.architecture && camera.architecture !== 'unknown' && (
                            <Typography variant="caption" color="textSecondary">
                              Architecture: {camera.architecture} | Firmware: {camera.firmwareVersion || 'unknown'}
                            </Typography>
                          )}
                          {status && (
                            <Box sx={{ mt: 1 }}>
                              <Typography variant="caption" color={
                                status.status === 'error' ? 'error' : 
                                status.status === 'success' ? 'success' : 
                                'textSecondary'
                              }>
                                {status.message}
                              </Typography>
                              {status.status === 'uploading' && status.progress && (
                                <LinearProgress 
                                  variant="determinate" 
                                  value={status.progress} 
                                  sx={{ mt: 0.5 }}
                                />
                              )}
                              {status.status === 'success' && status.appUrl && (
                                <Box sx={{ mt: 0.5 }}>
                                  <Button
                                    size="small"
                                    variant="text"
                                    startIcon={<OpenInNewIcon />}
                                    onClick={() => window.open(status.appUrl, '_blank')}
                                    sx={{ textTransform: 'none', p: 0, minWidth: 0 }}
                                  >
                                    Open Camera Apps
                                  </Button>
                                </Box>
                              )}
                            </Box>
                          )}
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      {!camera.authenticated ? (
                        <Button
                          size="small"
                          onClick={() => testCredentials(camera.id)}
                          startIcon={<LockIcon />}
                        >
                          Set Credentials
                        </Button>
                      ) : (
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => deployToCamera(camera)}
                            disabled={!selectedRelease || status?.status === 'uploading'}
                            startIcon={<UploadIcon />}
                          >
                            Deploy
                          </Button>
                          {status?.status === 'success' && (
                            <IconButton
                              size="small"
                              onClick={() => window.open(`http://${camera.ip}/camera/index.html#/apps`, '_blank')}
                              title="Open Camera Apps"
                            >
                              <OpenInNewIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Box>
                      )}
                    </ListItemSecondaryAction>
                  </ListItem>
                );
              })}
            </List>
          )}
        </CardContent>
      </Card>

      {/* Credentials Dialog */}
      <Dialog open={credentialsDialog.open} onClose={() => setCredentialsDialog({ open: false })}>
        <DialogTitle>Camera Credentials</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Username"
            value={tempCredentials.username}
            onChange={(e) => setTempCredentials(prev => ({ ...prev, username: e.target.value }))}
            sx={{ mb: 2, mt: 2 }}
          />
          <TextField
            fullWidth
            label="Password"
            type="password"
            value={tempCredentials.password}
            onChange={(e) => setTempCredentials(prev => ({ ...prev, password: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCredentialsDialog({ open: false })}>Cancel</Button>
          <Button onClick={handleSaveCredentials} variant="contained">
            Test & Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Build Selection Dialog */}
      <Dialog 
        open={buildSelectionDialog.open} 
        onClose={() => {
          if (buildSelectionDialog.resolve) {
            buildSelectionDialog.resolve(null);
          }
          setBuildSelectionDialog({ open: false });
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Select ACAP Build</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Camera: {buildSelectionDialog.camera?.ip} ({buildSelectionDialog.camera?.model})
            {buildSelectionDialog.camera?.architecture && buildSelectionDialog.camera.architecture !== 'unknown' && (
              <>
                <br />
                Detected architecture: <strong>{buildSelectionDialog.camera.architecture}</strong>
              </>
            )}
          </Typography>
          <List>
            {buildSelectionDialog.options?.map((option, index) => {
              const isRecommended = buildSelectionDialog.camera?.architecture === option.architecture;
              return (
                <ListItem 
                  key={index}
                  onClick={() => {
                    setSelectedBuild(option);
                    if (buildSelectionDialog.resolve) {
                      buildSelectionDialog.resolve(option);
                    }
                    setBuildSelectionDialog({ open: false });
                  }}
                  sx={{ 
                    border: isRecommended ? '2px solid' : '1px solid #ccc',
                    borderColor: isRecommended ? 'primary.main' : '#ccc',
                    borderRadius: 1,
                    mb: 1
                  }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography>{option.asset.name}</Typography>
                        {isRecommended && (
                          <Chip size="small" label="Recommended" color="primary" />
                        )}
                      </Box>
                    }
                    secondary={
                      <>
                        Architecture: {option.architecture} | OS: {option.os} | 
                        Size: {(option.asset.size / 1024 / 1024).toFixed(2)} MB
                      </>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            if (buildSelectionDialog.resolve) {
              buildSelectionDialog.resolve(null);
            }
            setBuildSelectionDialog({ open: false });
          }}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ACAPDeploySimple;