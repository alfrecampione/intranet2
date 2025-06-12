import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Step 1: Personal Info
export const createPersonalInfo = async (req, res) => {
  try {
    const {
      ContractorType,
      LegalName,
      PreferredName,
      LegalSex,
      DateOfBirth,
      SSN,
      userId,
    } = req.body;

    const data = {
      ContractorType,
      LegalName,
      PreferredName: PreferredName || null,
      LegalSex,
      DateOfBirth: new Date(DateOfBirth),
      SSN,
      userId,
    };

    const personalInfo = await prisma.personalInfo.upsert({
      where: { userId },
      update: data,
      create: data,
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

// Step 3: Emergency Contact
export const createEmergencyContacts = async (req, res) => {
  try {
    const contacts = req.body;

    if (!Array.isArray(contacts)) {
      return res
        .status(400)
        .json({ error: "Se esperaba un arreglo de contactos." });
    }

    // Group contacts by userId
    const userIds = [...new Set(contacts.map((contact) => contact.userId))];

    // Delete existing contacts for the affected users
    await prisma.emergencyContact.deleteMany({
      where: {
        userId: {
          in: userIds,
        },
      },
    });

    // Create new contacts
    await prisma.emergencyContact.createMany({
      data: contacts.map((contact) => ({
        Fullname: contact.Fullname,
        Phone: contact.Phone,
        secondaryPhone: contact.secondaryPhone ?? null,
        userId: contact.userId,
      })),
    });

    res
      .status(201)
      .json({ message: "Contactos de emergencia reemplazados exitosamente" });
  } catch (err) {
    console.error("Error al reemplazar contactos de emergencia:", err);
    res.status(500).json({ error: err.message });
  }
};
export const getEmergencyContactById = async (req, res) => {
  try {
    const emergencyContacts =
      (await prisma.emergencyContact.findMany({
        where: { userId: req.params.id },
      })) || [];
    res.json(emergencyContacts);
  } catch (error) {
    res.status(500).json({ error: "Error retrieving emergency contacts" });
  }
};
// Step 4: Tax Info
export const createTaxInfo = async (req, res) => {
  try {
    const taxInfo = await prisma.taxInfo.upsert({
      where: { userId: req.body.userId },
      update: req.body,
      create: req.body,
    });

    res.status(201).json(taxInfo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
export const getTaxInfoById = async (req, res) => {
  const taxInfo = await prisma.taxInfo.findUnique({
    where: { userId: req.params.id },
  });
  res.json(taxInfo);
};

// Step 5: Payment Method
export const createPaymentMethods = async (req, res) => {
  try {
    const paymentMethods = req.body;

    if (!Array.isArray(paymentMethods)) {
      return res
        .status(400)
        .json({ error: "Expected an array of payment methods." });
    }

    // Extract unique user IDs from incoming data
    const userIds = [...new Set(paymentMethods.map((method) => method.userId))];

    // Delete existing payment methods for those users
    await prisma.paymentMethod.deleteMany({
      where: {
        userId: {
          in: userIds,
        },
      },
    });

    // Create new payment methods
    await prisma.paymentMethod.createMany({
      data: paymentMethods,
    });

    res.status(201).json({ message: "Payment methods replaced successfully" });
  } catch (err) {
    console.error("Error replacing payment methods:", err);
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
    res
      .status(500)
      .json({
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
