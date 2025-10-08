const Admin = require('../../Models/Admin/Admin');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../../Middleware/auth');
const adminAuth = require('../../Middleware/adminAuth');

// Register a new admin (only super admins can do this)
router.post('/register', adminAuth, async (req, res) => {
  try {
    if (!req.admin?.isSuperAdmin) {
      return res.status(403).json({ ok: false, message: 'Forbidden: Only super admins can register new admins' });
    }

    const { email, password, fullname, isSuperAdmin = false, phone } = req.body;

    if (!email || !password || !fullname) {
      return res.status(400).json({ ok: false, message: 'Email, password, and fullname are required' });
    }

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ ok: false, message: 'Admin with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = new Admin({
      email,
      password: hashedPassword,
      fullname,
      isSuperAdmin,
      phone,
    });

    await newAdmin.save();

    return res.status(201).json({ ok: true, message: 'Admin registered successfully' });
  } catch (err) {
    console.error('Error registering admin:', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ ok: false, message: 'Email and password are required' });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(400).json({ ok: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ ok: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { adminId: admin._id, isSuperAdmin: admin.isSuperAdmin },
      process.env.JWT_SECRET_KEY,
      { expiresIn: '8h' }
    );

    admin.lastLoggedin = new Date();
    await admin.save();

    return res.status(200).json({
      ok: true,
      token,
      admin: {
        id: admin._id,
        email: admin.email,
        fullname: admin.fullname,
        isSuperAdmin: admin.isSuperAdmin,
        phone: admin.phone,
      },
    });
  } catch (err) {
    console.error('Error during admin login:', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});


router.get('/me', adminAuth, async (req, res) => {
  try {
    if (!req.admin) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    const admin = await Admin.findById(req.admin.adminId).select('-password');
    if (!admin) {
      return res.status(404).json({ ok: false, message: 'Admin not found' });
    }

    return res.status(200).json({ ok: true, admin });
  } catch (err) {
    console.error('Error fetching admin profile:', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});
module.exports = router; 