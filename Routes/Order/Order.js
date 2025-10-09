const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Order = require('../../Models/Orders/Order');
const Distributer = require('../../Models/Distributer/Distributer');
const User = require('../../Models/User/User'); // used for optional notifications to assigned user
const Transaction = require('../../Models/Transcations/Transcations');
const auth = require('../../Middleware/auth');
const adminAuth = require('../../Middleware/adminAuth');

const { sendNotification } = require('../../services/notification');

// Helper to extract a usable id string from various possible values
function getId(val) {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    if (val._id) return String(val._id);
    if (val.id) return String(val.id);
    try { return String(val); } catch (e) { return null; }
  }
  return String(val);
}

async function generateOrderId() {
  const lastOrder = await Order.findOne({ orderId: { $regex: /^JVANI-\d+$/ } })
    .sort({ orderId: -1 })
    .lean();

  let next = 1;
  if (lastOrder?.orderId) {
    const match = lastOrder.orderId.match(/^JVANI-(\d+)$/);
    if (match) next = parseInt(match[1]) + 1;
  }

  return `JVANI-${String(next).padStart(2, '0')}`;
}

function generateTransactionId(paymentMode) {
  const randomPart = Math.floor(1000 + Math.random() * 9000); // 4 digit random number
  const ts = Date.now().toString().slice(-4); // last 4 digits of timestamp
  const code = `${randomPart}${ts}`;

  switch (String(paymentMode).toLowerCase()) {
    case 'upi': return `UPI${code}`;
    case 'cheque': return `CHQ${code}`;
    case 'bank': return `BNK${code}`;
    case 'cash': return `CSH${code}`;
    default: return `TXN${code}`;
  }
}

const ALLOWED_STATUS = ['pending', 'processing', 'completed', 'cancelled'];

