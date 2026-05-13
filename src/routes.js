import express from "express";
import { asyncHandler } from "./config/errorHandler.js";
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
  microsoftCallback,
  microsoftLogout,
  checkReadRight,
  checkWriteRight,
} from "./controllers/auth.js";
import {
  redirect_dashboard,
  renderDashboard,
  dashboardLastQuarter,
  dashboardWeekReports,
  totalSalesStatistics,
  nbSalesStatistics,
  rnSalesStatistics,
  rwSalesStatistics,
  cnSalesStatistics,
} from "./controllers/dash_reports.js";
import { agency } from "./controllers/agency_reports.js";
import { dataSearch, getNotifications, renderNotifications, readNotification } from "./controllers/navbar.js";
import { passwordMail, email_sender, new_user_notification, searchNews, readEmails } from "./controllers/mailer.js";
import { postLogin } from "./config/passportConfig.js";
import { register, editRegister, renderOnboardingPending, deleteOnboardingPending } from "./controllers/registration.js";
import { renderAgents, renderReleasedAgents, renderReferingAgents, renderMyAgents, markDocsAsNecessary, addAgent, onboardingSentEmail, deleteAgent, recoverAgent } from "./controllers/agents.js";
import { renderProfile, renderNotes, postNote, editNote, deleteNote, saveSection, addCarrierToUser, deleteCarrierToUser, releaseAgent } from "./controllers/profile.js";

const router = express.Router();

router.get("/login", checkAuthenticated, login);
router.post("/login", postLogin);
router.get("/auth/redirect", microsoftCallback);
router.post("/users/auth/send/:email", passwordMail);
router.get("/users/auth/reset-password/:email", renderResetPassword);
router.post("/users/auth/reset-password/:email", resetPassword);
router.get("/users/logout", logout);
router.get('/auth/logout-complete', microsoftLogout);
router.get("/", checkNotAuthenticated, redirect_dashboard);
router.get("/users/dashboard", checkNotAuthenticated, renderDashboard);

router.get("/users/profile/:id", checkNotAuthenticated, renderProfile);
router.get("/users/profile/:id/notes", checkNotAuthenticated, renderNotes);
router.post("/users/profile/:id/notes", checkNotAuthenticated, postNote);
router.put("/users/profile/:id/notes/:noteId", checkNotAuthenticated, editNote);
router.delete("/users/profile/:id/notes/:noteId", checkNotAuthenticated, deleteNote);
router.post("/users/profile/save-section", checkNotAuthenticated, checkWriteRight, saveSection);
router.post("/users/profile/add-carrier", checkNotAuthenticated, checkWriteRight, addCarrierToUser);
router.delete("/users/profile/carrier/:carrierId", checkNotAuthenticated, checkWriteRight, deleteCarrierToUser);
router.delete("/users/profile/release-agent/:id", checkNotAuthenticated, checkWriteRight, releaseAgent);

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

router.get("/users/all-notifications", checkNotAuthenticated, renderNotifications)
router.get("/users/notifications", checkNotAuthenticated, getNotifications);
router.post("/users/notifications/:id", checkNotAuthenticated, readNotification)

router.get("/users/registration", checkNotAuthenticated, register);

router.get("/users/registration/:id", checkNotAuthenticated, editRegister);

router.get("/signUp/:encrypted_email", signUp);
router.post("/signUp", createAccount);

router.get("/email-validation", renderEmailValidation);
router.post("/email-validation", validateEmail);

router.get("/users/agents", checkNotAuthenticated, checkReadRight, asyncHandler(renderAgents));
router.post("/users/agents", checkNotAuthenticated, asyncHandler(addAgent));
router.delete("/users/agents/:id", checkNotAuthenticated, asyncHandler(deleteAgent));
router.post("/users/agents/recover/:id", checkNotAuthenticated, asyncHandler(recoverAgent));
router.get("/users/released-agents", checkNotAuthenticated, checkReadRight, asyncHandler(renderReleasedAgents));
router.get("/users/refering-agents", checkNotAuthenticated, checkReadRight, asyncHandler(renderReferingAgents));
router.get("/users/my-agents", checkNotAuthenticated, asyncHandler(renderMyAgents));

router.post("/onboardingSent/:email", checkNotAuthenticated, checkWriteRight, asyncHandler(onboardingSentEmail));
router.get("/pending-onboarding", checkNotAuthenticated, checkReadRight, renderOnboardingPending);
router.delete("/pending-onboarding/:email", checkNotAuthenticated, checkWriteRight, deleteOnboardingPending);

