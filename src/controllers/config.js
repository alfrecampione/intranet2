import { pool, prisma } from "../config/dbConfig.js";
import { prismaContext } from "../config/prismaContext.js";
import { getSignedS3Url } from "../config/s3Config.js";
import { getCompanyNamesMap } from "../config/utils.js";

const renderConfigEmails = async (req, res) => {
  const emails = await getEmailsToAlert()
  const admins = await getAdmins();

  if (!emails) {
    return res.status(500).send("Error retrieving email alerts.");
  }

  if (!admins) {
    return res.status(500).send("Error retrieving admins.");
  }

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
            data: { email: admin.mail, display_name: admin.display_name || "Admin" }
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
    const admins = await prisma.user.findMany({
      where: { isAgent: false },
      orderBy: { display_name: 'asc' }
    });

    const allowedAdmins = await prisma.allowedAgents.findMany({
      select: { email: true }
    });
    const allAdmins = [...admins, ...allowedAdmins.filter(aa => !admins.some(a => a.email === aa.email))];
    return allAdmins;
  } catch (error) {
    console.error("Error fetching admins:", error);
  }
}
const renderConfigCarriers = async (req, res) => {
  try {
    // Get all available companies from qq.contacts where type_display = 'R' and status = 'A'
    const availableCompanies = await prisma.$queryRaw`
      SELECT entity_id, display_name, phone
      FROM qq.contacts
      WHERE type_display = 'R' AND status = 'A'
      ORDER BY display_name ASC
    `;

    // Get companies from health schema
    const healthCompanies = await prisma.company.findMany();

    // Build companies list with those that match health.company.externalId
    const companies = [];

    for (const qqComp of availableCompanies) {
      const healthMatch = healthCompanies.find(hc => hc.externalId === qqComp.entity_id);
      if (healthMatch) {
        companies.push({
          id: healthMatch.id,
          name: qqComp.display_name,
          phone: qqComp.phone || '',
          states: Array.isArray(healthMatch.States) ? healthMatch.States.join('| ') : '',
          externalId: qqComp.entity_id
        });
      }
    }

    // Sort by name
    companies.sort((a, b) => a.name.localeCompare(b.name));

    // Get available companies that are NOT in health.company
    const healthExternalIds = new Set(healthCompanies.map(hc => hc.externalId));
    const availableCompaniesToAdd = availableCompanies
      .filter(c => !healthExternalIds.has(c.entity_id))
      .map(c => ({
        entity_id: c.entity_id,
        display_name: c.display_name
      }));

    res.render("config_carriers", {
      user: req.user,
      companies,
      availableCompanies: availableCompaniesToAdd,
      activePage: 'config',
      open: 'carriers'
    });
  } catch (error) {
    console.error("Error rendering carriers config:", error);
  }
}

