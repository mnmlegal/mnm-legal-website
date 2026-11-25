


/* =========================================================
   MNM LEGAL ASSOCIATES
   LEGAL PRACTICE MANAGEMENT SYSTEM

   CLIENT MANAGEMENT - CLOUD ENGINE
   Version 1.1

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
    collection,
    doc,
    getDocFromServer,
    getDocsFromServer,
    runTransaction,
    serverTimestamp,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";


/* =========================================================
   MODULE CONFIGURATION
   ========================================================= */

export const CLIENT_CONFIG = Object.freeze({

    collection: "clients",

    sequenceCollection: "clientSequences",

    activityCollection: "activities",

    prefix: "MNM/CL",

    initialSequence: 1,

    backupVersion: 1,

    timeZone: "Asia/Kolkata"

});


export const CLIENT_TYPES = Object.freeze({

    individual: "Individual",

    company: "Company",

    partnership: "Partnership Firm",

    llp: "Limited Liability Partnership",

    society: "Society",

    trust: "Trust",

    other: "Other"

});


export const CLIENT_STATUSES = Object.freeze({

    prospective: "Prospective",

    active: "Active",

    inactive: "Inactive",

    archived: "Archived"

});


export const ACTIVITY_TYPES = Object.freeze({

    registration: "Client Registration",

    profile_update: "Profile Updated",

    consultation: "Consultation",

    phone_call: "Phone Call",

    email: "Email",

    meeting: "Meeting",

    whatsapp: "WhatsApp",

    note: "Internal Note",

    archive: "Client Archived",

    reactivate: "Client Reactivated"

});


/* =========================================================
   ADMINISTRATOR AUTHORIZATION
   ========================================================= */

async function requireAdministrator() {

    await auth.authStateReady();

    const user = auth.currentUser;

    if (!user?.uid) {

        throw new Error(
            "Please sign in to access Client Management."
        );

    }

    const profile = await verifyStaffAccess(user);

    if (
        profile.active !== true ||
        profile.role !== "admin"
    ) {

        throw new Error(
            "Administrator authorization is required."
        );

    }

    if (auth.currentUser?.uid !== user.uid) {

        throw new Error(
            "Your authentication session has changed."
        );

    }

    return {

        ...profile,

        uid: user.uid

    };

}


/* =========================================================
   INDIAN STANDARD TIME
   ========================================================= */

export function getIndianDate() {

    const parts = new Intl.DateTimeFormat("en-GB", {

        timeZone: CLIENT_CONFIG.timeZone,

        year: "numeric",

        month: "2-digit",

        day: "2-digit"

    }).formatToParts(new Date());

    const year = parts.find(
        item => item.type === "year"
    ).value;

    const month = parts.find(
        item => item.type === "month"
    ).value;

    const day = parts.find(
        item => item.type === "day"
    ).value;

    return `${year}-${month}-${day}`;

}


export function getRegistrationYear() {

    return getIndianDate().slice(0, 4);

}


/* =========================================================
   UNIQUE DOCUMENT IDENTIFIER
   ========================================================= */

export function generateClientId() {

    return crypto.randomUUID();

}


function validateDocumentId(id) {

    const value = String(id || "");

    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {

        throw new Error(
            "Invalid client document ID."
        );

    }

    return value;

}


/* =========================================================
   CLIENT CODE GENERATION

   MNM/CL/001/2026
   MNM/CL/002/2026
   MNM/CL/001/2027
   ========================================================= */

export function formatClientCode(sequence, year) {

    if (
        !Number.isSafeInteger(sequence) ||
        sequence < 1
    ) {

        throw new Error(
            "Invalid client sequence number."
        );

    }

    const registrationYear = String(year);

    if (!/^\d{4}$/.test(registrationYear)) {

        throw new Error(
            "Invalid client registration year."
        );

    }

    return [

        CLIENT_CONFIG.prefix,

        String(sequence).padStart(3, "0"),

        registrationYear

    ].join("/");

}


