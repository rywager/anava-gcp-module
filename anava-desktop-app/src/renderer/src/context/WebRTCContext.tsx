import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { WebRTCConnection } from '../types';

interface WebRTCContextType {
  connections: WebRTCConnection[];
  setConnections: React.Dispatch<React.SetStateAction<WebRTCConnection[]>>;
  isOrchestratorRunning: boolean;
  setIsOrchestratorRunning: React.Dispatch<React.SetStateAction<boolean>>;
  orchestratorPort: number;
  setOrchestratorPort: React.Dispatch<React.SetStateAction<number>>;
  startOrchestrator: (port: number) => Promise<void>;
  stopOrchestrator: () => Promise<void>;
  addConnection: (connection: WebRTCConnection) => Promise<void>;
  removeConnection: (connectionId: string) => Promise<void>;
  updateConnection: (connectionId: string, updates: Partial<WebRTCConnection>) => Promise<void>;
}

const WebRTCContext = createContext<WebRTCContextType | undefined>(undefined);

export const useWebRTCContext = () => {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error('useWebRTCContext must be used within a WebRTCProvider');
  }
  return context;
};

interface WebRTCProviderProps {
  children: ReactNode;
}

export const WebRTCProvider: React.FC<WebRTCProviderProps> = ({ children }) => {
  const [connections, setConnections] = useState<WebRTCConnection[]>([]);
  const [isOrchestratorRunning, setIsOrchestratorRunning] = useState(false);
  const [orchestratorPort, setOrchestratorPort] = useState(8080);

  useEffect(() => {
    loadWebRTCStatus();
    loadConnections();
  }, []);

  const loadWebRTCStatus = async () => {
    try {
      const status = await window.electronAPI.store.get('webrtcOrchestratorStatus');
      if (status) {
        setIsOrchestratorRunning(status.isRunning);
        setOrchestratorPort(status.port || 8080);
      }
    } catch (error) {
      console.error('Error loading WebRTC status:', error);
    }
  };

  const loadConnections = async () => {
    try {
      const storedConnections = await window.electronAPI.store.get('webrtcConnections') || [];
      setConnections(storedConnections);
    } catch (error) {
      console.error('Error loading WebRTC connections:', error);
    }
  };

  const startOrchestrator = async (port: number) => {
    try {
      const result = await window.electronAPI.startWebRTCOrchestrator(port);
      
      if (result.success) {
        setIsOrchestratorRunning(true);
        setOrchestratorPort(result.port);
        
        // Update store
        await window.electronAPI.store.set('webrtcOrchestratorStatus', {
          isRunning: true,
          port: result.port,
          connections: 0,
          rooms: 0,
          uptime: 0
        });
      }
    } catch (error) {
      console.error('Error starting WebRTC orchestrator:', error);
      throw error;
    }
  };

  const stopOrchestrator = async () => {
    try {
      const result = await window.electronAPI.stopWebRTCOrchestrator();
      
      if (result.success) {
        setIsOrchestratorRunning(false);
        setConnections([]); // Clear connections when orchestrator stops
        
        // Update store
        await window.electronAPI.store.set('webrtcOrchestratorStatus', {
          isRunning: false,
          port: 0,
          connections: 0,
          rooms: 0,
          uptime: 0
        });
        
        await window.electronAPI.store.set('webrtcConnections', []);
      }
    } catch (error) {
      console.error('Error stopping WebRTC orchestrator:', error);
      throw error;
    }
  };

  const addConnection = async (connection: WebRTCConnection) => {
    try {
      const updatedConnections = [...connections, connection];
      setConnections(updatedConnections);
      await window.electronAPI.store.set('webrtcConnections', updatedConnections);
    } catch (error) {
      console.error('Error adding WebRTC connection:', error);
      throw error;
    }
  };

  const removeConnection = async (connectionId: string) => {
    try {
      const updatedConnections = connections.filter(conn => conn.id !== connectionId);
      setConnections(updatedConnections);
      await window.electronAPI.store.set('webrtcConnections', updatedConnections);
    } catch (error) {
      console.error('Error removing WebRTC connection:', error);
      throw error;
    }
  };

  const updateConnection = async (connectionId: string, updates: Partial<WebRTCConnection>) => {
    try {
      const updatedConnections = connections.map(conn =>
        conn.id === connectionId ? { ...conn, ...updates } : conn
      );
      setConnections(updatedConnections);
      await window.electronAPI.store.set('webrtcConnections', updatedConnections);
    } catch (error) {
      console.error('Error updating WebRTC connection:', error);
      throw error;
    }
  };

  const value: WebRTCContextType = {
    connections,
    setConnections,
    isOrchestratorRunning,
    setIsOrchestratorRunning,
    orchestratorPort,
    setOrchestratorPort,
    startOrchestrator,
    stopOrchestrator,
    addConnection,
    removeConnection,
    updateConnection
  };

  return (
    <WebRTCContext.Provider value={value}>
      {children}
    </WebRTCContext.Provider>
  );
};