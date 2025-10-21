import { prisma, pool } from "../config/dbConfig.js";
import { getAllAgencyIds, fetchCreators, mapNotifications } from "../config/utils.js";

const dataSearch = async (req, res) => {
  const { query } = req.body;
  const user = req.user;

  if (!query || query.trim().length < 3) {
    return res.status(400).json({
      error: "Query parameter is required and must be at least 3 characters."
    });
  }

  try {
    const agentId = user.user_id;

    const searchConditions = [
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
    ];

    let whereClause = { OR: searchConditions };

    if (!user.isMicrosoftLogin) {
      const agency = await prisma.agency.findUnique({
        where: { owner: agentId },
      });

      const agencyId = await prisma.agency.findFirst({
        where: { name: agency?.name },
      }).then(a => a ? a.id : null);

      if (agencyId) {
        const allAgencyIds = await getAllAgencyIds(agencyId);

        whereClause = {
          AND: [
            { OR: searchConditions },
            {
              OR: [
                { personalInfo: { agency: { in: allAgencyIds } } },
                { user_id: agentId },
              ],
            },
          ],
        };
      } else {
        whereClause = { AND: [{ OR: searchConditions }, { OR: [{ user_id: agentId }] }] };
      }
    }

    const result = await prisma.user.findMany({
      where: whereClause,
      include: { contactInfo: true, personalInfo: true },
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

    const creatorIds = [...new Set(notifications.map(n => n.createdBy))].filter(Boolean);
    const creatorsMap = await fetchCreators(creatorIds, prisma, pool);

    const mappedNotifications = mapNotifications(notifications, creatorsMap);

    res.json({
      notifications: mappedNotifications,
      unreadCount: notifications.filter(n => !n.isRead).length,
    });
  } catch (error) {
    console.error('❌ Notifications error:', error);
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

    const creatorIds = [...new Set(notifications.map(n => n.createdBy))].filter(Boolean);
    const creatorsMap = await fetchCreators(creatorIds, prisma, pool);
    const mappedNotifications = mapNotifications(notifications, creatorsMap);

    // Marcar todas como leídas
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
    console.error('❌ Notifications error:', error);
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
