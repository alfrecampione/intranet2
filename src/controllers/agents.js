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

export { renderAgents };
