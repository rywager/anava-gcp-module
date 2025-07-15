import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  Grid,
  Paper,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Send as SendIcon,
  Videocam as VideocamIcon,
  Person as PersonIcon,
  Settings as SettingsIcon,
  Image as ImageIcon,
  Videocam as VideoIcon,
  MoreVert as MoreVertIcon,
  QrCode as QrCodeIcon
} from '@mui/icons-material';
import { Camera, ChatMessage } from '../types';
import { useCameraContext } from '../context/CameraContext';

const ChatInterface: React.FC = () => {
  const { cameras, selectedCamera, setSelectedCamera } = useCameraContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [activeCameras, setActiveCameras] = useState<Camera[]>([]);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [qrDialog, setQrDialog] = useState(false);
  const [qrCode, setQrCode] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Filter cameras that are accessible and have chat capabilities
    const chatCapableCameras = cameras.filter(camera => 
      camera.status === 'accessible' && 
      camera.capabilities.includes('ACAP')
    );
    setActiveCameras(chatCapableCameras);
    
    // Set first camera as selected if none selected
    if (!selectedCamera && chatCapableCameras.length > 0) {
      setSelectedCamera(chatCapableCameras[0]);
    }
  }, [cameras, selectedCamera, setSelectedCamera]);

  useEffect(() => {
    // Load chat messages for selected camera
    if (selectedCamera) {
      loadMessages(selectedCamera.id);
    }
  }, [selectedCamera]);

  useEffect(() => {
    // Scroll to bottom of messages
    scrollToBottom();
  }, [messages]);

  const loadMessages = async (cameraId: string) => {
    try {
      const storedMessages = await window.electronAPI.store.get(`chatMessages_${cameraId}`) || [];
      setMessages(storedMessages);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const saveMessages = async (cameraId: string, messages: ChatMessage[]) => {
    try {
      await window.electronAPI.store.set(`chatMessages_${cameraId}`, messages);
    } catch (error) {
      console.error('Error saving messages:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedCamera) return;

    const message: ChatMessage = {
      id: Date.now().toString(),
      cameraId: selectedCamera.id,
      type: 'text',
      content: newMessage,
      timestamp: new Date().toISOString(),
      sender: 'user'
    };

    const updatedMessages = [...messages, message];
    setMessages(updatedMessages);
    setNewMessage('');

    // Save to store
    await saveMessages(selectedCamera.id, updatedMessages);

    // Simulate camera response (in real implementation, this would come from the camera)
    setTimeout(() => {
      const response: ChatMessage = {
        id: (Date.now() + 1).toString(),
        cameraId: selectedCamera.id,
        type: 'text',
        content: `Camera ${selectedCamera.ip} received: "${newMessage}"`,
        timestamp: new Date().toISOString(),
        sender: 'camera'
      };

      const newMessages = [...updatedMessages, response];
      setMessages(newMessages);
      saveMessages(selectedCamera.id, newMessages);
    }, 1000);
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const generateQRCode = async () => {
    if (!selectedCamera) return;
    
    try {
      const connectionData = {
        cameraId: selectedCamera.id,
        ip: selectedCamera.ip,
        type: 'chat_connection',
        timestamp: new Date().toISOString()
      };
      
      const qrCodeData = await window.electronAPI.generateQRCode(JSON.stringify(connectionData));
      setQrCode(qrCodeData);
      setQrDialog(true);
    } catch (error) {
      console.error('Error generating QR code:', error);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getSenderAvatar = (sender: string) => {
    switch (sender) {
      case 'user':
        return <PersonIcon />;
      case 'camera':
        return <VideocamIcon />;
      case 'system':
        return <SettingsIcon />;
      default:
        return <PersonIcon />;
    }
  };

  const getSenderColor = (sender: string) => {
    switch (sender) {
      case 'user':
        return '#1976d2';
      case 'camera':
        return '#2e7d32';
      case 'system':
        return '#ed6c02';
      default:
        return '#666';
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Chat Interface
      </Typography>

      <Grid container spacing={3}>
        {/* Camera List */}
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Active Cameras
              </Typography>
              
              {activeCameras.length === 0 ? (
                <Typography variant="body2" color="textSecondary">
                  No chat-capable cameras found. Deploy ACAP to cameras first.
                </Typography>
              ) : (
                <List>
                  {activeCameras.map((camera) => (
                    <ListItem
                      key={camera.id}
                      button
                      selected={selectedCamera?.id === camera.id}
                      onClick={() => setSelectedCamera(camera)}
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: getSenderColor('camera') }}>
                          <VideocamIcon />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={`${camera.manufacturer} ${camera.model}`}
                        secondary={camera.ip}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Chat Area */}
        <Grid item xs={12} md={9}>
          <Card sx={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
            {/* Chat Header */}
            <CardContent sx={{ borderBottom: 1, borderColor: 'divider', py: 1 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="h6">
                    {selectedCamera ? `${selectedCamera.manufacturer} ${selectedCamera.model}` : 'Select Camera'}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    {selectedCamera ? selectedCamera.ip : 'No camera selected'}
                  </Typography>
                </Box>
                
                <Box>
                  <IconButton onClick={generateQRCode} disabled={!selectedCamera}>
                    <QrCodeIcon />
                  </IconButton>
                  <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)}>
                    <MoreVertIcon />
                  </IconButton>
                </Box>
              </Box>
            </CardContent>

            {/* Messages */}
            <Box sx={{ flexGrow: 1, overflow: 'auto', p: 1 }}>
              {selectedCamera ? (
                <List>
                  {messages.map((message) => (
                    <ListItem key={message.id} alignItems="flex-start">
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: getSenderColor(message.sender) }}>
                          {getSenderAvatar(message.sender)}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="body2" fontWeight="bold">
                              {message.sender === 'user' ? 'You' : 
                               message.sender === 'camera' ? 'Camera' : 'System'}
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                              {formatTimestamp(message.timestamp)}
                            </Typography>
                            <Chip label={message.type} size="small" />
                          </Box>
                        }
                        secondary={
                          <Paper sx={{ p: 1, mt: 1, backgroundColor: '#f5f5f5' }}>
                            <Typography variant="body2">
                              {message.content}
                            </Typography>
                          </Paper>
                        }
                      />
                    </ListItem>
                  ))}
                  <div ref={messagesEndRef} />
                </List>
              ) : (
                <Box 
                  display="flex" 
                  justifyContent="center" 
                  alignItems="center" 
                  height="100%"
                >
                  <Typography variant="body2" color="textSecondary">
                    Select a camera to start chatting
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Message Input */}
            <CardContent sx={{ borderTop: 1, borderColor: 'divider', py: 1 }}>
              <Box display="flex" gap={1}>
                <TextField
                  fullWidth
                  multiline
                  maxRows={3}
                  placeholder="Type your message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={!selectedCamera}
                />
                <Button
                  variant="contained"
                  endIcon={<SendIcon />}
                  onClick={sendMessage}
                  disabled={!selectedCamera || !newMessage.trim()}
                >
                  Send
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem onClick={() => {
          setMenuAnchor(null);
          generateQRCode();
        }}>
          <QrCodeIcon sx={{ mr: 1 }} />
          Generate QR Code
        </MenuItem>
        <MenuItem onClick={() => {
          setMenuAnchor(null);
          // Clear chat messages
          if (selectedCamera) {
            setMessages([]);
            saveMessages(selectedCamera.id, []);
          }
        }}>
          <SettingsIcon sx={{ mr: 1 }} />
          Clear Chat
        </MenuItem>
      </Menu>

      {/* QR Code Dialog */}
      <Dialog open={qrDialog} onClose={() => setQrDialog(false)}>
        <DialogTitle>Mobile Connection QR Code</DialogTitle>
        <DialogContent>
          <Box textAlign="center">
            {qrCode && (
              <img 
                src={qrCode} 
                alt="QR Code" 
                style={{ maxWidth: '100%', height: 'auto' }}
              />
            )}
            <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
              Scan this QR code with your mobile device to connect to the camera chat.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQrDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChatInterface;