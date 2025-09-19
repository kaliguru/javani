const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    orderId: {
        type: String,
        required: true,
        unique: true,
    },
    distributerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Distributer',
        required: true,
    },
    qty: {
        type: Number,
        required: true,
    },
    unit: {
        type: String,
        required: true,
    },
    note: {
        type: String,
    },
    total: {
        type: Number,
        required: true,
    },
    paid: {
        type: Boolean,
        default: false,
    },
    status: {
        type: String,
        default: 'pending',
        enum: ['pending', 'processing', 'completed', 'cancelled'],
    },
     paymentMode: {
        type: String,
        enum: ['cod', 'onlinepayment'],
        required: true,
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    
    cod: {
        type: Boolean,
        default: false,
    }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);