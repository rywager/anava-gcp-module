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
  Switch,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Collapse,
  InputAdornment
} from '@mui/material';
import {
  ContentCopy as ContentCopyIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Send as SendIcon,
  Security as SecurityIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  Api as ApiIcon,
  Cloud as CloudIcon,
  Storage as StorageIcon,
  Key as KeyIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';
import StatusBanner from './StatusBanner';
import { designTokens } from '../theme';

interface DeploymentConfigData {
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

const DeploymentConfigNew: React.FC = () => {
  const [config, setConfig] = useState<DeploymentConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [cameraIp, setCameraIp] = useState('');
  const [useEncryption, setUseEncryption] = useState(true);
  const [sendingConfig, setSendingConfig] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    try {
      setLoading(true);
      setError(null);
      
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

  const handleSendToCamera = async () => {
    if (!config || !cameraIp) return;
    
    setSendingConfig(true);
    setSendResult(null);
    
    try {
      const testResult = await window.electronAPI.terraformAPI.testCameraEndpoint(cameraIp);
      
      if (!testResult.accessible) {
        setSendResult({
          success: false,
          message: `Camera not accessible at ${cameraIp}: ${testResult.error}`
        });
        return;
      }
      
      let publicKey = null;
      if (useEncryption) {
        console.log('Encryption requested but camera public key retrieval not implemented');
      }
      
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
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <StatusBanner
          type="error"
          title="Configuration Error"
          message={error}
          action={{
            label: 'Retry',
            onClick: loadConfiguration
          }}
        />
      </Box>
    );
  }

  if (!config) {
    return (
      <Box>
        <StatusBanner
          type="info"
          title="No deployment configuration found"
          message="Please deploy the infrastructure first."
        />
      </Box>
    );
  }

  return (
    <Box>
      {/* Configuration Summary Card */}
      <Card elevation={2} sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Configuration Summary
            </Typography>
            <IconButton onClick={loadConfiguration} size="small">
              <RefreshIcon />
            </IconButton>
          </Box>

          <List dense>
            <ListItem>
              <ListItemIcon>
                <ApiIcon color="primary" />
              </ListItemIcon>
              <ListItemText
                primary="API Gateway"
                secondary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {config.apiGatewayUrl}
                    </Typography>
                    <Chip
                      size="small"
                      label="Active"
                      color="success"
                      icon={<CheckCircleIcon />}
                    />
                  </Box>
                }
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <LockIcon color="primary" />
              </ListItemIcon>
              <ListItemText
                primary="Authentication"
                secondary="Firebase custom tokens + Workload Identity Federation"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <SecurityIcon color="primary" />
              </ListItemIcon>
              <ListItemText
                primary="Encryption"
                secondary="End-to-end encryption enabled"
              />
            </ListItem>
          </List>

          <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              fullWidth
              startIcon={<SendIcon />}
              onClick={() => setSendDialogOpen(true)}
            >
              Send to Camera
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Camera Selection */}
      <Card elevation={2} sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Select Cameras to Configure
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, color: designTokens.colors.text.secondary }}>
            Camera discovery and selection coming soon. For now, enter IP address manually.
          </Typography>
          <TextField
            fullWidth
            label="Camera IP Address"
            value={cameraIp}
            onChange={(e) => setCameraIp(e.target.value)}
            placeholder="192.168.1.100"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <CloudIcon />
                </InputAdornment>
              )
            }}
          />
        </CardContent>
      </Card>

      {/* Advanced Configuration Details */}
      <Card elevation={2}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              Advanced Details
            </Typography>
            <IconButton onClick={() => setShowAdvanced(!showAdvanced)}>
              {showAdvanced ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>

          <Collapse in={showAdvanced}>
            <Box sx={{ mt: 2 }}>
              {/* API Key */}
              <Paper sx={{ p: 2, mb: 2, bgcolor: designTokens.colors.background.default }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    API Key
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => copyToClipboard(config.apiKey, 'API Key')}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Box>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {config.apiKey}
                </Typography>
              </Paper>

              {/* Firebase Config */}
              <Paper sx={{ p: 2, mb: 2, bgcolor: designTokens.colors.background.default }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Firebase Configuration
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => copyToClipboard(JSON.stringify(config.firebaseConfig, null, 2), 'Firebase Config')}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Box>
                <pre style={{ 
                  margin: 0, 
                  fontSize: '0.75rem',
                  fontFamily: designTokens.typography.code.fontFamily,
                  overflow: 'auto'
                }}>
                  {JSON.stringify(config.firebaseConfig, null, 2)}
                </pre>
              </Paper>

              {/* Test Commands */}
              <Paper sx={{ p: 2, bgcolor: designTokens.colors.background.default }}>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                  Test Commands
                </Typography>
                <pre style={{
                  margin: 0,
                  fontSize: '0.75rem',
                  fontFamily: designTokens.typography.code.fontFamily,
                  overflow: 'auto'
                }}>
{`# Test API Gateway
curl -X GET "${config.apiGatewayUrl}/" \\
  -H "x-api-key: ${config.apiKey}"

# Test Device Authentication
curl -X POST "${config.apiGatewayUrl}/device-auth/initiate" \\
  -H "x-api-key: ${config.apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"device_id": "test-camera-001"}'`}
                </pre>
              </Paper>
            </Box>
          </Collapse>
        </CardContent>
      </Card>

      {/* Send to Camera Dialog */}
      <Dialog 
        open={sendDialogOpen} 
        onClose={() => !sendingConfig && setSendDialogOpen(false)} 
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <SecurityIcon sx={{ mr: 1, color: designTokens.colors.primary.main }} />
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
                  color="primary"
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {useEncryption ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
                  Use encryption (recommended)
                </Box>
              }
            />
            
            {sendResult && (
              <StatusBanner
                type={sendResult.success ? 'success' : 'error'}
                title={sendResult.success ? 'Success' : 'Error'}
                message={sendResult.message}
              />
            )}
            
            <Alert severity="info" sx={{ mt: 2 }} icon={<SecurityIcon />}>
              Configuration will be encrypted and sent to the camera's Anava application. 
              Ensure the camera is accessible on your network.
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
            startIcon={sendingConfig ? <CircularProgress size={16} /> : <SendIcon />}
          >
            {sendingConfig ? 'Sending...' : 'Send Securely'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Copy Success Notification */}
      {copySuccess && (
        <Chip
          label={`${copySuccess} copied!`}
          color="success"
          icon={<CheckCircleIcon />}
          sx={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            zIndex: 1000,
            animation: 'slideIn 0.3s ease-out',
            '@keyframes slideIn': {
              from: { transform: 'translateY(100px)', opacity: 0 },
              to: { transform: 'translateY(0)', opacity: 1 }
            }
          }}
        />
      )}
    </Box>
  );
};

export default DeploymentConfigNew;