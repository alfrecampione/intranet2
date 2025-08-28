import { prisma } from "../config/dbConfig.js";

async function getAllAgencyIds(agencyId) {
    const result = [agencyId];

    const usersUnderAgency = await prisma.user.findMany({
        where: { personalInfo: { agency: agencyId } },
        include: { personalInfo: true }
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
}

async function loadAgents(where = {}) {
    const agents = await prisma.user.findMany({
        where: { isAgent: true, ...where },
        include: {
            Agency: { select: { name: true } },
            contactInfo: true,
            statesAndCarriers: true
        },
        orderBy: { display_name: 'asc' }
    });

    return agents.flatMap(agent =>
        agent.statesAndCarriers.map(record => ({
            user_id: agent.user_id,
            name: agent.display_name || '',
            state: record.state || '',
            carrier: record.company || '',
            status: record.status || '',
            agency: agent.Agency?.name || '',
            email: agent.email || '',
            number: agent.contactInfo?.personalPhone || ''
        }))
    );
}

const renderReports = async (req, res) => {
    const user = req.user;
    let where = {};

    if (user && user.isAgent && user.personalInfo?.contactType?.toLowerCase() === 'business') {
        const agency = await prisma.agency.findUnique({ where: { owner: user.user_id } });
        if (agency) {
            const allAgencyIds = await getAllAgencyIds(agency.id);
            where = { personalInfo: { agency: { in: allAgencyIds }, owner: { in: allAgencyIds } } };
        }
    }

    const processedAgents = await loadAgents(where);

    const getUnique = (arr, key) => [...new Set(arr.map(i => i[key]).filter(Boolean))].sort();

    res.render("reports", {
        user,
        agents: processedAgents,
        filters: {
            state: getUnique(processedAgents, 'state'),
            carrier: getUnique(processedAgents, 'carrier'),
            status: getUnique(processedAgents, 'status'),
            agency: getUnique(processedAgents, 'agency')
        },
        activePage: 'reports'
    });
};

const filterReport = async (req, res) => {
    const { filterType, filterValue, carrierValue } = req.query;
    const user = req.user;
    let where = {};

    if (user && user.personalInfo?.contactType?.toLowerCase() === 'business') {
        const agency = await prisma.agency.findUnique({ where: { owner: user.user_id } });
        if (agency) {
            const allAgencyIds = await getAllAgencyIds(agency.id);
            where = { personalInfo: { agency: { in: allAgencyIds }, owner: { in: allAgencyIds } } };
        }
    }

    let processedAgents = await loadAgents(where);

    if (filterType === 'carrier & state' && filterValue && carrierValue) {
        processedAgents = processedAgents.filter(
            i => i.state === filterValue && i.carrier === carrierValue
        );
    } else if (filterType && filterType !== 'carrier & state' && filterValue) {
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
    let { filterType, filterValue, carrierValue } = req.query;

    // Build the where clause dynamically
    const whereClause = {
        isAgent: true
    };

    if (filterType === "carrier & state" && filterValue && carrierValue) {
        whereClause.statesAndCarriers = {
            some: {
                state: filterValue,
                company: carrierValue
            }
        };
    } else if (filterType === "state" && filterValue) {
        whereClause.statesAndCarriers = {
            some: {
                state: filterValue
            }
        };
    } else if (filterType === "carrier" && filterValue) {
        whereClause.statesAndCarriers = {
            some: {
                company: filterValue
            }
        };
    } else if (["status", "agency"].includes(filterType) && filterValue) {
        // These will be filtered after Prisma fetch, because `status` is in `statesAndCarriers`
        // and `agency` is a nested relation
    }

    const agents = await prisma.user.findMany({
        where: whereClause,
        include: {
            Agency: { select: { name: true } },
            contactInfo: true,
            statesAndCarriers: true
        },
        orderBy: {
            display_name: 'asc'
        }
    });

    // Flatten records
    let processedAgents = [];

    agents.forEach(agent => {
        agent.statesAndCarriers.forEach(record => {
            const item = {
                user_id: agent.user_id,
                name: agent.display_name || '',
                state: record.state || '',
                carrier: record.company || '',
                status: record.status || '',
                agency: agent.Agency?.name || '',
                email: agent.email || '',
                number: agent.contactInfo?.personalPhone || ''
            };

            processedAgents.push(item);
        });
    });

    // Additional filtering if needed
    if (filterType === "status" && filterValue) {
        processedAgents = processedAgents.filter(a => a.status === filterValue);
    }
    if (filterType === "agency" && filterValue) {
        processedAgents = processedAgents.filter(a => a.agency === filterValue);
    }

    // Create Excel file
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Filtered Agents");

    worksheet.columns = [
        { header: "Name", key: "name", width: 25 },
        { header: "Email", key: "email", width: 30 },
        { header: "Phone Number", key: "number", width: 20 },
        { header: "State", key: "state", width: 15 },
        { header: "Carrier", key: "carrier", width: 25 },
        { header: "Status", key: "status", width: 15 },
        { header: "Agency", key: "agency", width: 25 }
    ];

    worksheet.addRows(processedAgents);

    res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
        "Content-Disposition",
        "attachment; filename=report.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
};

export { renderReports, filterReport, exportData };