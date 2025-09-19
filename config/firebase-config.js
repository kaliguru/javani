const admin = require("firebase-admin");
const serviceAccount = require("./service-account.json");

const firebaseConfig = {
  apiKey: "AIzaSyB14MorOfKmXkhSS3u326K_36O8kwsTyMA",
  authDomain: "jvani-4fa7c.firebaseapp.com",
  projectId: "jvani-4fa7c",
  storageBucket: "jvani-4fa7c.firebasestorage.app",
  messagingSenderId: "1038499204109",
  appId: "1:1038499204109:web:e29055e69246583113d944",
  measurementId: "G-1ETJN912B6"
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: firebaseConfig.storageBucket
});

module.exports = admin;
