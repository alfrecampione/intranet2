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

const bodyTemplate = (link) => `
    Buenos días, estimado (a) Agente:

    Estamos revisando en nuestro sistema y, hasta el momento, no hemos recibido el onboarding correspondiente para poder registrarle en nuestra plataforma y dar inicio al proceso de contratación con las diferentes Compañías de Seguros.
    Aprovechamos esta oportunidad para darle la más cordial bienvenida a nuestra familia de Golden Trust Insurance. Nos alegra contar con usted y estamos a su disposición para cualquier apoyo que necesite.
    Quedamos atentos a su respuesta.
    Por favor, haga clic en el siguiente enlace para iniciar su proceso de onboarding: ${link}
    Con saludos cordiales,
    Departamento de Salud
    Golden Trust Insurance
    <br>
    <hr>
    <br>
    Good morning, dear Agent:
    We have checked our system and, so far, we have not received your onboarding information required to register you on our platform and begin the contracting process with the different Insurance Companies.
    We would like to take this opportunity to warmly welcome you to the Golden Trust Insurance family. We are glad to have you with us and remain available to assist you with anything you may need.
    We look forward to hearing from you.
    Please click on the following link to start your onboarding process: ${link}
    Kind regards,
    Health Department
    Golden Trust Insurance
`;

const sendPendingOnboardingEmails = async () => {
    const pendingEmails = await prisma.onboardingSentEmails.findMany({
        where: { pending: true }
    });

    const baseUrl = process.env.BASE_URL;

    for (const emailRecord of pendingEmails) {
        const encryptedEmail = await prisma.crypto.findFirst({
            where: { data: emailRecord.email }
        });

        const link = `${baseUrl}/signUp/${encryptedEmail.encrypted_data}`;

        const body = {
            intro: `
                Buenos días, estimado (a) Agente:
            `,
            table: {
                data: [{
                    mensaje: `
                        Estamos revisando en nuestro sistema y, hasta el momento, no hemos recibido el onboarding correspondiente para poder registrarle en nuestra plataforma y dar inicio al proceso de contratación con las diferentes Compañías de Seguros.<br><br>
                        Aprovechamos esta oportunidad para darle la más cordial bienvenida a nuestra familia de <b>Golden Trust Insurance</b>. Nos alegra contar con usted y estamos a su disposición para cualquier apoyo que necesite.<br><br>
                        Quedamos atentos a su respuesta.<br><br>
                        <div style="text-align: center; margin: 20px 0;">
                            <a href="${link}" style="display: inline-block; background-color: #27388B; color: #ffffff; padding: 10px 18px; border-radius: 3px; text-decoration: none; font-weight: bold;">Iniciar Onboarding</a>
                        </div>
                    `
                }],
                columns: {
                    customWidth: { mensaje: "100%" },
                    customAlignment: { mensaje: "left" }
                }
            },
            outro: `
                Con saludos cordiales,<br>
                Departamento de Salud<br>
                Golden Trust Insurance
                <br><br>
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #ccc;">
                <br>
                Good morning, dear Agent:<br><br>
                We have checked our system and, so far, we have not received your onboarding information required to register you on our platform and begin the contracting process with the different Insurance Companies.<br><br>
                We would like to take this opportunity to warmly welcome you to the <b>Golden Trust Insurance</b> family. We are glad to have you with us and remain available to assist you with anything you may need.<br><br>
                We look forward to hearing from you.<br><br>
                <div style="text-align: center; margin: 20px 0;">
                    <a href="${link}" style="display: inline-block; background-color: #27388B; color: #ffffff; padding: 10px 18px; border-radius: 3px; text-decoration: none; font-weight: bold;">Start Onboarding</a>
                </div>
                <br>
                Kind regards,<br>
                Health Department<br>
                Golden Trust Insurance
            `
        };

        try {
            await sendMail(
                emailRecord.email,
                "Bienvenido a / Welcome to GoldenTrust Insurance",
                body
            );
        } catch (error) {
            console.error(`Error sending pending onboarding email to ${emailRecord.email}:`, error);
        }
    }
};