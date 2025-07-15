const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID || 'your-project-id'
  });
}

// Middleware to authenticate HTTP requests
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.split('Bearer ')[1];
  
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Function to authenticate WebSocket connections
const authenticateWebSocket = async (token) => {
  try {
    if (!token) {
      return { success: false, error: 'No token provided' };
    }
    
    const decodedToken = await admin.auth().verifyIdToken(token);
    return { 
      success: true, 
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified
      }
    };
  } catch (error) {
    console.error('WebSocket authentication error:', error);
    return { success: false, error: 'Invalid token' };
  }
};

// Middleware to check specific permissions
const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      // Check custom claims for permissions
      const user = await admin.auth().getUser(req.user.uid);
      const customClaims = user.customClaims || {};
      
      if (customClaims[permission] === true || customClaims.admin === true) {
        next();
      } else {
        res.status(403).json({ error: 'Insufficient permissions' });
      }
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

module.exports = {
  authenticateToken,
  authenticateWebSocket,
  requirePermission
};