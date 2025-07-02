import { pool, prisma } from "../config/dbConfig.js";

const renderConfigEmails = async (req, res) => {
  const emails = await getEmailsToAlert()
  const admins = await getAdmins();

  res.render("config_emails", { user: req.user, emails, admins });
};

async function getEmailsToAlert() {
  const results = await prisma.newUserAlerts.findMany({
    orderBy: { email: 'asc' }
  });
  return results || [];
}

const postAdminToAlert = async (req, res) => {
  const { admins } = req.body;

  if (!admins || !Array.isArray(admins) || admins.length === 0) {
    return res.status(400).json({ message: "At least one admin is required" });
  }

  try {
    await prisma.$transaction(
      admins.map(admin =>
        prisma.newUserAlerts.create({
          data: { email: admin.mail, display_name: admin.display_name }
        })
      )
    );

    res.status(201).json({ message: "Admins added successfully" });
  } catch (error) {
    console.error("Error adding Admins to alert:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const deleteEmailToAlert = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    await prisma.newUserAlerts.delete({
      where: { email },
    });
    res.status(200).json({ message: "Email deleted successfully" });
  } catch (error) {
    console.error("Error deleting email from alert:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

async function getAdmins() {
  try {
    const result = await pool.query(
      `SELECT display_name, mail FROM entra.users WHERE location_id = $1 AND department = $2`,
      [1, 'Health']
    );
    return result.rows;
  } catch (error) {
    console.error("Error fetching admins:", error);
  }
}
const renderConfigCarriers = async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      orderBy: { name: 'asc' }
    });

    // Format states as comma-separated string for display
    const formattedCompanies = companies.map(c => ({
      name: c.name,
      states: Array.isArray(c.States) ? c.States.join('| ') : '',
      phone: c.phone,
      email: c.email
    }));

    res.render("config_carriers", {
      user: req.user,
      companies: formattedCompanies
    });
  } catch (error) {
    console.error("Error rendering carriers config:", error);
    res.render("config_carriers", {
      user: req.user,
      companies: [],
      error: "Error loading companies"
    });
  }
}

const postCompany = async (req, res) => {
  const { name, phone, email, states } = req.body;
  if (!name || !Array.isArray(states) || states.length === 0) {
    return res.status(400).json({ message: "Company name and at least one state are required" });
  }

  try {
    await prisma.company.create({
      data: {
        name,
        States: states,
        phone,
        email
      }
    });
    res.status(201).json({ message: "Company added successfully" });
  } catch (error) {
    if (error.code === 'P2002') { // Unique constraint failed
      return res.status(409).json({ message: "Company already exists" });
    }
    console.error("Error adding company:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateCompany = async (req, res) => {
  const { originalName, name, phone, email, states } = req.body;

  if (!originalName || !name || !Array.isArray(states) || states.length === 0) {
    return res.status(400).json({ message: "Original name, new name, and at least one state are required" });
  }

  try {
    await prisma.company.update({
      where: { name: originalName },
      data: {
        name,
        States: states,
        phone,
        email
      }
    });
    res.status(200).json({ message: "Company updated successfully" });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: "Company with this name already exists" });
    }
    console.error("Error updating company:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const deleteCompany = async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ message: "Company name is required" });
  }

  try {
    await prisma.company.delete({
      where: { name }
    });
    res.status(200).json({ message: "Company deleted successfully" });
  } catch (error) {
    console.error("Error deleting company:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const headcarrier = async (req, res) => {
  let data = {};
  data.user = req.user;
  try {
    const result = await pool.query(
      `SELECT entity_id, display_name FROM qq.contacts WHERE (type_display = 'R' or type_display = 'M') and status = 'A' ORDER BY display_name`,
    );
    data.carriers = result.rows;
  } catch (error) {
    console.log(`Function headcarrier `, error);
    data.carriers = [];
  }
  res.render("config-headcarrier", data);
};

const addHeadCarrier = (req, res) => {
  const { name, carrier_id } = req.body;
  pool.query(
    `INSERT INTO qq.head_carriers(name, contact_id) VALUES ($1, $2)`,
    [name, carrier_id],
    (err, result) => {
      if (err) {
        return res.status(400).json({
          message: `Error, Head Carrier not inserted!`,
        });
      }
    },
  );
  pool.query(
    `UPDATE qq.contacts SET head_comp=$1	WHERE entity_id=$2`,
    [name, carrier_id],
    (err, result) => {
      if (err) {
        return res.status(400).json({
          message: `Error, Head Carrier not updated in QQ!`,
        });
      }
    },
  );
  res.redirect("/users/config/headcarriers");
};

const head_carrier_list = (req, res) => {
  pool.query(
    `SELECT head_carrier_id, hc.name, tp.name  AS type_display, c.display_name , c.created_on, c.date_last_modified, c.entity_id
                FROM qq.head_carriers hc
                INNER JOIN qq.contacts c ON contact_id = c.entity_id
                INNER JOIN qq.type_displays tp ON c.type_display = tp.type_display
                ORDER BY hc.name ASC`,
    (err, result) => {
      if (err) {
        return res.status(400).json({
          message: `DataBase Error`,
          data: [],
        });
      }
      res.status(200).json({
        data: result.rows,
      });
    },
  );
};

const addCarrier = (req, res) => {
  const { name1, carrier_id } = req.body;
  pool.query(
    `INSERT INTO qq.head_carriers(name, contact_id) VALUES ($1, $2)`,
    [name1, carrier_id],
    (err, result) => {
      if (err) {
        return res.status(400).json({
          message: `Insert carrier Error`,
        });
      }
    },
  );
  pool.query(
    `UPDATE qq.contacts SET head_comp=$1	WHERE entity_id=$2`,
    [name1, carrier_id],
    (err, result) => {
      if (err) {
        return res.status(400).json({
          message: `Error, Head Carrier not updated in QQ!`,
        });
      }
    },
  );
  res.redirect("/users/config/headcarriers");
};

const deleteCarrier = (req, res) => {
  const { name2, contact_id } = req.body;
  pool.query(
    `DELETE FROM qq.head_carriers WHERE name = $1 AND contact_id = $2`,
    [name2, contact_id],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          message: `Delete carrier Error`,
        });
      }
    },
  );
  pool.query(
    `UPDATE qq.contacts SET head_comp=display_name WHERE entity_id=$1`,
    [contact_id],
    (err, result) => {
      if (err) {
        return res.status(400).json({
          message: `Error, Head Carrier not updated in QQ!`,
        });
      }
    },
  );
  res.redirect("/users/config/headcarriers");
};

export {
  headcarrier,
  addHeadCarrier,
  head_carrier_list,
  addCarrier,
  deleteCarrier,
  getEmailsToAlert,
  postAdminToAlert,
  deleteEmailToAlert,
  renderConfigEmails,
  renderConfigCarriers,
  postCompany,
  updateCompany,
  deleteCompany
};
