# OAuth Setup Guide for Anava Desktop App

## Prerequisites
- A Google Cloud Platform account
- A GCP project with billing enabled

## Step 1: Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project (or create a new one)
3. Navigate to **APIs & Services** → **Credentials**
4. Click **+ CREATE CREDENTIALS** → **OAuth client ID**

## Step 2: Configure OAuth Client

1. If prompted, configure the OAuth consent screen first:
   - Choose **External** user type
   - Fill in required fields (app name, support email)
   - Add scopes: 
     - `https://www.googleapis.com/auth/cloud-platform`
     - `https://www.googleapis.com/auth/userinfo.email`
   - Add test users if in testing mode

2. For the OAuth client:
   - **Application type**: Select **Desktop app** (IMPORTANT!)
   - **Name**: "Anava Desktop Client" (or any name you prefer)
   - Click **CREATE**

## Step 3: Download and Configure Credentials

1. After creation, click the download button to get your credentials
2. The downloaded file will be named something like `client_secret_XXXXX.json`
3. Rename it to `oauth-config.json`
4. Move it to the `anava-desktop-app` directory

The file should have this structure:
```json
{
  "installed": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "project_id": "your-project-id",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "YOUR_CLIENT_SECRET",
    "redirect_uris": ["http://localhost"]
  }
}
```

## Step 4: Update Redirect URI (if needed)

The app expects the redirect URI to be `http://localhost:8085`. 

To update:
1. Go back to your OAuth client in Google Cloud Console
2. Click on your client ID
3. Add `http://localhost:8085` to the redirect URIs
4. Save changes

Or update the `redirect_uris` in your `oauth-config.json`:
```json
"redirect_uris": ["http://localhost:8085"]
```

## Step 5: Verify Setup

1. Ensure `oauth-config.json` is in the `anava-desktop-app` directory
2. The file should NOT be committed to git (it's in .gitignore)
3. Start the app and try logging in

## Troubleshooting

### "invalid_client" error
- Ensure you selected "Desktop app" not "Web application"
- Verify the client_id and client_secret match exactly
- Check that redirect URI is correct

### "Authentication timeout"
- Ensure your firewall allows localhost connections on port 8085
- Try a different port by updating both the OAuth client and the config file

### Projects not loading
- Ensure your Google account has access to GCP projects
- Verify the OAuth scopes include `cloud-platform`

## Security Notes

- NEVER commit `oauth-config.json` to version control
- The client secret for desktop apps is not truly "secret" but should still be protected
- Users will authenticate in their own browser for security