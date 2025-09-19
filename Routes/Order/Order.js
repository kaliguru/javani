const express = require('express');
const router = express.Router();
const Order = require('../../Models/Orders/Order');
const Distributer = require('../../Models/Distributer/Distributer');
const auth = require('../../Middleware/auth'); 

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

    const assignedUserId = distributer.addedBy; // 👈 assign order to the user who added distributer

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
      status: 'processing', // optional
    });

    const savedOrder = await newOrder.save();

    res.status(201).json({
      message: 'Order placed and assigned successfully',
      order: savedOrder,
    });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