/* =========================================================
   INPUT VALIDATION UTILITIES
   ========================================================= */

function cleanText(value, maxLength = 250) {

    const text = String(value ?? "").trim();

    if (text.length > maxLength) {

        throw new Error(
            `Text exceeds the permitted limit of ${maxLength} characters.`
        );

    }

    return text;

}


function cleanMobile(value) {

    const raw = cleanText(value, 40);

    if (!raw) return "";

    const mobile = raw.replace(/[\s()-]/g, "");

    if (!/^\+?[0-9]{7,15}$/.test(mobile)) {

        throw new Error(
            "Please enter a valid mobile number."
        );

    }

    return mobile;

}


function cleanEmail(value) {

    const email = cleanText(value, 254)
        .toLowerCase();

    if (!email) return "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {

        throw new Error(
            "Please enter a valid email address."
        );

    }

    return email;

}


function cleanDate(value) {

    const date = cleanText(value, 10);

    if (!date) return "";

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {

        throw new Error(
            "Invalid engagement date."
        );

    }

    const parsed = new Date(
        date + "T00:00:00Z"
    );

    if (
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== date
    ) {

        throw new Error(
            "Invalid calendar date."
        );

    }

    return date;

}


function cleanPinCode(value) {

    const pin = cleanText(value, 6);

    if (pin && !/^[1-9][0-9]{5}$/.test(pin)) {

        throw new Error(
            "Please enter a valid six-digit PIN code."
        );

    }

    return pin;

}


function validateRevision(revision) {

    if (
        !Number.isSafeInteger(revision) ||
        revision < 1 ||
        revision >= Number.MAX_SAFE_INTEGER
    ) {

        throw new Error(
            "Invalid client record revision."
        );

    }

    return revision;

}


/* =========================================================
   CLIENT PROFILE VALIDATION

   Only approved fields are written to Firestore.
   ========================================================= */

export function validateClientData(input) {

    if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input)
    ) {

        throw new Error(
            "Invalid client information."
        );

    }

    const clientType = cleanText(
        input.clientType || "individual",
        30
    );

    if (
        !Object.prototype.hasOwnProperty.call(
            CLIENT_TYPES,
            clientType
        )
    ) {

        throw new Error(
            "Invalid client type."
        );

    }

    const status = cleanText(
        input.status || "active",
        30
    );

    if (
        !Object.prototype.hasOwnProperty.call(
            CLIENT_STATUSES,
            status
        )
    ) {

        throw new Error(
            "Invalid client status."
        );

    }

    const fullName = cleanText(
        input.fullName,
        250
    );

    if (!fullName) {

        throw new Error(
            "Client name is required."
        );

    }

    const mobile = cleanMobile(input.mobile);

    const alternateMobile = cleanMobile(
        input.alternateMobile
    );

    if (
        mobile &&
        alternateMobile &&
        mobile === alternateMobile
    ) {

        throw new Error(
            "Primary and alternate mobile numbers must be different."
        );

    }

    return {

        clientType,

        fullName,

        relativeName: cleanText(
            input.relativeName,
            250
        ),

        contactPerson: cleanText(
            input.contactPerson,
            250
        ),

        mobile,

        alternateMobile,

        email: cleanEmail(input.email),

        address: cleanText(
            input.address,
            2000
        ),

        city: cleanText(
            input.city,
            150
        ),

        state: cleanText(
            input.state,
            150
        ),

        pinCode: cleanPinCode(
            input.pinCode
        ),

        occupation: cleanText(
            input.occupation,
            250
        ),

        engagementDate: cleanDate(
            input.engagementDate
        ),

        assignedAdvocate: cleanText(
            input.assignedAdvocate,
            250
        ),

        referenceSource: cleanText(
            input.referenceSource,
            250
        ),

        notes: cleanText(
            input.notes,
            10000
        ),

        status

    };

}


