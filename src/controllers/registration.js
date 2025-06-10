import axios from "axios";
import https from "https";
import {pool} from "../config/dbConfig.js";

const agent = new https.Agent({
  rejectUnauthorized: false,
});

const register = async (req, res) => {
  try {
    const PORT = process.env.PORT || 443;
    const userId = req.user.user_id;
    const user = req.user;
    const endpoints = {
      personalInfo: `https://localhost:${PORT}/steps/personal-info/${userId}`,
      contactInfo: `https://localhost:${PORT}/steps/contact-info/${userId}`,
      emergencyContact: `https://localhost:${PORT}/steps/emergency-contact/${userId}`,
      taxInfo: `https://localhost:${PORT}/steps/tax-info/${userId}`,
      paymentMethod: `https://localhost:${PORT}/steps/payment-method/${userId}`,
      documents: `https://localhost:${PORT}/steps/documents/${userId}`
    };

    // Perform all requests in parallel with custom HTTPS agent
    const personalInfoRes = await axios.get(endpoints.personalInfo, { httpsAgent: agent });
    const contactInfoRes = await axios.get(endpoints.contactInfo, { httpsAgent: agent });
    const emergencyContactRes = await axios.get(endpoints.emergencyContact, { httpsAgent: agent });
    const taxInfoRes = await axios.get(endpoints.taxInfo, { httpsAgent: agent });
    const paymentMethodRes = await axios.get(endpoints.paymentMethod, { httpsAgent: agent });
    const documentsRes = await axios.get(endpoints.documents, { httpsAgent: agent });
    // Aggregating results into a single object
    const data = {
      user,
      personalInfo: personalInfoRes.data,
      contactInfo: contactInfoRes.data,
      emergencyContacts: emergencyContactRes.data,
      taxInfo: taxInfoRes.data,
      paymentMethods: paymentMethodRes.data,
      documents: documentsRes.data
    };
    res.render("registration", data);
  } catch (error) {
    console.error("Error loading registration data:", error.message);
    res.status(500).send("Error loading registration data.");
  }
};

export { register };
