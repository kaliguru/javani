// services/notification.js
const admin = require('firebase-admin');
const User = require('../Models/User/User');
const Distributer = require('../Models/Distributer/Distributer');

// ensure admin is initialized in your app bootstrap, not here repeatedly.

async function rawSendNotification(message) {
  // message should be { notification: {title, body}, token }
  return admin.messaging().send(message);
}

/**
 * Promise wrapper that rejects after `ms` milliseconds.
 */
function withTimeout(promise, ms = 5000) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('FCM timeout')), ms))
  ]);
}

/**
 * Safe send: looks up token and sends; returns { ok, reason } and never throws.
 */
async function sendNotification({ title, body, userType, userId, timeoutMs = 5000 }) {
  try {
    if (!userType || !userId) return { ok: false, reason: 'missing userType/userId' };

    // Normalize userId: it may be an ObjectId, a Mongoose document, or a string.
    let idToUse = userId;
    if (typeof userId === 'object' && userId !== null) {
      // Mongoose document or plain object: prefer _id
      if (userId._id) idToUse = userId._id;
      else if (userId.id) idToUse = userId.id;
    }

    // If it's an ObjectId instance, convert to hex string
    if (typeof idToUse === 'object' && idToUse !== null && typeof idToUse.toHexString === 'function') {
      idToUse = idToUse.toHexString();
    }

    // If it's a string containing a serialized object (e.g. "{ _id: new ObjectId('...') }") extract 24-char hex
    if (typeof idToUse === 'string') {
      const m = idToUse.match(/[0-9a-fA-F]{24}/);
      if (m) idToUse = m[0];
    }

    const doc = userType === 'User'
      ? await User.findById(idToUse).lean()
      : await Distributer.findById(idToUse).lean();

    if (!doc) return { ok: false, reason: 'user not found' };
    if (!doc.fcmToken) return { ok: false, reason: 'no fcmToken' };

    const message = {
      notification: { title, body },
      token: doc.fcmToken,
    };

    const resp = await withTimeout(rawSendNotification(message), timeoutMs);
    return { ok: true, response: resp };
  } catch (err) {
    return { ok: false, reason: err.message || err };
  }
}

module.exports = { sendNotification };
