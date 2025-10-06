import { prisma } from "./config/dbConfig.js";

const RIGHTS = ["read", "write"];
const ALLOWED_AGENTS = ["goldenhealth@goldentrust.com"];

async function main() {
    let allRights = [];

    for (const right of RIGHTS) {
        const createdRight = await prisma.right.upsert({
            where: { name: right },
            update: {},
            create: { name: right }
        });
        allRights.push(createdRight);
    }

    for (const agent of ALLOWED_AGENTS) {
        await prisma.allowedAgents.upsert({
            where: { email: agent },
            update: {},
            create: { email: agent }
        });
    }

    const agent = await prisma.allowedAgents.findUnique({
        where: { email: "goldenhealth@goldentrust.com" },
    });

    for (const right of allRights) {
        await prisma.agentRights.upsert({
            where: {
                idAgent_idRight: {
                    idAgent: agent.id,
                    idRight: right.id
                }
            },
            update: {},
            create: {
                idAgent: agent.id,
                idRight: right.id
            }
        });
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
