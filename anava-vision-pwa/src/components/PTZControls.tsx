import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Joystick } from 'react-joystick-component';
import { Camera, PTZCommand } from '../types';
import { orchestratorService } from '../services/orchestratorService';
import toast from 'react-hot-toast';
import './PTZControls.css';

interface PTZControlsProps {
  camera: Camera | null;
  disabled?: boolean;
}

interface JoystickUpdateEvent {
  x: number | null;
  y: number | null;
  direction: string | null;
}

const PTZControls: React.FC<PTZControlsProps> = ({ camera, disabled = false }) => {
  const [isMoving, setIsMoving] = useState(false);
  const [currentPreset, setCurrentPreset] = useState<number | null>(null);
  const [zoom, setZoom] = useState(50);
  const [speed, setSpeed] = useState(50);
  const [presets] = useState([
    { id: 1, name: 'Home Position' },
    { id: 2, name: 'Entrance' },
    { id: 3, name: 'Parking' },
    { id: 4, name: 'Back Door' },
  ]);

  const canUsePTZ = camera?.capabilities.ptz && !disabled;
  const canZoom = camera?.capabilities.zoom && !disabled;
  const canUsePresets = camera?.capabilities.presets && !disabled;

  const sendPTZCommand = useCallback(async (command: PTZCommand) => {
    if (!camera || disabled) return;

    try {
      if (camera.streamUrl.startsWith('demo://')) {
        // Demo mode - just show feedback
        const action = command.type === 'move' ? `Moving ${command.direction}` :
                      command.type === 'zoom' ? `Zooming ${command.zoom}` :
                      command.type === 'preset' ? `Going to preset ${command.presetId}` :
                      'Stopping movement';
        
        toast.success(`Demo: ${action}`, { duration: 2000 });
        return;
      }

      const response = await orchestratorService.sendPTZCommand(camera.id, command);
      
      if (!response.success) {
        throw new Error(response.error || 'PTZ command failed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PTZ command failed';
      toast.error(message);
      console.error('PTZ Error:', error);
    }
  }, [camera, disabled]);

  const handleJoystickMove = useCallback((event: JoystickUpdateEvent) => {
    if (!canUsePTZ || !event.direction || event.x === null || event.y === null) return;

    setIsMoving(true);
    
    // Map joystick direction to PTZ direction
    const directionMap: Record<string, PTZCommand['direction']> = {
      'FORWARD': 'up',
      'BACKWARD': 'down',
      'LEFT': 'left',
      'RIGHT': 'right',
      'FORWARD_LEFT': 'up-left',
      'FORWARD_RIGHT': 'up-right',
      'BACKWARD_LEFT': 'down-left',
      'BACKWARD_RIGHT': 'down-right',
    };

    const direction = event.direction?.toString() || '';
    const ptzDirection = directionMap[direction];
    if (ptzDirection) {
      sendPTZCommand({
        type: 'move',
        direction: ptzDirection,
        speed: speed / 100,
      });
    }
  }, [canUsePTZ, speed, sendPTZCommand]);

  const handleJoystickStop = useCallback(() => {
    if (!canUsePTZ) return;
    
    setIsMoving(false);
    sendPTZCommand({ type: 'stop' });
  }, [canUsePTZ, sendPTZCommand]);

  const handleZoomIn = () => {
    if (!canZoom) return;
    sendPTZCommand({ type: 'zoom', zoom: 'in' });
  };

  const handleZoomOut = () => {
    if (!canZoom) return;
    sendPTZCommand({ type: 'zoom', zoom: 'out' });
  };

  const handlePresetGoto = (presetId: number) => {
    if (!canUsePresets) return;
    setCurrentPreset(presetId);
    sendPTZCommand({ type: 'preset', presetId });
    toast.success(`Moving to preset ${presetId}`);
  };

  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed);
    toast(`Speed: ${newSpeed}%`, { icon: '⚡' });
  };

  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom);
  };

  if (!camera) {
    return (
      <div className="ptz-controls">
        <div className="no-camera-ptz">
          <div className="no-camera-icon">🎛️</div>
          <h3>No Camera Selected</h3>
          <p>Select a camera to access PTZ controls</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ptz-controls">
      <div className="ptz-header">
        <h3>Camera Controls</h3>
        <div className="camera-info">
          <span className="camera-name">{camera.name}</span>
          <div className="capabilities">
            {camera.capabilities.ptz && <span className="capability ptz">PTZ</span>}
            {camera.capabilities.zoom && <span className="capability zoom">Zoom</span>}
            {camera.capabilities.presets && <span className="capability presets">Presets</span>}
          </div>
        </div>
      </div>

      <div className="ptz-content">
        {/* Movement Controls */}
        <div className="control-section">
          <h4>Movement</h4>
          <div className="movement-controls">
            <div className="joystick-container">
              <Joystick
                size={120}
                stickSize={40}
                baseColor={canUsePTZ ? "#667eea" : "#666"}
                stickColor={canUsePTZ ? "#ffffff" : "#999"}
                disabled={!canUsePTZ}
                move={handleJoystickMove}
                stop={handleJoystickStop}
                throttle={100}
              />
              <div className="joystick-label">
                {canUsePTZ ? (isMoving ? 'Moving...' : 'Pan & Tilt') : 'PTZ Unavailable'}
              </div>
            </div>

            <div className="movement-buttons">
              <div className="direction-pad">
                <button
                  className={`direction-btn up ${isMoving ? 'active' : ''}`}
                  onMouseDown={() => sendPTZCommand({ type: 'move', direction: 'up', speed: speed / 100 })}
                  onMouseUp={handleJoystickStop}
                  onTouchStart={() => sendPTZCommand({ type: 'move', direction: 'up', speed: speed / 100 })}
                  onTouchEnd={handleJoystickStop}
                  disabled={!canUsePTZ}
                >
                  ⬆️
                </button>
                <div className="middle-row">
                  <button
                    className={`direction-btn left ${isMoving ? 'active' : ''}`}
                    onMouseDown={() => sendPTZCommand({ type: 'move', direction: 'left', speed: speed / 100 })}
                    onMouseUp={handleJoystickStop}
                    onTouchStart={() => sendPTZCommand({ type: 'move', direction: 'left', speed: speed / 100 })}
                    onTouchEnd={handleJoystickStop}
                    disabled={!canUsePTZ}
                  >
                    ⬅️
                  </button>
                  <button
                    className="direction-btn center"
                    onClick={handleJoystickStop}
                    disabled={!canUsePTZ}
                  >
                    ⏹️
                  </button>
                  <button
                    className={`direction-btn right ${isMoving ? 'active' : ''}`}
                    onMouseDown={() => sendPTZCommand({ type: 'move', direction: 'right', speed: speed / 100 })}
                    onMouseUp={handleJoystickStop}
                    onTouchStart={() => sendPTZCommand({ type: 'move', direction: 'right', speed: speed / 100 })}
                    onTouchEnd={handleJoystickStop}
                    disabled={!canUsePTZ}
                  >
                    ➡️
                  </button>
                </div>
                <button
                  className={`direction-btn down ${isMoving ? 'active' : ''}`}
                  onMouseDown={() => sendPTZCommand({ type: 'move', direction: 'down', speed: speed / 100 })}
                  onMouseUp={handleJoystickStop}
                  onTouchStart={() => sendPTZCommand({ type: 'move', direction: 'down', speed: speed / 100 })}
                  onTouchEnd={handleJoystickStop}
                  disabled={!canUsePTZ}
                >
                  ⬇️
                </button>
              </div>
            </div>
          </div>

          <div className="speed-control">
            <label>Speed: {speed}%</label>
            <input
              type="range"
              min="10"
              max="100"
              step="10"
              value={speed}
              onChange={(e) => handleSpeedChange(parseInt(e.target.value))}
              disabled={!canUsePTZ}
              className="speed-slider"
            />
          </div>
        </div>

        {/* Zoom Controls */}
        {canZoom && (
          <div className="control-section">
            <h4>Zoom</h4>
            <div className="zoom-controls">
              <button
                className="zoom-btn zoom-out"
                onMouseDown={handleZoomOut}
                onTouchStart={handleZoomOut}
                disabled={!canZoom}
              >
                🔍-
              </button>
              <div className="zoom-level">
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={zoom}
                  onChange={(e) => handleZoomChange(parseInt(e.target.value))}
                  disabled={!canZoom}
                  className="zoom-slider"
                />
                <span className="zoom-value">{zoom}%</span>
              </div>
              <button
                className="zoom-btn zoom-in"
                onMouseDown={handleZoomIn}
                onTouchStart={handleZoomIn}
                disabled={!canZoom}
              >
                🔍+
              </button>
            </div>
          </div>
        )}

        {/* Presets */}
        {canUsePresets && (
          <div className="control-section">
            <h4>Presets</h4>
            <div className="presets-grid">
              {presets.map((preset) => (
                <motion.button
                  key={preset.id}
                  className={`preset-btn ${currentPreset === preset.id ? 'active' : ''}`}
                  onClick={() => handlePresetGoto(preset.id)}
                  disabled={!canUsePresets}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <span className="preset-number">{preset.id}</span>
                  <span className="preset-name">{preset.name}</span>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* Status */}
        <div className="control-section">
          <h4>Status</h4>
          <div className="status-info">
            <div className="status-item">
              <span className="status-label">Camera:</span>
              <span className={`status-value ${camera.status}`}>{camera.status}</span>
            </div>
            <div className="status-item">
              <span className="status-label">Movement:</span>
              <span className="status-value">{isMoving ? 'Active' : 'Idle'}</span>
            </div>
            {currentPreset && (
              <div className="status-item">
                <span className="status-label">Preset:</span>
                <span className="status-value">{currentPreset}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PTZControls;