import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import path from "path";

// Configure AWS S3 Client
const s3Client = new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
const SIGNED_URL_EXPIRATION = parseInt(process.env.S3_SIGNED_URL_EXPIRATION) || 3600; // Default 1 hour

/**
 * Upload a file to S3
 * @param {Buffer} fileBuffer - The file buffer
 * @param {string} originalName - Original filename
 * @param {string} mimetype - File mimetype
 * @param {string} userId - User ID for folder organization
 * @returns {Promise<string>} - The S3 URL of the uploaded file
 */
export const uploadToS3 = async (fileBuffer, originalName, mimetype, userId = "general") => {
    const fileExtension = path.extname(originalName);
    const fileName = `${uuidv4()}${fileExtension}`;
    const key = `uploads/${userId}/${fileName}`;

    const params = {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: fileBuffer,
        ContentType: mimetype,
    };

    try {
        const command = new PutObjectCommand(params);
        await s3Client.send(command);

        // Return the S3 URL
        const s3Url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;
        return s3Url;
    } catch (error) {
        console.error("Error uploading to S3:", error);
        throw new Error("Failed to upload file to S3");
    }
};

/**
 * Validate file type
 * @param {string} originalName - Original filename
 * @param {string} mimetype - File mimetype
 * @returns {boolean} - Whether the file is valid
 */
export const isValidFileType = (originalName, mimetype) => {
    const allowedExtensions = /jpeg|jpg|png|pdf|doc|docx/;
    const extension = path.extname(originalName).toLowerCase();
    return (
        allowedExtensions.test(extension.slice(1)) &&
        allowedExtensions.test(mimetype)
    );
};

/**
 * Delete a file from S3
 * @param {string} fileUrl - The S3 URL of the file to delete
 * @returns {Promise<boolean>} - Whether the deletion was successful
 */
export const deleteFromS3 = async (fileUrl) => {
    try {
        if (!fileUrl || typeof fileUrl !== 'string') {
            console.warn("Invalid file URL provided for deletion");
            return false;
        }

        // Extract the key from the S3 URL
        // Example URL: https://goldenhealth-files.s3.us-east-1.amazonaws.com/uploads/userId/filename.pdf
        const urlPattern = new RegExp(`https://${BUCKET_NAME}\\.s3\\..+\\.amazonaws\\.com/(.+)`);
        const match = fileUrl.match(urlPattern);

        if (!match || !match[1]) {
            console.warn("Could not extract S3 key from URL:", fileUrl);
            return false;
        }

        const key = match[1];

        const params = {
            Bucket: BUCKET_NAME,
            Key: key,
        };

        const command = new DeleteObjectCommand(params);
        await s3Client.send(command);

        console.log(`Successfully deleted file from S3: ${key}`);
        return true;
    } catch (error) {
        console.error("Error deleting from S3:", error);
        return false;
    }
};

/**
 * Check if a URL is an S3 URL
 * @param {string} url - The URL to check
 * @returns {boolean} - Whether the URL is from S3
 */
export const isS3Url = (url) => {
    if (!url || typeof url !== 'string') return false;
    return url.includes('s3.amazonaws.com') || url.includes(`${BUCKET_NAME}.s3.`);
};

/**
 * Extract S3 key from URL
 * @param {string} fileUrl - The S3 URL
 * @returns {string|null} - The S3 key or null if invalid
 */
export const extractS3Key = (fileUrl) => {
    try {
        if (!fileUrl || typeof fileUrl !== 'string') return null;

        // Pattern 1: https://bucket-name.s3.region.amazonaws.com/key
        let urlPattern = new RegExp(`https://${BUCKET_NAME}\\.s3\\..+\\.amazonaws\\.com/(.+)`);
        let match = fileUrl.match(urlPattern);

        if (match && match[1]) {
            return decodeURIComponent(match[1]);
        }

        // Pattern 2: https://s3.region.amazonaws.com/bucket-name/key
        urlPattern = new RegExp(`https://s3\\..+\\.amazonaws\\.com/${BUCKET_NAME}/(.+)`);
        match = fileUrl.match(urlPattern);

        if (match && match[1]) {
            return decodeURIComponent(match[1]);
        }

        return null;
    } catch (error) {
        console.error("Error extracting S3 key:", error);
        return null;
    }
};

/**
 * Generate a signed URL for an S3 object
 * @param {string} s3Url - The S3 URL or key
 * @param {number} expiresIn - Expiration time in seconds (default from env)
 * @returns {Promise<string>} - The signed URL
 */
export const getSignedS3Url = async (s3Url, expiresIn = SIGNED_URL_EXPIRATION) => {
    try {
        if (!s3Url) return null;

        // If it's not an S3 URL, return it as-is
        if (!isS3Url(s3Url)) {
            return s3Url;
        }

        // Extract the key from the URL
        const key = extractS3Key(s3Url);
        if (!key) {
            console.warn("Could not extract S3 key from URL:", s3Url);
            return s3Url;
        }

        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
        return signedUrl;
    } catch (error) {
        console.error("Error generating signed URL:", error);
        return s3Url; // Return original URL as fallback
    }
};

/**
 * Process an object and replace all S3 URLs with signed URLs
 * @param {Object|Array} data - The data object or array to process
 * @returns {Promise<Object|Array>} - The processed data with signed URLs
 */
export const processS3Urls = async (data) => {
    if (!data) return data;

    if (Array.isArray(data)) {
        return Promise.all(data.map(item => processS3Urls(item)));
    }

    if (typeof data === 'object') {
        const processed = {};
        for (const [key, value] of Object.entries(data)) {
            if (typeof value === 'string' && isS3Url(value)) {
                processed[key] = await getSignedS3Url(value);
            } else if (typeof value === 'object') {
                processed[key] = await processS3Urls(value);
            } else {
                processed[key] = value;
            }
        }
        return processed;
    }

    return data;
};

export { s3Client };
