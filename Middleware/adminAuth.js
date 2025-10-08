const jsonwebtoken = require('jsonwebtoken');
const Admin = require('../Models/Admin/Admin');

module.exports = async function adminAuth(req, res, next) {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ ok: false, message: 'No token, authorization denied' });
  }

  try {
    const decoded = jsonwebtoken.verify(token, process.env.JWT_SECRET_KEY);
    const admin = await Admin.findById(decoded.adminId).select('-password');
    if (!admin) {
      return res.status(401).json({ ok: false, message: 'Token is not valid' });
    }
    req.admin = admin;
    next();
  } catch (err) {
    console.error('adminAuth middleware error:', err);
    return res.status(401).json({ ok: false, message: 'Token is not valid' });
  }
};
