import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  Box,
  Avatar
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Videocam as VideocamIcon,
  CloudUpload as CloudUploadIcon,
  Download as DownloadIcon,
  Hub as HubIcon,
  Chat as ChatIcon,
  Settings as SettingsIcon,
  QrCode as QrCodeIcon
} from '@mui/icons-material';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  width: number;
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { id: 'cameras', label: 'Camera Discovery', icon: <VideocamIcon /> },
  { id: 'acap', label: 'ACAP Deployment', icon: <CloudUploadIcon /> },
  { id: 'acap-manager', label: 'ACAP Manager', icon: <DownloadIcon /> },
  { id: 'webrtc', label: 'WebRTC Orchestrator', icon: <HubIcon /> },
  { id: 'chat', label: 'Chat Interface', icon: <ChatIcon /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon /> }
];

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange, width }) => {
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: width,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: width,
          boxSizing: 'border-box',
          backgroundColor: '#f8f9fa',
          borderRight: '1px solid #e0e0e0'
        }
      }}
    >
      {/* Logo/Brand Section */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Avatar sx={{ bgcolor: '#1976d2', width: 40, height: 40 }}>
          A
        </Avatar>
        <Box>
          <Typography variant="h6" color="primary" fontWeight="bold">
            Anava
          </Typography>
          <Typography variant="caption" color="textSecondary">
            Vision Desktop
          </Typography>
        </Box>
      </Box>

      <Divider />

      {/* Navigation Menu */}
      <List sx={{ px: 1, py: 2 }}>
        {menuItems.map((item) => (
          <ListItem key={item.id} disablePadding sx={{ mb: 1 }}>
            <ListItemButton
              selected={currentView === item.id}
              onClick={() => onViewChange(item.id)}
              sx={{
                borderRadius: 2,
                mx: 1,
                '&.Mui-selected': {
                  backgroundColor: '#e3f2fd',
                  '&:hover': {
                    backgroundColor: '#bbdefb'
                  }
                },
                '&:hover': {
                  backgroundColor: '#f5f5f5'
                }
              }}
            >
              <ListItemIcon sx={{ color: currentView === item.id ? '#1976d2' : 'inherit' }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText 
                primary={item.label}
                primaryTypographyProps={{
                  fontSize: '0.875rem',
                  fontWeight: currentView === item.id ? 600 : 400,
                  color: currentView === item.id ? '#1976d2' : 'inherit'
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Divider />

      {/* Quick Actions */}
      <Box sx={{ p: 2, mt: 'auto' }}>
        <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block' }}>
          Quick Actions
        </Typography>
        <List dense>
          <ListItem disablePadding>
            <ListItemButton sx={{ borderRadius: 1 }}>
              <ListItemIcon>
                <QrCodeIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText 
                primary="Generate QR Code"
                primaryTypographyProps={{ fontSize: '0.75rem' }}
              />
            </ListItemButton>
          </ListItem>
        </List>
      </Box>
    </Drawer>
  );
};

export default Sidebar;