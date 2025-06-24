import { prisma } from "../config/dbConfig.js";

const renderAgents = async (req, res) => {
  const user = req.user;

  const registeredUsersRaw = await prisma.$queryRaw`
        SELECT * FROM "User" u 
        LEFT JOIN "PersonalInfo" pi ON u.user_id = pi."userId"
    `;

  // Convert to plain JSON array (if not already)
  const registeredUsers = JSON.parse(JSON.stringify(registeredUsersRaw));

  res.render("agents", { user, registeredUsers });
};

const markDocsAsNecessary = async (req, res) => {
  const { email, ...requiredDocuments } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  try {
    // Upsert: create if not exists, update if exists
    const doc = await prisma.necesaryDocuments.upsert({
      where: { email },
      update: requiredDocuments,
      create: {
        email,
        ...requiredDocuments
      }
    });

    res.status(200).json({ message: "Necessary documents saved.", doc });
  } catch (error) {
    res.status(500).json({ message: "Error saving necessary documents.", error: error.message });
  }
};



export { renderAgents, markDocsAsNecessary };
