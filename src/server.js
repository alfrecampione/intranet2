import express from "express";
import session from "express-session";
import flash from "express-flash";
import path from "path";
import { fileURLToPath } from "url";
import passport from "passport";
import { initialize } from "./config/passportConfig.js";
import { sessionStore } from "./config/dbConfig.js";
import { scheduleCronJobs } from "./config/schedule.js";
// import http from "http";
import https from "https"
import cors from "cors";
import fs from "fs";

import router from "./routes.js";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SSL Configuration
const options = {
  key: fs.readFileSync("./src/config/ssl/server.key"),
  cert: fs.readFileSync("./src/config/ssl/31e810c645f53345.crt"),
  ca: fs.readFileSync("./src/config/ssl/gd_bundle-g2.crt"),
};

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.options("*", cors());

initialize(passport);

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      secure: true, // Required for HTTPS
    },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

/** MIDDLEWARES */
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(flash());

app.use((req, res, next) => {
  if (req.url.endsWith(".css")) {
    res.setHeader("Content-Type", "text/css");
  }
  next();
});

app.use(express.static(path.join(__dirname, "..", "assets")));

app.use("/", router);

app.use((err, req, res, next) => {
  if (err instanceof URIError) {
    return res.status(400).send("Bad Request");
  }
  next(err);
});

await scheduleCronJobs();

https.createServer(options, app).listen(PORT, () => {
  console.log(`Server started at port ${PORT}`);
});

// http.createServer(app).listen(PORT, () => {
//   console.log(`Server started at port ${PORT}`);
// });