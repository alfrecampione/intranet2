import { prisma } from "../config/dbConfig.js";

const renderReports = async (req, res) => {
    const user = req.user;

    // Fetch agents with StatesANDCarriers and Agency data
    const agents = await prisma.user.findMany({
        where: { isAgent: true },
        include: {
            Agency: {
                select: { name: true }
            },
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
                agency: agent.Agency?.name || ''
            });
        });
    });

    // Extract unique values for filters
    const getUnique = (arr, key) => [...new Set(arr.map(item => item[key]).filter(Boolean))].sort();

    const states = getUnique(processedAgents, 'state');
    const carriers = getUnique(processedAgents, 'carrier');
    const statuses = getUnique(processedAgents, 'status');
    const agencies = getUnique(processedAgents, 'agency');

    res.render("reports", {
        user,
        agents: processedAgents,
        filters: {
            states,
            carriers,
            statuses,
            agencies
        }
    });
}

export { renderReports };