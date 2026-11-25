


/* =========================================================
   MNM LEGAL ASSOCIATES
   CENTRALIZED CLOUD INVOICE MANAGEMENT
   Version 3.1 - Monthly Numbering and Payment Reconciliation

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
    setDoc
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

    monthlySequences: "invoiceSequences",

    payment: "firmPayment",

    migration: "invoiceMigration",

    schemaVersion: 1

});


const CENTRAL_BILLING = Object.freeze({

    collection: "invoices",

    settingsCollection: "settings",

    sequenceDocument: "invoiceSequence",

    monthlySequenceCollection: "invoiceSequences",

    paymentDocument: "firmPayment",

    prefix: "MNM",

    initialSequence: 1,

    schemaVersion: 4

});


const MONTH_ABBREVIATIONS = Object.freeze([

    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC"

]);


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
   Legacy migration compatibility only.
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
   LEGACY RECORD VALIDATION
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

            const legacyMatch = invoiceNo.match(
                /^MNM\/(\d+)\/\d{4}$/
            );

            const monthlyMatch = invoiceNo.match(
                /^MNM\/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\/(\d+)\/\d{4}$/
            );

            const sequence = legacyMatch

                ? Number(legacyMatch[1])

                : monthlyMatch

                    ? Number(monthlyMatch[2])

                    : 0;

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
   LEGACY SEQUENCE CALCULATION
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
            "A legacy cloud invoice sequence already exists."
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
   INDIAN STANDARD TIME DATE
   ========================================================= */

export function getIndianDate() {

    const parts = new Intl.DateTimeFormat("en-GB", {

        timeZone: "Asia/Kolkata",

        year: "numeric",

        month: "2-digit",

        day: "2-digit"

    }).formatToParts(new Date());

    const year = parts.find(
        part => part.type === "year"
    ).value;

    const month = parts.find(
        part => part.type === "month"
    ).value;

    const day = parts.find(
        part => part.type === "day"
    ).value;

    return `${year}-${month}-${day}`;

}


/* =========================================================
   BILLING PERIOD VALIDATION
   ========================================================= */

export function getBillingPeriod(invoiceDate) {

    if (
        typeof invoiceDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)
    ) {

        throw new Error(
            "Invalid invoice date."
        );

    }

    const date = new Date(
        invoiceDate + "T00:00:00Z"
    );

    if (
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== invoiceDate
    ) {

        throw new Error(
            "Invalid calendar date."
        );

    }

    const year = invoiceDate.slice(0, 4);

    const month = Number(
        invoiceDate.slice(5, 7)
    );

    const abbreviation =
        MONTH_ABBREVIATIONS[month - 1];

    return {

        year,

        month,

        abbreviation,

        monthId: invoiceDate.slice(0, 7)

    };

}


/* =========================================================
   MONTHLY INVOICE NUMBER FORMAT

   MNM/NOV/001/2026
   MNM/DEC/001/2026
   MNM/JAN/001/2027
   ========================================================= */

export function formatMonthlyInvoiceNumber(
    sequence,
    invoiceDate
) {

    if (
        !Number.isSafeInteger(sequence) ||
        sequence < 1
    ) {

        throw new Error(
            "Invalid invoice sequence."
        );

    }

    const period = getBillingPeriod(invoiceDate);

    return [

        CENTRAL_BILLING.prefix,

        period.abbreviation,

        String(sequence).padStart(3, "0"),

        period.year

    ].join("/");

}


/* =========================================================
   VALIDATE CLOUD INVOICE DATA
   ========================================================= */

function validateCloudInvoice(data) {

    if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
    ) {

        throw new Error(
            "Invalid invoice data."
        );

    }

    if (!String(data.clientName || "").trim()) {

        throw new Error(
            "Client name is required."
        );

    }

    if (
        !Array.isArray(data.items) ||
        data.items.length === 0
    ) {

        throw new Error(
            "At least one service is required."
        );

    }

    getBillingPeriod(data.invoiceDate);

    for (const item of data.items) {

        const quantity = Number(
            item.quantity ?? item.qty
        );

        const rate = Number(item.rate);

        if (
            !Number.isFinite(quantity) ||
            quantity <= 0 ||
            !Number.isFinite(rate) ||
            rate < 0
        ) {

            throw new Error(
                "Invalid service amount."
            );

        }

    }

    return JSON.parse(
        JSON.stringify(data)
    );

}


