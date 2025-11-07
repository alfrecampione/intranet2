import cron from "node-cron";
import { readEmails, sendMail } from "../controllers/mailer.js";
import { prisma } from "../config/dbConfig.js";

/* ---------------------------- 
    CRON JOB (every hour) 
---------------------------- */
export async function scheduleCronJobs() {
    // Schedule tasks to be run on the server.
    cron.schedule("0 * * * *", async () => {
        await readEmails();
        await checkReleasedToNot_Agents();
    });

    // Schedule tasks to be run on the server. Every day at midnight
    cron.schedule("0 0 * * *", async () => {
        await sendPendingOnboardingEmails();
    });

    await sendPendingOnboardingEmails();
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

const sendPendingOnboardingEmails = async () => {
    const pendingEmails = await prisma.onboardingSentEmails.findMany({
        where: { pending: true }
    });

    const baseUrl = process.env.BASE_URL;

    for (const emailRecord of pendingEmails) {
        const encryptedEmail = await prisma.crypto.findFirst({
            where: { data: emailRecord.email }
        });

        const body = {
            intro: `Buenos días, estimado (a) Agente:`,
            table: {
                data: [{
                    mensaje: `Estamos revisando en nuestro sistema y, hasta el momento, no hemos recibido el onboarding correspondiente para poder registrarle en nuestra plataforma y dar inicio al proceso de contratación con las diferentes Compañías de Seguros.<br><br>Aprovechamos esta oportunidad para darle la más cordial bienvenida a nuestra familia de Golden Trust Insurance. Nos alegra contar con usted y estamos a su disposición para cualquier apoyo que necesite.<br><br>Quedamos atentos a su respuesta.`
                }],
                columns: {
                    customWidth: { mensaje: "100%" },
                    customAlignment: { mensaje: "left" }
                }
            },
            action: {
                instructions: "",
                button: {
                    color: "#27388B",
                    text: "Iniciar Onboarding",
                    link: `${baseUrl}/signUp/${encryptedEmail.encrypted_data}`
                }
            },
            outro: `Con saludos cordiales,<br>Departamento de Salud<br>Golden Trust Insurance`
        };

        try {
            await sendMail(emailRecord.email, "Bienvenido a la familia de Golden Trust Insurance", body);
        } catch (error) {
            console.error(`Error sending pending onboarding email to ${emailRecord.email}:`, error);
        }
    }
};