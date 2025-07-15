import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Link
} from '@mui/material';
import {
  CloudUpload as CloudIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon
} from '@mui/icons-material';

interface BackendConfig {
  url: string;
  apiKey?: string;
  projectId?: string;
  isConnected: boolean;
  lastChecked?: string;
}

const BackendConfig: React.FC = () => {
  const [config, setConfig] = useState<BackendConfig>({
    url: 'https://anava-deploy-392865621461.us-central1.run.app',
    isConnected: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const savedConfig = await window.electronAPI.store.get('backendConfig');
      if (savedConfig) {
        setConfig(savedConfig);
      }
    } catch (err) {
      console.error('Error loading backend config:', err);
    }
  };

  const testConnection = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      
      // Test connection to terraform-installer backend
      const response = await fetch(`${config.url}/api/health`);
      
      if (response.ok) {
        const updatedConfig = {
          ...config,
          isConnected: true,
          lastChecked: new Date().toISOString()
        };
        
        setConfig(updatedConfig);
        await window.electronAPI.store.set('backendConfig', updatedConfig);
        setSuccess('✅ Successfully connected to terraform-installer backend!');
      } else {
        throw new Error(`Connection failed: ${response.status} ${response.statusText}`);
      }
    } catch (err: any) {
      setError(`❌ Failed to connect: ${err.message}`);
      const updatedConfig = {
        ...config,
        isConnected: false
      };
      setConfig(updatedConfig);
      await window.electronAPI.store.set('backendConfig', updatedConfig);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    try {
      await window.electronAPI.store.set('backendConfig', config);
      setSuccess('Configuration saved');
      // Test connection after saving
      await testConnection();
    } catch (err: any) {
      setError(`Failed to save configuration: ${err.message}`);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Backend Configuration
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          Connect to your terraform-installer backend to enable cloud deployment and configuration management.
          The backend handles Google Cloud authentication and manages deployment secrets securely.
        </Typography>
      </Alert>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Card>
        <CardContent>
          <Box display="flex" alignItems="center" gap={2} mb={3}>
            <CloudIcon color="primary" />
            <Typography variant="h6">
              Terraform Installer Backend
            </Typography>
            <Chip
              label={config.isConnected ? 'Connected' : 'Disconnected'}
              color={config.isConnected ? 'success' : 'default'}
              size="small"
              icon={config.isConnected ? <CheckIcon /> : <ErrorIcon />}
            />
          </Box>

          <TextField
            label="Backend URL"
            fullWidth
            value={config.url}
            onChange={(e) => setConfig({ ...config, url: e.target.value })}
            placeholder="https://anava-deploy-392865621461.us-central1.run.app"
            sx={{ mb: 2 }}
            helperText="URL of your deployed terraform-installer backend"
          />

          <TextField
            label="API Key (Optional)"
            fullWidth
            type="password"
            value={config.apiKey || ''}
            onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
            sx={{ mb: 2 }}
            helperText="API key for authentication if required"
          />

          <TextField
            label="Project ID (Optional)"
            fullWidth
            value={config.projectId || ''}
            onChange={(e) => setConfig({ ...config, projectId: e.target.value })}
            sx={{ mb: 3 }}
            helperText="Google Cloud project ID for deployment"
          />

          {config.lastChecked && (
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Last checked: {new Date(config.lastChecked).toLocaleString()}
            </Typography>
          )}

          <Box display="flex" gap={2}>
            <Button
              variant="contained"
              onClick={saveConfig}
              disabled={loading}
            >
              Save Configuration
            </Button>
            <Button
              variant="outlined"
              onClick={testConnection}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : undefined}
            >
              {loading ? 'Testing...' : 'Test Connection'}
            </Button>
          </Box>

          <Box mt={3} p={2} bgcolor="grey.100" borderRadius={1}>
            <Typography variant="body2" gutterBottom>
              <strong>Backend Features:</strong>
            </Typography>
            <Typography variant="body2" component="ul" sx={{ pl: 2 }}>
              <li>Google Cloud authentication via OAuth</li>
              <li>Secure secret management with Google Secret Manager</li>
              <li>Automated infrastructure deployment</li>
              <li>STUN/TURN server configuration</li>
              <li>WebRTC signaling server endpoints</li>
            </Typography>
          </Box>

          <Box mt={2}>
            <Typography variant="body2" color="textSecondary">
              Need to deploy the backend? Visit{' '}
              <Link href="https://github.com/yourusername/terraform-installer" target="_blank">
                terraform-installer repository
              </Link>
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default BackendConfig;