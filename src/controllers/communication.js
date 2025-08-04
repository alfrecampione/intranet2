import { sendSMS } from "../config/twilio.js";

const sendSMSHandler = async (req, res) => {
    const { toPhoneNumber, message } = req.body;

    try {
        const response = await sendSMS(toPhoneNumber, message);
        res.status(200).json({ success: true, message: "SMS sent successfully", response });
    } catch (error) {
        console.error("Error sending SMS:", error);
        res.status(500).json({ success: false, message: "Failed to send SMS", error: error.message });
    }
}

export { sendSMSHandler };