



/* =========================================================
   MNM LEGAL ASSOCIATES
   DOCUMENT MANAGEMENT CLOUD ENGINE
   Version 3.1.0

   Justice, Integrity & Excellence
   ========================================================= */

import {
    auth,
    db
} from "./firebase-config.js";

import {
    verifyStaffAccess
} from "./auth.js";

import {
    DRIVE_CONFIG,
    DOCUMENT_CATEGORIES,
    ALLOWED_FILE_TYPES,
    validateDriveConfiguration,
    validateDocumentFile,
    formatDocumentCode,
    sanitizeFileName,
    getIndianDate,
    getRegistrationYear,
    getDriveFileUrl
} from "./drive-config.js";

import {
    collection,
    doc,
    getDocFromServer,
    getDocsFromServer,
    query,
    where,
    runTransaction,
    serverTimestamp,
    deleteField
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";


/* =========================================================
   1. CONFIGURATION
   ========================================================= */

export const DMS_CONFIG = Object.freeze({

    version: "3.1.0",

    documentStatuses: Object.freeze({
        active: "Active",
        archived: "Archived"
    }),

    activityTypes: Object.freeze({
        registration: "Document Registered",
        metadata_update: "Metadata Updated",
        version_added: "New Version Added",
        archive: "Document Archived",
        reactivate: "Document Restored",
        note: "Note Added"
    }),

    maxTitleLength: 500,

    maxDescriptionLength: 10000,

    maxVersionNotesLength: 5000,

    maxArchiveReasonLength: 2000

});

const C = DRIVE_CONFIG.collections;

const DRIVE_FIELDS =
    "id,name,mimeType,size,parents,trashed," +
    "webViewLink,ownedByMe,shared," +
    "capabilities(canAddChildren,canDownload)";

let googleSession = null;

let authorizedRootId = null;

let identityPromise = null;

let pickerPromise = null;

let authorizationPending = false;

let pickerPending = false;

let sessionGeneration = 0;

let observedUid = null;
let rootPending = null;
const ROOT_MARKER = "mnm-dms-root-v2";


/* =========================================================
   2. ERROR HANDLING
   ========================================================= */

function dmsError(code, message, details = {}) {

    const error = new Error(message);

    error.code = code;

    error.details = details;

    return error;

}


export function getDocumentErrorMessage(error) {

    switch (error?.code) {

        case "permission-denied":

            return "Access denied. Check Firestore rules.";

        case "unavailable":

            return "Cloud service unavailable. Please retry.";

        case "dms/session-changed":

            return "Your login session has changed.";

        case "dms/google-required":

            return "Connect your authorized Google Drive account.";

        case "dms/root-required":

            return "Authorize the designated root folder first.";

        case "dms/revision-conflict":

            return "This record has changed. Refresh before retrying.";

        case "dms/registration-pending":

            return "File uploaded, but document registration could not be confirmed. Retain the recovery details.";

        default:

            return error?.message ||
                "Unable to complete the document operation.";

    }

}


/* =========================================================
   3. STAFF AUTHORIZATION
   ========================================================= */

function clearGoogleSession() {

    sessionGeneration++;

    googleSession = null;

    authorizedRootId = null;

}


auth.onAuthStateChanged(user => {

    const uid = user?.uid || null;

    if (uid !== observedUid) {

        observedUid = uid;

        clearGoogleSession();

    }

});


function assertSession(uid) {

    if (!uid || auth.currentUser?.uid !== uid) {

        clearGoogleSession();

        throw dmsError(
            "dms/session-changed",
            "Your login session has changed."
        );

    }

}


async function requireAdministrator() {

    await auth.authStateReady();

    const user = auth.currentUser;

    if (!user?.uid) {

        throw dmsError(
            "dms/access-denied",
            "Administrator authentication is required."
        );

    }

    const profile = await verifyStaffAccess(user);

    assertSession(user.uid);

    if (
        profile.active !== true ||
        profile.role !== "admin" ||
        profile.uid !== user.uid
    ) {

        clearGoogleSession();

        throw dmsError(
            "dms/access-denied",
            "Administrator access is required."
        );

    }

    return profile;

}


/* =========================================================
   4. COMMON VALIDATION
   ========================================================= */

function cleanText(value, maxLength, required = false) {

    const result = String(value ?? "").trim();

    if (required && !result) {

        throw new Error("A required field is missing.");

    }

    if (result.length > maxLength) {

        throw new Error(
            `Maximum permitted length is ${maxLength} characters.`
        );

    }

    return result;

}


function validateId(value) {

    const id = String(value || "");

    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {

        throw new Error("Invalid record ID.");

    }

    return id;

}


function cleanDate(value) {

    const date = String(value || "");

    if (!date) return "";

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {

        throw new Error("Invalid document date.");

    }

    const parsed = new Date(date + "T00:00:00Z");

    if (
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== date
    ) {

        throw new Error("Invalid calendar date.");

    }

    return date;

}


function ensureRevision(record, expectedRevision) {

    if (
        !Number.isSafeInteger(expectedRevision) ||
        record.revision !== expectedRevision
    ) {

        throw dmsError(
            "dms/revision-conflict",
            "Document changed. Refresh and retry."
        );

    }

}


function ensureActive(record) {

    if (record.status !== "active") {

        throw new Error(
            "Restore the archived document before modifying it."
        );

    }

}


function requireExisting(snapshot) {

    if (!snapshot.exists()) {

        throw new Error("The requested record does not exist.");

    }

    return snapshot.data();

}


export function generateDocumentId() {

    return doc(collection(db, C.documents)).id;

}


function documentReference(id) {

    return doc(db, C.documents, validateId(id));

}


function versionReference(id, version) {

    if (!Number.isSafeInteger(version) || version < 1) {

        throw new Error("Invalid version number.");

    }

    return doc(
        documentReference(id),
        C.versions,
        String(version)
    );

}


function activityReference(id) {

    return doc(
        collection(documentReference(id), C.activities)
    );

}


function activityData(id, type, description, uid) {

    if (!Object.hasOwn(DMS_CONFIG.activityTypes, type)) {

        throw new Error("Invalid document activity type.");

    }

    return {

        documentId: id,

        type,

        description: cleanText(description, 10000, true),

        createdAt: serverTimestamp(),

        createdBy: uid

    };

}


/* =========================================================
   5. GOOGLE SCRIPT LOADER
   ========================================================= */

function loadScript(url, ready) {

    if (ready()) return Promise.resolve();

    return new Promise((resolve, reject) => {

        const script = document.createElement("script");

        script.src = url;

        script.async = true;

        const timeout = setTimeout(() => {

            script.remove();

            reject(new Error(
                "Google service loading timed out."
            ));

        }, 30000);

        script.onload = () => {

            clearTimeout(timeout);

            if (ready()) {

                resolve();

            } else {

                reject(new Error(
                    "Google service initialization failed."
                ));

            }

        };

        script.onerror = () => {

            clearTimeout(timeout);

            script.remove();

            reject(new Error(
                "Unable to load Google services."
            ));

        };

        document.head.appendChild(script);

    });

}


async function loadGoogleIdentity() {

    if (!identityPromise) {

        identityPromise = loadScript(

            DRIVE_CONFIG.identityScriptUrl,

            () => Boolean(
                window.google?.accounts?.oauth2
            )

        ).catch(error => {

            identityPromise = null;

            throw error;

        });

    }

    return identityPromise;

}


async function loadGooglePicker() {

    if (!pickerPromise) {

        pickerPromise = (async () => {

            await loadScript(

                DRIVE_CONFIG.pickerScriptUrl,

                () => Boolean(window.gapi?.load)

            );

            await new Promise((resolve, reject) => {

                window.gapi.load("picker", {

                    callback: resolve,

                    onerror: () => reject(
                        new Error("Google Picker failed to load.")
                    ),

                    timeout: 30000,

                    ontimeout: () => reject(
                        new Error("Google Picker loading timed out.")
                    )

                });

            });

        })().catch(error => {

            pickerPromise = null;

            throw error;

        });

    }

    return pickerPromise;

}


export async function initialiseGoogleDrive() {

    await requireAdministrator();

    const validation = validateDriveConfiguration();

    const errors = validation.errors.filter(message => message !== "Google Picker API Key is not configured.");
    if (errors.length) throw new Error(errors.join(" "));

    await loadGoogleIdentity();

    return true;

}


/* =========================================================
   6. GOOGLE OAUTH CONNECTION
   ========================================================= */

function revokeToken(token) {

    if (!token) return;

    try {

        window.google?.accounts?.oauth2?.revoke(
            token,
            () => {}
        );

    } catch {

        // Local session is cleared independently.

    }

}


export function isGoogleDriveConnected() {

    return Boolean(

        googleSession &&

        googleSession.uid === auth.currentUser?.uid &&

        googleSession.expiresAt > Date.now() + 30000

    );

}


function requireGoogleSession() {

    if (!isGoogleDriveConnected()) {

        clearGoogleSession();

        throw dmsError(

            "dms/google-required",

            "Connect or reconnect Google Drive."

        );

    }

    return googleSession;

}


export async function connectGoogleDrive({ automatic = false } = {}) {

    if (authorizationPending) {

        throw new Error(
            "Google authorization is already in progress."
        );

    }

    authorizationPending = true;

    try {

        const admin = await requireAdministrator();

        await initialiseGoogleDrive();

        clearGoogleSession();

        const generation = sessionGeneration;

        const response = await new Promise(
            (resolve, reject) => {

                let settled = false;

                const finish = (error, result) => {

                    if (settled) return;

                    settled = true;

                    clearTimeout(timeout);

                    error ? reject(error) : resolve(result);

                };

                const timeout = setTimeout(() => {

                    finish(new Error(
                        "Google authorization timed out."
                    ));

                }, automatic ? 15000 : 120000);

                const tokenClient =
                    google.accounts.oauth2.initTokenClient({

                        client_id: DRIVE_CONFIG.clientId,

                        scope: DRIVE_CONFIG.scope,

                        include_granted_scopes: false,

                        hint: DRIVE_CONFIG.authorizedEmail,

                        callback: result => {

                            if (settled) {

                                revokeToken(result?.access_token);

                                return;

                            }

                            if (result.error) {

                                finish(new Error(
                                    "Google authorization was declined."
                                ));

                                return;

                            }

                            finish(null, result);

                        },

                        error_callback: () => {

                            finish(new Error(
                                "Google authorization window was closed or blocked."
                            ));

                        }

                    });

                try {

                    tokenClient.requestAccessToken({

                        prompt: automatic ? "none" : ""

                    });

                } catch (error) {

                    finish(error);

                }

            }
        );

        try {

            assertSession(admin.uid);

            if (generation !== sessionGeneration) {

                throw new Error(
                    "Google connection request was cancelled."
                );

            }

            if (!response.access_token) {

                throw new Error(
                    "Google did not provide an access token."
                );

            }

            if (!google.accounts.oauth2.hasGrantedAllScopes(
                response,
                DRIVE_CONFIG.scope
            )) {

                throw new Error(
                    "Required Google Drive permission was not granted."
                );

            }

            const expiresIn = Number(response.expires_in);

            if (!Number.isFinite(expiresIn) || expiresIn <= 0) {

                throw new Error("Invalid Google token lifetime.");

            }

            googleSession = {

                uid: admin.uid,

                token: response.access_token,

                expiresAt: Date.now() + expiresIn * 1000,

                email: ""

            };

            const about = await driveRequest(

                "/about?fields=user(emailAddress,displayName)"

            );

            const email = String(
                about.user?.emailAddress || ""
            ).toLowerCase();

            if (
                email !==
                DRIVE_CONFIG.authorizedEmail.toLowerCase()
            ) {

                throw new Error(
                    "Please connect the authorized firm Google account."
                );

            }

            await requireAdministrator();

            assertSession(admin.uid);

            if (generation !== sessionGeneration) {

                throw new Error("Google session was cancelled.");

            }

            googleSession.email = email;

            try { await checkRootFolderAccess(); } catch (error) {
                if (!isGoogleDriveConnected()) throw error;
            }
            return getGoogleDriveConnection();

        } catch (error) {

            revokeToken(response.access_token);

            clearGoogleSession();

            throw error;

        }

    } finally {

        authorizationPending = false;

    }

}


export function disconnectGoogleDrive() {

    const token = googleSession?.token;

    clearGoogleSession();

    revokeToken(token);

    return true;

}


export function getGoogleDriveConnection() {

    return {

        connected: isGoogleDriveConnected(),

        email: isGoogleDriveConnected()
            ? googleSession.email
            : "",

        expiresAt: isGoogleDriveConnected()
            ? googleSession.expiresAt
            : null,

        rootAuthorized: Boolean(

            isGoogleDriveConnected() &&

            authorizedRootId !== null

        )

    };

}


/* =========================================================
   7. GOOGLE DRIVE REQUEST ENGINE
   ========================================================= */

async function driveRequest(
    path,
    options = {},
    upload = false,
    binary = false
) {

    const admin = await requireAdministrator();

    const session = requireGoogleSession();

    const generation = sessionGeneration;

    const base = upload

        ? DRIVE_CONFIG.uploadApiUrl

        : DRIVE_CONFIG.driveApiUrl;

    const headers = new Headers(options.headers || {});

    headers.set(
        "Authorization",
        `Bearer ${session.token}`
    );

    const response = await fetch(base + path, {

        ...options,

        signal: options.signal || AbortSignal.timeout(upload ? 180000 : 30000),

        headers,

        cache: "no-store",

        credentials: "omit",

        redirect: "error",

        referrerPolicy: "no-referrer"

    });

    assertSession(admin.uid);

    if (generation !== sessionGeneration) {

        throw new Error("Google Drive session changed.");

    }

    if (response.status === 401) {

        clearGoogleSession();

        throw dmsError(
            "dms/google-required",
            "Google authorization expired. Reconnect Drive."
        );

    }

    if (!response.ok) {

        const data = await response.json().catch(() => ({}));

        throw dmsError(

            "dms/drive-error",

            data.error?.message ||
                `Google Drive request failed (${response.status}).`,

            { httpStatus: response.status }

        );

    }

    const result = binary

        ? await response.blob()

        : response.status === 204

            ? null

            : await response.json();

    assertSession(admin.uid);

    if (generation !== sessionGeneration) {

        throw new Error("Google Drive session changed.");

    }

    return result;

}


async function getDriveFile(fileId) {

    return driveRequest(

        `/files/${encodeURIComponent(validateId(fileId))}` +

        `?fields=${encodeURIComponent(DRIVE_FIELDS)}`

    );

}


/* =========================================================
   8. GOOGLE PICKER
   ========================================================= */

async function openGooglePicker(folderOnly = false) {

    if (pickerPending) {

        throw new Error("Google Picker is already open.");

    }

    pickerPending = true;

    try {

        const admin = await requireAdministrator();

        const session = requireGoogleSession();

        const generation = sessionGeneration;

        if (!DRIVE_CONFIG.apiKey || !DRIVE_CONFIG.apiKey.startsWith("AIza")) throw new Error("Google Picker API key is not configured.");
        await loadGooglePicker();

        return await new Promise((resolve, reject) => {

            let settled = false;

            let picker = null;

            const finish = (error, result) => {

                if (settled) return;

                settled = true;

                clearTimeout(timeout);

                try { picker?.setVisible(false); } catch {}
                try { picker?.dispose?.(); } catch {}

                error ? reject(error) : resolve(result);

            };

            const timeout = setTimeout(() => {

                finish(new Error(
                    "Google Picker session timed out."
                ));

            }, 45000);

            try {

                const view = new google.picker.DocsView(

                    folderOnly

                        ? google.picker.ViewId.FOLDERS

                        : google.picker.ViewId.DOCS

                );

                view.setIncludeFolders(true);

                view.setSelectFolderEnabled(folderOnly);

                if (folderOnly) {

                    view.setMimeTypes(
                        DRIVE_CONFIG.folderMimeType
                    );

                } else {

                    view.setMimeTypes(
                        Object.keys(ALLOWED_FILE_TYPES).join(",")
                    );

                }

                picker = new google.picker.PickerBuilder()

                    .setAppId(DRIVE_CONFIG.projectNumber)

                    .setDeveloperKey(DRIVE_CONFIG.apiKey)

                    .setOAuthToken(session.token)

                    .setOrigin(window.location.origin)

                    .addView(view)

                    .setTitle(

                        folderOnly

                            ? "Authorize MNM Legal Associates Folder"

                            : "Select Document from Google Drive"

                    )

                    .setCallback(data => {

                        try {

                            assertSession(admin.uid);

                            if (generation !== sessionGeneration) {

                                throw new Error(
                                    "Google session changed."
                                );

                            }

                            const action =
                                data[google.picker.Response.ACTION];

                            if (action === "error") {
                                finish(new Error("Google Picker failed. Check its API key and browser permissions."));
                            }
                            if (action === google.picker.Action.CANCEL) {

                                finish(null, null);

                            }

                            if (action === google.picker.Action.PICKED) {

                                const selected =
                                    data[google.picker.Response.DOCUMENTS];

                                finish(null, selected?.[0] || null);

                            }

                        } catch (error) {

                            finish(error);

                        }

                    })

                    .build();

                picker.setVisible(true);

            } catch (error) {

                finish(error);

            }

        });

    } finally {

        pickerPending = false;

    }

}


/* =========================================================
   9. ROOT FOLDER AUTHORIZATION
   ========================================================= */

function ensurePrivateFile(file) {

    if (
        !file ||
        file.trashed ||
        file.ownedByMe !== true ||
        file.shared !== false
    ) {

        throw new Error(

            "Only private, firm-owned Google Drive files and folders are permitted."

        );

    }

    return file;

}


function validateRoot(root) {
    ensurePrivateFile(root);
    if (root.mimeType !== DRIVE_CONFIG.folderMimeType ||
        root.capabilities?.canAddChildren !== true) {
        throw new Error("The DMS root folder is not writable.");
    }
    return root;
}

async function findManagedRoot() {
    const roots = await listDriveFiles([
        "trashed = false",
        `mimeType = '${DRIVE_CONFIG.folderMimeType}'`,
        `appProperties has { key='mnmDmsRoot' and value='${ROOT_MARKER}' }`
    ].join(" and "));
    if (roots.length > 1) throw new Error("Multiple DMS roots found. Manual review required.");
    return roots.length ? validateRoot(roots[0]) : null;
}

async function verifyRootFolder() {
    const session = requireGoogleSession();
    const generation = sessionGeneration;
    let root;
    if (authorizedRootId) {
        root = validateRoot(await getDriveFile(authorizedRootId));
    } else {
        root = await findManagedRoot();
        if (!root) root = validateRoot(await getDriveFile(DRIVE_CONFIG.rootFolderId));
    }
    assertSession(session.uid);
    if (generation !== sessionGeneration) throw new Error("Google session changed.");
    authorizedRootId = root.id;
    return root;
}

export async function authorizeRootFolder() {
    await requireAdministrator();
    const session = requireGoogleSession();
    const generation = sessionGeneration;
    if (rootPending) return rootPending;
    const operation = (async () => {
        try { return await verifyRootFolder(); }
        catch (error) {
            if (error.details?.httpStatus !== 404 || authorizedRootId) throw error;
        }
        // Explicit button action only; never create on page load.
        // Do not switch storage roots when existing documents are registered.
        const records = await fetchDocuments({includeArchived:true});
        if (records.length) throw new Error("Existing documents detected. Restore access to the original root before creating a new one.");
        const existing = await findManagedRoot();
        const root = existing || validateRoot(await driveRequest(
            `/files?fields=${encodeURIComponent(DRIVE_FIELDS)}`,
            {method:"POST", headers:{"Content-Type":"application/json"},
             body:JSON.stringify({name:"MNM Legal Associates - DMS Storage",mimeType:DRIVE_CONFIG.folderMimeType,appProperties:{mnmDmsRoot:ROOT_MARKER}})}
        ));
        assertSession(session.uid);
        if (generation !== sessionGeneration) throw new Error("Google session changed.");
        authorizedRootId = root.id;
        return root;
    })();
    rootPending = operation;
    try { return await operation; }
    finally { if (rootPending === operation) rootPending = null; }
}

export async function checkRootFolderAccess() {
    await requireAdministrator();
    requireGoogleSession();
    return verifyRootFolder();
}

async function requireRootFolder() {
    requireGoogleSession();
    return verifyRootFolder();
}


/* =========================================================
   10. GOOGLE DRIVE FOLDER MANAGEMENT
   ========================================================= */

function escapeDriveQuery(value) {

    return String(value)

        .replace(/\\/g, "\\\\")

        .replace(/'/g, "\\'");

}


async function listDriveFiles(filter) {

    const results = [];

    let pageToken = "";

    do {

        const parameters = new URLSearchParams({

            q: filter,

            fields: `nextPageToken,files(${DRIVE_FIELDS})`,

            pageSize: "100",

            spaces: "drive"

        });

        if (pageToken) {

            parameters.set("pageToken", pageToken);

        }

        const response = await driveRequest(

            `/files?${parameters.toString()}`

        );

        results.push(...(response.files || []));

        pageToken = response.nextPageToken || "";

    } while (pageToken);

    return results;

}


async function ensureFolder(parentId, folderName) {

    const parent = ensurePrivateFile(

        await getDriveFile(parentId)

    );

    if (
        parent.mimeType !== DRIVE_CONFIG.folderMimeType ||
        parent.capabilities?.canAddChildren !== true
    ) {

        throw new Error("Destination folder is not writable.");

    }

    const name = sanitizeFileName(folderName);

    const filter = [

        `'${escapeDriveQuery(parentId)}' in parents`,

        `name = '${escapeDriveQuery(name)}'`,

        `mimeType = '${DRIVE_CONFIG.folderMimeType}'`,

        "trashed = false"

    ].join(" and ");

    const existing = await listDriveFiles(filter);

    if (existing.length > 1) {

        throw new Error(

            "Duplicate destination folders detected. Review Google Drive before continuing."

        );

    }

    if (existing.length === 1) {

        return ensurePrivateFile(existing[0]);

    }

    const created = await driveRequest(

        `/files?fields=${encodeURIComponent(DRIVE_FIELDS)}`,

        {

            method: "POST",

            headers: {

                "Content-Type": "application/json"

            },

            body: JSON.stringify({

                name,

                mimeType: DRIVE_CONFIG.folderMimeType,

                parents: [parentId]

            })

        }

    );

    return ensurePrivateFile(created);

}


export async function initialiseDriveFolders() {

    const root = await requireRootFolder();

    const clients = await ensureFolder(

        root.id,

        DRIVE_CONFIG.folders.clients

    );

    const cases = await ensureFolder(

        root.id,

        DRIVE_CONFIG.folders.cases

    );

    return {

        rootFolderId: root.id,

        clientsFolderId: clients.id,

        casesFolderId: cases.id

    };

}


/* =========================================================
   11. CLIENT AND CASE INTEGRATION
   ========================================================= */

export async function fetchDocumentClients() {

    const admin = await requireAdministrator();

    const snapshot = await getDocsFromServer(

        collection(db, C.clients)

    );

    assertSession(admin.uid);

    return snapshot.docs

        .map(item => ({

            ...item.data(),

            id: item.id

        }))

        .filter(item => item.status !== "archived")

        .map(item => ({

            id: item.id,

            clientCode: item.clientCode || "",

            fullName: item.fullName || "",

            status: item.status

        }))

        .sort((a, b) =>

            a.fullName.localeCompare(b.fullName)

        );

}


export async function fetchDocumentCases(clientId = "") {

    const admin = await requireAdministrator();

    if (clientId) validateId(clientId);

    const snapshot = await getDocsFromServer(

        collection(db, C.cases)

    );

    const cases = [];

    for (const item of snapshot.docs) {

        assertSession(admin.uid);

        const record = item.data();

        if (record.status === "archived") continue;

        let eligible = !clientId ||
            record.clientId === clientId;

        if (!eligible && clientId) {

            const link = await getDocFromServer(

                doc(
                    db,
                    C.cases,
                    item.id,
                    "linkedClients",
                    clientId
                )

            );

            eligible = link.exists() &&
                link.data().active === true;

        }

        if (eligible) {

            cases.push({

                id: item.id,

                caseCode: record.caseCode || "",

                caseTitle: record.caseTitle || "",

                clientId: record.clientId,

                status: record.status

            });

        }

    }

    assertSession(admin.uid);

    return cases.sort((a, b) =>

        a.caseTitle.localeCompare(b.caseTitle)

    );

}


async function validateAssociation(clientId, caseId = "") {

    const admin = await requireAdministrator();

    const client = requireExisting(

        await getDocFromServer(

            doc(db, C.clients, validateId(clientId))

        )

    );

    if (client.status === "archived") {

        throw new Error(
            "Archived clients cannot register new documents."
        );

    }

    let caseRecord = null;

    if (caseId) {

        caseRecord = requireExisting(

            await getDocFromServer(

                doc(db, C.cases, validateId(caseId))

            )

        );

        if (caseRecord.status === "archived") {

            throw new Error(
                "Archived cases cannot register new documents."
            );

        }

        if (caseRecord.clientId !== clientId) {

            const link = await getDocFromServer(

                doc(
                    db,
                    C.cases,
                    caseId,
                    "linkedClients",
                    clientId
                )

            );

            if (
                !link.exists() ||
                link.data().active !== true
            ) {

                throw new Error(
                    "The selected client is not linked to this case."
                );

            }

        }

    }

    assertSession(admin.uid);

    return { client, caseRecord };

}


async function getDestinationFolder(clientId, caseId = "") {

    const root = await requireRootFolder();

    const association = await validateAssociation(
        clientId,
        caseId
    );

    const group = await ensureFolder(

        root.id,

        caseId

            ? DRIVE_CONFIG.folders.cases

            : DRIVE_CONFIG.folders.clients

    );

    // Stable internal IDs avoid duplicate folders
    // when a client name or case title changes.

    return ensureFolder(

        group.id,

        caseId

            ? `CASE-${caseId}`

            : `CLIENT-${clientId}`

    );

}


/* =========================================================
   12. FILE UPLOAD ENGINE
   ========================================================= */

async function createDriveFile(
    file,
    folderId,
    operationId
) {

    const validation = validateDocumentFile(file);

    if (!validation.valid) {

        throw new Error(validation.errors.join(" "));

    }

    const parent = ensurePrivateFile(

        await getDriveFile(folderId)

    );

    if (parent.capabilities?.canAddChildren !== true) {

        throw new Error("Destination folder is not writable.");

    }

    const metadata = {

        name: sanitizeFileName(file.name),

        mimeType: file.type,

        parents: [folderId],

        appProperties: {

            mnmOperationId: validateId(operationId)

        }

    };

    // Reuse an already uploaded file when recovering
    // an interrupted registration operation.

    const previous = await listDriveFiles([

        `'${escapeDriveQuery(folderId)}' in parents`,

        "trashed = false",

        "appProperties has { key='mnmOperationId' " +

        `and value='${escapeDriveQuery(operationId)}' }`

    ].join(" and "));

    if (previous.length > 1) {

        throw new Error(
            "Duplicate upload operation detected."
        );

    }

    if (previous.length === 1) {

        const existing = ensurePrivateFile(previous[0]);

        if (
            existing.name !== metadata.name ||
            existing.mimeType !== file.type ||
            Number(existing.size) !== file.size
        ) {

            throw new Error(
                "Recovery file does not match the selected upload."
            );

        }

        return existing;

    }

    const boundary = "mnm_" +
        crypto.randomUUID().replace(/-/g, "");

    const body = new Blob([

        `--${boundary}\r\n`,

        "Content-Type: application/json; charset=UTF-8\r\n\r\n",

        JSON.stringify(metadata),

        `\r\n--${boundary}\r\n`,

        `Content-Type: ${file.type}\r\n\r\n`,

        file,

        `\r\n--${boundary}--\r\n`

    ]);

    const result = await driveRequest(

        "/files?uploadType=multipart&fields=" +

        encodeURIComponent(DRIVE_FIELDS),

        {

            method: "POST",

            headers: {

                "Content-Type":

                    `multipart/related; boundary=${boundary}`

            },

            body

        },

        true

    );

    return ensurePrivateFile(result);

}


/* =========================================================
   13. IMPORT EXISTING GOOGLE DRIVE FILE
   ========================================================= */

export async function selectGoogleDriveDocument() {

    await requireAdministrator();

    requireGoogleSession();

    const selected = await openGooglePicker(false);

    if (!selected) return null;

    const file = ensurePrivateFile(

        await getDriveFile(selected.id)

    );

    validateDriveDocument(file);

    return {

        driveFileId: file.id,

        fileName: file.name,

        mimeType: file.mimeType,

        sizeBytes: Number(file.size)

    };

}


function validateDriveDocument(file) {

    ensurePrivateFile(file);

    if (!Object.hasOwn(ALLOWED_FILE_TYPES, file.mimeType)) {

        throw new Error(
            "The selected Google Drive file type is unsupported."
        );

    }

    const size = Number(file.size);

    if (
        !Number.isSafeInteger(size) ||
        size < 1 ||
        size > DRIVE_CONFIG.maxFileSize
    ) {

        throw new Error(
            "The document exceeds the permitted size or is empty."
        );

    }

    return file;

}


async function copyDriveDocument(
    fileId,
    folderId,
    operationId
) {

    const original = validateDriveDocument(

        await getDriveFile(fileId)

    );

    const parent = ensurePrivateFile(

        await getDriveFile(folderId)

    );

    if (parent.capabilities?.canAddChildren !== true) {

        throw new Error("Destination folder is not writable.");

    }

    const previous = await listDriveFiles([

        `'${escapeDriveQuery(folderId)}' in parents`,

        "trashed = false",

        "appProperties has { key='mnmOperationId' " +

        `and value='${escapeDriveQuery(operationId)}' }`

    ].join(" and "));

    if (previous.length > 1) {

        throw new Error(
            "Duplicate import operation detected."
        );

    }

    if (previous.length === 1) {

        const existing = validateDriveDocument(previous[0]);

        if (
            existing.name !== sanitizeFileName(original.name) ||
            existing.mimeType !== original.mimeType ||
            Number(existing.size) !== Number(original.size)
        ) {

            throw new Error("Recovery import does not match.");

        }

        return existing;

    }

    const copy = await driveRequest(

        `/files/${encodeURIComponent(original.id)}/copy` +

        `?fields=${encodeURIComponent(DRIVE_FIELDS)}`,

        {

            method: "POST",

            headers: {

                "Content-Type": "application/json"

            },

            body: JSON.stringify({

                name: sanitizeFileName(original.name),

                parents: [folderId],

                appProperties: {

                    mnmOperationId: validateId(operationId)

                }

            })

        }

    );

    return validateDriveDocument(copy);

}


/* =========================================================
   14. DOCUMENT METADATA VALIDATION
   ========================================================= */

function validateMetadata(input) {

    const category = cleanText(
        input.category,
        150,
        true
    );

    if (!Object.hasOwn(DOCUMENT_CATEGORIES, category)) {

        throw new Error("Select a valid document category.");

    }

    return {

        title: cleanText(input.title, 500, true),

        category,

        description: cleanText(input.description, 10000),

        documentDate: cleanDate(input.documentDate)

    };

}


export function validateDocumentData(input) {

    return {

        clientId: validateId(input.clientId),

        caseId: input.caseId

            ? validateId(input.caseId)

            : "",

        ...validateMetadata(input)

    };

}


function createVersionData(
    documentId,
    version,
    file,
    notes,
    uid
) {

    validateDriveDocument(file);

    return {

        documentId,

        version,

        driveFileId: validateId(file.id),

        fileName: cleanText(file.name, 500, true),

        mimeType: cleanText(file.mimeType, 200, true),

        sizeBytes: Number(file.size),

        notes: cleanText(notes, 5000),

        createdAt: serverTimestamp(),

        createdBy: uid

    };

}


/* =========================================================
   15. ANNUAL DOCUMENT NUMBERING
   ========================================================= */

export async function getNextDocumentCode() {

    const admin = await requireAdministrator();

    const year = getRegistrationYear();

    const snapshot = await getDocFromServer(

        doc(db, C.sequences, year)

    );

    assertSession(admin.uid);

    const sequence = snapshot.exists()

        ? snapshot.data().nextSequence

        : 1;

    return formatDocumentCode(sequence, year);

}


/* =========================================================
   16. ATOMIC DOCUMENT REGISTRATION
   ========================================================= */

async function registerDocument(
    input,
    driveFile,
    documentId,
    notes = ""
) {

    const admin = await requireAdministrator();

    const data = validateDocumentData(input);

    const id = validateId(documentId);

    const year = getRegistrationYear();

    const reference = documentReference(id);

    const counter = doc(db, C.sequences, year);

    const activity = activityReference(id);

    const version = createVersionData(

        id,

        1,

        driveFile,

        notes,

        admin.uid

    );

    await runTransaction(db, async transaction => {

        assertSession(admin.uid);

        const existing = await transaction.get(reference);

        if (existing.exists()) {

            const existingVersion = await transaction.get(

                versionReference(id, 1)

            );

            if (
                existingVersion.exists() &&
                existingVersion.data().driveFileId === driveFile.id &&
                existing.data().clientId === data.clientId &&
                existing.data().caseId === data.caseId
            ) {

                return;

            }

            throw new Error(
                "Document ID is already registered."
            );

        }

        const counterSnapshot = await transaction.get(counter);

        const sequenceNumber = counterSnapshot.exists()

            ? counterSnapshot.data().nextSequence

            : 1;

        const documentCode = formatDocumentCode(

            sequenceNumber,

            year

        );

        const record = {

            id,

            documentCode,

            sequenceNumber,

            registrationYear: year,

            ...data,

            status: "active",

            currentVersion: 1,

            createdAt: serverTimestamp(),

            createdBy: admin.uid,

            updatedAt: serverTimestamp(),

            updatedBy: admin.uid,

            revision: 1

        };

        assertSession(admin.uid);

        transaction.set(reference, record);

        transaction.set(

            versionReference(id, 1),

            version

        );

        transaction.set(counter, {

            year,

            nextSequence: sequenceNumber + 1,

            lastDocumentId: id,

            lastDocumentCode: documentCode,

            updatedAt: serverTimestamp(),

            updatedBy: admin.uid

        });

        transaction.set(

            activity,

            activityData(

                id,

                "registration",

                "Document registered with initial version.",

                admin.uid

            )

        );

    });

    assertSession(admin.uid);

    return getDocument(id);

}


/* =========================================================
   17. CREATE NEW DOCUMENT
   ========================================================= */

export async function createDocument(
    input,
    file,
    requestedId = generateDocumentId()
) {

    await requireAdministrator();

    const data = validateDocumentData(input);

    const id = validateId(requestedId);

    const notes = cleanText(input.versionNotes, 5000);

    const validation = validateDocumentFile(file);

    if (!validation.valid) {

        throw new Error(validation.errors.join(" "));

    }

    const folder = await getDestinationFolder(

        data.clientId,

        data.caseId

    );

    const uploaded = await createDriveFile(

        file,

        folder.id,

        id

    );

    try {

        return await registerDocument(

            data,

            uploaded,

            id,

            notes

        );

    } catch (error) {

        throw dmsError(

            "dms/registration-pending",

            "File uploaded but registration could not be confirmed.",

            {

                documentId: id,

                driveFileId: uploaded.id,

                cause: error.code || error.message

            }

        );

    }

}


/* =========================================================
   18. IMPORT DOCUMENT
   ========================================================= */

export async function importDocument(
    input,
    sourceDriveFileId,
    requestedId = generateDocumentId()
) {

    await requireAdministrator();

    const data = validateDocumentData(input);

    const id = validateId(requestedId);

    const notes = cleanText(input.versionNotes, 5000);

    const folder = await getDestinationFolder(

        data.clientId,

        data.caseId

    );

    const copied = await copyDriveDocument(

        sourceDriveFileId,

        folder.id,

        id

    );

    try {

        return await registerDocument(

            data,

            copied,

            id,

            notes

        );

    } catch (error) {

        throw dmsError(

            "dms/registration-pending",

            "Drive file copied but registration could not be confirmed.",

            {

                documentId: id,

                driveFileId: copied.id,

                cause: error.code || error.message

            }

        );

    }

}


/* =========================================================
   19. DOCUMENT REGISTRATION RECOVERY
   ========================================================= */

export async function recoverDocumentRegistration(
    input,
    documentId,
    driveFileId
) {

    await requireAdministrator();

    const data = validateDocumentData(input);

    const id = validateId(documentId);

    const folder = await getDestinationFolder(

        data.clientId,

        data.caseId

    );

    const file = validateDriveDocument(

        await getDriveFile(driveFileId)

    );

    if (!file.parents?.includes(folder.id)) {

        throw new Error(
            "Recovery file is outside the expected destination."
        );

    }

    const details = await driveRequest(

        `/files/${encodeURIComponent(file.id)}` +

        "?fields=appProperties"

    );

    if (details.appProperties?.mnmOperationId !== id) {

        throw new Error(
            "Recovery operation ID does not match."
        );

    }

    return registerDocument(

        data,

        file,

        id,

        input.versionNotes

    );

}


/* =========================================================
   20. FETCH DOCUMENT RECORDS
   ========================================================= */

export async function getDocument(documentId) {

    const admin = await requireAdministrator();

    const snapshot = await getDocFromServer(

        documentReference(documentId)

    );

    assertSession(admin.uid);

    return {

        ...requireExisting(snapshot),

        id: snapshot.id

    };

}


export async function fetchDocuments({

    includeArchived = false,

    clientId = "",

    caseId = ""

} = {}) {

    const admin = await requireAdministrator();

    const constraints = [];

    if (clientId) {

        constraints.push(

            where("clientId", "==", validateId(clientId))

        );

    }

    if (caseId) {

        constraints.push(

            where("caseId", "==", validateId(caseId))

        );

    }

    const reference = collection(db, C.documents);

    const source = constraints.length

        ? query(reference, ...constraints)

        : reference;

    const snapshot = await getDocsFromServer(source);

    assertSession(admin.uid);

    return snapshot.docs

        .map(item => ({

            ...item.data(),

            id: item.id

        }))

        .filter(item =>

            includeArchived || item.status !== "archived"

        )

        .sort((a, b) =>

            b.registrationYear.localeCompare(

                a.registrationYear

            ) ||

            b.sequenceNumber - a.sequenceNumber

        );

}


export function fetchDocumentsByClient(
    clientId,
    options = {}
) {

    return fetchDocuments({

        ...options,

        clientId: validateId(clientId)

    });

}


export function fetchDocumentsByCase(
    caseId,
    options = {}
) {

    return fetchDocuments({

        ...options,

        caseId: validateId(caseId)

    });

}


/* =========================================================
   21. UPDATE DOCUMENT METADATA
   ========================================================= */

export async function updateDocument(
    documentId,
    input,
    expectedRevision
) {

    const admin = await requireAdministrator();

    const id = validateId(documentId);

    const reference = documentReference(id);

    const activity = activityReference(id);

    await runTransaction(db, async transaction => {

        assertSession(admin.uid);

        const current = requireExisting(

            await transaction.get(reference)

        );

        ensureActive(current);

        ensureRevision(current, expectedRevision);

        const changes = validateMetadata({

            ...current,

            ...input

        });

        transaction.update(reference, {

            ...changes,

            updatedAt: serverTimestamp(),

            updatedBy: admin.uid,

            revision: current.revision + 1

        });

        transaction.set(

            activity,

            activityData(

                id,

                "metadata_update",

                "Document metadata updated.",

                admin.uid

            )

        );

    });

    assertSession(admin.uid);

    return getDocument(id);

}


/* =========================================================
   22. DOCUMENT VERSION HISTORY
   ========================================================= */

export async function fetchDocumentVersions(documentId) {

    const admin = await requireAdministrator();

    const snapshot = await getDocsFromServer(

        collection(

            documentReference(documentId),

            C.versions

        )

    );

    assertSession(admin.uid);

    return snapshot.docs

        .map(item => item.data())

        .sort((a, b) => b.version - a.version);

}


export async function getDocumentVersion(
    documentId,
    version
) {

    const admin = await requireAdministrator();

    const snapshot = await getDocFromServer(

        versionReference(documentId, version)

    );

    assertSession(admin.uid);

    return requireExisting(snapshot);

}


async function commitNewVersion(
    documentId,
    file,
    notes,
    expectedRevision
) {

    const admin = await requireAdministrator();

    const id = validateId(documentId);

    const reference = documentReference(id);

    const activity = activityReference(id);

    await runTransaction(db, async transaction => {

        assertSession(admin.uid);

        const current = requireExisting(

            await transaction.get(reference)

        );

        ensureActive(current);

        ensureRevision(current, expectedRevision);

        const nextVersion = current.currentVersion + 1;

        transaction.set(

            versionReference(id, nextVersion),

            createVersionData(

                id,

                nextVersion,

                file,

                notes,

                admin.uid

            )

        );

        transaction.update(reference, {

            currentVersion: nextVersion,

            revision: current.revision + 1,

            updatedAt: serverTimestamp(),

            updatedBy: admin.uid

        });

        transaction.set(

            activity,

            activityData(

                id,

                "version_added",

                `Document version ${nextVersion} added.`,

                admin.uid

            )

        );

    });

    assertSession(admin.uid);

    return getDocument(id);

}


export async function addDocumentVersion(
    documentId,
    file,
    notes,
    expectedRevision,
    operationId = generateDocumentId()
) {

    const current = await getDocument(documentId);

    ensureActive(current);

    ensureRevision(current, expectedRevision);

    const cleanNotes = cleanText(notes, 5000);

    const validation = validateDocumentFile(file);

    if (!validation.valid) {

        throw new Error(validation.errors.join(" "));

    }

    const folder = await getDestinationFolder(

        current.clientId,

        current.caseId

    );

    const uploaded = await createDriveFile(

        file,

        folder.id,

        validateId(operationId)

    );

    try {

        return await commitNewVersion(

            current.id,

            uploaded,

            cleanNotes,

            expectedRevision

        );

    } catch (error) {

        throw dmsError(

            "dms/version-pending",

            "Version uploaded but registration could not be confirmed.",

            {

                documentId: current.id,

                driveFileId: uploaded.id,

                operationId,

                expectedRevision,

                intendedVersion: current.currentVersion + 1,

                cause: error.code || error.message

            }

        );

    }

}


export async function recoverDocumentVersion(
    documentId,
    driveFileId,
    operationId,
    notes,
    expectedRevision,
    intendedVersion
) {

    const current = await getDocument(documentId);

    ensureActive(current);

    if (current.currentVersion >= intendedVersion) {

        const version = await getDocumentVersion(

            documentId,

            intendedVersion

        );

        if (version.driveFileId === driveFileId) {

            return current;

        }

        throw new Error(
            "The intended version is already occupied. Manual review required."
        );

    }

    ensureRevision(current, expectedRevision);

    if (intendedVersion !== current.currentVersion + 1) {

        throw new Error("Invalid recovery version.");

    }

    const folder = await getDestinationFolder(

        current.clientId,

        current.caseId

    );

    const file = validateDriveDocument(

        await getDriveFile(driveFileId)

    );

    if (!file.parents?.includes(folder.id)) {

        throw new Error("Unexpected recovery file location.");

    }

    const details = await driveRequest(

        `/files/${encodeURIComponent(file.id)}` +

        "?fields=appProperties"

    );

    if (details.appProperties?.mnmOperationId !== operationId) {

        throw new Error("Recovery operation ID mismatch.");

    }

    return commitNewVersion(

        documentId,

        file,

        cleanText(notes, 5000),

        expectedRevision

    );

}


/* =========================================================
   23. ARCHIVE DOCUMENT
   ========================================================= */

export async function archiveDocument(
    documentId,
    reason,
    expectedRevision
) {

    const admin = await requireAdministrator();

    const id = validateId(documentId);

    const reference = documentReference(id);

    const activity = activityReference(id);

    const archiveReason = cleanText(reason, 2000, true);

    await runTransaction(db, async transaction => {

        assertSession(admin.uid);

        const current = requireExisting(

            await transaction.get(reference)

        );

        ensureActive(current);

        ensureRevision(current, expectedRevision);

        transaction.update(reference, {

            status: "archived",

            archivedAt: serverTimestamp(),

            archivedBy: admin.uid,

            archiveReason,

            updatedAt: serverTimestamp(),

            updatedBy: admin.uid,

            revision: current.revision + 1

        });

        transaction.set(

            activity,

            activityData(

                id,

                "archive",

                `Document archived: ${archiveReason}`,

                admin.uid

            )

        );

    });

    assertSession(admin.uid);

    return getDocument(id);

}


/* =========================================================
   24. RESTORE ARCHIVED DOCUMENT
   ========================================================= */

export async function reactivateDocument(
    documentId,
    expectedRevision
) {

    const admin = await requireAdministrator();

    const id = validateId(documentId);

    const reference = documentReference(id);

    const activity = activityReference(id);

    await runTransaction(db, async transaction => {

        assertSession(admin.uid);

        const current = requireExisting(

            await transaction.get(reference)

        );

        ensureRevision(current, expectedRevision);

        if (current.status !== "archived") {

            throw new Error("Document is not archived.");

        }

        transaction.update(reference, {

            status: "active",

            archivedAt: deleteField(),

            archivedBy: deleteField(),

            archiveReason: deleteField(),

            updatedAt: serverTimestamp(),

            updatedBy: admin.uid,

            revision: current.revision + 1

        });

        transaction.set(

            activity,

            activityData(

                id,

                "reactivate",

                "Archived document restored.",

                admin.uid

            )

        );

    });

    assertSession(admin.uid);

    return getDocument(id);

}


/* =========================================================
   25. DOCUMENT ACCESS AND DOWNLOAD
   ========================================================= */

async function resolveDocumentVersion(
    documentId,
    requestedVersion = null
) {

    const record = await getDocument(documentId);

    const version = requestedVersion ??
        record.currentVersion;

    return getDocumentVersion(documentId, version);

}


export async function getDocumentOpenUrl(
    documentId,
    version = null
) {

    const admin = await requireAdministrator();

    const record = await resolveDocumentVersion(

        documentId,

        version

    );

    validateDriveDocument(

        await getDriveFile(record.driveFileId)

    );

    assertSession(admin.uid);

    return getDriveFileUrl(record.driveFileId);

}


export async function downloadDocument(
    documentId,
    version = null
) {

    const admin = await requireAdministrator();

    const record = await resolveDocumentVersion(

        documentId,

        version

    );

    const file = validateDriveDocument(

        await getDriveFile(record.driveFileId)

    );

    if (file.capabilities?.canDownload !== true) {

        throw new Error("Document download is not permitted.");

    }

    const blob = await driveRequest(

        `/files/${encodeURIComponent(record.driveFileId)}` +

        "?alt=media",

        {},

        false,

        true

    );

    assertSession(admin.uid);

    await requireAdministrator();

    assertSession(admin.uid);

    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");

    anchor.href = url;

    anchor.download = sanitizeFileName(record.fileName);

    anchor.style.display = "none";

    document.body.appendChild(anchor);

    anchor.click();

    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(url), 30000);

    return {

        success: true,

        fileName: record.fileName

    };

}


/* =========================================================
   26. DOCUMENT ACTIVITY RECORDS
   ========================================================= */

export async function fetchDocumentActivities(documentId) {

    const admin = await requireAdministrator();

    const snapshot = await getDocsFromServer(

        collection(

            documentReference(documentId),

            C.activities

        )

    );

    assertSession(admin.uid);

    return snapshot.docs

        .map(item => ({

            ...item.data(),

            id: item.id

        }))

        .sort((a, b) =>

            (b.createdAt?.toMillis?.() || 0) -

            (a.createdAt?.toMillis?.() || 0)

        );

}


export async function addDocumentNote(
    documentId,
    description
) {

    const admin = await requireAdministrator();

    const id = validateId(documentId);

    const reference = documentReference(id);

    const activity = activityReference(id);

    const data = activityData(

        id,

        "note",

        description,

        admin.uid

    );

    await runTransaction(db, async transaction => {

        assertSession(admin.uid);

        requireExisting(

            await transaction.get(reference)

        );

        transaction.set(activity, data);

    });

    assertSession(admin.uid);

    return { success: true };

}


/* =========================================================
   27. COMPLETE DOCUMENT PROFILE
   ========================================================= */

export async function fetchDocumentProfile(documentId) {

    const admin = await requireAdministrator();

    const record = await getDocument(documentId);

    const [versions, activities, client, caseSnapshot] =

        await Promise.all([

            fetchDocumentVersions(documentId),

            fetchDocumentActivities(documentId),

            getDocFromServer(

                doc(db, C.clients, record.clientId)

            ),

            record.caseId

                ? getDocFromServer(

                    doc(db, C.cases, record.caseId)

                )

                : Promise.resolve(null)

        ]);

    assertSession(admin.uid);

    return {

        document: record,

        versions,

        activities,

        currentVersion: versions.find(

            item => item.version === record.currentVersion

        ) || null,

        client: client.exists()

            ? {

                id: client.id,

                fullName: client.data().fullName,

                clientCode: client.data().clientCode

            }

            : null,

        case: caseSnapshot?.exists()

            ? {

                id: caseSnapshot.id,

                caseTitle: caseSnapshot.data().caseTitle,

                caseCode: caseSnapshot.data().caseCode

            }

            : null

    };

}


/* =========================================================
   28. DOCUMENT SEARCH AND FILTERS
   ========================================================= */

export function filterDocuments(
    records = [],
    filters = {}
) {

    const search = String(

        filters.search || ""

    ).trim().toLowerCase();

    return records.filter(record => {

        if (
            filters.status &&
            filters.status !== "all" &&
            record.status !== filters.status
        ) return false;

        if (
            filters.category &&
            filters.category !== "all" &&
            record.category !== filters.category
        ) return false;

        if (
            filters.clientId &&
            record.clientId !== filters.clientId
        ) return false;

        if (
            filters.caseId &&
            record.caseId !== filters.caseId
        ) return false;

        if (
            filters.year &&
            filters.year !== "all" &&
            record.registrationYear !== filters.year
        ) return false;

        if (!search) return true;

        return [

            record.documentCode,

            record.title,

            record.category,

            record.description,

            record.clientId,

            record.caseId,

            record.clientName,

            record.caseTitle,

            record.fileName

        ].some(value =>

            String(value || "")

                .toLowerCase()

                .includes(search)

        );

    });

}


/* =========================================================
   29. DOCUMENT STATISTICS
   ========================================================= */

export function calculateDocumentStatistics(records = []) {

    const today = getIndianDate();

    const month = today.slice(0, 7);

    const active = records.filter(

        record => record.status === "active"

    );

    const archived = records.filter(

        record => record.status === "archived"

    );

    const categoryCounts = {};

    for (const record of active) {

        const category = record.category;

        categoryCounts[category] =

            (categoryCounts[category] || 0) + 1;

    }

    return {

        totalDocuments: records.length,

        activeDocuments: active.length,

        archivedDocuments: archived.length,

        caseDocuments: active.filter(

            record => Boolean(record.caseId)

        ).length,

        clientDocuments: active.filter(

            record => !record.caseId

        ).length,

        documentsThisMonth: records.filter(record => {

            const date = record.createdAt?.toDate?.();

            return date &&

                getIndianDate(date).startsWith(month);

        }).length,

        totalVersions: records.reduce(

            (sum, record) =>

                sum + Number(record.currentVersion || 0),

            0

        ),

        categoryCounts

    };

}


export async function getDocumentStatistics() {

    const records = await fetchDocuments({

        includeArchived: true

    });

    return calculateDocumentStatistics(records);

}


/* =========================================================
   30. CONFIDENTIAL CSV EXPORT
   ========================================================= */

function csvCell(value) {

    let result = String(value ?? "");

    // Prevent spreadsheet formula injection.

    if (/^[\s]*[=+\-@]/.test(result)) {

        result = "'" + result;

    }

    return `"${result.replace(/"/g, '""')}"`;

}


export function generateDocumentCSV(records = []) {

    const headers = [

        "Document Code",

        "Title",

        "Category",

        "Document Date",

        "Client ID",

        "Case ID",

        "Status",

        "Current Version",

        "Registration Year"

    ];

    const rows = records.map(record => [

        record.documentCode,

        record.title,

        DOCUMENT_CATEGORIES[record.category] ||

            record.category,

        record.documentDate,

        record.clientId,

        record.caseId,

        record.status,

        record.currentVersion,

        record.registrationYear

    ]);

    return "\uFEFF" +

        [headers, ...rows]

            .map(row => row.map(csvCell).join(","))

            .join("\r\n");

}


/* =========================================================
   31. METADATA BACKUP
   ========================================================= */

export async function createDocumentBackup() {

    const admin = await requireAdministrator();

    const records = await fetchDocuments({

        includeArchived: true

    });

    const documents = [];

    for (const record of records) {

        assertSession(admin.uid);

        const [versions, activities] = await Promise.all([

            fetchDocumentVersions(record.id),

            fetchDocumentActivities(record.id)

        ]);

        documents.push({

            document: record,

            versions,

            activities

        });

    }

    const sequenceSnapshot = await getDocsFromServer(

        collection(db, C.sequences)

    );

    assertSession(admin.uid);

    return {

        application: "MNM Legal Associates DMS",

        version: DMS_CONFIG.version,

        backupType: "metadata-only",

        classification: "Confidential",

        generatedAt: new Date().toISOString(),

        generatedBy: admin.uid,

        totalDocuments: documents.length,

        documents,

        sequences: sequenceSnapshot.docs.map(item => ({

            ...item.data(),

            id: item.id

        }))

    };

}


/* =========================================================
   32. CLOUD CONNECTION STATUS
   ========================================================= */

export async function checkDocumentCloudConnection() {

    const admin = await requireAdministrator();

    const snapshot = await getDocsFromServer(

        query(

            collection(db, C.sequences),

            where("year", "==", getRegistrationYear())

        )

    );

    assertSession(admin.uid);

    return {

        connected: true,

        authorized: true,

        administrator: admin.name,

        role: admin.role,

        documentSequenceAvailable: snapshot.size > 0,

        googleDrive: getGoogleDriveConnection(),

        checkedAt: new Date().toISOString()

    };

}


/* =========================================================
   END OF DOCUMENT MANAGEMENT CLOUD ENGINE

   MNM LEGAL ASSOCIATES
   Justice, Integrity & Excellence
   ========================================================= */

/* Permanent deletion: administrator only, explicit UI confirmation required. */
export async function deleteDocument(documentId, expectedRevision) {
    const admin = await requireAdministrator();
    requireGoogleSession();
    const ref = documentReference(documentId);
    const record = await getDocument(documentId);
    ensureRevision(record, expectedRevision);
    const [versions, activities] = await Promise.all([
        getDocsFromServer(collection(ref, C.versions)),
        getDocsFromServer(collection(ref, C.activities))
    ]);
    assertSession(admin.uid);
    // Conservative limit for security-rule access calls and atomic metadata cleanup.
    if (versions.size + activities.size > 18) {
        throw new Error("This document has too much history for safe browser deletion. No files were deleted.");
    }
    if (versions.size !== record.currentVersion || versions.docs.some(v =>
        v.data().documentId !== documentId || v.id !== String(v.data().version))) {
        throw new Error("Version history is inconsistent. No files were deleted.");
    }
    const ids = [...new Set(versions.docs.map(v => validateId(v.data().driveFileId)))];
    // Preflight all files before any irreversible operation. A 404 can also mean lost access.
    for (const id of ids) {
        const file = await driveRequest(`/files/${encodeURIComponent(id)}?fields=id,mimeType,ownedByMe,shared,trashed,appProperties,capabilities(canDelete)`);
        ensurePrivateFile(file);
        if (file.mimeType === DRIVE_CONFIG.folderMimeType || !file.appProperties?.mnmOperationId || file.capabilities?.canDelete !== true) {
            throw new Error("A registered file is not eligible for permanent deletion. No files were deleted.");
        }
    }
    ensureRevision(await getDocument(documentId), expectedRevision);
    const deletedDriveFileIds = [];
    try {
        for (const id of ids) {
            assertSession(admin.uid);
            await driveRequest(`/files/${encodeURIComponent(id)}`, {method: "DELETE"});
            deletedDriveFileIds.push(id);
        }
        await requireAdministrator();
        assertSession(admin.uid);
        await runTransaction(db, async tx => {
            const current = requireExisting(await tx.get(ref));
            ensureRevision(current, expectedRevision);
            assertSession(admin.uid);
            for (const item of versions.docs) tx.delete(item.ref);
            for (const item of activities.docs) tx.delete(item.ref);
            tx.delete(ref);
        });
        assertSession(admin.uid);
        return {success: true, documentId, deletedDriveFileIds};
    } catch (cause) {
        throw dmsError("dms/deletion-pending", "Deletion could not be fully confirmed. Some files may already be permanently deleted. Do not retry blindly; reconcile Google Drive and Firestore first.", {documentId, deletedDriveFileIds, cause: cause?.message});
    }
}




