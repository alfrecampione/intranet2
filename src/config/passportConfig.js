import { Strategy as LocalStrategy } from "passport-local";
import { pool, prisma } from "./dbConfig.js";
import bcrypt from "bcrypt";
import { cca, LOGIN_SCOPES } from "./msalConfig.js";

const initialize = (passport) => {
  const authenticateUser = async (email, password, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { email: email },
        include: {
          personalInfo: {
            select: { photoPath: true, contactType: true }
          }
        }
      });
      if (user.hastoChangePassword) {
        return res.status(401).json({ error: "Change your password" });
      }
      if (user) {
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
          if (user.hastoChangePassword) {
            return done(null, false, { msg: "Change your password" });
          }
          return done(null, user);
        } else {
          console.log(`Login failed for ${email}: Password is not correct`);
          return done(null, false, { msg: "Password is not correct" });
        }
      }
      else {
        console.log(`Login failed for ${email}: Email is not registered`);
        return done(null, false, { msg: "Email is not registered" });
      }
    } catch (err) {
      return done(err);
    }
  };

  passport.use(
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
      authenticateUser,
    ),
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
            personalInfo: { select: { photoPath: true, contactType: true } }
          }
        });
        const userRights = await prisma.allowedAgents.findUnique({
          where: { email: user.email },
          include: { AgentRights: true }
        });

        const filledUser = {
          ...user,
          isMicrosoftLogin: false,
          rights: userRights ? userRights.AgentRights.map(ar => ar.idRight) : []
        }
        return done(null, filledUser || false);
      } else if (obj.type === "ms") {

        const userRights = await prisma.allowedAgents.findUnique({
          where: { email: obj.email },
          include: { AgentRights: true }
        });

        return done(null, {
          user_id: obj.user_id,
          email: obj.email,
          display_name: obj.display_name,
          tenantId: obj.tenantId,
          isMicrosoftLogin: true,
          rights: userRights ? userRights.AgentRights.map(ar => ar.idRight) : []
        });
      }
      return done(null, false);
    } catch (err) {
      done(err);
    }
  });
};

import passport from "passport";

const postLogin = async (req, res, next) => {
  const { email } = req.body;
  if (email.endsWith("@goldentrust.com")) {
    try {
      const isAllowed = await prisma.allowedAgents.findUnique({
        where: { email: email },
      });
      const healthAgent = await prisma.user.findUnique({
        where: { email: email },
      });

      if (!(isAllowed || healthAgent)) {
        return res.redirect("/login");
      }

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
  } else {
    passport.authenticate("local", {
      successRedirect: "/users/dashboard",
      failureRedirect: "/login",
      failureFlash: true,
    })(req, res, next);
  }
};

const authenticate = (passport) => {
  return passport.authenticate("local", {
    successRedirect: "/users/dashboard",
    failureRedirect: "/login",
    failureFlash: true,
  });
};

export { initialize, authenticate, postLogin };
