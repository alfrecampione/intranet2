import { prisma } from "../config/dbConfig.js";
import { getAllAgencyIds, getVisibleAgentsId, reverseGetAllAgencies, getAllCompanies, getOwnedAgency, getAgencyOwnerIds } from "../config/utils.js";
import { getSignedS3Url } from "../config/s3Config.js";

/* ============================
   UTILITY FUNCTIONS
============================ */

/**
 * Loads agents with their related data. Keeps states/carriers nested per agent.
 * @param {Array<number|string>} agentsIds - List of agent user_ids
 * @returns {Promise<Array>} Array of agent records with nested statesAndCarriers
 */
async function loadAgents(agentsIds) {
    const agents = await prisma.user.findMany({
        where: {
            user_id: { in: agentsIds },
            registrationCompleted: true // render only users who finished onboarding
        },
        include: {
            personalInfo: true,
            contactInfo: true,
            statesAndCarriers: { include: { carrier: true } }
        },
        orderBy: { display_name: 'asc' }
    });

    const mappedAgents = await Promise.all(agents.map(async agent => {
        let photoPath = agent.personalInfo?.photoPath || '';

        // For Microsoft users, fetch photoPath from user_avatars table
        if (agent.email && agent.email.endsWith('@goldentrust.com')) {
            const entra_user = await prisma.$queryRaw`
                SELECT user_id
                FROM entra.users
                WHERE mail = ${agent.email}
            `;

            if (entra_user.length !== 0) {

                const user_avatar_photo_path = await prisma.$queryRaw`
                SELECT s3_url AS photoPath
                FROM entra.user_avatars
                WHERE entra_id = ${entra_user[0].user_id}
            `;
                photoPath = user_avatar_photo_path.length > 0 ? user_avatar_photo_path[0].photoPath : '';
            }
        }

        // Generate signed URL for photoPath if it's from S3
        if (photoPath) {
            photoPath = await getSignedS3Url(photoPath);
        }

        return {
            user_id: agent.user_id,
            name: agent.display_name || '',
            statesAndCarriers: agent.statesAndCarriers,
            agency: agent.personalInfo?.agency || '',
            franchise: agent.personalInfo?.franchise || '',
            businessName: agent.personalInfo?.businessName || '',
            email: agent.email || '',
            number: agent.contactInfo?.personalPhone || '',
            photoPath: photoPath
        };
    }));

    return mappedAgents.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
}

/* ============================
   FILTER HANDLERS
============================ */

/**
 * Handles agency summary filter (no specific agency selected)
 * @param {Array} processedAgents - Array of agent records
 * @returns {Promise<Object>} Summary data with franchise/agency counts
 */
async function handleAgencySummaryFilter(requester) {

    const franchiseAgencyCombination = await getFranchiseAgencyCombinations(requester);

    const franchiseAgentCount = new Map();

    for (const combination of franchiseAgencyCombination) {
        let count = 0;
        for (const agencyEntry of combination.agencies) {
            const agencyId = agencyEntry.agency.id;
            if (agencyId === null || agencyId === undefined) {
                continue;
            }
            const agenciesUnderThis = await getAllAgencyIds(agencyId);
            const agentsInThisAgency = await prisma.personalInfo.count({
                where: { agency: { in: agenciesUnderThis } }
            });
            const ownerIds = await getAgencyOwnerIds(agencyId);
            count += agentsInThisAgency + ownerIds.length;
        }
        franchiseAgentCount.set(combination.franchise.id, count);
    }
    // Build final summary data
    const summaryData = franchiseAgencyCombination.map(combination => ({
        location: combination.franchise.name,
        agencies: combination.agencies.length || 0,
        agents: franchiseAgentCount.get(combination.franchise.id) || 0
    }));

    summaryData.sort((a, b) => a.location.localeCompare(b.location));

    return { summary: summaryData, total: summaryData.length };
}

/**
 * Handles status & carrier filter
 * @param {Array} processedAgents - Array of agent records
 * @param {string} status - Status filter value
 * @param {string|null|undefined} carrierId - Carrier id filter value (optional)
 * @returns {Array} Filtered agents
 */
function handleStatusCarrierFilter(processedAgents, status, carrierId) {
    return processedAgents.filter(agent => {
        if (!Array.isArray(agent.statesAndCarriers)) return false;
        return agent.statesAndCarriers.some(sc => {
            if (sc.status !== status) return false;
            if (!carrierId) return true;
            return sc.company === carrierId || sc.carrier?.id === carrierId;
        });
    });
}

