import { prisma } from "../config/dbConfig.js";

const renderAgents = async (req, res) => {
  const user = req.user;

  const registeredUsers = await prisma.user.findMany({
    orderBy: [
      { display_name: 'asc' },
      { email: 'asc' }
    ]
  });

  res.render("agents", { user, registeredUsers });
};

const deleteAgent = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "Agent ID is required." });
  }

  try {
    await prisma.user.delete({
      where: { user_id: id }
    });

    res.status(200).json({ message: "Agent deleted successfully." });
  } catch (error) {
    res.status(500).json({ message: "Error deleting agent.", error: error.message });
  }
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



export { renderAgents, markDocsAsNecessary, deleteAgent };
