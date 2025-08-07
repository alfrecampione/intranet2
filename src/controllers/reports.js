import { prisma } from "../config/dbConfig.js";



const renderReports = async (req, res) => {
    const user = req.user;

    const agents = await prisma.user.findMany({
        where: { isAgent: true },
        include: {
            Agency: {
                select: { name: true }
            },
            contactInfo: true,
            statesAndCarriers: true
        },
        orderBy: {
            display_name: 'asc'
        }
    });

    const processedAgents = [];

    agents.forEach(agent => {
        agent.statesAndCarriers.forEach(record => {
            processedAgents.push({
                user_id: agent.user_id,
                name: agent.display_name || '',
                state: record.state || '',
                carrier: record.company || '',
                status: record.status || '',
                agency: agent.Agency?.name || '',
                email: agent.email || '',
                number: agent.contactInfo?.personalPhone || ''
            });
        });
    });

    // Extract unique values for filters
    const getUnique = (arr, key) => [...new Set(arr.map(item => item[key]).filter(Boolean))].sort();

    const state = getUnique(processedAgents, 'state');
    const carrier = getUnique(processedAgents, 'carrier');
    const status = getUnique(processedAgents, 'status');
    const agency = getUnique(processedAgents, 'agency');

    res.render("reports", {
        user,
        agents: processedAgents,
        filters: {
            state,
            carrier,
            status,
            agency
        }
    });
}

const filterReport = async (req, res) => {
    const { filterType, filterValue, carrierValue } = req.query;

    const agents = await prisma.user.findMany({
        where: { isAgent: true },
        include: {
            Agency: {
                select: { name: true }
            },
            contactInfo: true,
            statesAndCarriers: true
        },
        orderBy: {
            display_name: 'asc'
        }
    });

    const processedAgents = [];

    agents.forEach(agent => {
        agent.statesAndCarriers.forEach(record => {
            processedAgents.push({
                user_id: agent.user_id,
                name: agent.display_name || '',
                state: record.state || '',
                carrier: record.company || '',
                status: record.status || '',
                agency: agent.Agency?.name || '',
                email: agent.email || '',
                number: agent.contactInfo?.personalPhone || ''
            });
        });
    });

    // Filter logic
    let filtered = processedAgents;

    if (filterType === 'carrier & state' && filterValue && carrierValue) {
        filtered = filtered.filter(item => item.state === filterValue && item.carrier === carrierValue);
    } else if (filterType && filterType !== 'carrier & state' && filterValue) {
        filtered = filtered.filter(item => item[filterType] === filterValue);
    }

    // Deduplicate by user_id
    const seen = new Set();
    filtered = filtered.filter(item => {
        if (seen.has(item.user_id)) return false;
        seen.add(item.user_id);
        return true;
    });

    res.json({
        data: filtered,
        total: filtered.length
    });
};

import ExcelJS from "exceljs";

const exportData = async (req, res) => {
    let { filterType, filterValue, carrierValue } = req.query;

    console.log({ filterType, filterValue, carrierValue });


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