/* =========================================================
   FIRESTORE DOCUMENT REFERENCES
   ========================================================= */

function clientReference(clientId) {

    return doc(

        db,

        CLIENT_CONFIG.collection,

        validateDocumentId(clientId)

    );

}


function sequenceReference(year) {

    const yearId = String(year);

    if (!/^\d{4}$/.test(yearId)) {

        throw new Error(
            "Invalid client numbering year."
        );

    }

    return doc(

        db,

        CLIENT_CONFIG.sequenceCollection,

        yearId

    );

}


function activityReference(clientId) {

    return doc(

        collection(

            clientReference(clientId),

            CLIENT_CONFIG.activityCollection

        )

    );

}


/* =========================================================
   READ NEXT AVAILABLE CLIENT SEQUENCE
   Preview only. Does not consume a client number.
   ========================================================= */

export async function getNextClientSequence(
    year = getRegistrationYear()
) {

    await requireAdministrator();

    const reference = sequenceReference(year);

    const snapshot = await getDocFromServer(
        reference
    );

    if (!snapshot.exists()) {

        return CLIENT_CONFIG.initialSequence;

    }

    const sequence = snapshot.data().nextSequence;

    if (
        !Number.isSafeInteger(sequence) ||
        sequence < 1 ||
        sequence >= Number.MAX_SAFE_INTEGER
    ) {

        throw new Error(
            "Invalid centralized client sequence."
        );

    }

    return sequence;

}


export async function getNextClientCode(
    year = getRegistrationYear()
) {

    const sequence = await getNextClientSequence(
        year
    );

    return formatClientCode(sequence, year);

}


/* =========================================================
   ACTIVITY RECORD CONSTRUCTION
   ========================================================= */

function buildActivity(
    clientId,
    type,
    description,
    userId
) {

    if (
        !Object.prototype.hasOwnProperty.call(
            ACTIVITY_TYPES,
            type
        )
    ) {

        throw new Error(
            "Invalid client activity type."
        );

    }

    const text = cleanText(
        description,
        10000
    );

    if (!text) {

        throw new Error(
            "Activity description is required."
        );

    }

    return {

        clientId,

        type,

        description: text,

        createdAt: serverTimestamp(),

        createdBy: userId

    };

}


/* =========================================================
   REGISTER NEW CLIENT

   Client profile, yearly counter and registration
   activity are written in one atomic transaction.
   ========================================================= */

export async function createClient(
    input,
    requestedId = generateClientId()
) {

    const administrator =
        await requireAdministrator();

    const data = validateClientData(input);

    if (data.status === "archived") {

        throw new Error(
            "A new client cannot be registered as archived."
        );

    }

    const clientId = validateDocumentId(
        requestedId
    );

    const year = getRegistrationYear();

    const reference = clientReference(clientId);

    const counterRef = sequenceReference(year);

    const activityRef = activityReference(
        clientId
    );

    await runTransaction(
        db,
        async transaction => {

            const existing =
                await transaction.get(reference);

            if (existing.exists()) {

                throw new Error(

                    "This client record already exists. " +

                    "Check the client directory before retrying."

                );

            }

            const counter =
                await transaction.get(counterRef);

            const sequence = counter.exists()

                ? counter.data().nextSequence

                : CLIENT_CONFIG.initialSequence;

            if (
                !Number.isSafeInteger(sequence) ||
                sequence < 1 ||
                sequence >= Number.MAX_SAFE_INTEGER
            ) {

                throw new Error(
                    "Invalid client sequence."
                );

            }

            const clientCode = formatClientCode(
                sequence,
                year
            );

            const record = {

                ...data,

                id: clientId,

                clientCode,

                sequenceNumber: sequence,

                registrationYear: year,

                revision: 1,

                createdAt: serverTimestamp(),

                createdBy: administrator.uid,

                updatedAt: serverTimestamp(),

                updatedBy: administrator.uid

            };


            /* SAVE CLIENT PROFILE */

            transaction.set(
                reference,
                record
            );


            /* ADVANCE YEARLY COUNTER */

            transaction.set(

                counterRef,

                {

                    year,

                    nextSequence: sequence + 1,

                    lastClientId: clientId,

                    lastClientCode: clientCode,

                    updatedAt: serverTimestamp(),

                    updatedBy: administrator.uid

                }

            );


            /* REGISTRATION ACTIVITY */

            transaction.set(

                activityRef,

                buildActivity(

                    clientId,

                    "registration",

                    `Client registered with Client ID ${clientCode}.`,

                    administrator.uid

                )

            );

        }

    );


    /* VERIFY SERVER SAVE */

    const saved = await getDocFromServer(
        reference
    );

    if (!saved.exists()) {

        throw new Error(

            "Client registration could not be confirmed. " +

            "Check the client directory before retrying."

        );

    }

    return {

        ...saved.data(),

        id: saved.id

    };

}