/**
 * Handles carrier & state filter
 * @param {Array} processedAgents - Array of agent records
 * @param {string} state - State filter value
 * @param {string|null|undefined} carrierId - Carrier id filter value (optional)
 * @returns {Array} Filtered agents
 */
function handleCarrierStateFilter(processedAgents, state, carrierId) {
    // Match agents that have at least one state/carrier record with both values
    // sc.company stores the carrier id; fallback to relation id just in case
    return processedAgents.filter(agent => {
        if (!Array.isArray(agent.statesAndCarriers)) return false;
        return agent.statesAndCarriers.some(sc => {
            if (sc.state !== state) return false;
            // If no carrier provided, match by state only
            if (!carrierId) return true;
            return sc.company === carrierId || sc.carrier?.id === carrierId;
        });
    });
}

/**
 * Handles agency filter (specific agency/franchise selected)
 * @param {Array} processedAgents - Array of agent records
 * @param {string} filterValue - Primary filter value (franchise)
 * @param {string} filterSubValue - Secondary filter value (agency under franchise)
 * @returns {Promise<Array>} Filtered agents
 */
async function handleAgencyFilter(locationIds, franchiseMap = new Map()) {
    const franchises = Array.isArray(locationIds) ? locationIds : [locationIds];
    const validFranchises = franchises.filter(Boolean);

    if (validFranchises.length === 0) {
        return [];
    }

    const collectedAgents = [];

    for (const franchiseId of validFranchises) {
        const topAgents = await prisma.user.findMany({
            include: {
                personalInfo: true,
                contactInfo: true,
            },
            where: {
                personalInfo: {
                    franchise: franchiseId
                },
                registrationCompleted: true
            }
        });

        const topAgencyIds = topAgents
            .map(agent => agent.personalInfo?.agency)
            .filter(id => id != null);

        const allAgencyIds = [];
        for (const agencyId of topAgencyIds) {
            const subAgencyIds = await getAllAgencyIds(agencyId);
            allAgencyIds.push(...subAgencyIds);
        }

        const agentsInAgencies = await prisma.user.findMany({
            include: {
                personalInfo: true,
                contactInfo: true,
            },
            where: {
                personalInfo: {
                    agency: { in: allAgencyIds }
                },
                registrationCompleted: true
            }
        });

        collectedAgents.push(...topAgents, ...agentsInAgencies);
    }

    // Remove duplicates by user_id
    const uniqueAgents = Array.from(new Map(collectedAgents.map(a => [a.user_id, a])).values());

    // Map agency ids to names for quick lookup (normalize to avoid string/number mismatches)
    const agencyIds = uniqueAgents
        .map(agent => agent.personalInfo?.agency)
        .filter(id => id !== null && id !== undefined)
        .map(id => String(id).trim())
        .filter(Boolean);

    const agencyMap = new Map();
    if (agencyIds.length > 0) {
        const uniqueAgencyIds = Array.from(new Set(agencyIds));
        const agencies = await prisma.agency.findMany({
            where: { id: { in: uniqueAgencyIds } },
            select: { id: true, name: true }
        });
        agencies.forEach(a => agencyMap.set(String(a.id), a.name || ''));
    }

    return await Promise.all(uniqueAgents.map(async agent => {
        let photoPath = agent.personalInfo?.photoPath || '';
        // Always display the franchise name in the agency column
        let agencyName = franchiseMap.get(String(agent.personalInfo?.franchise ?? '')) || '';

        // No logging; agencyName uses franchise fallback

        // For Microsoft users, fetch photoPath from user_avatars table
        if (agent.email && agent.email.endsWith('@goldentrust.com')) {
            const entra_user = await prisma.$queryRaw`
                SELECT user_id
                FROM entra.users
                WHERE mail = ${agent.email}
            `;

            if (entra_user.length !== 0) {
                const user_avatar_photo_path = await prisma.$queryRaw`
                    SELECT s3_url AS photoPath
                    FROM entra.user_avatars
                    WHERE entra_id = ${entra_user[0].user_id}
                `;
                photoPath = user_avatar_photo_path.length > 0 ? user_avatar_photo_path[0].photoPath : '';
            }
        }

        // Generate signed URL for photoPath if it's from S3
        if (photoPath) {
            photoPath = await getSignedS3Url(photoPath);
        }

        return {
            user_id: agent.user_id,
            name: agent.display_name || '',
            email: agent.email || '',
            number: agent.contactInfo?.personalPhone || '',
            photoPath: photoPath,
            agencyName
        };
    }));
}

