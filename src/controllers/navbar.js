import { prisma } from "../config/dbConfig.js";

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
                { secondaryEmail: { contains: query, mode: "insensitive" } },
                { secondaryPhone: { contains: query, mode: "insensitive" } },
              ]
            }
          },
          {
            personalInfo: {
              legalName: { contains: query, mode: "insensitive" },
              businessName: { contains: query, mode: "insensitive" }
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

const getNotifications = async (req, res) => {
  const userId = req.user.user_id;

  try {
    const notifications = await prisma.notificacion.findMany({
      where: { userId: userId }
    })

    res.json({ notifications: notifications, unreadCount: notifications.filter(n => !n.isRead).length });
  }
  catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
}

const renderNotifications = async (req, res) => {
  const userId = req.user.user_id;

  try {
    const notifications = await prisma.notificacion.findMany({
      where: { userId: userId }
    })

    await prisma.notificacion.updateMany({
      where: { userId: userId },
      data: { isRead: true }
    })

    res.render("notifications", { user, notifications, activePage: "notifications" });
  }
  catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
}

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
