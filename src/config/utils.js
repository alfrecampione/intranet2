import fs from "fs";
import { prisma, pool } from "../config/dbConfig.js";
import { getSignedS3Url } from "../config/s3Config.js";

const citiesByState = JSON.parse(
    fs.readFileSync("./src/config/US_States_and_Cities.json", "utf8")
);


const STATE_ABBR_TO_NAME = {
    al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas",
    ca: "california", co: "colorado", ct: "connecticut", de: "delaware",
    fl: "florida", ga: "georgia", hi: "hawaii", id: "idaho",
    il: "illinois", in: "indiana", ia: "iowa", ks: "kansas",
    ky: "kentucky", la: "louisiana", me: "maine", md: "maryland",
    ma: "massachusetts", mi: "michigan", mn: "minnesota", ms: "mississippi",
    mo: "missouri", mt: "montana", ne: "nebraska", nv: "nevada",
    nh: "new hampshire", nj: "new jersey", nm: "new mexico", ny: "new york",
    nc: "north carolina", nd: "north dakota", oh: "ohio", ok: "oklahoma",
    or: "oregon", pa: "pennsylvania", ri: "rhode island", sc: "south carolina",
    sd: "south dakota", tn: "tennessee", tx: "texas", ut: "utah",
    vt: "vermont", va: "virginia", wa: "washington", wv: "west virginia",
    wi: "wisconsin", wy: "wyoming",
};

const getCity = async (req, res) => {
    try {
        const stateAbbr = (req.query.state || "").toLowerCase();

        if (!stateAbbr || !STATE_ABBR_TO_NAME[stateAbbr]) {
            return res.status(400).json({ error: "Invalid or missing state abbreviation" });
        }

        const stateName = STATE_ABBR_TO_NAME[stateAbbr];
        const cities = citiesByState[stateName.charAt(0).toUpperCase() + stateName.slice(1)] || [];

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
      WHERE location_type = 2 OR location_id = 1
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
                        WHERE location_id = ${fid}
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
                    WHERE location_id = ${fid}
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
    const personalInfo = await prisma.personalInfo.findUnique({ where: { userId } });
    const legalName = personalInfo?.legalName || '(Administrator User)';

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

        // Fetch company name from ID
        if (companyId) {
            try {
                const company = await prisma.company.findUnique({
                    where: { id: companyId },
                    select: { name: true }
                });
                companyName = company?.name ?? '(unknown carrier)';
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

function getMSARealId(userId) {
    const realId = userId ? userId.split(".")[0] : userId;
    return realId;
};

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

export { getCity, getAgencies, getAllAgencyIds, reverseGetAllAgencies, getVisibleAgentsId, normalizeId, fetchCreators, mapNotifications, createMessage, getMSAPhotoPath, getMSARealId, getEntraId, getAllCompanies };