/* =========================================================
   FETCH INDIVIDUAL CLIENT PROFILE
   ========================================================= */

export async function getClient(clientId) {

    await requireAdministrator();

    const reference = clientReference(
        clientId
    );

    const snapshot = await getDocFromServer(
        reference
    );

    if (!snapshot.exists()) {

        throw new Error(
            "Client record was not found."
        );

    }

    return {

        ...snapshot.data(),

        id: snapshot.id

    };

}


/* =========================================================
   FETCH ALL CLIENT RECORDS

   Archived clients are included when requested.
   ========================================================= */

export async function fetchClients({

    includeArchived = false

} = {}) {

    await requireAdministrator();

    const reference = collection(

        db,

        CLIENT_CONFIG.collection

    );

    const snapshot = await getDocsFromServer(
        reference
    );

    const records = snapshot.docs.map(item => ({

        ...item.data(),

        id: item.id

    }));

    return records

        .filter(record =>

            includeArchived ||

            record.status !== "archived"

        )

        .sort((a, b) => {

            const yearComparison = String(
                b.registrationYear
            ).localeCompare(
                String(a.registrationYear)
            );

            if (yearComparison !== 0) {

                return yearComparison;

            }

            return Number(b.sequenceNumber || 0) -

                Number(a.sequenceNumber || 0);

        });

}


/* =========================================================
   DUPLICATE CLIENT DETECTION
   Advisory warning only.
   ========================================================= */

function normalizeName(value) {

    return String(value || "")

        .normalize("NFKC")

        .trim()

        .replace(/\s+/g, " ")

        .toLowerCase();

}


function normalizePhone(value) {

    let number = String(value || "")
        .replace(/\D/g, "");

    if (
        number.length === 12 &&
        number.startsWith("91")
    ) {

        number = number.slice(2);

    }

    if (
        number.length === 11 &&
        number.startsWith("0")
    ) {

        number = number.slice(1);

    }

    return number;

}


export async function findDuplicateClients(
    input,
    excludeId = null
) {

    const data = validateClientData(input);

    const records = await fetchClients({

        includeArchived: true

    });

    const name = normalizeName(
        data.fullName
    );

    const phones = [

        normalizePhone(data.mobile),

        normalizePhone(data.alternateMobile)

    ].filter(Boolean);

    const email = data.email.toLowerCase();

    const matches = [];

    for (const record of records) {

        if (record.id === excludeId) {

            continue;

        }

        const reasons = [];

        if (
            name &&
            normalizeName(record.fullName) === name
        ) {

            reasons.push("Matching client name");

        }

        const existingPhones = [

            normalizePhone(record.mobile),

            normalizePhone(record.alternateMobile)

        ].filter(Boolean);

        if (
            phones.some(
                phone => existingPhones.includes(phone)
            )
        ) {

            reasons.push("Matching mobile number");

        }

        if (
            email &&
            String(record.email || "")
                .toLowerCase() === email
        ) {

            reasons.push("Matching email address");

        }

        if (reasons.length) {

            matches.push({

                id: record.id,

                clientCode: record.clientCode,

                fullName: record.fullName,

                mobile: record.mobile || "",

                email: record.email || "",

                status: record.status,

                reasons

            });

        }

    }

    return matches;

}


