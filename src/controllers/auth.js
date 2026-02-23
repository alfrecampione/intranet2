import { prisma } from "../config/dbConfig.js";
import bcrypt from "bcrypt";
import { sendMail } from "./mailer.js";
import { decryptEmailDirect, deleteEncryptedEmail } from "./cryptUtils.js";
import { prismaContext } from "../config/prismaContext.js";
import { cca, LOGIN_SCOPES } from "../config/msalConfig.js";
import { getVisibleAgentsId } from "../config/utils.js";
import e from "express";

const login = (req, res) => {
  res.render("login");
};

const signUp = async (req, res) => {
  const { encrypted_email } = req.params;
  if (!encrypted_email) {
    return res.status(400).json({ success: false, message: "Email is required" });
  }
  try {
    const email = await decryptEmailDirect(encrypted_email);

    if (!email) {
      return res.status(400).json({ success: false, message: "Invalid encrypted email" });
    }

    res.render("signUp", { email: email, encrypted_email: encrypted_email });
  } catch (error) {
    console.error("signUp function error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Ensure the user has the base profile-related records so the profile page renders editable sections
const ensureUserProfileRecords = async (userId, email) => {
  const [personalInfo, contactInfo, paymentMethod, documents, necesaryDocs] = await Promise.all([
    prisma.personalInfo.findUnique({ where: { userId } }),
    prisma.contactInfo.findUnique({ where: { userId } }),
    prisma.paymentMethod.findUnique({ where: { userId } }),
    prisma.documents.findUnique({ where: { userId } }),
    email ? prisma.necesaryDocuments.findUnique({ where: { email } }) : Promise.resolve(null),
  ]);

  const creations = [];

  if (!personalInfo) creations.push(prisma.personalInfo.create({ data: { userId } }));
  if (!contactInfo) creations.push(prisma.contactInfo.create({ data: { userId } }));
  if (!paymentMethod) creations.push(prisma.paymentMethod.create({ data: { userId } }));
  if (!documents) creations.push(prisma.documents.create({ data: { userId } }));
  if (email && !necesaryDocs) creations.push(prisma.necesaryDocuments.create({ data: { email } }));

  if (creations.length) {
    await Promise.all(creations);
  }
};

const createAccount = async (req, res) => {
  const { email, password } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: "Email is required" });
  }

  const isMicrosoftEmail = email.toLowerCase().endsWith("@goldentrust.com");
  const requiresPassword = !isMicrosoftEmail;

  if (requiresPassword && !password) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required" });
  }

  await prismaContext.run({ userId: req.user?.user_id ?? "anonymous" }, async () => {
    try {
      const result = await prisma.user.findUnique({ where: { email } });

      if (result && result.confirmationCode === null) {
        return res
          .status(400)
          .json({ success: false, message: "Email already exists" });
      }

      const confirmationCode = Math.floor(100000 + Math.random() * 900000).toString();

      if (isMicrosoftEmail) {
        // For Microsoft SSO users: no password required, mark password field and still send confirmation code
        const passwordValue = "Microsoft Login";

        if (result && result.confirmationCode) {
          await prisma.user.update({
            where: { email },
            data: {
              password: passwordValue,
              confirmationCode
            }
          });
        } else if (result && result.confirmationCode === null) {
          // Email exists and already confirmed
          return res.status(400).json({ success: false, message: "Email already exists" });
        } else {
          await prisma.user.create({
            data: {
              email,
              password: passwordValue,
              confirmationCode
            }
          });
        }
      } else {
        // Standard local signup
        const hashedPassword = await bcrypt.hash(password, 10);

        if (result && result.confirmationCode) {
          await prisma.user.update({
            where: { email },
            data: {
              password: hashedPassword,
              confirmationCode
            }
          });
        } else if (result && result.confirmationCode === null) {
          return res.status(400).json({ success: false, message: "Email already exists" });
        } else {
          await prisma.user.create({
            data: {
              email,
              password: hashedPassword,
              confirmationCode
            }
          });
        }
      }

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

const renderEmailValidation = async (req, res) => {
  const encryptedEmail = req.query.encryptedEmail;
  if (!encryptedEmail) {
    return res.status(400).json({ success: false, message: "Email is required" });
  }

  res.render("validateEmail", { encryptedEmail: encryptedEmail });
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
  const { encryptedEmail, confirmationCode } = req.body;

  await prismaContext.run({ userId: req.user?.user_id ?? "anonymous" }, async () => {
    try {
      const email = await decryptEmailDirect(encryptedEmail);

      if (!email) {
        res.render("login", { error: "Invalid encrypted email" });
        return;
      }
      await deleteEncryptedEmail(encryptedEmail);

      const existingUser = await prisma.user.findFirst({
        where: { confirmationCode }
      });

      if (!existingUser || existingUser.email !== email) {
        res.render("login", { error: "Invalid confirmation code" });
        return;
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

      // Create placeholder profile records so the profile view can render editable sections immediately
      await ensureUserProfileRecords(existingUser.user_id, email);

      await req.login(user, async (err) => {
        if (err) {
          console.error("Login error:", err);
          return next(err);
        }

        return res.status(200).json({ success: true, redirect: "/users/registration" });
      });

    } catch (error) {
      console.error("validateEmail function error:", error);
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
    const email = await decryptEmailDirect(encrypted);

    if (!email) {
      return res.redirect("/login");
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    await prismaContext.run({ userId: req.user?.user_id ?? "anonymous" }, async () => {
      try {
        const prismaUser = await prisma.user.findUnique({ where: { email, isReleased: false } });
        if (prismaUser) {
          await prisma.user.update({
            where: { email },
            data: { password: hashedPassword, hastoChangePassword: false }
          });
        }
        const cryptoRecord = await prisma.crypto.findFirst({
          where: { encrypted_data: encrypted }
        });
        if (cryptoRecord) {
          await prisma.crypto.delete({
            where: { id: cryptoRecord.id }
          });
        }
      } catch (prismaErr) {
        console.log(`resetPassword Prisma error`, prismaErr);
      }
    });
    res.redirect("/login");
  } catch (error) {
    console.log(`resetPassword function error`, error);
    return res.status(500).redirect("/login");
  }
};

const logout = (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);

    const isMicrosoftLogin = req.user?.isMicrosoftLogin;

    req.session.destroy(() => {
      if (isMicrosoftLogin) {
        const msLogoutUrl = `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/logout?post_logout_redirect_uri=${process.env.POST_LOGOUT_REDIRECT_URI}`;
        return res.redirect(msLogoutUrl);
      } else {
        return res.redirect("/login");
      }
    });
  });
};

const microsoftLogout = (req, res) => {
  return res.redirect("/login");
};

const checkAuthenticated = (req, res, next) => {
  if (req.user && (req.user.registrationCompleted === false)) {
    if (req.path === '/users/registration') {
      return next();
    }
    return res.redirect("/users/registration");
  }
  if (req.isAuthenticated()) {
    return res.redirect("users/dashboard");
  }
  next();
};

const checkNotAuthenticated = async (req, res, next) => {
  if (req.user && (req.user.registrationCompleted === false)) {
    if (req.path === '/users/registration') {
      return next();
    }
    if (req.method !== 'GET') {
      return next();
    }
    return res.redirect('/users/registration');
  }
  if (req.user && req.user.registrationCompleted === true) {
    if (req.path === '/users/registration') {
      return res.redirect('/users/dashboard');
    }
  }
  if (req.path.startsWith('/users/profile/') && req.method === 'GET') {
    if (req.user && req.user.isMicrosoftLogin && req.user.rights.includes(1)) {
      return next();
    }
    const id = req.path.split('/')[3];
    const allowedIds = await getVisibleAgentsId(req.user);
    allowedIds.push(req.user.user_id);
    if (req.user && allowedIds.includes(id)) {
      return next();
    }
    return res.status(403).send("Forbidden");
  }

  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
};

const checkReadRight = (req, res, next) => {
  if (req.user && (req.user.rights && req.user.rights.includes(1))) {
    return next();
  }
  return res.status(403).send("Forbidden");
}

const checkWriteRight = async (req, res, next) => {
  if (req.user && req.user.rights && req.user.rights.includes(2)) {
    return next();
  }
  if (req.path.startsWith('/users/profile/save-section') && req.method === 'POST') {
    const allowedIds = await getVisibleAgentsId(req.user.user_id);
    allowedIds.push(req.user.user_id);
    if (req.user && allowedIds.includes(req.body.userId)) {
      return next();
    }
    return res.status(403).send("Forbidden");
  }
  return res.status(403).send("Forbidden");
}

const microsoftLogin = async (req, res, next) => {
  const { email } = req.body;

  if (!email.endsWith("@goldentrust.com")) {
    return next("route");
  }

  try {
    const authCodeUrlParameters = {
      scopes: LOGIN_SCOPES,
      redirectUri: process.env.REDIRECT_URI,
      loginHint: email,
      prompt: "login",
    };

    const authCodeUrl = await cca.getAuthCodeUrl(authCodeUrlParameters);
    return res.redirect(authCodeUrl);
  } catch (err) {
    console.error("MS login redirect error:", err);
    return next(err);
  }
};

const microsoftCallback = async (req, res, next) => {
  const tokenRequest = {
    code: req.query.code,
    scopes: LOGIN_SCOPES,
    redirectUri: process.env.REDIRECT_URI,
  };

  try {
    const response = await cca.acquireTokenByCode(tokenRequest);

    const graphResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${response.accessToken}` },
    });
    const userProfile = await graphResponse.json();

    const prismaUser = await prisma.user.findUnique({
      where: { email: userProfile.userPrincipalName }
    });

    if (prismaUser) {
      req.login(prismaUser, (err) => {
        if (err) return next(err);
        req.session.justLoggedIn = true;
        return res.redirect("/users/dashboard");
      });
    } else {
      const msUser = {
        user_id: response.account.homeAccountId,
        display_name: userProfile.displayName,
        email: userProfile.userPrincipalName,
        tenantId: response.account.tenantId,
        isMicrosoftLogin: true,
      };

      req.login(msUser, (err) => {
        if (err) return next(err);
        req.session.justLoggedIn = true;
        return res.redirect("/users/dashboard");
      });
    }
  } catch (err) {
    console.error("Microsoft callback error:", err);
    return res.redirect("/login");
  }
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
  microsoftLogin,
  microsoftCallback,
  microsoftLogout,
  checkReadRight,
  checkWriteRight,
};
