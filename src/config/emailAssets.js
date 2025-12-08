import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Convert images to base64 for email embedding
export function getBase64Image(imagePath) {
    const fullPath = path.join(__dirname, '..', '..', 'assets', imagePath);
    try {
        const imageBuffer = fs.readFileSync(fullPath);
        const base64Image = imageBuffer.toString('base64');
        const ext = path.extname(imagePath).substring(1);
        return `data:image/${ext};base64,${base64Image}`;
    } catch (error) {
        console.error(`Error loading image ${imagePath}:`, error);
        return '';
    }
}

// Preload social media icons
export const socialIcons = {
    facebook: getBase64Image('img/icons/brands/facebook.png'),
    instagram: getBase64Image('img/icons/brands/instagram.png'),
    linkedin: getBase64Image('img/icons/brands/linkedin.png'),
};

// Get logo as base64
export const logo = getBase64Image('img/branding/GoldenHealth-2.png');
