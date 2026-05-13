import fs from "fs";
import { prisma, pool } from "../config/dbConfig.js";
import { getSignedS3Url } from "../config/s3Config.js";

const citiesByState = JSON.parse(
    fs.readFileSync("./src/config/US_States_and_Cities.json", "utf8")
);

const getCity = async (req, res) => {
    try {
        const stateAbbr = (req.query.state || "").toUpperCase();

        console.log("Received state abbreviation:", stateAbbr);

        if (!stateAbbr) {
            return res.status(400).json({ error: "Invalid or missing state abbreviation" });
        }

        console.log("Fetching cities for state:", stateAbbr);

        const cities = citiesByState[stateAbbr] || [];

        return res.json(cities.sort());
    } catch (err) {
        console.error("Error fetching cities:", err);
        return res.status(500).json({ error: "Server error" });
    }
};

async function getAgencies() {
    try {
        const agencies = await prisma.agency.findMany({
            orderBy: { name: 'asc' }
        });

        const franchise = await prisma.$queryRaw`
      SELECT * 
      FROM qq.locations 
      WHERE (location_type in (1,2)) AND active = true
      ORDER BY alias ASC
    `;

        const agencyOptions = agencies.map(a => ({
            id: a.id,
            name: a.name,
            isAgency: true,
        }));

        const franchiseOptions = franchise.map(f => ({
            id: f.location_id,
            name: f.alias,
            isAgency: false,
        }));

        const allOptions = [...agencyOptions, ...franchiseOptions];

        return allOptions
    }
    catch (error) {
        console.log(error)
    }
};

/**
 * Recursively retrieves all agency IDs under a given agency,
 * including nested (child) agencies owned by business agents.
 *
 * @async
 * @param {string} agencyId - The ID of the root agency.
 * @returns {Promise<string[]>} A list of all agency IDs (including nested ones).
 */
async function getAllAgencyIds(agencyId) {
    const result = [agencyId];

    const usersUnderAgency = await prisma.user.findMany({
        where: {
            personalInfo: {
                agency: agencyId
            }
        },
        include: {
            personalInfo: true
        }
    });

    for (const u of usersUnderAgency) {
        if (u.isAgent && u.personalInfo?.contactType?.toLowerCase() === 'business') {
            const childAgency = await prisma.agency.findUnique({
                where: { owner: u.user_id }
            });
            if (childAgency) {
                const subAgencies = await getAllAgencyIds(childAgency.id);
                result.push(...subAgencies);
            }
        }
    }

    return result;
};

/**
 * Retrieves the full hierarchy of agencies above a given agency.
 *
 * Starting from the specified agency, this function traverses upward through
 * parent agencies until reaching the top-level entity. It returns an ordered
 * list of all related agencies encountered along the way.
 *
 * @async
 * @param {string|null} agencyId - The starting agency ID (if applicable).
 * @returns {Promise<Array<{ id: string, isAgency: boolean, name: string }>>}
 * A list of parent agencies and franchises, starting from the given entity upward.
 */
async function reverseGetAllAgencies(agencyId, franchiseId, visited = new Set()) {
    const results = [];
    const agencyCache = new Map();
    const franchiseCache = new Map();

    async function findTopFranchise(aid) {
        let currentAgencyId = aid;
        while (currentAgencyId) {
            if (visited.has(currentAgencyId)) break; // prevent loop
            visited.add(currentAgencyId);

            let agency = agencyCache.get(currentAgencyId);
            if (!agency) {
                agency = await prisma.agency.findUnique({
                    where: { id: currentAgencyId },
                    include: { user: { include: { personalInfo: true } } },
                });
                agencyCache.set(currentAgencyId, agency);
            }

            if (!agency) break;

            const franchiseId = agency.user?.personalInfo?.franchise || null;
            const parentAgencyId = agency.user?.personalInfo?.agency || null;

            if (franchiseId) {
                const fid = Number(franchiseId);
                if (isNaN(fid)) return null;

                if (!franchiseCache.has(fid)) {
                    const [franchise] = await prisma.$queryRaw`
                        SELECT location_id, alias 
                        FROM qq.locations 
                        WHERE location_id = ${fid} AND active = true
                    `;
                    franchiseCache.set(fid, franchise);
                }

                return franchiseCache.get(fid);
            }

            currentAgencyId = parentAgencyId;
        }

        return null;
    }

    while (agencyId || franchiseId) {
        if (agencyId) {
            if (visited.has(agencyId)) break; // stop cyclic loop
            visited.add(agencyId);

            let agency = agencyCache.get(agencyId);
            if (!agency) {
                agency = await prisma.agency.findUnique({
                    where: { id: agencyId },
                    include: { user: { include: { personalInfo: true } } },
                });
                agencyCache.set(agencyId, agency);
            }

            if (!agency) break;

            const underFranchise = await findTopFranchise(agencyId);
            results.push({
                id: agency.id,
                isAgency: true,
                name: agency.name || '',
                underFranchise: underFranchise
                    ? { id: underFranchise.location_id, name: underFranchise.alias || '' }
                    : null,
            });

            agencyId = agency.user?.personalInfo?.agency || null;
            franchiseId = agency.user?.personalInfo?.franchise || null;
        } else if (franchiseId) {
            const fid = Number(franchiseId);
            if (isNaN(fid)) break;

            if (!franchiseCache.has(fid)) {
                const [franchise] = await prisma.$queryRaw`
                    SELECT location_id, alias 
                    FROM qq.locations 
                    WHERE location_id = ${fid} AND active = true
                `;
                franchiseCache.set(fid, franchise);
            }

            const franchise = franchiseCache.get(fid);
            results.push({
                id: franchiseId,
                isAgency: false,
                name: franchise?.alias || '',
                underFranchise: null,
            });

            break;
        }
    }

    return results;
}

