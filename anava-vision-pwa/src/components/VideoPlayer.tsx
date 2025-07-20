import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera } from '../types';
import { useWebRTC } from '../contexts/WebRTCContext';
import toast from 'react-hot-toast';
import './VideoPlayer.css';

interface VideoPlayerProps {
  camera: Camera | null;
  onConnectionChange: (connected: boolean) => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ camera, onConnectionChange }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { connection, isConnecting, connect, disconnect, getConnectionStatus } = useWebRTC();

  // Update connection status
  useEffect(() => {
    const status = getConnectionStatus();
    onConnectionChange(status === 'connected');
  }, [connection.connectionState, isConnecting, onConnectionChange, getConnectionStatus]);

  // Handle camera change
  useEffect(() => {
    if (camera) {
      setError(null);
      connect(camera).catch((err) => {
        setError(err.message);
        toast.error(`Failed to connect to ${camera.name}`);
      });
    } else {
      disconnect();
    }

    return () => {
      if (!camera) {
        disconnect();
      }
    };
  }, [camera, connect, disconnect]);

  // Handle video stream
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video && connection.remoteStream) {
      video.srcObject = connection.remoteStream;
      video.volume = isMuted ? 0 : volume;
      
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleError = (e: Event) => {
        console.error('Video error:', e);
        setError('Video playback error');
      };

      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      video.addEventListener('error', handleError);

      // Auto-play when stream is available
      video.play().catch((err) => {
        console.warn('Auto-play failed:', err);
        toast('Click to start video', { icon: '▶️' });
      });

      return () => {
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('error', handleError);
      };
    } else if (canvas && camera?.streamUrl.startsWith('demo://')) {
      // For demo mode, the canvas stream is handled in WebRTC context
      setIsPlaying(true);
    }
  }, [connection.remoteStream, volume, isMuted, camera]);

  const toggleFullscreen = async () => {
    const videoContainer = videoRef.current?.parentElement;
    if (!videoContainer) return;

    try {
      if (!document.fullscreenElement) {
        await videoContainer.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
      toast.error('Fullscreen not supported');
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
  };

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(console.error);
    } else {
      video.pause();
    }
  };

  const takeSnapshot = () => {
    const video = videoRef.current;
    if (!video || !camera) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${camera.name}-${new Date().toISOString()}.png`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success('Snapshot saved!');
        }
      });
    }
  };

  const getConnectionStatusDisplay = () => {
    const status = getConnectionStatus();
    switch (status) {
      case 'connected':
        return { text: 'Live', color: '#2ecc71', icon: '🔴' };
      case 'connecting':
        return { text: 'Connecting...', color: '#f39c12', icon: '🟡' };
      case 'error':
        return { text: 'Error', color: '#e74c3c', icon: '❌' };
      default:
        return { text: 'Disconnected', color: '#95a5a6', icon: '⚪' };
    }
  };

  const connectionStatus = getConnectionStatusDisplay();

  return (
    <div className={`video-player ${isFullscreen ? 'fullscreen' : ''}`}>
      {camera ? (
        <>
          <div className="video-container">
            <video
              ref={videoRef}
              className="video-element"
              controls={false}
              playsInline
              muted={isMuted}
              onClick={togglePlayPause}
            />
            
            {/* Demo canvas for demo mode */}
            {camera.streamUrl.startsWith('demo://') && (
              <canvas
                ref={canvasRef}
                className="demo-canvas"
                style={{ display: 'none' }}
              />
            )}

            {/* Video Overlay */}
            <div className="video-overlay">
              <div className="video-info">
                <div className="camera-title">
                  <h3>{camera.name}</h3>
                  {camera.location && <p>{camera.location}</p>}
                </div>
                <div className="connection-status">
                  <span 
                    className="status-indicator"
                    style={{ color: connectionStatus.color }}
                  >
                    {connectionStatus.icon}
                  </span>
                  <span className="status-text">{connectionStatus.text}</span>
                </div>
              </div>

              {/* Video Controls */}
              <motion.div 
                className="video-controls"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="controls-left">
                  <button
                    className="control-button"
                    onClick={togglePlayPause}
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? '⏸️' : '▶️'}
                  </button>

                  <button
                    className="control-button"
                    onClick={toggleMute}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? '🔇' : '🔊'}
                  </button>

                  <div className="volume-control">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="volume-slider"
                    />
                  </div>
                </div>

                <div className="controls-center">
                  <div className="time-display">
                    {new Date().toLocaleTimeString()}
                  </div>
                </div>

                <div className="controls-right">
                  <button
                    className="control-button"
                    onClick={takeSnapshot}
                    title="Take Snapshot"
                  >
                    📷
                  </button>

                  <button
                    className="control-button"
                    onClick={toggleFullscreen}
                    title="Fullscreen"
                  >
                    {isFullscreen ? '🔲' : '⛶'}
                  </button>
                </div>
              </motion.div>
            </div>

            {/* Loading State */}
            {isConnecting && (
              <div className="video-loading">
                <div className="loading-spinner"></div>
                <p>Connecting to {camera.name}...</p>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="video-error">
                <div className="error-icon">❌</div>
                <h3>Connection Error</h3>
                <p>{error}</p>
                <button 
                  onClick={() => connect(camera)}
                  className="retry-button"
                >
                  Retry Connection
                </button>
              </div>
            )}

            {/* No Stream State */}
            {!connection.remoteStream && !isConnecting && !error && (
              <div className="video-no-stream">
                <div className="no-stream-icon">📹</div>
                <h3>No Video Stream</h3>
                <p>Click to start streaming from {camera.name}</p>
                <button 
                  onClick={() => connect(camera)}
                  className="connect-button"
                >
                  Start Stream
                </button>
              </div>
            )}
          </div>

          {/* Camera Details */}
          <div className="camera-details">
            <div className="detail-item">
              <span className="detail-label">Status:</span>
              <span className={`detail-value status-${camera.status}`}>
                {camera.status.toUpperCase()}
              </span>
            </div>
            {camera.description && (
              <div className="detail-item">
                <span className="detail-label">Description:</span>
                <span className="detail-value">{camera.description}</span>
              </div>
            )}
            <div className="detail-item">
              <span className="detail-label">Stream:</span>
              <span className="detail-value">{connectionStatus.text}</span>
            </div>
          </div>
        </>
      ) : (
        <div className="no-camera-selected">
          <div className="no-camera-icon">📹</div>
          <h3>No Camera Selected</h3>
          <p>Select a camera from the list to start viewing</p>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;