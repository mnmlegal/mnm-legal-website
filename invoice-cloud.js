
/* =========================================================
   MNM LEGAL ASSOCIATES
   CLOUD INVOICE MANAGEMENT
   Version 1.0 - Migration Preparation

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
    getDocsFromServer
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";


/* =========================================================
   STORAGE CONFIGURATION
   ========================================================= */

const LOCAL_KEYS = Object.freeze({

    invoices: "mnmSavedBills",

    sequence: "mnmNextInvoiceNumber",

    payment: "mnmFirmPaymentSettings"

});


const CLOUD_CONFIG = Object.freeze({

    invoices: "invoices",

    settings: "settings",

    sequence: "invoiceSequence",

    payment: "firmPayment",

    migration: "invoiceMigration",

    schemaVersion: 1

});


/* =========================================================
   ADMINISTRATOR AUTHORIZATION
   ========================================================= */

async function requireAdministrator() {

    await auth.authStateReady();

    const user = auth.currentUser;

    if (!user) {

        throw new Error(
            "Please sign in before accessing cloud invoices."
        );

    }

    const profile = await verifyStaffAccess(user);

    if (
        profile.active !== true ||
        profile.role !== "admin"
    ) {

        throw new Error(
            "Administrator authorization required."
        );

    }

    return profile;

}


/* =========================================================
   LOCAL STORAGE READING
   ========================================================= */

function readJSON(key, fallback) {

    const raw = localStorage.getItem(key);

    if (raw === null) {

        return fallback;

    }

    try {

        return JSON.parse(raw);

    } catch {

        throw new Error(
            "Invalid local storage data: " + key
        );

    }

}


function readLocalInvoices() {

    const records = readJSON(
        LOCAL_KEYS.invoices,
        []
    );

    if (!Array.isArray(records)) {

        throw new Error(
            "Existing invoice storage is invalid."
        );

    }

    return records;

}


function readLocalSequence() {

    const raw = localStorage.getItem(
        LOCAL_KEYS.sequence
    );

    if (raw === null) {

        return 1;

    }

    if (!/^\d+$/.test(raw)) {

        throw new Error(
            "Existing invoice sequence is invalid."
        );

    }

    const number = Number(raw);

    if (
        !Number.isSafeInteger(number) ||
        number < 1
    ) {

        throw new Error(
            "Invalid invoice sequence number."
        );

    }

    return number;

}


function readLocalPaymentSettings() {

    const settings = readJSON(
        LOCAL_KEYS.payment,
        {}
    );

    if (
        !settings ||
        typeof settings !== "object" ||
        Array.isArray(settings)
    ) {

        throw new Error(
            "Existing payment settings are invalid."
        );

    }

    return settings;

}


/* =========================================================
   RECORD VALIDATION
   ========================================================= */

function validateInvoiceRecords(records) {

    if (!Array.isArray(records)) {

        throw new Error(
            "Invoice records must be an array."
        );

    }

    const ids = new Set();

    const numbers = new Set();

    const errors = [];

    let highestSequence = 0;


    records.forEach((record, index) => {

        const position = index + 1;

        if (
            !record ||
            typeof record !== "object" ||
            Array.isArray(record)
        ) {

            errors.push(
                `Record ${position}: Invalid record.`
            );

            return;

        }


        /* RECORD ID */

        if (
            record.id == null ||
            !String(record.id).trim()
        ) {

            errors.push(
                `Record ${position}: Missing ID.`
            );

        } else {

            const id = String(record.id);

            if (ids.has(id)) {

                errors.push(
                    `Record ${position}: Duplicate record ID.`
                );

            }

            ids.add(id);

        }


        /* INVOICE NUMBER */

        if (
            typeof record.invoiceNo !== "string" ||
            !record.invoiceNo.trim()
        ) {

            errors.push(
                `Record ${position}: Missing invoice number.`
            );

        } else {

            const invoiceNo =
                record.invoiceNo.trim().toUpperCase();

            if (numbers.has(invoiceNo)) {

                errors.push(
                    `Duplicate invoice number: ${invoiceNo}`
                );

            }

            numbers.add(invoiceNo);

            const match = invoiceNo.match(
                /^MNM\/(\d+)\/\d{4}$/
            );

            if (match) {

                const sequence = Number(match[1]);

                if (
                    Number.isSafeInteger(sequence) &&
                    sequence >= 1 &&
                    sequence < Number.MAX_SAFE_INTEGER
                ) {

                    highestSequence = Math.max(
                        highestSequence,
                        sequence
                    );

                } else {

                    errors.push(
                        `Invalid invoice sequence: ${invoiceNo}`
                    );

                }

            } else {

                errors.push(
                    `Unsupported invoice number: ${invoiceNo}`
                );

            }

        }


        /* INVOICE ITEMS */

        if (!Array.isArray(record.items)) {

            errors.push(
                `Record ${position}: Invalid invoice items.`
            );

        } else {

            record.items.forEach((item, itemIndex) => {

                if (
                    !item ||
                    typeof item !== "object" ||
                    Array.isArray(item)
                ) {

                    errors.push(
                        `Record ${position}: Invalid item ${itemIndex + 1}.`
                    );

                    return;

                }

                const quantity = Number(
                    item.quantity ?? item.qty ?? 1
                );

                const rate = Number(
                    item.rate ?? 0
                );

                if (
                    !Number.isFinite(quantity) ||
                    quantity < 0 ||
                    !Number.isFinite(rate) ||
                    rate < 0
                ) {

                    errors.push(
                        `Record ${position}: Invalid item amount.`
                    );

                }

            });

        }

    });


    return {

        valid: errors.length === 0,

        recordCount: records.length,

        highestSequence,

        errors

    };

}


