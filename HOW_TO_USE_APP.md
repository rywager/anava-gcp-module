# 🚀 How to Use the App to Send Configuration to Camera

## Step 1: Open the Electron App
The app is now running. You should see a window with "Anava Vision Desktop" at the top.

## Step 2: Navigate to Configuration
1. Look for **two tabs** at the top of the main content area:
   - "Deploy Infrastructure" 
   - "Configuration"
   
2. Click on the **"Configuration"** tab

## Step 3: View Your Deployed Configuration
You'll see all your real Terraform deployment details:
- **API Gateway URL**: https://anava-gateway-2gvbe0bn.uc.gateway.dev
- **API Key**: AIzaSyD-***-m4xAU4 (masked for security)
- **Device Auth URL**: https://anava-device-auth-fn-6hvyxxvgsa-uc.a.run.app
- **Firebase Project**: ryanclean
- And more...

## Step 4: Send to Camera
1. Click the **"Send to Camera"** button (blue button in the top right)

2. A dialog will pop up asking for:
   - **Camera IP Address**: Enter your camera's IP (e.g., 192.168.1.100)
   - **Use encryption**: Leave this checked (recommended)

3. Click **"Send Configuration"**

## What Happens Next:
1. The app will first test if the camera is accessible
2. If successful, it sends all the configuration automatically
3. You'll see a green success message
4. The dialog will close automatically after 2 seconds

## If There's an Error:
- **"Camera not accessible"**: Check the IP address and make sure the camera is on the network
- **"Failed to send"**: Make sure the ACAP is installed on the camera first

## To Verify It Worked:
1. Open your camera's web interface
2. Go to the BatonAnalytic app
3. Navigate to System Configuration
4. You should see all the values populated automatically!

## Troubleshooting:
- Make sure the camera has the latest ACAP installed (version 3.7.22)
- Ensure the camera is on the same network
- Check that port 80 is open on the camera

That's it! No more manual copy/paste of API keys and URLs! 🎉