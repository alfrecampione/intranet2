import cron from "node-cron";
import { readEmails } from "../controllers/mailer.js";
import { prisma } from "../config/dbConfig.js";

/* ---------------------------- 
    CRON JOB (every hour) 
---------------------------- */
export function scheduleCronJobs() {
    // Schedule tasks to be run on the server.
    cron.schedule("0 * * * *", async () => {
        console.log("⏰ Cron ejecutado");
        await readEmails();
        await checkReleasedToNot_Agents();
    });
};


const checkReleasedToNot_Agents = async () => {
    const releasedAgents = await prisma.user.findMany({
        where: { isReleased: true },
        include: { statesAndCarriers: true }
    });

    for (const agent of releasedAgents) {
        if (agent.statesAndCarriers.length > 0) {
            await prisma.user.update({
                where: { user_id: agent.user_id },
                data: { isReleased: false }
            });
        }
    }
};

const checkNotToReleased_Agents = async () => {
    const notReleasedAgents = await prisma.user.findMany({
        where: { isReleased: false },
        include: { statesAndCarriers: true }
    });

    for (const agent of notReleasedAgents) {
        if (agent.statesAndCarriers.length === 0) {
            await prisma.user.update({
                where: { user_id: agent.user_id },
                data: { isReleased: true }
            });
        }
    }
};