import { prisma } from "../config/dbConfig.js";
import { prismaContext } from "../config/prismaContext.js";
import { getAgencies, getVisibleAgentsId } from "../config/utils.js";

const renderProfile = async (req, res) => {
    const user = req.user;
    const userId = req.params.id ?? user.user_id;

    const profile = await prisma.user.findUnique({
        where: { user_id: userId }
    });

    if (!profile) {
        return res.status(404).send("User not found");
    }

    const personalInfo = await prisma.personalInfo.findUnique({
        where: { userId }
    });

    const contactInfo = await prisma.contactInfo.findUnique({
        where: { userId }
    });

    const paymentMethod = await prisma.paymentMethod.findUnique({
        where: { userId }
    });

    const documents = await prisma.documents.findUnique({
        where: { userId }
    });

    const necesaryDocs = await prisma.necesaryDocuments.findUnique({
        where: { email: profile.email }
    });

    const carriers = await prisma.statesANDCarriers.findMany({
        where: { userId },
        orderBy: { state: 'asc' },
    });

    const allCompanies = await prisma.company.findMany();

    const allAgencies = await getAgencies();

    const logs = await prisma.logs.findMany({
        where: {
            OR: [
                { userId: userId },
                { oldValue: { contains: userId } },
                { newValue: { contains: userId } },
            ],
        },
    });

    const activityEntries = await Promise.all(logs.map(createActivityEntry));

    const activity = activityEntries
        .filter(Boolean)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const pinnedNotes = await prisma.note.findMany({
        where: { userId, isPinned: true },
        orderBy: { createdAt: 'desc' }
    });

    // Can edit flag for frontend
    // If the user is viewing their own profile, they can edit
    // or if they have admin rights (rights including 2)
    // or is an agency owner viewing their agent's profile
    const allowedIds = await getVisibleAgentsId(req.user.user_id);
    allowedIds.push(req.user.user_id);

    const canEdit = user && ((user.rights && user.rights.includes(2)) || allowedIds.includes(userId));
    console.log("Can Edit:", canEdit, "for userId:", userId, "viewer:", req.user.user_id);

    res.render("profile", {
        userId,
        user,
        profile,
        personalInfo,
        contactInfo,
        paymentMethod,
        documents,
        necesaryDocs,
        carriers,
        allCompanies,
        allAgencies,
        activity,
        pinnedNotes,
        activePage: 'profile',
        canEdit
    });
};

function safeParse(json, fallback = null) {
    try {
        return json ? JSON.parse(json) : fallback;
    } catch {
        return fallback;
    }
}

function isObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
}

function formatVal(v) {
    if (v === null || v === undefined) return String(v);
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
}

function diffJsonDeep(oldV, newV, prefix = '') {
    const lines = [];

    // both primitives
    if (!isObject(oldV) && !Array.isArray(oldV) &&
        !isObject(newV) && !Array.isArray(newV)) {
        if (oldV !== newV) {
            lines.push(`${prefix}: ${formatVal(oldV)} -> ${formatVal(newV)}`);
        }
        return lines;
    }

    // arrays
    if (Array.isArray(oldV) || Array.isArray(newV)) {
        const oldArr = Array.isArray(oldV) ? oldV : [];
        const newArr = Array.isArray(newV) ? newV : [];
        const max = Math.max(oldArr.length, newArr.length);
        for (let i = 0; i < max; i++) {
            const p = prefix ? `${prefix}[${i}]` : `[${i}]`;
            if (i >= oldArr.length) {
                lines.push(`${p}: <added> ${formatVal(newArr[i])}`);
            } else if (i >= newArr.length) {
                lines.push(`${p}: <removed> ${formatVal(oldArr[i])}`);
            } else {
                lines.push(...diffJsonDeep(oldArr[i], newArr[i], p));
            }
        }
        return lines;
    }

    // objects
    const oldObj = isObject(oldV) ? oldV : {};
    const newObj = isObject(newV) ? newV : {};
    const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
    for (const key of keys) {
        const p = prefix ? `${prefix}.${key}` : key;
        if (!(key in newObj)) {
            lines.push(`${p}: <removed> ${formatVal(oldObj[key])}`);
        } else if (!(key in oldObj)) {
            lines.push(`${p}: <added> ${formatVal(newObj[key])}`);
        } else {
            lines.push(...diffJsonDeep(oldObj[key], newObj[key], p));
        }
    }
    return lines;
}

