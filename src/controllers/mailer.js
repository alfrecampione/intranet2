import nodemailer from "nodemailer";
import Mailgen from "mailgen";
import dotenv from "dotenv";
import { pool, prisma } from "../config/dbConfig.js";
import { prismaContext } from "../config/prismaContext.js";
import { encrypt } from "./crypto.js";
import { decrypt } from "./crypto.js";
import Imap from "imap-simple";
import { simpleParser } from "mailparser";
import cron from "node-cron";

dotenv.config();

/* ----------------------------
   SMTP CONFIG (for sending)
---------------------------- */
const mailConfig = {
  service: "gmail",
  auth: {
    user: process.env.G_EMAIL,
    pass: process.env.G_PASSWORD,
  },
};

/* ----------------------------
   SEND EMAILS
---------------------------- */
const sendMail = async (email, subject, body) => {
  if (!email || !body || !subject) {
    throw new Error("Email, subject and body are required");
  }

  let transporter = nodemailer.createTransport(mailConfig);

  let mailGenerator = new Mailgen({
    theme: "default",
    product: {
      name: `GoldenTrust Insurance's Intranet`,
      link: "https://goldentrustinsurance.com/",
    },
  });

  let response = { body };
  let mail = mailGenerator.generate(response);

  let message = {
    from: `GTI <${process.env.G_EMAIL}>`,
    to: email,
    subject,
    html: mail,
  };

  await transporter.sendMail(message);
};
/* ----------------------------
   PASSWORD MAIL
---------------------------- */
const passwordMail = async (req, res) => {
  const email = req.params.email;
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const { encryptedData, key, iv } = encrypt(email);

  let result, prismaUser;
  try {
    // Search in Postgres
    result = await pool.query(
      `SELECT display_name FROM entra.users WHERE mail = $1 AND active = true AND location_id > 0`,
      [email],
    );

    // Search in Prisma
    prismaUser = await prisma.user.findUnique({
      where: { email: email, isReleased: false },
    });

    // Insert encrypted data
    await pool.query(
      `INSERT INTO admin.crypto(encrypted_data, key, iv) VALUES ($1, $2, $3);`,
      [encryptedData, key, iv],
    );
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
    outro: `Need help, or have questions? Just reply to this email, we'd love to help.`,
  };

  try {
    await sendMail(email, "Create your password", body);
    return res.status(201).json({ msg: "You should receive an email" });
  } catch (err) {
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
        await sendMail(alert.email, subject, body);
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
   IMAP CONFIG (for reading)
---------------------------- */
const imapConfig = {
  imap: {
    user: process.env.G_EMAIL,
    password: process.env.G_PASSWORD,
    host: "imap.gmail.com",
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 3000,
  },
};


import crypto from "crypto";

const VECTOR_SIZE = 512;

function textToVector(text) {
  const vector = new Array(VECTOR_SIZE).fill(0);
  if (!text) return vector;

  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúüñ]+/gi, " ")
    .split(" ")
    .filter(Boolean);

  for (const token of tokens) {
    const hash = crypto.createHash("md5").update(token).digest("hex");
    const index = parseInt(hash.substring(0, 8), 16) % VECTOR_SIZE;
    vector[index] += 1;
  }

  return vector;
}

function cosineSimilarity(vecA, vecB) {
  const dot = vecA.reduce((acc, v, i) => acc + v * vecB[i], 0);
  const normA = Math.sqrt(vecA.reduce((acc, v) => acc + v * v, 0));
  const normB = Math.sqrt(vecB.reduce((acc, v) => acc + v * v, 0));
  return normA && normB ? dot / (normA * normB) : 0;
}

/* ----------------------------
   READ EMAILS FUNCTION
---------------------------- */
function extractLatestMessage(content) {
  if (!content) return "(No Content)";
  const patterns = [
    /^On .* wrote:/mi,
    /^De:/mi,
    /^From:/mi,
    /-----Original Message-----/i,
    /----- Mensaje original -----/i,
  ];

  for (let pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return content.substring(0, match.index).trim();
    }
  }
  return content.trim();
}

const readEmails = async () => {
  try {
    const connection = await Imap.connect(imapConfig);
    await connection.openBox("INBOX");

    const sinceDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const imapDate = sinceDate
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .replace(/ /g, "-");

    const searchCriteria = [["SINCE", imapDate]];
    const fetchOptions = { bodies: [""], struct: true, markSeen: false };

    const messages = await connection.search(searchCriteria, fetchOptions);

    const seenIds = [];

    for (let item of messages) {
      const all = item.parts.find((part) => part.which === "");
      const parsed = await simpleParser(all.body);

      const uniqueId = parsed.messageId || item.attributes.uid.toString();
      seenIds.push(uniqueId);

      const cleanContent = extractLatestMessage(parsed.text || parsed.html);
      const textToEmbed = `${parsed.subject || ""} ${cleanContent}`;
      const embedding = textToVector(textToEmbed);

      await prisma.news.upsert({
        where: { externalId: uniqueId },
        update: {
          sender: parsed.from?.text || "Unknown",
          title: parsed.subject || "(No Subject)",
          content: cleanContent,
          sendedAt: parsed.date || new Date(),
          embedding,
        },
        create: {
          externalId: uniqueId,
          sender: parsed.from?.text || "Unknown",
          title: parsed.subject || "(No Subject)",
          content: cleanContent,
          sendedAt: parsed.date || new Date(),
          embedding,
        },
      });
    }

    const dbNews = await prisma.news.findMany({ select: { externalId: true } });
    const dbIds = dbNews.map((n) => n.externalId);
    const toDelete = dbIds.filter((id) => !seenIds.includes(id));

    if (toDelete.length > 0) {
      await prisma.news.deleteMany({ where: { externalId: { in: toDelete } } });
    }

    connection.end();
  } catch (err) {
    console.error("❌ Error reading emails: ", err);
  }
};

/* ---------------------------- 
    CRON JOB (every hour) 
---------------------------- */
cron.schedule("0 * * * *", () => {
  readEmails();
});



const searchNews = async (req, res) => {
  const query = req.query.q

  if (!query || query === '') {
    const all = await prisma.news.findMany({ orderBy: { sendedAt: "desc" } });
    return res.status(200).json({ results: all });
  }

  const limit = parseInt(req.query.limit) || 5;

  if (!query || query.trim().length === 0) return [];

  const queryEmbedding = textToVector(query);

  const textMatches = await prisma.news.findMany({
    where: {
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { content: { contains: query, mode: "insensitive" } },
      ],
    },
    take: limit,
  });

  const allWithEmbeddings = await prisma.news.findMany({
    where: { embedding: { not: null } },
  });

  const vectorMatches = allWithEmbeddings
    .map((news) => ({
      ...news,
      similarity: cosineSimilarity(queryEmbedding, news.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  const combined = [...textMatches, ...vectorMatches];
  const seen = new Map();

  const merged = combined
    .map((row) => {
      if (!seen.has(row.id)) {
        seen.set(row.id, { ...row, score: row.similarity || 0.5 });
      } else {
        seen.get(row.id).score += 0.5;
      }
      return seen.get(row.id);
    })
    .filter((v, i, arr) => arr.findIndex((a) => a.id === v.id) === i)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return res.status(200).json({ results: merged });
};

export { sendMail, passwordMail, email_sender, new_user_notification, readEmails, searchNews };