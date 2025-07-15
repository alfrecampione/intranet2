import { prisma } from "../config/dbConfig.js";

const renderAgents = async (req, res) => {
  const user = req.user;

  const registeredUsers = await prisma.user.findMany({
    orderBy: [
      { display_name: 'asc' },
      { email: 'asc' }
    ]
  });

  res.render("agents", { user, registeredUsers });
};

const deleteAgent = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "Agent ID is required." });
  }

  try {
    await prisma.user.delete({
      where: { user_id: id }
    });

    res.status(200).json({ message: "Agent deleted successfully." });
  } catch (error) {
    res.status(500).json({ message: "Error deleting agent.", error: error.message });
  }
};

const markDocsAsNecessary = async (req, res) => {
  const { email, ...requiredDocuments } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  try {
    // Upsert: create if not exists, update if exists
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
};

import bcrypt from "bcrypt";

const massiveCreateAgents = async (req, res) => {
  const agents = req.body.agents;
  if (!Array.isArray(agents) || agents.length === 0) {
    return res.status(400).json({ message: "Agents array is required." });
  }

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
        legalName = `${firstName} ${lastName}`
      } = agent;

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        results.push({ email, status: "skipped", reason: "User already exists" });
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

      await prisma.user.update({
        where: { email },
        data: {
          display_name: display_name || legalName,
          registrationCompleted: false
        }
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
          agency: agency || null
        }
      });

      await prisma.contactInfo.create({
        data: {
          userId: user.user_id,
          personalEmail: email,
          isPersonalEmailVisible: false,
          personalPhone: cellPhone || null,
          isPersonalPhoneVisible: false,
          country: "USA",
          city: city || "",
          state: state || "",
          zipCode: zip || "",
          addressLine1: residentAddress || "",
          addressLine2: null
        }
      });

      results.push({ email, status: "created" });
    } catch (error) {
      console.log(`Error processing agent with email ${agent.email}:`, error);
      results.push({ email: agent.email, status: "error", error: error.message });
    }
  }

  res.status(200).json({ results });
};



export { renderAgents, markDocsAsNecessary, deleteAgent, massiveCreateAgents };