/* =========================================================
   INITIAL MONTHLY SEQUENCE

   Existing legacy invoices remain unchanged.
   Existing cancelled invoices are also counted.
   ========================================================= */

async function getInitialMonthlySequence(period) {

    const records = await readCloudInvoices();

    let highestMonthlySequence = 0;

    let legacyInvoiceCount = 0;

    for (const entry of records) {

        const record = entry.data;

        if (
            typeof record.invoiceDate !== "string" ||
            record.invoiceDate.slice(0, 7) !== period.monthId
        ) {

            continue;

        }

        const invoiceNo = String(
            record.invoiceNo || ""
        );

        const monthlyMatch = invoiceNo.match(

            /^MNM\/([A-Z]{3})\/(\d+)\/(\d{4})$/

        );

        if (monthlyMatch) {

            if (
                monthlyMatch[1] !== period.abbreviation ||
                monthlyMatch[3] !== period.year
            ) {

                throw new Error(
                    "Existing invoice billing period mismatch."
                );

            }

            const sequence = Number(
                monthlyMatch[2]
            );

            if (
                !Number.isSafeInteger(sequence) ||
                sequence < 1
            ) {

                throw new Error(
                    "Invalid existing invoice sequence."
                );

            }

            highestMonthlySequence = Math.max(

                highestMonthlySequence,

                sequence

            );

            continue;

        }

        const legacyMatch = invoiceNo.match(

            /^MNM\/(\d+)\/(\d{4})$/

        );

        if (legacyMatch) {

            legacyInvoiceCount++;

        } else {

            throw new Error(
                "Unsupported existing invoice number: " +
                invoiceNo
            );

        }

    }

    const nextSequence = Math.max(

        CENTRAL_BILLING.initialSequence,

        highestMonthlySequence + 1,

        legacyInvoiceCount + 1

    );

    if (
        !Number.isSafeInteger(nextSequence) ||
        nextSequence >= Number.MAX_SAFE_INTEGER
    ) {

        throw new Error(
            "Monthly invoice sequence exceeds supported limit."
        );

    }

    return nextSequence;

}


/* =========================================================
   READ CENTRALIZED MONTHLY SEQUENCE
   ========================================================= */

export async function getCentralSequence(
    invoiceDate = getIndianDate()
) {

    await requireAdministrator();

    const period = getBillingPeriod(invoiceDate);

    const reference = doc(

        db,

        CENTRAL_BILLING.monthlySequenceCollection,

        period.monthId

    );

    const snapshot = await getDocFromServer(reference);

    if (!snapshot.exists()) {

        return await getInitialMonthlySequence(period);

    }

    const sequence = snapshot.data().nextSequence;

    if (
        !Number.isSafeInteger(sequence) ||
        sequence < 1 ||
        sequence >= Number.MAX_SAFE_INTEGER
    ) {

        throw new Error(
            "Invalid monthly invoice sequence."
        );

    }

    return sequence;

}


/* =========================================================
   READ ALL MONTHLY COUNTERS
   Useful for independent cloud backup.
   ========================================================= */

export async function fetchMonthlySequences() {

    await requireAdministrator();

    const reference = collection(

        db,

        CENTRAL_BILLING.monthlySequenceCollection

    );

    const snapshot = await getDocsFromServer(reference);

    return snapshot.docs.map(item => ({

        ...item.data(),

        monthId: item.id

    }));

}


/* =========================================================
   CREATE NEW MONTHLY CLOUD INVOICE

   Invoice record and monthly sequence are written
   together using an atomic Firestore transaction.
   ========================================================= */

