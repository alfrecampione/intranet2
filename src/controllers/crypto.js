import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const getSecretKey = () => {
  const secret = process.env.ENCRYPTION_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Missing ENCRYPTION_SECRET (or fallback SESSION_SECRET) for encryption");
  }
  // Derive a fixed 32-byte key from the shared secret
  return crypto.createHash("sha256").update(secret).digest();
};

const SECRET_KEY = getSecretKey();

const encrypt = (text) => {
  const algorithm = "aes-256-cbc";
  const key = crypto.randomBytes(32); // Generate a 32-byte (256-bit) key
  const iv = crypto.randomBytes(16); // Generate a 16-byte (128-bit) IV

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  return {
    encryptedData: encrypted,
    key: key.toString("hex"),
    iv: iv.toString("hex"),
  };
};

const decrypt = (text, key, iv) => {
  const algorithm = "aes-256-cbc";

  const decipher = crypto.createDecipheriv(
    algorithm,
    Buffer.from(key, "hex"),
    Buffer.from(iv, "hex"),
  );
  let decrypted = decipher.update(text, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
};

const encryptWithSecret = (text) => {
  if (!text) return text;

  const algorithm = "aes-256-cbc";
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, SECRET_KEY, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  // Store IV alongside ciphertext so we do not need DB schema changes
  return `${iv.toString("hex")}:${encrypted}`;
};

const decryptWithSecret = (payload) => {
  if (!payload) return payload;

  try {
    const [ivHex, encrypted] = payload.split(":");
    if (!ivHex || !encrypted) return payload; // Not an encrypted payload we created

    const algorithm = "aes-256-cbc";
    const decipher = crypto.createDecipheriv(
      algorithm,
      SECRET_KEY,
      Buffer.from(ivHex, "hex"),
    );

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Error decrypting payload with secret key:", error.message);
    return payload; // Fallback: return raw value to avoid breaking callers
  }
};

export { encrypt, decrypt, encryptWithSecret, decryptWithSecret };