function diffJson(oldValue, newValue) {
    const oldObj = safeParse(oldValue, null);
    const newObj = safeParse(newValue, null);
    const lines = diffJsonDeep(oldObj, newObj);
    return lines.length ? lines.join('\n') : 'No visible changes';
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

async function createActivityEntry(log) {
    if (!log.action || !log.createdAt) return null;

    let title = '';
    let description = '';

    const oldObj = safeParse(log.oldValue, null);
    const newObj = safeParse(log.newValue, null);

    const table = (log.table || '').toLowerCase();
    const action = (log.action || '').toLowerCase();

    const isCreate = action.includes('create');
    const isUpdate = action.includes('update');
    const isDelete = action.includes('delete');

    const variant = isCreate ? 'success' : isUpdate ? 'info' : 'danger';

    const userId = log.userId;
    const personalInfo = await prisma.personalInfo.findUnique({ where: { userId } });
    const legalName = personalInfo?.legalName || '(Administrator User)';

    if (table.includes('user')) {
        if (isCreate) {
            title = `User Created by ${legalName}`;
            description = '';
        } else if (isUpdate) {
            title = `User Updated by ${legalName}`;
            description = diffJson(log.oldValue, log.newValue);
        } else if (isDelete) {
            title = `User Deleted by ${legalName}`;
            description = '';
        }
    } else if (table.includes('carriers')) {
        const carrierObj = Array.isArray(newObj) ? newObj[0] : newObj || {};
        const company = carrierObj?.company ?? '(unknown)';
        const state = carrierObj?.state ?? '(unknown)';

        if (isUpdate) {
            title = `Carrier ${company} Updated by ${legalName}`;
            description = diffJson(log.oldValue, log.newValue);
        } else if (isCreate) {
            title = `Carrier ${company} Created by ${legalName}`;
            description = '';
        } else if (isDelete) {
            const oldCarrierObj = Array.isArray(oldObj) ? oldObj[0] : oldObj || {};
            title = `Carrier ${oldCarrierObj.company ?? '(unknown)'} Deleted by ${legalName}`;
            description = `The carrier ${oldCarrierObj.company ?? '(unknown)'} in state ${oldCarrierObj.state ?? '(unknown)'} was deleted.`;
        }
    } else {
        if (isUpdate) {
            title = `${log.table} Updated by ${legalName}`;
            description = diffJson(log.oldValue, log.newValue);
        } else if (isCreate) {
            title = `${log.table} Created by ${legalName}`;
            description = '';
        } else if (isDelete) {
            title = `${log.table} Deleted by ${legalName}`;
            description = '';
        }
    }

    if (typeof description !== 'string') {
        description = formatVal(description);
    }

    function formatTime(createdAt) {
        const date = new Date(createdAt);
        const now = new Date();

        const isSameDay =
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth() &&
            date.getDate() === now.getDate();

        if (isSameDay) {
            return timeAgo(date);
        }

        return date.toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    return {
        variant,
        title,
        description,
        timeAgo: formatTime(log.createdAt),
        createdAt: log.createdAt,
        legalName,
    };
}


const renderNotes = async (req, res) => {
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

    const notes = await prisma.note.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
    });


    res.render("notes", { userId, user, profile, personalInfo, contactInfo, notes, activePage: 'profile' });
}

const postNote = async (req, res) => {
    const { text, isPinned } = req.body;
    const userId = req.params.id ?? req.user.user_id;

    if (!text) {
        return res.status(400).json({ error: "Note text is required." });
    }

    const creatorUser = await prisma.user.findUnique({
        where: { user_id: req.user.user_id }
    });

    let creator = creatorUser?.display_name ?? "Administrator User";

    try {
        await prismaContext.run({ userId: req.user.user_id, affectedUserIds: [userId] }, async () => {
            const note = await prisma.note.create({
                data: {
                    userId,
                    text,
                    isPinned: isPinned || false,
                    createdBy: creator
                }
            });
            res.status(201).json(note);
        });
    } catch (error) {
        console.error("Error creating note:", error);
        res.status(500).json({ error: "Failed to create note." });
    }
};

const editNote = async (req, res) => {
    const { noteId } = req.params;
    const { text, isPinned } = req.body;

    if (!text) {
        return res.status(400).json({ error: "Note text is required." });
    }
    if (!noteId) {
        return res.status(400).json({ error: "Note ID is required." });
    }
    const noteToEdit = await prisma.note.findUnique({
        where: { id: noteId }
    });
    if (!noteToEdit) {
        return res.status(404).json({ error: "Note not found." });
    }
    const userId = noteToEdit.userId;

    try {
        await prismaContext.run({ userId: req.user.user_id, affectedUserIds: [userId] }, async () => {
            const note = await prisma.note.update({
                where: { id: noteId },
                data: { text, isPinned: isPinned ?? false }
            });
            res.status(200).json(note);
        });
    } catch (error) {
        console.error("Error updating note:", error);
        res.status(500).json({ error: "Failed to update note." });
    }
};

const deleteNote = async (req, res) => {
    const { noteId } = req.params;

    try {
        await prismaContext.run({ userId: req.user.user_id }, async () => {
            await prisma.note.delete({
                where: { id: noteId }
            });
            res.status(200).json({ message: "Note deleted successfully." });
        });
    } catch (error) {
        console.error("Error deleting note:", error);
        res.status(500).json({ error: "Failed to delete note." });
    }
};