export async function createCloudInvoice(invoiceData) {

    const administrator = await requireAdministrator();

    const data = validateCloudInvoice(invoiceData);

    const period = getBillingPeriod(data.invoiceDate);

    const invoiceId = String(

        data.id || crypto.randomUUID()

    );

    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(invoiceId)) {

        throw new Error(
            "Invalid invoice ID."
        );

    }


    /* INVOICE DOCUMENT */

    const invoiceRef = doc(

        db,

        CENTRAL_BILLING.collection,

        invoiceId

    );


    /* MONTHLY COUNTER DOCUMENT */

    const sequenceRef = doc(

        db,

        CENTRAL_BILLING.monthlySequenceCollection,

        period.monthId

    );


    /* INITIAL MONTHLY COUNTER */

    const startingSequence = await getCentralSequence(

        data.invoiceDate

    );


    /* ATOMIC TRANSACTION */

    await runTransaction(db, async transaction => {

        const existingInvoice =
            await transaction.get(invoiceRef);

        if (existingInvoice.exists()) {

            throw new Error(

                "This invoice already exists. " +

                "Please reopen it from Saved Invoices."

            );

        }

        const sequenceSnapshot =
            await transaction.get(sequenceRef);

        const sequence = sequenceSnapshot.exists()

            ? sequenceSnapshot.data().nextSequence

            : startingSequence;

        if (
            !Number.isSafeInteger(sequence) ||
            sequence < 1 ||
            sequence >= Number.MAX_SAFE_INTEGER
        ) {

            throw new Error(
                "Invalid monthly invoice sequence."
            );

        }


        /* FINAL INVOICE NUMBER */

        const invoiceNo = formatMonthlyInvoiceNumber(

            sequence,

            data.invoiceDate

        );


        /* INVOICE RECORD */

        const record = {

            ...data,

            id: invoiceId,

            invoiceNo,

            sequenceNumber: sequence,

            billingMonth: period.monthId,

            billingMonthName: period.abbreviation,

            billingYear: Number(period.year),

            numberingFormat: "MONTHLY",

            schemaVersion:
                CENTRAL_BILLING.schemaVersion,

            revision: 1,

            recordStatus: "active",

            createdBy: administrator.uid,

            updatedBy: administrator.uid,

            createdAt: serverTimestamp(),

            updatedAt: serverTimestamp()

        };


        /* SAVE INVOICE RECORD */

        transaction.set(

            invoiceRef,

            record

        );


        /* ADVANCE MONTHLY COUNTER */

        transaction.set(

            sequenceRef,

            {

                monthId: period.monthId,

                month: period.abbreviation,

                year: Number(period.year),

                nextSequence: sequence + 1,

                lastInvoiceNumber: invoiceNo,

                lastInvoiceId: invoiceId,

                updatedAt: serverTimestamp(),

                updatedBy: administrator.uid

            },

            { merge: true }

        );

    });


    /* VERIFY CLOUD SAVE */

    const saved = await getDocFromServer(invoiceRef);

    if (!saved.exists()) {

        throw new Error(

            "Cloud invoice confirmation failed. " +

            "Check Saved Invoices before retrying."

        );

    }

    return saved.data();

}


/* =========================================================
   UPDATE EXISTING CLOUD INVOICE

   Original invoice number, date and billing period
   remain unchanged.
   ========================================================= */

