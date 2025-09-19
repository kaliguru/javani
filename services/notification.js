const admin = require('firebase-admin');
const firebaseConfig = require('../config/firebase-config'); // Adjust path as needed
const User = require('../Models/User/User');
const Distributer = require('../Models/Distributer/Distributer');
// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(firebaseConfig),
    });
}

/**
 * Sends a push notification using Firebase Cloud Messaging.
 * @param {Object} params
 * @param {string} params.title - Notification title
 * @param {string} params.body - Notification body
 * @param {string} params.userType - 'User' or 'Distributer'
 * @param {string} params.userId - ID of the user or distributer
 * @returns {Promise<Object>} - FCM response
 */
async function sendNotification({ title, body, userType, userId }) {
    if (!userType || !userId) {
        throw new Error('userType and userId are required');
    }

    let userDoc;
    if (userType === 'User') {
        userDoc = await User.findById(userId).lean();
    } else if (userType === 'Distributer') {
        userDoc = await Distributer.findById(userId).lean();
    } else {
        throw new Error('Invalid userType. Must be "User" or "Distributer"');
    }

    if (!userDoc || !userDoc.fcmToken) {
        throw new Error('FCM token not found for the specified user');
    }

    const message = {
        notification: {
            title,
            body,
        },
        token: userDoc.fcmToken,
    };

    try {
        const response = await admin.messaging().send(message);
        return { success: true, response };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = { sendNotification };