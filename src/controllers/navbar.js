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

async function createMessage(log) {
  if (!log.action) return '';

  const oldObj = safeParse(log.oldValue, null);
  const newObj = safeParse(log.newValue, null);

  const table = (log.table || '').toLowerCase();
  const action = (log.action || '').toLowerCase();

  const isCreate = action.includes('create');
  const isUpdate = action.includes('update');
  const isDelete = action.includes('delete');

  const userId = log.userId;
  const personalInfo = await prisma.personalInfo.findUnique({ where: { userId } });
  const legalName = personalInfo?.legalName || '(Administrator User)';

  let message = '';

  if (table.includes('user')) {
    if (isCreate) message = `🟢 ${legalName} created a new user.`;
    else if (isUpdate) message = `🔵 ${legalName} updated a user.`;
    else if (isDelete) message = `🔴 ${legalName} deleted a user.`;
  } else if (table.includes('carriers')) {
    const carrierObj = Array.isArray(newObj) ? newObj[0] : newObj || {};
    const company = carrierObj?.company ?? '(unknown)';
    if (isCreate) message = `🟢 ${legalName} added a new carrier: ${company}.`;
    else if (isUpdate) message = `🔵 ${legalName} updated carrier: ${company}.`;
    else if (isDelete) {
      const oldCarrierObj = Array.isArray(oldObj) ? oldObj[0] : oldObj || {};
      const oldCompany = oldCarrierObj?.company ?? '(unknown)';
      message = `🔴 ${legalName} deleted carrier: ${oldCompany}.`;
    }
  } else {
    const displayTable = log.table ?? '(unknown)';
    if (isCreate) message = `🟢 ${legalName} created a new ${displayTable}.`;
    else if (isUpdate) message = `🔵 ${legalName} updated a ${displayTable}.`;
    else if (isDelete) message = `🔴 ${legalName} deleted a ${displayTable}.`;
  }

  return message;
}

const getNotifications = async (req, res) => {
  const userId = req.user.user_id;

  try {
    let notifications = await prisma.logs.findMany({
      where: {
        OR: [
          { userId: userId },
          { oldValue: { contains: userId } },
          { newValue: { contains: userId } },
        ],
      },
    });

    const mappedNotifications = await Promise.all(
      notifications.map(async (n) => ({
        id: n.id,
        message: await createMessage(n),
        createdAt: n.createdAt.toISOString(),
        isRead: n.isRead ?? false,
      }))
    );

    res.json({ notifications: mappedNotifications, unreadCount: mappedNotifications.filter(n => !n.isRead).length });

  }
  catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
}

export { dataSearch, getNotifications };