export async function updateCloudInvoice(

    invoiceId,

    invoiceData,

    expectedRevision

) {

    const administrator = await requireAdministrator();

    const data = validateCloudInvoice(invoiceData);

    const reference = doc(

        db,

        CENTRAL_BILLING.collection,

        String(invoiceId)

    );

    await runTransaction(db, async transaction => {

        const snapshot =
            await transaction.get(reference);

        if (!snapshot.exists()) {

            throw new Error(
                "Invoice does not exist."
            );

        }

        const existing = snapshot.data();

        if (existing.recordStatus === "cancelled") {

            throw new Error(
                "Cancelled invoices cannot be modified."
            );

        }

        if (
            !Number.isSafeInteger(expectedRevision) ||
            existing.revision !== expectedRevision
        ) {

            throw new Error(

                "Invoice was modified elsewhere. " +

                "Please reopen it before updating."

            );

        }

        if (data.invoiceDate !== existing.invoiceDate) {

            throw new Error(
                "The original invoice date cannot be changed."
            );

        }


        /* PRESERVE ORIGINAL NUMBERING METADATA */

        const updatedRecord = {

            ...existing,

            ...data,

            id: existing.id,

            invoiceNo: existing.invoiceNo,

            invoiceDate: existing.invoiceDate,

            sequenceNumber: existing.sequenceNumber,

            createdAt: existing.createdAt,

            createdBy: existing.createdBy,

            recordStatus: existing.recordStatus,

            revision: existing.revision + 1,

            schemaVersion:
                CENTRAL_BILLING.schemaVersion,

            updatedAt: serverTimestamp(),

            updatedBy: administrator.uid

        };

        for (const field of [

            "billingMonth",

            "billingMonthName",

            "billingYear",

            "numberingFormat"

        ]) {

            if (
                Object.prototype.hasOwnProperty.call(
                    existing,
                    field
                )
            ) {

                updatedRecord[field] = existing[field];

            } else {

                delete updatedRecord[field];

            }

        }

        transaction.set(

            reference,

            updatedRecord

        );

    });

    const saved = await getDocFromServer(reference);

    if (!saved.exists()) {

        throw new Error(
            "Invoice update confirmation failed."
        );

    }

    return saved.data();

}


/* =========================================================
   FETCH ALL CENTRALIZED INVOICES

   Latest invoice date first.
   Monthly sequence used within the same date.
   ========================================================= */

export async function fetchCentralInvoices() {

    await requireAdministrator();

    const reference = collection(

        db,

        CENTRAL_BILLING.collection

    );

    const snapshot = await getDocsFromServer(reference);

    return snapshot.docs

        .map(item => ({

            ...item.data(),

            id: item.id

        }))

        .sort((a, b) => {

            const dateComparison = String(
                b.invoiceDate || ""
            ).localeCompare(
                String(a.invoiceDate || "")
            );

            if (dateComparison !== 0) {

                return dateComparison;

            }

            return Number(b.sequenceNumber || 0) -

                Number(a.sequenceNumber || 0);

        });

}


/* =========================================================
   CANCEL INVOICE WITHOUT PERMANENT DELETION

   Cancelled invoice numbers are never reused
   through the normal application workflow.
   ========================================================= */

export async function cancelCloudInvoice(

    invoiceId,

    reason,

    expectedRevision

) {

    const administrator = await requireAdministrator();

    const cancellationReason =
        String(reason || "").trim();

    if (!cancellationReason) {

        throw new Error(
            "Cancellation reason is required."
        );

    }

    const reference = doc(

        db,

        CENTRAL_BILLING.collection,

        String(invoiceId)

    );

    await runTransaction(db, async transaction => {

        const snapshot =
            await transaction.get(reference);

        if (!snapshot.exists()) {

            throw new Error(
                "Invoice does not exist."
            );

        }

        const existing = snapshot.data();

        if (existing.recordStatus === "cancelled") {

            throw new Error(
                "Invoice is already cancelled."
            );

        }

        if (existing.revision !== expectedRevision) {

            throw new Error(
                "Invoice was modified elsewhere. Reopen it."
            );

        }

        transaction.update(reference, {

            recordStatus: "cancelled",

            cancellationReason,

            cancelledAt: serverTimestamp(),

            cancelledBy: administrator.uid,

            revision: existing.revision + 1,

            updatedAt: serverTimestamp(),

            updatedBy: administrator.uid

        });

    });

    return true;

}


/* =========================================================
   CENTRALIZED PAYMENT SETTINGS
   ========================================================= */

export async function saveCentralPaymentSettings(settings) {

    const administrator = await requireAdministrator();

    if (
        !settings ||
        typeof settings !== "object" ||
        Array.isArray(settings)
    ) {

        throw new Error(
            "Invalid payment settings."
        );

    }

    const reference = doc(

        db,

        CENTRAL_BILLING.settingsCollection,

        CENTRAL_BILLING.paymentDocument

    );

    await setDoc(reference, {

        ...JSON.parse(
            JSON.stringify(settings)
        ),

        updatedAt: serverTimestamp(),

        updatedBy: administrator.uid

    });

    return true;

}


