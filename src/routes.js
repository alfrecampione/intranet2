import express from "express";
import {
  login,
  renderResetPassword,
  resetPassword,
  logout,
  checkAuthenticated,
  checkNotAuthenticated,
  signUp,
  createAccount,
  validateEmail,
  renderEmailValidation,
} from "./controllers/auth.js";
import {
  redirect_dashboard,
  dashboard,
  dashboardLastQuarter,
  dashboardWeekReports,
  totalSalesStatistics,
  nbSalesStatistics,
  rnSalesStatistics,
  rwSalesStatistics,
  cnSalesStatistics,
} from "./controllers/dash-reports.js";
import { agency } from "./controllers/agency-reports.js";
import { dataSearch } from "./controllers/search.js";
import { passwordMail, email_sender } from "./controllers/mailer.js";
import passport from "passport";
import { authenticate } from "./config/passportConfig.js";
import { register, editRegister } from "./controllers/registration.js";
import { renderAgents, markDocsAsNecessary } from "./controllers/agents.js";

const router = express.Router();

/**HTML REQUEST */

router.get("/login", checkAuthenticated, login);
router.post("/login", authenticate(passport));
router.post("/users/auth/send/:email", passwordMail);
router.get("/users/auth/reset-password/:email", renderResetPassword);
router.post("/users/auth/reset-password/:email", resetPassword);
router.get("/users/logout", logout);
router.get("/", checkNotAuthenticated, redirect_dashboard);
router.get("/users/dashboard", checkNotAuthenticated, dashboard);
router.post(
  "/users/dashboard/lastQuarter",
  checkNotAuthenticated,
  dashboardLastQuarter,
);
router.post(
  "/users/dashboard/weekReports",
  checkNotAuthenticated,
  dashboardWeekReports,
);
router.post(
  "/users/dashboard/totalSalesStatistics",
  checkNotAuthenticated,
  totalSalesStatistics,
);
router.post(
  "/users/dashboard/nbSalesStatistics",
  checkNotAuthenticated,
  nbSalesStatistics,
);
router.post(
  "/users/dashboard/rnSalesStatistics",
  checkNotAuthenticated,
  rnSalesStatistics,
);
router.post(
  "/users/dashboard/rwSalesStatistics",
  checkNotAuthenticated,
  rwSalesStatistics,
);
router.post(
  "/users/dashboard/cnSalesStatistics",
  checkNotAuthenticated,
  cnSalesStatistics,
);
router.get("/users/agency", checkNotAuthenticated, agency);

router.post("/users/search", checkNotAuthenticated, dataSearch);

router.get("/users/registration", checkNotAuthenticated, register);

router.get("/users/registration/:id", checkNotAuthenticated, editRegister);

router.get("/signUp/:encrypted_email", signUp);
router.post("/signUp", createAccount);

router.get("/email-validation", renderEmailValidation);
router.post("/email-validation", validateEmail);

router.get("/users/agents", checkNotAuthenticated, renderAgents);

router.post("/sendEmail/:email", checkNotAuthenticated, email_sender)

router.post("/necesaryDocs", checkNotAuthenticated, markDocsAsNecessary);

// STEPS ROUTES
import {
  createPersonalInfo,
  getPersonalInfoById,
  createContactInfo,
  getContactInfoById,
  createEmergencyContacts,
  getEmergencyContactById,
  createTaxInfo,
  getTaxInfoById,
  createPaymentMethods,
  getPaymentMethodById,
  createDocuments,
  getDocumentsById,
} from "./controllers/steps.js";

// Step 1: Personal Info
router.post("/steps/personal-info", checkNotAuthenticated, createPersonalInfo);
router.get(
  "/steps/personal-info/:id",
  checkNotAuthenticated,
  getPersonalInfoById,
);

// Step 2: Contact Info
router.post("/steps/contact-info", checkNotAuthenticated, createContactInfo);
router.get(
  "/steps/contact-info/:id",
  checkNotAuthenticated,
  getContactInfoById,
);

// Step 3: Emergency Contact
router.post(
  "/steps/emergency-contact",
  checkNotAuthenticated,
  createEmergencyContacts,
);
router.get(
  "/steps/emergency-contact/:id",
  checkNotAuthenticated,
  getEmergencyContactById,
);

// Step 4: Tax Info
router.post("/steps/tax-info", checkNotAuthenticated, createTaxInfo);
router.get("/steps/tax-info/:id", checkNotAuthenticated, getTaxInfoById);

// Step 5: Payment Method
router.post(
  "/steps/payment-method",
  checkNotAuthenticated,
  createPaymentMethods,
);
router.get(
  "/steps/payment-method/:id",
  checkNotAuthenticated,
  getPaymentMethodById,
);

// Step 6: Documents
router.post("/steps/documents", checkNotAuthenticated, createDocuments);
router.get("/steps/documents/:id", checkNotAuthenticated, getDocumentsById);


//Utils
import { encryptEmail, decryptEmail } from "./controllers/cryptUtils.js";
router.post("/email/encrypt/:email", checkNotAuthenticated, encryptEmail);
router.get("/email/decrypt/:encrypted_email", checkNotAuthenticated, decryptEmail);

import { handleFileUpload } from "./controllers/registration.js";
import upload from "./config/multerConfig.js";
import { encrypt } from "./controllers/crypto.js";
router.post("/upload", checkNotAuthenticated, upload.single("file"), handleFileUpload);

export default router;