async function getVisibleAgentsId(requester) {
    if (!requester) return [];

    if (requester.rights && requester.rights.includes(1)) {
        // Admin user - can see all agents
        const allAgents = await prisma.user.findMany({});
        return allAgents.map(agent => agent.user_id);
    }

    let visibleAgents = [];
    if (!requester.isAgent) {
        const allAgents = await prisma.user.findMany({});
        visibleAgents = allAgents.map(agent => agent.user_id);
    }
    else if (requester.personalInfo?.contactType?.toLowerCase() === 'business') {
        const agency = await prisma.agency.findUnique({
            where: { owner: requester.user_id },
        });
        if (!agency) return [requester.user_id];
        const agencyId = agency.id;

        const allAgencyIds = await getAllAgencyIds(agencyId);
        const agencyOwners = await prisma.agency.findMany({
            where: { id: { in: allAgencyIds } },
            select: { owner: true },
        });
        const ownerIds = agencyOwners.map(a => a.owner);
        visibleAgents.push(...ownerIds);
        const agentsInAgencies = await prisma.user.findMany({
            where: {
                isAgent: true,
                personalInfo: { agency: { in: allAgencyIds } }
            },
        });
        visibleAgents = agentsInAgencies.map(agent => agent.user_id);

        // Ensure the agency owner is included in the list
        if (!visibleAgents.includes(requester.user_id)) {
            visibleAgents.push(requester.user_id);
        }
    }
    else {
        visibleAgents = [requester.user_id];
    }
    return visibleAgents;
}

/**
 * Normaliza un ID quitando la parte después del punto (.)
 * Ej: "1234.microsoft" => "1234"
 */
const normalizeId = id => (id ? id.split('.')[0] : id);

/**
 * Fetch creators' display names from Prisma and SQL in a unified way
 */
const fetchCreators = async (creatorIds, prisma, pool) => {
    const normalizedIds = [...new Set(creatorIds.map(normalizeId))].filter(Boolean);

    // Prisma fetch
    const prismaCreators = await prisma.user.findMany({
        where: { user_id: { in: normalizedIds } },
        select: { user_id: true, display_name: true },
    });

    // Determine remaining IDs not found in Prisma
    const remainingIds = normalizedIds.filter(
        id => !prismaCreators.some(p => p.user_id === id)
    );

    // SQL fetch
    let sqlCreators = [];
    if (remainingIds.length > 0) {
        const { rows } = await pool.query(
            `SELECT user_id, display_name
       FROM entra.users
       WHERE split_part(user_id, '.', 1) = ANY($1)`,
            [remainingIds]
        );
        sqlCreators = rows;
    }

    // Merge into map for quick lookup
    const creatorsMap = new Map();
    prismaCreators.forEach(u => creatorsMap.set(u.user_id, u.display_name));
    sqlCreators.forEach(u => creatorsMap.set(u.user_id, u.display_name));

    return creatorsMap;
};

/**
 * Map raw notifications into enriched format
 */
const mapNotifications = (notifications, creatorsMap) =>
    notifications.map(n => {
        const cleanId = normalizeId(n.createdBy);
        return {
            id: n.id,
            userId: n.userId,
            message: n.message,
            isRead: n.isRead,
            createdBy: creatorsMap.get(cleanId) || 'Admin User',
            createdAt: n.createdAt,
        };
    });

function safeParse(json, fallback = null) {
    try {
        return json ? JSON.parse(json) : fallback;
    } catch {
        return fallback;
    }
}

