import React, { useState } from 'react';
import { CloudConfig } from '../types';

interface ConfigStatusProps {
  config: CloudConfig | null;
}

const ConfigStatus: React.FC<ConfigStatusProps> = ({ config }) => {
  const [showDetails, setShowDetails] = useState(false);

  const getStatusColor = () => {
    if (!config) return 'text-red-500';
    return 'text-green-500';
  };

  const getStatusText = () => {
    if (!config) return 'Not Loaded';
    return 'Cloud Connected';
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`flex items-center space-x-2 px-3 py-1 rounded-md ${
          config ? 'bg-green-900/20 hover:bg-green-900/30' : 'bg-red-900/20 hover:bg-red-900/30'
        } transition-colors`}
      >
        <span className={`text-lg ${getStatusColor()}`}>●</span>
        <span className="text-sm font-medium">{getStatusText()}</span>
      </button>

      {showDetails && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
          <div className="p-4">
            <h3 className="font-semibold mb-3">Cloud Configuration</h3>
            
            {config ? (
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium text-gray-400">Project</div>
                  <div className="text-sm">{config.projectId}</div>
                </div>
                
                <div>
                  <div className="text-sm font-medium text-gray-400">Region</div>
                  <div className="text-sm">{config.region}</div>
                </div>
                
                <div>
                  <div className="text-sm font-medium text-gray-400">Endpoints</div>
                  <div className="text-xs space-y-1">
                    <div>Enrollment: {config.endpoints.enrollment ? '✅' : '❌'}</div>
                    <div>Config: {config.endpoints.config ? '✅' : '❌'}</div>
                    <div>MCP: {config.endpoints.mcp ? '✅' : '❌'}</div>
                    <div>Chat: {config.endpoints.chat ? '✅' : '❌'}</div>
                  </div>
                </div>
                
                <div>
                  <div className="text-sm font-medium text-gray-400">ACAP Version</div>
                  <div className="text-sm">{config.deployment.acapVersion}</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-red-400">
                Failed to load cloud configuration. Check your terraform outputs or deployment settings.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigStatus;