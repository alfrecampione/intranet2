import { get } from "http";
import { prisma } from "../config/dbConfig.js";
import { getAllAgencyIds, reverseGetAllAgencies } from "../config/utils.js";

/* ============================
   UTILITY FUNCTIONS
============================ */

/**
 * Loads agents with their related data and flattens state/carrier records
 * @param {Object} where - Prisma where clause
 * @returns {Promise<Array>} Flattened array of agent records with state/carrier info
 */
async function loadAgents(where = {}) {
    const agents = await prisma.user.findMany({
        where: { ...where },
        include: {
            personalInfo: true,
            contactInfo: true,
            statesAndCarriers: true
        },
        orderBy: { display_name: 'asc' }
    });

    const flattened = agents.flatMap(agent =>
        agent.statesAndCarriers.map(record => ({
            user_id: agent.user_id,
            name: agent.display_name || '',
            state: record.state || '',
            carrier: record.company || '',
            status: record.status || '',
            agency: agent.personalInfo?.agency || '',
            franchise: agent.personalInfo?.franchise || '',
            businessName: agent.personalInfo?.businessName || '',
            email: agent.email || '',
            number: agent.contactInfo?.personalPhone || ''
        }))
    );

    return flattened.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
}

/**
 * Returns unique values from array with optional composite key support
 * @param {Array} arr - Array of items (primitives or objects)
 * @param {Array<string>} keys - Keys for objects to determine uniqueness
 * @returns {Array} Unique and sorted array
 */
function getUnique(arr, keys = []) {
    if (!arr?.length) return [];

    // Handle primitive arrays
    if (!keys.length) {
        return [...new Set(arr.filter(Boolean))].sort((a, b) => {
            if (typeof a === 'string' && typeof b === 'string') {
                return a.localeCompare(b);
            }
            return a - b;
        });
    }

    // Handle object arrays with composite keys
    const seen = new Set();
    const result = [];

    for (const item of arr) {
        const compositeKey = keys.map(k => item[k] ?? '').join('|');
        if (!seen.has(compositeKey)) {
            seen.add(compositeKey);
            result.push(item);
        }
    }

    // Sort by first key
    const firstKey = keys[0];
    result.sort((a, b) => {
        if (!a[firstKey]) return 1;
        if (!b[firstKey]) return -1;
        if (typeof a[firstKey] === 'string' && typeof b[firstKey] === 'string') {
            return a[firstKey].localeCompare(b[firstKey]);
        }
        return a[firstKey] - b[firstKey];
    });

    return result;
}

/**
 * Extracts unique simple values from array of objects
 * @param {Array} arr - Array of objects
 * @param {string} key - Key to extract
 * @returns {Array} Sorted unique values
 */
function getUniqueSimple(arr, key) {
    return [...new Set(arr.map(i => i[key]).filter(Boolean))].sort();
}

/**
 * Removes duplicate agents by user_id
 * @param {Array} agents - Array of agent records
 * @returns {Array} Unique agents
 */
function deduplicateAgents(agents) {
    const seen = new Set();
    return agents.filter(agent => {
        if (seen.has(agent.user_id)) return false;
        seen.add(agent.user_id);
        return true;
    });
}

/**
 * Builds where clause for agency-restricted queries
 * Restricts data based on user's agency ownership
 * @param {Object} user - Current user object
 * @returns {Promise<Object>} Prisma where clause
 */
async function buildAgencyWhereClause(user) {
    if (!user?.isAgent || user.rights.includes(1)) {
        return {};
    }

    const agency = await prisma.agency.findUnique({
        where: { owner: user.user_id }
    });

    if (!agency) return {};

    const allAgencyIds = await getAllAgencyIds(agency.id);

    return {
        OR: [
            {
                personalInfo: {
                    is: { agency: { in: allAgencyIds } }
                }
            },
            { user_id: user.user_id }
        ]
    };
}

/* ============================
   FILTER HANDLERS
============================ */

/**
 * Handles agency summary filter (no specific agency selected)
 * @param {Array} processedAgents - Array of agent records
 * @returns {Promise<Object>} Summary data with franchise/agency counts
 */
