import React from 'react';
import {
  Box,
  Typography,
  Stepper,
  Step,
  StepLabel,
  StepConnector,
  stepConnectorClasses,
  styled,
  StepIconProps
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import CircleIcon from '@mui/icons-material/Circle';
import { designTokens } from '../theme';

export interface WorkflowStep {
  label: string;
  description?: string;
  estimatedTime?: string;
}

interface WorkflowStepperProps {
  currentStep: number;
  steps: WorkflowStep[];
  onStepClick?: (step: number) => void;
}

// Custom connector with gradient for completed steps
const ColorlibConnector = styled(StepConnector)(({ theme }) => ({
  [`&.${stepConnectorClasses.alternativeLabel}`]: {
    top: 22,
  },
  [`&.${stepConnectorClasses.active}`]: {
    [`& .${stepConnectorClasses.line}`]: {
      backgroundImage: `linear-gradient(95deg, ${designTokens.colors.primary.main} 0%, ${designTokens.colors.primary.light} 100%)`,
    },
  },
  [`&.${stepConnectorClasses.completed}`]: {
    [`& .${stepConnectorClasses.line}`]: {
      backgroundColor: designTokens.colors.success,
    },
  },
  [`& .${stepConnectorClasses.line}`]: {
    height: 3,
    border: 0,
    backgroundColor: designTokens.colors.border,
    borderRadius: 1,
    transition: designTokens.transitions.normal,
  },
}));

// Custom step icon
function ColorlibStepIcon(props: StepIconProps) {
  const { active, completed, className } = props;

  const icons: { [index: string]: React.ReactElement } = {
    1: <Typography sx={{ fontSize: 14, fontWeight: 600 }}>1</Typography>,
    2: <Typography sx={{ fontSize: 14, fontWeight: 600 }}>2</Typography>,
    3: <Typography sx={{ fontSize: 14, fontWeight: 600 }}>3</Typography>,
    4: <Typography sx={{ fontSize: 14, fontWeight: 600 }}>4</Typography>,
    5: <Typography sx={{ fontSize: 14, fontWeight: 600 }}>5</Typography>,
    6: <Typography sx={{ fontSize: 14, fontWeight: 600 }}>6</Typography>,
  };

  if (completed) {
    return (
      <Box
        className={className}
        sx={{
          width: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: designTokens.colors.success,
          transition: designTokens.transitions.fast,
        }}
      >
        <CheckCircleIcon sx={{ fontSize: 44 }} />
      </Box>
    );
  }

  if (active) {
    return (
      <Box
        className={className}
        sx={{
          width: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: designTokens.colors.primary.main,
          position: 'relative',
          transition: designTokens.transitions.fast,
        }}
      >
        <CircleIcon sx={{ fontSize: 44 }} />
        <Box
          sx={{
            position: 'absolute',
            color: '#fff',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {String(props.icon)}
        </Box>
        {/* Pulsing animation for active step */}
        <Box
          sx={{
            position: 'absolute',
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: `2px solid ${designTokens.colors.primary.main}`,
            animation: 'pulse 2s infinite',
            '@keyframes pulse': {
              '0%': {
                transform: 'scale(1)',
                opacity: 1,
              },
              '50%': {
                transform: 'scale(1.2)',
                opacity: 0.5,
              },
              '100%': {
                transform: 'scale(1)',
                opacity: 1,
              },
            },
          }}
        />
      </Box>
    );
  }

  return (
    <Box
      className={className}
      sx={{
        width: 44,
        height: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: designTokens.colors.text.secondary,
        border: `2px solid ${designTokens.colors.border}`,
        borderRadius: '50%',
        backgroundColor: designTokens.colors.background.paper,
        transition: designTokens.transitions.fast,
        '&:hover': {
          borderColor: designTokens.colors.primary.light,
          cursor: 'pointer',
        },
      }}
    >
      {icons[String(props.icon)]}
    </Box>
  );
}

const WorkflowStepper: React.FC<WorkflowStepperProps> = ({
  currentStep,
  steps,
  onStepClick,
}) => {
  return (
    <Box sx={{ width: '100%', mb: 4 }}>
      <Stepper
        alternativeLabel
        activeStep={currentStep}
        connector={<ColorlibConnector />}
      >
        {steps.map((step, index) => (
          <Step key={index}>
            <StepLabel
              StepIconComponent={ColorlibStepIcon}
              onClick={() => {
                if (onStepClick && index < currentStep) {
                  onStepClick(index);
                }
              }}
              sx={{
                cursor: index < currentStep && onStepClick ? 'pointer' : 'default',
                '& .MuiStepLabel-label': {
                  mt: 1,
                  color: designTokens.colors.text.secondary,
                  fontSize: designTokens.typography.body.fontSize,
                  fontWeight: index === currentStep ? 500 : 400,
                  '&.Mui-completed': {
                    color: designTokens.colors.text.primary,
                    fontWeight: 400,
                  },
                  '&.Mui-active': {
                    color: designTokens.colors.text.primary,
                    fontWeight: 500,
                  },
                },
              }}
            >
              <Box>
                <Typography>{step.label}</Typography>
                {step.estimatedTime && (
                  <Typography
                    variant="body2"
                    sx={{
                      color: designTokens.colors.text.secondary,
                      fontSize: designTokens.typography.small.fontSize,
                      mt: 0.5,
                    }}
                  >
                    {index === currentStep ? 'In Progress' : 
                     index < currentStep ? 'Complete' : 
                     step.estimatedTime}
                  </Typography>
                )}
              </Box>
            </StepLabel>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
};

export default WorkflowStepper;