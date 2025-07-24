import { prisma } from "../config/dbConfig.js";

const renderProfile = async (req, res) => {
    const user = req.user;
    const userId = req.params.id ?? user.user_id;

    const profile = await prisma.user.findUnique({
        where: { user_id: userId }
    });

    const personalInfo = await prisma.personalInfo.findUnique({
        where: { userId }
    });

    const contactInfo = await prisma.contactInfo.findUnique({
        where: { userId }
    });

    const carriers = await prisma.statesANDCarriers.findMany({
        where: { userId },
        orderBy: { state: 'asc' },
    });

    const logs = await prisma.logs.findMany({
        where: {
            OR: [
                { userId: userId },
                { oldValue: { contains: userId } },
                { newValue: { contains: userId } },
            ],
        },
    });

    const activity = logs
        .map(createActivityEntry)
        .filter(Boolean) // Remove null entries
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.render("profile", {
        userId,
        user,
        profile,
        personalInfo,
        contactInfo,
        carriers,
        activity
    });
};

function diffJson(oldValue, newValue) {
    const oldObj = JSON.parse(oldValue || '{}');
    const newObj = JSON.parse(newValue || '{}');

    const differences = [];

    for (const key of Object.keys(oldObj)) {
        if (oldObj[key] !== newObj[key]) {
            differences.push(`${key}: ${oldObj[key]} -> ${newObj[key]}`);
        }
    }

    return differences.join('\n');
}

function timeAgo(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;

    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
}

function createActivityEntry(log) {
    if (!log.action || !log.createdAt) return null;

    let title = '';
    let description = '';

    if (log.table.toLowerCase().includes('user')) {
        if (log.action.includes('create')) {
            title = 'User Created';
            description = 'The user was created.';
        } else if (log.action.includes('update')) {
            title = 'User Updated';
            description = diffJson(log.oldValue, log.newValue);
        }
    } else if (log.table.toLowerCase().includes('carriers')) {
        if (log.action.includes('update')) {
            const carrier = JSON.parse(log.newValue || '{}');
            title = `Carrier ${carrier.company} Updated`;
            description = diffJson(log.oldValue, log.newValue);
        }
        if (log.action.includes('create')) {
            title = 'Carrier Created';
            const carrier = JSON.parse(log.newValue || '{}');
            description = `The carrier ${carrier.company} in state ${carrier.state} was created.`;
        }
        if (log.action.includes('delete')) {
            title = 'Carrier Deleted';
            const carrier = JSON.parse(log.oldValue || '{}');
            description = `The carrier ${carrier.company} in state ${carrier.state} was deleted.`;
        }
    } else {
        if (log.action.includes('update')) {
            title = `${log.table} Updated`;
            description = diffJson(log.oldValue, log.newValue);
        }
    }

    return {
        variant: log.action.includes('create') ? 'success' :
            log.action.includes('update') ? 'info' : 'warning',
        title,
        description,
        timeAgo: timeAgo(new Date(log.createdAt)),
        createdAt: log.createdAt
    };
}

export { renderProfile };
