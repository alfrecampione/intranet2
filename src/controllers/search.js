import {pool} from "../config/dbConfig.js";

const dataSearch = (req, res) => {
    pool.query(`SELECT entity_id, display_name, type_display, phone FROM qq.contacts WHERE status = 'A' ORDER BY display_name ASC LIMIT 500`, (err, result) => {
        if(err){
            console.log(`Function : dataSearch`, err);
            res.status(500).json({
                message: `Server Error`
            })
        }
        res.status(200).json({
            contacts: result.rows         
        })
    })
}

export { dataSearch }