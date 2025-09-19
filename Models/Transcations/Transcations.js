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
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',      // <-- reference to Order model
      required: false,   // optional (set true if every txn must be linked)
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
      enum: ['cash', 'bank', 'upi', 'cheque', 'other', 'credit'],
      required: true,
    },
  },
  { timestamps: true }
);

// optional index to speed lookups by distributer and order
TransactionSchema.index({ distributer: 1, orderId: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
