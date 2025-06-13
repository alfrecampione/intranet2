import multer from "multer";
import path from "path";
import { promises as fsPromises } from "fs";
import { v4 as uuidv4 } from "uuid";

const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        try {
            const baseDir = 'uploads';
            const userFolder = req.user?.user_id
                ? path.join(baseDir, req.user.user_id)
                : path.join(baseDir, 'general');

            await fsPromises.mkdir(userFolder, { recursive: true });
            cb(null, userFolder);
        } catch (err) {
            cb(err, null);
        }
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|pdf|doc|docx/;
        const isValid = allowed.test(path.extname(file.originalname).toLowerCase()) &&
            allowed.test(file.mimetype);
        cb(isValid ? null : new Error('Invalid file type'), isValid);
    }
});

export default upload;