/* =========================================================
   SAFE SEQUENCE CALCULATION
   ========================================================= */

function calculateNextSequence(records, storedSequence) {

    const validation = validateInvoiceRecords(records);

    if (!validation.valid) {

        throw new Error(
            validation.errors.join("\n")
        );

    }

    if (
        !Number.isSafeInteger(storedSequence) ||
        storedSequence < 1
    ) {

        throw new Error(
            "Invalid stored sequence."
        );

    }

    const next = Math.max(

        storedSequence,

        validation.highestSequence + 1

    );

    if (!Number.isSafeInteger(next)) {

        throw new Error(
            "Invoice sequence exceeds supported limit."
        );

    }

    return next;

}


/* =========================================================
   LOCAL DATA SNAPSHOT
   No local records are modified.
   ========================================================= */

function captureLocalSnapshot() {

    const invoices = readLocalInvoices();

    const storedSequence = readLocalSequence();

    const paymentSettings = readLocalPaymentSettings();

    const validation = validateInvoiceRecords(invoices);

    if (!validation.valid) {

        throw new Error(
            validation.errors.join("\n")
        );

    }

    const nextSequence = calculateNextSequence(

        invoices,

        storedSequence

    );

    return {

        schemaVersion: CLOUD_CONFIG.schemaVersion,

        capturedAt: new Date().toISOString(),

        source: window.location.origin,

        invoiceCount: invoices.length,

        storedSequence,

        nextSequence,

        invoices,

        paymentSettings

    };

}


/* =========================================================
   CLOUD INVOICE READING
   Server data only.
   ========================================================= */

async function readCloudInvoices() {

    await requireAdministrator();

    const reference = collection(

        db,

        CLOUD_CONFIG.invoices

    );

    const snapshot = await getDocsFromServer(reference);

    return snapshot.docs.map(document => ({

        documentId: document.id,

        data: document.data()

    }));

}


/* =========================================================
   CLOUD SETTINGS READING
   ========================================================= */

async function readCloudSetting(settingId) {

    await requireAdministrator();

    const allowedSettings = [

        CLOUD_CONFIG.sequence,

        CLOUD_CONFIG.payment,

        CLOUD_CONFIG.migration

    ];

    if (!allowedSettings.includes(settingId)) {

        throw new Error(
            "Unsupported cloud setting."
        );

    }

    const reference = doc(

        db,

        CLOUD_CONFIG.settings,

        settingId

    );

    const snapshot = await getDocFromServer(reference);

    return snapshot.exists()

        ? snapshot.data()

        : null;

}


/* =========================================================
   CLOUD CONNECTION CHECK
   ========================================================= */

async function checkCloudConnection() {

    const administrator =
        await requireAdministrator();

    const [

        invoices,

        sequence,

        payment,

        migration

    ] = await Promise.all([

        readCloudInvoices(),

        readCloudSetting(CLOUD_CONFIG.sequence),

        readCloudSetting(CLOUD_CONFIG.payment),

        readCloudSetting(CLOUD_CONFIG.migration)

    ]);

    return {

        connected: true,

        administrator: administrator.name,

        role: administrator.role,

        cloudInvoiceCount: invoices.length,

        sequenceConfigured: sequence !== null,

        paymentConfigured: payment !== null,

        migrationConfigured: migration !== null,

        checkedAt: new Date().toISOString()

    };

}


/* =========================================================
   MIGRATION PREPARATION REPORT
   No database writes.
   ========================================================= */

async function prepareMigration() {

    await requireAdministrator();

    const local = captureLocalSnapshot();

    const cloud = await checkCloudConnection();

    const warnings = [];

    if (local.invoiceCount === 0) {

        warnings.push(
            "No existing invoices found in this browser."
        );

    }

    if (cloud.cloudInvoiceCount > 0) {

        warnings.push(
            "Cloud invoices already exist. " +
            "Automatic migration must not overwrite them."
        );

    }

    if (cloud.sequenceConfigured) {

        warnings.push(
            "A cloud invoice sequence already exists."
        );

    }

    if (cloud.paymentConfigured) {

        warnings.push(
            "Cloud payment settings already exist."
        );

    }

    if (cloud.migrationConfigured) {

        warnings.push(
            "A cloud migration record already exists."
        );

    }

    return {

        readyForReview: true,

        migrationPerformed: false,

        localInvoiceCount: local.invoiceCount,

        localStoredSequence: local.storedSequence,

        proposedNextSequence: local.nextSequence,

        cloudInvoiceCount: cloud.cloudInvoiceCount,

        localPaymentSettingsAvailable:

            Object.keys(local.paymentSettings).length > 0,

        cloudConnected: cloud.connected,

        warnings,

        preparedAt: new Date().toISOString()

    };

}


/* =========================================================
   MODULE EXPORTS
   ========================================================= */

export {

    LOCAL_KEYS,

    CLOUD_CONFIG,

    requireAdministrator,

    readLocalInvoices,

    readLocalSequence,

    readLocalPaymentSettings,

    validateInvoiceRecords,

    calculateNextSequence,

    captureLocalSnapshot,

    readCloudInvoices,

    readCloudSetting,

    checkCloudConnection,

    prepareMigration

};


/* =========================================================
   END OF CLOUD INVOICE MANAGEMENT
   MNM LEGAL ASSOCIATES
   ========================================================= */
