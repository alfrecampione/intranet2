import { Strategy as LocalStrategy } from "passport-local";
import {pool} from "./dbConfig.js";
import bcrypt from "bcrypt";


const initialize = (passport) => {

    const authenticateUser = (email, password, done) => {
        pool.query(`SELECT * FROM entra.users WHERE mail = $1 AND active = true AND location_id > 0`, [email], (err, result) => {
            if(err) {
                throw err;
            }
            if(result.rows.length > 0) {
                const user = result.rows[0];
                bcrypt.compare(password, user.password, (err, isMatch) => {
                    if(err) {
                        throw err;
                    }
                    if(isMatch){
                        return done(null, user);
                    }else {
                        return done(null, false, {msg: 'Password is not correct'});
                    }
                })
            }else {
                return done (null, false, {msg: 'Email is not registered'});
            }
        })
    }

    passport.use(new LocalStrategy({
        usernameField: 'email',
        passwordField: 'password'
        },
        authenticateUser
    ))

    passport.serializeUser((user, done) => done(null, user.user_id));
    passport.deserializeUser((id, done) => {
        pool.query(`SELECT * FROM entra.users WHERE user_id = $1`, [id], async (err, result) => {
            if(err) {
                throw err;
            }
            let user = result.rows[0];
            try {
                
                const result = await pool.query(`SELECT location_type, alias FROM qq.locations WHERE location_id = $1`, [user.location_id]);
                user.location_type = result.rows[0].location_type;
                user.location_alias = result.rows[0].alias;
                return done(null, user);
            } catch (error) {
                user.location_type = 0;
                console.log('Passport Config', error)
                pool.query(`INSERT INTO logs.errors(file, data, "time") VALUES ($1, $2, $3)`, ['passportConfig', error, new Date()], (err, result) => {
                    if(err){
                        console.log('Passport Config', error);
                    }
                })
            }
        })
    })
}

const authenticate = (passport) => {
    return passport.authenticate('local', {
        successRedirect: '/users/dashboard',
        failureRedirect: '/login',
        failureFlash: true
    })
}

export {initialize, authenticate};