const saveSection = async (req, res) => {
    const { userId, sectionKey, values } = req.body;

    const requesterId = req.user.user_id;

    if (!sectionKey || !values) {
        return res.status(400).json({ success: false, message: "Section key and values are required." });
    }

    if (sectionKey === "personalInfo" && values.dateOfBirth) {
        let dob = values.dateOfBirth;
        if (typeof dob === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
            values.dateOfBirth = new Date(dob).toISOString();
        } else if (dob instanceof Date) {
            values.dateOfBirth = dob.toISOString();
        }
    }

    if (sectionKey === "personalInfo") {
        if ("agency" in values) values.agency = values.agency ?? null;
        if ("franchise" in values) values.franchise = values.franchise ?? null;
    }

    try {
        await prismaContext.run({ requesterId, affectedUserIds: [userId] }, async () => {
            let prevPersonalInfo = null;
            if (sectionKey === "personalInfo") {
                prevPersonalInfo = await prisma.personalInfo.findUnique({ where: { userId } });
            }

            const updatedSection = await prisma[sectionKey].upsert({
                where: { userId },
                update: values,
                create: { userId, ...values },
            });

            if (sectionKey === "personalInfo") {
                const contactType =
                    values.contactType?.toLowerCase() ??
                    prevPersonalInfo?.contactType?.toLowerCase();

                const businessName =
                    values.businessName ?? prevPersonalInfo?.businessName;

                const existingAgency = await prisma.agency.findUnique({
                    where: { owner: userId },
                });

                if (contactType === "business") {
                    if (!existingAgency && businessName) {
                        await prisma.agency.create({
                            data: { owner: userId, name: businessName },
                        });
                    } else if (existingAgency && existingAgency.name !== businessName) {
                        await prisma.agency.update({
                            where: { owner: userId },
                            data: { name: businessName },
                        });
                    }
                } else if (contactType === "individual" && existingAgency) {
                    await prisma.agency.delete({ where: { owner: userId } });
                }
            }

            res.status(200).json({ success: true, data: updatedSection });
        });
    } catch (error) {
        console.error("Error saving section:", error);
        res.status(500).json({ success: false, message: "Failed to save section." });
    }
};


const addCarrierToUser = async (req, res) => {
    const { userId, company, state, status } = req.body;
    const requesterId = req.user.user_id;

    if (!userId || !company || !state || !status) {
        return res.status(400).json({ success: false, message: "All fields are required." });
    }

    try {
        await prismaContext.run({ requesterId, affectedUserIds: [userId] }, async () => {
            const newCarrier = await prisma.statesANDCarriers.create({
                data: {
                    userId,
                    company,
                    state,
                    status
                }
            });
            await prisma.user.update({
                where: { user_id: userId },
                data: { isReleased: false }
            })

            res.status(201).json({ success: true, data: newCarrier });
        });
    } catch (error) {
        console.error("Error adding carrier:", error);
        res.status(500).json({ success: false, message: "Failed to add carrier." });
    }
}

const deleteCarrierToUser = async (req, res) => {
    const { carrierId } = req.params;
    const requesterId = req.user.user_id;

    if (!carrierId) {
        return res.status(400).json({ success: false, message: "Carrier ID is required." });
    }
    try {
        await prismaContext.run({ requesterId, affectedUserIds: [userId] }, async () => {
            const userToUpdate = (await prisma.statesANDCarriers.findUnique({
                where: { id: carrierId }
            }))?.userId;

            await prisma.statesANDCarriers.delete({
                where: { id: carrierId }
            });

            const remainingCarriers = await prisma.statesANDCarriers.findMany({
                where: {
                    id: userToUpdate
                }
            });
            if (remainingCarriers.length === 0) {
                await prisma.user.update({
                    where: { user_id: userToUpdate },
                    data: { isReleased: true }
                });
            }

            res.status(200).json({ success: true, message: "Carrier deleted successfully." });
        });
    } catch (error) {
        console.error("Error deleting carrier:", error);
        res.status(500).json({ success: false, message: "Failed to delete carrier." });
    }
}

const releaseAgent = async (req, res) => {
    const { id } = req.params;

    try {
        await prismaContext.run({ userId: req.user.user_id, affectedUserIds: [id] }, async () => {
            const agent = await prisma.user.findUnique({
                where: { user_id: id }
            });

            if (!agent) {
                return res.status(404).json({ success: false, message: "Agent not found." });
            }

            await prisma.user.update({
                where: { user_id: id },
                data: { isReleased: true }
            });

            await prisma.statesANDCarriers.deleteMany({
                where: { userId: id }
            });

            res.status(200).json({ success: true, message: "Agent released successfully." });
        });

    } catch (error) {
        console.error("Error releasing agent:", error);
        res.status(500).json({ success: false, message: "Failed to release agent." });
    }
}

export {
    renderProfile,
    renderNotes,
    postNote,
    editNote,
    deleteNote,
    saveSection,
    addCarrierToUser,
    deleteCarrierToUser,
    releaseAgent
};
