import { Strategy as LocalStrategy } from "passport-local";
import { prisma } from "./dbConfig.js";
import bcrypt from "bcrypt";

const initialize = (passport) => {
  const authenticateUser = async (email, password, done) => {
    try {
      const prismaUser = await prisma.user.findUnique({ where: { email } });
      if (prismaUser) {
        const isMatch = await bcrypt.compare(password, prismaUser.password);

        if (isMatch) {
          return done(null, prismaUser);
        } else {
          console.log(`Login failed for ${email}: Password is not correct`);
          return done(null, false, { msg: "Password is not correct" });
        }
      }
      console.log(`Login failed for ${email}: Email is not registered`);
      return done(null, false, { msg: "Email is not registered" });
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
      const prismaUser = await prisma.user.findUnique({ where: { user_id } });
      if (prismaUser) {
        return done(null, prismaUser);
      } else {
        return done(null, false);
      }
    } catch (err) {
      return done(err);
    }
  });
};

const authenticate = (passport) => {
  return passport.authenticate("local", {
    successRedirect: "/users/dashboard",
    failureRedirect: "/login",
    failureFlash: true,
  });
};

export { initialize, authenticate };