/* =========================================================
   UPDATE EXISTING CLIENT PROFILE

   Client identity and original registration details
   remain immutable.
   ========================================================= */

export async function updateClient(

    clientId,

    input,

    expectedRevision

) {

    const administrator =
        await requireAdministrator();

    validateRevision(expectedRevision);

    const reference = clientReference(
        clientId
    );

    const activityRef = activityReference(
        clientId
    );

    await runTransaction(
        db,
        async transaction => {

            const snapshot =
                await transaction.get(reference);

            if (!snapshot.exists()) {

                throw new Error(
                    "Client record does not exist."
                );

            }

            const existing = snapshot.data();

            if (
                existing.revision !== expectedRevision
            ) {

                throw new Error(

                    "Client information was modified elsewhere. " +

                    "Please reopen the profile before updating."

                );

            }

            if (existing.status === "archived") {

                throw new Error(

                    "Archived clients must be reactivated " +

                    "before editing."

                );

            }

            const data = validateClientData({

                ...existing,

                ...input

            });

            if (data.status === "archived") {

                throw new Error(
                    "Use the Archive Client function."
                );

            }

            const changedFields = Object.keys(data)

                .filter(field =>

                    String(data[field] ?? "") !==

                    String(existing[field] ?? "")

                );

            if (!changedFields.length) {

                return;

            }

            const updated = {

                ...existing,

                ...data,

                id: existing.id,

                clientCode: existing.clientCode,

                sequenceNumber: existing.sequenceNumber,

                registrationYear:
                    existing.registrationYear,

                createdAt: existing.createdAt,

                createdBy: existing.createdBy,

                revision: existing.revision + 1,

                updatedAt: serverTimestamp(),

                updatedBy: administrator.uid

            };

            transaction.set(

                reference,

                updated

            );

            transaction.set(

                activityRef,

                buildActivity(

                    clientId,

                    "profile_update",

                    "Client profile updated. Modified fields: " +

                    changedFields.join(", ") + ".",

                    administrator.uid

                )

            );

        }

    );

    const saved = await getDocFromServer(
        reference
    );

    if (!saved.exists()) {

        throw new Error(
            "Client update could not be confirmed."
        );

    }

    return {

        ...saved.data(),

        id: saved.id

    };

}


/* =========================================================
   ARCHIVE CLIENT

   No permanent deletion.
   Client ID and historical records are preserved.
   ========================================================= */

export async function archiveClient(

    clientId,

    reason,

    expectedRevision

) {

    const administrator =
        await requireAdministrator();

    validateRevision(expectedRevision);

    const archiveReason = cleanText(
        reason,
        2000
    );

    if (!archiveReason) {

        throw new Error(
            "Please enter a reason for archiving."
        );

    }

    const reference = clientReference(
        clientId
    );

    const activityRef = activityReference(
        clientId
    );

    await runTransaction(
        db,
        async transaction => {

            const snapshot =
                await transaction.get(reference);

            if (!snapshot.exists()) {

                throw new Error(
                    "Client record was not found."
                );

            }

            const existing = snapshot.data();

            if (existing.status === "archived") {

                throw new Error(
                    "This client is already archived."
                );

            }

            if (
                existing.revision !== expectedRevision
            ) {

                throw new Error(

                    "Client record has changed. " +

                    "Please reopen the profile."

                );

            }

            transaction.update(reference, {

                status: "archived",

                archiveReason,

                archivedAt: serverTimestamp(),

                archivedBy: administrator.uid,

                revision: existing.revision + 1,

                updatedAt: serverTimestamp(),

                updatedBy: administrator.uid

            });

            transaction.set(

                activityRef,

                buildActivity(

                    clientId,

                    "archive",

                    "Client archived. Reason: " +
                    archiveReason,

                    administrator.uid

                )

            );

        }

    );

    return await getClient(clientId);

}


