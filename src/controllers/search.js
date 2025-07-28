import { pool, prisma } from "../config/dbConfig.js";

const dataSearch = async (req, res) => {
  const { query } = req.body;

  if (!query || query.trim().length < 3) {
    return res.status(400).json({ error: "Query parameter is required and must be at least 3 characters." });
  }

  try {
    const result = await prisma.user.findMany({
      where: {
        OR: [
          { display_name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          {
            contactInfo: {
              OR: [
                { personalEmail: { contains: query, mode: "insensitive" } },
                { personalPhone: { contains: query, mode: "insensitive" } },
              ]
            }
          },
          {
            personalInfo: {
              legalName: { contains: query, mode: "insensitive" }
            }
          }
        ]
      },
      include: {
        contactInfo: true,
        personalInfo: true
      }
    });

    res.json({ contacts: result });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export { dataSearch };
