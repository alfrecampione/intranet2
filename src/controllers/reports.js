import { get } from "https";
import { prisma } from "../config/dbConfig.js";
import { getAllAgencyIds } from "../config/utils.js";

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
            email: agent.email || '',
            number: agent.contactInfo?.personalPhone || ''
        }))
    );

    return flattened.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

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
async function getAllAgencies(agencyId, franchiseId) {
    const results = [];

    while (agencyId || franchiseId) {
        if (agencyId) {
            const agency = await prisma.agency.findUnique({
                where: { id: agencyId },
                include: {
                    user: {
                        include: { personalInfo: true },
                    },
                },
            });

            if (!agency) break;

            results.push({
                id: agency.id,
                isAgency: true,
                name: agency.name || '',
            });

            const parentAgencyId = agency.user?.personalInfo?.agency || null;
            const parentFranchiseId = agency.user?.personalInfo?.franchise || null;

            // Move up the chain
            agencyId = parentAgencyId;
            franchiseId = parentFranchiseId;

        } else if (franchiseId) {
            const id = Number(franchiseId);
            if (isNaN(id)) break;

            const [franchise] = await prisma.$queryRaw`
        SELECT * FROM qq.locations WHERE location_id = ${id}
    `;

            results.push({
                id: franchiseId,
                isAgency: false,
                name: franchise?.alias || '',
            });

            break;
        }
    }

    return results;
}

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

    const getUnique = (arr, key) => {
        const values = key ? arr.map(i => i[key]) : arr;
        return [...new Set(values.filter(Boolean))].sort();
    };

    const allSubordinations = await Promise.all(
        processedAgents.map(agent => getAllAgencies(agent.agency, agent.franchise))
    );

    const allAgencies = getUnique(allSubordinations.flat().filter(i => i.isAgency).map(i => i.name));
    const allFranchises = getUnique(allSubordinations.flat().filter(i => !i.isAgency).map(i => i.name));

    res.render("reports", {
        user,
        agents: processedAgents,
        filters: {
            state: getUnique(processedAgents, 'state'),
            carrier: getUnique(processedAgents, 'carrier'),
            status: getUnique(processedAgents, 'status'),
            franchise: allFranchises,
            agency: allAgencies,
        },
        activePage: 'reports'
    });
};

const filterReport = async (req, res) => {
    const { filterType, filterValue, filterSubValue } = req.query;
    console.log(req.query);

    const user = req.user;
    let where = {};

    if (user && user.personalInfo?.contactType?.toLowerCase() === 'business') {
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

    let processedAgents = await loadAgents(where);

    // Multi-filter logic
    if (filterType === 'carrier & state' && filterValue && filterSubValue) {
        processedAgents = processedAgents.filter(
            i => i.state === filterValue && i.carrier === filterSubValue
        );
    }
    // Hierarchy-aware agency/franchise filter
    else if (filterType === 'agency' && (filterValue || filterSubValue)) {
        const targetName = (filterSubValue || filterValue).toLowerCase();
        const hierarchyCache = new Map();
        const matchingAgents = [];

        for (const agent of processedAgents) {
            const key = `${agent.agency || 'none'}-${agent.franchise || 'none'}`;

            if (!hierarchyCache.has(key)) {
                const hierarchy = await getAllAgencies(agent.agency, agent.franchise);
                hierarchyCache.set(key, hierarchy);
            }

            const allNames = hierarchyCache
                .get(key)
                .map(h => h.name?.toLowerCase())
                .filter(Boolean);

            if (allNames.includes(targetName)) {
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


import ExcelJS from "exceljs";

const exportData = async (req, res) => {
    const { headers = [], rows = [] } = req.body;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report');

    // Add headers as first row
    sheet.addRow(headers);

    // Add all data rows
    rows.forEach(row => sheet.addRow(row));

    // Optional: auto-width for each column
    sheet.columns.forEach(column => {
        let maxLength = 10;
        column.eachCell({ includeEmpty: true }, cell => {
            const len = cell.value ? cell.value.toString().length : 0;
            if (len > maxLength) maxLength = len;
        });
        column.width = maxLength + 2;
    });

    res.setHeader(
        'Content-Disposition',
        'attachment; filename="report.xlsx"'
    );
    res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    await workbook.xlsx.write(res);
    res.end();
};

export { renderReports, filterReport, exportData };