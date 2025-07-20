import React from 'react';
import { Camera, DeploymentProgress } from '../types';

interface CameraListProps {
  cameras: Camera[];
  selectedCameras: Set<string>;
  onCameraSelect: (cameraId: string) => void;
  onCameraClick: (camera: Camera) => void;
  deploymentProgress: Map<string, DeploymentProgress>;
}

const CameraList: React.FC<CameraListProps> = ({
  cameras,
  selectedCameras,
  onCameraSelect,
  onCameraClick,
  deploymentProgress
}) => {
  const getStatusColor = (status: Camera['status']) => {
    switch (status) {
      case 'online': return 'text-green-500';
      case 'offline': return 'text-red-500';
      case 'deploying': return 'text-yellow-500';
      case 'deployed': return 'text-blue-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: Camera['status']) => {
    switch (status) {
      case 'online': return '●';
      case 'offline': return '○';
      case 'deploying': return '◐';
      case 'deployed': return '◉';
      default: return '◯';
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-700">
        <h2 className="text-xl font-semibold">Discovered Cameras</h2>
        <p className="text-sm text-gray-400 mt-1">
          {cameras.length} cameras found on network
        </p>
      </div>
      
      <div className="divide-y divide-gray-700">
        {cameras.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400">
            No cameras discovered yet. Click "Refresh Cameras" to scan the network.
          </div>
        ) : (
          cameras.map((camera) => {
            const progress = deploymentProgress.get(camera.id);
            const isDeploying = progress && progress.stage !== 'complete' && progress.stage !== 'error';
            
            return (
              <div
                key={camera.id}
                className="px-6 py-4 hover:bg-gray-700 cursor-pointer transition-colors"
                onClick={() => onCameraClick(camera)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <input
                      type="checkbox"
                      checked={selectedCameras.has(camera.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        onCameraSelect(camera.id);
                      }}
                      className="w-5 h-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                      disabled={camera.status === 'offline' || isDeploying}
                    />
                    
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-xl ${getStatusColor(camera.status)}`}>
                          {getStatusIcon(camera.status)}
                        </span>
                        <h3 className="font-medium">{camera.model}</h3>
                      </div>
                      <div className="text-sm text-gray-400 mt-1">
                        <span>IP: {camera.ip}</span>
                        <span className="mx-2">•</span>
                        <span>S/N: {camera.serialNumber}</span>
                        <span className="mx-2">•</span>
                        <span>FW: {camera.firmware}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    {camera.status === 'deployed' && camera.acapVersion && (
                      <div className="text-sm text-green-500">
                        ACAP v{camera.acapVersion}
                      </div>
                    )}
                    {isDeploying && progress && (
                      <div className="text-sm">
                        <div className="text-yellow-500">{progress.message}</div>
                        <div className="w-32 bg-gray-700 rounded-full h-2 mt-1">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all"
                            style={{ width: `${progress.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {progress?.stage === 'error' && (
                      <div className="text-sm text-red-500">
                        {progress.error || 'Deployment failed'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default CameraList;