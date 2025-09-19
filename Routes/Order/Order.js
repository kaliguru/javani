const express = require('express');
const router = express.Router();
const Order = require('../../Models/Orders/Order');
const Distributer = require('../../Models/Distributer/Distributer');
const auth = require('../../Middleware/auth'); 
const Transaction = require('../../Models/Transcations/Transcations');
const mongoose = require('mongoose');
const { sendNotification } = require('../../services/notification');

async function generateOrderId() {

  const lastOrder = await Order.findOne({ orderId: { $regex: /^JVANI-\d+$/ } })
    .sort({ orderId: -1 })
    .lean();

  let next = 1;
  if (lastOrder?.orderId) {
    const match = lastOrder.orderId.match(/^JVANI-(\d+)$/);
    if (match) {
      next = parseInt(match[1]) + 1;
    }
  }

  return `JVANI-${String(next).padStart(2, '0')}`;
}
function generateTransactionId(paymentMode) {
  const randomPart = Math.floor(1000 + Math.random() * 9000); // 4 digit random number
  const ts = Date.now().toString().slice(-4); // last 4 digits of timestamp
  const code = `${randomPart}${ts}`;

  switch (String(paymentMode).toLowerCase()) {
    case 'upi':
      return `UPI${code}`;
    case 'cheque':
      return `CHQ${code}`;
    case 'bank':
      return `BNK${code}`;
    case 'cash':
      return `CSH${code}`;
    default:
      return `TXN${code}`;
  }
}

/**
 * Helper: allowed status values (must match schema enum)
 */
const ALLOWED_STATUS = ['pending', 'processing', 'completed', 'cancelled'];

