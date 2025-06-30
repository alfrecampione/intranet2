import { prisma } from "../config/dbConfig.js";

// Step 1: Personal Info
export const createPersonalInfo = async (req, res) => {
  try {
    const {
      contactType,
      legalName,
      preferredName,
      legalSex,
      dateOfBirth,
      ssn,
      userId,
      photoPath,
      businessName,
      companyEIN
    } = req.body;

    const data = {
      contactType,
      legalName,
      preferredName: preferredName || null,
      legalSex,
      dateOfBirth: new Date(dateOfBirth),
      ssn,
      userId,
      photoPath: photoPath || null,
      businessName: businessName || null,
      companyEIN: companyEIN || null,
    };

    const personalInfo = await prisma.personalInfo.upsert({
      where: { userId },
      update: data,
      create: data,
    });

    // Update the registrationCompleted field in the user table
    await prisma.user.update({
      where: { user_id: userId },
      data: { registrationCompleted: true, display_name: legalName },
    });

    res.json(personalInfo);
  } catch (error) {
    console.error("Error creating or updating personal info:", error);
    res.status(500).json({
      error: "Failed to create or update personal info",
      details: error.message,
    });
  }
};

export const getPersonalInfoById = async (req, res) => {
  const personalInfo = await prisma.personalInfo.findUnique({
    where: { userId: req.params.id },
  });
  res.json(personalInfo);
};

// Step 2: Contact Info
export const createContactInfo = async (req, res) => {
  try {
    const {
      personalEmail,
      personalPhone,
      country,
      addressLine1,
      addressLine2,
      city,
      state,
      zipCode,
      workEmail,
      workPhone,
      preferredContactMethod,
      userId,
    } = req.body;
    const data = {
      personalEmail,
      personalPhone: personalPhone || null,
      country,
      addressLine1,
      addressLine2,
      city,
      state,
      zipCode,
      workEmail: workEmail || null,
      workPhone: workPhone || null,
      preferredContactMethod: preferredContactMethod || null,
      userId,
    };

    // Crear registro en la base de datos
    const contactInfo = await prisma.contactInfo.upsert({
      where: { userId: data.userId },
      update: data,
      create: data,
    });
    res.json(contactInfo);
  } catch (error) {
    console.error("Error creating or updating contact info:", error);
    res.status(500).json({
      error: "Failed to save contact information",
      details: error.message,
    });
  }
};

export const getContactInfoById = async (req, res) => {
  const contactInfo = await prisma.contactInfo.findUnique({
    where: { userId: req.params.id },
  });
  res.json(contactInfo);
};


export const createPaymentMethod = async (req, res) => {
  try {
    const paymentMethod = req.body;

    if (!paymentMethod || !paymentMethod.userId
    ) {
      return res
        .status(400)
        .json({ error: "Invalid payment method or missing userId." });
    }

    await prisma.paymentMethod.deleteMany({
      where: { userId: paymentMethod.userId },
    });

    await prisma.paymentMethod.create({
      data: paymentMethod,
    });

    res.status(201).json({ message: "Payment method replaced successfully" });
  } catch (err) {
    console.error("Error replacing payment method:", err);
    res.status(500).json({ error: err.message });
  }
};


export const getPaymentMethodById = async (req, res) => {
  try {
    const paymentMethods =
      (await prisma.paymentMethod.findMany({
        where: { userId: req.params.id },
      })) || [];
    res.json(paymentMethods);
  } catch (error) {
    res.status(500).json({ error: "Error retrieving payment methods" });
  }
};
// Step 6: Documents
export const createDocuments = async (req, res) => {
  try {
    const { userId, ...documentData } = req.body;

    const documents = await prisma.documents.upsert({
      where: { userId },
      update: documentData,
      create: { userId, ...documentData },
    });

    res.status(201).json(documents);
  } catch (err) {
    console.error("Error creating or updating documents:", err);
    res.status(500).json({
      error: "Failed to create or update documents",
      details: err.message,
    });
  }
};
export const getDocumentsById = async (req, res) => {
  const documents = await prisma.documents.findUnique({
    where: { userId: req.params.id },
  });
  res.json(documents);
};