async function handleAgencySummaryFilter(processedAgents) {
    const franchiseAgentCount = new Map();
    const franchiseAgencySet = new Map();
    const uniqueAgents = deduplicateAgents(processedAgents);

    // Get unique combinations to minimize queries
    const uniqueCombinations = new Map();
    uniqueAgents.forEach(agent => {
        const key = `${agent.agency || 'none'}-${agent.franchise || 'none'}`;
        if (!uniqueCombinations.has(key)) {
            uniqueCombinations.set(key, {
                agency: agent.agency,
                franchise: agent.franchise,
                agents: []
            });
        }
        uniqueCombinations.get(key).agents.push(agent);
    });

    // Batch process hierarchies
    const hierarchyPromises = Array.from(uniqueCombinations.values()).map(
        ({ agency, franchise }) => reverseGetAllAgencies(agency, franchise)
    );

    const hierarchies = await Promise.all(hierarchyPromises);

    // Process results
    Array.from(uniqueCombinations.keys()).forEach((key, index) => {
        const hierarchy = hierarchies[index];
        const { agents } = uniqueCombinations.get(key);
        const topFranchise = hierarchy.find(h => !h.isAgency);

        if (topFranchise) {
            const franchiseName = topFranchise.name;

            // Count agents
            franchiseAgentCount.set(
                franchiseName,
                (franchiseAgentCount.get(franchiseName) || 0) + agents.length
            );

            // Track unique agencies
            if (!franchiseAgencySet.has(franchiseName)) {
                franchiseAgencySet.set(franchiseName, new Set());
            }
            const agencySet = franchiseAgencySet.get(franchiseName);
            hierarchy.filter(h => h.isAgency).forEach(a => agencySet.add(a.name));
        }
    });

    // Build summary
    const summaryData = Array.from(franchiseAgentCount.keys()).map(franchiseName => ({
        location: franchiseName,
        agencies: franchiseAgencySet.get(franchiseName)?.size || 0,
        agents: franchiseAgentCount.get(franchiseName) || 0
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
    return processedAgents.filter(
        agent => agent.state === state && agent.carrier === carrier
    );
}

/**
 * Handles agency filter (specific agency/franchise selected)
 * @param {Array} processedAgents - Array of agent records
 * @param {string} filterValue - Primary filter value (franchise)
 * @param {string} filterSubValue - Secondary filter value (agency under franchise)
 * @returns {Promise<Array>} Filtered agents
 */
async function handleAgencyFilter(processedAgents, filterValue, filterSubValue) {
    const matchingAgents = [];

    // Get unique combinations to minimize queries
    const uniqueCombinations = new Map();
    processedAgents.forEach(agent => {
        const key = `${agent.agency || 'none'}-${agent.franchise || 'none'}`;
        if (!uniqueCombinations.has(key)) {
            uniqueCombinations.set(key, {
                agency: agent.agency,
                franchise: agent.franchise,
                agents: []
            });
        }
        uniqueCombinations.get(key).agents.push(agent);
    });

    // Batch process hierarchies
    const hierarchyPromises = Array.from(uniqueCombinations.values()).map(
        ({ agency, franchise }) => reverseGetAllAgencies(agency, franchise)
    );

    const hierarchies = await Promise.all(hierarchyPromises);

    // Process each unique combination
    Array.from(uniqueCombinations.keys()).forEach((key, index) => {
        const hierarchy = hierarchies[index];
        const { agents } = uniqueCombinations.get(key);

        for (const agent of agents) {
            // If both filterValue and filterSubValue are provided
            if (filterValue && filterSubValue) {
                const franchiseLower = filterValue.toLowerCase();
                const agencyLower = filterSubValue.toLowerCase();

                // Check if hierarchy contains the franchise
                const hasFranchise = hierarchy.some(
                    h => !h.isAgency && h.name?.toLowerCase() === franchiseLower
                );

                // Check if hierarchy contains the agency OR matches businessName
                const hasAgency = hierarchy.some(
                    h => h.isAgency && h.name?.toLowerCase() === agencyLower
                ) || agent.businessName?.toLowerCase() === agencyLower;

                if (hasFranchise && hasAgency) {
                    matchingAgents.push(agent);
                }
            }
            // If only filterValue (franchise) is provided
            else if (filterValue && !filterSubValue) {
                const franchiseLower = filterValue.toLowerCase();
                const allNames = hierarchy.map(h => h.name?.toLowerCase()).filter(Boolean);

                if (
                    allNames.includes(franchiseLower) ||
                    agent.franchise?.toLowerCase() === franchiseLower
                ) {
                    matchingAgents.push(agent);
                }
            }
            // If only filterSubValue is provided (shouldn't happen, but handle it)
            else if (!filterValue && filterSubValue) {
                const targetLower = filterSubValue.toLowerCase();
                const allNames = hierarchy.map(h => h.name?.toLowerCase()).filter(Boolean);

                if (
                    allNames.includes(targetLower) ||
                    agent.agency?.toLowerCase() === targetLower ||
                    agent.businessName?.toLowerCase() === targetLower
                ) {
                    matchingAgents.push(agent);
                }
            }
        }
    });

    return matchingAgents;
}

/**
 * Handles generic single-field filter
 * @param {Array} processedAgents - Array of agent records
 * @param {string} filterType - Field name to filter on
 * @param {string} filterValue - Value to match
 * @returns {Array} Filtered agents
 */
function handleGenericFilter(processedAgents, filterType, filterValue) {
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
    const carriers = statesAndCarriers.map(item => item.name);

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
    let topAgencies;
    const franchiseAgencyCombination = {};
    if (!requester.isAgent || requester.rights.includes(1)) {
        franchises = await prisma.$queryRaw`
        SELECT location_id, alias
        FROM qq.locations
    `;
        for (const franchise of franchises) {
            const agencyOwners = await prisma.personalInfo.findMany({
                where: {
                    franchise: franchise.location_id
                }
            });
            topAgencies = await prisma.agency.findMany({
                where: {
                    owner: {
                        in: agencyOwners.map(a => a.userId)
                    }
                }
            });
            franchiseAgencyCombination[franchise.location_id] = topAgencies;
        }

    } else if (requester.personalInfo?.contactType === 'business') {
        const upperHierarchy = await reverseGetAllAgencies(requester.personalInfo?.agency, requester.personalInfo?.franchise);

        const topFranchise = upperHierarchy.find(h => !h.isAgency);
        if (!topFranchise) {
            return {};
        }
        franchises = await prisma.$queryRaw`
            SELECT location_id, alias
            FROM qq.locations
            WHERE location_id = ${topFranchise.id}
        `;
        topAgencies = await prisma.agency.findMany({
            where: {
                id: requester.personalInfo?.agency
            }
        });
        franchiseAgencyCombination[topFranchise.id] = topAgencies;

    }

    for (const franchise of franchises) {
        for (const agency of topAgencies) {
            const underAgenciesId = await getAllAgencyIds(agency.id);
            const underAgencies = await prisma.agency.findMany({
                where: {
                    id: { in: underAgenciesId }
                }
            });
            franchiseAgencyCombination[franchise.location_id] = underAgencies;
        }
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

/* ============================
   ROUTE HANDLERS
============================ */

const renderReports = async (req, res) => {
    const user = req.user;

    const carrierStateCombination = getStatesAndCarriers();
    const stateFilterValue = carrierStateCombination.states;
    const carrierFilterValue = carrierStateCombination.carriers;

    const statusFilterValue = await getStatuses();

    const franchiseAgencyCombination = await getFranchiseAgencyCombinations(user);

    console.log('Franchise-Agency Combination:', franchiseAgencyCombination);

    const franchiseFilterValue = franchiseAgencyCombination.map(item => item.franchise);
    let agencyFilterValue = franchiseAgencyCombination.flatMap(item => item.agencies.map(a => a.agency));

    // Remove duplicates
    agencyFilterValue = [...new Set(agencyFilterValue)];

    res.render("reports", {
        user,
        filters: {
            state: stateFilterValue,
            carrier: carrierFilterValue,
            carrierState: carrierStateCombination,
            status: statusFilterValue,
            franchise: franchiseFilterValue,
            agency: agencyFilterValue,
            franchiseAgencyCombination,
        },
        activePage: 'reports'
    });
};

/**
 * Renders the reports page with filters
 */
const renderReportsOld = async (req, res) => {
    const user = req.user;
    const where = await buildAgencyWhereClause(user);
    const processedAgents = await loadAgents(where);

    // Extract unique agency/franchise combinations to avoid duplicate queries
    const uniqueCombinations = new Map();
    processedAgents.forEach(agent => {
        const key = `${agent.agency || 'none'}-${agent.franchise || 'none'}`;
        if (!uniqueCombinations.has(key)) {
            uniqueCombinations.set(key, { agency: agent.agency, franchise: agent.franchise });
        }
    });

    // Get hierarchies only for unique combinations (batch processing)
    const hierarchyPromises = Array.from(uniqueCombinations.values()).map(
        ({ agency, franchise }) => reverseGetAllAgencies(agency, franchise)
    );

    const hierarchies = await Promise.all(hierarchyPromises);
    console.log('Fetched Hierarchies:', hierarchies);

    // Create a map of hierarchies by key for quick lookup
    const hierarchyMap = new Map();
    Array.from(uniqueCombinations.keys()).forEach((key, index) => {
        hierarchyMap.set(key, hierarchies[index]);
    });

    // Extract unique agencies and franchises from hierarchies
    const allHierarchies = hierarchies.flat();

    const allAgencies = getUnique(
        allHierarchies
            .filter(i => i.isAgency)
            .map(i => ({
                name: i.name,
                franchiseName: i.underFranchise?.name || null
            })),
        ['name', 'franchiseName']
    );
    console.log('Unique Agencies Extracted:', allAgencies);

    const allFranchises = getUnique(
        allHierarchies
            .filter(i => !i.isAgency)
            .map(i => i.name)
    );

    console.log('=== Reports Page Debug ===');
    console.log('Total unique combinations:', uniqueCombinations.size);
    console.log('Total hierarchies fetched:', hierarchies.length);
    console.log('Total unique agencies:', allAgencies.length);
    console.log('Total unique franchises:', allFranchises.length);
    console.log('Agencies:', allAgencies);
    console.log('==========================');

    res.render("reports", {
        user,
        agents: processedAgents,
        filters: {
            state: getUniqueSimple(processedAgents, 'state'),
            carrier: getUniqueSimple(processedAgents, 'carrier'),
            status: getUniqueSimple(processedAgents, 'status'),
            franchise: allFranchises,
            agency: allAgencies,
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

    const where = await buildAgencyWhereClause(user);
    let processedAgents = await loadAgents(where);

    // Apply appropriate filter
    if (filterType === 'agency' && !filterValue && !filterSubValue) {
        const result = await handleAgencySummaryFilter(processedAgents);
        return res.json(result);
    }
    else if (filterType === 'carrier & state' && filterValue && filterSubValue) {
        processedAgents = handleCarrierStateFilter(processedAgents, filterValue, filterSubValue);
    }
    else if (filterType === 'agency' && (filterValue || filterSubValue)) {
        processedAgents = await handleAgencyFilter(processedAgents, filterValue, filterSubValue);
    }
    else if (filterType && filterValue) {
        processedAgents = handleGenericFilter(processedAgents, filterType, filterValue);
    }

    // Remove duplicates
    processedAgents = deduplicateAgents(processedAgents);

    res.json({ data: processedAgents, total: processedAgents.length });
};

/**
 * Gets agencies under a specific franchise
 */
const getAgenciesByFranchise = async (req, res) => {
    try {
        const { franchise } = req.query;
        const user = req.user;

        if (!franchise) {
            return res.json({ agencies: [] });
        }

        const where = await buildAgencyWhereClause(user);
        const processedAgents = await loadAgents(where);

        // Get unique agency/franchise combinations
        const uniqueCombinations = new Map();
        processedAgents.forEach(agent => {
            const key = `${agent.agency || 'none'}-${agent.franchise || 'none'}`;
            if (!uniqueCombinations.has(key)) {
                uniqueCombinations.set(key, {
                    agency: agent.agency,
                    franchise: agent.franchise,
                    businessName: agent.businessName
                });
            }
        });

        // Batch process hierarchies
        const hierarchyPromises = Array.from(uniqueCombinations.values()).map(
            ({ agency, franchise: agentFranchise }) =>
                reverseGetAllAgencies(agency, agentFranchise)
        );

        const hierarchies = await Promise.all(hierarchyPromises);

        // Map hierarchies back to combinations
        const agenciesUnderFranchise = new Set();
        const combinationsArray = Array.from(uniqueCombinations.values());

        hierarchies.forEach((hierarchy, index) => {
            const { businessName } = combinationsArray[index];

            // Check if this hierarchy includes the target franchise
            const hasFranchise = hierarchy.some(
                h => !h.isAgency && h.name?.toLowerCase() === franchise.toLowerCase()
            );

            if (hasFranchise) {
                // Add all agencies in this hierarchy
                hierarchy
                    .filter(h => h.isAgency)
                    .forEach(a => {
                        if (a.name) {
                            agenciesUnderFranchise.add(JSON.stringify({
                                name: a.name,
                                businessName: businessName
                            }));
                        }
                    });
            }
        });

        // Convert back to objects and deduplicate
        const agencies = Array.from(agenciesUnderFranchise)
            .map(str => JSON.parse(str))
            .sort((a, b) => a.name.localeCompare(b.name));

        console.log('=== Agency Dropdown Debug ===');
        console.log('Franchise requested:', franchise);
        console.log('Total unique combinations checked:', uniqueCombinations.size);
        console.log('Agencies found:', agencies.length);
        console.log('Agency list:', agencies);
        console.log('============================');

        res.json({ agencies });
    } catch (err) {
        console.error('Error getting agencies by franchise:', err);
        res.status(500).json({ error: 'Error getting agencies' });
    }
};/**
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

export { renderReports, filterReport, getAgenciesByFranchise, exportData };