import { createTheme } from '@mui/material/styles';

// Design system tokens from UX specifications
export const designTokens = {
  // Primary Brand Colors
  colors: {
    primary: {
      main: '#0052CC',
      dark: '#003D99',
      light: '#4C9AFF'
    },
    secondary: {
      main: '#5243AA',
      light: '#8B7CDB',
      dark: '#3B2E7F'
    },
    success: '#00875A',
    warning: '#FF991F',
    error: '#DE350B',
    info: '#5243AA',
    // Neutral Colors
    background: {
      default: '#F7F8FA',
      paper: '#FFFFFF'
    },
    border: '#DFE1E6',
    text: {
      primary: '#172B4D',
      secondary: '#6B778C'
    }
  },
  // Typography System
  typography: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    h1: {
      fontSize: '32px',
      fontWeight: 600
    },
    h2: {
      fontSize: '24px',
      fontWeight: 600
    },
    h3: {
      fontSize: '20px',
      fontWeight: 500
    },
    h4: {
      fontSize: '16px',
      fontWeight: 500
    },
    bodyLarge: {
      fontSize: '16px',
      fontWeight: 400
    },
    body: {
      fontSize: '14px',
      fontWeight: 400
    },
    small: {
      fontSize: '12px',
      fontWeight: 400
    },
    button: {
      fontSize: '14px',
      fontWeight: 500,
      letterSpacing: '0.5px'
    },
    code: {
      fontSize: '13px',
      fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace"
    }
  },
  // Spacing
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32
  },
  // Shadows
  shadows: {
    card: '0 1px 3px rgba(0, 0, 0, 0.12)',
    hover: '0 4px 8px rgba(0, 0, 0, 0.15)'
  },
  // Transitions
  transitions: {
    fast: '200ms ease-in-out',
    normal: '300ms ease-in-out'
  },
  // Border radius
  borderRadius: {
    small: 4,
    medium: 8,
    large: 12
  }
};

// Create MUI theme based on design tokens
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: designTokens.colors.primary.main,
      dark: designTokens.colors.primary.dark,
      light: designTokens.colors.primary.light,
      contrastText: '#FFFFFF'
    },
    secondary: {
      main: designTokens.colors.secondary.main,
      light: designTokens.colors.secondary.light,
      dark: designTokens.colors.secondary.dark,
      contrastText: '#FFFFFF'
    },
    success: {
      main: designTokens.colors.success,
      contrastText: '#FFFFFF'
    },
    warning: {
      main: designTokens.colors.warning,
      contrastText: '#FFFFFF'
    },
    error: {
      main: designTokens.colors.error,
      contrastText: '#FFFFFF'
    },
    info: {
      main: designTokens.colors.info,
      contrastText: '#FFFFFF'
    },
    background: {
      default: designTokens.colors.background.default,
      paper: designTokens.colors.background.paper
    },
    text: {
      primary: designTokens.colors.text.primary,
      secondary: designTokens.colors.text.secondary
    },
    divider: designTokens.colors.border
  },
  typography: {
    fontFamily: designTokens.typography.fontFamily,
    h1: {
      fontSize: designTokens.typography.h1.fontSize,
      fontWeight: designTokens.typography.h1.fontWeight,
      color: designTokens.colors.text.primary
    },
    h2: {
      fontSize: designTokens.typography.h2.fontSize,
      fontWeight: designTokens.typography.h2.fontWeight,
      color: designTokens.colors.text.primary
    },
    h3: {
      fontSize: designTokens.typography.h3.fontSize,
      fontWeight: designTokens.typography.h3.fontWeight,
      color: designTokens.colors.text.primary
    },
    h4: {
      fontSize: designTokens.typography.h4.fontSize,
      fontWeight: designTokens.typography.h4.fontWeight,
      color: designTokens.colors.text.primary
    },
    h5: {
      fontSize: designTokens.typography.bodyLarge.fontSize,
      fontWeight: 500,
      color: designTokens.colors.text.primary
    },
    h6: {
      fontSize: designTokens.typography.body.fontSize,
      fontWeight: 500,
      color: designTokens.colors.text.primary
    },
    body1: {
      fontSize: designTokens.typography.body.fontSize,
      fontWeight: designTokens.typography.body.fontWeight,
      color: designTokens.colors.text.primary
    },
    body2: {
      fontSize: designTokens.typography.small.fontSize,
      fontWeight: designTokens.typography.small.fontWeight,
      color: designTokens.colors.text.secondary
    },
    button: {
      fontSize: designTokens.typography.button.fontSize,
      fontWeight: designTokens.typography.button.fontWeight,
      letterSpacing: designTokens.typography.button.letterSpacing,
      textTransform: 'none' // Disable uppercase transformation
    }
  },
  spacing: designTokens.spacing.sm, // Base spacing unit (8px)
  shape: {
    borderRadius: designTokens.borderRadius.medium
  },
  shadows: [
    'none',
    designTokens.shadows.card,
    designTokens.shadows.card,
    designTokens.shadows.card,
    designTokens.shadows.hover,
    designTokens.shadows.hover,
    designTokens.shadows.hover,
    designTokens.shadows.hover,
    designTokens.shadows.hover,
    designTokens.shadows.hover,
    designTokens.shadows.hover,
    designTokens.shadows.hover,
    designTokens.shadows.hover,
    designTokens.shadows.hover,
    designTokens.shadows.hover,
    designTokens.shadows.hover,
    designTokens.shadows.hover,
    designTokens.shadows.hover,
    designTokens.shadows.hover,
    designTokens.shadows.hover,
    designTokens.shadows.hover,
    designTokens.shadows.hover,
    designTokens.shadows.hover,
    designTokens.shadows.hover,
    designTokens.shadows.hover
  ],
  transitions: {
    duration: {
      shortest: 150,
      shorter: 200,
      short: 250,
      standard: 300,
      complex: 375,
      enteringScreen: 225,
      leavingScreen: 195
    },
    easing: {
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      sharp: 'cubic-bezier(0.4, 0, 0.6, 1)'
    }
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          minHeight: 36,
          paddingLeft: 16,
          paddingRight: 16,
          borderRadius: designTokens.borderRadius.small,
          transition: designTokens.transitions.fast
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: designTokens.shadows.hover
          }
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: designTokens.shadows.card,
          borderRadius: designTokens.borderRadius.medium,
          '&:hover': {
            boxShadow: designTokens.shadows.hover
          }
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: designTokens.borderRadius.medium
        }
      }
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: designTokens.borderRadius.small
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: designTokens.colors.background.paper,
          color: designTokens.colors.text.primary,
          boxShadow: `0 1px 0 ${designTokens.colors.border}`
        }
      }
    }
  }
});

export default theme;