/* =========================================================
   MNM LEGAL ASSOCIATES
   Firebase Configuration
   Justice, Integrity & Excellence
   ========================================================= */

import { initializeApp, getApp, getApps }
from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";

import { getAuth }
from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";


/* =========================================================
   FIREBASE WEB APP CONFIGURATION
   ========================================================= */

const firebaseConfig = {

    apiKey: "PASTE_YOUR_FIREBASE_API_KEY_HERE",

    authDomain: "mnm-legal-associates.firebaseapp.com",

    projectId: "mnm-legal-associates",

    storageBucket: "mnm-legal-associates.firebasestorage.app",

    messagingSenderId: "14199102894",

    appId: "1:14199102894:web:1d09624f3b2c88d281fc3f"

};


/* =========================================================
   INITIALIZE FIREBASE
   ========================================================= */

const app = getApps().length
    ? getApp()
    : initializeApp(firebaseConfig);


/* =========================================================
   INITIALIZE AUTHENTICATION
   ========================================================= */

const auth = getAuth(app);

auth.languageCode = "en";


/* =========================================================
   EXPORT FIREBASE SERVICES
   ========================================================= */

export { app, auth };
