const jwt = require('jsonwebtoken');
require('dotenv').config();


const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const secret = process.env.JWT_SECRET_KEY;

    if (!secret) {
      throw new Error('JWT secret not configured in environment');
    }

    const decoded = jwt.verify(token, secret); // ✅ Secret must be passed here

    

    req.user = decoded;
    next();
  } catch (err) {
    console.error('JWT verification failed:', err);
    res.status(400).json({ error: 'Invalid token' });
  }
};

module.exports = auth;


