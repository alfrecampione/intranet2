import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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

export { s3Client };
