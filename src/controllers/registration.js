import { prisma } from "../config/dbConfig.js";

async function getRegistrationData(userId, isEdit = false, reqUser) {
  const user = reqUser;

  const [
    personalInfo,
    contactInfo,
    paymentMethod,
    documents,
  ] = await Promise.all([
    prisma.personalInfo.findUnique({ where: { userId } }),
    prisma.contactInfo.findUnique({ where: { userId } }),
    prisma.paymentMethod.findUnique({ where: { userId } }),
    prisma.documents.findUnique({ where: { userId } }),
  ]);

  let necesaryDocuments;

  if (isEdit) {
    const existingUser = prisma.user.findUnique({ where: { user_id: userId } })

    necesaryDocuments = await prisma.necesaryDocuments.findUnique({
      where: { email: existingUser.email },
    });
  }
  else {
    necesaryDocuments = await prisma.necesaryDocuments.findUnique({
      where: { email: user.email },
    });
  }


  return {
    user,
    userId,
    personalInfo,
    contactInfo,
    paymentMethod,
    documents,
    necesaryDocuments,
    isEdit
  };
}

const register = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const data = await getRegistrationData(userId, false, req.user);
    res.render("registration", data);
  } catch (error) {
    console.error("Error loading registration data:", error.message);
    res.status(500).send("Error loading registration data.");
  }
};

const editRegister = async (req, res) => {
  try {
    const user = req.user;
    const userId = req.params.id || user.user_id;
    const data = await getRegistrationData(userId, true, req.user);
    res.render("registration", data);
  } catch (error) {
    console.error("Error loading registration data:", error.message);
    res.status(500).send("Error loading registration data.");
  }
};

const handleFileUpload = (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const normalizedPath = req.file.path.replace(/\\/g, "/");
    const relativePath = normalizedPath.includes("uploads/")
      ? normalizedPath.substring(normalizedPath.indexOf("uploads/"))
      : `uploads/${req.file.filename}`;

    res.json({ path: relativePath });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      error: "Upload failed",
      details: error.message,
    });
  }
};

export { register, handleFileUpload, editRegister };