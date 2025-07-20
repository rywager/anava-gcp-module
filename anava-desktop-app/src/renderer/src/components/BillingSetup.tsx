import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Chip
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import InfoIcon from '@mui/icons-material/Info';

interface BillingSetupProps {
  projectId: string;
  onRetry: () => void;
}

const BillingSetup: React.FC<BillingSetupProps> = ({ projectId, onRetry }) => {
  const billingUrl = `https://console.cloud.google.com/billing/linkedaccount?project=${projectId}`;
  
  return (
    <Card sx={{ maxWidth: 800, mx: 'auto' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <AccountBalanceWalletIcon sx={{ fontSize: 40, mr: 2, color: 'warning.main' }} />
          <Box>
            <Typography variant="h5" gutterBottom>
              Enable Billing for Your Project
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Project: <Chip label={projectId} size="small" sx={{ ml: 1 }} />
            </Typography>
          </Box>
        </Box>

        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2">
            Google Cloud requires billing to be enabled to deploy infrastructure resources. 
            This is a Google Cloud requirement, not specific to Anava.
          </Typography>
        </Alert>

        <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
          Quick Setup Steps:
        </Typography>
        
        <List>
          <ListItem>
            <ListItemIcon>
              <CheckCircleOutlineIcon />
            </ListItemIcon>
            <ListItemText 
              primary="1. Click the button below to open Google Cloud Billing"
              secondary="This will open the billing page for your specific project"
            />
          </ListItem>
          
          <ListItem>
            <ListItemIcon>
              <CheckCircleOutlineIcon />
            </ListItemIcon>
            <ListItemText 
              primary="2. Link a billing account or create a new one"
              secondary="You can use an existing billing account or create a new one"
            />
          </ListItem>
          
          <ListItem>
            <ListItemIcon>
              <CheckCircleOutlineIcon />
            </ListItemIcon>
            <ListItemText 
              primary="3. Return here and click 'Check Again'"
              secondary="Once billing is enabled, deployment will continue automatically"
            />
          </ListItem>
        </List>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
          <Button
            variant="contained"
            size="large"
            startIcon={<AccountBalanceWalletIcon />}
            endIcon={<OpenInNewIcon />}
            onClick={() => window.open(billingUrl, '_blank')}
            color="primary"
          >
            Enable Billing in Google Cloud
          </Button>
          
          <Button
            variant="outlined"
            size="large"
            onClick={onRetry}
          >
            Check Again
          </Button>
        </Box>

        <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center' }}>
            <InfoIcon fontSize="small" sx={{ mr: 1 }} />
            <strong>Note:</strong> You won't be charged unless you exceed Google's free tier limits. 
            Anava's infrastructure typically stays within free tier for development use.
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default BillingSetup;