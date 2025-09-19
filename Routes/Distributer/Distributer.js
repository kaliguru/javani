const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const Distributer = require('../../Models/Distributer/Distributer');
const User = require('../../Models/User/User'); // to validate addedBy
const auth = require('../../Middleware/auth');
const { sendSMS } = require('../../Utils/Sms');
require('dotenv').config();

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate unique distributer ID like DIST-01, DIST-02, ...
async function generateDistributerId() {
  const last = await Distributer.findOne({ distributerId: { $regex: /^DIST-\d+$/ } })
    .sort({ distributerId: -1 })
    .lean();

  let next = 1;
  if (last?.distributerId) {
    const match = last.distributerId.match(/^DIST-(\d+)$/);
    if (match) {
      next = parseInt(match[1]) + 1;
    }
  }
  return `DIST-${next.toString().padStart(2, '0')}`;
}

// Register distributer
router.post('/register', auth, async (req, res) => {
  try {
    console.log('Registering distributer:', req.body);
    const { phoneNumber, fullname, email, age, address, credit, whatsappAvailable = true } = req.body;
    const addedBy = req.user.userId;

    if (!phoneNumber || !fullname || !email || !age || !address || !credit) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    let distributer = await Distributer.findOne({ phoneNumber });

    const otp = generateOTP();
    const distributerId = await generateDistributerId();

    if (distributer && distributer.otpVerified) {
      return res.status(409).json({ message: 'Phone number already registered & verified' });
    }

    if (distributer && !distributer.otpVerified) {
      distributer.otp = otp;
      distributer.distributerId = distributerId;
      distributer.email = email;
      await distributer.save();
    } else {
      distributer = new Distributer({
        phoneNumber,
        fullname,
        email,
        age,
        address,
        credit,
        otp,
        otpVerified: false,
        addedBy,
        distributerId,
        whatsappAvailable
      });
      await distributer.save();
    }

        const message = `${otp} is your One Time Verification–OTP– to confirm your phone no at Janathavani.`;
    await sendSMS(phoneNumber, message);

    res.status(200).json({ message: 'OTP sent successfully', distributerId });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Phone number or Email already exists' });
    }
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// Verify distributer OTP
router.post('/verify', async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;
    if (!phoneNumber || !otp) {
      return res.status(400).json({ message: 'Phone number and OTP are required' });
    }

    const distributer = await Distributer.findOne({ phoneNumber });
    if (!distributer) {
      return res.status(404).json({ message: 'Distributer not found' });
    }

    if (distributer.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    distributer.otpVerified = true;
    distributer.otp = null;
    await distributer.save();

   const token = jwt.sign(
  {
    distributerId: distributer._id,
    phoneNumber: distributer.phoneNumber,
    userType: 'distributer'
  },
  process.env.JWT_SECRET_KEY,
  { expiresIn: '30d' }
);


    res.status(200).json({ token });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// Resend OTP
router.post('/resend-otp', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    const distributer = await Distributer.findOne({ phoneNumber });
    if (!distributer) {
      return res.status(404).json({ message: 'Distributer not found' });
    }

    if (distributer.otpVerified) {
      return res.status(400).json({ message: 'Phone number already verified' });
    }

    const otp = generateOTP();
    distributer.otp = otp;
    await distributer.save();

    const message = `${otp} is your OTP to verify your number at Janathavani.`;
    await sendSMS(phoneNumber, message);

    res.status(200).json({ message: 'OTP resent successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// Login distributer
router.post('/login', async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    const distributer = await Distributer.findOne({ phoneNumber });

    if (!distributer) {
      return res.status(404).json({ message: 'Distributer not found. Please register first.' });
    }

    if (!distributer.otpVerified) {
      return res.status(403).json({ message: 'Phone number not verified. Please complete registration.' });
    }

    const otp = generateOTP();
    distributer.otp = otp;
    await distributer.save();

        const message = `${otp} is your One Time Verification–OTP– to confirm your phone no at Janathavani.`;
    await sendSMS(phoneNumber, message);

    res.status(200).json({ message: 'OTP sent successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// Get distributer profile
router.get('/profile', auth, async (req, res) => {
  try {
    const distributer = await Distributer.findById(req.user.userId).select('-otp -__v');
    if (!distributer) {
      return res.status(404).json({ message: 'Distributer not found' });
    }

    res.status(200).json(distributer);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});
// Get distributers added by a specific user
router.get('/by-addedby', auth, async (req, res) => {
  try {
    const addedBy = req.user.userId;

    const distributers = await Distributer.find({ addedBy }).populate('addedBy').select('-otp -__v');
    
    res.status(200).json(distributers);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});
// PATCH /fcm
// Update FCM token for the logged-in distributer
router.patch('/fcm', auth, async (req, res) => {
  try {
    const distributerId = req.user?.distributerId || req.user?.userId;
    const { fcmToken } = req.body;

    if (!distributerId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!fcmToken || typeof fcmToken !== 'string') {
      return res.status(400).json({ message: 'fcmToken is required' });
    }

    const distributer = await Distributer.findByIdAndUpdate(
      distributerId,
      { $set: { fcmToken } },
      { new: true }
    ).select('-otp -__v');

    if (!distributer) {
      return res.status(404).json({ message: 'Distributer not found' });
    }

    return res.status(200).json({
      ok: true,
      message: 'FCM token updated',
      fcmToken: distributer.fcmToken,
    });
  } catch (err) {
    console.error('PATCH /fcm error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
