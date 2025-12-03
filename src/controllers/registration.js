import { prisma } from "../config/dbConfig.js";
import { getAgencies, getAllCompanies } from "../config/utils.js";
import { uploadToS3, isValidFileType, deleteFromS3, processS3Urls } from "../config/s3Config.js";
import { deleteEmail } from "./mailer.js";
import { asyncHandler } from "../config/errorHandler.js";


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
    getAllCompanies(),
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

  // Process S3 URLs to generate signed URLs
  const processedPersonalInfo = await processS3Urls(personalInfo);
  const processedDocuments = await processS3Urls(documents);

  return {
    user,
    userId,
    personalInfo: processedPersonalInfo,
    contactInfo,
    paymentMethod,
    documents: processedDocuments,
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

const register = asyncHandler(async (req, res) => {
  const userId = req.user.user_id;
  const data = await getRegistrationData(userId, false, req.user);

  const allAgencies = await getAgencies();

  res.render("registration", { ...data, US_STATES, allAgencies, activePage: "registration" });
});

const editRegister = asyncHandler(async (req, res) => {
  const user = req.user;
  const userId = req.params.id || user.user_id;
  const data = await getRegistrationData(userId, true, req.user);

  const allAgencies = await getAgencies();

  res.render("registration", { ...data, US_STATES, allAgencies, activePage: "registration" });
});

const handleFileUpload = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }

  // Validate file type
  if (!isValidFileType(req.file.originalname, req.file.mimetype)) {
    return res.status(400).json({
      success: false,
      error: "Invalid file type. Allowed: jpeg, jpg, png, pdf, doc, docx",
    });
  }

  // Check file size (2MB limit)
  if (req.file.size > 2 * 1024 * 1024) {
    return res.status(400).json({
      success: false,
      error: "File size exceeds 2MB limit",
    });
  }

  const userId = req.user?.user_id || "general";
  const fieldName = req.body.field; // Field name sent from frontend

  // If updating an existing field, delete the old file first
  if (fieldName && userId !== "general") {
    try {
      // Get current file URL from database
      let oldFileUrl = null;

      if (fieldName === "photoPath") {
        const personalInfo = await prisma.personalInfo.findUnique({
          where: { userId },
          select: { photoPath: true }
        });
        oldFileUrl = personalInfo?.photoPath;
      } else {
        // It's a document field
        const documents = await prisma.documents.findUnique({
          where: { userId },
        });
        oldFileUrl = documents?.[fieldName];
      }

      // Delete old file from S3 if it exists
      if (oldFileUrl && oldFileUrl.includes('s3.amazonaws.com')) {
        await deleteFromS3(oldFileUrl);
      }
    } catch (deleteError) {
      console.error("Error deleting old file:", deleteError);
      // Continue with upload even if deletion fails
    }
  }

  // Upload to S3
  const s3Url = await uploadToS3(
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype,
    userId
  );

  res.json({
    success: true,
    path: s3Url,
  });
});

const renderOnboardingPending = asyncHandler(async (req, res) => {
  const onboardingPending = await prisma.onboardingSentEmails.findMany({
    where: { pending: true },
    orderBy: { sentAt: 'desc' }
  });

  const formatted = onboardingPending.map(u => ({
    ...u,
    sentAt: u.sentAt.toISOString(),
  }));

  res.render("onboarding_pending", {
    user: req.user,
    activePage: "pending-onboarding",
    onboardingPending: formatted,
  });
});

const deleteOnboardingPending = asyncHandler(async (req, res) => {
  const { email } = req.params;

  if (!email) {
    return res.status(400).json({ success: false, message: "Email is required" });
  }

  // Delete crypto record (invalidates onboarding link)
  await prisma.crypto.deleteMany({
    where: { data: email }
  });

  // Delete necessary documents
  await prisma.necesaryDocuments.deleteMany({
    where: { email: email }
  });

  // Delete onboarding sent email record
  await prisma.onboardingSentEmails.deleteMany({
    where: { email: email }
  });

  console.log(`✅ Deleted all onboarding data for ${email}`);

  return res.status(200).json({
    success: true,
    message: "Onboarding data deleted successfully"
  });
});



export { register, handleFileUpload, editRegister, renderOnboardingPending, deleteOnboardingPending };