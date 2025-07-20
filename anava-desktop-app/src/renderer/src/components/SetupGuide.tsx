import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Button,
  Checkbox,
  FormControlLabel,
  Alert,
  Link,
  Chip,
  Paper
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

interface SetupStep {
  label: string;
  description: string;
  actions: {
    text: string;
    url?: string;
    code?: string;
    highlight?: boolean;
  }[];
  completed: boolean;
}

const SetupGuide: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [steps, setSteps] = useState<SetupStep[]>([
    {
      label: 'Enable Firebase Authentication',
      description: 'Firebase Authentication must be configured to accept custom tokens from the cameras.',
      actions: [
        {
          text: `Open Firebase Console for project "${projectId}"`,
          url: `https://console.firebase.google.com/project/${projectId}/authentication`,
          highlight: true
        },
        {
          text: 'Click "Get started" if Authentication is not enabled'
        },
        {
          text: 'Go to "Sign-in method" tab'
        },
        {
          text: 'Scroll down and enable "Custom" authentication provider'
        },
        {
          text: 'Click "Save"'
        }
      ],
      completed: false
    },
    {
      label: 'Verify API Services',
      description: 'Ensure all required Google Cloud APIs are enabled.',
      actions: [
        {
          text: 'Open Google Cloud Console APIs',
          url: `https://console.cloud.google.com/apis/dashboard?project=${projectId}`,
          highlight: true
        },
        {
          text: 'Verify these APIs are enabled:',
        },
        {
          text: '• Identity Toolkit API',
          code: 'gcloud services enable identitytoolkit.googleapis.com'
        },
        {
          text: '• Firebase Authentication API',
          code: 'gcloud services enable firebaseauth.googleapis.com'
        },
        {
          text: '• API Gateway API',
          code: 'gcloud services enable apigateway.googleapis.com'
        }
      ],
      completed: false
    },
    {
      label: 'Test Camera Authentication',
      description: 'Verify the camera can authenticate successfully.',
      actions: [
        {
          text: 'SSH into your camera and check logs:',
          code: 'tail -f /var/log/syslog | grep BatonAnalytic'
        },
        {
          text: 'Look for successful authentication:',
          code: 'Step 1 Success - obtained Firebase Custom Token'
        },
        {
          text: 'If Step 2 fails with "CONFIGURATION_NOT_FOUND", go back to step 1'
        }
      ],
      completed: false
    }
  ]);

  const handleStepComplete = (index: number) => {
    const newSteps = [...steps];
    newSteps[index].completed = !newSteps[index].completed;
    setSteps(newSteps);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const allStepsCompleted = steps.every(step => step.completed);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Firebase Setup Guide
      </Typography>
      
      <Alert severity="info" sx={{ mb: 3 }}>
        Some Firebase features cannot be automated and require manual configuration in the Firebase Console.
        Please complete these steps to ensure camera authentication works properly.
      </Alert>

      <Stepper orientation="vertical">
        {steps.map((step, index) => (
          <Step key={index} active={true}>
            <StepLabel
              StepIconComponent={() => 
                step.completed ? 
                <CheckCircleIcon color="success" /> : 
                <Box sx={{ 
                  width: 24, 
                  height: 24, 
                  borderRadius: '50%', 
                  border: '2px solid #ccc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14
                }}>
                  {index + 1}
                </Box>
              }
            >
              <Typography variant="h6">{step.label}</Typography>
            </StepLabel>
            <StepContent>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {step.description}
              </Typography>
              
              <Box sx={{ ml: 2 }}>
                {step.actions.map((action, actionIndex) => (
                  <Box key={actionIndex} sx={{ mb: 1.5 }}>
                    {action.url ? (
                      <Link
                        href={action.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ 
                          display: 'inline-flex', 
                          alignItems: 'center',
                          fontWeight: action.highlight ? 'bold' : 'normal'
                        }}
                      >
                        {action.text}
                        <OpenInNewIcon sx={{ ml: 0.5, fontSize: 16 }} />
                      </Link>
                    ) : action.code ? (
                      <Paper 
                        variant="outlined" 
                        sx={{ 
                          p: 1, 
                          display: 'flex', 
                          alignItems: 'center',
                          backgroundColor: '#f5f5f5'
                        }}
                      >
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            fontFamily: 'monospace',
                            fontSize: 12,
                            flex: 1
                          }}
                        >
                          {action.text}
                        </Typography>
                        <Box sx={{ 
                          ml: 2, 
                          p: 1, 
                          backgroundColor: '#e0e0e0',
                          borderRadius: 1,
                          display: 'flex',
                          alignItems: 'center'
                        }}>
                          <code style={{ fontSize: 11 }}>{action.code}</code>
                          <Button
                            size="small"
                            onClick={() => copyToClipboard(action.code!)}
                            sx={{ ml: 1, minWidth: 'auto' }}
                          >
                            <ContentCopyIcon fontSize="small" />
                          </Button>
                        </Box>
                      </Paper>
                    ) : (
                      <Typography variant="body2" sx={{ ml: action.text.startsWith('•') ? 2 : 0 }}>
                        {action.text}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={step.completed}
                    onChange={() => handleStepComplete(index)}
                  />
                }
                label="I have completed this step"
                sx={{ mt: 2 }}
              />
            </StepContent>
          </Step>
        ))}
      </Stepper>

      {allStepsCompleted && (
        <Alert severity="success" sx={{ mt: 3 }}>
          <Typography variant="h6">Setup Complete! 🎉</Typography>
          <Typography variant="body2">
            All Firebase configuration steps have been completed. Your cameras should now be able to authenticate successfully.
          </Typography>
        </Alert>
      )}
    </Box>
  );
};

export default SetupGuide;