import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

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

export { register };