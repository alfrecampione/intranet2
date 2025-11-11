import { get } from "http";
import { prisma } from "../config/dbConfig.js";
import { getAllAgencyIds, getVisibleAgentsId, reverseGetAllAgencies } from "../config/utils.js";
import { name } from "ejs";
import { agency } from "./agency_reports.js";

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

    const mappedAgents = agents.map(agent => ({
        user_id: agent.user_id,
        name: agent.display_name || '',
        statesAndCarriers: agent.statesAndCarriers,
        agency: agent.personalInfo?.agency || '',
        franchise: agent.personalInfo?.franchise || '',
        businessName: agent.personalInfo?.businessName || '',
        email: agent.email || '',
        number: agent.contactInfo?.personalPhone || ''
    }));

    return mappedAgents.sort((a, b) =>
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

// Note: No deduplication needed anymore since each agent is returned once

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
    const uniqueAgents = processedAgents; // already unique by user_id

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
                    franchise: `${franchise.location_id}`
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
async function getAgentsToRender(requester) {
    const visibleAgentsId = await getVisibleAgentsId(requester.user_id);
    const processedAgents = await loadAgents(visibleAgentsId);
    return processedAgents;
}

/* ============================
   ROUTE HANDLERS
============================ */

const renderReports = async (req, res) => {
    const user = req.user;

    const visibleAgents = await getAgentsToRender(user);

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
        agents: visibleAgents,
        filters: {
            agents: visibleAgents,
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