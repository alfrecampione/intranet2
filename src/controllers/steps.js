import { prisma } from "../config/dbConfig.js";
import { prismaContext } from "../config/prismaContext.js";
import { processS3Urls } from "../config/s3Config.js";
import { asyncHandler } from "../config/errorHandler.js";
import { encryptWithSecret, decryptWithSecret } from "./crypto.js";

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

    const encryptedSsn = ssn ? encryptWithSecret(ssn) : null;

    const data = {
      contactType,
      legalName,
      preferredName: preferredName || null,
      legalSex,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      ssn: encryptedSsn,
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
      data: { display_name: legalName },
    });

    await prisma.onboardingSentEmails.update({
      where: { email: req.user.email },
      data: { pending: false },
    });

    res.status(201).json({ success: true, message: "Personal info saved successfully", personalInfo });
  });
});


export const getPersonalInfoById = asyncHandler(async (req, res) => {
  const personalInfo = await prisma.personalInfo.findUnique({
    where: { userId: req.params.id },
  });
  const processedPersonalInfo = personalInfo ? await processS3Urls(personalInfo) : null;
  if (processedPersonalInfo?.ssn) {
    processedPersonalInfo.ssn = decryptWithSecret(processedPersonalInfo.ssn);
  }
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
  res.status(201).json({ success: true, message: "Contact info retrieved successfully", contactInfo });
});

// Step 3: Payment Method
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

    const encryptedAccountNum = assignToGTI && bankAccountNum
      ? encryptWithSecret(bankAccountNum)
      : null;
    const encryptedRoutingNum = assignToGTI && bankRoutingNum
      ? encryptWithSecret(bankRoutingNum)
      : null;

    const paymentMethod = {
      userId,
      assignToGTI,
      bankAccountType: assignToGTI ? bankAccountType : null,
      bankAccountNum: encryptedAccountNum,
      bankRoutingNum: encryptedRoutingNum,
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

    res.status(201).json({ success: true, message: "Payment method replaced successfully", paymentMethod });
  });
});

export const getPaymentMethodById = asyncHandler(async (req, res) => {
  const paymentMethods =
    (await prisma.paymentMethod.findMany({
      where: { userId: req.params.id },
    })) || [];
  const decryptedPaymentMethods = paymentMethods.map((method) => ({
    ...method,
    bankAccountNum: decryptWithSecret(method.bankAccountNum),
    bankRoutingNum: decryptWithSecret(method.bankRoutingNum),
  }));
  res.json(decryptedPaymentMethods);
});

// Step 4: Documents
export const createDocuments = asyncHandler(async (req, res) => {
  await prismaContext.run({ userId: req.user.user_id }, async () => {
    const { userId, ...documentData } = req.body;

    const documents = await prisma.documents.upsert({
      where: { userId },
      update: documentData,
      create: { userId, ...documentData },
    });

    res.status(201).json({ success: true, message: "Documents saved successfully", documents });
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

// Step 5: Save States and Carriers Selection
export const saveStatesCarriers = asyncHandler(async (req, res) => {
  await prismaContext.run({ userId: req.user.user_id }, async () => {
    const { userId, carriers, recommendation, isDone } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const carrierList = Array.isArray(carriers) ? carriers : [];
    // Clear previous selections if caller sends empty list
    if (carrierList.length === 0) {
      await prisma.statesANDCarriers.deleteMany({ where: { userId } });
    }

    const results = [];
    for (const carrier of carrierList) {
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

    // Verify that all steps are completed before marking registration as complete
    const personalInfo = await prisma.personalInfo.findUnique({ where: { userId } });
    const contactInfo = await prisma.contactInfo.findUnique({ where: { userId } });
    const paymentMethod = await prisma.paymentMethod.findUnique({ where: { userId } });
    const documents = await prisma.documents.findUnique({ where: { userId } });
    const allStepsComplete = personalInfo && contactInfo && paymentMethod && documents;

    if (allStepsComplete) {
      await prisma.user.update({
        where: { user_id: userId },
        data: { registrationCompleted: true },
      });
    }

    res.status(201).json({
      success: true,
      statesAndCarriers: results,
      registrationCompleted: allStepsComplete
    });
  });
});