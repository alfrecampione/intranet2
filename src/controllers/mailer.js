import nodemailer from "nodemailer";
import Mailgen from "mailgen";
import dotenv from "dotenv";
import { pool, prisma } from "../config/dbConfig.js";
import { encrypt } from "./crypto.js";
import { decrypt } from "./crypto.js";

dotenv.config();

const passwordMail = async (req, res) => {
  const email = req.params.email;

  const baseUrl = `${req.protocol}://${req.get('host')}`;

  console.log("baseUrl", baseUrl);

  const { encryptedData, key, iv } = encrypt(email);
  let result, result1, prismaUser;

  try {
    // Search in Postgres
    result = await pool.query(
      `SELECT display_name FROM entra.users WHERE mail = $1 AND active = true AND location_id > 0`,
      [email],
    );
    // Search in Prisma
    prismaUser = await prisma.user.findUnique({
      where: { email: email },
    });
    // Insert encrypted data
    result1 = await pool.query(
      `INSERT INTO admin.crypto(encrypted_data, key, iv) VALUES ($1, $2, $3);`,
      [encryptedData, key, iv],
    );
  } catch (error) {
    console.log("POSTGRESQL/PRISMA:", error);
    return res.status(500).json({ msg: "Data Access Error" });
  }

  // If not found in either source
  if ((result.rows.length === 0) && !prismaUser) {
    return res
      .status(401)
      .json({ msg: `Please enter an existing email` });
  }

  let config = {
    service: "gmail",
    auth: {
      user: process.env.G_EMAIL,
      pass: process.env.G_PASSWORD,
    },
  };

  let transporter = nodemailer.createTransport(config);

  let mailGenerator = new Mailgen({
    theme: "default",
    product: {
      name: `GoldenTrust Insurance's Intranet`,
      link: "https://mailgen.js/",
    },
  });

  const body = {
    name: email,
    intro: `Welcome to GoldenTrust Insurance! We're very excited to have you on board.`,
    action: {
      instructions: "To get started, please click here:",
      button: {
        color: "#27388B", // Optional action button color
        text: "Create your password",
        link:
          `${baseUrl}/users/auth/reset-password/${encryptedData}`,
      },
    },
    outro: `Need help, or have questions? Just reply to this email, we'd love to help.`,
  }

  let response = {
    body: body,
  };

  let mail = mailGenerator.generate(response);

  let message = {
    from: `GTI <${process.env.G_EMAIL}>`,
    to: email,
    subject: "Create your password",
    html: mail,
  };

  transporter
    .sendMail(message)
    .then(() => {
      return res.status(201).json({
        msg: "You should receive an email",
      });
    })
    .catch((err) => {
      return res.status(500).json({ err });
    });
};

const sendMail = async (email, subject, body) => {
  if (!email || !body || !subject) {
    throw new Error("Email, subject and body are required");
  }

  let config = {
    service: "gmail",
    auth: {
      user: process.env.G_EMAIL,
      pass: process.env.G_PASSWORD,
    },
  };

  let transporter = nodemailer.createTransport(config);

  let mailGenerator = new Mailgen({
    theme: "default",
    product: {
      name: `GoldenTrust Insurance's Intranet`,
      link: "https://goldentrustinsurance.com/",
    },
  });

  let response = {
    body: body,
  };

  let mail = mailGenerator.generate(response);

  let message = {
    from: `GTI <${process.env.G_EMAIL}>`,
    to: email,
    subject: subject,
    html: mail,
  };

  await transporter.sendMail(message);
};

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

const new_user_notification = async (req, res) => {
  const { email, recommendation } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  try {
    // Get all notification emails from NewUserAlerts table
    const alerts = await prisma.newUserAlerts.findMany({});
    if (!alerts || alerts.length === 0) {
      return res.status(200).json({ message: "No notification emails configured." });
    }

    // Prepare email content
    const subject = "New user created";
    const body = {
      intro: `The user with the email <b>${email}</b> has been created in the system.`,
      ...(recommendation?.trim() && {
        table: {
          data: [
            { "User Recommendation": recommendation }
          ],
          columns: {
            customWidth: { "User Recommendation": "100%" },
            customAlignment: { "User Recommendation": "left" }
          }
        }
      }),
      outro: "This is an automated message from the GoldenTrust Insurance's Intranet."
    };

    // Send email to each alert email
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


export { passwordMail, sendMail, email_sender, new_user_notification };
