import React, { useEffect, useRef } from 'react';
import { Camera } from '../types';

interface NetworkTopologyProps {
  cameras: Camera[];
  selectedCameras: Set<string>;
  onCameraSelect: (cameraId: string) => void;
}

const NetworkTopology: React.FC<NetworkTopologyProps> = ({
  cameras,
  selectedCameras,
  onCameraSelect
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Clear canvas
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate positions for cameras
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) * 0.3;

    // Draw central hub (router/switch)
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 30, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Network', centerX, centerY);

    // Draw cameras in a circle around the hub
    cameras.forEach((camera, index) => {
      const angle = (index / cameras.length) * Math.PI * 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      // Draw connection line
      ctx.strokeStyle = camera.status === 'online' ? '#10b981' : '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x, y);
      ctx.stroke();

      // Draw camera node
      const nodeRadius = 25;
      ctx.fillStyle = selectedCameras.has(camera.id) ? '#3b82f6' : '#374151';
      ctx.beginPath();
      ctx.arc(x, y, nodeRadius, 0, Math.PI * 2);
      ctx.fill();

      // Draw status indicator
      const statusColors = {
        online: '#10b981',
        offline: '#ef4444',
        deploying: '#f59e0b',
        deployed: '#3b82f6'
      };
      ctx.fillStyle = statusColors[camera.status];
      ctx.beginPath();
      ctx.arc(x + nodeRadius * 0.7, y - nodeRadius * 0.7, 5, 0, Math.PI * 2);
      ctx.fill();

      // Draw camera info
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(camera.ip, x, y + nodeRadius + 15);
      
      // Store position for click detection
      (camera as any)._x = x;
      (camera as any)._y = y;
      (camera as any)._radius = nodeRadius;
    });

    // Legend
    const legendY = 30;
    const legendItems = [
      { color: '#10b981', label: 'Online' },
      { color: '#ef4444', label: 'Offline' },
      { color: '#f59e0b', label: 'Deploying' },
      { color: '#3b82f6', label: 'Deployed' }
    ];

    legendItems.forEach((item, index) => {
      const x = 30 + index * 100;
      
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(x, legendY, 5, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#9ca3af';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(item.label, x + 10, legendY + 1);
    });
  }, [cameras, selectedCameras]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Check if click is on a camera
    cameras.forEach((camera) => {
      const cx = (camera as any)._x;
      const cy = (camera as any)._y;
      const r = (camera as any)._radius;

      if (cx && cy && r) {
        const distance = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (distance <= r) {
          onCameraSelect(camera.id);
        }
      }
    });
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 h-full">
      <h2 className="text-xl font-semibold mb-4">Network Topology</h2>
      <canvas
        ref={canvasRef}
        className="w-full h-96 cursor-pointer"
        onClick={handleCanvasClick}
      />
      <div className="mt-4 text-sm text-gray-400">
        Click on camera nodes to select/deselect them for deployment.
      </div>
    </div>
  );
};

export default NetworkTopology;