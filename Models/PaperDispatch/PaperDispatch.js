const mongoose = require('mongoose');

const paperDispatchSchema = new mongoose.Schema(
    {
        distributer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Distributer',
            required: true
        },
        soldBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        qty: {
            type: Number,
            required: true
        },
        unit: {
            type: String,
            required: true,
            trim: true
        },
        totalPrice: {
            type: Number,
            required: true
        },
        mode: {
            type: String,
            enum: ['credit', 'cash'],
            required: true
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model('PaperDispatch', paperDispatchSchema);