router.post("/sendEmail/:email", checkNotAuthenticated, email_sender);
router.get("/search-news", checkNotAuthenticated, searchNews);
router.get("/start-search", readEmails)

router.post("/necessaryDocs", checkNotAuthenticated, asyncHandler(markDocsAsNecessary));

router.post("/email/config", checkNotAuthenticated, new_user_notification)

import { renderCarrierStatus, updateCarrierStatus } from "./controllers/carrier_status.js";
router.get("/users/carrrier_status/:id", checkNotAuthenticated, renderCarrierStatus);
router.post("/users/carrrier_status", checkNotAuthenticated, checkWriteRight, updateCarrierStatus);

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
  initializeUserStepRecords,
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
router.get("/steps/initialize/:id", checkNotAuthenticated, initializeUserStepRecords);

router.get("/steps/states-carriers", checkNotAuthenticated, getStateCarriers);
router.post("/steps/states-carriers", checkNotAuthenticated, saveStatesCarriers);


//Utils
import { encryptEmail, decryptEmail } from "./controllers/cryptUtils.js";
router.post("/email/encrypt/:email", checkNotAuthenticated, encryptEmail);
router.get("/email/decrypt/:encrypted_email", checkNotAuthenticated, decryptEmail);

import { handleFileUpload } from "./controllers/registration.js";
import upload from "./config/multerConfig.js";
router.post("/upload", checkNotAuthenticated, upload.single("file"), handleFileUpload);

import { renderConfigEmails, postAdminToAlert, deleteEmailToAlert, addCarrier, renderConfigCarriers, postCompany, updateCompany, deleteCompany, renderConfigCommisions, updateCommisions } from "./controllers/config.js";
router.get("/users/config", checkNotAuthenticated, checkReadRight, renderConfigEmails)
router.post("/users/config_emails", checkNotAuthenticated, postAdminToAlert);
router.delete("/users/config_emails", checkNotAuthenticated, deleteEmailToAlert);

router.get("/users/config_carriers", checkNotAuthenticated, checkReadRight, renderConfigCarriers);
router.post("/users/config_carriers", checkNotAuthenticated, postCompany);
router.put("/users/config_carriers", checkNotAuthenticated, updateCompany);
router.delete("/users/config_carriers", checkNotAuthenticated, deleteCompany);

router.get("/users/config_commisions", checkNotAuthenticated, checkReadRight, renderConfigCommisions);
router.put("/users/config_commisions", checkNotAuthenticated, updateCommisions);

import { renderConfigAgentRights, addAllowedAgent, deleteAllowedAgent, updateAgentRights } from "./controllers/config.js";
router.get("/users/config_agent_rights", checkNotAuthenticated, checkReadRight, renderConfigAgentRights);
router.post("/users/config/allowed-agents/add", checkNotAuthenticated, checkWriteRight, addAllowedAgent);
router.delete("/users/config/allowed-agents/delete", checkNotAuthenticated, checkWriteRight, deleteAllowedAgent);
router.put("/users/config/agent-rights", checkNotAuthenticated, checkWriteRight, updateAgentRights);

import { massiveCreateAgents } from "./controllers/agents.js";
router.post("/agents/massiveCreate", asyncHandler(massiveCreateAgents));

import { sendSMSHandler } from "./controllers/communication.js";
router.post("/sendSMS", checkNotAuthenticated, sendSMSHandler);


import { renderReports, filterReport, exportData } from "./controllers/reports.js";
router.get("/users/reports", checkNotAuthenticated, renderReports);
router.get("/users/reports/filter", checkNotAuthenticated, filterReport);
router.post("/users/reports/export", checkNotAuthenticated, exportData);

import { renderLeadCenter, addLead, acceptAsAgent, deleteLead } from "./controllers/lead_center.js";
router.get("/users/lead-center", checkNotAuthenticated, checkReadRight, renderLeadCenter);
router.post("/users/lead-center", checkNotAuthenticated, addLead);
router.post("/users/lead-center/accept/:email", checkNotAuthenticated, acceptAsAgent);
router.delete("/users/lead-center/:id", checkNotAuthenticated, deleteLead);

import { renderNewLead, loadLead } from "./controllers/lead_center.js";
router.get("/lead-center/newLead", renderNewLead);
router.get("/lead-center/loadLead/:id", checkNotAuthenticated, loadLead);

import { getCity } from "./config/utils.js"
router.get("/utils/get-city", getCity);

export default router;
