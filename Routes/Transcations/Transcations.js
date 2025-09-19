// Routes/Transaction/Transaction.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Transaction = require('../../Models/Transcations/Transcations');
const auth = require('../../Middleware/auth');

// validate ObjectId
function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * GET /my-transactions
 * Distributer: all transactions of that distributer
 * User: all transactions added by that user
 */
router.get('/my-transactions', auth, async (req, res) => {
  try {
    let filters = {};
    let who = '';

    if (req.user?.distributerId) {
      filters.distributer = req.user.distributerId;
      who = 'distributer';
    } else if (req.user?.userId) {
      filters.transactionAddBy = req.user.userId;
      who = 'user';
    } else {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    const { page = 1, limit = 20, type } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const lim = Math.max(1, Math.min(200, parseInt(limit, 10)));

    if (type && ['credit', 'debit'].includes(String(type).toLowerCase())) {
      filters.type = String(type).toLowerCase();
    }

    const total = await Transaction.countDocuments(filters);
    const transactions = await Transaction.find(filters)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * lim)
      .limit(lim)
      .populate('distributer', 'fullname phone distributerId')
      .populate('transactionAddBy', 'fullname email');

    return res.status(200).json(

      transactions,
    );
  } catch (err) {
    console.error('GET /my-transactions error:', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/**
 * GET /my-summary
 * For distributer only: credit, debit, balance
 */
router.get('/my-summary', auth, async (req, res) => {
  try {
    const distributerId = req.user?.distributerId;
    if (!distributerId || !isValidId(distributerId)) {
      return res.status(400).json({ ok: false, message: 'Only distributers can view summary' });
    }

    const agg = await Transaction.aggregate([
      { $match: { distributer: mongoose.Types.ObjectId(distributerId) } },
      {
        $group: {
          _id: '$distributer',
          totalCredit: {
            $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] },
          },
          totalDebit: {
            $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] },
          },
          lastTransactionAt: { $max: '$createdAt' },
          count: { $sum: 1 },
        },
      },
    ]);

    const data = agg[0] || { totalCredit: 0, totalDebit: 0, lastTransactionAt: null, count: 0 };
    const balance = (data.totalCredit || 0) - (data.totalDebit || 0);

    return res.status(200).json({
      ok: true,
      distributerId,
      totalCredit: data.totalCredit || 0,
      totalDebit: data.totalDebit || 0,
      balance,
      lastTransactionAt: data.lastTransactionAt,
      count: data.count || 0,
    });
  } catch (err) {
    console.error('GET /my-summary error:', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

module.exports = router;
