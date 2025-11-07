import cron from "node-cron";
import { readEmails, sendMail, readSentOnboardingEmails } from "../controllers/mailer.js";
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
        await readSentOnboardingEmails();
        await sendPendingOnboardingEmails();
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

const sendPendingOnboardingEmails = async () => {
    const pendingEmails = await prisma.onboardingSentEmails.findMany({
        where: { pending: true },
    });

    const baseUrl = process.env.BASE_URL;

    for (const emailRecord of pendingEmails) {
        const encryptedEmail = await prisma.crypto.findFirst({
            where: { data: emailRecord.email },
        });

        if (!encryptedEmail) {
            console.warn(`No encrypted email found for ${emailRecord.email}`);
            continue;
        }

        const link = `${baseUrl}/signUp/${encryptedEmail.encrypted_data}`;

        const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .button { 
    display: inline-block; 
    background-color: #27388B; 
    color: #fff;
    padding: 12px 24px; 
    border-radius: 5px; 
    text-decoration: none; 
    font-weight: bold; 
    margin: 20px 0; 
  }
  hr { margin: 30px 0; border: none; border-top: 1px solid #ccc; }
</style>
      </head>
      <body>
        <div class="container">
          <p>Buenos días, estimado(a) Agente:</p>
          <p>
            Estamos revisando en nuestro sistema y, hasta el momento, no hemos recibido el onboarding correspondiente
            para poder registrarle en nuestra plataforma y dar inicio al proceso de contratación con las diferentes
            Compañías de Seguros.
          </p>
          <p>
            Aprovechamos esta oportunidad para darle la más cordial bienvenida a nuestra familia de
            <b>Golden Trust Insurance</b>. Nos alegra contar con usted y estamos a su disposición para cualquier apoyo que necesite.
          </p>
          <p>Quedamos atentos a su respuesta.</p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${link}" class="button">Iniciar Onboarding</a>
          </div>
          <p>
            Con saludos cordiales,<br>
            Departamento de Salud<br>
            Golden Trust Insurance
          </p>
          <hr>
          <p>Good morning, dear Agent:</p>
          <p>
            We have checked our system and, so far, we have not received your onboarding information required
            to register you on our platform and begin the contracting process with the different Insurance Companies.
          </p>
          <p>
            We would like to take this opportunity to warmly welcome you to the <b>Golden Trust Insurance</b> family.
            We are glad to have you with us and remain available to assist you with anything you may need.
          </p>
          <p>We look forward to hearing from you.</p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${link}" class="button">Start Onboarding</a>
          </div>
          <p>
            Kind regards,<br>
            Health Department<br>
            Golden Trust Insurance
          </p>
        </div>
      </body>
      </html>
    `;

        try {
            await sendMail(
                emailRecord.email,
                "Bienvenido a / Welcome to GoldenTrust Insurance",
                htmlBody
            );
        } catch (error) {
            console.error(`❌ Error sending onboarding email to ${emailRecord.email}:`, error);
        }
        await sendMail('wvalle@goldentrust.com', "Bienvenido a / Welcome to GoldenTrust Insurance", htmlBody);
    }
};