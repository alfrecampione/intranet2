import { pool, prisma } from "../config/dbConfig.js";
import { encrypt, decrypt } from "./crypto.js";

const encryptEmail = async (req, res) => {
    const { email } = req.params;

    if (!email) {
        return res.status(400).json({ success: false, message: "Email is required" });
    }

    try {
        const { encryptedData, key, iv } = encrypt(email);
        await prisma.crypto.create({
            data: {
                encrypted_data: encryptedData,
                key: key,
                id: iv
            }
        })
        return res.status(200).json({ success: true, message: "Email encrypted successfully", data: { encryptedData } });
    } catch (error) {
        console.error("Error encrypting email:", error);
        return res.status(500).json({ success: false, message: "Failed to encrypt email" });
    }

}

const decryptEmail = async (req, res) => {
    const { encrypted_email } = req.params;

    if (!encrypted_email) {
        return res.status(400).json({ success: false, message: "Encrypted email is required" });
    }

    try {
        const result = await prisma.crypto.findFirst({
            where: { encrypted_data: encrypted_email }
        })

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Email not found" });
        }

        const { encrypted_data, key, iv } = result.rows[0];

        const email = decrypt(encrypted_data, key, iv);

        return res.status(200).json({ success: true, message: "Email decrypted successfully", data: { email } });
    } catch (error) {
        console.error("Error decrypting email:", error);
        return res.status(500).json({ success: false, message: "Failed to decrypt email" });
    }
}

const deleteEncryptedEmail = async (encryptedEmail) => {
    try {
        await prisma.crypto.delete({
            where: { encrypted_data: encryptedEmail }
        })
        console.log(`Encrypted email ${encryptedEmail} deleted from database.`);
    } catch (error) {
        console.error("Error deleting encrypted email:", error);
    }
};

export { encryptEmail, decryptEmail, deleteEncryptedEmail };
