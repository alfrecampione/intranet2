import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Step 1: Personal Info
export const createPersonalInfo = async (req, res) => {
  try {
    const personalInfo = await prisma.personalInfo.create({ data: req.body });
    res.status(201).json(personalInfo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
export const getAllPersonalInfo = async (req, res) => {
  const personalInfos = await prisma.personalInfo.findMany();
  res.json(personalInfos);
};
export const getPersonalInfoById = async (req, res) => {
  const personalInfo = await prisma.personalInfo.findUnique({ where: { id: req.params.id } });
  res.json(personalInfo);
};
export const updatePersonalInfo = async (req, res) => {
  try {
    const personalInfo = await prisma.personalInfo.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(personalInfo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
export const deletePersonalInfo = async (req, res) => {
  await prisma.personalInfo.delete({ where: { id: req.params.id } });
  res.json({ message: 'Deleted' });
};

// Step 2: Contact Info
export const createContactInfo = async (req, res) => {
  try {
    const contactInfo = await prisma.contactInfo.create({ data: req.body });
    res.status(201).json(contactInfo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
export const getAllContactInfo = async (req, res) => {
  const contactInfos = await prisma.contactInfo.findMany();
  res.json(contactInfos);
};
export const getContactInfoById = async (req, res) => {
  const contactInfo = await prisma.contactInfo.findUnique({ where: { id: req.params.id } });
  res.json(contactInfo);
};
export const updateContactInfo = async (req, res) => {
  try {
    const contactInfo = await prisma.contactInfo.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(contactInfo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
export const deleteContactInfo = async (req, res) => {
  await prisma.contactInfo.delete({ where: { id: req.params.id } });
  res.json({ message: 'Deleted' });
};

// Step 3: Emergency Contact
export const createEmergencyContact = async (req, res) => {
  try {
    const emergencyContact = await prisma.emergencyContact.create({ data: req.body });
    res.status(201).json(emergencyContact);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
export const getAllEmergencyContacts = async (req, res) => {
  const emergencyContacts = await prisma.emergencyContact.findMany();
  res.json(emergencyContacts);
};
export const getEmergencyContactById = async (req, res) => {
  const emergencyContact = await prisma.emergencyContact.findUnique({ where: { id: req.params.id } });
  res.json(emergencyContact);
};
export const updateEmergencyContact = async (req, res) => {
  try {
    const emergencyContact = await prisma.emergencyContact.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(emergencyContact);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
export const deleteEmergencyContact = async (req, res) => {
  await prisma.emergencyContact.delete({ where: { id: req.params.id } });
  res.json({ message: 'Deleted' });
};

// Step 4: Tax Info
export const createTaxInfo = async (req, res) => {
  try {
    const taxInfo = await prisma.taxInfo.create({ data: req.body });
    res.status(201).json(taxInfo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
export const getAllTaxInfo = async (req, res) => {
  const taxInfos = await prisma.taxInfo.findMany();
  res.json(taxInfos);
};
export const getTaxInfoById = async (req, res) => {
  const taxInfo = await prisma.taxInfo.findUnique({ where: { id: req.params.id } });
  res.json(taxInfo);
};
export const updateTaxInfo = async (req, res) => {
  try {
    const taxInfo = await prisma.taxInfo.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(taxInfo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
export const deleteTaxInfo = async (req, res) => {
  await prisma.taxInfo.delete({ where: { id: req.params.id } });
  res.json({ message: 'Deleted' });
};

// Step 5: Payment Method
export const createPaymentMethod = async (req, res) => {
  try {
    const paymentMethod = await prisma.paymentMethod.create({ data: req.body });
    res.status(201).json(paymentMethod);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
export const getAllPaymentMethods = async (req, res) => {
  const paymentMethods = await prisma.paymentMethod.findMany();
  res.json(paymentMethods);
};
export const getPaymentMethodById = async (req, res) => {
  const paymentMethod = await prisma.paymentMethod.findUnique({ where: { id: req.params.id } });
  res.json(paymentMethod);
};
export const updatePaymentMethod = async (req, res) => {
  try {
    const paymentMethod = await prisma.paymentMethod.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(paymentMethod);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
export const deletePaymentMethod = async (req, res) => {
  await prisma.paymentMethod.delete({ where: { id: req.params.id } });
  res.json({ message: 'Deleted' });
};

// Step 6: Documents
export const createDocuments = async (req, res) => {
  try {
    const documents = await prisma.documents.create({ data: req.body });
    res.status(201).json(documents);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
export const getAllDocuments = async (req, res) => {
  const documentsList = await prisma.documents.findMany();
  res.json(documentsList);
};
export const getDocumentsById = async (req, res) => {
  const documents = await prisma.documents.findUnique({ where: { id: req.params.id } });
  res.json(documents);
};
export const updateDocuments = async (req, res) => {
  try {
    const documents = await prisma.documents.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(documents);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
export const deleteDocuments = async (req, res) => {
  await prisma.documents.delete({ where: { id: req.params.id } });
  res.json({ message: 'Deleted' });
};