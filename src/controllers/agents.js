import { prisma } from "../config/dbConfig.js";
import { prismaContext } from "../config/prismaContext.js";
import bcrypt from "bcrypt";

const renderAgents = async (req, res) => {
  const user = req.user;

  const users = await prisma.user.findMany({
    where: {
      isReleased: false,
    },
    orderBy: [
      { display_name: 'asc' },
      { email: 'asc' }
    ],
    include: {
      personalInfo: {
        select: { photoPath: true, agency: true }
      }
    }
  });

  // Get all agency ids referenced by users' personalInfo.agency
  const agencyIds = Array.from(new Set(users.map(u => u.personalInfo?.agency).filter(Boolean)));
  let agenciesById = {};
  if (agencyIds.length > 0) {
    const agencies = await prisma.agency.findMany({
      where: { id: { in: agencyIds } },
      select: { id: true, name: true }
    });
    agenciesById = Object.fromEntries(agencies.map(a => [a.id, a.name]));
  }

  const registeredUsers = users.map(u => ({
    ...u,
    photoPath: u.personalInfo?.photoPath || null,
    agency: u.personalInfo?.agency ? agenciesById[u.personalInfo.agency] || null : null,
  }));

  res.render("agents", { user, registeredUsers, activePage: 'agents' });
};

const renderReleasedAgents = async (req, res) => {
  const user = req.user;

  const users = await prisma.user.findMany({
    where: {
      isReleased: true,
    },
    orderBy: [
      { display_name: 'asc' },
      { email: 'asc' }
    ],
    include: {
      personalInfo: {
        select: { photoPath: true, agency: true }
      }
    }
  });

  // Get all agency ids referenced by users' personalInfo.agency
  const agencyIds = Array.from(new Set(users.map(u => u.personalInfo?.agency).filter(Boolean)));
  let agenciesById = {};
  if (agencyIds.length > 0) {
    const agencies = await prisma.agency.findMany({
      where: { id: { in: agencyIds } },
      select: { id: true, name: true }
    });
    agenciesById = Object.fromEntries(agencies.map(a => [a.id, a.name]));
  }

  const releasedUsers = users.map(u => ({
    ...u,
    photoPath: u.personalInfo?.photoPath || null,
    agency: u.personalInfo?.agency ? agenciesById[u.personalInfo.agency] || null : null,
  }));

  res.render("released_agents", { user, releasedUsers, activePage: 'releasedAgents' });
};

const deleteAgent = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "Agent ID is required." });
  }

  await prismaContext.run({ userId: req.user.user_id }, async () => {
    try {
      await prisma.user.delete({
        where: { user_id: id }
      });

      res.status(200).json({ message: "Agent deleted successfully." });
    } catch (error) {
      res.status(500).json({ message: "Error deleting agent.", error: error.message });
    }
  });
};

// Upserts necessary document requirements (write – needs context)
const markDocsAsNecessary = async (req, res) => {
  const { email, ...requiredDocuments } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  await prismaContext.run({ userId: req.user.user_id }, async () => {
    try {
      const doc = await prisma.necesaryDocuments.upsert({
        where: { email },
        update: requiredDocuments,
        create: {
          email,
          ...requiredDocuments
        }
      });

      res.status(200).json({ message: "Necessary documents saved.", doc });
    } catch (error) {
      res.status(500).json({ message: "Error saving necessary documents.", error: error.message });
    }
  });
};

function normalizeCarrierValue(value) {
  if (!value || typeof value !== "string") return [];

  const trimmed = value.trim();

  if (trimmed.includes(",")) {
    const VALID_STATES = new Set([
      "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
      "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
      "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
      "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
      "WI", "WY"
    ]);

    const parts = trimmed.split(",").map(s => s.trim().toUpperCase());
    return parts
      .filter(state => VALID_STATES.has(state))
      .map(state => ({
        state,
        status: "Request Received from Agent"
      }));
  }

  const VALID_STATUSES = ["Request Received from Agent", "Pending Submission", "Submitted to Carrier", "Carrier In Review", "Carrier Sent Contract to Agent", "Ready to Sell", "Rejected by Carrier", "Withdrawn by Agent", "Need Release"];

  if (VALID_STATUSES.find(status => trimmed.toLowerCase().includes(status.toLowerCase()))) {
    const [statePart, statusPart] = trimmed.split("-").map(s => s.trim());
    return [{
      state: statePart.toUpperCase(),
      status: statusPart || "Request Received from Agent"
    }];
  }
  return [{ state: trimmed, status: "Request Received from Agent" }];
}

const massiveCreateAgents = async (req, res) => {
  const agents = req.body.agents;
  if (!Array.isArray(agents) || agents.length === 0) {
    return res.status(400).json({ message: "Agents array is required." });
  }

  const carrierFields = [
    "AMBETTER", "OSCAR", "MOLINA", "CIGNA N-R", "UHC N-R",
    "AETNA", "WELLPOINT", "BCBS-Texas", "BCBS-Illinois"
  ];

  const results = [];

  for (const agent of agents) {
    try {
      const {
        email,
        password = "12345678",
        display_name,
        firstName,
        lastName,
        birthDate,
        ssn,
        npn,
        cellPhone,
        residentAddress,
        city,
        state,
        zip,
        franchise,
        agency,
        companyEIN,
        contactType = "individual",
        legalName = `${firstName} ${lastName}`,
        commisions
      } = agent;

      const existingUser = await prisma.user.findUnique({ where: { email, isReleased: false } });
      if (existingUser) {
        results.push({ email, status: "skipped", reason: "Agent already exists" });
        continue;
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          display_name: display_name || legalName,
          registrationCompleted: false
        }
      });

      await prisma.necesaryDocuments.create({
        data: { email: user.email }
      });

      await prisma.personalInfo.create({
        data: {
          userId: user.user_id,
          legalName,
          preferredName: firstName,
          legalSex: null,
          dateOfBirth: birthDate ? new Date(birthDate) : null,
          ssn: ssn || null,
          npn: npn || null,
          businessName: agency || null,
          companyEIN: companyEIN || null,
          contactType,
          franchise: !!franchise,
          agency: (!!franchise) ? agency : null
        }
      });

      await prisma.contactInfo.create({
        data: {
          userId: user.user_id,
          personalEmail: email,
          personalPhone: cellPhone || null,
          country: "USA",
          city: city || "",
          state: state || "",
          zipCode: zip || "",
          addressLine1: residentAddress || "",
          addressLine2: null
        }
      });

      await prisma.paymentMethod.create({
        data: {
          userId: user.user_id,
          bankAccountType: null,
          bankAccountNum: null,
          bankRoutingNum: null,
          accountNickname: null,
          assignToGTI: !!commisions,
        }
      });

      for (const field of carrierFields) {
        const rawValue = agent[field];
        const entries = normalizeCarrierValue(rawValue);

        for (const entry of entries) {
          try {
            await prisma.statesANDCarriers.create({
              data: {
                userId: user.user_id,
                state: entry.state,
                company: field,
                status: entry.status
              }
            });
          } catch (error) {
            console.warn(`Failed to add ${field} in ${entry.state} for ${email}:`, error.message);
          }
        }
      }

      results.push({ email, status: "created" });
    } catch (error) {
      console.log(`Error processing agent with email ${agent.email}:`, error);
      results.push({ email: agent.email, status: "error", error: error.message });
    }
  }

  res.status(200).json({ results });
};

export {
  renderAgents,
  renderReleasedAgents,
  markDocsAsNecessary,
  deleteAgent,
  massiveCreateAgents
};
