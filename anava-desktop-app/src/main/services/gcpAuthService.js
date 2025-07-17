const { OAuth2Client } = require('google-auth-library');
const { google } = require('googleapis');
const { BrowserWindow } = require('electron');
const path = require('path');

class GCPAuthService {
  constructor(store) {
    this.store = store;
    
    // OAuth2 configuration for desktop app
    this.clientId = '764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com';
    this.redirectUri = 'http://localhost:8085/';
    this.scopes = [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/userinfo.email'
    ];
    
    this.oauth2Client = new OAuth2Client(
      this.clientId,
      null, // No client secret for desktop apps
      this.redirectUri
    );
    
    this.authWindow = null;
    this.tokens = null;
    
    // Load stored tokens on startup
    this.loadStoredTokens();
  }

  async loadStoredTokens() {
    try {
      const storedTokens = this.store.get('gcpTokens');
      if (storedTokens && storedTokens.access_token) {
        this.tokens = storedTokens;
        this.oauth2Client.setCredentials(storedTokens);
        console.log('Loaded stored GCP tokens');
      }
    } catch (err) {
      console.log('No stored tokens found');
    }
  }

  async saveTokens(tokens) {
    this.tokens = tokens;
    this.store.set('gcpTokens', tokens);
    this.oauth2Client.setCredentials(tokens);
    console.log('Saved GCP tokens');
  }

  async authenticate() {
    // Check if we already have valid tokens
    if (this.tokens && this.tokens.access_token) {
      try {
        // Test if tokens are still valid
        const auth = google.auth.fromJSON({
          type: 'authorized_user',
          client_id: this.clientId,
          refresh_token: this.tokens.refresh_token,
          access_token: this.tokens.access_token
        });
        
        // Try a simple API call to verify tokens work
        const oauth2 = google.oauth2({ version: 'v2', auth });
        await oauth2.userinfo.get();
        
        console.log('Using existing valid tokens');
        return {
          success: true,
          tokens: this.tokens
        };
      } catch (err) {
        console.log('Stored tokens are invalid, need to re-authenticate');
        this.tokens = null;
        this.store.delete('gcpTokens');
      }
    }

    return new Promise((resolve, reject) => {
      // Generate auth URL
      const authUrl = this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: this.scopes,
        prompt: 'consent'
      });

      // Create auth window
      this.authWindow = new BrowserWindow({
        width: 600,
        height: 800,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      // Handle auth callback
      this.authWindow.webContents.on('will-redirect', async (event, url) => {
        if (url.startsWith(this.redirectUri)) {
          event.preventDefault();
          
          try {
            const urlParams = new URL(url);
            const code = urlParams.searchParams.get('code');
            
            if (code) {
              // Exchange code for tokens
              const { tokens } = await this.oauth2Client.getToken(code);
              
              // Save tokens persistently
              await this.saveTokens(tokens);
              
              // Get user info
              const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
              const { data } = await oauth2.userinfo.get();
              
              this.authWindow.close();
              
              resolve({
                success: true,
                tokens,
                user: {
                  email: data.email,
                  name: data.name,
                  picture: data.picture
                }
              });
            } else {
              reject(new Error('No authorization code received'));
            }
          } catch (error) {
            this.authWindow.close();
            reject(error);
          }
        }
      });

      // Handle window closed
      this.authWindow.on('closed', () => {
        this.authWindow = null;
        reject(new Error('Authentication cancelled'));
      });

      // Load auth URL
      this.authWindow.loadURL(authUrl);
    });
  }

  async refreshToken(refreshToken) {
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await this.oauth2Client.refreshAccessToken();
    return credentials;
  }

  setCredentials(tokens) {
    this.oauth2Client.setCredentials(tokens);
  }

  getAuthClient() {
    return this.oauth2Client;
  }

  async isAuthenticated() {
    if (!this.tokens || !this.tokens.access_token) {
      return false;
    }
    
    try {
      // Test if tokens are still valid
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      await oauth2.userinfo.get();
      return true;
    } catch (err) {
      console.log('Stored tokens are invalid');
      this.tokens = null;
      this.store.delete('gcpTokens');
      return false;
    }
  }

  async getCurrentUser() {
    if (!this.tokens) return null;
    
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const { data } = await oauth2.userinfo.get();
      return {
        email: data.email,
        name: data.name,
        picture: data.picture
      };
    } catch (err) {
      return null;
    }
  }

  async listProjects() {
    const cloudResourceManager = google.cloudresourcemanager({ 
      version: 'v1', 
      auth: this.oauth2Client 
    });
    
    const { data } = await cloudResourceManager.projects.list();
    return data.projects || [];
  }

  async setProject(projectId) {
    // Store the selected project
    this.currentProject = projectId;
    return projectId;
  }
}

module.exports = GCPAuthService;