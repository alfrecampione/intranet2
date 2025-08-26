import { prisma } from "../config/dbConfig.js";

async function getRegistrationData(userId, isEdit = false, reqUser) {
  const user = reqUser;

  const [
    personalInfo,
    contactInfo,
    paymentMethod,
    documents,
    statesAndCarriersbyUser,
    allCompanies,
    recommendation
  ] = await Promise.all([
    prisma.personalInfo.findUnique({ where: { userId } }),
    prisma.contactInfo.findUnique({ where: { userId } }),
    prisma.paymentMethod.findUnique({ where: { userId } }),
    prisma.documents.findUnique({ where: { userId } }),
    prisma.statesANDCarriers.findMany({ where: { userId } }),
    prisma.company.findMany(),
    prisma.recommendation.findUnique({ where: { userId } })
  ]);

  let necessaryDocuments;

  if (isEdit) {
    const existingUser = await prisma.user.findUnique({ where: { user_id: userId } })
    necessaryDocuments = await prisma.necesaryDocuments.findUnique({
      where: { email: existingUser.email },
    });
  }
  else {
    necessaryDocuments = await prisma.necesaryDocuments.findUnique({
      where: { email: user.email },
    });
  }


  return {
    user,
    userId,
    personalInfo,
    contactInfo,
    paymentMethod,
    documents,
    necessaryDocuments,
    isEdit,
    statesAndCarriersbyUser,
    allCompanies,
    recommendation
  };
}

const US_STATES = [
  { name: "Alabama", abbr: "AL" }, { name: "Alaska", abbr: "AK" }, { name: "Arizona", abbr: "AZ" },
  { name: "Arkansas", abbr: "AR" }, { name: "California", abbr: "CA" }, { name: "Colorado", abbr: "CO" },
  { name: "Connecticut", abbr: "CT" }, { name: "Delaware", abbr: "DE" }, { name: "Florida", abbr: "FL" },
  { name: "Georgia", abbr: "GA" }, { name: "Hawaii", abbr: "HI" }, { name: "Idaho", abbr: "ID" },
  { name: "Illinois", abbr: "IL" }, { name: "Indiana", abbr: "IN" }, { name: "Iowa", abbr: "IA" },
  { name: "Kansas", abbr: "KS" }, { name: "Kentucky", abbr: "KY" }, { name: "Louisiana", abbr: "LA" },
  { name: "Maine", abbr: "ME" }, { name: "Maryland", abbr: "MD" }, { name: "Massachusetts", abbr: "MA" },
  { name: "Michigan", abbr: "MI" }, { name: "Minnesota", abbr: "MN" }, { name: "Mississippi", abbr: "MS" },
  { name: "Missouri", abbr: "MO" }, { name: "Montana", abbr: "MT" }, { name: "Nebraska", abbr: "NE" },
  { name: "Nevada", abbr: "NV" }, { name: "New Hampshire", abbr: "NH" }, { name: "New Jersey", abbr: "NJ" },
  { name: "New Mexico", abbr: "NM" }, { name: "New York", abbr: "NY" }, { name: "North Carolina", abbr: "NC" },
  { name: "North Dakota", abbr: "ND" }, { name: "Ohio", abbr: "OH" }, { name: "Oklahoma", abbr: "OK" },
  { name: "Oregon", abbr: "OR" }, { name: "Pennsylvania", abbr: "PA" }, { name: "Rhode Island", abbr: "RI" },
  { name: "South Carolina", abbr: "SC" }, { name: "South Dakota", abbr: "SD" }, { name: "Tennessee", abbr: "TN" },
  { name: "Texas", abbr: "TX" }, { name: "Utah", abbr: "UT" }, { name: "Vermont", abbr: "VT" },
  { name: "Virginia", abbr: "VA" }, { name: "Washington", abbr: "WA" }, { name: "West Virginia", abbr: "WV" },
  { name: "Wisconsin", abbr: "WI" }, { name: "Wyoming", abbr: "WY" }
];

const register = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const data = await getRegistrationData(userId, false, req.user);

    const allAgencies = await prisma.agency.findMany({
      where: {
        OR: [
          { owner: { not: userId } },
          { owner: null }
        ]
      },
      orderBy: { name: 'asc' },
    });

    res.render("registration", { ...data, US_STATES, allAgencies, activePage: "registration" });
  } catch (error) {
    console.error("Error loading registration data:", error.message);
    res.status(500).send("Error loading registration data.");
  }
};

const editRegister = async (req, res) => {
  try {
    const user = req.user;
    const userId = req.params.id || user.user_id;
    const data = await getRegistrationData(userId, true, req.user);

    const allAgencies = await prisma.agency.findMany({
      where: {
        OR: [
          { owner: { not: userId } },
          { owner: null }
        ]
      },
      orderBy: { name: 'asc' },
    });

    res.render("registration", { ...data, US_STATES, allAgencies, activePage: "registration" });
  } catch (error) {
    console.error("Error loading registration data:", error.message);
    res.status(500).send("Error loading registration data.");
  }
};

const handleFileUpload = (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const normalizedPath = req.file.path.replace(/\\/g, "/");
    const relativePath = normalizedPath.includes("uploads/")
      ? normalizedPath.substring(normalizedPath.indexOf("uploads/"))
      : `uploads/${req.file.filename}`;

    res.json({ path: relativePath });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      error: "Upload failed",
      details: error.message,
    });
  }
};



export { register, handleFileUpload, editRegister };