/* ============================
   CREATE ORDER
   ============================ */
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

    // Fetch distributer
    const distributer = await Distributer.findById(req.user.distributerId);
    if (!distributer) return res.status(404).json({ message: 'Distributer not found' });

    const assignedUserId = distributer.addedBy || null;

    // Generate orderId
    const orderId = await generateOrderId();

    // Create order
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
    (async () => {
      try {
        const result = await sendNotification({
          title: 'New Order Placed',
          body: `Order ${orderId} created for you. Total ₹${total}.`,
          userType: 'Distributer',
          userId: String(savedOrder.distributerId),
          timeoutMs: 4000
        });
        if (!result.ok) console.warn('Notification not sent (distributer, create):', result.reason);
        else console.log('Notification sent (distributer, create):', result.response);
      } catch (e) {
        console.error('Notification error (distributer, create):', e.message || e);
      }
    })();

    // Notify assigned user (if present) that they have a new order
    if (assignedUserId) {
      (async () => {
        try {
          const result = await sendNotification({
            title: 'New Order Assigned',
            body: `You have been assigned order ${orderId} (₹${total}).`,
            userType: 'User',
            userId: String(assignedUserId),
            timeoutMs: 4000
          });
          if (!result.ok) console.warn('Notification not sent (user, create):', result.reason);
          else console.log('Notification sent (user, create):', result.response);
        } catch (e) {
          console.error('Notification error (user, create):', e.message || e);
        }
      })();
    }

    return res.status(201).json({ message: 'Order placed and assigned successfully', order: savedOrder });
  } catch (err) {
    console.error('Error creating order:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/* ============================
   CREATE ORDER (assignedTo provided in body or fallback to distributer.addedBy)
   POST /create-by
   ============================ */
router.post('/create-by', adminAuth, async (req, res) => {
  try {
    console.log('Creating order via create-by:', req.body);

    // if (!req.user || !req.user.distributerId) {
    //   return res.status(401).json({ message: 'Unauthorized' });
    // }

    const { qty, unit, note, total, paymentMode, assignedTo } = req.body;
    if (!qty || !unit || !total || !paymentMode) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Fetch distributer
    const distributer = await Distributer.findById(req.user.distributerId);
    if (!distributer) return res.status(404).json({ message: 'Distributer not found' });

    // Determine assignedTo: body value if provided and valid ObjectId, otherwise distributer.addedBy
    let finalAssignedTo = distributer.addedBy || null;
    if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) {
      finalAssignedTo = assignedTo;
    }

    // Generate orderId
    const orderId = await generateOrderId();

    // Create order
    const newOrder = new Order({
      orderId,
      distributerId: req.user.distributerId,
      qty,
      unit,
      note,
      total,
      paymentMode,
      cod: String(paymentMode).toLowerCase() === 'cod',
      assignedTo: finalAssignedTo,
      status: 'processing',
    });

    const savedOrder = await newOrder.save();

    // Notify distributer (non-blocking)
    (async () => {
      try {
        const result = await sendNotification({
          title: 'New Order Placed',
          body: `Order ${orderId} created for you. Total ₹${total}.`,
          userType: 'Distributer',
          userId: String(savedOrder.distributerId),
          timeoutMs: 4000
        });
        if (!result.ok) console.warn('Notification not sent (distributer, create-by):', result.reason);
      } catch (e) {
        console.error('Notification error (distributer, create-by):', e.message || e);
      }
    })();

    // Notify assigned user (if present)
    if (finalAssignedTo) {
      (async () => {
        try {
          const result = await sendNotification({
            title: 'New Order Assigned',
            body: `You have been assigned order ${orderId} (₹${total}).`,
            userType: 'User',
            userId: String(finalAssignedTo),
            timeoutMs: 4000
          });
          if (!result.ok) console.warn('Notification not sent (user, create-by):', result.reason);
        } catch (e) {
          console.error('Notification error (user, create-by):', e.message || e);
        }
      })();
    }

    return res.status(201).json({ message: 'Order placed and assigned successfully', order: savedOrder });
  } catch (err) {
    console.error('Error creating order (create-by):', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/* ============================
   GET by distributer
   ============================ */
router.get('/by-distributer/:distributerId', auth, async (req, res) => {
  try {
    const { distributerId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(distributerId)) return res.status(400).json({ message: 'Invalid distributerId' });

    const orders = await Order.find({ distributerId })
      .populate('distributerId', 'fullname phone distributerId')
      .populate('assignedTo', 'fullname email')
      .sort({ createdAt: -1 });

    return res.status(200).json({ ok: true, count: orders.length, orders });
  } catch (err) {
    console.error('GET /by-distributer error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/* ============================
   GET all orders (admin)
   Admin-only route — populates assignedTo
   ============================ */
router.get('/', adminAuth, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('assignedTo', 'fullname email phoneNumber')
      .populate('distributerId', 'fullname phone distributerId')
      .sort({ createdAt: -1 });

    return res.status(200).json({ ok: true, count: orders.length, orders });
  } catch (err) {
    console.error('GET / (admin) error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/* ============================
   GET my distributer orders
   ============================ */
router.get('/my-distributer-orders', auth, async (req, res) => {
  try {
    const distributerId = req.user?.distributerId;
    if (!distributerId) return res.status(401).json({ message: 'Unauthorized' });

    const orders = await Order.find({ distributerId })
      .populate('assignedTo', 'fullname phoneNumber')
      .sort({ createdAt: -1 });

    return res.status(200).json(orders);
  } catch (err) {
    console.error('GET /my-distributer-orders error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/* ============================
   GET assigned-to-me
   ============================ */
router.get('/assigned-to-me', auth, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const orders = await Order.find({ assignedTo: userId })
      .populate('distributerId', 'fullname phone distributerId')
      .sort({ createdAt: -1 });

    return res.status(200).json(orders);
  } catch (err) {
    console.error('GET /assigned-to-me error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/* ============================
   GET single order
   ============================ */
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid order id' });

    const order = await Order.findById(id)
      .populate('distributerId', 'fullname phone distributerId')
      .populate('assignedTo', 'fullname email');

    if (!order) return res.status(404).json({ message: 'Order not found' });
    return res.status(200).json({ ok: true, order });
  } catch (err) {
    console.error('GET /:id error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/* ============================
   PATCH status
   ============================ */
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !ALLOWED_STATUS.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Allowed: ${ALLOWED_STATUS.join(', ')}` });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid order id' });

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    order.status = status;
    await order.save();

    const populated = await Order.findById(id)
      .populate('distributerId', 'fullname phone distributerId')
      .populate('assignedTo', 'fullname email');

    // Notify distributer about status change (non-blocking)
    (async () => {
      try {
          const result = await sendNotification({
          title: 'Order Status Updated',
          body: `Order ${populated.orderId || populated.orderId} is now "${status}".`,
          userType: 'Distributer',
            userId: getId(populated.distributerId),
          timeoutMs: 4000
        });
        if (!result.ok) console.warn('Notification not sent (distributer, status):', result.reason);
      } catch (e) {
        console.error('Notification error (distributer, status):', e.message || e);
      }
    })();

    // Notify assigned user about status change (non-blocking)
    if (populated.assignedTo) {
      (async () => {
        try {
          const result = await sendNotification({
            title: 'Order Status Updated',
            body: `Order ${populated.orderId || populated.orderId} status changed to "${status}".`,
            userType: 'User',
            userId: getId(populated.assignedTo),
            timeoutMs: 4000
          });
          if (!result.ok) console.warn('Notification not sent (user, status):', result.reason);
        } catch (e) {
          console.error('Notification error (user, status):', e.message || e);
        }
      })();
    }

    return res.status(200).json({ ok: true, message: 'Status updated', order: populated });
  } catch (err) {
    console.error('PATCH /:id/status error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/* ============================
   PATCH payment
   ============================ */
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
  orderId: updatedOrder._id,          
  type: 'credit',
  amount: updatedOrder.total,
  paymentMode: txnPaymentMode,
});

/* ============================
   PATCH payment (with transactionAddBy in body)
   Similar to /:id/payment but allows the caller to supply `transactionAddBy` in request body.
   Body params:
     - paid: boolean (required to mark payment)
     - paymentMode: string (optional)
     - transactionId: string (optional)
     - transactionPaymentMode: string (optional)
     - transactionAddBy: string (optional) -- will be used as transaction.transactionAddBy
   ============================ */
router.patch('/:id/payment-by', auth, async (req, res) => {
  const session = await Order.startSession();
  session.startTransaction();

  try {
    console.log('PATCH /:id/payment-by called with body:', req.body);
    const { id } = req.params;
    let { paid, paymentMode, transactionId, transactionPaymentMode, transactionAddBy } = req.body;

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

      // Use transactionAddBy from body if provided, otherwise fall back to user or assignedTo
      const txnAddBy = transactionAddBy || req.user?.userId || updatedOrder.assignedTo || null;

      const transactionDoc = new Transaction({
        distributer: updatedOrder.distributerId,
        transactionAddBy: txnAddBy,
        orderId: updatedOrder._id,
        type: 'credit',
        amount: updatedOrder.total,
        paymentMode: txnPaymentMode,
      });

      createdTransaction = await transactionDoc.save({ session });

      // commit before reload
      await session.commitTransaction();
      session.endSession();

      (async () => {
        try {
          const result = await sendNotification({
            title: 'Payment Received',
            body: `Payment of ₹${updatedOrder.total} received for ${updatedOrder.orderId}.`,
            userType: 'Distributer',
            userId: getId(updatedOrder.distributerId),
            timeoutMs: 4000
          });
          if (!result.ok) console.warn('Notification not sent (distributer, payment):', result.reason);
        } catch (e) {
          console.error('Notification error (distributer, payment):', e.message || e);
        }
      })();

      // Notify assigned user about payment (non-blocking)
      if (updatedOrder.assignedTo) {
        (async () => {
          try {
            const result = await sendNotification({
              title: 'Payment Received',
              body: `Payment of ₹${updatedOrder.total} received for ${updatedOrder.orderId}.`,
              userType: 'User',
              userId: getId(updatedOrder.assignedTo),
              timeoutMs: 4000
            });
            if (!result.ok) console.warn('Notification not sent (user, payment):', result.reason);
          } catch (e) {
            console.error('Notification error (user, payment):', e.message || e);
          }
        })();
      }
    }

    // If we haven't committed earlier, commit now
    try {
      await session.commitTransaction();
    } catch (e) {
      // ignore if already committed
    }
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
    console.error('PATCH /:id/payment-by error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

createdTransaction = await transactionDoc.save({ session });

// commit before reload
await session.commitTransaction();
session.endSession();

      (async () => {
        try {
          const result = await sendNotification({
            title: 'Payment Received',
            body: `Payment of ₹${updatedOrder.total} received for ${updatedOrder.orderId}.`,
            userType: 'Distributer',
            userId: getId(updatedOrder.distributerId),
            timeoutMs: 4000
          });
          if (!result.ok) console.warn('Notification not sent (distributer, payment):', result.reason);
        } catch (e) {
          console.error('Notification error (distributer, payment):', e.message || e);
        }
      })();

      // Notify assigned user about payment (non-blocking)
      if (updatedOrder.assignedTo) {
        (async () => {
          try {
            const result = await sendNotification({
              title: 'Payment Received',
              body: `Payment of ₹${updatedOrder.total} received for ${updatedOrder.orderId}.`,
              userType: 'User',
              userId: getId(updatedOrder.assignedTo),
              timeoutMs: 4000
            });
            if (!result.ok) console.warn('Notification not sent (user, payment):', result.reason);
          } catch (e) {
            console.error('Notification error (user, payment):', e.message || e);
          }
        })();
      }
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

/* ============================
   PATCH reassign
   ============================ */
router.patch('/:id/reassign', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedTo } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(assignedTo)) {
      return res.status(400).json({ message: 'Invalid id(s)' });
    }

    const order = await Order.findByIdAndUpdate(id, { $set: { assignedTo } }, { new: true })
      .populate('distributerId', 'fullname phone distributerId')
      .populate('assignedTo', 'fullname email');

    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Notify new assignee
    (async () => {
      try {
        const result = await sendNotification({
          title: 'Order Reassigned to You',
          body: `Order ${order.orderId} has been assigned to you.`,
          userType: 'User',
          userId: getId(assignedTo),
          timeoutMs: 4000
        });
        if (!result.ok) console.warn('Notification not sent (user, reassign):', result.reason);
      } catch (e) {
        console.error('Notification error (user, reassign):', e.message || e);
      }
    })();

    return res.status(200).json({ ok: true, message: 'Order reassigned', order });
  } catch (err) {
    console.error('PATCH /:id/reassign error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