/* =========================================================
   REACTIVATE ARCHIVED CLIENT

   Original client code remains unchanged.
   ========================================================= */

export async function reactivateClient(

    clientId,

    expectedRevision

) {

    const administrator =
        await requireAdministrator();

    validateRevision(expectedRevision);

    const reference = clientReference(
        clientId
    );

    const activityRef = activityReference(
        clientId
    );

    await runTransaction(
        db,
        async transaction => {

            const snapshot =
                await transaction.get(reference);

            if (!snapshot.exists()) {

                throw new Error(
                    "Client record was not found."
                );

            }

            const existing = snapshot.data();

            if (existing.status !== "archived") {

                throw new Error(
                    "Only archived clients can be reactivated."
                );

            }

            if (
                existing.revision !== expectedRevision
            ) {

                throw new Error(

                    "Client record has changed. " +

                    "Please reopen the profile."

                );

            }

            const updated = {

                ...existing,

                status: "active",

                revision: existing.revision + 1,

                updatedAt: serverTimestamp(),

                updatedBy: administrator.uid

            };

            delete updated.archivedAt;

            delete updated.archivedBy;

            delete updated.archiveReason;

            transaction.set(

                reference,

                updated

            );

            transaction.set(

                activityRef,

                buildActivity(

                    clientId,

                    "reactivate",

                    "Archived client profile reactivated.",

                    administrator.uid

                )

            );

        }

    );

    return await getClient(clientId);

}


/* =========================================================
   CLIENT COMMUNICATION AND ACTIVITY HISTORY
   ========================================================= */

export async function addClientActivity(

    clientId,

    type,

    description

) {

    const administrator =
        await requireAdministrator();

    const allowedManualTypes = [

        "consultation",

        "phone_call",

        "email",

        "meeting",

        "whatsapp",

        "note"

    ];

    if (!allowedManualTypes.includes(type)) {

        throw new Error(
            "Invalid manual activity type."
        );

    }

    const reference = clientReference(
        clientId
    );

    const activityRef = activityReference(
        clientId
    );

    const activity = buildActivity(

        clientId,

        type,

        description,

        administrator.uid

    );

    await runTransaction(
        db,
        async transaction => {

            const client =
                await transaction.get(reference);

            if (!client.exists()) {

                throw new Error(
                    "Client record does not exist."
                );

            }

            if (
                client.data().status === "archived"
            ) {

                throw new Error(

                    "Reactivate the client before " +

                    "adding new activities."

                );

            }

            transaction.set(

                activityRef,

                activity

            );

        }

    );

    const saved = await getDocFromServer(
        activityRef
    );

    if (!saved.exists()) {

        throw new Error(
            "Activity save could not be confirmed."
        );

    }

    return {

        ...saved.data(),

        id: saved.id

    };

}


/* =========================================================
   FETCH CLIENT ACTIVITY TIMELINE
   ========================================================= */

export async function fetchClientActivities(
    clientId
) {

    await requireAdministrator();

    const reference = collection(

        clientReference(clientId),

        CLIENT_CONFIG.activityCollection

    );

    const activityQuery = query(

        reference,

        orderBy("createdAt", "desc")

    );

    const snapshot = await getDocsFromServer(
        activityQuery
    );

    return snapshot.docs.map(item => ({

        ...item.data(),

        id: item.id

    }));

}


/* =========================================================
   CLIENT MANAGEMENT STATISTICS
   ========================================================= */

