import { pool, prisma } from "../config/dbConfig.js";
import { decrypt } from "./crypto.js";
import bcrypt from "bcrypt";
import { sendMail } from "./mailer.js";
import { decryptEmail } from "./cryptUtils.js";

const login = (req, res) => {
  res.render("login");
};

const signUp = async (req, res) => {
  const encrypted = req.params.email;
  if (!encrypted) {
    return res.status(400).json({ success: false, message: "Email is required" });
  }

  const emailResult = await decryptEmail({ params: { encrypted_email: encrypted } }, {
    status: () => ({
      json: (data) => data,
    })
  });
  if (!emailResult || !emailResult.data || !emailResult.data.email) {
    return res.status(400).json({ success: false, message: "Invalid encrypted email" });
  }
  res.render("signUp", emailResult.data.email);
};

const createAccount = async (req, res) => {
  const { email, password } = req.body;

  // Validate all required fields
  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required" });
  }

  try {
    const result = await prisma.user.findUnique({ where: { email: email } });

    if (result) {
      return res
        .status(400)
        .json({ success: false, message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const confirmationCode = Math.floor(
      100000 + Math.random() * 900000,
    ).toString(); // Generate a 6-digit confirmation code

    await prisma.user.create({
      data: {
        email: email,
        password: hashedPassword,
        confirmationCode: confirmationCode,
      },
    });

    const subject = "Email Confirmation Code";

    const body = {
      name: email,
      intro: `Your confirmation code is: ${confirmationCode}`,
      outro: `If you did not request this, please ignore this email.`,
    }

    await sendMail(email, subject, body);

    return res.status(201).json({ success: true, email: email });
  } catch (err) {
    console.error("createAccount function error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const renderEmailValidation = (req, res) => {
  res.render("validateEmail", { email: req.query.email });
};

const validateEmail = async (req, res, next) => {
  const { email, confirmationCode } = req.body;

  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        confirmationCode: confirmationCode,
      },
    });

    if (!existingUser) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or confirmation code",
      });
    }

    if (existingUser.email !== email) {
      return res.status(400).json({
        success: false,
        message: "Email does not match the confirmation code",
      });
    }

    await prisma.user.update({
      where: { email: email },
      data: { confirmationCode: null },
    });

    const user = {
      user_id: existingUser.user_id,
      email: existingUser.email,
      password: existingUser.password,
    };

    req.login(user, (err) => {
      if (err) {
        console.error("Login error:", err);
        return next(err);
      }
      return res
        .status(200)
        .json({ success: true, redirect: "/users/registration" });
    });
  } catch (err) {
    console.error("validateEmail function error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/*
const loginCheck = (req, res) => {
    const {email, password} = req.body;
    pool.query(`SELECT * FROM entra.users WHERE mail = $1`, [email], (err, result) => {
        if(err) {
            console.log(`loginCheck function error`, err);
            res.redirect('/login');
        }
    })
}*/

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

    if (!emailResult || !emailResult.data || !emailResult.data.email) {
      return res.redirect("/login");
    }

    const email = emailResult.data.email;
    const hashedPassword = await bcrypt.hash(password, 10);
    pool.query(
      `UPDATE entra.users SET password=$1 WHERE mail=$2`,
      [hashedPassword, email],
      async (err, result) => {
        if (err) {
          console.log(`resetPassword function error`, err);
        }

        try {
          const prismaUser = await prisma.user.findUnique({
            where: { email: email },
          });
          if (prismaUser) {
            await prisma.user.update({
              where: { email: email },
              data: { password: hashedPassword },
            });
          }
        } catch (prismaErr) {
          console.log(`resetPassword Prisma error`, prismaErr);
        }

        pool.query(
          `DELETE FROM admin.crypto WHERE encrypted_data = $1`,
          [encrypted],
          async (err, result) => {
            if (err) {
              console.log(`resetPassword function error`, err);
            }
          },
        );
        res.redirect("/login");
      },
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