async function createMessage(log, options = {}) {
    if (!log.action) return '';

    const { isForOwner = false, affectedUserName = null } = options;

    const oldObj = safeParse(log.oldValue, null);
    const newObj = safeParse(log.newValue, null);

    const table = (log.table || '').toLowerCase();
    const action = (log.action || '').toLowerCase();

    const isCreate = action.includes('create');
    const isUpdate = action.includes('update');
    const isDelete = action.includes('delete');

    const userId = log.userId;
    let legalName = '(Administrator User)';

    // Try to get name from Prisma personalInfo first
    const personalInfo = await prisma.personalInfo.findUnique({ where: { userId } });
    if (personalInfo?.legalName) {
        legalName = personalInfo.legalName;
    } else {
        // If not found, try to get from entra.users (Microsoft users)
        try {
            const entraUser = await prisma.$queryRaw`
                SELECT display_name
                FROM entra.users
                WHERE user_id = ${userId}
            `;
            if (entraUser && entraUser.length > 0 && entraUser[0].display_name) {
                legalName = entraUser[0].display_name;
            }
        } catch (err) {
            console.warn('Failed to fetch user from entra.users:', err.message);
        }
    }

    let message = '';
    let actionVerb = '';

    if (isCreate) actionVerb = 'created';
    else if (isUpdate) actionVerb = 'updated';
    else if (isDelete) actionVerb = 'deleted';

    // Base emoji depending on action
    const emoji = isCreate ? '🟢' : isUpdate ? '🔵' : '🔴';

    // Determine target label (table and entity name)
    let targetLabel = table;
    if (table.includes('carriers')) {
        const carrierObj = Array.isArray(newObj) ? newObj[0] : newObj || {};
        const companyId = carrierObj?.company ?? null;
        let companyName = '(unknown carrier)';

        // Fetch company name from qq.contacts via externalId
        if (companyId) {
            try {
                const company = await prisma.company.findUnique({
                    where: { id: companyId },
                    select: { externalId: true }
                });
                if (company?.externalId) {
                    const companyNamesMap = await getCompanyNamesMap([company.externalId]);
                    companyName = companyNamesMap.get(company.externalId)?.name ?? '(unknown carrier)';
                }
            } catch (err) {
                console.warn('Failed to fetch company name:', err.message);
            }
        }

        targetLabel = `carrier ${companyName}`;
    } else if (table.includes('user')) {
        targetLabel = 'user';
    }

    // If notification is for the affected user
    if (!isForOwner) {
        message = `${emoji} ${legalName} ${actionVerb} a ${targetLabel}.`;
    }
    // If notification is for owners or higher hierarchy
    else {
        const affectedPart = affectedUserName ? ` in ${affectedUserName}` : '';
        message = `${emoji} ${legalName} ${actionVerb} ${targetLabel}${affectedPart}.`;
    }

    return message;
}

async function getMSAPhotoPath(entraId) {
    const entra_user = await prisma.$queryRaw`
          SELECT s3_url AS photo
          FROM entra.user_avatars
          WHERE entra_id = ${entraId}
        `;
    return (entra_user && entra_user.length > 0) ? entra_user[0].photo : null;
};
async function getEntraId(email) {
    const entra_id = await prisma.$queryRaw`
          SELECT user_id
          FROM entra.users
          WHERE mail = ${email}
        `;
    return (entra_id && entra_id.length > 0) ? entra_id[0].user_id : null;
}

async function resolveActorName(userId) {
    let name = 'Administrator User';

    const user = await prisma.user.findUnique({
        where: { user_id: userId },
        select: { display_name: true },
    });
    if (user?.display_name) return user.display_name;

    try {
        const entraUser = await prisma.$queryRaw`
            SELECT display_name
            FROM entra.users
            WHERE user_id = ${userId}
        `;

        if (entraUser && entraUser[0]?.display_name) {
            name = entraUser[0].display_name;
        }
    } catch (err) {
        console.warn('Failed to fetch user from entra.users:', err.message);
    }

    return name;
}

function getMSARealId(userId) {
    const realId = userId ? userId.split(".")[0] : userId;
    return realId;
};

/**
 * Get company names from qq.contacts by their external IDs
 * @param {Array<number>} externalIds - Array of external IDs to fetch
 * @returns {Promise<Map<number, {name: string, phone: string}>>} Map of externalId to company name and phone
 */
async function getCompanyNamesMap(externalIds) {
    const companyNamesMap = new Map();
    if (externalIds.length > 0) {
        const uniqueExternalIds = [...new Set(externalIds)];
        const availableCompanies = await prisma.$queryRaw`
            SELECT entity_id, display_name, phone
            FROM qq.contacts
            WHERE entity_id = ANY(${uniqueExternalIds}::int[])
        `;

        externalIds.forEach(id => {
            const company = availableCompanies.find(c => c.entity_id === id);
            if (company) {
                companyNamesMap.set(id, { name: company.display_name, phone: company.phone });
            }
        });
    }
    return companyNamesMap;
}

