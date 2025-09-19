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

    const doc = userType === 'User'
      ? await User.findById(userId).lean()
      : await Distributer.findById(userId).lean();

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
