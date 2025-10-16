import { prisma, pool } from "../config/dbConfig.js";
import { getAllAgencyIds } from "../config/utils.js";

const dataSearch = async (req, res) => {
  const { query } = req.body;
  const user = req.user;

  if (!query || query.trim().length < 3) {
    return res.status(400).json({
      error: "Query parameter is required and must be at least 3 characters."
    });
  }

  try {
    let whereClause = {
      OR: [
        { display_name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        {
          contactInfo: {
            OR: [
              { personalEmail: { contains: query, mode: "insensitive" } },
              { personalPhone: { contains: query, mode: "insensitive" } },
              { secondaryEmail: { contains: query, mode: "insensitive" } },
              { secondaryPhone: { contains: query, mode: "insensitive" } },
            ],
          },
        },
        {
          personalInfo: {
            OR: [
              { legalName: { contains: query, mode: "insensitive" } },
              { businessName: { contains: query, mode: "insensitive" } },
            ],
          },
        },
      ],
    };

    if (!user.isMicrosoftLogin) {
      const agentId = user.user_id;
      const owner = await prisma.agency.findUnique({
        where: { owner: agentId },
      });

      console.log("User's agency name:", owner);

      const agencyId = await prisma.agency.findFirst({
        where: { name: agencyName }
      }).then(agency => agency ? agency.id : null);

      if (agencyId) {
        const allAgencyIds = await getAllAgencyIds(agencyId);
        whereClause.AND = [
          {
            personalInfo: {
              agency: { in: allAgencyIds },
            },
          },
        ];
      } else {
        whereClause.AND = [{ user_id: user.user_id }];
      }
    }

    const result = await prisma.user.findMany({
      where: whereClause,
      include: {
        contactInfo: true,
        personalInfo: true,
      },
    });

    res.json({ contacts: result });
  } catch (error) {
    console.error("❌ Search error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getNotifications = async (req, res) => {
  const userId = req.user.user_id;

  try {
    const notifications = await prisma.notificacion.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    // Get unique creator IDs
    const creatorIds = [...new Set(notifications.map(n => n.createdBy))].filter(Boolean);

    // Fetch all creators in one go from Prisma
    const prismaCreators = await prisma.user.findMany({
      where: { user_id: { in: creatorIds } },
      select: { user_id: true, display_name: true },
    });

    // Fetch all remaining (non-Prisma) creators from SQL in one batch
    const remainingIds = creatorIds.filter(
      id => !prismaCreators.some(p => p.user_id === id)
    );

    let sqlCreators = [];
    if (remainingIds.length > 0) {
      const { rows } = await pool.query(
        `SELECT user_id, display_name 
         FROM entra.users 
         WHERE user_id = ANY($1) AND active = true AND location_id > 0`,
        [remainingIds]
      );
      sqlCreators = rows;
    }

    // Merge creators into one map for fast lookup
    const creatorsMap = new Map();
    prismaCreators.forEach(u => creatorsMap.set(u.user_id, u.display_name));
    sqlCreators.forEach(u => creatorsMap.set(u.user_id, u.display_name));

    const mappedNotifications = notifications.map(n => ({
      id: n.id,
      userId: n.userId,
      message: n.message,
      isRead: n.isRead,
      createdBy: creatorsMap.get(n.createdBy) || 'Admin User',
      createdAt: n.createdAt,
    }));

    res.json({
      notifications: mappedNotifications,
      unreadCount: notifications.filter(n => !n.isRead).length,
    });
  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
};

const renderNotifications = async (req, res) => {
  const userId = req.user.user_id;
  const user = req.user;

  try {
    const notifications = await prisma.notificacion.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    console.log("Notifications fetched:", notifications.length);

    const creatorIds = [...new Set(notifications.map(n => n.createdBy))].filter(Boolean);

    const prismaCreators = await prisma.user.findMany({
      where: { user_id: { in: creatorIds } },
      select: { user_id: true, display_name: true },
    });
    console.log("Prisma creators fetched:", prismaCreators.length);
    const remainingIds = creatorIds.filter(
      id => !prismaCreators.some(p => p.user_id === id)
    );
    console.log("Remaining creator IDs for SQL fetch:", remainingIds);

    let sqlCreators = [];
    if (remainingIds.length > 0) {
      const { rows } = await pool.query(
        `SELECT user_id, display_name 
         FROM entra.users 
         WHERE user_id = ANY($1) AND active = true AND location_id > 0`,
        [remainingIds]
      );
      sqlCreators = rows;
    }

    console.log("SQL creators fetched:", sqlCreators.length);

    const creatorsMap = new Map();
    prismaCreators.forEach(u => creatorsMap.set(u.user_id, u.display_name));
    sqlCreators.forEach(u => creatorsMap.set(u.user_id, u.display_name));

    const mappedNotifications = notifications.map(n => ({
      id: n.id,
      userId: n.userId,
      message: n.message,
      isRead: n.isRead,
      createdBy: creatorsMap.get(n.createdBy) || 'Admin User',
      createdAt: n.createdAt,
    }));

    // Mark all as read
    await prisma.notificacion.updateMany({
      where: { userId },
      data: { isRead: true },
    });

    res.render('notifications', {
      user,
      notifications: mappedNotifications,
      activePage: 'notifications',
    });
  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
};

const readNotification = async (req, res) => {
  const userId = req.user.user_id;
  const notificationId = req.params.id;

  try {
    await prisma.notificacion.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true }
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
};

export { dataSearch, getNotifications, renderNotifications, readNotification };
