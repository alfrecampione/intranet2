import { get } from "https";
import { prisma, pool } from "../config/dbConfig.js";
import { prismaContext } from "../config/prismaContext.js";
import { getAllAgencyIds, getAgencies, getEntraId, getMSAPhotoPath } from "../config/utils.js";
import { getSignedS3Url } from "../config/s3Config.js";
import bcrypt from "bcrypt";
import { encryptWithSecret } from "./crypto.js";



// Helper function to resolve agency/franchise name
const getAgencyOrFranchiseName = async (personalInfo) => {
  try {
    if (personalInfo?.underAgency?.name) {
      return personalInfo.underAgency.name;
    }

    if (personalInfo?.franchise) {
      const franchiseId = parseInt(personalInfo.franchise, 10);
      if (!isNaN(franchiseId)) {
        const result = await pool.query(
          `SELECT alias FROM qq.locations WHERE location_id = $1`,
          [franchiseId]
        );
        return result.rows[0]?.alias || null;
      }
    }
  } catch (error) {
    console.error("Error fetching agency/franchise name:", error);
  }

  return null;
};

const getData = async (users) => {
  try {
    const registeredUsers = await Promise.all(users.map(async u => {
      const agencyName = await getAgencyOrFranchiseName(u.personalInfo);

      let photoPath = u.personalInfo?.photoPath || null;

      // For Microsoft users, fetch photoPath from user_avatars table
      if (u.email && u.email.endsWith('@goldentrust.com')) {
        const realId = await getEntraId(u.email.toLowerCase());
        const msaPhotoPath = await getMSAPhotoPath(realId);
        photoPath = msaPhotoPath || photoPath;
      }

      // Generate signed URL for photoPath if it's from S3
      if (photoPath) {
        photoPath = await getSignedS3Url(photoPath);
      }

      return {
        ...u,
        photoPath: photoPath,
        agency: u.personalInfo?.contactType === 'business' ? u.personalInfo.businessName : agencyName
      };
    }));
    return registeredUsers;
  } catch (error) {
    console.error("Error in getData:", error);
    return [];
  }

}

// ===============================
// Render Functions
// ===============================

const renderMyAgents = async (req, res) => {
  const user = req.user;

  if (!user || !user.isAgent || user.personalInfo?.contactType?.toLowerCase() !== "business") {
    res.status(403).send("Access denied");
    return;
  }

  let where = { isReleased: false };

  const agency = await prisma.agency.findUnique({
    where: { owner: user.user_id },
  });

  if (agency) {
    const allAgencyIds = await getAllAgencyIds(agency.id);
    where = {
      ...where,
      OR: [
        { personalInfo: { is: { agency: { in: allAgencyIds } } } },
        { user_id: user.user_id }
      ]
    };
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ display_name: "asc" }, { email: "asc" }],
    include: {
      personalInfo: {
        include: {
          underAgency: {
            select: { name: true }
          }
        }
      }
    }
  });

  const registeredUsers = await getData(users);
  const allAgencies = await getAgencies();

  res.render("agents", { user, registeredUsers, allAgencies, activePage: "agents" });
};

const renderAgents = async (req, res) => {
  const user = req.user;

  const users = await prisma.user.findMany({
    where: { isReleased: false },
    orderBy: [{ display_name: "asc" }, { email: "asc" }],
    include: {
      personalInfo: {
        include: {
          underAgency: {
            select: { name: true }
          }
        }
      }
    }
  });

  const registeredUsers = await getData(users);
  const allAgencies = await getAgencies();

  res.render("agents", { user, registeredUsers, allAgencies, activePage: "agents" });
};

const renderReleasedAgents = async (req, res) => {
  const user = req.user;

  const users = await prisma.user.findMany({
    where: { isReleased: true },
    orderBy: [{ display_name: "asc" }, { email: "asc" }],
    include: {
      personalInfo: {
        include: {
          underAgency: {
            select: { name: true }
          }
        }
      }
    }
  });

  const releasedUsers = await getData(users);

  res.render("agents_released", { user, releasedUsers, activePage: "releasedAgents" });
};

const renderReferingAgents = async (req, res) => {
  const user = req.user;

  const users = await prisma.user.findMany({
    where: {
      isReleased: false,
      statesAndCarriers: {
        some: {
          status: { equals: "refering", mode: "insensitive" }
        }
      }
    },
    orderBy: [{ display_name: "asc" }, { email: "asc" }],
    include: {
      personalInfo: {
        include: {
          underAgency: {
            select: { name: true }
          }
        }
      },
      statesAndCarriers: {
        where: { status: { equals: "refering", mode: "insensitive" } },
        include: { carrier: true }
      }
    }
  });

  const referingUsers = await getData(users);

  res.render("agents_refering", { user, referingUsers, activePage: "referingAgents" });
};

