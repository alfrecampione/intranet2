import express from "express";
import { checkNotAuthenticated } from "./controllers/auth.js"
import { handleFileUpload } from "./controllers/registration.js"
import upload from "./config/multerConfig.js";

const router = express.Router();

router.post('/', checkNotAuthenticated, upload.single('file'), handleFileUpload);


export default router;