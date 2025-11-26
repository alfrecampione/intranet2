import fetch from "node-fetch";
import dotenv from "dotenv";
import Mailgen from "mailgen";
import { pool, prisma } from "../config/dbConfig.js";
import { encrypt } from "./crypto.js";
import { createMessage } from "../config/utils.js";
import { getEmailsToAlert } from "./config.js";
import { get } from "https";
import { on } from "events";

dotenv.config();

const tenantId = process.env.MS_TENANT_ID;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const senderEmail = process.env.G_EMAIL;

/* ----------------------------
   TOKEN MANAGEMENT
---------------------------- */
async function getAccessToken() {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("scope", "https://graph.microsoft.com/.default");
  params.append("grant_type", "client_credentials");

  const res = await fetch(url, { method: "POST", body: params });
  const json = await res.json();

  if (json.error) {
    throw new Error(`Error getting token: ${json.error_description}`);
  }

  return json.access_token;
}

/* ----------------------------
   SEND EMAILS (Graph with Fetch)
---------------------------- */
async function sendMail(email, subject, body, ccEmails = []) {
  try {
    if (!email || !subject || !body) {
      throw new Error("Email, subject and body are required");
    }

    let mailHtml;

    // Si body es un string, asumimos que es HTML puro
    if (typeof body === 'string') {
      mailHtml = body;
    } else {
      // Si es un objeto, usamos mailgen
      const mailGenerator = new Mailgen({
        theme: "default",
        product: {
          name: `GoldenHealth`,
          link: "https://goldentrustinsurance.com/",
        },
      });
      mailHtml = mailGenerator.generate({ body });
    }

    const message = {
      message: {
        subject,
        body: {
          contentType: "HTML",
          content: mailHtml,
        },
        toRecipients: [{ emailAddress: { address: email } }],
        ccRecipients: ccEmails.map(cc => ({ emailAddress: { address: cc } })),
      },
      saveToSentItems: true,
    };
    const token = await getAccessToken();

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Graph API error: ${response.status} - ${errorText}`);
    }
  } catch (err) {
    console.error("Error sending email:", err);
    throw err;
  }
}
/* ----------------------------
   READ EMAILS FUNCTION (Graph with Fetch)
---------------------------- */
async function getAllMessages(userEmail, folderName = "Inbox") {
  try {
    const token = await getAccessToken();
    let messages = [];
    let url = `https://graph.microsoft.com/v1.0/users/${userEmail}/mailFolders('${folderName}')/messages?$orderby=sentDateTime DESC&$select=id,subject,bodyPreview,from,toRecipients,sentDateTime,conversationId&$top=50`;

    while (url) {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Graph API error: ${response.status}`);
      }

      const page = await response.json();

      if (page.value) {
        messages = messages.concat(page.value);
      }

      url = page["@odata.nextLink"] || null;
    }

    return messages;
  } catch (err) {
    console.error("❌ Error getting messages:", err);
    throw err;
  }
}

// ----------------------------
// PASSWORD MAIL
// ----------------------------
const passwordMail = async (req, res) => {
  const email = req.params.email;
  const baseUrl = process.env.BASE_URL;
  const { encryptedData, key, iv } = encrypt(email);

  let result, prismaUser;
  try {
    result = await pool.query(
      `SELECT display_name FROM entra.users WHERE mail = $1 AND active = true AND location_id > 0`,
      [email]
    );

    prismaUser = await prisma.user.findUnique({
      where: { email: email, isReleased: false },
    });

    await prisma.crypto.create({
      data: {
        encrypted_data: encryptedData,
        key: key,
        id: iv,
        data: email
      },
    });
  } catch (error) {
    console.log("POSTGRESQL/PRISMA:", error);
    return res.status(500).json({ msg: "Data Access Error" });
  }

  if (result.rows.length === 0 && !prismaUser) {
    return res.status(401).json({ msg: "Please enter an existing email" });
  }

  const body = {
    name: email,
    intro: "Welcome to GoldenHealth! We're very excited to have you on board.",
    action: {
      instructions: "To get started, please click here:",
      button: {
        color: "#27388B",
        text: "Create your password",
        link: `${baseUrl}/users/auth/reset-password/${encryptedData}`,
      },
    },
    outro: ``,
  };

  try {
    await sendMail(email, "Create your password", body);
    return res.status(201).json({ msg: "Email sent" });
  } catch (err) {
    console.error("GRAPH SEND ERROR:", err);
    return res.status(500).json({ err });
  }
};

// ----------------------------
// GENERIC EMAIL SENDER
// ----------------------------
const email_sender = async (req, res) => {
  const { subject, body } = req.body;
  const email = req.params.email;

  try {
    await sendMail(email, subject, body);
    return res.status(200).json({
      success: true,
      message: "Email sent successfully",
    });
  } catch (error) {
    console.error("Error sending email:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send email",
    });
  }
};

// ----------------------------
// NEW USER NOTIFICATION
// ----------------------------
const new_user_notification = async (req, res) => {
  const { email, recommendation } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  try {
    const alerts = await getEmailsToAlert();
    if (!alerts || alerts.length === 0) {
      console.warn("⚠️ No notification emails configured in newUserAlerts table.");
      return res
        .status(200)
        .json({ message: "No notification emails configured." });
    }

    console.log(`📧 Sending new user notification for ${email} to ${alerts.length} recipient(s)...`);

    const subject = "New user created";
    const body = {
      intro: `The user with the email <b>${email}</b> has been created in the system.`,
      ...(recommendation?.trim() && {
        table: {
          data: [{ "User Recommendation": recommendation }],
          columns: {
            customWidth: { "User Recommendation": "100%" },
            customAlignment: { "User Recommendation": "left" },
          },
        },
      }),
      outro:
        "This is an automated message from the GoldenHealth.",
    };

    let successCount = 0;
    let errorCount = 0;

    for (const alert of alerts) {
      try {
        await sendMail(alert.email, subject, body);
        console.log(`✅ Notification sent to: ${alert.email}`);
        successCount++;

        // Create in-app notification for User
        const agent = await prisma.user.findUnique({
          where: { email: alert.email },
        });
        if (agent) {
          await prisma.notificacion.create({
            data: {
              userId: agent.user_id,
              userEmail: alert.email,
              message: `User with email: ${email} has been created.`,
              createdBy: "system",
            },
          });
        }

        // Create in-app notification for AllowedAgent
        const allowedAgent = await prisma.allowedAgents.findUnique({
          where: { email: alert.email },
        });
        if (allowedAgent) {
          await prisma.notificacion.create({
            data: {
              userId: allowedAgent.id,
              userEmail: alert.email,
              message: `User with email: ${email} has been created.`,
              createdBy: "system",
            },
          });
        }
      } catch (err) {
        console.error(`❌ Error sending notification to ${alert.email}:`, err);
        errorCount++;
      }
    }

    console.log(`📊 Notification summary: ${successCount} sent, ${errorCount} failed out of ${alerts.length} total.`);

    return res.status(200).json({
      message: "Notifications processed.",
      sent: successCount,
      failed: errorCount
    });
  } catch (error) {
    console.error("❌ Error sending new user notifications:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

const readSentOnboardingEmails = async () => {
  try {
    // Fetch only from the "Sent Items" folder
    const messages = await getAllMessages(process.env.G_EMAIL, "SentItems");

    // Filter emails whose subject matches exactly
    const onboardingMessages = messages.filter(
      (msg) =>
        msg.subject &&
        msg.subject.trim() === "Create your account on GoldenHealth"
    );

    const seenEmails = new Set();

    for (const msg of onboardingMessages) {
      const recipient =
        msg.toRecipients?.[0]?.emailAddress?.address || null;

      if (!recipient) continue;

      seenEmails.add(recipient);

      // Check if user has completed onboarding (exists in User table)
      const userExists = await prisma.user.findUnique({
        where: { email: recipient },
      });

      // If user exists in User table, onboarding is complete (pending = false)
      const isPending = userExists ? false : true;

      // Upsert using email as unique identifier
      await prisma.onboardingSentEmails.upsert({
        where: { email: recipient },
        update: {
          sentAt: new Date(msg.sentDateTime),
          pending: isPending,
        },
        create: {
          email: recipient,
          sentAt: new Date(msg.sentDateTime),
          pending: isPending,
        },
      });
    }
  } catch (err) {
    console.error("❌ Error reading sent onboarding emails:", err);
  }
};

const readEmails = async () => {
  try {
    const messages = await getAllMessages(process.env.G_EMAIL);

    // Filtra solo los mensajes con [NEWS] al inicio
    const newsMessages = messages.filter(
      (msg) => msg.subject && msg.subject.trim().startsWith("[NEWS]")
    );

    const seenIds = new Set();

    for (const msg of newsMessages) {
      seenIds.add(msg.id);

      const title = msg.subject.replace(/^\[NEWS\]\s*/i, "").trim() || "(No Subject)";

      let cleanContent = msg.bodyPreview?.trim() || "(No Content)";
      const nextNewsIndex = cleanContent.indexOf("[NEWS]");
      if (nextNewsIndex !== -1) {
        cleanContent = cleanContent.substring(0, nextNewsIndex).trim();
      }

      await prisma.news.upsert({
        where: { externalId: msg.id },
        update: {
          sender: msg.from?.emailAddress?.address || "Unknown",
          title,
          content: cleanContent,
          sendedAt: new Date(msg.sentDateTime),
        },
        create: {
          externalId: msg.id,
          sender: msg.from?.emailAddress?.address || "Unknown",
          title,
          content: cleanContent,
          sendedAt: new Date(msg.sentDateTime),
        },
      });
    }

    const dbNews = await prisma.news.findMany({ select: { externalId: true } });
    const dbIds = dbNews.map((n) => n.externalId);
    const toDelete = dbIds.filter((id) => !seenIds.has(id));

    if (toDelete.length > 0) {
      await prisma.news.deleteMany({ where: { externalId: { in: toDelete } } });
    }
  } catch (err) {
    console.error("❌ Error reading emails via Graph: ", err);
  }
};

/* ----------------------------
   SEARCH NEWS
---------------------------- */
const searchNews = async (req, res) => {
  const query = req.query.q;

  if (!query || query === "") {
    const all = await prisma.news.findMany({ orderBy: { sendedAt: "desc" } });
    return res.status(200).json({ results: all });
  }

  const textMatches = await prisma.news.findMany({
    where: {
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { content: { contains: query, mode: "insensitive" } },
      ],
    },
  });

  return res.status(200).json({ results: textMatches });
};

export { sendMail, passwordMail, email_sender, new_user_notification, readEmails, readSentOnboardingEmails, searchNews };