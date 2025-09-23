import { pool, prisma } from "../config/dbConfig.js";
import bcrypt from "bcrypt";
import { sendMail } from "./mailer.js";
import { decryptEmail, deleteEncryptedEmail } from "./cryptUtils.js";
import { prismaContext } from "../config/prismaContext.js";

const login = (req, res) => {
  res.render("login");
};

const signUp = async (req, res) => {
  const { encrypted_email } = req.params;
  if (!encrypted_email) {
    return res.status(400).json({ success: false, message: "Email is required" });
  }

  const emailResult = await decryptEmail({ params: { encrypted_email: encrypted_email } }, {
    status: () => ({
      json: (data) => data,
    })
  });

  if (!emailResult || !emailResult.data || !emailResult.data.email) {
    return res.status(400).json({ success: false, message: "Invalid encrypted email" });
  }

  await deleteEncryptedEmail(encrypted_email);

  res.render("signUp", { email: emailResult.data.email });
};

const createAccount = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required" });
  }

  await prismaContext.run({ userId: req.user?.user_id ?? "anonymous" }, async () => {
    try {
      const result = await prisma.user.findUnique({ where: { email, isReleased: false } });

      if (result) {
        return res
          .status(400)
          .json({ success: false, message: "Email already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const confirmationCode = Math.floor(100000 + Math.random() * 900000).toString();

      await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          confirmationCode
        }
      });

      const subject = "Email Confirmation Code";
      const body = {
        name: email,
        intro: `Your confirmation code is: ${confirmationCode}`,
        outro: `If you did not request this, please ignore this email.`
      };

      await sendMail(email, subject, body);

      return res.status(201).json({ success: true, email });
    } catch (err) {
      console.error("createAccount function error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  });
};

const renderEmailValidation = (req, res) => {
  res.render("validateEmail", { email: req.query.email });
};

const leadToAgent = async (user, user_id) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { email: user.email }
    });

    if (lead && lead.isAcepted) {
      await prismaContext.run({ userId: user_id ?? "anonymous" }, async () => {
        try {
          await prisma.personalInfo.create({
            data: {
              userId: user.user_id,
              legalName: lead.fullName,
              dateOfBirth: lead.dateOfBirth,
              npn: lead.npn
            }
          });
          await prisma.contactInfo.create({
            data: {
              userId: user.user_id,
              personalPhone: lead.phone,
              city: lead.city,
              state: lead.state,
              zipCode: lead.zipCode,
              addressLine1: lead.address,
            }
          });
          await prisma.lead.delete({
            where: { id: lead.id }
          });
        } catch (err) {
          console.error("Error updating user role to agent:", err);
        }
      });
    }
  }
  catch (error) {
    console.error("Error in leadToAgent:", error);
  }
};

const validateEmail = async (req, res, next) => {
  const { email, confirmationCode } = req.body;

  await prismaContext.run({ userId: req.user?.user_id ?? "anonymous" }, async () => {
    try {
      const existingUser = await prisma.user.findFirst({
        where: { confirmationCode }
      });

      if (!existingUser || existingUser.email !== email) {
        return res.status(400).json({
          success: false,
          message: "Invalid email or confirmation code"
        });
      }

      await prisma.user.update({
        where: { email },
        data: { confirmationCode: null }
      });

      const user = {
        user_id: existingUser.user_id,
        email: existingUser.email,
        password: existingUser.password
      };

      await leadToAgent(existingUser, req.user?.user_id);

      req.login(user, (err) => {
        if (err) {
          console.error("Login error:", err);
          return next(err);
        }
        return res.status(200).json({ success: true, redirect: "/users/dashboard" });
      });
    } catch (err) {
      console.error("validateEmail function error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  });
};

const index = (req, res) => {
  res.redirect("/users/dashboard");
};

const renderResetPassword = (req, res) => {
  const encrypted = req.params.email;
  res.render("reset-password", { encrypted: encrypted });
};

const resetPassword = async (req, res) => {
  const encrypted = req.params.email;
  const { password } = req.body;

  try {
    const emailResult = await decryptEmail({ params: { encrypted_email: encrypted } }, {
      status: () => ({
        json: (data) => data,
      })
    });

    if (!emailResult || !emailResult.data?.email) {
      return res.redirect("/login");
    }

    const email = emailResult.data.email;
    const hashedPassword = await bcrypt.hash(password, 10);

    pool.query(
      `UPDATE entra.users SET password=$1 WHERE mail=$2`,
      [hashedPassword, email],
      async (err) => {
        if (err) {
          console.log(`resetPassword function error`, err);
        }

        await prismaContext.run({ userId: req.user?.user_id ?? "anonymous" }, async () => {
          try {
            const prismaUser = await prisma.user.findUnique({ where: { email, isReleased: false } });
            if (prismaUser) {
              await prisma.user.update({
                where: { email },
                data: { password: hashedPassword }
              });
            }
            await prisma.crypto.delete({
              where: { encrypted_data: encrypted }
            })
          } catch (prismaErr) {
            console.log(`resetPassword Prisma error`, prismaErr);
          }
        });
        res.redirect("/login");
      }
    );
  } catch (error) {
    console.log(`resetPassword function error`, error);
    return res.status(500).redirect("/login");
  }
};

const logout = (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
  });
  req.flash("success_msg", "You have logged out");
  res.redirect("/login");
};

const checkAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return res.redirect("users/dashboard");
  }
  next();
};

const checkNotAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
};

export {
  login,
  index,
  renderResetPassword,
  resetPassword,
  logout,
  checkAuthenticated,
  checkNotAuthenticated,
  createAccount,
  signUp,
  validateEmail,
  renderEmailValidation,
};
