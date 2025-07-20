import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast, { Toaster } from 'react-hot-toast';
import CameraList from './components/CameraList';
import VideoPlayer from './components/VideoPlayer';
import PTZControls from './components/PTZControls';
import InstallPrompt from './components/InstallPrompt';
import NotificationManager from './components/NotificationManager';
import { Camera, CameraProvider } from './contexts/CameraContext';
import { WebRTCProvider } from './contexts/WebRTCContext';
import './App.css';

function App() {
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Show welcome toast on app load
    toast.success('Welcome to Anava Vision!', {
      icon: '📹',
      duration: 3000,
    });
  }, []);

  return (
    <div className="app">
      <Toaster 
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1a1a2e',
            color: '#fff',
            border: '1px solid #16213e',
          },
        }}
      />
      
      <CameraProvider>
        <WebRTCProvider>
          <div className="app-container">
            {/* Header */}
            <motion.header 
              className="app-header"
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <div className="header-content">
                <div className="logo-section">
                  <div className="logo">📹</div>
                  <h1>Anava Vision</h1>
                </div>
                <div className="status-section">
                  <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
                    <div className="status-dot"></div>
                    {isConnected ? 'Connected' : 'Offline'}
                  </div>
                </div>
              </div>
            </motion.header>

            {/* Main Content */}
            <main className="app-main">
              <div className="main-layout">
                {/* Camera List Sidebar */}
                <motion.aside 
                  className="camera-sidebar"
                  initial={{ x: -300, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                >
                  <CameraList 
                    selectedCamera={selectedCamera}
                    onCameraSelect={setSelectedCamera}
                  />
                </motion.aside>

                {/* Video Player and Controls */}
                <motion.section 
                  className="video-section"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                >
                  <div className="video-container">
                    <VideoPlayer 
                      camera={selectedCamera}
                      onConnectionChange={setIsConnected}
                    />
                  </div>
                  
                  <div className="controls-container">
                    <PTZControls 
                      camera={selectedCamera}
                      disabled={!isConnected}
                    />
                  </div>
                </motion.section>
              </div>
            </main>

            {/* PWA Features */}
            <InstallPrompt />
            <NotificationManager />
          </div>
        </WebRTCProvider>
      </CameraProvider>
    </div>
  );
}

export default App;
