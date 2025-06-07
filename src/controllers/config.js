import {pool} from "../config/dbConfig.js";


const headcarrier = async (req, res) => {
    let data = {};
    data.user = req.user;
    try {
        const result = await pool.query(`SELECT entity_id, display_name FROM qq.contacts WHERE (type_display = 'R' or type_display = 'M') and status = 'A' ORDER BY display_name`)
        data.carriers = result.rows;
    } catch (error) {
        console.log(`Function headcarrier `, error);
        data.carriers = [];
    }
    res.render("config-headcarrier", data);
};

const addHeadCarrier = (req, res) => {
    const {name, carrier_id} = req.body;
        pool.query(`INSERT INTO qq.head_carriers(name, contact_id) VALUES ($1, $2)`, [name, carrier_id], (err, result) => {
            if(err){
                return res.status(400).json({
                    message: `Error, Head Carrier not inserted!`,
                })
            }
        })
        pool.query(`UPDATE qq.contacts SET head_comp=$1	WHERE entity_id=$2`, [name, carrier_id], (err, result) => {
            if(err){
                return res.status(400).json({
                    message: `Error, Head Carrier not updated in QQ!`,
                })
            }
            
        })
        res.redirect('/users/config/headcarriers');
}

const head_carrier_list = (req, res) => {
    pool.query(`SELECT head_carrier_id, hc.name, tp.name  AS type_display, c.display_name , c.created_on, c.date_last_modified, c.entity_id
                FROM qq.head_carriers hc
                INNER JOIN qq.contacts c ON contact_id = c.entity_id
                INNER JOIN qq.type_displays tp ON c.type_display = tp.type_display
                ORDER BY hc.name ASC`, (err, result) => {
                    if(err){
                        return res.status(400).json({
                            message: `DataBase Error`,
                            data: []
                        })
                    }
                    res.status(200).json({
                        data: result.rows
                    })
                })
}

const addCarrier = (req, res) => {
    const { name1, carrier_id } = req.body;
    pool.query(`INSERT INTO qq.head_carriers(name, contact_id) VALUES ($1, $2)`, [name1, carrier_id], (err, result) => {
        if (err) {
            return res.status(400).json({
                message: `Insert carrier Error`
            })
        }
    })
    pool.query(`UPDATE qq.contacts SET head_comp=$1	WHERE entity_id=$2`, [name1, carrier_id], (err, result) => {
        if (err) {
            return res.status(400).json({
                message: `Error, Head Carrier not updated in QQ!`,
            })
        }

    })
    res.redirect('/users/config/headcarriers');
}

const deleteCarrier = (req, res) => {
    const { name2, contact_id } = req.body;
    pool.query(`DELETE FROM qq.head_carriers WHERE name = $1 AND contact_id = $2`, [name2, contact_id], (err, result) => {
        if (err) {
            return res.status(500).json({
                message: `Delete carrier Error`
            })
        }
    })
    pool.query(`UPDATE qq.contacts SET head_comp=display_name WHERE entity_id=$1`, [contact_id], (err, result) => {
        if (err) {
            return res.status(400).json({
                message: `Error, Head Carrier not updated in QQ!`,
            })
        }

    })
    res.redirect('/users/config/headcarriers');
}


export {headcarrier, addHeadCarrier, head_carrier_list, addCarrier, deleteCarrier};