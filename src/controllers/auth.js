import {pool} from "../config/dbConfig.js";
import { decrypt } from "./crypto.js";
import bcrypt from "bcrypt";

const login = (req, res) => {
        res.render('login');
}
/*
const loginCheck = (req, res) => {
    const {email, password} = req.body;
    pool.query(`SELECT * FROM entra.users WHERE mail = $1`, [email], (err, result) => {
        if(err) {
            console.log(`loginCheck function error`, err);
            res.redirect('/login');
        }
    })
}*/



const index = (req, res) => {
    res.redirect('/users/dashboard');
};

const renderResetPassword = (req, res) => {
    const encrypted = req.params.email;
    res.render('reset-password', { encrypted: encrypted });
}

const resetPassword = (req, res) => {
    const encrypted = req.params.email;
    const { password } = req.body;
    pool.query(`SELECT * FROM admin.crypto WHERE encrypted_data = $1`, [encrypted], async (err, result) => {
        if(err){
            console.log(`resetPassword function error`, err);
            res.status(500);
        }
        if(result.rows.length == 0) {
            return res.redirect('/login')
        }
        const email = decrypt(encrypted, result.rows[0].key, result.rows[0].iv);
        const hashedPassword = await bcrypt.hash(password, 10);
        pool.query(`UPDATE entra.users SET password=$1 WHERE mail=$2`, [hashedPassword, email], (err, result) => {
            if(err){
                console.log(`resetPassword function error`, err);
            }
            pool.query(`DELETE FROM admin.crypto WHERE encrypted_data = $1`, [encrypted], async (err, result) => {
                if(err){
                    console.log(`resetPassword function error`, err);
                }
            })
            res.redirect('/login');
        })
    })
}

const logout = (req, res) => {
        req.logout((err) => {
            if (err) {
                return next(err);
            }
        })
    req.flash("success_msg", 'You have logged out');
    res.redirect('/login');
}

const checkAuthenticated = (req, res, next) => {
    if(req.isAuthenticated()) {
       return res.redirect('users/dashboard'); 
    }
    next();
} 

const checkNotAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login')
}




export {login, index, renderResetPassword, resetPassword, logout, checkAuthenticated, checkNotAuthenticated};
