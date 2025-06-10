import axios from "axios";

const register = async (req, res) => {
  try {
    const PORT = process.env.PORT || 443;
    const userId = req.user;
    const endpoints = {
      personalInfo: `https://localhost:${PORT}/steps/personal-info/${userId}`,
      contactInfo: `https://localhost:${PORT}/steps/contact-info/${userId}`,
      emergencyContact: `https://localhost:${PORT}/steps/emergency-contact/${userId}`,
      taxInfo: `https://localhost:${PORT}/steps/tax-info/${userId}`,
      paymentMethod: `https://localhost:${PORT}/steps/payment-method/${userId}`,
      documents: `https://localhost:${PORT}/steps/documents/${userId}`
    };

    // Get personal information
    const personalInfo = await axios.get(endpoints.personalInfo);

    console.log("Personal Info:", personalInfo.data);

    // Perform all requests in parallel
    const [
      personalInfoRes,
      contactInfoRes,
      emergencyContactRes,
      taxInfoRes,
      paymentMethodRes,
      documentsRes
    ] = await Promise.all([
      axios.get(endpoints.personalInfo),
      axios.get(endpoints.contactInfo),
      axios.get(endpoints.emergencyContact),
      axios.get(endpoints.taxInfo),
      axios.get(endpoints.paymentMethod),
      axios.get(endpoints.documents)
    ]);

    const data = {
      userId,
      personalInfo: personalInfoRes.data,
      contactInfo: contactInfoRes.data,
      emergencyContact: emergencyContactRes.data,
      taxInfo: taxInfoRes.data,
      paymentMethod: paymentMethodRes.data,
      documents: documentsRes.data
    };

    console.log(data)

    res.render("registration", data);

  } catch (error) {
    console.error("Error loading registration data:", error.message);
    res.status(500).send("Error loading registration data.");
  }
};

export {register};