/**
 * Get all companies combining qq.contacts and health schema
 * @returns {Promise<Array>} Array of companies with id, name, iconPath, and States
 */
async function getAllCompanies() {
    // Get companies from health schema
    const healthCompanies = await prisma.company.findMany();

    // Get only the externalIds that exist in health schema
    const externalIds = healthCompanies
        .filter(hc => hc.externalId)
        .map(hc => hc.externalId);

    // Get companies from qq.contacts only for those with externalId in health
    let qqCompanies = [];
    if (externalIds.length > 0) {
        qqCompanies = await prisma.$queryRaw`
            SELECT entity_id, display_name, phone
            FROM qq.contacts
            WHERE entity_id = ANY(${externalIds}::int[])
            ORDER BY display_name ASC
        `;
    }

    // Combine both sources
    const companies = [];

    // Add companies with externalId (from qq.contacts)
    for (const qqComp of qqCompanies) {
        const healthMatch = healthCompanies.find(hc => hc.externalId === qqComp.entity_id);
        if (healthMatch) {
            let iconPath = healthMatch.iconPath || null;
            // Generate signed URL for iconPath if it's from S3
            if (iconPath) {
                iconPath = await getSignedS3Url(iconPath);
            }
            companies.push({
                id: healthMatch.id,
                name: qqComp.display_name,
                phone: qqComp.phone || '',
                iconPath: iconPath,
                States: healthMatch.States || [],
                externalId: qqComp.entity_id
            });
        }
    }

    companies.sort((a, b) => a.name.localeCompare(b.name));
    return companies;
}

async function ensureDefaultUserRecords(userId, options = {}) {
    if (!userId) {
        const error = new Error("userId is required");
        error.status = 400;
        throw error;
    }

    const user = await prisma.user.findUnique({
        where: { user_id: userId },
        select: { user_id: true, email: true },
    });

    if (!user) {
        const error = new Error("User not found");
        error.status = 404;
        throw error;
    }

    const includeEmailRecords = options.includeEmailRecords ?? true;
    const email = options.email ?? user.email ?? null;

    const [personalInfo, contactInfo, paymentMethod, documents, recommendation, necesaryDocs] = await Promise.all([
        prisma.personalInfo.findUnique({ where: { userId } }),
        prisma.contactInfo.findUnique({ where: { userId } }),
        prisma.paymentMethod.findUnique({ where: { userId } }),
        prisma.documents.findUnique({ where: { userId } }),
        prisma.recommendation.findUnique({ where: { userId } }),
        includeEmailRecords && email
            ? prisma.necesaryDocuments.findUnique({ where: { email } })
            : Promise.resolve(null),
    ]);

    const operations = [];
    const created = [];
    const existing = [];
    const skipped = [];

    if (!personalInfo) {
        operations.push(prisma.personalInfo.create({ data: { userId } }));
        created.push("personalInfo");
    } else {
        existing.push("personalInfo");
    }

    if (!contactInfo) {
        operations.push(prisma.contactInfo.create({ data: { userId } }));
        created.push("contactInfo");
    } else {
        existing.push("contactInfo");
    }

    if (!paymentMethod) {
        operations.push(prisma.paymentMethod.create({ data: { userId } }));
        created.push("paymentMethod");
    } else {
        existing.push("paymentMethod");
    }

    if (!documents) {
        operations.push(prisma.documents.create({ data: { userId } }));
        created.push("documents");
    } else {
        existing.push("documents");
    }

    if (!recommendation) {
        operations.push(prisma.recommendation.create({ data: { userId } }));
        created.push("recommendation");
    } else {
        existing.push("recommendation");
    }

    if (includeEmailRecords) {
        if (email) {
            if (!necesaryDocs) {
                operations.push(prisma.necesaryDocuments.create({ data: { email } }));
                created.push("necesaryDocuments");
            } else {
                existing.push("necesaryDocuments");
            }
        } else {
            skipped.push("necesaryDocuments");
        }
    }

    if (operations.length > 0) {
        await prisma.$transaction(operations);
    }

    return {
        userId,
        email,
        created,
        existing,
        skipped,
    };
}

export { getCity, getAgencies, getAllAgencyIds, reverseGetAllAgencies, getVisibleAgentsId, normalizeId, fetchCreators, mapNotifications, createMessage, getMSAPhotoPath, getMSARealId, getEntraId, getAllCompanies, getCompanyNamesMap, resolveActorName, ensureDefaultUserRecords };