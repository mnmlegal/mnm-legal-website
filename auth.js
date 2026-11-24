
/* =========================================================
   MNM LEGAL ASSOCIATES
   Authentication & Session Management
   Justice, Integrity & Excellence
   ========================================================= */

import { auth } from "./firebase-config.js";

import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";


/* =========================================================
   APPLICATION CONFIGURATION
   ========================================================= */

const AUTH_CONFIG = Object.freeze({

    loginPage: "/login.html",

    dashboardPage: "/dashboard.html",

    websiteHome: "/",

    firmName: "MNM Legal Associates"

});


/* =========================================================
   AUTHENTICATION ERROR HANDLING
   ========================================================= */

function getAuthErrorMessage(error) {

    switch (error?.code) {

        case "auth/invalid-email":
            return "Please enter a valid email address.";

        case "auth/user-disabled":
            return "This account has been disabled. Please contact the administrator.";

        case "auth/user-not-found":
        case "auth/wrong-password":
        case "auth/invalid-credential":
        case "auth/invalid-login-credentials":
            return "Invalid email address or password.";

        case "auth/too-many-requests":
            return "Too many attempts. Please try again later.";

        case "auth/network-request-failed":
            return "Network connection failed. Please check your internet connection.";

        case "auth/operation-not-allowed":
            return "This authentication operation is currently unavailable.";

        case "auth/unauthorized-domain":
            return "This website is not authorised for authentication.";

        case "auth/invalid-api-key":
            return "Authentication configuration error. Please contact the administrator.";

        default:
            return "Unable to complete the request. Please try again.";

    }

}


/* =========================================================
   STAFF LOGIN
   ========================================================= */

async function loginUser(email, password, rememberMe = false) {

    const cleanEmail = String(email || "").trim();

    if (!cleanEmail || !password) {

        return {
            success: false,
            message: "Please enter your email address and password."
        };

    }

    try {

        await setPersistence(
            auth,
            rememberMe
                ? browserLocalPersistence
                : browserSessionPersistence
        );

        const credential = await signInWithEmailAndPassword(
            auth,
            cleanEmail,
            password
        );

        return {

            success: true,

            user: credential.user,

            message: "Login successful."

        };

    } catch (error) {

        return {

            success: false,

            message: getAuthErrorMessage(error)

        };

    }

}


/* =========================================================
   STAFF LOGOUT
   ========================================================= */

async function logoutUser() {

    try {

        await signOut(auth);

        // Remove obsolete authentication flags only.
        // Existing invoice records must remain untouched.

        try {

            localStorage.removeItem("loggedIn");
            sessionStorage.removeItem("loggedIn");

        } catch {

            // Storage may be unavailable.

        }

        window.location.replace(AUTH_CONFIG.loginPage);

        return { success: true };

    } catch (error) {

        return {

            success: false,

            message: getAuthErrorMessage(error)

        };

    }

}


/* =========================================================
   PASSWORD RESET
   ========================================================= */

async function resetPassword(email) {

    const cleanEmail = String(email || "").trim();

    if (!cleanEmail) {

        return {

            success: false,

            message: "Please enter your registered email address."

        };

    }

    const genericMessage =
        "If an eligible account exists, a password reset email will be sent.";

    try {

        await sendPasswordResetEmail(auth, cleanEmail);

        return {

            success: true,

            message: genericMessage

        };

    } catch (error) {

        if (error?.code === "auth/user-not-found") {

            return {

                success: true,

                message: genericMessage

            };

        }

        return {

            success: false,

            message: getAuthErrorMessage(error)

        };

    }

}


/* =========================================================
   AUTHENTICATION STATE OBSERVER
   ========================================================= */

function watchAuthState(callback, onError) {

    return onAuthStateChanged(

        auth,

        (user) => {

            if (typeof callback === "function") {

                callback(user);

            }

        },

        (error) => {

            if (typeof onError === "function") {

                onError(error);

            }

        }

    );

}


/* =========================================================
   GET CURRENT AUTHENTICATED USER
   ========================================================= */

async function getCurrentUser() {

    await auth.authStateReady();

    return auth.currentUser;

}


/* =========================================================
   PROTECTED PAGE — CLIENT-SIDE ACCESS CHECK
   ========================================================= */

function protectPage(options = {}) {

    const {

        contentSelector = "#protectedContent",

        loadingSelector = "#authLoading",

        onAuthenticated = null

    } = options;


    const content = document.querySelector(contentSelector);

    const loading = document.querySelector(loadingSelector);


    // Keep protected interface hidden during verification.

    if (content) {

        content.hidden = true;

    }

    if (loading) {

        loading.hidden = false;

    }


    return onAuthStateChanged(

        auth,

        (user) => {

            if (!user) {

                if (content) {

                    content.hidden = true;

                }

                window.location.replace(AUTH_CONFIG.loginPage);

                return;

            }


            if (loading) {

                loading.hidden = true;

            }

            if (content) {

                content.hidden = false;

            }


            if (typeof onAuthenticated === "function") {

                onAuthenticated(user);

            }

        },

        () => {

            if (content) {

                content.hidden = true;

            }

            window.location.replace(AUTH_CONFIG.loginPage);

        }

    );

}


/* =========================================================
   LOGIN PAGE SESSION CHECK
   ========================================================= */

function redirectIfAuthenticated() {

    return onAuthStateChanged(

        auth,

        (user) => {

            if (user) {

                window.location.replace(
                    AUTH_CONFIG.dashboardPage
                );

            }

        }

    );

}


/* =========================================================
   USER DISPLAY INFORMATION
   ========================================================= */

function getUserDisplayName(user) {

    if (!user) {

        return "Staff Member";

    }

    if (user.displayName) {

        return user.displayName;

    }

    if (user.email) {

        return user.email.split("@")[0];

    }

    return "Staff Member";

}


/* =========================================================
   SESSION INFORMATION
   ========================================================= */

async function getSessionInfo() {

    const user = await getCurrentUser();

    if (!user) {

        return {

            authenticated: false,

            user: null

        };

    }

    return {

        authenticated: true,

        uid: user.uid,

        email: user.email,

        displayName: getUserDisplayName(user),

        emailVerified: user.emailVerified,

        lastSignInTime: user.metadata.lastSignInTime

    };

}


/* =========================================================
   AUTHENTICATION MODULE EXPORTS
   ========================================================= */

export {

    AUTH_CONFIG,

    loginUser,

    logoutUser,

    resetPassword,

    watchAuthState,

    getCurrentUser,

    protectPage,

    redirectIfAuthenticated,

    getUserDisplayName,

    getSessionInfo,

    getAuthErrorMessage

};


/* =========================================================
   END OF AUTHENTICATION MODULE
   MNM LEGAL ASSOCIATES
   ========================================================= */
