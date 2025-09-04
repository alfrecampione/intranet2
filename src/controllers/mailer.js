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
    tlsOptions: { rejectUnauthorized: false }, // 👈 add this
    authTimeout: 3000,
  },
};

/* ----------------------------
   READ EMAILS FUNCTION
---------------------------- */
const readEmails = async () => {
  try {
    const connection = await Imap.connect(imapConfig);
    await connection.openBox("INBOX");

    // ONLY 48 hours ago
    const sinceDate = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const imapDate = sinceDate.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).replace(/ /g, "-");

    const searchCriteria = [["SINCE", imapDate]];
    const fetchOptions = { bodies: [""], markSeen: false };

    const messages = await connection.search(searchCriteria, fetchOptions);

    await prisma.news.deleteMany({});

    for (let item of messages) {
      const all = item.parts.find((part) => part.which === "");
      const parsed = await simpleParser(all.body);

      try {
        await prisma.news.create({
          data: {
            sender: parsed.from.text,
            title: parsed.subject || "(No Subject)",
            content: parsed.text || parsed.html || "(No Content)",
            sendedAt: parsed.date || new Date(),
          },
        });
      } catch (error) {
        console.error("DB Insert Error:", error);
      }
    }

    connection.end();
  } catch (err) {
    console.error("Error reading emails:", err);
  }
};