export async function getCentralPaymentSettings() {

    await requireAdministrator();

    const reference = doc(

        db,

        CENTRAL_BILLING.settingsCollection,

        CENTRAL_BILLING.paymentDocument

    );

    const snapshot = await getDocFromServer(reference);

    return snapshot.exists()

        ? snapshot.data()

        : {};

}


/* =========================================================
   END OF MONTHLY CLOUD INVOICE MANAGEMENT

   MNM LEGAL ASSOCIATES
   Justice, Integrity & Excellence
   ========================================================= */


/* Read-only integration. Existing invoice snapshots remain unchanged. */
import {
    fetchTransactions,
    fetchInvoiceLinks,
    calculateInvoiceReceipts
} from "./finance-cloud.js";

function reconciliationNumber(value) {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n) || n < 0) {
        throw new Error("Invalid invoice amount.");
    }
    return n;
}

function reconciliationInteger(n) {
    if (!Number.isSafeInteger(n)) {
        throw new Error("Invoice amount exceeds supported limit.");
    }
    return n;
}

function reconciliationPaise(value) {
    return reconciliationInteger(Math.round(reconciliationNumber(value) * 100));
}

export function calculateInvoiceReconciliation(invoice, rows, link = null) {
    if (!invoice?.id || !Array.isArray(invoice.items) || !Array.isArray(rows)) {
        throw new Error("Invoice and complete financial ledger are required.");
    }
    if (link && link.invoiceId !== invoice.id) {
        throw new Error("Invoice association mismatch.");
    }
    const subtotalPaise = invoice.items.reduce((sum, item) => {
        const line = reconciliationInteger(Math.round(
            reconciliationNumber(item.quantity ?? item.qty ?? 1) * reconciliationPaise(item.rate)
        ));
        return reconciliationInteger(sum + line);
    }, 0);
    const totalPaise = Math.max(0, subtotalPaise - reconciliationPaise(invoice.discountAmount));
    const snapshotReceivedPaise = reconciliationInteger(
        reconciliationPaise(invoice.receivedEarlier) +
        reconciliationPaise(invoice.receivedNow ?? invoice.amountPaid)
    );
    const ledgerReceivedPaise = reconciliationInteger(calculateInvoiceReceipts(invoice.id, rows));
    const differencePaise = reconciliationInteger(snapshotReceivedPaise - ledgerReceivedPaise);
    return {
        invoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo,
        recordStatus: invoice.recordStatus,
        clientId: link?.clientId ?? "",
        caseId: link?.caseId ?? "",
        linked: Boolean(link),
        totalPaise,
        snapshotReceivedPaise,
        ledgerReceivedPaise,
        differencePaise,
        snapshotOutstandingPaise: Math.max(0, totalPaise - snapshotReceivedPaise),
        ledgerOutstandingPaise: reconciliationInteger(Math.max(0, totalPaise - ledgerReceivedPaise)),
        reconciliationStatus: !link ? "unlinked" : differencePaise === 0 ? "amounts_match" : "difference_detected",
        reconciliationConfirmed: false,
        paymentHistory: rows.filter(row => row.invoiceId === invoice.id)
    };
}

export async function fetchInvoiceReconciliation() {
    await requireAdministrator();
    const uid = auth.currentUser?.uid;
    const [invoices, rows, links] = await Promise.all([
        fetchCentralInvoices(), fetchTransactions(), fetchInvoiceLinks()
    ]);
    await requireAdministrator();
    if (!uid || auth.currentUser?.uid !== uid) throw new Error("Session changed.");
    const linkMap = new Map(links.map(link => [link.invoiceId, link]));
    return invoices.map(invoice => calculateInvoiceReconciliation(invoice, rows, linkMap.get(invoice.id) ?? null));
}

export async function getInvoiceReconciliation(invoiceId) {
    if (typeof invoiceId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(invoiceId)) {
        throw new Error("Invalid invoice ID.");
    }
    const result = (await fetchInvoiceReconciliation()).find(item => item.invoiceId === invoiceId);
    if (!result) throw new Error("Invoice not found.");
    return result;
}

