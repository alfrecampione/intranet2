import cron from "node-cron";
import { readEmails } from "../controllers/mailer";
import { prisma } from "../config/dbConfig.js";

/* ---------------------------- 
    CRON JOB (every hour) 
---------------------------- */
cron.schedule("0 * * * *", () => {
    readEmails();
    // checkReleasedToNot_Agents();
    checkNotToReleased_Agents();
});


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