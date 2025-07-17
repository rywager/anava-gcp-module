import React, { useState, useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, AppBar, Toolbar, Typography, Container } from '@mui/material';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import CameraDiscovery from './components/CameraDiscovery';
import ACAPDeployment from './components/ACAPDeployment';
import AcapManager from './components/AcapManager';
import WebRTCOrchestrator from './components/WebRTCOrchestrator';
import ChatInterface from './components/ChatInterface';
import Settings from './components/Settings';
import AutoDashboard from './components/AutoDashboard';
import GCPLogin from './components/GCPLogin';
import InfrastructureDeployment from './components/InfrastructureDeployment';
import BackendConfig from './components/BackendConfig';
import { CameraProvider } from './context/CameraContext';
import { WebRTCProvider } from './context/WebRTCContext';
import './App.css';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0'
    },
    secondary: {
      main: '#dc004e',
      light: '#ff5983',
      dark: '#9a0036'
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff'
    }
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 600,
      color: '#1976d2'
    },
    h6: {
      fontWeight: 500
    }
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          color: '#1976d2',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }
      }
    }
  }
});

const SIDEBAR_WIDTH = 250;

function App() {
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    // Get app version from Electron
    if (window.electronAPI) {
      window.electronAPI.getVersion().then(setAppVersion);
    }
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <CameraProvider>
        <WebRTCProvider>
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            {/* App Bar */}
            <AppBar position="static">
              <Toolbar>
                <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                  Anava Vision Desktop
                </Typography>
                <Typography variant="body2" color="inherit">
                  v{appVersion}
                </Typography>
              </Toolbar>
            </AppBar>

            {/* Main Content - Just the IntegratedDashboard */}
            <Box
              component="main"
              sx={{
                flexGrow: 1,
                p: 3,
                backgroundColor: theme.palette.background.default,
                overflow: 'auto'
              }}
            >
              <Container maxWidth="xl">
                <AutoDashboard />
              </Container>
            </Box>
          </Box>
        </WebRTCProvider>
      </CameraProvider>
    </ThemeProvider>
  );
}

export default App;
