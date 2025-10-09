const express = require('express');
const router = express.Router();
const User = require('../../Models/User/User');
const auth = require('../../Middleware/auth');
const { sendEmail } = require('../../Utils/Mailer');
const { sendSMS} = require('../../Utils/Sms'); // Assuming you have a sendSMS utility
const jwt = require('jsonwebtoken');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const adminAuth = require('../../Middleware/adminAuth')
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}


// Helper to generate next Employee ID
async function generateEmployeeId() {
    const lastUser = await User.findOne({ employeeId: { $regex: /^JVANI-\d+$/ } })
        .sort({ employeeId: -1 })
        .lean();

    let nextNumber = 1;
    if (lastUser && lastUser.employeeId) {
        const match = lastUser.employeeId.match(/^JVANI-(\d+)$/);
        if (match) {
            nextNumber = parseInt(match[1], 10) + 1;
        }
    }
    return `JVANI-${nextNumber.toString().padStart(2, '0')}`;
}


// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { phoneNumber, fullname, age,      } = req.body;

        // Basic validation
        if (!phoneNumber || !fullname || !age || !address) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        let user = await User.findOne({ phoneNumber });
        const otp = generateOTP();

        if (user && user.otpVerified) {
            return res.status(409).json({ message: 'Phone number already registered & verified' });
        }

        // Always generate new employeeId
        const employeeId = await generateEmployeeId();

        if (user && !user.otpVerified) {
            // Update OTP and employeeId
            user.otp = otp;
            user.employeeId = employeeId;
            await user.save();
        } else {
            user = new User({
                phoneNumber,
                fullname,
                age,
                address,
                employeeId,
                otp,
                otpVerified: false,
            });
            await user.save();
        }

        // Send OTP SMS
        const message = `${otp} is your One Time Verification–OTP– to confirm your phone no at Janathavani.`;
        console.log(otp);
        console.log("Sending SMS to:", phoneNumber);
        await sendSMS(phoneNumber, message);

        return res.status(200).json({ message: 'OTP sent successfully', employeeId });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: 'Phone number or Employee ID already exists' });
        }
        return res.status(500).json({ message: 'Server Error', error: error.message });
    }
});



// POST /api/auth/verify
router.post('/verify', async (req, res) => {
    try {
        console.log("Verify endpoint hit");
        console.log("Request body:", req.body);
        const { phoneNumber, otp } = req.body;
        if (!phoneNumber || !otp) {
            return res.status(400).json({ message: 'Phone number and OTP are required' });
        }

        const user = await User.findOne({ phoneNumber });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.otp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        user.otpVerified = true;
        user.otp = null; // Optional: clear OTP after verification
        await user.save();

        // Generate JWT token
        const token = jwt.sign(
            { userId: user._id, phoneNumber: user.phoneNumber },
            process.env.JWT_SECRET_KEY,
            { expiresIn: '30d' }
        );

        return res.status(200).json({
          
            token,
          
        });
    } catch (error) {
        return res.status(500).json({ message: 'Server Error', error: error.message });
    }
});
// POST /api/auth/resend-otp
router.post('/resend-otp', async (req, res) => {
    try {
        const { phoneNumber } = req.body;

        if (!phoneNumber) {
            return res.status(400).json({ message: 'Phone number is required' });
        }

        const user = await User.findOne({ phoneNumber });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (user.otpVerified) {
            return res.status(400).json({ message: 'Phone number already verified' });
        }

        // Generate and save new OTP
        const otp = generateOTP();
        user.otp = otp;
        await user.save();

        // Send OTP SMS
        const message = `${otp} is your One Time Verification–OTP– to confirm your phone no at Janathavani.`;
        await sendSMS(phoneNumber, message);

        return res.status(200).json({ message: 'OTP resent successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Server Error', error: error.message });
    }
});
// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { phoneNumber } = req.body;

        if (!phoneNumber) {
            return res.status(400).json({ message: 'Phone number is required' });
        }

        // Find user by phone number
        const user = await User.findOne({ phoneNumber });

        if (!user) {
            return res.status(404).json({ message: 'User not found. Please register first.' });
        }

        if (!user.otpVerified) {
            return res.status(403).json({ message: 'Phone number not verified. Please complete registration.' });
        }

        // Generate new OTP
        const otp = generateOTP();
        user.otp = otp;
        await user.save();
            console.log("OTP generated:", otp);
        // Send OTP SMS
        const message = `${otp} is your One Time Verification–OTP– to confirm your phone no at Janathavani.`;
        await sendSMS(phoneNumber, message);

        return res.status(200).json({ message: 'OTP sent successfully. Please verify to complete login.' });
    } catch (error) {
        return res.status(500).json({ message: 'Server Error', error: error.message });
    }
});

