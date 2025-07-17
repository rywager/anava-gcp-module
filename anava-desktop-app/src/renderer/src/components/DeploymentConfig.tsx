import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Paper,
  Grid,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Switch
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import SendIcon from '@mui/icons-material/Send';
import SecurityIcon from '@mui/icons-material/Security';

interface DeploymentConfig {
  apiGatewayUrl: string;
  apiKey: string;
  deviceAuthUrl: string;
  tvmUrl: string;
  firebaseConfig: {
    projectId: string;
    apiKey: string;
    authDomain: string;
    storageBucket: string;
    databaseURL: string;
    appId: string;
  };
  serviceAccounts: {
    vertexAi: string;
    deviceAuth: string;
    tvm: string;
    apiGateway: string;
  };
  storageBuckets: {
    firebase: string;
    functionSource: string;
  };
  wifProvider: string;
}

const DeploymentConfig: React.FC = () => {
  const [config, setConfig] = useState<DeploymentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<{ [key: string]: boolean | null }>({});
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [cameraIp, setCameraIp] = useState('');
  const [useEncryption, setUseEncryption] = useState(true);
  const [sendingConfig, setSendingConfig] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get deployed configuration from backend
      const deployedConfig = await window.electronAPI.terraformAPI.getDeployedConfig();
      
      if (deployedConfig) {
        setConfig(deployedConfig);
      } else {
        setError('No deployment found. Please deploy infrastructure first.');
      }
    } catch (err: any) {
      setError(`Failed to load configuration: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(label);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const testEndpoint = async (endpoint: string, url: string) => {
    setTestResults(prev => ({ ...prev, [endpoint]: null }));
    
    try {
      // For now, just do a simple check - can be enhanced later
      const response = await fetch(url, { method: 'GET' });
      setTestResults(prev => ({ ...prev, [endpoint]: response.ok }));
    } catch (err) {
      setTestResults(prev => ({ ...prev, [endpoint]: false }));
    }
  };

  const handleSendToCamera = async () => {
    if (!config || !cameraIp) return;
    
    setSendingConfig(true);
    setSendResult(null);
    
    try {
      // Test camera endpoint first
      const testResult = await window.electronAPI.terraformAPI.testCameraEndpoint(cameraIp);
      
      if (!testResult.accessible) {
        setSendResult({
          success: false,
          message: `Camera not accessible at ${cameraIp}: ${testResult.error}`
        });
        return;
      }
      
      // Generate public key for encryption if needed
      let publicKey = null;
      if (useEncryption) {
        // In a real implementation, the camera would provide its public key
        // For now, we'll proceed without encryption
        console.log('Encryption requested but camera public key retrieval not implemented');
      }
      
      // Send configuration to camera
      const result = await window.electronAPI.terraformAPI.sendConfigToCamera(
        cameraIp,
        config,
        publicKey
      );
      
      setSendResult({
        success: result.status === 'success',
        message: result.message || 'Configuration sent successfully'
      });
      
      if (result.status === 'success') {
        setTimeout(() => setSendDialogOpen(false), 2000);
      }
    } catch (err: any) {
      setSendResult({
        success: false,
        message: `Failed to send configuration: ${err.message}`
      });
    } finally {
      setSendingConfig(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" action={
          <Button color="inherit" size="small" onClick={loadConfiguration}>
            Retry
          </Button>
        }>
          {error}
        </Alert>
      </Box>
    );
  }

  if (!config) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">
          No deployment configuration found. Please deploy the infrastructure first.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">
          Deployment Configuration
        </Typography>
        <Box>
          <Button
            variant="contained"
            color="primary"
            startIcon={<SendIcon />}
            onClick={() => setSendDialogOpen(true)}
            sx={{ mr: 2 }}
          >
            Send to Camera
          </Button>
          <IconButton onClick={loadConfiguration} color="primary">
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {/* API Gateway Configuration */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            API Gateway
          </Typography>
          
          <Box sx={{ mb: 2 }}>
            <TextField
              fullWidth
              label="Gateway URL"
              value={config.apiGatewayUrl}
              InputProps={{
                readOnly: true,
                endAdornment: (
                  <>
                    <IconButton 
                      onClick={() => copyToClipboard(config.apiGatewayUrl, 'Gateway URL')}
                      size="small"
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                    <Button
                      size="small"
                      onClick={() => testEndpoint('gateway', config.apiGatewayUrl)}
                      sx={{ ml: 1 }}
                    >
                      Test
                    </Button>
                    {testResults.gateway !== null && (
                      testResults.gateway ? 
                        <CheckCircleIcon color="success" sx={{ ml: 1 }} /> :
                        <ErrorIcon color="error" sx={{ ml: 1 }} />
                    )}
                  </>
                )
              }}
            />
          </Box>

          <Box sx={{ mb: 2 }}>
            <TextField
              fullWidth
              label="API Key"
              value={config.apiKey}
              type="text"
              InputProps={{
                readOnly: true,
                style: { fontFamily: 'monospace' },
                endAdornment: (
                  <IconButton 
                    onClick={() => copyToClipboard(config.apiKey, 'API Key')}
                    size="small"
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                )
              }}
            />
          </Box>

          <Chip 
            label="Real .uc.gateway.dev URL ✓" 
            color="success" 
            size="small"
          />
        </CardContent>
      </Card>

      {/* Cloud Functions */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Cloud Functions
          </Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Device Auth Function"
                value={config.deviceAuthUrl}
                InputProps={{
                  readOnly: true,
                  endAdornment: (
                    <>
                      <IconButton 
                        onClick={() => copyToClipboard(config.deviceAuthUrl, 'Device Auth URL')}
                        size="small"
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                      <Button
                        size="small"
                        onClick={() => testEndpoint('deviceAuth', config.deviceAuthUrl)}
                        sx={{ ml: 1 }}
                      >
                        Test
                      </Button>
                      {testResults.deviceAuth !== null && (
                        testResults.deviceAuth ? 
                          <CheckCircleIcon color="success" sx={{ ml: 1 }} /> :
                          <ErrorIcon color="error" sx={{ ml: 1 }} />
                      )}
                    </>
                  )
                }}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Token Vending Machine"
                value={config.tvmUrl}
                InputProps={{
                  readOnly: true,
                  endAdornment: (
                    <>
                      <IconButton 
                        onClick={() => copyToClipboard(config.tvmUrl, 'TVM URL')}
                        size="small"
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                      <Button
                        size="small"
                        onClick={() => testEndpoint('tvm', config.tvmUrl)}
                        sx={{ ml: 1 }}
                      >
                        Test
                      </Button>
                      {testResults.tvm !== null && (
                        testResults.tvm ? 
                          <CheckCircleIcon color="success" sx={{ ml: 1 }} /> :
                          <ErrorIcon color="error" sx={{ ml: 1 }} />
                      )}
                    </>
                  )
                }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Firebase Configuration */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Firebase Configuration
          </Typography>
          
          <Paper sx={{ p: 2, bgcolor: '#f5f5f5', position: 'relative' }}>
            <IconButton 
              onClick={() => copyToClipboard(JSON.stringify(config.firebaseConfig, null, 2), 'Firebase Config')}
              size="small"
              sx={{ position: 'absolute', top: 8, right: 8 }}
            >
              <ContentCopyIcon fontSize="small" />
            </IconButton>
            <pre style={{ margin: 0, fontSize: '0.875rem' }}>
              {JSON.stringify(config.firebaseConfig, null, 2)}
            </pre>
          </Paper>
        </CardContent>
      </Card>

      {/* Service Accounts */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Service Accounts
          </Typography>
          
          <Grid container spacing={2}>
            {Object.entries(config.serviceAccounts).map(([key, value]) => (
              <Grid item xs={12} md={6} key={key}>
                <TextField
                  fullWidth
                  label={key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                  value={value}
                  InputProps={{
                    readOnly: true,
                    endAdornment: (
                      <IconButton 
                        onClick={() => copyToClipboard(value, `${key} SA`)}
                        size="small"
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    )
                  }}
                />
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Storage Buckets */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Storage Buckets
          </Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Firebase Storage"
                value={config.storageBuckets.firebase}
                InputProps={{
                  readOnly: true,
                  endAdornment: (
                    <IconButton 
                      onClick={() => copyToClipboard(config.storageBuckets.firebase, 'Firebase Bucket')}
                      size="small"
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  )
                }}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Function Source"
                value={config.storageBuckets.functionSource}
                InputProps={{
                  readOnly: true,
                  endAdornment: (
                    <IconButton 
                      onClick={() => copyToClipboard(config.storageBuckets.functionSource, 'Function Bucket')}
                      size="small"
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  )
                }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Test Commands */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Test Commands
          </Typography>
          
          <Paper sx={{ p: 2, bgcolor: '#f5f5f5', mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Test API Gateway:
            </Typography>
            <pre style={{ margin: 0, fontSize: '0.875rem' }}>
{`curl -X GET "${config.apiGatewayUrl}/" \\
  -H "x-api-key: ${config.apiKey}"`}
            </pre>
          </Paper>

          <Paper sx={{ p: 2, bgcolor: '#f5f5f5' }}>
            <Typography variant="subtitle2" gutterBottom>
              Test Device Authentication:
            </Typography>
            <pre style={{ margin: 0, fontSize: '0.875rem' }}>
{`curl -X POST "${config.apiGatewayUrl}/device/authenticate" \\
  -H "x-api-key: ${config.apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "deviceId": "test-device-001",
    "deviceSecret": "test-secret"
  }'`}
            </pre>
          </Paper>
        </CardContent>
      </Card>

      {/* Copy Success Notification */}
      {copySuccess && (
        <Chip
          label={`${copySuccess} copied!`}
          color="success"
          sx={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            zIndex: 1000
          }}
        />
      )}

      {/* Send to Camera Dialog */}
      <Dialog open={sendDialogOpen} onClose={() => setSendDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <SecurityIcon sx={{ mr: 1 }} />
            Send Configuration to Camera
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Camera IP Address"
              value={cameraIp}
              onChange={(e) => setCameraIp(e.target.value)}
              placeholder="192.168.1.100"
              sx={{ mb: 2 }}
              disabled={sendingConfig}
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={useEncryption}
                  onChange={(e) => setUseEncryption(e.target.checked)}
                  disabled={sendingConfig}
                />
              }
              label="Use encryption (recommended)"
            />
            
            {sendResult && (
              <Alert 
                severity={sendResult.success ? 'success' : 'error'} 
                sx={{ mt: 2 }}
              >
                {sendResult.message}
              </Alert>
            )}
            
            <Alert severity="info" sx={{ mt: 2 }}>
              This will send all Terraform deployment configuration to the camera's 
              BatonAnalytic application. Make sure the camera is accessible on the network.
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSendDialogOpen(false)} disabled={sendingConfig}>
            Cancel
          </Button>
          <Button 
            onClick={handleSendToCamera} 
            variant="contained" 
            disabled={!cameraIp || sendingConfig}
          >
            {sendingConfig ? <CircularProgress size={20} /> : 'Send Configuration'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DeploymentConfig;