/**
 * Handles agency filter by actual agency ID(s)
 * @param {Array<string>} agencyIds - List of agency IDs to filter by
 * @returns {Promise<Array>} Filtered agents with agencyName
 */
async function handleAgencyByIdFilter(agencyIds) {
    const ids = Array.isArray(agencyIds) ? agencyIds : [agencyIds];
    const validIds = ids.filter(Boolean);

    if (validIds.length === 0) return [];

    // Expand each selected agency to include all sub-agencies recursively
    const allAgencyIds = [];
    for (const agencyId of validIds) {
        const subIds = await getAllAgencyIds(agencyId);
        allAgencyIds.push(...subIds);
    }

    const uniqueAgencyIds = Array.from(new Set(allAgencyIds));

    // Build agency name map and collect owner user_ids
    const agencyMap = new Map();   // agencyId -> agencyName
    const ownerMap = new Map();    // ownerUserId -> agencyName (the agency they own)
    if (uniqueAgencyIds.length > 0) {
        const agencies = await prisma.agency.findMany({
            where: { id: { in: uniqueAgencyIds } },
            select: { id: true, name: true, owner: true }
        });
        agencies.forEach(a => {
            agencyMap.set(String(a.id), a.name || '');
            if (a.owner) ownerMap.set(String(a.owner), a.name || '');
        });
    }

    // Fetch agents who belong to any of these agencies (members)
    const memberAgents = await prisma.user.findMany({
        include: { personalInfo: true, contactInfo: true },
        where: {
            personalInfo: { agency: { in: uniqueAgencyIds } },
            registrationCompleted: true
        }
    });

    // Fetch agency owners who are not already captured as members
    const memberIds = new Set(memberAgents.map(a => String(a.user_id)));
    const ownerUserIds = Array.from(ownerMap.keys()).filter(id => !memberIds.has(id));

    const ownerAgents = ownerUserIds.length > 0
        ? await prisma.user.findMany({
            include: { personalInfo: true, contactInfo: true },
            where: {
                user_id: { in: ownerUserIds },
                registrationCompleted: true
            }
        })
        : [];

    // Fetch co-owners of any of these agencies
    const coOwnerRecords = await prisma.agencyCoOwner.findMany({
        where: { agencyId: { in: uniqueAgencyIds } },
        select: { userId: true, agencyId: true }
    });
    const seenIds = new Set([...memberIds, ...ownerUserIds]);
    const coOwnerUserIds = coOwnerRecords
        .filter(r => !seenIds.has(String(r.userId)))
        .map(r => r.userId);

    const coOwnerAgencyMap = new Map(); // userId -> agencyName for co-owners
    coOwnerRecords.forEach(r => {
        if (!seenIds.has(String(r.userId))) {
            coOwnerAgencyMap.set(String(r.userId), agencyMap.get(String(r.agencyId)) || '');
        }
    });

    const coOwnerAgents = coOwnerUserIds.length > 0
        ? await prisma.user.findMany({
            include: { personalInfo: true, contactInfo: true },
            where: {
                user_id: { in: coOwnerUserIds },
                registrationCompleted: true
            }
        })
        : [];

    const agents = [...memberAgents, ...ownerAgents, ...coOwnerAgents];

    return await Promise.all(agents.map(async agent => {
        let photoPath = agent.personalInfo?.photoPath || '';
        // Show the agent's own agency name; fall back to owned agency or co-owned agency
        const agencyName =
            agencyMap.get(String(agent.personalInfo?.agency ?? '')) ||
            ownerMap.get(String(agent.user_id)) ||
            coOwnerAgencyMap.get(String(agent.user_id)) ||
            '';

        if (agent.email && agent.email.endsWith('@goldentrust.com')) {
            const entra_user = await prisma.$queryRaw`
                SELECT user_id
                FROM entra.users
                WHERE mail = ${agent.email}
            `;
            if (entra_user.length !== 0) {
                const user_avatar_photo_path = await prisma.$queryRaw`
                    SELECT s3_url AS photoPath
                    FROM entra.user_avatars
                    WHERE entra_id = ${entra_user[0].user_id}
                `;
                photoPath = user_avatar_photo_path.length > 0 ? user_avatar_photo_path[0].photoPath : '';
            }
        }

        if (photoPath) {
            photoPath = await getSignedS3Url(photoPath);
        }

        return {
            user_id: agent.user_id,
            name: agent.display_name || '',
            email: agent.email || '',
            number: agent.contactInfo?.personalPhone || '',
            photoPath,
            agencyName
        };
    }));
}

