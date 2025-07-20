const { OAuth2Client } = require('google-auth-library');
const { google } = require('googleapis');
const { shell, app } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs').promises;
const crypto = require('crypto');
const os = require('os');
const log = require('electron-log');

class GCPAuthService {
  constructor(store) {
    this.store = store;
    this.oauth2Client = null;
    this.server = null;
    this.authConfig = null;
    this.codeVerifier = null; // For PKCE
    
    // Initialize the service
    this.initialize();
  }

  async initialize() {
    try {
      // Load OAuth configuration from file
      await this.loadOAuthConfig();
      
      // Try to restore saved tokens
      await this.restoreTokens();
    } catch (error) {
      console.error('Failed to initialize GCPAuthService:', error);
    }
  }

  async loadOAuthConfig() {
    try {
      // First try app directory
      let configPath = path.join(app.getAppPath(), 'oauth-config.json');
      log.info('Checking for OAuth config at:', configPath);
      
      // If not found, try development path
      if (!await this.fileExists(configPath)) {
        configPath = path.join(__dirname, '../../../oauth-config.json');
        log.info('Checking development path:', configPath);
      }
      
      // Check if file exists
      if (!await this.fileExists(configPath)) {
        throw new Error(`OAuth config file not found at: ${configPath}`);
      }
      
      const configData = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configData);
      
      if (!config.installed) {
        throw new Error('Invalid OAuth config: missing "installed" section');
      }
      
      this.authConfig = config.installed;
      
      // Create OAuth2 client
      this.oauth2Client = new OAuth2Client(
        this.authConfig.client_id,
        this.authConfig.client_secret,
        this.authConfig.redirect_uris[0]
      );
      
      console.log('OAuth configuration loaded successfully');
    } catch (error) {
      console.error('Failed to load OAuth config:', error);
      throw new Error('OAuth configuration not found. Please ensure oauth-config.json exists.');
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async restoreTokens() {
    try {
      const tokens = this.store.get('gcpTokens');
      if (tokens && tokens.refresh_token) {
        this.oauth2Client.setCredentials(tokens);
        
        // Check if access token is expired
        if (this.isTokenExpired(tokens)) {
          console.log('Access token expired, refreshing...');
          await this.refreshAccessToken();
        } else {
          console.log('Restored valid tokens from storage');
        }
      }
    } catch (error) {
      console.log('No valid stored tokens found');
    }
  }

  isTokenExpired(tokens) {
    if (!tokens.expiry_date) return true;
    return Date.now() >= tokens.expiry_date;
  }

  async refreshAccessToken() {
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      await this.saveTokens(credentials);
      console.log('Access token refreshed successfully');
      return credentials;
    } catch (error) {
      console.error('Failed to refresh access token:', error);
      
      // Check if this is a RAPT error (reauth required)
      if (error.message && (
        error.message.includes('invalid_rapt') ||
        error.message.includes('rapt_required') ||
        error.message.includes('invalid_grant')
      )) {
        console.log('RAPT reauth required - need to perform full authentication');
        // Return special error to trigger full reauth
        throw new Error('REAUTH_REQUIRED');
      }
      
      // Clear invalid tokens
      this.store.delete('gcpTokens');
      this.store.delete('gcpUser');
      throw error;
    }
  }

  async saveTokens(tokens) {
    this.store.set('gcpTokens', tokens);
    this.oauth2Client.setCredentials(tokens);
    
    // Also set up Application Default Credentials for terraform
    await this.setupApplicationDefaultCredentials(tokens);
  }
  
  async setupApplicationDefaultCredentials(tokens) {
    try {
      // Create ADC file in the standard location
      const adcPath = path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json');
      const adcDir = path.dirname(adcPath);
      
      // Ensure directory exists
      await fs.mkdir(adcDir, { recursive: true });
      
      // Create ADC format credentials
      const adcCredentials = {
        client_id: this.authConfig.client_id,
        client_secret: this.authConfig.client_secret,
        refresh_token: tokens.refresh_token,
        type: 'authorized_user'
      };
      
      // Write ADC file
      await fs.writeFile(adcPath, JSON.stringify(adcCredentials, null, 2));
      
      // Set environment variable
      process.env.GOOGLE_APPLICATION_CREDENTIALS = adcPath;
      
      console.log('Application Default Credentials configured successfully');
    } catch (error) {
      console.error('Failed to set up ADC:', error);
      // Non-fatal error - terraform might still work with gcloud auth
    }
  }