// GET /api/auth/profile
router.get('/profile', auth, async (req, res) => {
    try {
console.log('userId for profile:', req.user.userId); // Should log "6839f77a515a8e15233c1ca2"
        // req.user should be set by your auth middleware (e.g., req.user = { userId: ... })
        const user = await User.findById(req.user.userId).select('-otp -__v'); // exclude OTP & __v
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.status(200).json({
            
                phoneNumber: user.phoneNumber,
                fullname: user.fullname,
                age: user.age,
                address: user.address,
                employeeId: user.employeeId,
                otpVerified: user.otpVerified,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            
        });
    } catch (error) {
        return res.status(500).json({ message: 'Server Error', error: error.message });
    }
});
// PATCH /fcm
// Update FCM token for the logged-in distributer
router.patch('/fcm', auth, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.userId;
    const { fcmToken } = req.body;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!fcmToken || typeof fcmToken !== 'string') {
      return res.status(400).json({ message: 'fcmToken is required' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { fcmToken } },
      { new: true }
    ).select('-otp -__v');

    if (!user) {
      return res.status(404).json({ message: 'Distributer not found' });
    }

    return res.status(200).json({
      ok: true,
      message: 'FCM token updated',
      fcmToken: user.fcmToken,
    });
  } catch (err) {
    console.error('PATCH /fcm error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});
router.post('/logout', auth, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const updated = await User.findByIdAndUpdate(
      userId,
      { $unset: { fcmToken: '' } }, // removes the field; or use { $set: { fcmToken: null } } if you prefer
      { new: true }
    ).select('-otp -__v');

    if (!updated) return res.status(404).json({ message: 'User not found' });

    return res.status(200).json({ ok: true, message: 'Logged out — FCM token removed' });
  } catch (err) {
    console.error('POST /logout error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET all users
// GET /api/v1/user/
router.get('/', adminAuth, async (req, res) => {
    try {
        const users = await User.find().select('-otp -__v');
        return res.status(200).json({ ok: true, users });
    } catch (error) {
        return res.status(500).json({ message: 'Server Error', error: error.message });
    }
});

// PUT update a user by id
// PUT /api/v1/user/:id
router.put('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };

        // Prevent updating protected fields
        delete updates.otp;
        delete updates.employeeId;
        delete updates.otpVerified;
        delete updates.createdAt;
        delete updates.__v;

        const updatedUser = await User.findByIdAndUpdate(id, { $set: updates }, { new: true }).select('-otp -__v');
        if (!updatedUser) return res.status(404).json({ message: 'User not found' });

        return res.status(200).json({ ok: true, user: updatedUser });
    } catch (error) {
        return res.status(500).json({ message: 'Server Error', error: error.message });
    }
});

// DELETE a user by id
// DELETE /api/v1/user/:id
router.delete('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await User.findByIdAndDelete(id).select('-otp -__v');
        if (!deleted) return res.status(404).json({ message: 'User not found' });

        return res.status(200).json({ ok: true, message: 'User deleted', user: deleted });
    } catch (error) {
        return res.status(500).json({ message: 'Server Error', error: error.message });
    }
});
module.exports = router;

