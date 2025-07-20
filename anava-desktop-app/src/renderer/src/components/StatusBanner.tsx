import React from 'react';
import {
  Alert,
  AlertTitle,
  Button,
  IconButton,
  Collapse,
  Box
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { TransitionGroup } from 'react-transition-group';
import { designTokens } from '../theme';

export interface StatusBannerProps {
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  onDismiss?: () => void;
  show?: boolean;
}

const StatusBanner: React.FC<StatusBannerProps> = ({
  type,
  title,
  message,
  action,
  onDismiss,
  show = true
}) => {
  const [open, setOpen] = React.useState(show);

  React.useEffect(() => {
    setOpen(show);
  }, [show]);

  const handleClose = () => {
    setOpen(false);
    if (onDismiss) {
      setTimeout(onDismiss, 300); // Wait for animation to complete
    }
  };

  // Auto-dismiss success messages after 5 seconds
  React.useEffect(() => {
    if (type === 'success' && open && !action) {
      const timer = setTimeout(() => {
        handleClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [type, open, action]);

  return (
    <Collapse in={open}>
      <Alert
        severity={type}
        sx={{
          mb: 2,
          alignItems: 'center',
          '& .MuiAlert-icon': {
            fontSize: 24,
          },
          '& .MuiAlert-message': {
            width: '100%',
          },
          animation: open ? 'slideIn 0.3s ease-out' : undefined,
          '@keyframes slideIn': {
            from: {
              transform: 'translateY(-20px)',
              opacity: 0,
            },
            to: {
              transform: 'translateY(0)',
              opacity: 1,
            },
          },
        }}
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {action && (
              <Button
                size="small"
                color="inherit"
                onClick={action.onClick}
                sx={{
                  fontWeight: 500,
                  textTransform: 'none',
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  },
                }}
              >
                {action.label}
              </Button>
            )}
            {onDismiss && (
              <IconButton
                size="small"
                color="inherit"
                onClick={handleClose}
                sx={{
                  p: 0.5,
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  },
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        }
      >
        <AlertTitle sx={{ fontWeight: 500, mb: message ? 0.5 : 0 }}>
          {title}
        </AlertTitle>
        {message && (
          <Box sx={{ mt: 0.5 }}>
            {message}
          </Box>
        )}
      </Alert>
    </Collapse>
  );
};

// Status banner container for managing multiple banners
interface StatusBannerItem extends StatusBannerProps {
  id: string;
}

interface StatusBannerContainerProps {
  banners: StatusBannerItem[];
  onDismiss: (id: string) => void;
}

export const StatusBannerContainer: React.FC<StatusBannerContainerProps> = ({
  banners,
  onDismiss
}) => {
  return (
    <TransitionGroup>
      {banners.map((banner) => (
        <StatusBanner
          key={banner.id}
          {...banner}
          onDismiss={() => onDismiss(banner.id)}
        />
      ))}
    </TransitionGroup>
  );
};

export default StatusBanner;