const addAgent = async (req, res) => {
  const {
    email,
    legalName,
    phone,
    npn,
    agency,
    franchise
  } = req.body

  const {
    password = "12345678",
    cellPhone = phone,
    contactType = "individual",
  } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  const existingUser = await prisma.user.findUnique({
    where: { email }
  });

  if (existingUser && !existingUser.isReleased) {
    return res.status(400).json({ message: "Agent already exists." });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      display_name: legalName,
      registrationCompleted: false,
      hastoChangePassword: true
    }
  });

  await prisma.necesaryDocuments.create({
    data: { email: user.email }
  });

  await prismaContext.run({ userId: req.user.user_id, affectedUserIds: [user.user_id] }, async () => {

    await prisma.personalInfo.create({
      data: {
        userId: user.user_id,
        legalName: legalName,
        preferredName: null,
        legalSex: null,
        dateOfBirth: null,
        ssn: null,
        npn: npn || null,
        businessName: null,
        companyEIN: null,
        contactType,
        agency: agency || null,
        franchise: franchise || null
      }
    });

    await prisma.contactInfo.create({
      data: {
        userId: user.user_id,
        personalEmail: email,
        personalPhone: cellPhone || null,
        city: "",
        state: "",
        zipCode: "",
        addressLine1: "",
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
        assignToGTI: true,
      }
    });
  });

  return res.status(201).json({
    message: "Agent created successfully",
    userId: user.user_id,
    email: user.email
  });
};

const onboardingSentEmail = async (req, res) => {
  const { email } = req.params;
  const { firstName, lastName, agencyId } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  // Check if onboarding was already sent and is still pending
  const existingRecord = await prisma.onboardingSentEmails.findUnique({
    where: { email }
  });

  if (existingRecord && existingRecord.pending) {
    return res.status(400).json({
      message: "An onboarding email has already been sent to this address and is still pending completion."
    });
  }

  await prisma.onboardingSentEmails.upsert({
    where: { email },
    update: {
      sentAt: new Date(),
      pending: true,
      firstName: firstName || null,
      lastName: lastName || null,
      agencyId: agencyId || null
    },
    create: {
      email,
      sentAt: new Date(),
      pending: true,
      firstName: firstName || null,
      lastName: lastName || null,
      agencyId: agencyId || null
    }
  });
  res.status(200).json({ message: "Onboarding email record updated." });
};

const deleteAgent = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "Agent ID is required." });
  }

  await prismaContext.run({ userId: req.user.user_id, affectedUserIds: [id] }, async () => {
    const user = await prisma.user.findUnique({
      where: { user_id: id }
    })

    await prisma.user.delete({
      where: { user_id: id }
    });

    await prisma.necesaryDocuments.delete({
      where: { email: user.email }
    })
  });

  res.status(200).json({ message: "Agent deleted successfully." });
};

const markDocsAsNecessary = async (req, res) => {
  const { email, ...requiredDocuments } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  // Check if the email exists in necesaryDocuments
  const existingRecord = await prisma.necesaryDocuments.findUnique({
    where: { email }
  });
  if (existingRecord) {
    return res.status(400).json({ message: "An onboarding email has already been sent to this address and is still pending completion." });
  }

  await prismaContext.run({ userId: req.user.user_id }, async () => {
    const doc = await prisma.necesaryDocuments.create({
      data: {
        email,
        ...requiredDocuments
      }
    });

    res.status(200).json({ message: "Necessary documents saved.", doc });
  });
};

function normalizeCarrierValue(value) {
  if (!value || typeof value !== "string") return [];
  try {
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
  } catch (error) {
    console.error("Error normalizing carrier value:", error);
    return [];
  }


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

      const encryptedSsn = ssn ? encryptWithSecret(ssn) : null;

      await prisma.personalInfo.create({
        data: {
          userId: user.user_id,
          legalName,
          preferredName: firstName,
          legalSex: null,
          dateOfBirth: birthDate ? new Date(birthDate) : null,
          ssn: encryptedSsn,
          npn: npn || null,
          businessName: agency || null,
          companyEIN: companyEIN || null,
          contactType,
          agency: agency || null
        }
      });

      await prisma.contactInfo.create({
        data: {
          userId: user.user_id,
          personalEmail: email,
          personalPhone: cellPhone || null,
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

      // Fetch all companies once to map names to IDs
      const companies = await prisma.company.findMany({
        select: { id: true, name: true }
      });
      const companyNameToId = new Map(companies.map(c => [c.name, c.id]));

      for (const field of carrierFields) {
        const rawValue = agent[field];
        const entries = normalizeCarrierValue(rawValue);

        // Get company ID from name
        const companyId = companyNameToId.get(field);
        if (!companyId) {
          console.warn(`Company not found for field: ${field}`);
          continue;
        }

        for (const entry of entries) {
          try {
            await prisma.statesANDCarriers.create({
              data: {
                userId: user.user_id,
                state: entry.state,
                company: companyId,
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

const recoverAgent = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "Agent ID is required." });
  }

  await prismaContext.run({ userId: req.user.user_id, affectedUserIds: [id] }, async () => {
    await prisma.user.update({
      where: { user_id: id },
      data: { isReleased: false }
    });
  });
  res.status(200).json({ message: "Agent recovered successfully." });
}

export {
  renderAgents,
  renderReleasedAgents,
  renderReferingAgents,
  renderMyAgents,
  markDocsAsNecessary,
  addAgent,
  deleteAgent,
  recoverAgent,
  massiveCreateAgents,
  onboardingSentEmail
};
