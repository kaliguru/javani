const router = require('express').Router();
const PaperDispatch = require('../../Models/PaperDispatch/PaperDispatch');
const Transaction = require('../../Models/Transcations/Transcations');
const auth = require('../../Middleware/auth');

router.post('/dispatch', auth, async (req, res) => {
  try {
    console.log(req.body);
    const { distributerId, qty, unit, totalPrice, mode } = req.body;
        console.log(req.header);
    if (!distributerId || !qty || !unit || !totalPrice || !mode) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // 1️⃣ Create Paper Dispatch
    const dispatch = new PaperDispatch({
      distributer: distributerId,
      soldBy: req.user.userId, // from auth middleware
      qty,
      unit,
      totalPrice,
      mode,
    });

    const savedDispatch = await dispatch.save();

    // 2️⃣ Create corresponding Transaction (debit)
    const transaction = new Transaction({
      distributer: distributerId,
      transactionAddBy: req.user.userId,
      type: 'debit',
      amount: totalPrice,
      paymentMode: mode, // must be in enum ['cash', 'bank', 'upi', 'cheque', 'other']
    });

    const savedTransaction = await transaction.save();

    res.status(201).json({
      message: 'Paper dispatched and transaction created successfully',
      dispatch: savedDispatch,
      transaction: savedTransaction,
    });
  } catch (err) {
    console.error('Error creating dispatch and transaction:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
// 📦 GET: Fetch all dispatches by logged-in user (soldBy)
router.get('/dispatches', auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const dispatches = await PaperDispatch.find({ soldBy: userId })
      .populate('distributer', 'fullname phone') // Optional: fetch distributer info
      .sort({ createdAt: -1 });

    res.status(200).json(dispatches);
  } catch (err) {
    console.error('Error fetching dispatches:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 📦 GET: Fetch only today's dispatches by logged-in user (soldBy)
router.get('/dispatches/today', auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    // get today's start and end
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const dispatches = await PaperDispatch.find({
      soldBy: userId,
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    })
      .populate('distributer', 'fullname phone')
      .sort({ createdAt: -1 });

    res.status(200).json(dispatches);
  } catch (err) {
    console.error('Error fetching today\'s dispatches:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

