import { prisma } from "../config/dbConfig.js";
import { getAllAgencyIds, getVisibleAgentsId, reverseGetAllAgencies } from "../config/utils.js";

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
        where: { user_id: { in: agentsIds } },
        include: {
            personalInfo: true,
            contactInfo: true,
            statesAndCarriers: true
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
                where: {
                    agency: { in: agenciesUnderThis },
                }
            });
            count += agentsInThisAgency + 1; // +1 for agency owner
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
 * Handles carrier & state filter
 * @param {Array} processedAgents - Array of agent records
 * @param {string} state - State filter value
 * @param {string} carrier - Carrier filter value
 * @returns {Array} Filtered agents
 */
function handleCarrierStateFilter(processedAgents, state, carrier) {
    // Match agents that have at least one state/carrier record with both values
    return processedAgents.filter(agent =>
        Array.isArray(agent.statesAndCarriers) &&
        agent.statesAndCarriers.some(sc => sc.state === state && sc.company === carrier)
    );
}

/**
 * Handles agency filter (specific agency/franchise selected)
 * @param {Array} processedAgents - Array of agent records
 * @param {string} filterValue - Primary filter value (franchise)
 * @param {string} filterSubValue - Secondary filter value (agency under franchise)
 * @returns {Promise<Array>} Filtered agents
 */
async function handleAgencyFilter(filterValue, filterSubValue) {
    if (filterSubValue == null || filterSubValue === '') {
        const topAgents = await prisma.user.findMany({
            include: {
                personalInfo: true,
                contactInfo: true,
            },
            where: {
                personalInfo: {
                    franchise: filterValue
                },
            }
        });
        const topAgencyIds = topAgents.filter(agent => agent.agency != null).map(agent => agent.agency);

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
            }
        });

        const allAgents = topAgents.concat(agentsInAgencies);

        return allAgents.map(agent => ({
            user_id: agent.user_id,
            name: agent.display_name || '',
            email: agent.email || '',
            number: agent.contactInfo?.personalPhone || ''
        }));

    } else {
        const allAgencyIds = await getAllAgencyIds(filterSubValue);
        const agentsInAgencies = await prisma.user.findMany({
            include: {
                personalInfo: true,
                contactInfo: true,
            },
            where: {
                personalInfo: {
                    agency: { in: allAgencyIds }
                },
            }
        });
        const allAgents = agentsInAgencies;

        const owner = await prisma.agency.findUnique({
            where: { id: filterSubValue },
            select: { owner: true }
        });
        if (owner) {
            const ownerAgent = await prisma.user.findUnique({
                where: { user_id: owner.owner },
                include: {
                    personalInfo: true,
                    contactInfo: true,
                }
            });
            if (ownerAgent) {
                allAgents.push(ownerAgent);
            }
        }

        return allAgents.map(agent => ({
            user_id: agent.user_id,
            name: agent.display_name || '',
            email: agent.email || '',
            number: agent.contactInfo?.personalPhone || ''
        }));
    }
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
            agent.statesAndCarriers.some(sc => sc.company === filterValue)
        );
    }
    // Primitive top-level agent fields
    return processedAgents.filter(agent => agent[filterType] === filterValue);
}

async function getStatesAndCarriers() {
    const statesAndCarriers = await prisma.company.findMany({
        select: { States: true, name: true },
        orderBy: { name: 'asc' },
    });

    // Extract unique states
    const states = statesAndCarriers.map(item => item.States).flat();
    const uniqueStates = new Set(states);
    const sortedStates = Array.from(uniqueStates).sort();

    // Extract unique carriers
    const carriers = statesAndCarriers.map(item => item.name).sort();

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
        `;

        for (const franchise of franchises) {
            const agencyOwners = await prisma.personalInfo.findMany({
                where: {
                    franchise: `${franchise.location_id}`
                }
            });

            const topAgencies = await prisma.agency.findMany({
                where: {
                    owner: {
                        in: agencyOwners.map(a => a.userId)
                    }
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
            WHERE location_id = ${topFranchise.id}
        `;

        const topAgency = await prisma.agency.findUnique({
            where: {
                owner: requester.user_id
            }
        });

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
    const { filterType, filterValue, filterSubValue } = req.query;
    const user = req.user;
    let processedAgents = await getAgentsToRender(user);

    if (filterType === null || filterType === undefined) {
        return res.json({ data: processedAgents, total: processedAgents.length });
    }

    // Apply appropriate filter
    if (filterType === 'agency' && !filterValue && !filterSubValue) {
        const result = await handleAgencySummaryFilter(user);
        return res.json(result);
    }
    else if (filterType === 'carrier & state' && filterValue && filterSubValue) {
        processedAgents = handleCarrierStateFilter(processedAgents, filterValue, filterSubValue);
    }
    else if (filterType === 'agency' && (filterValue || filterSubValue)) {
        processedAgents = await handleAgencyFilter(filterValue, filterSubValue);
    }
    else if (filterType && filterValue) {
        processedAgents = handleGenericFilter(processedAgents, filterType, filterValue);
    }

    res.json({ data: processedAgents, total: processedAgents.length });
};

/**
 * Exports data as CSV
 */
const exportData = async (req, res) => {
    try {
        const { headers = [], rows = [] } = req.body;

        // Build CSV content
        const headerRow = headers.join(',');
        const dataRows = rows.map(row => {
            const csvRow = row.map(value => {
                if (typeof value === 'string') {
                    // Escape quotes and wrap in quotes if needed
                    let v = value.replace(/"/g, '""');
                    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
                        v = `"${v}"`;
                    }
                    return v;
                }
                return value ?? '';
            });
            return csvRow.join(',');
        });

        const csvContent = [headerRow, ...dataRows].join('\n');

        // Set headers for download
        res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.send(csvContent);
    } catch (err) {
        console.error('CSV export failed:', err);
        res.status(500).send('Error exporting CSV');
    }
};

export { renderReports, filterReport, exportData };