  async authenticate() {
    log.info('GCPAuthService.authenticate() called');
    
    if (!this.oauth2Client) {
      const error = 'OAuth client not initialized. Check oauth-config.json';
      log.error(error);
      throw new Error(error);
    }

    // Check if we have valid tokens
    log.info('Checking for valid stored tokens...');
    const isValid = await this.validateStoredTokens();
    if (isValid) {
      log.info('Valid tokens found, getting current user...');
      const user = await this.getCurrentUser();
      return {
        success: true,
        tokens: this.oauth2Client.credentials,
        user
      };
    }

    // Start new authentication flow
    log.info('No valid tokens, starting new authentication flow...');
    return this.startAuthFlow();
  }

  async validateStoredTokens() {
    try {
      const tokens = this.store.get('gcpTokens');
      if (!tokens || !tokens.refresh_token) {
        return false;
      }

      this.oauth2Client.setCredentials(tokens);

      // If access token is expired, try to refresh
      if (this.isTokenExpired(tokens)) {
        try {
          await this.refreshAccessToken();
        } catch (error) {
          if (error.message === 'REAUTH_REQUIRED') {
            console.log('Full reauthentication required');
            return false;
          }
          throw error;
        }
      }

      // Validate by making a simple API call
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      await oauth2.userinfo.get();
      
      return true;
    } catch (error) {
      console.log('Token validation failed:', error.message);
      // Clear invalid tokens
      this.store.delete('gcpTokens');
      this.store.delete('gcpUser');
      return false;
    }
  }

  generateCodeVerifier() {
    // Generate a secure random string for PKCE
    return crypto.randomBytes(32).toString('base64url');
  }

