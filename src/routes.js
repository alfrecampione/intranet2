import express from "express";
import { login, renderResetPassword, resetPassword, logout, checkAuthenticated, checkNotAuthenticated} from "./controllers/auth.js"
import { redirect_dashboard, dashboard, dashboardLastQuarter, dashboardWeekReports, totalSalesStatistics, nbSalesStatistics, rnSalesStatistics, rwSalesStatistics, cnSalesStatistics } from "./controllers/dash-reports.js"
import { agency } from "./controllers/agency-reports.js";
import { headcarrier, addHeadCarrier, head_carrier_list, addCarrier, deleteCarrier } from "./controllers/config.js";
import { dataSearch } from "./controllers/search.js";
import { passwordMail } from "./controllers/mailer.js";
import passport from "passport";
import { authenticate} from "./config/passportConfig.js";
import {register} from "./controllers/registration.js"

const router = express.Router();

/**HTML REQUEST */

router.get('/login', checkAuthenticated, login);
router.post('/login', authenticate(passport));
router.post('/users/auth/send/:email', passwordMail);
router.get('/users/auth/reset-password/:email', renderResetPassword);
router.post('/users/auth/reset-password/:email', resetPassword);
router.get('/users/logout', logout);
router.get('/', checkNotAuthenticated, redirect_dashboard);
router.get('/users/dashboard', checkNotAuthenticated, dashboard);
router.post('/users/dashboard/lastQuarter', checkNotAuthenticated, dashboardLastQuarter);
router.post('/users/dashboard/weekReports', checkNotAuthenticated, dashboardWeekReports);
router.post('/users/dashboard/totalSalesStatistics', checkNotAuthenticated, totalSalesStatistics);
router.post('/users/dashboard/nbSalesStatistics', checkNotAuthenticated, nbSalesStatistics);
router.post('/users/dashboard/rnSalesStatistics', checkNotAuthenticated, rnSalesStatistics);
router.post('/users/dashboard/rwSalesStatistics', checkNotAuthenticated, rwSalesStatistics);
router.post('/users/dashboard/cnSalesStatistics', checkNotAuthenticated, cnSalesStatistics);
router.get('/users/agency', checkNotAuthenticated, agency);
router.get('/users/config/headcarriers', checkNotAuthenticated, headcarrier);
router.post('/users/config/headcarrier/addHeadCarrier', checkNotAuthenticated, addHeadCarrier);
router.post('/users/config/headcarrier/list', checkNotAuthenticated, head_carrier_list);
router.post('/users/config/headcarrier/addCarrier', checkNotAuthenticated, addCarrier);
router.post('/users/config/headcarrier/deleteCarrier', checkNotAuthenticated, deleteCarrier);
router.post('/users/search', checkNotAuthenticated, dataSearch)

router.get('/users/registration',checkNotAuthenticated,register)

// STEPS ROUTES
import {
  createPersonalInfo, getPersonalInfoById,  
  createContactInfo, getContactInfoById,  
  createEmergencyContacts, getEmergencyContactById,  
  createTaxInfo, getTaxInfoById,  
  createPaymentMethods, getPaymentMethodById,  
  createDocuments, getDocumentsById, 
} from "./controllers/steps.js";

// Step 1: Personal Info
router.post('/steps/personal-info', checkNotAuthenticated, createPersonalInfo);
router.get('/steps/personal-info/:id', checkNotAuthenticated, getPersonalInfoById);

// Step 2: Contact Info
router.post('/steps/contact-info', checkNotAuthenticated, createContactInfo);
router.get('/steps/contact-info/:id', checkNotAuthenticated, getContactInfoById);

// Step 3: Emergency Contact
router.post('/steps/emergency-contact', checkNotAuthenticated, createEmergencyContacts);
router.get('/steps/emergency-contact/:id', checkNotAuthenticated, getEmergencyContactById);

// Step 4: Tax Info
router.post('/steps/tax-info', checkNotAuthenticated, createTaxInfo);
router.get('/steps/tax-info/:id', checkNotAuthenticated, getTaxInfoById);

// Step 5: Payment Method
router.post('/steps/payment-method', checkNotAuthenticated, createPaymentMethods);
router.get('/steps/payment-method/:id', checkNotAuthenticated, getPaymentMethodById);

// Step 6: Documents
router.post('/steps/documents', checkNotAuthenticated, createDocuments);
router.get('/steps/documents/:id', checkNotAuthenticated, getDocumentsById);

export default router;