import dotenv from "dotenv";
import Mailgen from "mailgen";
import { pool, prisma } from "../config/dbConfig.js";
import { encrypt } from "./crypto.js";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import { APP_SCOPES } from "../config/msalConfig.js";

dotenv.config();

/* ----------------------------
   GRAPH CONFIG (for sending)
---------------------------- */
const credential = new ClientSecretCredential(
  process.env.MS_TENANT_ID,
  process.env.MS_CLIENT_ID,
  process.env.MS_CLIENT_SECRET
);

const graphClient = Client.initWithMiddleware({
  authProvider: {
    getAccessToken: async () => {
      const tokenResponse = await credential.getToken(APP_SCOPES.join(" "));
      return tokenResponse.token;
    },
  },
});

/* ----------------------------
   SEND EMAILS (Graph)
---------------------------- */
const sendMail = async (email, subject, body) => {
  if (!email || !body || !subject) {
    throw new Error("Email, subject and body are required");
  }

  let mailGenerator = new Mailgen({
    theme: "default",
    product: {
      name: `GoldenTrust Insurance's Intranet`,
      link: "https://goldentrustinsurance.com/",
    },
  });

  let response = { body };
  let mailHtml = mailGenerator.generate(response);

  const message = {
    message: {
      subject,
      body: {
        contentType: "HTML",
        content: mailHtml,
      },
      toRecipients: [
        {
          emailAddress: {
            address: email,
          },
        },
      ],
      from: {
        emailAddress: {
          address: process.env.G_EMAIL,
        },
      },
    },
  };

  await graphClient.api(`/users/${process.env.G_EMAIL}/sendMail`).post(message);
};

//* ----------------------------
// PASSWORD MAIL
// ---------------------------- */
const passwordMail = async (req, res) => {
  const email = req.params.email;
  const baseUrl = process.env.BASE_URL
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
        id: iv
      }
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
    intro: `Welcome to GoldenHealth! We're very excited to have you on board.`,
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

/* ----------------------------
   GENERIC EMAIL SENDER
---------------------------- */
const email_sender = async (req, res) => {
  const { subject, body } = req.body;
  const email = req.params.email;

  try {
    await sendMail(email, subject, body);
    return res.status(200).json({ success: true, message: "Email sent successfully" });
  } catch (error) {
    console.error("Error sending email:", error);
    return res.status(500).json({ success: false, message: "Failed to send email" });
  }
};

/* ----------------------------
   NEW USER NOTIFICATION
---------------------------- */
const new_user_notification = async (req, res) => {
  const { email, recommendation } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  try {
    const alerts = await prisma.newUserAlerts.findMany({});
    if (!alerts || alerts.length === 0) {
      return res.status(200).json({ message: "No notification emails configured." });
    }

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
      outro: "This is an automated message from the GoldenTrust Insurance's Intranet.",
    };

    for (const alert of alerts) {
      try {
        await sendMail(alert.email, subject, body); // ← usa Graph
      } catch (err) {
        console.error(`Error sending notification to ${alert.email}:`, err);
      }
    }

    return res.status(200).json({ message: "Notifications sent." });
  } catch (error) {
    console.error("Error sending new user notifications:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

/* ----------------------------
   READ EMAILS FUNCTION (Graph)
---------------------------- */

async function getAllMessages(userEmail) {
  let messages = [];
  let nextLink = `/users/${userEmail}/messages?$orderby=sentDateTime DESC&$select=id,subject,bodyPreview,from,sentDateTime,conversationId`;

  try {
    while (nextLink) {
      const response = await graphClient.api(nextLink).get();

      if (response.value) {
        messages = messages.concat(response.value);
      }

      // Graph devuelve @odata.nextLink si hay más páginas
      nextLink = response["@odata.nextLink"] ? response["@odata.nextLink"] : null;
    }
  } catch (err) {
    console.error("Error fetching messages from Graph:", err);
  }

  return messages;
}

const readEmails = async () => {
  try {
    const messagesResponse = await getAllMessages(process.env.G_EMAIL);

    const messages = messagesResponse.value || [];
    const seenIds = [];

    for (const msg of messages) {
      const uniqueId = msg.id;
      seenIds.push(uniqueId);

      const cleanContent = msg.bodyPreview?.trim() || "(No Content)";

      await prisma.news.upsert({
        where: { externalId: uniqueId },
        update: {
          sender: msg.from?.emailAddress?.address || "Unknown",
          title: msg.subject || "(No Subject)",
          content: cleanContent,
          sendedAt: new Date(msg.sentDateTime),
        },
        create: {
          externalId: uniqueId,
          sender: msg.from?.emailAddress?.address || "Unknown",
          title: msg.subject || "(No Subject)",
          content: cleanContent,
          sendedAt: new Date(msg.sentDateTime),
        },
      });
    }

    const dbNews = await prisma.news.findMany({ select: { externalId: true } });
    const dbIds = dbNews.map((n) => n.externalId);
    const toDelete = dbIds.filter((id) => !seenIds.includes(id));

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

export { sendMail, passwordMail, email_sender, new_user_notification, readEmails, searchNews };