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
import { passwordMail, email_sender, new_user_notification } from "./controllers/mailer.js";
import passport from "passport";
import { authenticate } from "./config/passportConfig.js";
import { register, editRegister } from "./controllers/registration.js";
import { renderAgents, markDocsAsNecessary, deleteAgent } from "./controllers/agents.js";

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
router.delete("/users/agency/:id", checkNotAuthenticated, deleteAgent);

router.post("/users/search", checkNotAuthenticated, dataSearch);

router.get("/users/registration", checkNotAuthenticated, register);

router.get("/users/registration/:id", checkNotAuthenticated, editRegister);

router.get("/signUp/:encrypted_email", signUp);
router.post("/signUp", createAccount);

router.get("/email-validation", renderEmailValidation);
router.post("/email-validation", validateEmail);

router.get("/users/agents", checkNotAuthenticated, renderAgents);

router.post("/sendEmail/:email", checkNotAuthenticated, email_sender);

router.post("/necesaryDocs", checkNotAuthenticated, markDocsAsNecessary);

router.post("/email/config", checkNotAuthenticated, new_user_notification)

import { renderCarrierStatus, updateCarrierStatus } from "./controllers/carrier_status.js";
router.get("/users/carrrier_status/:id", checkNotAuthenticated, renderCarrierStatus);
router.post("/users/carrrier_status", checkNotAuthenticated, updateCarrierStatus);

// STEPS ROUTES
import {
  createPersonalInfo,
  getPersonalInfoById,
  createContactInfo,
  getContactInfoById,
  createPaymentMethod,
  getPaymentMethodById,
  createDocuments,
  getDocumentsById,
  getStateCarriers,
  saveStatesCarriers,
} from "./controllers/steps.js";

router.post("/steps/personal-info", checkNotAuthenticated, createPersonalInfo);
router.get(
  "/steps/personal-info/:id",
  checkNotAuthenticated,
  getPersonalInfoById,
);

router.post("/steps/contact-info", checkNotAuthenticated, createContactInfo);
router.get(
  "/steps/contact-info/:id",
  checkNotAuthenticated,
  getContactInfoById,
);

router.post(
  "/steps/payment-method",
  checkNotAuthenticated,
  createPaymentMethod,
);
router.get(
  "/steps/payment-method/:id",
  checkNotAuthenticated,
  getPaymentMethodById,
);

router.post("/steps/documents", checkNotAuthenticated, createDocuments);
router.get("/steps/documents/:id", checkNotAuthenticated, getDocumentsById);

router.get("/steps/states-carriers", checkNotAuthenticated, getStateCarriers);
router.post("/steps/states-carriers", checkNotAuthenticated, saveStatesCarriers);


//Utils
import { encryptEmail, decryptEmail } from "./controllers/cryptUtils.js";
router.post("/email/encrypt/:email", checkNotAuthenticated, encryptEmail);
router.get("/email/decrypt/:encrypted_email", checkNotAuthenticated, decryptEmail);

import { handleFileUpload } from "./controllers/registration.js";
import upload from "./config/multerConfig.js";
router.post("/upload", checkNotAuthenticated, upload.single("file"), handleFileUpload);

import { renderConfigEmails, postAdminToAlert, deleteEmailToAlert } from "./controllers/config.js";
router.get("/users/config_emails", checkNotAuthenticated, renderConfigEmails)
router.post("/users/config_emails", checkNotAuthenticated, postAdminToAlert);
router.delete("/users/config_emails", checkNotAuthenticated, deleteEmailToAlert);

import { renderConfigCarriers, postCompany, updateCompany, deleteCompany } from "./controllers/config.js";
router.get("/users/config_carriers", checkNotAuthenticated, renderConfigCarriers);
router.post("/users/config_carriers", checkNotAuthenticated, postCompany);
router.put("/users/config_carriers", checkNotAuthenticated, updateCompany);
router.delete("/users/config_carriers", checkNotAuthenticated, deleteCompany);

import { renderConfigCommisions, updateCommisions } from "./controllers/config.js";
import { render } from "ejs";
router.get("/users/config_commisions", checkNotAuthenticated, renderConfigCommisions);
router.put("/users/config_commisions", checkNotAuthenticated, updateCommisions);

import { massiveCreateAgents } from "./controllers/agents.js";
router.post("/agents/massiveCreate", massiveCreateAgents);


export default router;
