import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

// const client = twilio(accountSid, authToken);

/**
 * Sends an SMS using Twilio
 * @param {string} toPhoneNumber - The recipient phone number (e.g., "+1234567890")
 * @param {string} message - The message to send
 * @returns {Promise}
 */
export async function sendSMS(toPhoneNumber, message) {
    // return client.messages.create({
    //     body: message,
    //     from: twilioPhoneNumber,
    //     to: toPhoneNumber,
    // });
}