export async function getClientStatistics() {

    const records = await fetchClients({

        includeArchived: true

    });

    const currentMonth = getIndianDate()
        .slice(0, 7);

    const statistics = {

        total: records.length,

        active: 0,

        inactive: 0,

        prospective: 0,

        archived: 0,

        newThisMonth: 0,

        individuals: 0,

        organizations: 0

    };

    for (const record of records) {

        if (

            Object.prototype.hasOwnProperty.call(

                CLIENT_STATUSES,

                record.status

            )

        ) {

            statistics[record.status]++;

        }

        if (record.clientType === "individual") {

            statistics.individuals++;

        } else {

            statistics.organizations++;

        }

        if (record.createdAt?.toDate) {

            const date = record.createdAt.toDate();

            const parts = new Intl.DateTimeFormat(

                "en-GB",

                {

                    timeZone: CLIENT_CONFIG.timeZone,

                    year: "numeric",

                    month: "2-digit"

                }

            ).formatToParts(date);

            const year = parts.find(
                item => item.type === "year"
            ).value;

            const month = parts.find(
                item => item.type === "month"
            ).value;

            if (`${year}-${month}` === currentMonth) {

                statistics.newThisMonth++;

            }

        }

    }

    return statistics;

}


/* =========================================================
   FETCH ALL CLIENT NUMBERING COUNTERS
   ========================================================= */

export async function fetchClientSequences() {

    await requireAdministrator();

    const reference = collection(

        db,

        CLIENT_CONFIG.sequenceCollection

    );

    const snapshot = await getDocsFromServer(
        reference
    );

    return snapshot.docs.map(item => ({

        ...item.data(),

        yearId: item.id

    }));

}


/* =========================================================
   CONFIDENTIAL CLIENT BACKUP

   Includes active, inactive, prospective and
   archived client records with activity history.

   This function prepares backup data only.
   Download will be handled by clients.js.
   ========================================================= */

export async function createClientBackup() {

    const administrator =
        await requireAdministrator();

    const [

        clients,

        sequences

    ] = await Promise.all([

        fetchClients({

            includeArchived: true

        }),

        fetchClientSequences()

    ]);

    const activities = {};

    for (const client of clients) {

        activities[client.id] =
            await fetchClientActivities(
                client.id
            );

    }

    return {

        firm: "MNM Legal Associates",

        module: "Client Management",

        classification: "Confidential",

        backupVersion: CLIENT_CONFIG.backupVersion,

        backupDate: new Date().toISOString(),

        exportedBy: administrator.uid,

        storage: "Firebase Cloud Firestore",

        clientCount: clients.length,

        data: {

            clients,

            sequences,

            activities

        }

    };

}


/* =========================================================
   CLIENT CLOUD CONNECTION CHECK
   ========================================================= */

export async function checkClientCloudConnection() {

    const administrator =
        await requireAdministrator();

    const [

        clients,

        nextClientCode

    ] = await Promise.all([

        fetchClients({

            includeArchived: true

        }),

        getNextClientCode()

    ]);

    return {

        connected: true,

        authorized: true,

        administrator: administrator.name || "",

        role: administrator.role,

        clientCount: clients.length,

        nextClientCode,

        checkedAt: new Date().toISOString()

    };

}


/* =========================================================
   END OF CLIENT MANAGEMENT CLOUD ENGINE

   MNM LEGAL ASSOCIATES
   Legal Practice Management System

   Version 1.1
   Justice, Integrity & Excellence
   ========================================================= */

/* Recoverable deletion: existing archive rules remain unchanged. */
export async function deleteClient(clientId, reason, expectedRevision) {
    const explanation = cleanText(reason, 1900);
    if (!explanation) throw new Error("Please enter a reason for deleting this client.");
    return archiveClient(clientId, "Deleted from directory: " + explanation, expectedRevision);
}

export async function restoreDeletedClient(clientId, expectedRevision) {
    return reactivateClient(clientId, expectedRevision);
}




