import { Strategy as LocalStrategy } from "passport-local";
import { pool, prisma } from "./dbConfig.js";
import bcrypt from "bcrypt";
import { cca, SCOPES } from "./msalConfig.js";

const initialize = (passport) => {
  const authenticateUser = async (email, password, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { email, isReleased: false },
        include: {
          personalInfo: {
            select: { photoPath: true, contactType: true }
          }
        }
      });
      if (user) {
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
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

  passport.serializeUser((user, done) => done(null, user.user_id));
  passport.deserializeUser(async (user_id, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { user_id },
        include: {
          personalInfo: {
            select: { photoPath: true, contactType: true }
          }
        }
      });

      if (user) {
        return done(null, user);
      }
      else {
        return done(null, false);
      }
    }
    catch (err) {
      return done(err)
    }
  });
};

import passport from "passport";

const postLogin = async (req, res, next) => {
  const { email } = req.body;
  if (email.endsWith("@goldentrust.com")) {
    try {
      const authCodeUrlParameters = {
        scopes: SCOPES,
        redirectUri: process.env.REDIRECT_URI,
        loginHint: email,
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
