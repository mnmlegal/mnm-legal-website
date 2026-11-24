
/* =========================================================
   MNM LEGAL ASSOCIATES
   CENTRAL FIREBASE CONFIGURATION
   Version 2.0

   Justice, Integrity & Excellence
   ========================================================= */

import {
    initializeApp,
    getApp,
    getApps
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";

import {
    getAuth
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";

import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";


/* =========================================================
   FIREBASE PROJECT CONFIGURATION
   ========================================================= */

const firebaseConfig = {

    apiKey: "PASTE_YOUR_EXISTING_FIREBASE_API_KEY_HERE",

    authDomain: "mnm-legal-associates.firebaseapp.com",

    projectId: "mnm-legal-associates",

    storageBucket: "mnm-legal-associates.firebasestorage.app",

    messagingSenderId: "14199102894",

    appId: "1:14199102894:web:1d09624f3b2c88d281fc3f"

};


/* =========================================================
   INITIALIZE FIREBASE APPLICATION
   ========================================================= */

const app = getApps().length
    ? getApp()
    : initializeApp(firebaseConfig);


/* =========================================================
   FIREBASE AUTHENTICATION
   ========================================================= */

const auth = getAuth(app);

auth.languageCode = "en";


/* =========================================================
   CLOUD FIRESTORE DATABASE
   ========================================================= */

const db = getFirestore(app);


/* =========================================================
   DATABASE COLLECTION REFERENCES
   ========================================================= */

const COLLECTIONS = Object.freeze({

    STAFF: "staff",

    CLIENTS: "clients",

    CASES: "cases",

    INVOICES: "invoices",

    PAYMENTS: "payments",

    HEARINGS: "hearings",

    DOCUMENTS: "documents",

    SETTINGS: "settings",

    AUDIT_LOGS: "auditLogs"

});


/* =========================================================
   STAFF ACCESS ROLES
   ========================================================= */

const ROLES = Object.freeze({

    ADMIN: "admin",

    ADVOCATE: "advocate",

    STAFF: "staff"

});


/* =========================================================
   EXPORT FIREBASE SERVICES
   ========================================================= */

export {

    app,

    auth,

    db,

    COLLECTIONS,

    ROLES

};


/* =========================================================
   END OF CONFIGURATION
   MNM LEGAL ASSOCIATES
   ========================================================= */
