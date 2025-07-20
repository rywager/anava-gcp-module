import React from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Button,
  LinearProgress,
  Chip,
  IconButton,
  Checkbox
} from '@mui/material';
import {
  Videocam as VideocamIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Settings as SettingsIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { designTokens } from '../theme';

export interface Camera {
  id: string;
  name: string;
  ip: string;
  status: 'online' | 'offline' | 'deploying' | 'ready' | 'error';
  deploymentProgress?: number;
  model?: string;
  firmware?: string;
}

interface CameraCardProps {
  camera: Camera;
  selected: boolean;
  onSelect: (id: string) => void;
  onAction?: (action: string, id: string) => void;
}

const CameraCard: React.FC<CameraCardProps> = ({
  camera,
  selected,
  onSelect,
  onAction
}) => {
  const getStatusColor = () => {
    switch (camera.status) {
      case 'online':
      case 'ready':
        return designTokens.colors.success;
      case 'deploying':
        return designTokens.colors.primary.main;
      case 'offline':
      case 'error':
        return designTokens.colors.error;
      default:
        return designTokens.colors.text.secondary;
    }
  };

  const getStatusIcon = () => {
    switch (camera.status) {
      case 'ready':
        return <CheckCircleIcon sx={{ fontSize: 20 }} />;
      case 'error':
      case 'offline':
        return <WarningIcon sx={{ fontSize: 20 }} />;
      default:
        return <VideocamIcon sx={{ fontSize: 20 }} />;
    }
  };

  const getStatusLabel = () => {
    switch (camera.status) {
      case 'online':
        return 'Online';
      case 'offline':
        return 'Offline';
      case 'deploying':
        return 'Deploying...';
      case 'ready':
        return 'Ready';
      case 'error':
        return 'Error';
      default:
        return camera.status;
    }
  };

  return (
    <Card
      elevation={2}
      sx={{
        position: 'relative',
        transition: designTokens.transitions.fast,
        border: selected ? `2px solid ${designTokens.colors.primary.main}` : '2px solid transparent',
        '&:hover': {
          boxShadow: designTokens.shadows.hover,
          transform: 'translateY(-2px)'
        }
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
          <Checkbox
            checked={selected}
            onChange={() => onSelect(camera.id)}
            sx={{ p: 0, mr: 2 }}
          />
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" sx={{ mb: 0.5 }}>
              {camera.name}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ color: designTokens.colors.text.secondary }}>
                {camera.ip}
              </Typography>
              {camera.model && (
                <Typography variant="body2" sx={{ color: designTokens.colors.text.secondary }}>
                  • {camera.model}
                </Typography>
              )}
            </Box>
          </Box>
          <IconButton
            size="small"
            onClick={() => onAction && onAction('info', camera.id)}
          >
            <InfoIcon />
          </IconButton>
        </Box>

        {camera.status === 'deploying' && camera.deploymentProgress !== undefined ? (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2">Deploying ACAP...</Typography>
              <Typography variant="body2">{camera.deploymentProgress}%</Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={camera.deploymentProgress}
              sx={{
                height: 6,
                borderRadius: 3,
                backgroundColor: designTokens.colors.border,
                '& .MuiLinearProgress-bar': {
                  borderRadius: 3,
                  backgroundColor: designTokens.colors.primary.main
                }
              }}
            />
          </Box>
        ) : (
          <Box sx={{ mb: 2 }}>
            <Chip
              size="small"
              icon={getStatusIcon()}
              label={getStatusLabel()}
              sx={{
                backgroundColor: `${getStatusColor()}15`,
                color: getStatusColor(),
                border: `1px solid ${getStatusColor()}30`,
                '& .MuiChip-icon': {
                  color: getStatusColor()
                }
              }}
            />
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 1 }}>
          {camera.status === 'ready' && (
            <Button
              size="small"
              variant="contained"
              onClick={() => onAction && onAction('configure', camera.id)}
            >
              Configure
            </Button>
          )}
          {camera.status === 'online' && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => onAction && onAction('deploy', camera.id)}
            >
              Deploy ACAP
            </Button>
          )}
          <Button
            size="small"
            variant="text"
            startIcon={<SettingsIcon />}
            onClick={() => onAction && onAction('settings', camera.id)}
          >
            Details
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};

export default CameraCard;