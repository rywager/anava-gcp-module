import React, { useState, useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, AppBar, Toolbar, Typography, Container } from '@mui/material';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import CameraDiscovery from './components/CameraDiscovery';
import ACAPDeployment from './components/ACAPDeployment';
import AcapManager from './components/AcapManager';
import WebRTCOrchestrator from './components/WebRTCOrchestrator';
import ChatInterface from './components/ChatInterface';
import Settings from './components/Settings';
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
  const [currentView, setCurrentView] = useState('dashboard');
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    // Get app version from Electron
    if (window.electronAPI) {
      window.electronAPI.getVersion().then(setAppVersion);
    }
    
    // Handle hash navigation
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash) {
        setCurrentView(hash);
      }
    };
    
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Check initial hash
    
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'cameras':
        return <CameraDiscovery />;
      case 'acap':
        return <ACAPDeployment />;
      case 'acap-manager':
        return <AcapManager />;
      case 'webrtc':
        return <WebRTCOrchestrator />;
      case 'chat':
        return <ChatInterface />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <CameraProvider>
        <WebRTCProvider>
          <Box sx={{ display: 'flex', height: '100vh' }}>
            {/* App Bar */}
            <AppBar 
              position="fixed" 
              sx={{ 
                width: `calc(100% - ${SIDEBAR_WIDTH}px)`, 
                ml: `${SIDEBAR_WIDTH}px`,
                zIndex: theme.zIndex.drawer + 1
              }}
            >
              <Toolbar>
                <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                  Anava Vision Desktop
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  v{appVersion}
                </Typography>
              </Toolbar>
            </AppBar>

            {/* Sidebar */}
            <Sidebar 
              currentView={currentView} 
              onViewChange={setCurrentView}
              width={SIDEBAR_WIDTH}
            />

            {/* Main Content */}
            <Box
              component="main"
              sx={{
                flexGrow: 1,
                p: 3,
                width: `calc(100% - ${SIDEBAR_WIDTH}px)`,
                mt: 8, // Account for AppBar height
                backgroundColor: theme.palette.background.default,
                minHeight: '100vh'
              }}
            >
              <Container maxWidth="xl">
                {renderContent()}
              </Container>
            </Box>
          </Box>
        </WebRTCProvider>
      </CameraProvider>
    </ThemeProvider>
  );
}

export default App;
