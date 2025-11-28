import cron from "node-cron";
import { readEmails, sendMail, readSentOnboardingEmails } from "../controllers/mailer.js";
import { prisma } from "../config/dbConfig.js";
import { encrypt } from "../controllers/crypto.js";

/* ---------------------------- 
    CRON JOB (every hour) 
---------------------------- */
export async function scheduleCronJobs() {
  console.log('🕐 Scheduling cron jobs...');

  // Schedule tasks to be run on the server.
  cron.schedule("0 * * * *", async () => {
    await readEmails();
    await checkReleasedToNot_Agents();
  });

  // Schedule tasks to be run on the server. Every Monday at 8am
  cron.schedule("0 8 * * 1", async () => {
    console.log('⏰ Running weekly cron job (Monday 8am)...');
    // await readSentOnboardingEmails();
    await sendPendingOnboardingEmails();
  });

  console.log('✅ Cron jobs scheduled successfully.');
};


const checkReleasedToNot_Agents = async () => {
  try {
    const releasedAgents = await prisma.user.findMany({
      where: { isReleased: true },
      include: { statesAndCarriers: true }
    });

    let updatedCount = 0;

    for (const agent of releasedAgents) {
      if (agent.statesAndCarriers.length > 0) {
        await prisma.user.update({
          where: { user_id: agent.user_id },
          data: { isReleased: false }
        });
        updatedCount++;
      }
    }
  } catch (error) {
    console.error('❌ Error in checkReleasedToNot_Agents:', error);
  }
};

const checkNotToReleased_Agents = async () => {
  try {
    const notReleasedAgents = await prisma.user.findMany({
      where: { isReleased: false },
      include: { statesAndCarriers: true }
    });

    let updatedCount = 0;

    for (const agent of notReleasedAgents) {
      if (agent.statesAndCarriers.length === 0) {
        await prisma.user.update({
          where: { user_id: agent.user_id },
          data: { isReleased: true }
        });
        updatedCount++;
      }
    }
  } catch (error) {
    console.error('❌ Error in checkNotToReleased_Agents:', error);
  }
};

const sendPendingOnboardingEmails = async () => {
  const pendingEmails = await prisma.onboardingSentEmails.findMany({
    where: { pending: true },
  });

  if (pendingEmails.length === 0) {
    return;
  }

  const baseUrl = process.env.BASE_URL;

  // Get emails to notify
  const alertEmails = await prisma.newUserAlerts.findMany();

  for (const emailRecord of pendingEmails) {
    // Ensure NecesaryDocuments record exists
    const existingDocs = await prisma.necesaryDocuments.findUnique({
      where: { email: emailRecord.email }
    });

    if (!existingDocs) {
      console.warn(`⚠️ No necessary documents record found for ${emailRecord.email}, creating one...`);
      await prisma.necesaryDocuments.create({
        data: { email: emailRecord.email }
      });
      console.log(`✅ Created necessary documents record for ${emailRecord.email}`);
    }

    // Ensure crypto record exists
    let encryptedEmail = await prisma.crypto.findFirst({
      where: { data: emailRecord.email },
    });

    if (!encryptedEmail) {
      console.warn(`⚠️ No encrypted email found for ${emailRecord.email}, creating one...`);

      // Create encrypted email on-the-fly
      const { encryptedData, key, iv } = encrypt(emailRecord.email);
      encryptedEmail = await prisma.crypto.create({
        data: {
          encrypted_data: encryptedData,
          key: key,
          id: iv,
          data: emailRecord.email
        }
      });

      console.log(`✅ Created encrypted email for ${emailRecord.email}`);
    }

    const link = `${baseUrl}/signUp/${encryptedEmail.encrypted_data}`;

    // Build greeting using firstName and lastName if available
    const fullName = [emailRecord.firstName, emailRecord.lastName].filter(Boolean).join(' ');
    const greetingES = fullName ? `Buenos días, estimado(a) ${fullName}:` : 'Buenos días, estimado(a) Agente:';
    const greetingEN = fullName ? `Good morning, dear ${fullName}:` : 'Good morning, dear Agent:';

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
          <p>${greetingES}</p>
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
          <p>${greetingEN}</p>
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
        htmlBody,
        alertEmails.map(alert => alert.email) // CC admins instead of separate emails
      );
      console.log(`✅ Onboarding reminder sent to ${emailRecord.email}`);
    } catch (error) {
      console.error(`❌ Error sending onboarding email to ${emailRecord.email}:`, error);
    }
  }

  console.log(`✅ Finished processing ${pendingEmails.length} pending onboarding email(s).`);
};