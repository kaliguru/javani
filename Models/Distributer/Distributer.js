const mongoose = require('mongoose');

const distributerSchema = new mongoose.Schema({
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
    email: {
        type: String,
        required: true,
        unique: true,
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
        required: false,
    },
    otpVerified: {
        type: Boolean,
        default: false,
    },
    credit: {
        type: Number,
        required: true,
    },
    addedBy:{
        type:mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    distributerId: {
        type: String,
        required: true,
        unique: true,
    },
    fcmToken: {
        type: String,
    },
    balance: {
        type: Number,
        default: 0,
    },
    whatsappAvailable: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });
const Distributer = mongoose.model('Distributer', distributerSchema);
module.exports = Distributer;