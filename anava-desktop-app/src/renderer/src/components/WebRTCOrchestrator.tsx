import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Alert,
  Switch,
  FormControlLabel,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Visibility as VisibilityIcon,
  Delete as DeleteIcon,
  Hub as HubIcon
} from '@mui/icons-material';

interface WebRTCStatus {
  isRunning: boolean;
  port: number;
  connections: number;
  rooms: number;
  uptime: number;
}

interface WebRTCConnection {
  id: string;
  type: 'socket.io' | 'websocket';
  connectedAt: string;
  roomId: string | null;
  peerId?: string;
}

interface WebRTCRoom {
  id: string;
  peers: string[];
  createdAt: string;
}

const WebRTCOrchestrator: React.FC = () => {
  const [status, setStatus] = useState<WebRTCStatus>({
    isRunning: false,
    port: 8080,
    connections: 0,
    rooms: 0,
    uptime: 0
  });
  const [connections, setConnections] = useState<WebRTCConnection[]>([]);
  const [rooms, setRooms] = useState<WebRTCRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [port, setPort] = useState(8080);
  const [autoStart, setAutoStart] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<WebRTCRoom | null>(null);
  const [roomDialog, setRoomDialog] = useState(false);

  useEffect(() => {
    loadStatus();
    loadSettings();
    
    // Set up periodic status updates
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const webrtcStatus = await window.electronAPI.store.get('webrtcOrchestratorStatus');
      if (webrtcStatus) {
        setStatus(webrtcStatus);
      }
    } catch (err) {
      console.error('Error loading WebRTC status:', err);
    }
  };

  const loadSettings = async () => {
    try {
      const settings = await window.electronAPI.store.get('webrtcSettings') || {};
      setPort(settings.port || 8080);
      setAutoStart(settings.autoStart || false);
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  };

  const loadConnections = async () => {
    try {
      const connectionList = await window.electronAPI.store.get('webrtcConnections') || [];
      setConnections(connectionList);
    } catch (err) {
      console.error('Error loading connections:', err);
    }
  };

  const loadRooms = async () => {
    try {
      const roomList = await window.electronAPI.store.get('webrtcRooms') || [];
      setRooms(roomList);
    } catch (err) {
      console.error('Error loading rooms:', err);
    }
  };

  const startOrchestrator = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await window.electronAPI.startWebRTCOrchestrator(port);
      
      if (result.success) {
        setStatus({
          isRunning: true,
          port: result.port,
          connections: 0,
          rooms: 0,
          uptime: 0
        });
        
        // Save status to store
        await window.electronAPI.store.set('webrtcOrchestratorStatus', {
          isRunning: true,
          port: result.port,
          connections: 0,
          rooms: 0,
          uptime: 0
        });
        
        loadConnections();
        loadRooms();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start WebRTC orchestrator');
    } finally {
      setLoading(false);
    }
  };

  const stopOrchestrator = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await window.electronAPI.stopWebRTCOrchestrator();
      
      if (result.success) {
        setStatus({
          isRunning: false,
          port: 0,
          connections: 0,
          rooms: 0,
          uptime: 0
        });
        
        // Update store
        await window.electronAPI.store.set('webrtcOrchestratorStatus', {
          isRunning: false,
          port: 0,
          connections: 0,
          rooms: 0,
          uptime: 0
        });
        
        setConnections([]);
        setRooms([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop WebRTC orchestrator');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      const settings = {
        port,
        autoStart
      };
      
      await window.electronAPI.store.set('webrtcSettings', settings);
    } catch (err) {
      console.error('Error saving settings:', err);
    }
  };

  const openRoomDialog = (room: WebRTCRoom) => {
    setSelectedRoom(room);
    setRoomDialog(true);
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}h ${minutes}m ${secs}s`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        WebRTC Orchestrator
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Status and Controls */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Typography variant="h6">Orchestrator Status</Typography>
                <Chip
                  label={status.isRunning ? 'Running' : 'Stopped'}
                  color={status.isRunning ? 'success' : 'default'}
                  icon={<HubIcon />}
                />
              </Box>
              
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Port</Typography>
                  <Typography variant="h6">{status.port || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Uptime</Typography>
                  <Typography variant="h6">
                    {status.isRunning ? formatUptime(status.uptime) : 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Connections</Typography>
                  <Typography variant="h6">{status.connections}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Rooms</Typography>
                  <Typography variant="h6">{status.rooms}</Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Controls</Typography>
              
              <Box mb={2}>
                <TextField
                  label="Port"
                  type="number"
                  value={port}
                  onChange={(e) => setPort(parseInt(e.target.value))}
                  disabled={status.isRunning}
                  size="small"
                  sx={{ mr: 2 }}
                />
                
                <FormControlLabel
                  control={
                    <Switch
                      checked={autoStart}
                      onChange={(e) => {
                        setAutoStart(e.target.checked);
                        saveSettings();
                      }}
                    />
                  }
                  label="Auto-start"
                />
              </Box>
              
              <Box display="flex" gap={2}>
                <Button
                  variant="contained"
                  startIcon={status.isRunning ? <StopIcon /> : <PlayIcon />}
                  onClick={status.isRunning ? stopOrchestrator : startOrchestrator}
                  disabled={loading}
                  color={status.isRunning ? 'error' : 'primary'}
                >
                  {status.isRunning ? 'Stop' : 'Start'}
                </Button>
                
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={() => {
                    loadConnections();
                    loadRooms();
                  }}
                  disabled={!status.isRunning}
                >
                  Refresh
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Active Connections */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Active Connections</Typography>
              
              {connections.length === 0 ? (
                <Typography variant="body2" color="textSecondary">
                  No active connections
                </Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>ID</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Room</TableCell>
                        <TableCell>Connected</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {connections.map((connection) => (
                        <TableRow key={connection.id}>
                          <TableCell>{connection.id.substring(0, 8)}...</TableCell>
                          <TableCell>
                            <Chip
                              label={connection.type}
                              size="small"
                              color={connection.type === 'socket.io' ? 'primary' : 'secondary'}
                            />
                          </TableCell>
                          <TableCell>
                            {connection.roomId ? (
                              <Chip label={connection.roomId} size="small" />
                            ) : (
                              'None'
                            )}
                          </TableCell>
                          <TableCell>{formatDate(connection.connectedAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Active Rooms</Typography>
              
              {rooms.length === 0 ? (
                <Typography variant="body2" color="textSecondary">
                  No active rooms
                </Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Room ID</TableCell>
                        <TableCell>Peers</TableCell>
                        <TableCell>Created</TableCell>
                        <TableCell>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rooms.map((room) => (
                        <TableRow key={room.id}>
                          <TableCell>{room.id}</TableCell>
                          <TableCell>
                            <Chip label={room.peers.length} size="small" />
                          </TableCell>
                          <TableCell>{formatDate(room.createdAt)}</TableCell>
                          <TableCell>
                            <IconButton
                              size="small"
                              onClick={() => openRoomDialog(room)}
                            >
                              <VisibilityIcon />
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
        </Grid>
      </Grid>

      {/* Room Details Dialog */}
      <Dialog open={roomDialog} onClose={() => setRoomDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Room Details</DialogTitle>
        <DialogContent>
          {selectedRoom && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Room: {selectedRoom.id}
              </Typography>
              
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Created: {formatDate(selectedRoom.createdAt)}
              </Typography>
              
              <Typography variant="subtitle1" gutterBottom>
                Peers ({selectedRoom.peers.length}):
              </Typography>
              
              <Box display="flex" flexWrap="wrap" gap={1}>
                {selectedRoom.peers.map((peerId) => (
                  <Chip key={peerId} label={peerId} />
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoomDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WebRTCOrchestrator;