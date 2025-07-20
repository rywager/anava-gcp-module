import React, { useState, useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, AppBar, Toolbar, Typography, Container } from '@mui/material';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import CameraDiscovery from './components/CameraDiscovery';
import ACAPDeployment from './components/ACAPDeployment';
import AcapManager from './components/AcapManager';
import WebRTCOrchestrator from './components/WebRTCOrchestrator';
import ChatInterface from './components/ChatInterface';
import Settings from './components/Settings';
import SetupWizard from './components/SetupWizard';
import GCPLogin from './components/GCPLogin';
import InfrastructureDeployment from './components/InfrastructureDeployment';
import BackendConfig from './components/BackendConfig';
import { CameraProvider } from './context/CameraContext';
import { WebRTCProvider } from './context/WebRTCContext';
import theme from './theme';
import './App.css';

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
            <AppBar position="static" elevation={0}>
              <Toolbar>
                <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 500 }}>
                  Anava Personal Cloud <span style={{ fontSize: '0.8em', opacity: 0.7 }}>v{appVersion}</span>
                </Typography>
              </Toolbar>
            </AppBar>

            {/* Main Content - SetupWizard */}
            <Box
              component="main"
              sx={{
                flexGrow: 1,
                backgroundColor: theme.palette.background.default,
                overflow: 'auto'
              }}
            >
              <SetupWizard />
            </Box>
          </Box>
        </WebRTCProvider>
      </CameraProvider>
    </ThemeProvider>
  );
}

export default App;
