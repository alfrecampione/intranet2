import { Strategy as LocalStrategy } from "passport-local";
import { pool, prisma } from "./dbConfig.js";
import bcrypt from "bcrypt";

const initialize = (passport) => {
  const authenticateUser = async (email, password, done) => {
    try {
      // Prisma
      const prismaUser = await prisma.user.findUnique({
        where: { email, isReleased: false },
        include: {
          personalInfo: {
            select: { photoPath: true, contactType: true }
          }
        }
      });
      if (prismaUser) {
        const isMatch = await bcrypt.compare(password, prismaUser.password);
        if (isMatch) {
          return done(null, prismaUser);
        } else {
          console.log(`Login failed for ${email}: Password is not correct (Prisma)`);
          return done(null, false, { msg: "Password is not correct" });
        }
      }

      // PostgreSQL pool
      const result = await pool.query(
        `SELECT * FROM entra.users WHERE mail = $1 AND active = true AND location_id > 0`,
        [email],
      );

      if (result.rows.length > 0) {
        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
          return done(null, user);
        } else {
          console.log(`Login failed for ${email}: Password is not correct(PostgreSQL)`);
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
  passport.deserializeUser((user_id, done) => {
    // Prisma
    prisma.user.findUnique({
      where: { user_id },
      include: {
        personalInfo: {
          select: { photoPath: true, contactType: true }
        }
      }
    })
      .then((prismaUser) => {
        if (prismaUser) {
          return done(null, prismaUser);
        } else {
          // PostgreSQL pool
          pool.query(
            `SELECT * FROM entra.users WHERE user_id = $1`,
            [user_id],
            async (err, result) => {
              if (err) {
                return done(err);
              }
              if (result.rows.length > 0) {
                let user = result.rows[0];
                try {
                  const locResult = await pool.query(
                    `SELECT location_type, alias FROM qq.locations WHERE location_id = $1`,
                    [user.location_id],
                  );
                  user.location_type = locResult.rows[0]?.location_type;
                  user.location_alias = locResult.rows[0]?.alias;
                  return done(null, user);
                } catch (error) {
                  user.location_type = 0;
                  return done(null, user);
                }
              } else {
                return done(null, false);
              }
            },
          );
        }
      })
      .catch((err) => done(err));
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
