import {pool} from "../config/dbConfig.js";

const agency = async (req, res) => {

    let production, agency, p, stateNum, states, state;
    const date = new Date();
    const initial_date = new Date(date.getFullYear(), date.getMonth(), 1);
    const final_date = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  
    let data = {};
  
    ////////////////////Production/////////////////////////////
  
    production = req.user.id_location_type != 1
      ? (await pool.query(`SELECT * from intranet.agency_location_daily($1)`, [req.user.id_location])).rows
      : (await pool.query(`SELECT * from intranet.agency_location_corp_daily`, [req.user.id_location])).rows
    agency = req.user.id_location_type != 1 ? (await pool.query(`SELECT alias from qq.locations where location_id = $1`, [req.user.location_id])).rows[0].alias : 'Corporate'
  
    data.agency = agency;
    data.ld_nb_prem = production[0].premium ? production[0].premium.substring(0, production[0].premium.length - 3) : '$0';
    data.ld_nb_pol = production[0].policies;
    data.ld_rn_prem = production[1].premium ? production[1].premium.substring(0, production[1].premium.length - 3) : '$0';
    data.ld_rn_pol = production[1].policies;
    data.ld_rw_prem = production[2].premium ? production[2].premium.substring(0, production[2].premium.length - 3) : '$0';
    data.ld_rw_pol = production[2].policies;
    data.ld_tot_prem = production[3].premium ? production[3].premium.substring(0, production[3].premium.length - 3) : '$0';
    data.ld_tot_pol = production[3].policies;
  
    production = req.user.id_location_type != 1 
      ? (await pool.query(`SELECT * from intranet.agency_location_month($1, $2, $3)`, [initial_date, final_date, req.user.id_location])).rows
      : (await pool.query(`SELECT * from intranet.agency_location_corp_month($1, $2, $3)`, [initial_date, final_date, req.user.id_location])).rows
  
      data.lm_nb_prem = production[0].premium ? production[0].premium.substring(0, production[0].premium.length - 3) : '$0';
      data.lm_nb_pol = production[0].policies;
      data.lm_rn_prem = production[1].premium ? production[1].premium.substring(0, production[1].premium.length - 3) : '$0';
      data.lm_rn_pol = production[1].policies;
      data.lm_rw_prem = production[2].premium ? production[2].premium.substring(0, production[2].premium.length - 3) : '$0';
      data.lm_rw_pol = production[2].policies;
      data.lm_tot_prem = production[3].premium ? production[3].premium.substring(0, production[3].premium.length - 3) : '$0';
      data.lm_tot_pol = production[3].policies;
  
    production = (await pool.query(`SELECT * from intranet.agency_company_today`)).rows
  
    data.ct_nb_prem = production[0].premium ? production[0].premium.substring(0, production[0].premium.length - 3) : '$0';
    data.ct_nb_pol = production[0].policies;
    data.ct_rn_prem = production[1].premium ? production[1].premium.substring(0, production[1].premium.length - 3) : '$0';
    data.ct_rn_pol = production[1].policies;
    data.ct_rw_prem = production[2].premium ? production[2].premium.substring(0, production[2].premium.length - 3) : '$0';
    data.ct_rw_pol = production[2].policies;
    data.ct_tot_prem = production[3].premium ? production[3].premium.substring(0, production[3].premium.length - 3) : '$0';
    data.ct_tot_pol = production[3].policies;
  
    //production = (await pool.query(`SELECT * from intranet.agency_sales_month_total_by_type_tkg($1)`, [initial_date])).rows
  
    data.cm_nb_prem = production[0].premium ? production[0].premium.substring(0, production[0].premium.length - 3) : '$0';
    data.cm_nb_pol = production[0].policies;
    data.cm_rn_prem = production[1].premium ? production[1].premium.substring(0, production[1].premium.length - 3) : '$0';
    data.cm_rn_pol = production[1].policies;
    data.cm_rw_prem = production[2].premium ? production[2].premium.substring(0, production[2].premium.length - 3) : '$0';
    data.cm_rw_pol = production[2].policies;
    data.cm_tot_prem = production[3].premium ? production[3].premium.substring(0, production[3].premium.length - 3) : '$0';
    data.cm_tot_pol = production[3].policies;
  
  
    ///////////////////Franchises Best Last Week/////////////////////
  
    let result = (await pool.query(`SELECT * FROM intranet.agency_csr_last_week`)).rows
  
    data.franchises_best_last_week = result[0];
    data.franchises_best_last_week.carriers = (await pool.query(`SELECT * FROM intranet.agency_carriers_last_week_franchise($1)`, [data.franchises_best_last_week.csr])).rows;
    data.franchises_second_last_week = result[1];
    data.franchises_second_last_week.carriers = (await pool.query(`SELECT * FROM intranet.agency_carriers_last_week_franchise($1)`, [data.franchises_second_last_week.csr])).rows;
    data.franchises_third_last_week = result[2];
    data.franchises_third_last_week.carriers = (await pool.query(`SELECT * FROM intranet.agency_carriers_last_week_franchise($1)`, [data.franchises_third_last_week.csr])).rows;
  
  
  /////////////////// Ranking dayly by agency//////////////////////////////////////
  
  data.agencies_today = (await pool.query(`SELECT * From intranet.agency_total_sales_daily_by_locations`)).rows
  for(let i = 0; i<data.agencies_today.length; i++){  
    p = data.agencies_today[i].premium.toString();
    data.agencies_today[i].premium = p.substring(0, p.length - 3);
  }
  
  /////////////////// Ranking monthly by agency//////////////////////////////////////
  
  result =   await pool.query(
    `SELECT * FROM intranet.dashboard_agencies`
  );
  
  data.dashboard_location = result.rows;
  for(let i = 0; i<data.dashboard_location.length; i++){  
  
    try {
        if(fs.accessSync('./assets/img/avatars/agencies/' + data.dashboard_location[i].id_location + '.png')){
            data.data.dashboard_location[i].avatar = '' + data.dashboard_location[i].id_location + '.png';
        } 
        data.dashboard_location[i].avatar = '' + data.dashboard_location[i].id_location + '.png';
        
        }catch (e) {
            data.dashboard_location[i].avatar = '';
            stateNum = Math.floor(Math.random() * 6);
            states = ['success', 'danger', 'warning', 'info', 'primary', 'secondary'];
            state = states[stateNum];
            data.dashboard_location[i].output = '<span class="avatar-initial rounded-circle bg-label-' + state + '">NLA</span>';
        } 
    p = data.dashboard_location[i].premium.toString();
    data.dashboard_location[i].premium = p.substring(0, p.length - 3);
  }
  
  /////////////////////// Sales by companies //////////////////////////////
  
  result =   await pool.query(
    `SELECT * FROM intranet.dashboard_company`
  );
  
  data.dashboard_company = result.rows;
  
  for(let i = 0; i<data.dashboard_company.length; i++){  
    try {
        if(fs.accessSync('./assets/img/avatars/comp/' + data.dashboard_company[i].id_company + '.png')){
            data.data.dashboard_company[i].avatar = '' + data.dashboard_company[i].id_company + '.png';
        } 
        data.dashboard_company[i].avatar = '' + data.dashboard_company[i].id_company + '.png';
        
        }catch (e) {
            data.dashboard_company[i].avatar = '';
            stateNum = Math.floor(Math.random() * 6);
            states = ['success', 'danger', 'warning', 'info', 'primary', 'secondary'];
            state = states[stateNum];
            data.dashboard_company[i].output = '<span class="avatar-initial rounded-circle bg-label-' + state + '">NLA</span>';
        } 
    p = data.dashboard_company[i].premium.toString();
    data.dashboard_company[i].premium = p.substring(0, p.length - 3);
  }
  
  //////////////////// Render //////////////////////////////////
    data.user = req.user;
    res.render('agency', data);
  }


  export { agency }