import { pool, prisma } from "../config/dbConfig.js";
import { prismaContext } from "../config/prismaContext.js";

const renderConfigEmails = async (req, res) => {
  const emails = await getEmailsToAlert()
  const admins = await getAdmins();

  res.render("config_emails", { user: req.user, emails, admins, activePage: 'config', open: 'emails' });
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
    await prismaContext.run({ userId: req.user?.user_id ?? "unknown" }, async () => {
      await prisma.$transaction(
        admins.map(admin =>
          prisma.newUserAlerts.create({
            data: { email: admin.mail, display_name: admin.display_name }
          })
        )
      );
    });

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
    await prismaContext.run({ userId: req.user?.user_id ?? "unknown" }, async () => {
      await prisma.newUserAlerts.delete({
        where: { email },
      });
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
    }));

    res.render("config_carriers", {
      user: req.user,
      companies: formattedCompanies,
      activePage: 'config',
      open: 'carriers'
    });
  } catch (error) {
    console.error("Error rendering carriers config:", error);
  }
}

const postCompany = async (req, res) => {
  const { name, phone, states } = req.body;

  if (!name || !Array.isArray(states) || states.length === 0) {
    return res.status(400).json({ message: "Company name and at least one state are required" });
  }

  try {
    await prismaContext.run({ userId: req.user?.user_id ?? "unknown" }, async () => {
      const company = await prisma.company.create({
        data: {
          name,
          States: states,
          phone,
        }
      });

      const commissionData = states.map(state => ({
        companyId: company.id,
        state,
        amount: 0
      }));

      await prisma.commisions.createMany({
        data: commissionData,
        skipDuplicates: true
      });
    });
    res.status(201).json({ message: "Company added successfully" });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: "Company already exists" });
    }
    console.error("Error adding company:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateCompany = async (req, res) => {
  const { originalName, name, phone, states } = req.body;

  if (!originalName || !name || !Array.isArray(states) || states.length === 0) {
    return res.status(400).json({ message: "Original name, new name, and at least one state are required" });
  }

  try {
    await prismaContext.run({ userId: req.user?.user_id ?? "unknown" }, async () => {
      const existingCompany = await prisma.company.findUnique({
        where: { name: originalName },
        include: { Commisions: true }
      });

      if (!existingCompany) {
        return res.status(404).json({ message: "Company not found" });
      }

      const updatedCompany = await prisma.company.update({
        where: { name: originalName },
        data: {
          name,
          States: states,
          phone,
        }
      });

      // Add new commissions with amount 0
      const existingStatesWithCommissions = new Set(existingCompany.Commisions.map(c => c.state));
      const newStates = states.filter(state => !existingStatesWithCommissions.has(state));

      const newCommissionData = newStates.map(state => ({
        companyId: existingCompany.id,
        state,
        amount: 0
      }));

      if (newCommissionData.length > 0) {
        await prisma.commisions.createMany({
          data: newCommissionData,
          skipDuplicates: true
        });
      }

      // Remove commissions for deleted states
      const removedStates = existingCompany.States.filter(
        prevState => !states.includes(prevState)
      );

      if (removedStates.length > 0) {
        await prisma.commisions.deleteMany({
          where: {
            companyId: existingCompany.id,
            state: { in: removedStates }
          }
        });
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
    await prismaContext.run({ userId: req.user?.user_id ?? "unknown" }, async () => {
      await prisma.company.delete({
        where: { name }
      });
    });
    res.status(200).json({ message: "Company deleted successfully" });
  } catch (error) {
    console.error("Error deleting company:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const renderConfigCommisions = async (req, res) => {
  const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
  const commisionsRaw = await prisma.commisions.findMany({
    include: { company: { select: { name: true } } }
  });
  const commisions = commisionsRaw.map(c => ({
    company: c.company.name,
    state: c.state,
    amount: c.amount
  }));


  res.render("config_commisions", { user: req.user, companies, commisions, activePage: 'config', open: 'commisions' });
};

const updateCommisions = async (req, res) => {
  const { commissions } = req.body;

  if (!Array.isArray(commissions) || commissions.length === 0) {
    return res.status(400).json({ message: "No commissions provided" });
  }

  try {
    const companyNames = [...new Set(commissions.map(c => c.company))];
    const companies = await prisma.company.findMany({
      where: { name: { in: companyNames } }
    });

    const nameToId = {};
    companies.forEach(c => { nameToId[c.name] = c.id; });

    await prismaContext.run({ userId: req.user?.user_id ?? "unknown" }, async () => {
      await prisma.$transaction(async (tx) => {
        await tx.commisions.deleteMany({});
        const data = commissions.map(c => {
          const companyId = nameToId[c.company];
          return { companyId, state: c.state, amount: c.commission };
        });
        await tx.commisions.createMany({ data, skipDuplicates: true });
      });
    });

    res.status(200).json({ message: "Commissions replaced successfully" });
  } catch (error) {
    console.error("Error replacing commissions:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const renderConfigAgentRights = async (req, res) => {
  try {
    const agents = await prisma.allowedAgents.findMany({
      include: { AgentRights: true },
      orderBy: { email: 'asc' }
    });
    const rights = await prisma.right.findMany({ orderBy: { name: 'asc' } });

    const formattedAgents = agents.map(agent => ({
      id: agent.id,
      email: agent.email,
      display_name: agent.display_name,
      rights: agent.AgentRights.map(ar => ar.idRight)
    }));

    res.render("config_agent_rights", { user: req.user, agents: formattedAgents, rights, activePage: 'config', open: 'agent_rights' });
  } catch (error) {
    console.error("Error rendering agent rights config:", error);
  }
};

const addAllowedAgent = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }
  try {
    await prismaContext.run({ userId: req.user?.user_id ?? "unknown" }, async () => {
      const newAgent = await prisma.allowedAgents.create({
        data: { email }
      });
      const defaultRight = await prisma.right.findUnique({
        where: { name: 'read' }
      });
      if (defaultRight)
        await prisma.agentRights.create({
          data: {
            idAgent: newAgent.id,
            idRight: defaultRight.id
          }
        })
    });
    res.status(201).json({ message: "Agent added successfully" });
  }
  catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: "Agent already exists" });
    }
    console.error("Error adding allowed agent:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
const deleteAllowedAgent = async (req, res) => {
  const { agentId } = req.body;
  if (!agentId) {
    return res.status(400).json({ message: "Agent ID is required" });
  }
  try {
    await prismaContext.run({ userId: req.user?.user_id ?? "unknown" }, async () => {
      await prisma.allowedAgents.delete({
        where: { id: agentId },
      });
    });
    res.status(200).json({ message: "Agent deleted successfully" });
  } catch (error) {
    console.error("Error deleting allowed agent:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateAgentRights = async (req, res) => {
  const { agentId, rights } = req.body;
  if (!agentId || !Array.isArray(rights)) {
    return res.status(400).json({ message: "Agent ID and rights array are required" });
  }
  try {
    const agent = await prisma.allowedAgents.findUnique({
      where: { id: agentId },
      include: { AgentRights: true }
    });

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }
    const currentRights = new Set(agent.AgentRights.map(ar => ar.idRight));
    const newRights = new Set(rights);
    const rightsToAdd = rights.filter(r => !currentRights.has(r));
    const rightsToRemove = agent.AgentRights.filter(ar => !newRights.has(ar.idRight)).map(ar => ar.idRight);

    await prismaContext.run({ userId: req.user?.user_id ?? "unknown" }, async () => {
      await prisma.$transaction(async (tx) => {
        if (rightsToAdd.length > 0) {
          const addData = rightsToAdd.map(r => ({ idAgent: agentId, idRight: r }));
          await tx.agentRights.createMany({ data: addData, skipDuplicates: true });
        }
        if (rightsToRemove.length > 0) {
          await tx.agentRights.deleteMany({
            where: { idAgent: agentId, idRight: { in: rightsToRemove } }
          });
        }
      });
    });

    res.status(200).json({ message: "Agent rights updated successfully" });
  } catch (error) {
    console.error("Error updating agent rights:", error);
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
  res.render("config-headcarrier", { data, activePage: 'config' });
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
  deleteCompany,
  renderConfigCommisions,
  updateCommisions,
  renderConfigAgentRights,
  addAllowedAgent,
  deleteAllowedAgent,
  updateAgentRights,
};
