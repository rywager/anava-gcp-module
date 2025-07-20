import React, { useState, useEffect } from 'react';
import { Camera, CloudConfig, DeploymentProgress } from '../types';
import CameraList from '../components/CameraList';
import DeploymentPanel from '../components/DeploymentPanel';
import NetworkTopology from '../components/NetworkTopology';
import ChatInterface from '../components/ChatInterface';
import ConfigStatus from '../components/ConfigStatus';

function App() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCameras, setSelectedCameras] = useState<Set<string>>(new Set());
  const [cloudConfig, setCloudConfig] = useState<CloudConfig | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [deploymentProgress, setDeploymentProgress] = useState<Map<string, DeploymentProgress>>(new Map());
  const [activeView, setActiveView] = useState<'list' | 'topology' | 'chat'>('list');
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);

  useEffect(() => {
    // Load cloud configuration on startup
    loadCloudConfig();
    
    // Set up deployment progress listener
    window.electronAPI.onDeploymentProgress((progress) => {
      setDeploymentProgress(prev => new Map(prev).set(progress.cameraId, progress));
    });
    
    // Set up camera discovery listener
    window.electronAPI.onCameraDiscovered((camera) => {
      setCameras(prev => {
        const existing = prev.find(c => c.id === camera.id);
        if (existing) {
          return prev.map(c => c.id === camera.id ? camera : c);
        } else {
          return [...prev, camera];
        }
      });
    });
    
    // Start auto-discovery
    discoverCameras();
  }, []);

  const loadCloudConfig = async () => {
    try {
      const config = await window.electronAPI.getCloudConfig();
      setCloudConfig(config);
    } catch (error) {
      console.error('Failed to load cloud config:', error);
    }
  };

  const discoverCameras = async () => {
    setIsDiscovering(true);
    try {
      const discovered = await window.electronAPI.discoverCameras();
      setCameras(discovered);
    } catch (error) {
      console.error('Failed to discover cameras:', error);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleDeploy = async () => {
    if (!cloudConfig) {
      alert('Cloud configuration not loaded');
      return;
    }

    const cameraToDeploy = Array.from(selectedCameras).map(id => 
      cameras.find(c => c.id === id)!
    ).filter(Boolean);

    for (const camera of cameraToDeploy) {
      try {
        await window.electronAPI.deployACAP(camera.ip, cloudConfig);
      } catch (error) {
        console.error(`Failed to deploy to ${camera.ip}:`, error);
      }
    }
  };

  const handleCameraSelect = (cameraId: string) => {
    setSelectedCameras(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cameraId)) {
        newSet.delete(cameraId);
      } else {
        newSet.add(cameraId);
      }
      return newSet;
    });
  };

  const handleCameraClick = (camera: Camera) => {
    setSelectedCamera(camera);
    if (camera.status === 'deployed') {
      setActiveView('chat');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Anava Camera Manager</h1>
          <div className="flex items-center space-x-4">
            <ConfigStatus config={cloudConfig} />
            <button
              onClick={discoverCameras}
              disabled={isDiscovering}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
            >
              {isDiscovering ? 'Discovering...' : 'Refresh Cameras'}
            </button>
          </div>
        </div>
      </header>

      <nav className="bg-gray-800 px-6 py-2 border-b border-gray-700">
        <div className="flex space-x-4">
          <button
            onClick={() => setActiveView('list')}
            className={`px-4 py-2 rounded-md ${
              activeView === 'list' ? 'bg-gray-700' : 'hover:bg-gray-700'
            }`}
          >
            Camera List
          </button>
          <button
            onClick={() => setActiveView('topology')}
            className={`px-4 py-2 rounded-md ${
              activeView === 'topology' ? 'bg-gray-700' : 'hover:bg-gray-700'
            }`}
          >
            Network Topology
          </button>
          <button
            onClick={() => setActiveView('chat')}
            disabled={!selectedCamera || selectedCamera.status !== 'deployed'}
            className={`px-4 py-2 rounded-md ${
              activeView === 'chat' ? 'bg-gray-700' : 'hover:bg-gray-700'
            } disabled:opacity-50`}
          >
            Chat Interface
          </button>
        </div>
      </nav>

      <main className="flex-1 p-6">
        {activeView === 'list' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <CameraList
                cameras={cameras}
                selectedCameras={selectedCameras}
                onCameraSelect={handleCameraSelect}
                onCameraClick={handleCameraClick}
                deploymentProgress={deploymentProgress}
              />
            </div>
            <div>
              <DeploymentPanel
                selectedCount={selectedCameras.size}
                onDeploy={handleDeploy}
                isDeploying={Array.from(deploymentProgress.values()).some(
                  p => p.stage !== 'complete' && p.stage !== 'error'
                )}
              />
            </div>
          </div>
        )}

        {activeView === 'topology' && (
          <NetworkTopology
            cameras={cameras}
            selectedCameras={selectedCameras}
            onCameraSelect={handleCameraSelect}
          />
        )}

        {activeView === 'chat' && selectedCamera && (
          <ChatInterface
            camera={selectedCamera}
            mcpUrl={cloudConfig?.endpoints.mcp || ''}
          />
        )}
      </main>
    </div>
  );
}

export default App;