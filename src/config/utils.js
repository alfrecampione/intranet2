import fs from "fs";
import { prisma, pool } from "../config/dbConfig.js";

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
 * Retrieves the full hierarchy of agencies and franchises above a given agency or franchise.
 * 
 * Starting from the specified agency or franchise, this function traverses upward through
 * parent agencies and franchises until reaching the top-level entity. It returns an ordered
 * list of all related agencies and franchises encountered along the way.
 *
 * @async
 * @param {string|null} agencyId - The starting agency ID (if applicable).
 * @param {string|null} franchiseId - The starting franchise ID (if applicable).
 * @returns {Promise<Array<{ id: string, isAgency: boolean, name: string }>>}
 * A list of parent agencies and franchises, starting from the given entity upward.
 */
async function reverseGetAllAgencies(agencyId, franchiseId) {
    const results = [];
    const agencyCache = new Map();
    const franchiseCache = new Map();

    // Helper to climb up to find the franchise for a given agency
    async function findTopFranchise(aid) {
        let currentAgencyId = aid;

        while (currentAgencyId) {
            let agency = agencyCache.get(currentAgencyId);
            if (!agency) {
                agency = await prisma.agency.findUnique({
                    where: { id: currentAgencyId },
                    include: {
                        user: {
                            include: { personalInfo: true },
                        },
                    },
                });
                agencyCache.set(currentAgencyId, agency);
            }

            if (!agency) break;

            const franchiseId = agency.user?.personalInfo?.franchise || null;
            const parentAgencyId = agency.user?.personalInfo?.agency || null;

            if (franchiseId) {
                // Found the franchise at this level
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

            // Move up the chain
            currentAgencyId = parentAgencyId;
        }

        return null; // No franchise found
    }

    // Now climb the combined chain (agency + franchise)
    while (agencyId || franchiseId) {
        if (agencyId) {
            let agency = agencyCache.get(agencyId);
            if (!agency) {
                agency = await prisma.agency.findUnique({
                    where: { id: agencyId },
                    include: {
                        user: {
                            include: { personalInfo: true },
                        },
                    },
                });
                agencyCache.set(agencyId, agency);
            }

            if (!agency) break;

            // Find the top franchise for this agency
            const underFranchise = await findTopFranchise(agencyId);

            results.push({
                id: agency.id,
                isAgency: true,
                name: agency.name || '',
                underFranchise: underFranchise
                    ? { id: underFranchise.location_id, name: underFranchise.alias || '' }
                    : null,
            });

            // Move up to parent
            agencyId = agency.user?.personalInfo?.agency || null;
            franchiseId = agency.user?.personalInfo?.franchise || null;
        }
        else if (franchiseId) {
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
                underFranchise: null, // top-level franchise
            });

            break;
        }
    }

    return results;
}

async function getVisibleAgentsId(user_id) {
    const user = await prisma.user.findUnique({
        where: { user_id },
        include: { personalInfo: true }
    });
    if (!user) return [];

    let visibleAgents = [];
    if (!user.isAgent) {
        const allAgents = await prisma.user.findMany({
            where: { isAgent: true },
        });
        visibleAgents = allAgents.map(agent => agent.user_id);
    }
    else if (user.personalInfo?.contactType?.toLowerCase() === 'business') {
        const agency = await prisma.agency.findUnique({
            where: { owner: user.user_id },
        });
        if (!agency) return [user.user_id];
        const agencyId = agency.id;

        const allAgencyIds = await getAllAgencyIds(agencyId);
        const agentsInAgencies = await prisma.user.findMany({
            where: {
                isAgent: true,
                personalInfo: { agency: { in: allAgencyIds } }
            },
        });
        visibleAgents = agentsInAgencies.map(agent => agent.user_id);
    }
    else if (user.rights.includes(0)) {
        const allAgents = await prisma.user.findMany({
            where: { isAgent: true },
        });
        visibleAgents = allAgents.map(agent => agent.user_id);
    } else {
        visibleAgents = [user.user_id];
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

export { getCity, getAgencies, getAllAgencyIds, reverseGetAllAgencies, getVisibleAgentsId, normalizeId, fetchCreators, mapNotifications };