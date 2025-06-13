import { prisma } from "../config/dbConfig.js";

const register = async (req, res) => {
  try {
    const user = req.user;
    const userId = user.user_id;

    // Consultas separadas
    const personalInfo = await prisma.personalInfo.findUnique({ where: { userId } });
    const contactInfo = await prisma.contactInfo.findUnique({ where: { userId } });
    const emergencyContacts = await prisma.emergencyContact.findMany({ where: { userId } });
    const taxInfo = await prisma.taxInfo.findUnique({ where: { userId } });
    const paymentMethods = await prisma.paymentMethod.findMany({ where: { userId } });
    const documents = await prisma.documents.findUnique({ where: { userId } });

    const data = {
      user,
      personalInfo,
      contactInfo,
      emergencyContacts,
      taxInfo,
      paymentMethods,
      documents
    };

    res.render("registration", data);
  } catch (error) {
    console.error("Error loading registration data:", error.message);
    res.status(500).send("Error loading registration data.");
  }
};

const handleFileUpload = (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const normalizedPath = req.file.path.replace(/\\/g, '/');
    const relativePath = normalizedPath.includes('uploads/')
      ? normalizedPath.substring(normalizedPath.indexOf('uploads/'))
      : `uploads/${req.file.filename}`;

    res.json({ path: relativePath });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      details: error.message
    });
  }
};

export { register, handleFileUpload };