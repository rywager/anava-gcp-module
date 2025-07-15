import React, { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Chip,
  Button,
  LinearProgress
} from '@mui/material';
import {
  Videocam as VideocamIcon,
  CloudUpload as CloudUploadIcon,
  Hub as HubIcon,
  Chat as ChatIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { Camera } from '../types';

interface DashboardStats {
  totalCameras: number;
  activeCameras: number;
  acapDeployments: number;
  webrtcConnections: number;
  chatSessions: number;
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalCameras: 0,
    activeCameras: 0,
    acapDeployments: 0,
    webrtcConnections: 0,
    chatSessions: 0
  });
  const [loading, setLoading] = useState(true);
  const [recentCameras, setRecentCameras] = useState<Camera[]>([]);
  const [systemStatus, setSystemStatus] = useState<'healthy' | 'warning' | 'error'>('healthy');
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load cameras from store
      const cameras = await window.electronAPI.store.get('discoveredCameras') || [];
      const activeCameras = cameras.filter((camera: Camera) => camera.status === 'accessible');
      
      // Load other stats from store
      const deployments = await window.electronAPI.store.get('acapDeployments') || [];
      const connections = await window.electronAPI.store.get('webrtcConnections') || [];
      const chatSessions = await window.electronAPI.store.get('chatSessions') || [];
      
      setStats({
        totalCameras: cameras.length,
        activeCameras: activeCameras.length,
        acapDeployments: deployments.length,
        webrtcConnections: connections.length,
        chatSessions: chatSessions.length
      });
      
      setRecentCameras(cameras.slice(-5)); // Show last 5 discovered cameras
      
      // Determine system status
      const systemHealth = await checkSystemHealth();
      setSystemStatus(systemHealth);
      
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkSystemHealth = async (): Promise<'healthy' | 'warning' | 'error'> => {
    try {
      // Check if WebRTC orchestrator is running
      const webrtcStatus = await window.electronAPI.store.get('webrtcOrchestratorStatus');
      
      // Check if any cameras are offline or need auth
      const cameras = await window.electronAPI.store.get('discoveredCameras') || [];
      const offlineCameras = cameras.filter((camera: Camera) => camera.status === 'offline');
      const needAuthCameras = cameras.filter((camera: Camera) => camera.status === 'requires_auth');
      
      if (offlineCameras.length > 0) {
        return 'warning';
      }
      
      if (needAuthCameras.length > 0 && cameras.length > 0) {
        return 'warning'; // Some cameras need authentication
      }
      
      if (!webrtcStatus || webrtcStatus !== 'running') {
        // Don't warn about WebRTC not running if it's just not started yet
        // return 'warning';
      }
      
      return 'healthy';
    } catch (error) {
      return 'error';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'success';
      case 'warning': return 'warning';
      case 'error': return 'error';
      default: return 'info';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircleIcon />;
      case 'warning': return <WarningIcon />;
      case 'error': return <ErrorIcon />;
      default: return <CheckCircleIcon />;
    }
  };

  const StatCard: React.FC<{ title: string; value: number; icon: React.ReactNode; color: string }> = ({
    title,
    value,
    icon,
    color
  }) => (
    <Card sx={{ height: '100%', display: 'flex', alignItems: 'center' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        <Box sx={{ color: color, mr: 2 }}>
          {icon}
        </Box>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" component="div" fontWeight="bold">
            {value}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {title}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      
      {/* System Status */}
      <Alert 
        severity={getStatusColor(systemStatus) as any}
        icon={getStatusIcon(systemStatus)}
        sx={{ mb: 3 }}
      >
        <Typography variant="body1">
          System Status: {systemStatus.charAt(0).toUpperCase() + systemStatus.slice(1)}
          {systemStatus === 'warning' && stats.totalCameras > 0 && (
            <span> - Some cameras require authentication. Please check camera credentials.</span>
          )}
        </Typography>
      </Alert>

      {/* Stats Grid */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard
            title="Total Cameras"
            value={stats.totalCameras}
            icon={<VideocamIcon fontSize="large" />}
            color="#1976d2"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard
            title="Active Cameras"
            value={stats.activeCameras}
            icon={<CheckCircleIcon fontSize="large" />}
            color="#2e7d32"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard
            title="ACAP Deployments"
            value={stats.acapDeployments}
            icon={<CloudUploadIcon fontSize="large" />}
            color="#ed6c02"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard
            title="WebRTC Connections"
            value={stats.webrtcConnections}
            icon={<HubIcon fontSize="large" />}
            color="#9c27b0"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard
            title="Chat Sessions"
            value={stats.chatSessions}
            icon={<ChatIcon fontSize="large" />}
            color="#d32f2f"
          />
        </Grid>
      </Grid>

      {/* Recent Activity */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recently Discovered Cameras
              </Typography>
              {recentCameras.length === 0 ? (
                <Typography variant="body2" color="textSecondary">
                  No cameras discovered yet. Start by scanning your network.
                </Typography>
              ) : (
                <Box>
                  {recentCameras.map((camera, index) => (
                    <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <VideocamIcon sx={{ mr: 2, color: '#1976d2' }} />
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="body2" fontWeight="bold">
                          {camera.manufacturer} {camera.model}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {camera.ip} • {camera.type}
                        </Typography>
                      </Box>
                      <Chip
                        label={camera.status}
                        size="small"
                        color={camera.status === 'accessible' ? 'success' : 'warning'}
                      />
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Quick Actions
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Button
                  variant="contained"
                  startIcon={scanning ? <CircularProgress size={20} /> : <VideocamIcon />}
                  onClick={async () => {
                    setScanning(true);
                    try {
                      await window.electronAPI.scanNetworkForCameras();
                      // Reload dashboard data after scan
                      await loadDashboardData();
                    } catch (error) {
                      console.error('Error scanning:', error);
                    } finally {
                      setScanning(false);
                    }
                  }}
                  disabled={scanning}
                >
                  {scanning ? 'Scanning...' : 'Scan for Cameras'}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<CloudUploadIcon />}
                  onClick={() => {
                    // Navigate to ACAP deployment
                    window.location.hash = '#acap';
                  }}
                >
                  Deploy ACAP
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<HubIcon />}
                  onClick={() => {
                    // Navigate to WebRTC orchestrator
                    window.location.hash = '#webrtc';
                  }}
                >
                  Start WebRTC Orchestrator
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;