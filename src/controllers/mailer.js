import nodemailer from "nodemailer";
import Mailgen from "mailgen";
import dotenv from "dotenv";
import { pool } from "../config/dbConfig.js";
import {encrypt} from "./crypto.js";

dotenv.config();

const passwordMail = async (req, res) => {

    const email = req.params.email;
    const { encryptedData, key, iv } = encrypt(email);
    let result, result1;

    try {
        
        result = await pool.query(`SELECT display_name FROM entra.users WHERE mail = $1 AND active = true AND location_id > 0`, [email]);
        result1 = await pool.query(`INSERT INTO admin.crypto(encrypted_data, key, iv) VALUES ($1, $2, $3);`, [encryptedData, key, iv]);

    } catch (error) {
        console.log('POSTGRESQL:', error);
        res.status(500).json({ msg: 'Data Access Error' });
    }

    if(result.rows.length == 0){
       return res.status(401).json({msg: `Please enter you GoldenTrust's email`})
    }

    const display_name = result.rows[0].display_name;

    let config = {
        service: 'gmail',
        auth: {
            user: process.env.G_EMAIL,
            pass: process.env.G_PASSWORD
        }
    }

    let transporter = nodemailer.createTransport(config);

    let mailGenerator = new Mailgen({
        theme: 'default',
        product: {
            name: `GoldenTrust Insurance's Intranet`,
            link: 'https://mailgen.js/'
        }
    })

    let response = {
        body: {
            name: display_name,
            intro: `Welcome to GoldenTrust Insurance's Intranet! We're very excited to have you on board.`,
            action: {
                instructions: 'To get started, please click here:',
                button: {
                    color: '#27388B', // Optional action button color
                    text: 'Create your password',
                    link: process.env.ENV == 'PROD' ? `https://staging.goldentrustinsurance.com/users/auth/reset-password/${encryptedData}` : `https://localhost/users/auth/reset-password/${encryptedData}`
                }
            },
            outro: `Need help, or have questions? Just reply to this email, we'd love to help.`
        }
    }

    let mail = mailGenerator.generate(response);

    let message = {
        from: `GTI <${process.env.G_EMAIL}>`,
        to: email,
        subject: 'Create your password',
        html: mail
    }

    transporter.sendMail(message).then(() => {
        return res.status(201).json({
            msg: 'You should receive an email'
        })
    }).catch(err => {
        return res.status(500).json({ err })
    })

}

export { passwordMail }