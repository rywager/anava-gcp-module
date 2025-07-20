import React from 'react';

interface DeploymentPanelProps {
  selectedCount: number;
  onDeploy: () => void;
  isDeploying: boolean;
}

const DeploymentPanel: React.FC<DeploymentPanelProps> = ({
  selectedCount,
  onDeploy,
  isDeploying
}) => {
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Deployment Control</h2>
      
      <div className="space-y-4">
        <div className="bg-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400">Selected Cameras</div>
          <div className="text-3xl font-bold mt-1">{selectedCount}</div>
        </div>
        
        <button
          onClick={onDeploy}
          disabled={selectedCount === 0 || isDeploying}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium transition-colors"
        >
          {isDeploying ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Deploying...
            </span>
          ) : (
            'Deploy ACAP'
          )}
        </button>
        
        <div className="text-sm text-gray-400">
          <h3 className="font-medium mb-2">Deployment will:</h3>
          <ul className="space-y-1 list-disc list-inside">
            <li>Install BatonDescribe ACAP</li>
            <li>Configure cloud connectivity</li>
            <li>Enable certificate-based auth</li>
            <li>Start MCP integration</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DeploymentPanel;