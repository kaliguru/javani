// utils/sms.js
const SMS = require('smsalert');
require('dotenv').config();

const username = process.env.SMSALERT_USERNAME; // e.g., "your_username"
const password = process.env.SMSALERT_PASSWORD; // e.g., "your_password"
const senderid = process.env.SMSALERT_SENDERID;   // e.g., "SENDERID"

const sms = new SMS(username, password);

/**
 * Sends an SMS message using SMS Alert Gateway.
 * @param {string} phoneNumber - The recipient's phone number.
 * @param {string} message - The message to send.
 * @returns {Promise} - Resolves with the response message from SMS Alert.
 */
const sendSMS = async (phoneNumber, message) => {
  try {
    // Encode the message to escape spaces and special characters
    const encodedMessage = encodeURIComponent(message);
    const responseMessage = await sms.send(phoneNumber, encodedMessage, senderid);
    console.log("SMS sent:", responseMessage);
    return responseMessage;
  } catch (error) {
    console.error("Error sending SMS:", error);
    throw error;
  }
};

module.exports = { sendSMS };