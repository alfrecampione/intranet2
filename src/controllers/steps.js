import { prisma } from "../config/dbConfig.js";
import { prismaContext } from "../config/prismaContext.js";
import { processS3Urls } from "../config/s3Config.js";
import { asyncHandler } from "../config/errorHandler.js";

// Step 1: Personal Info
export const createPersonalInfo = asyncHandler(async (req, res) => {
  await prismaContext.run({ userId: req.user.user_id }, async () => {
    const {
      contactType,
      legalName,
      preferredName,
      legalSex,
      dateOfBirth,
      ssn,
      userId,
      photoPath,
      businessName,
      companyEIN,
      npn,
      agency,
      franchise,
    } = req.body;

    const data = {
      contactType,
      legalName,
      preferredName: preferredName || null,
      legalSex,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      ssn,
      userId,
      photoPath: photoPath || null,
      businessName: businessName || null,
      companyEIN: companyEIN || null,
      npn,
      agency: agency || null,
      franchise: franchise || null,
    };

    if (contactType === "business" && businessName) {
      const agencyData = {
        owner: userId,
        name: businessName,
      };
      await prisma.agency.upsert({
        where: { owner: userId },
        update: agencyData,
        create: agencyData,
      });
    }

    const personalInfo = await prisma.personalInfo.upsert({
      where: { userId },
      update: data,
      create: data,
    });

    await prisma.user.update({
      where: { user_id: userId },
      data: { registrationCompleted: true, display_name: legalName },
    });

    await prisma.onboardingSentEmails.update({
      where: { email: req.user.email },
      data: { pending: false },
    });

    res.json(personalInfo);
  });
});
  });
};

export const getPersonalInfoById = asyncHandler(async (req, res) => {
  const personalInfo = await prisma.personalInfo.findUnique({
    where: { userId: req.params.id },
  });
  const processedPersonalInfo = await processS3Urls(personalInfo);
  res.json(processedPersonalInfo);
});

// Step 2: Contact Info
export const createContactInfo = asyncHandler(async (req, res) => {
  await prismaContext.run({ userId: req.user.user_id }, async () => {
    const {
      personalEmail,
      personalPhone,
      country,
      addressLine1,
      addressLine2,
      city,
      state,
      zipCode,
      userId,
    } = req.body;

    const data = {
      personalEmail,
      personalPhone: personalPhone || null,
      country,
      addressLine1,
      addressLine2,
      city,
      state,
      zipCode,
      userId,
    };

    const contactInfo = await prisma.contactInfo.upsert({
      where: { userId: data.userId },
      update: data,
      create: data,
    });
    res.json(contactInfo);
  });
});

export const getContactInfoById = asyncHandler(async (req, res) => {
  const contactInfo = await prisma.contactInfo.findUnique({
    where: { userId: req.params.id },
  });
  res.json(contactInfo);
});

export const createPaymentMethod = asyncHandler(async (req, res) => {
  await prismaContext.run({ userId: req.user.user_id }, async () => {
    const {
      userId,
      assignToGTI,
      bankAccountType,
      bankAccountNum,
      bankRoutingNum,
      accountNickname,
    } = req.body;

    const paymentMethod = {
      userId,
      assignToGTI,
      bankAccountType: assignToGTI ? bankAccountType : null,
      bankAccountNum: assignToGTI ? bankAccountNum : null,
      bankRoutingNum: assignToGTI ? bankRoutingNum : null,
      accountNickname: assignToGTI ? accountNickname : null,
    };

    if (!paymentMethod || !paymentMethod.userId) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid payment method or missing userId." });
    }

    await prisma.paymentMethod.upsert({
      where: { userId: paymentMethod.userId },
      update: paymentMethod,
      create: paymentMethod,
    });

    res.status(201).json({ success: true, message: "Payment method replaced successfully" });
  });
});

export const getPaymentMethodById = asyncHandler(async (req, res) => {
  const paymentMethods =
    (await prisma.paymentMethod.findMany({
      where: { userId: req.params.id },
    })) || [];
  res.json(paymentMethods);
});

export const createDocuments = asyncHandler(async (req, res) => {
  await prismaContext.run({ userId: req.user.user_id }, async () => {
    const { userId, ...documentData } = req.body;

    const documents = await prisma.documents.upsert({
      where: { userId },
      update: documentData,
      create: { userId, ...documentData },
    });

    res.status(201).json(documents);
  });
});

export const getDocumentsById = asyncHandler(async (req, res) => {
  const documents = await prisma.documents.findUnique({
    where: { userId: req.params.id },
  });
  const processedDocuments = await processS3Urls(documents);
  res.json(processedDocuments);
});

export const getStateCarriers = asyncHandler(async (req, res) => {
  const statesCarriers = await prisma.statesCarriers.findMany({
    orderBy: { state: "asc" },
  });
  res.json(statesCarriers);
});

export const saveStatesCarriers = asyncHandler(async (req, res) => {
  await prismaContext.run({ userId: req.user.user_id }, async () => {
    const { userId, carriers, recommendation, isDone } = req.body;

    if (!userId || !Array.isArray(carriers) || carriers.length === 0) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }
    const results = [];
    for (const carrier of carriers) {
      if (carrier.id && Array.isArray(carrier.states)) {
        for (const state of carrier.states) {
          const record = await prisma.statesANDCarriers.upsert({
            where: {
              userId_company_state: {
                userId,
                company: carrier.id,
                state,
              },
            },
            update: {},
            create: {
              userId,
              company: carrier.id,
              state,
              status: "Empty",
            },
          });
          results.push(record);
        }
      }
    }

    await prisma.recommendation.upsert({
      where: { userId },
      update: {
        recommendation: recommendation || "",
        isDone: isDone ?? false,
      },
      create: {
        userId,
        recommendation: recommendation || "",
        isDone: isDone ?? false,
      },
    });

    res.status(201).json({ success: true, statesAndCarriers: results });
  });
});