/**
 * Handles generic single-field filter
 * @param {Array} processedAgents - Array of agent records
 * @param {string} filterType - Field name to filter on
 * @param {string} filterValue - Value to match
 * @returns {Array} Filtered agents
 */
function handleGenericFilter(processedAgents, filterType, filterValue) {
    // Handle nested statesAndCarriers fields for common filters
    if (filterType === 'status') {
        return processedAgents.filter(agent =>
            Array.isArray(agent.statesAndCarriers) &&
            agent.statesAndCarriers.some(sc => sc.status === filterValue)
        );
    }
    if (filterType === 'state') {
        return processedAgents.filter(agent =>
            Array.isArray(agent.statesAndCarriers) &&
            agent.statesAndCarriers.some(sc => sc.state === filterValue)
        );
    }
    if (filterType === 'carrier') {
        return processedAgents.filter(agent =>
            Array.isArray(agent.statesAndCarriers) &&
            agent.statesAndCarriers.some(sc => sc.company === filterValue || sc.carrier?.id === filterValue)
        );
    }
    // Primitive top-level agent fields
    return processedAgents.filter(agent => agent[filterType] === filterValue);
}

async function getStatesAndCarriers() {
    const statesAndCarriers = await getAllCompanies();

    // Extract unique states
    const states = statesAndCarriers.map(item => item.States).flat();
    const uniqueStates = new Set(states);
    const sortedStates = Array.from(uniqueStates).sort();

    // Extract carriers with id and name
    const carriers = statesAndCarriers
        .map(item => ({ id: item.id, name: item.name || '' }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return { states: sortedStates, carriers };
};

async function getStatuses() {
    const statuses = await prisma.statesANDCarriers.findMany({
        select: { status: true },
    });

    // Extract unique statuses
    const uniqueStatuses = new Set(statuses.map(item => item.status).filter(Boolean));
    return Array.from(uniqueStatuses).sort();
};

async function getFranchiseAgencyCombinations(requester) {
    let franchises;
    const franchiseAgencyCombination = {};

    if (!requester.isAgent || requester.rights.includes(1)) {
        franchises = await prisma.$queryRaw`
            SELECT location_id, alias
            FROM qq.locations
            WHERE active = true
        `;

        for (const franchise of franchises) {
            const agencyOwners = await prisma.personalInfo.findMany({
                where: { franchise: `${franchise.location_id}` }
            });

            const ownerUserIds = agencyOwners.map(a => a.userId);

            // Agencies where these users are primary owner OR co-owner
            const topAgencies = await prisma.agency.findMany({
                where: {
                    OR: [
                        { owner: { in: ownerUserIds } },
                        { coOwners: { some: { userId: { in: ownerUserIds } } } }
                    ]
                }
            });

            // For each top agency in this franchise, get all sub-agencies
            const allAgenciesForFranchise = [];
            for (const agency of topAgencies) {
                const underAgenciesId = await getAllAgencyIds(agency.id);
                const underAgencies = await prisma.agency.findMany({
                    where: {
                        id: { in: underAgenciesId }
                    }
                });
                allAgenciesForFranchise.push(...underAgencies);
            }

            franchiseAgencyCombination[franchise.location_id] = allAgenciesForFranchise;
        }

    } else if (requester.personalInfo?.contactType === 'business') {
        const upperHierarchy = await reverseGetAllAgencies(requester.personalInfo?.agency, requester.personalInfo?.franchise);

        const topFranchise = upperHierarchy.find(h => !h.isAgency);
        if (!topFranchise) {
            return [];
        }

        franchises = await prisma.$queryRaw`
            SELECT location_id, alias
            FROM qq.locations
            WHERE location_id = ${topFranchise.id} AND active = true
        `;

        const topAgency = await getOwnedAgency(requester.user_id);

        if (topAgency) {
            const underAgenciesId = await getAllAgencyIds(topAgency.id);
            const underAgencies = await prisma.agency.findMany({
                where: {
                    id: { in: underAgenciesId }
                }
            });
            franchiseAgencyCombination[topFranchise.id] = underAgencies;
        } else {
            franchiseAgencyCombination[topFranchise.id] = [];
        }
    } else {
        return [];
    }

    // Transform to array format
    const result = [];
    for (const franchise of franchises) {
        const agencies = franchiseAgencyCombination[franchise.location_id] || [];
        result.push({
            franchise: {
                id: franchise.location_id,
                name: franchise.alias
            },
            agencies: agencies.map(agency => ({
                agency: {
                    id: agency.id,
                    name: agency.name
                }
            }))
        });
    }

    return result;
}
async function getAgentsToRender(requester) {
    const visibleAgentsId = await getVisibleAgentsId(requester);
    const processedAgents = await loadAgents(visibleAgentsId);
    return processedAgents;
}

/* ============================
   ROUTE HANDLERS
============================ */

const renderReports = async (req, res) => {
    const user = req.user;

    const carrierStateCombination = await getStatesAndCarriers();
    const stateFilterValue = carrierStateCombination.states;
    const carrierFilterValue = carrierStateCombination.carriers;

    const statusFilterValue = await getStatuses();

    const franchiseAgencyCombination = await getFranchiseAgencyCombinations(user);

    // Sort franchises alphabetically by name
    const franchiseFilterValue = franchiseAgencyCombination
        .map(item => item.franchise)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Sort agencies alphabetically by name and remove duplicates
    let agencyFilterValue = franchiseAgencyCombination.flatMap(item => item.agencies.map(a => a.agency));

    // Remove duplicates by id and sort by name
    const uniqueAgencies = Array.from(
        new Map(agencyFilterValue.map(a => [a.id, a])).values()
    ).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    res.render("reports", {
        user,
        filters: {
            state: stateFilterValue,
            carrier: carrierFilterValue,
            carrierState: carrierStateCombination,
            status: statusFilterValue,
            franchise: franchiseFilterValue,
            agency: uniqueAgencies,
            franchiseAgencyCombination: franchiseAgencyCombination,
        },
        activePage: 'reports'
    });
};

/**
 * Handles filter requests and returns filtered data
 */
const filterReport = async (req, res) => {
    const { filterType, filterSubValue } = req.query;
    const rawFilterValue = req.query.filterValue;
    const filterValues = Array.isArray(rawFilterValue)
        ? rawFilterValue
        : (rawFilterValue ? [rawFilterValue] : []);
    const singleFilterValue = filterValues[0];

    const user = req.user;
    let processedAgents = await getAgentsToRender(user);

    // Handle empty or null filter type - return all agents
    if (!filterType || filterType === null || filterType === undefined) {
        return res.json({ data: processedAgents, total: processedAgents.length });
    }

    // Apply appropriate filter
    if (filterType === 'location') {
        const franchiseAgencyCombination = await getFranchiseAgencyCombinations(user);
        const franchiseMap = new Map(
            franchiseAgencyCombination.map(item => [String(item.franchise.id), item.franchise.name || ''])
        );

        if (filterValues.length === 0) {
            const result = await handleAgencySummaryFilter(user);
            return res.json(result);
        }

        processedAgents = await handleAgencyFilter(filterValues, franchiseMap);
    }
    else if (filterType === 'agency') {
        if (filterValues.length === 0) {
            return res.json({ data: [], total: 0 });
        }
        processedAgents = await handleAgencyByIdFilter(filterValues);
    }
    else if (filterType === 'carrier & state' && singleFilterValue) {
        // If carrier is empty, fallback to state-only filter
        processedAgents = handleCarrierStateFilter(processedAgents, singleFilterValue, filterSubValue || null);
    }
    else if (filterType === 'status & carrier' && singleFilterValue) {
        processedAgents = handleStatusCarrierFilter(processedAgents, singleFilterValue, filterSubValue || null);
    }
    else if (filterType && singleFilterValue) {
        processedAgents = handleGenericFilter(processedAgents, filterType, singleFilterValue);
    }
    // If filterType is set but filterValue is empty, return all agents (no filtering applied)

    res.json({ data: processedAgents, total: processedAgents.length });
};

/**
 * Exports data as CSV
 */
const exportData = async (req, res) => {
    try {
        const { headers = [], rows = [], summaryRows = [] } = req.body;

        const escapeVal = (value) => {
            let v = String(value ?? '').replace(/"/g, '""');
            if (v.includes(',') || v.includes('"') || v.includes('\n')) v = `"${v}"`;
            return v;
        };

        const lines = [];

        summaryRows.forEach(row => lines.push(row.map(escapeVal).join(',')));

        lines.push(headers.join(','));
        rows.forEach(row => {
            lines.push(row.map(value => {
                if (typeof value === 'string') {
                    let v = value.replace(/"/g, '""');
                    if (v.includes(',') || v.includes('"') || v.includes('\n')) v = `"${v}"`;
                    return v;
                }
                return value ?? '';
            }).join(','));
        });

        const BOM = '\uFEFF';
        const csvContent = BOM + lines.join('\n');

        res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.send(csvContent);
    } catch (err) {
        console.error('CSV export failed:', err);
        res.status(500).send('Error exporting CSV');
    }
};

export { renderReports, filterReport, exportData };