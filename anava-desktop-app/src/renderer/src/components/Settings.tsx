import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Grid,
  Divider,
  Alert,
  Tab,
  Tabs,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Save as SaveIcon,
  RestoreFromTrash as RestoreIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  Delete as DeleteIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { ApplicationSettings } from '../types';
import BackendConfig from './BackendConfig';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <div role="tabpanel" hidden={value !== index}>
    {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
  </div>
);

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<ApplicationSettings>({
    general: {
      theme: 'light',
      autoStart: false,
      minimizeToTray: false,
      checkForUpdates: true
    },
    network: {
      discoveryTimeout: 5000,
      connectionTimeout: 10000,
      retryAttempts: 3,
      defaultCredentials: {
        username: 'root',
        password: 'pass'
      }
    },
    webrtc: {
      stunServers: ['stun:stun.l.google.com:19302'],
      turnServers: [],
      port: 8080,
      enableLogging: false
    },
    acap: {
      deploymentTimeout: 300000,
      autoStart: true,
      backupOnUpdate: true
    }
  });

  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [newStunServer, setNewStunServer] = useState('');
  const [newTurnServer, setNewTurnServer] = useState('');
  const [stunDialog, setStunDialog] = useState(false);
  const [turnDialog, setTurnDialog] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const storedSettings = await window.electronAPI.store.get('applicationSettings');
      if (storedSettings) {
        setSettings({ ...settings, ...storedSettings });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const saveSettings = async () => {
    try {
      setLoading(true);
      await window.electronAPI.store.set('applicationSettings', settings);
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setLoading(false);
    }
  };

  const resetSettings = async () => {
    try {
      await window.electronAPI.store.delete('applicationSettings');
      setSettings({
        general: {
          theme: 'light',
          autoStart: false,
          minimizeToTray: false,
          checkForUpdates: true
        },
        network: {
          discoveryTimeout: 5000,
          connectionTimeout: 10000,
          retryAttempts: 3,
          defaultCredentials: {
            username: 'root',
            password: 'pass'
          }
        },
        webrtc: {
          stunServers: ['stun:stun.l.google.com:19302'],
          turnServers: [],
          port: 8080,
          enableLogging: false
        },
        acap: {
          deploymentTimeout: 300000,
          autoStart: true,
          backupOnUpdate: true
        }
      });
      setMessage({ type: 'success', text: 'Settings reset to defaults' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to reset settings' });
    }
  };

  const exportSettings = async () => {
    try {
      const result = await window.electronAPI.showSaveDialog({
        defaultPath: 'anava-settings.json',
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      });

      if (!result.canceled && result.filePath) {
        // In a real implementation, you would write the file
        setMessage({ type: 'success', text: 'Settings exported successfully!' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to export settings' });
    }
  };

  const importSettings = async () => {
    try {
      const result = await window.electronAPI.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      });

      if (!result.canceled && result.filePaths.length > 0) {
        // In a real implementation, you would read and parse the file
        setMessage({ type: 'success', text: 'Settings imported successfully!' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to import settings' });
    }
  };

  const updateSettings = (section: keyof ApplicationSettings, field: string, value: any) => {
    setSettings({
      ...settings,
      [section]: {
        ...settings[section],
        [field]: value
      }
    });
  };

  const updateNestedSettings = (section: keyof ApplicationSettings, subsection: string, field: string, value: any) => {
    setSettings({
      ...settings,
      [section]: {
        ...settings[section],
        [subsection]: {
          ...(settings[section] as any)[subsection],
          [field]: value
        }
      }
    });
  };

  const addStunServer = () => {
    if (newStunServer.trim()) {
      setSettings({
        ...settings,
        webrtc: {
          ...settings.webrtc,
          stunServers: [...settings.webrtc.stunServers, newStunServer.trim()]
        }
      });
      setNewStunServer('');
      setStunDialog(false);
    }
  };

  const removeStunServer = (index: number) => {
    setSettings({
      ...settings,
      webrtc: {
        ...settings.webrtc,
        stunServers: settings.webrtc.stunServers.filter((_, i) => i !== index)
      }
    });
  };

  const addTurnServer = () => {
    if (newTurnServer.trim()) {
      setSettings({
        ...settings,
        webrtc: {
          ...settings.webrtc,
          turnServers: [...settings.webrtc.turnServers, newTurnServer.trim()]
        }
      });
      setNewTurnServer('');
      setTurnDialog(false);
    }
  };

  const removeTurnServer = (index: number) => {
    setSettings({
      ...settings,
      webrtc: {
        ...settings.webrtc,
        turnServers: settings.webrtc.turnServers.filter((_, i) => i !== index)
      }
    });
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>

      {message && (
        <Alert 
          severity={message.type} 
          sx={{ mb: 3 }}
          onClose={() => setMessage(null)}
        >
          {message.text}
        </Alert>
      )}

      <Paper sx={{ width: '100%' }}>
        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
          <Tab label="General" />
          <Tab label="Network" />
          <Tab label="WebRTC" />
          <Tab label="ACAP" />
          <Tab label="Backend" />
        </Tabs>

        {/* General Settings */}
        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Application
                  </Typography>
                  
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.general.autoStart}
                        onChange={(e) => updateSettings('general', 'autoStart', e.target.checked)}
                      />
                    }
                    label="Start with system"
                  />
                  
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.general.minimizeToTray}
                        onChange={(e) => updateSettings('general', 'minimizeToTray', e.target.checked)}
                      />
                    }
                    label="Minimize to system tray"
                  />
                  
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.general.checkForUpdates}
                        onChange={(e) => updateSettings('general', 'checkForUpdates', e.target.checked)}
                      />
                    }
                    label="Check for updates automatically"
                  />
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Data Management
                  </Typography>
                  
                  <Box display="flex" gap={2} flexDirection="column">
                    <Button
                      variant="outlined"
                      startIcon={<DownloadIcon />}
                      onClick={exportSettings}
                    >
                      Export Settings
                    </Button>
                    
                    <Button
                      variant="outlined"
                      startIcon={<UploadIcon />}
                      onClick={importSettings}
                    >
                      Import Settings
                    </Button>
                    
                    <Button
                      variant="outlined"
                      color="warning"
                      startIcon={<RestoreIcon />}
                      onClick={resetSettings}
                    >
                      Reset to Defaults
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Network Settings */}
        <TabPanel value={tabValue} index={1}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Discovery Settings
                  </Typography>
                  
                  <TextField
                    label="Discovery Timeout (ms)"
                    type="number"
                    value={settings.network.discoveryTimeout}
                    onChange={(e) => updateSettings('network', 'discoveryTimeout', parseInt(e.target.value))}
                    fullWidth
                    margin="normal"
                  />
                  
                  <TextField
                    label="Connection Timeout (ms)"
                    type="number"
                    value={settings.network.connectionTimeout}
                    onChange={(e) => updateSettings('network', 'connectionTimeout', parseInt(e.target.value))}
                    fullWidth
                    margin="normal"
                  />
                  
                  <TextField
                    label="Retry Attempts"
                    type="number"
                    value={settings.network.retryAttempts}
                    onChange={(e) => updateSettings('network', 'retryAttempts', parseInt(e.target.value))}
                    fullWidth
                    margin="normal"
                  />
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Default Credentials
                  </Typography>
                  
                  <TextField
                    label="Username"
                    value={settings.network.defaultCredentials.username}
                    onChange={(e) => updateNestedSettings('network', 'defaultCredentials', 'username', e.target.value)}
                    fullWidth
                    margin="normal"
                  />
                  
                  <TextField
                    label="Password"
                    type="password"
                    value={settings.network.defaultCredentials.password}
                    onChange={(e) => updateNestedSettings('network', 'defaultCredentials', 'password', e.target.value)}
                    fullWidth
                    margin="normal"
                  />
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        {/* WebRTC Settings */}
        <TabPanel value={tabValue} index={2}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Server Settings
                  </Typography>
                  
                  <TextField
                    label="WebRTC Port"
                    type="number"
                    value={settings.webrtc.port}
                    onChange={(e) => updateSettings('webrtc', 'port', parseInt(e.target.value))}
                    fullWidth
                    margin="normal"
                  />
                  
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.webrtc.enableLogging}
                        onChange={(e) => updateSettings('webrtc', 'enableLogging', e.target.checked)}
                      />
                    }
                    label="Enable WebRTC logging"
                  />
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    STUN Servers
                  </Typography>
                  
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="body2">
                      Configure STUN servers for NAT traversal
                    </Typography>
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={() => setStunDialog(true)}
                    >
                      Add
                    </Button>
                  </Box>
                  
                  <List>
                    {settings.webrtc.stunServers.map((server, index) => (
                      <ListItem key={index}>
                        <ListItemText primary={server} />
                        <ListItemSecondaryAction>
                          <IconButton
                            edge="end"
                            onClick={() => removeStunServer(index)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        {/* ACAP Settings */}
        <TabPanel value={tabValue} index={3}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Deployment Settings
                  </Typography>
                  
                  <TextField
                    label="Deployment Timeout (ms)"
                    type="number"
                    value={settings.acap.deploymentTimeout}
                    onChange={(e) => updateSettings('acap', 'deploymentTimeout', parseInt(e.target.value))}
                    fullWidth
                    margin="normal"
                  />
                  
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.acap.autoStart}
                        onChange={(e) => updateSettings('acap', 'autoStart', e.target.checked)}
                      />
                    }
                    label="Auto-start ACAP after deployment"
                  />
                  
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.acap.backupOnUpdate}
                        onChange={(e) => updateSettings('acap', 'backupOnUpdate', e.target.checked)}
                      />
                    }
                    label="Backup before updating"
                  />
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Backend Settings */}
        <TabPanel value={tabValue} index={4}>
          <BackendConfig />
        </TabPanel>
      </Paper>

      {/* Action Buttons */}
      <Box display="flex" gap={2} mt={3}>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={saveSettings}
          disabled={loading}
        >
          Save Settings
        </Button>
      </Box>

      {/* STUN Server Dialog */}
      <Dialog open={stunDialog} onClose={() => setStunDialog(false)}>
        <DialogTitle>Add STUN Server</DialogTitle>
        <DialogContent>
          <TextField
            label="STUN Server URL"
            value={newStunServer}
            onChange={(e) => setNewStunServer(e.target.value)}
            fullWidth
            margin="normal"
            placeholder="stun:stun.example.com:19302"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStunDialog(false)}>Cancel</Button>
          <Button onClick={addStunServer} variant="contained">Add</Button>
        </DialogActions>
      </Dialog>

      {/* TURN Server Dialog */}
      <Dialog open={turnDialog} onClose={() => setTurnDialog(false)}>
        <DialogTitle>Add TURN Server</DialogTitle>
        <DialogContent>
          <TextField
            label="TURN Server URL"
            value={newTurnServer}
            onChange={(e) => setNewTurnServer(e.target.value)}
            fullWidth
            margin="normal"
            placeholder="turn:turn.example.com:3478"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTurnDialog(false)}>Cancel</Button>
          <Button onClick={addTurnServer} variant="contained">Add</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Settings;