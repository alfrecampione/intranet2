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
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import pino from 'pino-http';
import cors from 'cors';


import router from "./routes.js";

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

// Configuración CORS para permitir todos los orígenes
app.use(cors({
  origin: '*', // Permite cualquier origen
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Métodos permitidos
  allowedHeaders: ['Content-Type', 'Authorization'], // Cabeceras permitidas
  credentials: true // Permite cookies y autenticación
}));

// Manejar solicitudes OPTIONS (preflight)
app.options('*', cors());

initialize(passport);

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create user-specific directory if authenticated
    if (req.user && req.user.id) {
      const userDir = path.join('uploads', req.user.id);
      fs.mkdirSync(userDir, { recursive: true }); // Create if doesn't exist
      cb(null, userDir);
    } else {
      // Fallback to general uploads directory
      fs.mkdirSync('uploads/general', { recursive: true });
      cb(null, 'uploads/general');
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    cb(new Error('Invalid file type'));
  }
});

/** MIDDLEWARES */
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
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
app.use(flash());
app.use(express.static(path.join(__dirname, '..', 'assets')));
app.use('/uploads', express.static('uploads')); // Serve uploaded files
app.use(express.json());


app.post('/signatures', async (req, res) => {
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


// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Normaliza la ruta (útil para Windows)
    const filePath = req.file.path.replace(/\\/g, '/');

    // Asegúrate de que la ruta empiece con 'uploads/'
    const relativePath = filePath.includes('uploads/')
      ? filePath.substring(filePath.indexOf('uploads/'))
      : `uploads/${req.file.filename}`;

    // Devolver solo lo que necesita el frontend
    res.json({
      path: relativePath
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed',
      details: error.message 
    });
  }
});

// app.use(pino());

app.use('/', router);

/** -MIDDLEWARES- */

https.createServer(options, app).listen(PORT, () => {
    console.log(`Server started at port ${PORT}`);                
});