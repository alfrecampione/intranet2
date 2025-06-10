import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Step 1: Personal Info
export const createPersonalInfo = async (req, res) => {
  try {
    const { 
      LegalName,       
      PreferredName,   
      LegalSex,                  
      DateOfBirth,
      SSN,                           
      userId
    } = req.body;

    const data = {
      LegalName,
      PreferredName: PreferredName || null,
      LegalSex,
      DateOfBirth: new Date(DateOfBirth),
      SSN,
      userId             
    };

    const personalInfo = await prisma.personalInfo.upsert({
      where: { userId },
      update: data,
      create: data 
    });

    res.json(personalInfo);
  } catch (error) {
    console.error("Error creating or updating personal info:", error);
    res.status(500).json({ 
      error: "Failed to create or update personal info",
      details: error.message 
    });
  }
};

export const getPersonalInfoById = async (req, res) => {
  const personalInfo = await prisma.personalInfo.findUnique({ userId: parseInt(req.params.id) });
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
      userId
    } = req.body;

    // Combinar direcciones
    const address = `${addressLine1}${addressLine2 ? `, ${addressLine2}` : ''}`;

    const data = {
      personalEmail,
      personalPhone: personalPhone || null,
      country,
      address,
      city,
      state,
      zipCode,
      workEmail: workEmail || null,
      workPhone: workPhone || null,
      preferredContactMethod: preferredContactMethod || null,
      userId
    };

    // Crear registro en la base de datos
    const contactInfo = await prisma.contactInfo.upsert({
      where: { userId: data.userId },
      update: data,
      create: data
    });
    res.json(contactInfo);
  } catch (error) {
    console.error("Error creating or updating contact info:", error);
    res.status(500).json({ 
      error: "Failed to save contact information",
      details: error.message 
    });
  }
};

export const getContactInfoById = async (req, res) => {
  const contactInfo = await prisma.contactInfo.findUnique({ where: { userId: parseInt(req.params.id) } });
  res.json(contactInfo);
};

// Step 3: Emergency Contact
export const createOrUpdateEmergencyContacts = async (req, res) => {
  try {
    const contacts = req.body;

    if (!Array.isArray(contacts)) {
      return res.status(400).json({ error: "Se esperaba un arreglo de contactos." });
    }

    await Promise.all(
      contacts.map(async (contact) => {
        await prisma.emergencyContact.upsert({
          where: { userId: contact.userId },
          update: {
            Fullname: contact.Fullname,
            Phone: contact.Phone,
            secondaryPhone: contact.secondaryPhone ?? null
          },
          create: {
            Fullname: contact.Fullname,
            Phone: contact.Phone,
            secondaryPhone: contact.secondaryPhone ?? null,
            userId: contact.userId
          }
        });
      })
    );

    res.status(201).json({ message: "Contactos de emergencia creados o actualizados exitosamente" });
  } catch (err) {
    console.error("Error al crear o actualizar contactos de emergencia:", err);
    res.status(500).json({ error: err.message });
  }
};
export const getEmergencyContactById = async (req, res) => {
  try {
    const emergencyContacts = await prisma.emergencyContact.findMany({
      where: { userId: parseInt(req.params.id) }
    });
    res.json(emergencyContacts);
  } catch (error) {
    res.status(500).json({ error: 'Error retrieving emergency contacts' });
  }
};
// Step 4: Tax Info
export const createTaxInfo = async (req, res) => {
  try {
    const taxInfo = await prisma.taxInfo.upsert({
      where: { userId: req.body.userId },
      update: req.body,
      create: req.body
    });

    res.status(201).json(taxInfo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
export const getTaxInfoById = async (req, res) => {
  const taxInfo = await prisma.taxInfo.findUnique({ where: { userId: parseInt(req.params.id) } });
  res.json(taxInfo);
};

// Step 5: Payment Method
export const createOrUpdatePaymentMethods = async (req, res) => {
  try {
    const paymentMethods = req.body;

    if (!Array.isArray(paymentMethods)) {
      return res.status(400).json({ error: "Expected an array of payment methods." });
    }

    await Promise.all(
      paymentMethods.map(async (method) => {
        await prisma.paymentMethod.upsert({
          where: { userId: method.userId },
          update: method,
          create: method
        });
      })
    );

    res.status(201).json({ message: "Payment methods created or updated successfully" });
  } catch (err) {
    console.error("Error creating/updating payment methods:", err);
    res.status(500).json({ error: err.message });
  }
};
export const getPaymentMethodById = async (req, res) => {
  try{
    const paymentMethods = await prisma.paymentMethod.findMany({ where: { userId: parseInt(req.params.id) } });
    res.json(paymentMethods);
  }
  catch(error){
    res.status(500).json({ error: 'Error retrieving payment methods' });
  }
};
// Step 6: Documents
export const createOrUpdateDocuments = async (req, res) => {
  try {
    const { userId, ...documentData } = req.body;

    const documents = await prisma.documents.upsert({
      where: { userId },
      update: documentData,
      create: { userId, ...documentData }
    });

    res.status(201).json(documents);
  } catch (err) {
    console.error("Error creating or updating documents:", err);
    res.status(500).json({ error: "Failed to create or update documents", details: err.message });
  }
};
export const getDocumentsById = async (req, res) => {
  const documents = await prisma.documents.findUnique({ where: { userId: parseInt(req.params.id) } });
  res.json(documents);
};