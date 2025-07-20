import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Alert,
  Chip,
  Link,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';

interface FirebaseSetupProps {
  projectId: string;
  onComplete: () => void;
}

const FirebaseSetup: React.FC<FirebaseSetupProps> = ({ projectId, onComplete }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  const firebaseConsoleUrl = `https://console.firebase.google.com/project/${projectId}/authentication/providers`;
  const firebaseProjectUrl = `https://console.firebase.google.com/project/${projectId}`;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const steps = [
    {
      label: 'Open Firebase Console',
      content: (
        <Box>
          <Typography variant="body2" paragraph>
            Click below to open the Firebase Console for your project:
          </Typography>
          <Button
            variant="contained"
            startIcon={<LocalFireDepartmentIcon />}
            endIcon={<OpenInNewIcon />}
            onClick={() => {
              window.open(firebaseProjectUrl, '_blank');
              setActiveStep(1);
            }}
            fullWidth
            sx={{ mb: 2 }}
          >
            Open Firebase Console
          </Button>
          <Alert severity="info" variant="outlined">
            <Typography variant="body2">
              If this is your first time using Firebase, you may need to accept the terms of service.
            </Typography>
          </Alert>
        </Box>
      )
    },
    {
      label: 'Enable Authentication',
      content: (
        <Box>
          <Typography variant="body2" paragraph>
            In the Firebase Console:
          </Typography>
          <List dense>
            <ListItem>
              <ListItemIcon><CheckCircleIcon fontSize="small" /></ListItemIcon>
              <ListItemText 
                primary="Click on 'Authentication' in the left sidebar"
                secondary="If you don't see it, you may need to click 'Build' first"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon><CheckCircleIcon fontSize="small" /></ListItemIcon>
              <ListItemText 
                primary="Click 'Get started' button"
                secondary="This enables Firebase Authentication for your project"
              />
            </ListItem>
          </List>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setActiveStep(2)}
            sx={{ mt: 2 }}
          >
            Next Step
          </Button>
        </Box>
      )
    },
    {
      label: 'Enable Custom Authentication',
      content: (
        <Box>
          <Typography variant="body2" paragraph>
            Now enable the Custom authentication provider:
          </Typography>
          <List dense>
            <ListItem>
              <ListItemIcon><CheckCircleIcon fontSize="small" /></ListItemIcon>
              <ListItemText 
                primary="Go to the 'Sign-in method' tab"
                secondary="You should see a list of authentication providers"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon><CheckCircleIcon fontSize="small" /></ListItemIcon>
              <ListItemText 
                primary="Find 'Custom' in the list"
                secondary="It might be under 'Additional providers'"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon><CheckCircleIcon fontSize="small" /></ListItemIcon>
              <ListItemText 
                primary="Click on 'Custom' and toggle it to 'Enabled'"
                secondary="Click 'Save' to confirm"
              />
            </ListItem>
          </List>
          <Button
            variant="contained"
            endIcon={<OpenInNewIcon />}
            onClick={() => {
              window.open(firebaseConsoleUrl, '_blank');
              setActiveStep(3);
            }}
            fullWidth
            sx={{ mt: 2 }}
          >
            Open Authentication Providers
          </Button>
        </Box>
      )
    },
    {
      label: 'Verify Setup',
      content: (
        <Box>
          <Alert severity="success" sx={{ mb: 2 }}>
            <Typography variant="body2">
              Great! Firebase Authentication should now be configured.
            </Typography>
          </Alert>
          <Typography variant="body2" paragraph>
            Please verify that:
          </Typography>
          <List dense>
            <ListItem>
              <ListItemIcon><CheckCircleIcon fontSize="small" color="success" /></ListItemIcon>
              <ListItemText primary="Firebase Authentication is enabled" />
            </ListItem>
            <ListItem>
              <ListItemIcon><CheckCircleIcon fontSize="small" color="success" /></ListItemIcon>
              <ListItemText primary="Custom authentication provider is enabled" />
            </ListItem>
          </List>
          <Button
            variant="contained"
            color="success"
            onClick={onComplete}
            fullWidth
            sx={{ mt: 3 }}
          >
            Continue to Camera Configuration
          </Button>
        </Box>
      )
    }
  ];

  return (
    <Card sx={{ maxWidth: 800, mx: 'auto' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <LocalFireDepartmentIcon sx={{ fontSize: 40, mr: 2, color: 'warning.main' }} />
          <Box>
            <Typography variant="h5" gutterBottom>
              Firebase Authentication Setup
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Project: <Chip label={projectId} size="small" sx={{ ml: 1 }} />
            </Typography>
          </Box>
        </Box>

        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            Firebase Authentication is required for camera authentication. This is a one-time manual setup 
            that takes about 2 minutes.
          </Typography>
        </Alert>

        <Stepper activeStep={activeStep} orientation="vertical">
          {steps.map((step, index) => (
            <Step key={step.label}>
              <StepLabel>{step.label}</StepLabel>
              <StepContent>
                {step.content}
              </StepContent>
            </Step>
          ))}
        </Stepper>

        <Paper sx={{ p: 2, mt: 3, bgcolor: 'grey.50' }}>
          <Typography variant="body2" color="text.secondary">
            <strong>Why is this manual?</strong> Firebase Console doesn't provide APIs to enable 
            authentication providers. This is a Google limitation that requires manual setup.
          </Typography>
        </Paper>
      </CardContent>
    </Card>
  );
};

export default FirebaseSetup;