  generateCodeChallenge(verifier) {
    // Generate SHA256 hash of the verifier for PKCE
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  async startAuthFlow() {
    log.info('Starting OAuth authentication flow...');
    
    return new Promise((resolve, reject) => {
      // Generate PKCE parameters for added security
      this.codeVerifier = this.generateCodeVerifier();
      const codeChallenge = this.generateCodeChallenge(this.codeVerifier);
      log.info('Generated PKCE parameters');

      // Create local server to handle callback
      this.server = http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://localhost:${this.getPort()}`);
        
        if (url.pathname === '/' && url.searchParams.has('code')) {
          const code = url.searchParams.get('code');
          
          // Send success page to browser
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(this.getSuccessHTML());
          
          // Close server
          this.server.close();
          
          try {
            // Exchange code for tokens
            const { tokens } = await this.oauth2Client.getToken({
              code,
              codeVerifier: this.codeVerifier
            });
            
            // Save tokens
            await this.saveTokens(tokens);
            
            // Get user info
            const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
            const { data: user } = await oauth2.userinfo.get();
            
            // Save user info
            this.store.set('gcpUser', user);
            
            resolve({
              success: true,
              tokens,
              user: {
                email: user.email,
                name: user.name,
                picture: user.picture
              }
            });
          } catch (error) {
            console.error('Token exchange failed:', error);
            reject(error);
          }
        } else if (url.searchParams.has('error')) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(this.getErrorHTML(url.searchParams.get('error')));
          this.server.close();
          reject(new Error(`Authentication failed: ${url.searchParams.get('error')}`));
        }
      });

      // Start server
      const port = this.getPort();
      this.server.listen(port, () => {
        log.info(`Auth server listening on port ${port}`);
        
        // Generate auth URL with PKCE
        const authUrl = this.oauth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: [
            'https://www.googleapis.com/auth/cloud-platform',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile'
          ],
          prompt: 'consent',
          code_challenge_method: 'S256',
          code_challenge: codeChallenge,
          // CRITICAL: Force re-authentication to prevent RAPT errors
          max_age: 0
        });
        
        log.info('Opening authentication URL in browser:', authUrl);
        
        // Open in system browser
        shell.openExternal(authUrl).catch(error => {
          log.error('Failed to open browser:', error);
          reject(new Error('Failed to open authentication URL in browser'));
        });
      });

      // Set timeout
      setTimeout(() => {
        if (this.server && this.server.listening) {
          this.server.close();
          reject(new Error('Authentication timeout'));
        }
      }, 5 * 60 * 1000); // 5 minutes
    });
  }

  getPort() {
    // Extract port from redirect URI
    const redirectUri = this.authConfig?.redirect_uris?.[0] || 'http://localhost:8085';
    const url = new URL(redirectUri);
    return parseInt(url.port) || 8085;
  }

  getSuccessHTML() {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Authentication Successful</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .container {
            text-align: center;
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 { color: #1a73e8; }
          p { color: #5f6368; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Authentication Successful</h1>
          <p>You can close this window and return to the Anava app.</p>
          <p>This window will close automatically in 3 seconds...</p>
        </div>
        <script>
          setTimeout(() => window.close(), 3000);
        </script>
      </body>
      </html>
    `;
  }

  getErrorHTML(error) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Failed</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .container {
            text-align: center;
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 { color: #d93025; }
          p { color: #5f6368; margin: 20px 0; }
          .error { font-family: monospace; background: #f8f8f8; padding: 10px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✗ Authentication Failed</h1>
          <p>There was an error during authentication:</p>
          <p class="error">${error}</p>
          <p>Please close this window and try again.</p>
        </div>
      </body>
      </html>
    `;
  }

  async getCurrentUser() {
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const { data } = await oauth2.userinfo.get();
      return {
        email: data.email,
        name: data.name,
        picture: data.picture
      };
    } catch (error) {
      console.error('Failed to get user info:', error);
      return null;
    }
  }

  async listProjects() {
    if (!this.oauth2Client || !this.oauth2Client.credentials) {
      throw new Error('Not authenticated');
    }

    try {
      log.info('Listing GCP projects...');
      const cloudResourceManager = google.cloudresourcemanager('v1');
      const auth = this.oauth2Client;
      
      // Set a timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Project listing timed out after 10 seconds')), 10000);
      });
      
      const listPromise = cloudResourceManager.projects.list({
        auth,
        pageSize: 100,
        filter: 'lifecycleState:ACTIVE'
      });
      
      const response = await Promise.race([listPromise, timeoutPromise]);
      
      const projects = response.data.projects || [];
      log.info(`Found ${projects.length} projects`);
      
      return projects;
    } catch (error) {
      log.error('Failed to list projects:', error.message);
      
      // Check if it's an authentication error
      if (error.code === 401 || error.message?.includes('invalid_grant')) {
        // Try to refresh the token
        try {
          await this.refreshAccessToken();
          // Retry once after refreshing
          const cloudResourceManager = google.cloudresourcemanager('v1');
          const response = await cloudResourceManager.projects.list({
            auth: this.oauth2Client,
            pageSize: 100,
            filter: 'lifecycleState:ACTIVE'
          });
          return response.data.projects || [];
        } catch (refreshError) {
          log.error('Failed to refresh token and retry:', refreshError);
          throw new Error('Authentication expired. Please sign in again.');
        }
      }
      
      throw error;
    }
  }

  async logout() {
    // Clear stored tokens and user info
    this.store.delete('gcpTokens');
    this.store.delete('gcpUser');
    
    // Clear OAuth client credentials
    if (this.oauth2Client) {
      this.oauth2Client.setCredentials({});
    }
    
    console.log('Logged out successfully');
  }

  isAuthenticated() {
    return !!(this.oauth2Client && 
             this.oauth2Client.credentials && 
             this.oauth2Client.credentials.refresh_token);
  }

  getCredentials() {
    return this.oauth2Client?.credentials || null;
  }

  // Check if billing is enabled for a project
  async checkBillingEnabled(projectId) {
    try {
      log.info(`Checking billing status for project: ${projectId}`);
      
      // Ensure we have valid authentication
      const isValid = await this.validateStoredTokens();
      if (!isValid) {
        throw new Error('Authentication expired. Please sign in again.');
      }
      
      const { google } = require('googleapis');
      
      // First, ensure required APIs are enabled
      const serviceusage = google.serviceusage('v1');
      
      // Enable Cloud Resource Manager API if not already enabled
      try {
        await serviceusage.services.enable({
          name: `projects/${projectId}/services/cloudresourcemanager.googleapis.com`,
          auth: this.oauth2Client
        });
        log.info('Enabled Cloud Resource Manager API');
      } catch (e) {
        // API might already be enabled
      }
      
      // The most reliable way: Try to create a small storage bucket (requires billing)
      const storage = google.storage('v1');
      const testBucketName = `anava-billing-test-${projectId}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      
      try {
        log.info(`Testing billing by attempting to create test bucket: ${testBucketName}`);
        
        // Try to create a bucket (this requires billing)
        await storage.buckets.insert({
          project: projectId,
          auth: this.oauth2Client,
          requestBody: {
            name: testBucketName,
            location: 'US',
            storageClass: 'STANDARD'
          }
        });
        
        // If we got here, billing is enabled! Clean up the test bucket
        log.info('Successfully created test bucket, billing is enabled!');
        
        // Delete the test bucket
        try {
          await storage.buckets.delete({
            bucket: testBucketName,
            auth: this.oauth2Client
          });
          log.info('Cleaned up test bucket');
        } catch (deleteError) {
          log.warn('Could not delete test bucket:', deleteError.message);
        }
        
        return {
          enabled: true,
          method: 'bucket_test'
        };
        
      } catch (storageError) {
        log.error('Storage bucket test failed:', storageError.message);
        
        // Check if it's specifically a billing error
        if (storageError.code === 403 && 
            (storageError.message.includes('billing') || 
             storageError.message.includes('Billing') ||
             storageError.message.includes('billing account'))) {
          log.info('Storage API confirmed billing is NOT enabled');
          return {
            enabled: false,
            error: 'Billing is not enabled for this project'
          };
        }
        
        // If it's not a billing error, try another method
        // Check if any billing-required APIs are already enabled
        try {
          const servicesResponse = await serviceusage.services.list({
            parent: `projects/${projectId}`,
            filter: 'state:ENABLED',
            auth: this.oauth2Client,
            pageSize: 200
          });
          
          const billingRequiredServices = [
            'compute.googleapis.com',
            'container.googleapis.com', 
            'cloudfunctions.googleapis.com',
            'run.googleapis.com',
            'cloudbuild.googleapis.com',
            'artifactregistry.googleapis.com',
            'sqladmin.googleapis.com'
          ];
          
          const enabledServices = (servicesResponse.data.services || [])
            .map(s => s.name?.split('/').pop())
            .filter(Boolean);
          
          log.info('Enabled services:', enabledServices);
          
          const hasBillingServices = billingRequiredServices.some(service => 
            enabledServices.includes(service)
          );
          
          if (hasBillingServices) {
            log.info('Found billing-required services already enabled, billing must be active');
            return {
              enabled: true,
              method: 'enabled_services'
            };
          }
          
          // No billing services found, billing might not be enabled
          return {
            enabled: false,
            requiresManualCheck: true,
            error: 'Could not confirm billing status. No billing-required services are enabled.'
          };
          
        } catch (listError) {
          log.error('Could not list services:', listError.message);
        }
      }
      
      // If all else fails, we can't determine billing status
      return {
        enabled: false,
        requiresManualCheck: true,
        error: 'Could not verify billing status. Please ensure billing is enabled.'
      };
      
    } catch (error) {
      log.error('Error checking billing status:', error);
      
      return {
        enabled: false,
        error: error.message || 'Failed to check billing status',
        requiresManualCheck: true
      };
    }
  }
}

module.exports = GCPAuthService;