// 📦 Create new order
router.post('/', auth, async (req, res) => {
  try {
    console.log('Creating order:', req.body);

    if (!req.user || !req.user.distributerId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { qty, unit, note, total, paymentMode } = req.body;
    if (!qty || !unit || !total || !paymentMode) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // 1️⃣ Fetch distributer to get addedBy
    const distributer = await Distributer.findById(req.user.distributerId);
    if (!distributer) {
      return res.status(404).json({ message: 'Distributer not found' });
    }

    const assignedUserId = distributer.addedBy; // assign to who added the distributer

    // 2️⃣ Generate orderId
    const orderId = await generateOrderId();

    // 3️⃣ Create order
    const newOrder = new Order({
      orderId,
      distributerId: req.user.distributerId,
      qty,
      unit,
      note,
      total,
      paymentMode,
      cod: String(paymentMode).toLowerCase() === 'cod',
      assignedTo: assignedUserId,
      status: 'processing',
    });

    const savedOrder = await newOrder.save();

    // Notify distributer (non-blocking)
   // inside your router.post('/', ...) after savedOrder
(async () => {
  try {
    console.log('Attempting notification to distributer:', String(savedOrder.distributerId));
    const result = await require('../../services/notification').sendNotification({
      title: 'New Order Placed',
      body: `Order ${orderId} created for you. Total ₹${total}.`,
      userType: 'Distributer',
      userId: String(savedOrder.distributerId),
      timeoutMs: 4000, // fail fast
    });
    if (!result.ok) {
      console.warn('Notification not sent:', result.reason);
    } else {
      console.log('Notification sent:', result.response);
    }
  } catch (notifErr) {
    console.error('Notification error (create order):', notifErr.message || notifErr);
  }
})();


    res.status(201).json({
      message: 'Order placed and assigned successfully',
      order: savedOrder,
    });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
/**
 * GET /by-distributer/:distributerId
 * Fetch orders for a specific distributer (admin/owner can call).
 * If you want current distributer to fetch their own orders, pass req.user.distributerId instead.
 */
router.get('/by-distributer/:distributerId', auth, async (req, res) => {
  try {
    const { distributerId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(distributerId)) {
      return res.status(400).json({ message: 'Invalid distributerId' });
    }

    const orders = await Order.find({ distributerId })
      .populate('distributer', 'fullname phone distributerId')
      .populate('assignedTo', 'name email') // adjust fields to your User model
      .sort({ createdAt: -1 });

    res.status(200).json({ ok: true, count: orders.length, orders });
  } catch (err) {
    console.error('GET /by-distributer error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /my-distributer-orders
 * If the caller is a distributer, get orders for their distributerId (from token).
 */
router.get('/my-distributer-orders', auth, async (req, res) => {
  try {
    const distributerId = req.user?.distributerId;
    if (!distributerId) return res.status(401).json({ message: 'Unauthorized' });

    const orders = await Order.find({ distributerId })
      .populate('assignedTo', 'fullname phoneNumber')
      .sort({ createdAt: -1 });

    res.status(200).json( orders );
  } catch (err) {
    console.error('GET /my-distributer-orders error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /assigned-to-me
 * Get orders assigned to the logged-in user
 */
router.get('/assigned-to-me', auth, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const orders = await Order.find({ assignedTo: userId })
      .populate('distributerId', 'fullname phone distributerId') // correct path
      .sort({ createdAt: -1 });

    res.status(200).json( orders );
  } catch (err) {
    console.error('GET /assigned-to-me error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /:id
 * Get single order by id (populated)
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid order id' });
    }

    const order = await Order.findById(id)
      .populate('distributer', 'fullname phone distributerId')
      .populate('assignedTo', 'name email');

    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.status(200).json({ ok: true, order });
  } catch (err) {
    console.error('GET /:id error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PATCH /:id/status
 * Update order status
 * Body: { status: 'processing' }
 */
// PATCH /:id/status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !ALLOWED_STATUS.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Allowed: ${ALLOWED_STATUS.join(', ')}` });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid order id' });
    }

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    order.status = status;
    await order.save();

    const populated = await Order.findById(id)
      .populate('distributerId', 'fullname phone distributerId') // <-- use distributerId
      .populate('assignedTo', 'fullname email');

    res.status(200).json({ ok: true, message: 'Status updated', order: populated });
  } catch (err) {
    console.error('PATCH /:id/status error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PATCH /:id/payment
 * Update payment fields (mark paid, change paymentMode, attach transaction id)
 * Body example: { paid: true, paymentMode: "onlinepayment", transactionId: "TXN12345" }
 */
// PATCH /:id/payment
router.patch('/:id/payment', auth, async (req, res) => {
  const session = await Order.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    let { paid, paymentMode, transactionId, transactionPaymentMode } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid order id' });
    }

    if (paymentMode && !['cod', 'onlinepayment', 'cash', 'upi', 'bank', 'cheque', 'other'].includes(String(paymentMode).toLowerCase())) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid paymentMode' });
    }

    const order = await Order.findById(id).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Order not found' });
    }

    // Prepare update object
    const update = {};
    if (typeof paid === 'boolean') update.paid = paid;
    if (paymentMode) update.paymentMode = paymentMode;

    // generate random transactionId if not provided
    if (paid && !transactionId) {
      transactionId = generateTransactionId(transactionPaymentMode || paymentMode);
    }
    if (transactionId) update.transactionId = transactionId;
    if (paid) update.paidAt = new Date();

    const shouldCreateCreditTxn = (paid === true) && !order.paid;

    const updatedOrder = await Order.findByIdAndUpdate(id, { $set: update }, { new: true, session });

    let createdTransaction = null;
    if (shouldCreateCreditTxn) {
      let pm = (transactionPaymentMode || paymentMode || 'other');
      let txnPaymentMode = String(pm).toLowerCase();

      if (txnPaymentMode === 'cod') txnPaymentMode = 'cash';
      else if (txnPaymentMode === 'onlinepayment') txnPaymentMode = 'other';

      const transactionDoc = new Transaction({
        distributer: updatedOrder.distributerId,
        transactionAddBy: req.user?.userId || updatedOrder.assignedTo || null,
        type: 'credit',
        amount: updatedOrder.total,
        paymentMode: txnPaymentMode,
      });

      createdTransaction = await transactionDoc.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    const finalOrder = await Order.findById(id)
      .populate('distributerId', 'fullname phone distributerId')
      .populate('assignedTo', 'fullname email');

    return res.status(200).json({
      ok: true,
      message: 'Payment updated',
      order: finalOrder,
      transaction: createdTransaction,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('PATCH /:id/payment error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});


/**
 * PATCH /:id/reassign
 * Reassign order to another user (admin only ideally)
 * Body: { assignedTo: "<userId>" }
 */
router.patch('/:id/reassign', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedTo } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(assignedTo)) {
      return res.status(400).json({ message: 'Invalid id(s)' });
    }

    // optionally validate user exists:
    // const userExists = await User.exists({ _id: assignedTo, active: true });
    // if (!userExists) return res.status(404).json({ message: 'User to assign not found' });

    const order = await Order.findByIdAndUpdate(id, { $set: { assignedTo } }, { new: true })
      .populate('distributer', 'fullname phone distributerId')
      .populate('assignedTo', 'name email');

    if (!order) return res.status(404).json({ message: 'Order not found' });

    res.status(200).json({ ok: true, message: 'Order reassigned', order });
  } catch (err) {
    console.error('PATCH /:id/reassign error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
