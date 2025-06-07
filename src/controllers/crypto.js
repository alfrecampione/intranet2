import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const encrypt = (text) => {

    const algorithm = 'aes-256-cbc';
    const key = crypto.randomBytes(32); // Generate a 32-byte (256-bit) key
    const iv = crypto.randomBytes(16); // Generate a 16-byte (128-bit) IV

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
        encryptedData: encrypted,
        key: key.toString('hex'),
        iv: iv.toString('hex')
    };
}

const decrypt = (text, key, iv) => {
    
  const algorithm = 'aes-256-cbc';

  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
  let decrypted = decipher.update(text, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export {encrypt, decrypt}
