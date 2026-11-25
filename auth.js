




/* =========================================================
   MNM LEGAL ASSOCIATES
   AUTHENTICATION & STAFF AUTHORIZATION
   Version 3.0

   Justice, Integrity & Excellence
   ========================================================= */

import {
    auth,
    db,
    COLLECTIONS,
    ROLES
} from "./firebase-config.js";

import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";

import {
    doc,
    getDocFromServer,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";


/* =========================================================
   APPLICATION CONFIGURATION
   ========================================================= */

const AUTH_CONFIG = Object.freeze({

    loginPage: "/login.html",

    dashboardPage: "/dashboard.html",

    websiteHome: "/",

    firmName: "MNM Legal Associates"

});

const ALLOWED_ROLES = new Set([
    ROLES.ADMIN,
    ROLES.ADVOCATE,
    ROLES.STAFF
]);

let currentStaffProfile = null;


/* =========================================================
   ERROR HANDLING
   ========================================================= */

function getAuthErrorMessage(error) {
console.error("MNM AUTH ERROR:", error?.code, error?.message);
    switch (error?.code) {

        case "auth/invalid-email":
            return "Please enter a valid email address.";

        case "auth/user-disabled":
            return "Your account has been disabled.";

        case "auth/user-not-found":
        case "auth/wrong-password":
        case "auth/invalid-credential":
        case "auth/invalid-login-credentials":
            return "Invalid email address or password.";

        case "auth/too-many-requests":
            return "Too many attempts. Please try again later.";

        case "auth/network-request-failed":
        case "unavailable":
            return "Network connection failed. Please try again.";

        case "auth/operation-not-allowed":
            return "This authentication operation is unavailable.";

        case "auth/unauthorized-domain":
            return "This website is not authorised.";

        case "auth/invalid-api-key":
            return "Authentication configuration error.";

        case "permission-denied":
        case "staff/access-denied":
            return "You are not authorised to access this system.";

        case "staff/inactive":
            return "Your staff account is inactive.";

        case "staff/invalid-role":
            return "Your account has an invalid access role.";

        case "staff/session-changed":
            return "Your session has changed. Please sign in again.";

        default:
            return "Unable to complete the request. Please try again.";

    }

}

function staffError(code) {

    const error = new Error(code);

    error.code = code;

    return error;

}


/* =========================================================
   STAFF PROFILE VALIDATION
   ========================================================= */

function validateStaffProfile(snapshot, user) {

    if (!snapshot.exists()) {

        throw staffError("staff/access-denied");

    }

    const data = snapshot.data();

    if (data.active !== true) {

        throw staffError("staff/inactive");

    }

    if (!ALLOWED_ROLES.has(data.role)) {

        throw staffError("staff/invalid-role");

    }

    return Object.freeze({

        uid: user.uid,

        name: String(
            data.name || user.displayName || "Staff Member"
        ),

        email: user.email || "",

        role: data.role,

        active: true

    });

}


/* =========================================================
   SERVER-SIDE STAFF VERIFICATION
   Cached profiles are not accepted for initial authorization.
   ========================================================= */

async function verifyStaffAccess(user) {

    if (!user?.uid) {

        throw staffError("staff/access-denied");

    }

    const reference = doc(
        db,
        COLLECTIONS.STAFF,
        user.uid
    );

    const snapshot = await getDocFromServer(reference);

    if (auth.currentUser?.uid !== user.uid) {

        throw staffError("staff/session-changed");

    }

    const profile = validateStaffProfile(snapshot, user);

    currentStaffProfile = profile;

    return profile;

}


/* =========================================================
   STAFF LOGIN
   ========================================================= */

async function loginUser(
    email,
    password,
    rememberMe = false
) {

    const cleanEmail = String(email || "").trim();

    if (!cleanEmail || !password) {

        return {
            success: false,
            message: "Please enter your email and password."
        };

    }

    let signedInUser = null;

    try {

        await setPersistence(
            auth,
            rememberMe
                ? browserLocalPersistence
                : browserSessionPersistence
        );

        const credential =
            await signInWithEmailAndPassword(
                auth,
                cleanEmail,
                password
            );

        signedInUser = credential.user;

        const staff = await verifyStaffAccess(
            signedInUser
        );

        return {

            success: true,

            user: signedInUser,

            staff,

            message: "Login successful."

        };

    } catch (error) {

        currentStaffProfile = null;

        if (
            signedInUser &&
            auth.currentUser?.uid === signedInUser.uid
        ) {

            try {

                await signOut(auth);

            } catch {

                // Protected pages will independently
                // verify authorization before access.

            }

        }

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

        currentStaffProfile = null;

        try {

            localStorage.removeItem("loggedIn");

            sessionStorage.removeItem("loggedIn");

        } catch {

            // Storage may be unavailable.

        }

        window.location.replace(
            AUTH_CONFIG.loginPage
        );

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

            message: "Please enter your registered email."

        };

    }

    const genericMessage =
        "If an eligible account exists, " +
        "a password reset email will be sent.";

    try {

        await sendPasswordResetEmail(
            auth,
            cleanEmail
        );

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
   AUTHORIZED SESSION OBSERVER
   ========================================================= */

function watchAuthState(callback, onError) {

    let revision = 0;

    let stopped = false;

    const unsubscribe = onAuthStateChanged(

        auth,

        async user => {

            const attempt = ++revision;

            currentStaffProfile = null;

            if (!user) {

                callback?.(null);

                return;

            }

            try {

                const profile =
                    await verifyStaffAccess(user);

                if (
                    stopped ||
                    attempt !== revision ||
                    auth.currentUser?.uid !== user.uid
                ) return;

                callback?.(user, profile);

            } catch (error) {

                if (
                    stopped ||
                    attempt !== revision
                ) return;

                currentStaffProfile = null;

                onError?.(error);

                if (
                    auth.currentUser?.uid === user.uid
                ) {

                    try {

                        await signOut(auth);

                    } catch {

                        callback?.(null);

                    }

                }

            }

        },

        error => {

            currentStaffProfile = null;

            onError?.(error);

            callback?.(null);

        }

    );

    return () => {

        stopped = true;

        revision++;

        unsubscribe();

    };

}


/* =========================================================
   GET CURRENT AUTHORIZED USER
   ========================================================= */

async function getCurrentUser() {

    await auth.authStateReady();

    const user = auth.currentUser;

    if (!user) return null;

    try {

        await verifyStaffAccess(user);

        return user;

    } catch {

        currentStaffProfile = null;

        return null;

    }

}


/* =========================================================
   PROTECTED PAGE AUTHORIZATION
   ========================================================= */

function protectPage(options = {}) {

    const {

        contentSelector = "#protectedContent",

        loadingSelector = "#authLoading",

        onAuthenticated = null,

        allowedRoles = [
            ROLES.ADMIN,
            ROLES.ADVOCATE,
            ROLES.STAFF
        ]

    } = options;

    const content =
        document.querySelector(contentSelector);

    const loading =
        document.querySelector(loadingSelector);

    let unsubscribeStaff = null;

    let stopped = false;

    let generation = 0;

    function hideContent() {

        if (content) {

            content.hidden = true;

        }

        if (loading) {

            loading.hidden = false;

        }

    }

    function showContent() {

        if (loading) {

            loading.hidden = true;

        }

        if (content) {

            content.hidden = false;

        }

    }

    function stopStaffListener() {

        if (unsubscribeStaff) {

            unsubscribeStaff();

            unsubscribeStaff = null;

        }

    }

    async function denyAccess(user) {

        if (stopped) return;

        generation++;

        hideContent();

        stopStaffListener();

        currentStaffProfile = null;

        try {

            if (
                user &&
                auth.currentUser?.uid === user.uid
            ) {

                await signOut(auth);

            }

        } catch {

            // Interface remains hidden.

        }

        window.location.replace(
            AUTH_CONFIG.loginPage
        );

    }

    function showTechnicalError(error) {
        hideContent();
        stopStaffListener();
        console.error("MNM protected page error:", error);
        if (!loading) return;
        const panel = document.createElement("div");
        panel.setAttribute("role", "alert");
        const message = document.createElement("p");
        message.textContent = "Module unavailable: " + (error?.code || error?.message || "Unknown error");
        const retry = document.createElement("button");
        retry.textContent = "Retry";
        retry.onclick = () => window.location.reload();
        const back = document.createElement("a");
        back.href = AUTH_CONFIG.dashboardPage;
        back.textContent = " Return to Dashboard";
        panel.append(message, retry, back);
        loading.replaceChildren(panel);
    }

    function handleFailure(error, user) {
        const denied = ["staff/access-denied", "staff/inactive", "staff/invalid-role", "staff/session-changed", "auth/user-disabled", "auth/user-token-expired", "auth/invalid-user-token"];
        if (!user || auth.currentUser?.uid !== user.uid || denied.includes(error?.code)) {
            return denyAccess(user);
        }
        showTechnicalError(error);
    }

    hideContent();

    const unsubscribeAuth = onAuthStateChanged(

        auth,

        async user => {

            const attempt = ++generation;

            stopStaffListener();

            hideContent();

            currentStaffProfile = null;

            if (!user) {

                window.location.replace(
                    AUTH_CONFIG.loginPage
                );

                return;

            }

            try {

                const profile =
                    await verifyStaffAccess(user);

                if (
                    stopped ||
                    attempt !== generation
                ) return;

                if (
                    !allowedRoles.includes(profile.role)
                ) {

                    throw staffError(
                        "staff/access-denied"
                    );

                }

                if (
                    typeof onAuthenticated === "function"
                ) {

                    await onAuthenticated(user, profile);

                }

                if (
                    stopped ||
                    attempt !== generation ||
                    auth.currentUser?.uid !== user.uid
                ) return;

                showContent();

                const reference = doc(
                    db,
                    COLLECTIONS.STAFF,
                    user.uid
                );

                /*
                 * Monitor staff status while the
                 * protected page remains open.
                 */

                unsubscribeStaff = onSnapshot(

                    reference,

                    { includeMetadataChanges: true },

                    snapshot => {

                        if (
                            stopped ||
                            attempt !== generation
                        ) return;

                        if (
                            snapshot.metadata.fromCache ||
                            snapshot.metadata.hasPendingWrites
                        ) {

                            hideContent();

                            return;

                        }

                        try {

                            const updatedProfile =
                                validateStaffProfile(
                                    snapshot,
                                    user
                                );

                            if (
                                !allowedRoles.includes(
                                    updatedProfile.role
                                )
                            ) {

                                throw staffError(
                                    "staff/access-denied"
                                );

                            }

                            currentStaffProfile =
                                updatedProfile;

                            showContent();

                        } catch (error) {

                            void handleFailure(error, user);

                        }

                    },

                    error => {

                        void handleFailure(error, user);

                    }

                );

            } catch (error) {

                if (
                    !stopped &&
                    attempt === generation
                ) {

                    await handleFailure(error, user);

                }

            }

        },

        error => {

            void handleFailure(error, auth.currentUser);

        }

    );

    return () => {

        stopped = true;

        generation++;

        stopStaffListener();

        unsubscribeAuth();

        hideContent();

    };

}


/* =========================================================
   LOGIN PAGE SESSION CHECK
   ========================================================= */

function redirectIfAuthenticated() {

    return watchAuthState(user => {

        if (user) {

            window.location.replace(
                AUTH_CONFIG.dashboardPage
            );

        }

    });

}


/* =========================================================
   STAFF PROFILE UTILITIES
   ========================================================= */

function getStaffProfile() {

    if (
        currentStaffProfile?.uid !==
        auth.currentUser?.uid
    ) {

        return null;

    }

    return currentStaffProfile;

}

function getUserDisplayName(user) {

    if (
        user &&
        currentStaffProfile?.uid === user.uid
    ) {

        return currentStaffProfile.name;

    }

    if (user?.displayName) {

        return user.displayName;

    }

    if (user?.email) {

        return user.email.split("@")[0];

    }

    return "Staff Member";

}

function hasRole(role) {

    return getStaffProfile()?.role === role;

}

function isAdmin() {

    return hasRole(ROLES.ADMIN);

}


/* =========================================================
   SESSION INFORMATION
   ========================================================= */

async function getSessionInfo() {

    const user = await getCurrentUser();

    const staff = getStaffProfile();

    if (!user || !staff) {

        return {

            authenticated: false,

            authorized: false,

            user: null

        };

    }

    return {

        authenticated: true,

        authorized: true,

        uid: user.uid,

        email: user.email,

        displayName: staff.name,

        role: staff.role,

        active: staff.active,

        emailVerified: user.emailVerified,

        lastSignInTime:
            user.metadata.lastSignInTime

    };

}


/* =========================================================
   MODULE EXPORTS
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

    getAuthErrorMessage,

    verifyStaffAccess,

    getStaffProfile,

    hasRole,

    isAdmin

};


/* =========================================================
   END OF AUTHENTICATION MODULE
   MNM LEGAL ASSOCIATES
   Justice, Integrity & Excellence
   ========================================================= */

