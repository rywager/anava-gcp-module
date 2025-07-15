import React from 'react';
import { motion } from 'framer-motion';
import { Camera } from '../types';
import { useCamera } from '../contexts/CameraContext';
import './CameraList.css';

interface CameraListProps {
  selectedCamera: Camera | null;
  onCameraSelect: (camera: Camera) => void;
}

const CameraList: React.FC<CameraListProps> = ({ selectedCamera, onCameraSelect }) => {
  const { cameras, loading, refreshCameras, connectionStatus } = useCamera();

  const getStatusIcon = (status: Camera['status']) => {
    switch (status) {
      case 'online':
        return '🟢';
      case 'offline':
        return '🔴';
      case 'error':
        return '⚠️';
      default:
        return '⚪';
    }
  };

  const getStatusColor = (status: Camera['status']) => {
    switch (status) {
      case 'online':
        return '#2ecc71';
      case 'offline':
        return '#e74c3c';
      case 'error':
        return '#f39c12';
      default:
        return '#95a5a6';
    }
  };

  return (
    <div className="camera-list">
      <div className="camera-list-header">
        <h2>Cameras</h2>
        <motion.button
          className="refresh-button"
          onClick={refreshCameras}
          disabled={loading}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <span className={`refresh-icon ${loading ? 'spinning' : ''}`}>🔄</span>
        </motion.button>
      </div>

      <div className="connection-indicator">
        <div className={`connection-dot ${connectionStatus}`}></div>
        <span className="connection-text">
          {connectionStatus === 'connected' && 'Connected to orchestrator'}
          {connectionStatus === 'connecting' && 'Connecting...'}
          {connectionStatus === 'error' && 'Connection error'}
          {connectionStatus === 'disconnected' && 'Disconnected'}
        </span>
      </div>

      <div className="camera-list-content">
        {loading && cameras.length === 0 ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading cameras...</p>
          </div>
        ) : cameras.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📹</div>
            <p>No cameras found</p>
            <button onClick={refreshCameras} className="retry-button">
              Retry
            </button>
          </div>
        ) : (
          <div className="camera-grid">
            {cameras.map((camera, index) => (
              <motion.div
                key={camera.id}
                className={`camera-card ${selectedCamera?.id === camera.id ? 'selected' : ''} ${camera.status}`}
                onClick={() => onCameraSelect(camera)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="camera-thumbnail">
                  {camera.thumbnailUrl ? (
                    <img 
                      src={camera.thumbnailUrl} 
                      alt={camera.name}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const nextSibling = e.currentTarget.nextElementSibling as HTMLElement;
                        if (nextSibling) {
                          nextSibling.style.display = 'flex';
                        }
                      }}
                    />
                  ) : null}
                  <div 
                    className="camera-placeholder"
                    style={{ display: camera.thumbnailUrl ? 'none' : 'flex' }}
                  >
                    📹
                  </div>
                  <div className="camera-status-overlay">
                    <span 
                      className="status-icon" 
                      style={{ color: getStatusColor(camera.status) }}
                    >
                      {getStatusIcon(camera.status)}
                    </span>
                  </div>
                </div>

                <div className="camera-info">
                  <h3 className="camera-name">{camera.name}</h3>
                  {camera.description && (
                    <p className="camera-description">{camera.description}</p>
                  )}
                  {camera.location && (
                    <p className="camera-location">📍 {camera.location}</p>
                  )}
                  
                  <div className="camera-capabilities">
                    {camera.capabilities.ptz && (
                      <span className="capability">🎛️ PTZ</span>
                    )}
                    {camera.capabilities.zoom && (
                      <span className="capability">🔍 Zoom</span>
                    )}
                    {camera.capabilities.recording && (
                      <span className="capability">📹 Rec</span>
                    )}
                    {camera.capabilities.audio && (
                      <span className="capability">🔊 Audio</span>
                    )}
                  </div>
                </div>

                {selectedCamera?.id === camera.id && (
                  <motion.div
                    className="selected-indicator"
                    layoutId="selected-camera"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    ✓
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <div className="camera-list-footer">
        <div className="camera-count">
          {cameras.length} camera{cameras.length !== 1 ? 's' : ''} available
        </div>
      </div>
    </div>
  );
};

export default CameraList;