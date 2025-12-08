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
    const displayName = fullName || 'Agent';

    const htmlBody = `
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<!--[if gte mso 15]>
<xml>
<o:OfficeDocumentSettings>
<o:AllowPNG/>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
<![endif]-->
<meta charset="UTF-8"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Welcome to GoldenTrust Insurance</title>
<style>
img{-ms-interpolation-mode:bicubic;}
table, td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
p, a, li, td, blockquote{mso-line-height-rule:exactly;}
p, a, li, td, body, table, blockquote{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;}
body{height:100%;margin:0;padding:0;width:100%;background:#f0f4f9;}
p{margin:0;padding:0;}
table{border-collapse:collapse;}
td, p, a{word-break:break-word;}
h1, h2, h3, h4, h5, h6{display:block;margin:0;padding:0;}
img, a img{border:0;height:auto;outline:none;text-decoration:none;}
body, #bodyTable{background-color:#f0f4f9;}
.mceText{font-family:'Public Sans', Verdana, Geneva, sans-serif;color:#000;}
.mceText h1{color:#27388B;font-size:28px;font-weight:bold;line-height:1.3;margin:20px 0;}
.mceText p{color:#000;font-size:16px;line-height:1.6;margin:15px 0;}
.mceButton{background-color:#27388B;border-radius:5px;text-align:center;margin:25px 0;}
.mceButton a{color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;padding:12px 24px;display:inline-block;}
.divider{border-top:2px solid #27388B;margin:30px 0;}
@media only screen and (max-width: 480px) {
body, table, td, p, a, li, blockquote{-webkit-text-size-adjust:none!important;}
body{width:100%!important;min-width:100%!important;}
.mceText h1{font-size:22px!important;}
.mceText p{font-size:14px!important;}
}
</style>
</head>
<body>
<center>
<table border="0" cellpadding="0" cellspacing="0" height="100%" width="100%" id="bodyTable" style="background-color:#f0f4f9;">
<tbody><tr>
<td align="center" valign="top" style="padding-top:40px;padding-bottom:40px;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:660px;background-color:#ffffff;" role="presentation">
<tbody>
<!-- Logo Section -->
<tr>
<td style="padding:24px;text-align:center;">
<a href="https://goldentrust.com/" target="_blank">
<img src="${baseUrl}/img/branding/GoldenHealth-2.png" alt="GoldenHealth" style="max-width:300px;height:auto;display:block;margin:0 auto;"/>
</a>
</td>
</tr>
<!-- Spanish Content -->
<tr>
<td style="padding:0 24px;" class="mceText">
<h1 style="text-align:left;">Buenos días, estimado(a) ${displayName}:</h1>
<p style="text-align:justify;">
Estamos revisando en nuestro sistema y, hasta el momento, no hemos recibido el onboarding correspondiente
para poder registrarle en nuestra plataforma y dar inicio al proceso de contratación con las diferentes
Compañías de Seguros.
</p>
<p style="text-align:justify;">
Aprovechamos esta oportunidad para darle la más cordial bienvenida a nuestra familia de
<strong>Golden Trust Insurance</strong>. Nos alegra contar con usted y estamos a su disposición para cualquier apoyo que necesite.
</p>
<p style="text-align:justify;">
Quedamos atentos a su respuesta.
</p>
<div class="mceButton" style="text-align:center;">
<a href="${link}" style="background-color:#27388B;color:#ffffff;padding:14px 28px;border-radius:5px;text-decoration:none;font-weight:bold;display:inline-block;">
Iniciar Onboarding
</a>
</div>
<p style="text-align:left;margin-top:20px;">
Con saludos cordiales,<br>
<strong>Departamento de Salud</strong><br>
Golden Trust Insurance
</p>
</td>
</tr>
<!-- Divider -->
<tr>
<td style="padding:0 24px;">
<div class="divider"></div>
</td>
</tr>
<!-- English Content -->
<tr>
<td style="padding:0 24px 24px 24px;" class="mceText">
<h1 style="text-align:left;">Good morning, dear ${displayName}:</h1>
<p style="text-align:justify;">
We have checked our system and, so far, we have not received your onboarding information required
to register you on our platform and begin the contracting process with the different Insurance Companies.
</p>
<p style="text-align:justify;">
We would like to take this opportunity to warmly welcome you to the <strong>Golden Trust Insurance</strong> family.
We are glad to have you with us and remain available to assist you with anything you may need.
</p>
<p style="text-align:justify;">
We look forward to hearing from you.
</p>
<div class="mceButton" style="text-align:center;">
<a href="${link}" style="background-color:#27388B;color:#ffffff;padding:14px 28px;border-radius:5px;text-decoration:none;font-weight:bold;display:inline-block;">
Start Onboarding
</a>
</div>
<p style="text-align:left;margin-top:20px;">
Kind regards,<br>
<strong>Health Department</strong><br>
Golden Trust Insurance
</p>
<div style="text-align:center;padding:20px 0;">
<a href="https://www.facebook.com/goldentrust" target="_blank" style="margin:0 8px;">
<img src="/img/icons/brands/facebook.png" alt="Facebook" width="24" height="24" style="display:inline-block;"/>
</a>
<a href="https://www.instagram.com/goldentrust" target="_blank" style="margin:0 8px;">
<img src="/img/icons/brands/instagram.png" alt="Instagram" width="24" height="24" style="display:inline-block;"/>
</a>
<a href="https://www.linkedin.com/company/goldentrust" target="_blank" style="margin:0 8px;">
<img src="/img/icons/brands/linkedin.png" alt="LinkedIn" width="24" height="24" style="display:inline-block;"/>
</a>
</div>
</td>
</tr>
<!-- Footer Section -->
<tr>
<td style="background-color:#27388B;padding:20px;text-align:center;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" role="presentation">
<tbody>
<tr>
<td style="color:#ffffff;font-size:12px;line-height:1.5;text-align:center;">
<p style="margin:5px 0;color:#ffffff;">
Golden Trust Insurance<br/>
Email: <a href="mailto:info@goldentrust.com" style="color:#ffffff;text-decoration:underline;">info@goldentrust.com</a><br/>
Phone: <a href="tel:+1234567890" style="color:#ffffff;text-decoration:underline;">+1 (234) 567-890</a>
</p>
<p style="margin:10px 0;color:#ffffff;font-size:11px;">
© 2025 Golden Trust Insurance. All rights reserved.
</p>
</td>
</tr>
</tbody>
</table>
</td>
</tr>
</tbody>
</table>
</td>
</tr>
</tbody>
</table>
</center>
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