
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
   CENTRALIZED CLOUD INVOICE STORAGE
   MNM LEGAL ASSOCIATES
   Version 2.0
   ========================================================= */


/* =========================================================
   CENTRAL BILLING CONFIGURATION
   ========================================================= */

const CENTRAL_BILLING = Object.freeze({

    collection: "invoices",

    settingsCollection: "settings",

    sequenceDocument: "invoiceSequence",

    paymentDocument: "firmPayment",

    prefix: "MNM",

    initialSequence: 1,

    schemaVersion: 4

});


/* =========================================================
   VALIDATE CLOUD INVOICE DATA
   ========================================================= */

function validateCloudInvoice(data) {

    if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
    ) {
        throw new Error("Invalid invoice data.");
    }

    if (!String(data.clientName || "").trim()) {
        throw new Error("Client name is required.");
    }

    if (
        !Array.isArray(data.items) ||
        data.items.length === 0
    ) {
        throw new Error("At least one service is required.");
    }

    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
            data.invoiceDate || ""
        )
    ) {
        throw new Error("Invalid invoice date.");
    }

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
            throw new Error("Invalid service amount.");
        }

    }

    return JSON.parse(JSON.stringify(data));

}


/* =========================================================
   READ CENTRAL INVOICE SEQUENCE
   ========================================================= */

export async function getCentralSequence() {

    await requireAdministrator();

    const reference = doc(
        db,
        CENTRAL_BILLING.settingsCollection,
        CENTRAL_BILLING.sequenceDocument
    );

    const snapshot = await getDocFromServer(reference);

    if (!snapshot.exists()) {

        const records = await readCloudInvoices();

        if (records.length > 0) {
            throw new Error(
                "Cloud invoices exist but the sequence is missing."
            );
        }

        return CENTRAL_BILLING.initialSequence;

    }

    const sequence = snapshot.data().nextSequence;

    if (
        !Number.isSafeInteger(sequence) ||
        sequence < 1
    ) {
        throw new Error("Invalid central invoice sequence.");
    }

    return sequence;

}


/* =========================================================
   CREATE NEW CLOUD INVOICE
   Atomic transaction prevents duplicate numbering.
   ========================================================= */

export async function createCloudInvoice(invoiceData) {

    const administrator = await requireAdministrator();

    const data = validateCloudInvoice(invoiceData);

    const invoiceId = String(
        data.id || crypto.randomUUID()
    );

    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(invoiceId)) {
        throw new Error("Invalid invoice ID.");
    }

    const invoiceRef = doc(
        db,
        CENTRAL_BILLING.collection,
        invoiceId
    );

    const sequenceRef = doc(
        db,
        CENTRAL_BILLING.settingsCollection,
        CENTRAL_BILLING.sequenceDocument
    );

    const startingSequence = await getCentralSequence();

    await runTransaction(db, async transaction => {

        const existingInvoice =
            await transaction.get(invoiceRef);

        if (existingInvoice.exists()) {

            throw new Error(
                "This invoice ID already exists. " +
                "Reopen the saved invoice before continuing."
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
            throw new Error("Invalid invoice sequence.");
        }

        const year = data.invoiceDate.slice(0, 4);

        const invoiceNo =
            CENTRAL_BILLING.prefix + "/" +
            String(sequence).padStart(3, "0") + "/" +
            year;

        const record = {

            ...data,

            id: invoiceId,

            invoiceNo,

            sequenceNumber: sequence,

            schemaVersion:
                CENTRAL_BILLING.schemaVersion,

            revision: 1,

            recordStatus: "active",

            createdBy: administrator.uid,

            updatedBy: administrator.uid,

            createdAt: serverTimestamp(),

            updatedAt: serverTimestamp()

        };

        transaction.set(invoiceRef, record);

        transaction.set(sequenceRef, {

            nextSequence: sequence + 1,

            lastInvoiceNumber: invoiceNo,

            updatedAt: serverTimestamp(),

            updatedBy: administrator.uid

        }, { merge: true });

    });

    const saved = await getDocFromServer(invoiceRef);

    if (!saved.exists()) {
        throw new Error(
            "Cloud invoice confirmation failed. " +
            "Check saved invoices before retrying."
        );
    }

    return saved.data();

}


/* =========================================================
   UPDATE EXISTING CLOUD INVOICE
   Original invoice number remains unchanged.
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
            throw new Error("Invoice does not exist.");
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

        transaction.set(reference, {

            ...existing,

            ...data,

            id: existing.id,

            invoiceNo: existing.invoiceNo,

            sequenceNumber: existing.sequenceNumber,

            createdAt: existing.createdAt,

            createdBy: existing.createdBy,

            recordStatus: existing.recordStatus,

            revision: existing.revision + 1,

            schemaVersion:
                CENTRAL_BILLING.schemaVersion,

            updatedAt: serverTimestamp(),

            updatedBy: administrator.uid

        });

    });

    const saved = await getDocFromServer(reference);

    return saved.data();

}


/* =========================================================
   FETCH ALL CENTRALIZED INVOICES
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

        .sort((a, b) =>

            Number(b.sequenceNumber || 0) -
            Number(a.sequenceNumber || 0)

        );

}


/* =========================================================
   CANCEL INVOICE WITHOUT PERMANENT DELETION
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
            throw new Error("Invoice does not exist.");
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
        throw new Error("Invalid payment settings.");
    }

    const reference = doc(
        db,
        CENTRAL_BILLING.settingsCollection,
        CENTRAL_BILLING.paymentDocument
    );

    await setDoc(reference, {

        ...JSON.parse(JSON.stringify(settings)),

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
   END OF CENTRALIZED CLOUD STORAGE ENGINE
   ========================================================= */

/* =========================================================
   END OF CLOUD INVOICE MANAGEMENT
   MNM LEGAL ASSOCIATES
   ========================================================= */
