import { get } from "https";
import { prisma } from "../config/dbConfig.js";
import { getAllAgencyIds, reverseGetAllAgencies } from "../config/utils.js";

async function loadAgents(where = {}) {
    const agents = await prisma.user.findMany({
        where: { isAgent: true, ...where },
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

    return flattened.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/**
 * Returns unique values from an array.
 * - For primitives: removes duplicates, filters falsy values, sorts.
 * - For objects: removes duplicates based on composite key (keys), sorts by first key.
 *
 * @param {Array} arr - Array of items (primitives or objects)
 * @param {Array<string>} keys - Optional keys for objects to determine uniqueness
 * @returns {Array} Unique and sorted array
 */
const getUnique = (arr, keys = []) => {
    if (!arr || arr.length === 0) return [];

    if (keys.length === 0) {
        return [...new Set(arr.filter(Boolean))].sort((a, b) => {
            if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
            return a - b;
        });
    }

    const seen = new Set();
    const result = [];

    for (const item of arr) {
        const compositeKey = keys.map(k => item[k] ?? '').join('|');
        if (!seen.has(compositeKey)) {
            seen.add(compositeKey);
            result.push(item);
        }
    }

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
};

const renderReports = async (req, res) => {
    const user = req.user;
    let where = {};

    if (user && user.isAgent && user.personalInfo?.contactType?.toLowerCase() === 'business') {
        const agency = await prisma.agency.findUnique({ where: { owner: user.user_id } });
        if (agency) {
            const allAgencyIds = await getAllAgencyIds(agency.id);

            where = {
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
    }

    const processedAgents = await loadAgents(where);

    const allSubordinations = await Promise.all(
        processedAgents.map(agent => reverseGetAllAgencies(agent.agency, agent.franchise))
    );

    const allAgencies = getUnique(
        allSubordinations
            .flat()
            .filter(i => i.isAgency)
            .map(i => ({
                name: i.name,
                franchiseName: i.underFranchise?.name || null
            })),
        ['name', 'franchiseName']
    );
    const allFranchises = getUnique(allSubordinations.flat().filter(i => !i.isAgency).map(i => i.name));

    const getUniqueSimple = (arr, key) => [...new Set(arr.map(i => i[key]).filter(Boolean))].sort();

    res.render("reports", {
        user,
        agents: processedAgents,
        filters: {
            state: getUniqueSimple(processedAgents, ['state']),
            carrier: getUniqueSimple(processedAgents, ['carrier']),
            status: getUniqueSimple(processedAgents, ['status']),
            franchise: allFranchises,
            agency: allAgencies,
        },
        activePage: 'reports'
    });
};

const filterReport = async (req, res) => {
    const { filterType, filterValue, filterSubValue } = req.query;

    const user = req.user;
    let where = {};
    let agency;

    if (user && user.personalInfo?.contactType?.toLowerCase() === 'business') {
        agency = await prisma.agency.findUnique({ where: { owner: user.user_id } });
        if (agency) {
            const allAgencyIds = await getAllAgencyIds(agency.id);

            where = {
                OR: [
                    {
                        personalInfo: {
                            agency: { in: allAgencyIds }
                        }
                    },
                    {
                        user_id: user.user_id
                    }
                ]
            };
        }
    }

    let processedAgents = await loadAgents(where);

    if (filterType === 'carrier & state' && filterValue && filterSubValue) {
        processedAgents = processedAgents.filter(
            i => i.state === filterValue && i.carrier === filterSubValue
        );
    }

    else if (filterType === 'agency' && (filterValue || filterSubValue)) {
        const targetName = (filterSubValue || filterValue).toLowerCase();
        const hierarchyCache = new Map();
        const matchingAgents = [];

        for (const agent of processedAgents) {
            if (filterSubValue && filterSubValue.toLowerCase() === agent.businessName.toLowerCase()) {
                matchingAgents.push(agent);
                continue;
            }

            const key = `${agent.agency || 'none'}-${agent.franchise || 'none'}`;

            if (!hierarchyCache.has(key)) {
                const hierarchy = await reverseGetAllAgencies(agent.agency, agent.franchise);
                hierarchyCache.set(key, hierarchy);
            }

            const allNames = hierarchyCache
                .get(key)
                .map(h => h.name?.toLowerCase())
                .filter(Boolean);

            if (
                allNames.includes(targetName) ||
                agent.agency?.toLowerCase() === targetName ||
                agent.franchise?.toLowerCase() === targetName
            ) {
                matchingAgents.push(agent);
            }
        }

        processedAgents = matchingAgents;
    }

    else if (filterType && filterValue) {
        processedAgents = processedAgents.filter(i => i[filterType] === filterValue);
    }

    const seen = new Set();
    processedAgents = processedAgents.filter(i => {
        if (seen.has(i.user_id)) return false;
        seen.add(i.user_id);
        return true;
    });

    res.json({ data: processedAgents, total: processedAgents.length });
};

const exportData = async (req, res) => {
    try {
        const { headers = [], rows = [] } = req.body;

        let csvContent = '';
        csvContent += headers.join(',') + '\n'; // Header row
        rows.forEach(row => {
            const csvRow = row.map(value => {
                // Escape commas and quotes
                if (typeof value === 'string') {
                    let v = value.replace(/"/g, '""');
                    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
                        v = `"${v}"`;
                    }
                    return v;
                }
                return value ?? '';
            });
            csvContent += csvRow.join(',') + '\n';
        });

        // Set headers for CSV download
        res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');

        // Send CSV content
        res.send(csvContent);
    } catch (err) {
        console.error('CSV export failed:', err);
        res.status(500).send('Error exporting CSV');
    }
};

export { renderReports, filterReport, exportData };