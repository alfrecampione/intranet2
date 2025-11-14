import { Strategy as LocalStrategy } from "passport-local";
import { prisma } from "./dbConfig.js";
import bcrypt from "bcrypt";
import { cca, LOGIN_SCOPES } from "./msalConfig.js";
import passport from "passport";
import { getMSAPhotoPath, getMSARealId } from "./utils.js";
import { get } from "https";

// ---------------------- PASSPORT INITIALIZE ----------------------
const initialize = (passport) => {
  const authenticateUser = async (email, password, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          personalInfo: {
            select: { photoPath: true, contactType: true },
          },
        },
      });

      if (!user) {
        console.log(`Login failed for ${email}: Email is not registered`);
        return done(null, false, { msg: "Email is not registered" });
      }

      if (user.hastoChangePassword) {
        return done(null, false, { msg: "You are required to change your password" });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        console.log(`Login failed for ${email}: Password is not correct`);
        return done(null, false, { msg: "Password is not correct" });
      }

      return done(null, user);
    } catch (err) {
      console.error("Error during authentication:", err);
      return done(err);
    }
  };

  passport.use(
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
      authenticateUser
    )
  );

  passport.serializeUser((user, done) => {
    if (user.isMicrosoftLogin) {
      done(null, { type: "ms", ...user });
    } else {
      done(null, { type: "local", user_id: user.user_id });
    }
  });

  passport.deserializeUser(async (obj, done) => {
    try {
      if (obj.type === "local") {
        const user = await prisma.user.findFirst({
          where: { user_id: obj.user_id },
          include: {
            personalInfo: { select: { photoPath: true, contactType: true } },
          },
        });

        const userRights = await prisma.allowedAgents.findUnique({
          where: { email: user.email },
          include: { AgentRights: true },
        });

        const filledUser = {
          ...user,
          isMicrosoftLogin: false,
          rights: userRights
            ? userRights.AgentRights.map((ar) => ar.idRight)
            : [],
        };
        return done(null, filledUser || false);
      } else if (obj.type === "ms") {
        const userRights = await prisma.allowedAgents.findUnique({
          where: { email: obj.email },
          include: { AgentRights: true },
        });

        const realId = getMSARealId(obj.user_id);

        const entra_user = await getMSAPhotoPath(realId);

        const user = {
          user_id: realId,
          email: obj.email,
          display_name: obj.display_name,
          tenantId: obj.tenantId,
          personalInfo: { photoPath: entra_user.length > 0 ? entra_user[0].photoPath : null },
          isMicrosoftLogin: true,
          rights: userRights
            ? userRights.AgentRights.map((ar) => ar.idRight)
            : [],
        }

        return done(null, user);
      }
      return done(null, false);
    } catch (err) {
      done(err);
    }
  });
};

// ---------------------- POST LOGIN ----------------------
const postLogin = async (req, res, next) => {
  const { email } = req.body;

  // MICROSOFT LOGIN
  if (email.endsWith("@goldentrust.com")) {
    try {
      const isAllowed = await prisma.allowedAgents.findUnique({ where: { email } });
      const healthAgent = await prisma.user.findUnique({ where: { email } });

      if (!(isAllowed || healthAgent)) {
        return res.status(401).json({ msg: "Unauthorized Microsoft account" });
      }

      const authCodeUrlParameters = {
        scopes: LOGIN_SCOPES,
        redirectUri: process.env.REDIRECT_URI,
        loginHint: email,
        prompt: "login",
      };

      const authCodeUrl = await cca.getAuthCodeUrl(authCodeUrlParameters);
      return res.json({ redirect: authCodeUrl }); // ✅ FRONTEND lo redirige
    } catch (err) {
      console.error("MS login redirect error:", err);
      return res.status(500).json({ msg: "Microsoft login failed" });
    }
  }

  // LOCAL LOGIN
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      console.error("Passport error:", err);
      return res.status(500).json({ msg: "Internal server error" });
    }

    if (!user) {
      // info.msg viene del done(null, false, { msg: "..." })
      return res.status(401).json({ msg: info?.msg || "Invalid credentials" });
    }

    req.logIn(user, (err) => {
      if (err) {
        console.error("Login session error:", err);
        return res.status(500).json({ msg: "Login failed" });
      }

      return res.json({
        success: true,
        redirect: "/users/dashboard",
      });
    });
  })(req, res, next);
};

// ---------------------- PASSPORT MIDDLEWARE ----------------------
const authenticate = (passport) => {
  return passport.authenticate("local", {
    successRedirect: "/users/dashboard",
    failureRedirect: "/login",
    failureFlash: true,
  });
};

export { initialize, authenticate, postLogin };