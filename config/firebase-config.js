// config/firebase-config.js
const admin = require('firebase-admin');
const path = require('path');

// Load service account JSON
const serviceAccount = require(path.join(__dirname, 'service-account.json'));

// Initialize Admin SDK (idempotent safe)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // use the correct storage bucket host (not the long web-host)
    storageBucket: 'jvani-4fa7c.appspot.com'
  });
}

module.exports = admin;
