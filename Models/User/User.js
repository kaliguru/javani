const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: true,
        unique: true,
    },
    fullname: {
        type: String,
        required: true,
        trim: true,
    },
    age: {
        type: Number,
        required: true,
    },
    address: {
        type: String,
        required: true,
        trim: true,
    },
    otp: {
        type: String,
    },
    lastLogin: {
        type: Date,
        default: Date.now,
    },
    otpVerified: {
        type: Boolean,
        default: false,
    },
    fcmToken: {
        type: String,
    },
    employeeId: {
        type: String,
        required: true,
        unique: true,
    },
},{timestamps: true});

const User = mongoose.model('User', userSchema);
module.exports = User;