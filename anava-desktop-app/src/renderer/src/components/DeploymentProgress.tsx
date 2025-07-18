import React from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  CircularProgress
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon,
  Error as ErrorIcon
} from '@mui/icons-material';
import { designTokens } from '../theme';

export interface DeploymentTask {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  detail?: string;
}

interface DeploymentProgressProps {
  tasks: DeploymentTask[];
  overallProgress: number;
  estimatedTimeRemaining?: string;
}

const DeploymentProgress: React.FC<DeploymentProgressProps> = ({
  tasks,
  overallProgress,
  estimatedTimeRemaining
}) => {
  const getTaskIcon = (status: DeploymentTask['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon sx={{ color: designTokens.colors.success }} />;
      case 'running':
        return <CircularProgress size={24} />;
      case 'failed':
        return <ErrorIcon sx={{ color: designTokens.colors.error }} />;
      default:
        return <RadioButtonUncheckedIcon sx={{ color: designTokens.colors.text.secondary }} />;
    }
  };

  const getTaskTextColor = (status: DeploymentTask['status']) => {
    switch (status) {
      case 'completed':
        return designTokens.colors.text.primary;
      case 'running':
        return designTokens.colors.primary.main;
      case 'failed':
        return designTokens.colors.error;
      default:
        return designTokens.colors.text.secondary;
    }
  };

  return (
    <Paper
      elevation={2}
      sx={{
        p: 3,
        borderRadius: designTokens.borderRadius.medium,
        backgroundColor: designTokens.colors.background.paper
      }}
    >
      <Typography variant="h6" gutterBottom>
        Building Your Infrastructure
      </Typography>

      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            Overall Progress: {overallProgress}%
          </Typography>
          {estimatedTimeRemaining && (
            <Typography variant="body2" sx={{ color: designTokens.colors.text.secondary }}>
              {estimatedTimeRemaining} remaining
            </Typography>
          )}
        </Box>
        <LinearProgress
          variant="determinate"
          value={overallProgress}
          sx={{
            height: 8,
            borderRadius: 4,
            backgroundColor: designTokens.colors.border,
            '& .MuiLinearProgress-bar': {
              borderRadius: 4,
              background: `linear-gradient(90deg, ${designTokens.colors.primary.main} 0%, ${designTokens.colors.primary.light} 100%)`
            }
          }}
        />
      </Box>

      <List sx={{ py: 0 }}>
        {tasks.map((task, index) => (
          <ListItem
            key={index}
            sx={{
              px: 0,
              py: 1,
              opacity: task.status === 'pending' ? 0.6 : 1,
              transition: designTokens.transitions.normal
            }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>
              {getTaskIcon(task.status)}
            </ListItemIcon>
            <ListItemText
              primary={
                <Typography
                  variant="body1"
                  sx={{
                    color: getTaskTextColor(task.status),
                    fontWeight: task.status === 'running' ? 500 : 400
                  }}
                >
                  {task.name}
                  {task.progress !== undefined && task.status === 'running' && (
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{ ml: 1, color: designTokens.colors.text.secondary }}
                    >
                      {task.progress}%
                    </Typography>
                  )}
                </Typography>
              }
              secondary={
                task.detail && (
                  <Typography
                    variant="body2"
                    sx={{
                      color: designTokens.colors.text.secondary,
                      fontSize: designTokens.typography.small.fontSize
                    }}
                  >
                    {task.detail}
                  </Typography>
                )
              }
            />
          </ListItem>
        ))}
      </List>

      {overallProgress === 100 && (
        <Box
          sx={{
            mt: 2,
            p: 2,
            borderRadius: designTokens.borderRadius.small,
            backgroundColor: `${designTokens.colors.success}15`,
            border: `1px solid ${designTokens.colors.success}30`,
            animation: 'fadeIn 0.5s ease-out',
            '@keyframes fadeIn': {
              from: { opacity: 0 },
              to: { opacity: 1 }
            }
          }}
        >
          <Typography
            variant="body2"
            sx={{
              color: designTokens.colors.success,
              fontWeight: 500,
              textAlign: 'center'
            }}
          >
            Deployment completed successfully!
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export default DeploymentProgress;