import express from "express";
import session from "express-session";
import flash from "express-flash";
import path from "path";
import { fileURLToPath } from "url";
import passport from "passport";
import { initialize } from "./config/passportConfig.js";
import { sessionStore } from "./config/dbConfig.js";
import https from "https";
import fs from "fs";
import cors from 'cors';
import { checkNotAuthenticated } from "./controllers/auth.js"


import router from "./routes.js";
import uploadRouter from "./uploadRouter.js";

const app = express();
const PORT = process.env.PORT || 443;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SSL Configuration
const options = {
  key: fs.readFileSync('./src/config/ssl/server.key'),
  cert: fs.readFileSync('./src/config/ssl/4779dbccdf63510b.crt'),
  ca: fs.readFileSync('./src/config/ssl/gd_bundle-g2-g1.crt')
};

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.options('*', cors());

initialize(passport);

app.use(session({
  secret: 'your_session_secret',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    secure: true // Required for HTTPS
  }
}));

app.use(passport.initialize());
app.use(passport.session());

/** MIDDLEWARES */
app.use('/upload', uploadRouter);

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(flash());

app.use((req, res, next) => {
  if (req.url.endsWith('.css')) {
    res.setHeader('Content-Type', 'text/css');
  }
  next();
});

app.use(express.static(path.join(__dirname, '..', 'assets')));
app.use('/uploads', express.static('uploads'));

app.post('/signatures', checkNotAuthenticated, async (req, res) => {
  try {
    const { signature } = req.body;

    // Guardar la firma como imagen
    const base64Data = signature.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `signature_${Date.now()}.png`;
    const filePath = path.join(__dirname, 'uploads/signatures', fileName);

    fs.writeFileSync(filePath, buffer);

    // Devolver solo el path (el backend lo guardará en TaxInfo)
    res.json({
      success: true,
      path: `/uploads/signatures/${fileName}`
    });

  } catch (error) {
    res.status(500).json({ error: "Error al procesar firma" });
  }
});

// app.use(pino());

app.use('/', router);

/** -MIDDLEWARES- */

https.createServer(options, app).listen(PORT, () => {
  console.log(`Server started at port ${PORT}`);
});