const postCompany = async (req, res) => {
  const { entity_id, states } = req.body;

  if (!entity_id || !Array.isArray(states) || states.length === 0) {
    return res.status(400).json({ message: "Entity ID and at least one state are required" });
  }

  try {
    await prismaContext.run({ userId: req.user?.user_id ?? "unknown" }, async () => {
      // Check if company already exists with this externalId
      const existing = await prisma.company.findUnique({
        where: { externalId: entity_id }
      });

      let company;

      if (existing) {
        res.status(409).json({ message: "Company already exists" });
        return;
      } else {
        // Create new company with externalId
        company = await prisma.company.create({
          data: {
            externalId: entity_id,
            States: states,
            iconPath: `https://goldentrust-img.s3.us-east-1.amazonaws.com/comp/avatar/${entity_id}.png`
          }
        });
      }

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
  const { companyId, states } = req.body;

  if (!companyId || !Array.isArray(states) || states.length === 0) {
    return res.status(400).json({ message: "Company ID and at least one state are required" });
  }

  try {
    await prismaContext.run({ userId: req.user?.user_id ?? "unknown" }, async () => {
      const existingCompany = await prisma.company.findUnique({
        where: { id: companyId },
        include: { Commisions: true }
      });

      if (!existingCompany) {
        return res.status(404).json({ message: "Company not found" });
      }

      // Update States
      await prisma.company.update({
        where: { id: companyId },
        data: { States: states }
      });

      // Add new commissions with amount 0
      const existingStatesWithCommissions = new Set(existingCompany.Commisions.map(c => c.state));
      const newStates = states.filter(state => !existingStatesWithCommissions.has(state));

      const newCommissionData = newStates.map(state => ({
        companyId: companyId,
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
            companyId: companyId,
            state: { in: removedStates }
          }
        });
      }
    });

    res.status(200).json({ message: "Company updated successfully" });
  } catch (error) {
    console.error("Error updating company:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const deleteCompany = async (req, res) => {
  const { companyId } = req.body;
  if (!companyId) {
    return res.status(400).json({ message: "Company ID is required" });
  }

  try {
    await prismaContext.run({ userId: req.user?.user_id ?? "unknown" }, async () => {
      await prisma.company.delete({
        where: { id: companyId }
      });
    });
    res.status(200).json({ message: "Company deleted successfully" });
  } catch (error) {
    console.error("Error deleting company:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const renderConfigCommisions = async (req, res) => {
  // Get companies from health schema
  const healthCompanies = await prisma.company.findMany();

  // Get only the externalIds that exist in health schema
  const externalIds = healthCompanies
    .filter(hc => hc.externalId)
    .map(hc => hc.externalId);

  // Get external company data (name, phone) as a Map
  const externalCompaniesMap = await getCompanyNamesMap(externalIds);

  // Create a map of company names (health.id -> name)
  const companyNameMap = new Map();
  for (const hc of healthCompanies) {
    if (hc.externalId && externalCompaniesMap.has(hc.externalId)) {
      const extComp = externalCompaniesMap.get(hc.externalId);
      companyNameMap.set(hc.id, extComp.name);
    }
  }

  // Format companies for the view
  const companies = Array.from(companyNameMap.entries()).map(([id, name]) => ({
    id,
    name,
    States: healthCompanies.find(hc => hc.id === id)?.States || []
  })).sort((a, b) => a.name.localeCompare(b.name));

  const commisionsRaw = await prisma.commisions.findMany({
    include: { company: true }
  });

  try {
    const commisions = commisionsRaw.map(c => {
      const companyName = companyNameMap.get(c.companyId) || 'Unknown';
      return {
        company: companyName,
        state: c.state,
        amount: c.amount
      };
    });
    res.render("config_commisions", { user: req.user, companies, commisions, activePage: 'config', open: 'commisions' });
  } catch (error) {
    console.error("Error mapping commissions:", error);
    return res.status(500).send("Error processing commissions data.");
  }
};

const updateCommisions = async (req, res) => {
  const { commissions } = req.body;

  if (!Array.isArray(commissions) || commissions.length === 0) {
    return res.status(400).json({ message: "No commissions provided" });
  }

  try {
    // Get company names from commissions
    const companyNames = [...new Set(commissions.map(c => c.company))];

    // Get all companies from health schema
    const healthCompanies = await prisma.company.findMany();

    // Get only the externalIds that exist in health schema
    const externalIds = healthCompanies
      .filter(hc => hc.externalId)
      .map(hc => hc.externalId);

    const qqNamesMap = await getCompanyNamesMap(externalIds);

    // Create name to ID mapping
    const nameToId = {};
    for (const hc of healthCompanies) {
      if (hc.externalId && qqNamesMap.has(hc.externalId)) {
        const companyName = qqNamesMap.get(hc.externalId);
        nameToId[companyName] = hc.id;
      }
    }

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

    const formattedAgents = await Promise.all(agents.map(async agent => {
      let photoPath = '';
      let display_name = '';

      // For Microsoft users, fetch photoPath from user_avatars table
      if (agent.email && agent.email.endsWith('@goldentrust.com')) {
        const entra_user = await prisma.$queryRaw`
          SELECT user_id, display_name
          FROM entra.users
          WHERE mail = ${agent.email}
        `;

        if (entra_user.length !== 0) {
          const user_avatar_photo_path = await prisma.$queryRaw`
            SELECT s3_url AS photo
            FROM entra.user_avatars
            WHERE entra_id = ${entra_user[0].user_id}
          `;
          photoPath = user_avatar_photo_path.length > 0 ? user_avatar_photo_path[0].photo : '';
          display_name = entra_user[0].display_name;
        }
      }

      // Generate signed URL for photoPath if it's from S3
      if (photoPath) {
        photoPath = await getSignedS3Url(photoPath);
      }

      return {
        id: agent.id,
        email: agent.email,
        display_name: display_name,
        photoPath: photoPath,
        rights: agent.AgentRights.map(ar => ar.idRight)
      };
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
