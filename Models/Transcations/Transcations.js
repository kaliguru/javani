const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema(
    {
        distributer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Distributer',
            required: true,
        },
        transactionAddBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        type: {
            type: String,
            enum: ['credit', 'debit'],
            required: true,
        },
        amount: {
            type: Number,
            required: true,
        },
        paymentMode: {
            type: String,
            enum: ['cash', 'bank', 'upi', 'cheque', 'other','credit'],
            required: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Transaction', TransactionSchema);