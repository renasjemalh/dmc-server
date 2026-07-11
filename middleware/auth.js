//middleware/auth.js
const jwt = require('jsonwebtoken');

/**
 * 🔐 Primary Auth Middleware
 * Verifies if the user is logged in via a valid JWT.
 */
const auth = function (req, res, next) {
  // 1. Get token from header
  // Supports standard 'Authorization: Bearer <token>' or custom 'x-auth-token'
  let token = req.header('x-auth-token') || req.header('Authorization');

  // If using 'Bearer <token>', strip the 'Bearer ' part
  if (token && token.startsWith('Bearer ')) {
    token = token.split(' ')[1];
  }

  // 2. Check if no token
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  // 3. Verify token
  try {
    const secret = process.env.JWT_SECRET || 'dmc_secret_key_123';
    const decoded = jwt.verify(token, secret);

    // Add user from payload to request object (contains id and role)
    req.user = decoded.user;
    next();
  } catch (err) {
    console.error("Token verification failed:", err.message);
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

/**
 * 🛡️ Role-Based Access Control (RBAC)
 * Use this after 'auth' to restrict routes by user role.
 */
const checkRole = (role) => {
  return (req, res, next) => {
    if (req.user && req.user.role === role) {
      next();
    } else {
      res.status(403).json({ 
        msg: `Access Denied: ${role} credentials required.` 
      });
    }
  };
};

module.exports = { auth, checkRole };