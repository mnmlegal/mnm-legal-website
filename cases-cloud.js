
/* =========================================================
   MNM LEGAL ASSOCIATES
   LEGAL PRACTICE MANAGEMENT SYSTEM

   CASE MANAGEMENT - CLOUD ENGINE
   Version 1.0

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
    deleteField,
    query,
    where,
    orderBy
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";


/* =========================================================
   01. MODULE CONFIGURATION
   ========================================================= */

export const CASE_CONFIG = Object.freeze({

    collection: "cases",
    sequenceCollection: "caseSequences",
    clientCollection: "clients",
    proceedingCollection: "proceedings",
    taskCollection: "tasks",
    activityCollection: "activities",
    linkedClientCollection: "linkedClients",

    prefix: "MNM/CASE",
    initialSequence: 1,
    backupVersion: 1,
    timeZone: "Asia/Kolkata"

});


export const MATTER_TYPES = Object.freeze({

    litigation: "Litigation",
    non_litigation: "Non-Litigation"

});


export const CASE_STATUSES = Object.freeze({

    pre_litigation: "Pre-Litigation",
    drafting: "Drafting",
    ready_for_filing: "Ready for Filing",
    filed: "Filed",
    pending: "Pending",
    stayed: "Stayed",
    reserved_for_judgment: "Reserved for Judgment",
    disposed: "Disposed",
    settled: "Settled",
    withdrawn: "Withdrawn",
    closed: "Closed",
    archived: "Archived"

});


export const CASE_PRIORITIES = Object.freeze({

    normal: "Normal",
    high: "High",
    urgent: "Urgent"

});


export const PRACTICE_AREAS = Object.freeze([

    "Civil Litigation",
    "Criminal Litigation",
    "Family & Matrimonial",
    "Property Disputes",
    "Cheque Bounce",
    "Consumer Disputes",
    "Money Recovery",
    "DRT / SARFAESI",
    "RERA",
    "Labour & Employment",
    "Trademark",
    "Copyright",
    "Intellectual Property",
    "Constitutional Matters",
    "Arbitration",
    "Commercial Disputes",
    "Legal Notice",
    "Legal Documentation",
    "Corporate Advisory",
    "Other"

]);


export const CLIENT_CAPACITIES = Object.freeze([

    "Petitioner",
    "Respondent",
    "Plaintiff",
    "Defendant",
    "Complainant",
    "Accused",
    "Applicant",
    "Appellant",
    "Opposite Party",
    "Claimant",
    "Decree Holder",
    "Judgment Debtor",
    "Informant",
    "Intervenor",
    "Notice Sender",
    "Notice Recipient",
    "Consultation Client",
    "Other"

]);


export const TASK_TYPES = Object.freeze({

    drafting: "Drafting",
    filing: "Filing",
    documentation: "Documentation",
    evidence: "Evidence Collection",
    research: "Legal Research",
    compliance: "Compliance",
    client_followup: "Client Follow-up",
    court_appearance: "Court Appearance",
    payment_followup: "Payment Follow-up",
    other: "Other"

});


export const TASK_STATUSES = Object.freeze({

    pending: "Pending",
    in_progress: "In Progress",
    completed: "Completed",
    cancelled: "Cancelled"

});


export const CASE_ACTIVITY_TYPES = Object.freeze({

    registration: "Case Registration",
    profile_update: "Case Profile Updated",
    status_change: "Case Status Changed",
    hearing_update: "Hearing Updated",
    proceeding_added: "Proceedings Recorded",
    task_created: "Task Created",
    task_updated: "Task Updated",
    task_completed: "Task Completed",
    task_cancelled: "Task Cancelled",
    client_linked: "Additional Client Linked",
    client_unlinked: "Client Association Deactivated",
    consultation: "Consultation",
    phone_call: "Phone Call",
    email: "Email",
    meeting: "Meeting",
    whatsapp: "WhatsApp",
    note: "Confidential Note",
    closure: "Case Closed",
    archive: "Case Archived",
    reactivate: "Case Reactivated"

});


const CLOSED_STATUSES = Object.freeze([

    "disposed",
    "settled",
    "withdrawn",
    "closed"

]);


const MANUAL_ACTIVITY_TYPES = Object.freeze([

    "consultation",
    "phone_call",
    "email",
    "meeting",
    "whatsapp",
    "note"

]);


/* =========================================================
   02. ADMINISTRATOR AUTHORIZATION
   ========================================================= */

async function requireAdministrator() {

    await auth.authStateReady();

    const user = auth.currentUser;

    if (!user?.uid) {

        throw new Error(
            "Please sign in to access Case Management."
        );

    }

    const profile = await verifyStaffAccess(user);

    if (
        !profile ||
        profile.active !== true ||
        profile.role !== "admin"
    ) {

        throw new Error(
            "Administrator authorization is required."
        );

    }

    assertSession(user.uid);

    return {

        ...profile,
        uid: user.uid

    };

}


function assertSession(uid) {

    if (auth.currentUser?.uid !== uid) {

        throw new Error(
            "Your authentication session has changed."
        );

    }

}


/* =========================================================
   03. DATE AND TIME UTILITIES
   ========================================================= */

export function getIndianDate(date = new Date()) {

    const parts = new Intl.DateTimeFormat("en-GB", {

        timeZone: CASE_CONFIG.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"

    }).formatToParts(date);

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


function addCalendarDays(date, days) {

    const value = new Date(date + "T00:00:00Z");

    value.setUTCDate(value.getUTCDate() + days);

    return value.toISOString().slice(0, 10);

}


function timestampMillis(value) {

    if (typeof value?.toMillis === "function") {

        return value.toMillis();

    }

    return 0;

}


/* =========================================================
   04. VALIDATION UTILITIES
   ========================================================= */

function cleanText(value, maxLength = 250, label = "Text") {

    const text = String(value ?? "").trim();

    if (text.length > maxLength) {

        throw new Error(
            `${label} cannot exceed ${maxLength} characters.`
        );

    }

    return text;

}


function requiredText(value, maxLength, label) {

    const text = cleanText(value, maxLength, label);

    if (!text) {

        throw new Error(`${label} is required.`);

    }

    return text;

}


function cleanDate(value, label = "Date") {

    const date = cleanText(value, 10, label);

    if (!date) return "";

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {

        throw new Error(`Invalid ${label.toLowerCase()}.`);

    }

    const parsed = new Date(date + "T00:00:00Z");

    if (
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== date
    ) {

        throw new Error(`Invalid calendar date: ${label}.`);

    }

    return date;

}


function validateDocumentId(value) {

    const id = String(value ?? "");

    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {

        throw new Error("Invalid document identifier.");

    }

    return id;

}


function validateRevision(value) {

    if (!Number.isSafeInteger(value) || value < 1) {

        throw new Error("Invalid record revision.");

    }

    return value;

}


function validateYear(value) {

    const year = String(value);

    if (!/^\d{4}$/.test(year)) {

        throw new Error("Invalid registration year.");

    }

    return year;

}


function validateEnum(value, options, label) {

    if (!Object.prototype.hasOwnProperty.call(options, value)) {

        throw new Error(`Invalid ${label.toLowerCase()}.`);

    }

    return value;

}


function cleanCNR(value) {

    const cnr = String(value ?? "")
        .trim()
        .replace(/[\s-]/g, "")
        .toUpperCase();

    if (cnr && !/^[A-Z0-9]{16}$/.test(cnr)) {

        throw new Error(
            "CNR number must contain exactly 16 alphanumeric characters."
        );

    }

    return cnr;

}


function ensureRevision(record, expectedRevision) {

    validateRevision(expectedRevision);

    if (record.revision !== expectedRevision) {

        throw new Error(
            "This record has been modified elsewhere. " +
            "Refresh the record before continuing."
        );

    }

}


function ensureWritableCase(record) {

    if (record.status === "archived") {

        throw new Error(
            "Archived cases must be reactivated before modification."
        );

    }

}


function isClosedCase(record) {

    return CLOSED_STATUSES.includes(record.status);

}


function snapshotRecord(snapshot) {

    return {

        ...snapshot.data(),
        id: snapshot.id

    };

}


function requireExisting(snapshot, label) {

    if (!snapshot.exists()) {

        throw new Error(`${label} was not found.`);

    }

    return snapshotRecord(snapshot);

}


/* =========================================================
   05. FIRESTORE REFERENCES
   ========================================================= */

function casesCollection() {

    return collection(db, CASE_CONFIG.collection);

}


function caseRef(caseId) {

    return doc(

        db,
        CASE_CONFIG.collection,
        validateDocumentId(caseId)

    );

}


function clientRef(clientId) {

    return doc(

        db,
        CASE_CONFIG.clientCollection,
        validateDocumentId(clientId)

    );

}


function sequenceRef(year) {

    return doc(

        db,
        CASE_CONFIG.sequenceCollection,
        validateYear(year)

    );

}


function childCollection(caseId, name) {

    return collection(caseRef(caseId), name);

}


function childRef(caseId, name, id) {

    return doc(

        childCollection(caseId, name),
        validateDocumentId(id)

    );

}


export function generateCaseId() {

    return crypto.randomUUID();

}


export function generateRecordId() {

    return crypto.randomUUID();

}


/* =========================================================
   06. CASE NUMBER GENERATION
   ========================================================= */

export function formatCaseCode(sequence, year) {

    if (!Number.isSafeInteger(sequence) || sequence < 1) {

        throw new Error("Invalid case sequence number.");

    }

    return [

        CASE_CONFIG.prefix,
        String(sequence).padStart(3, "0"),
        validateYear(year)

    ].join("/");

}


function readSequence(snapshot) {

    if (!snapshot.exists()) {

        return CASE_CONFIG.initialSequence;

    }

    const sequence = snapshot.data().nextSequence;

    if (!Number.isSafeInteger(sequence) || sequence < 2) {

        throw new Error(
            "Case numbering counter is invalid. Contact the administrator."
        );

    }

    return sequence;

}


export async function getNextCaseSequence(

    year = getRegistrationYear()

) {

    const admin = await requireAdministrator();

    const snapshot = await getDocFromServer(

        sequenceRef(year)

    );

    assertSession(admin.uid);

    return readSequence(snapshot);

}


export async function getNextCaseCode(

    year = getRegistrationYear()

) {

    const sequence = await getNextCaseSequence(year);

    return formatCaseCode(sequence, year);

}


/* =========================================================
   07. COMPLETE CASE DATA VALIDATION
   ========================================================= */

export function validateCaseData(input = {}) {

    const data = {

        clientId: validateDocumentId(input.clientId),

        caseTitle: requiredText(
            input.caseTitle, 500, "Case title"
        ),

        matterType: validateEnum(
            input.matterType ?? "litigation",
            MATTER_TYPES,
            "Matter type"
        ),

        clientCapacity: requiredText(
            input.clientCapacity, 100, "Client capacity"
        ),

        practiceArea: requiredText(
            input.practiceArea, 150, "Practice area"
        ),

        natureOfProceedings: cleanText(
            input.natureOfProceedings, 250
        ),

        applicableLaw: cleanText(
            input.applicableLaw, 5000
        ),

        courtName: cleanText(input.courtName, 300),

        courtCity: cleanText(input.courtCity, 150),

        courtNumber: cleanText(input.courtNumber, 100),

        caseNumber: cleanText(input.caseNumber, 150),

        cnrNumber: cleanCNR(input.cnrNumber),

        filingNumber: cleanText(input.filingNumber, 150),

        filingDate: cleanDate(
            input.filingDate, "Filing date"
        ),

        courtRegistrationDate: cleanDate(
            input.courtRegistrationDate,
            "Court registration date"
        ),

        presidingJudge: cleanText(
            input.presidingJudge, 250
        ),

        oppositeParty: cleanText(
            input.oppositeParty, 3000
        ),

        oppositePartyAdvocate: cleanText(
            input.oppositePartyAdvocate, 500
        ),

        oppositePartyAddress: cleanText(
            input.oppositePartyAddress, 5000
        ),

        assignedAdvocate: cleanText(
            input.assignedAdvocate, 250
        ),

        engagementDate: cleanDate(
            input.engagementDate, "Engagement date"
        ),

        status: validateEnum(
            input.status ?? "drafting",
            CASE_STATUSES,
            "Case status"
        ),

        priority: validateEnum(
            input.priority ?? "normal",
            CASE_PRIORITIES,
            "Priority"
        ),

        currentStage: cleanText(
            input.currentStage, 500
        ),

        nextHearingDate: cleanDate(
            input.nextHearingDate, "Next hearing date"
        ),

        nextHearingPurpose: cleanText(
            input.nextHearingPurpose, 500
        ),

        limitationDate: cleanDate(
            input.limitationDate, "Limitation date"
        ),

        briefFacts: cleanText(input.briefFacts, 30000),

        reliefsSought: cleanText(
            input.reliefsSought, 20000
        ),

        legalStrategy: cleanText(
            input.legalStrategy, 30000
        ),

        pendingWork: cleanText(
            input.pendingWork, 10000
        ),

        notes: cleanText(input.notes, 20000),

        disposalDate: cleanDate(
            input.disposalDate, "Disposal date"
        ),

        disposalOutcome: cleanText(
            input.disposalOutcome, 10000
        ),

        closureReason: cleanText(
            input.closureReason, 5000
        )

    };


    if (
        data.filingDate &&
        data.courtRegistrationDate &&
        data.courtRegistrationDate < data.filingDate
    ) {

        throw new Error(
            "Court registration date cannot precede filing date."
        );

    }


    if (
        data.filingDate &&
        data.disposalDate &&
        data.disposalDate < data.filingDate
    ) {

        throw new Error(
            "Disposal date cannot precede filing date."
        );

    }


    if (CLOSED_STATUSES.includes(data.status)) {

        if (!data.disposalDate) {

            throw new Error(
                "Disposal or closure date is required."
            );

        }

        if (!data.closureReason && !data.disposalOutcome) {

            throw new Error(
                "Please record the closure reason or disposal outcome."
            );

        }

        if (data.disposalDate > getIndianDate()) {

            throw new Error(
                "Disposal date cannot be in the future."
            );

        }

        data.nextHearingDate = "";
        data.nextHearingPurpose = "";

    }

    return data;

}


/* =========================================================
   08. INTERNAL ACTIVITY WRITER
   ========================================================= */

function writeActivity(

    transaction,
    caseId,
    uid,
    type,
    description,
    activityId = generateRecordId()

) {

    validateEnum(
        type,
        CASE_ACTIVITY_TYPES,
        "Activity type"
    );

    const reference = childRef(

        caseId,
        CASE_CONFIG.activityCollection,
        activityId

    );

    transaction.set(reference, {

        caseId,

        type,

        description: requiredText(
            description, 10000, "Activity description"
        ),

        createdAt: serverTimestamp(),

        createdBy: uid

    });

    return reference.id;

}


function updateMetadata(record, uid) {

    return {

        revision: record.revision + 1,

        updatedAt: serverTimestamp(),

        updatedBy: uid

    };

}


/* =========================================================
   09. FETCH REGISTERED CLIENTS
   ========================================================= */

export async function fetchCaseClients({

    includeArchived = false

} = {}) {

    const admin = await requireAdministrator();

    const snapshot = await getDocsFromServer(

        collection(db, CASE_CONFIG.clientCollection)

    );

    assertSession(admin.uid);

    return snapshot.docs

        .map(snapshotRecord)

        .filter(client =>

            includeArchived ||
            client.status !== "archived"

        )

        .map(client => ({

            id: client.id,

            clientCode: client.clientCode,

            fullName: client.fullName,

            clientType: client.clientType,

            mobile: client.mobile || "",

            email: client.email || "",

            assignedAdvocate: client.assignedAdvocate || "",

            status: client.status

        }))

        .sort((a, b) =>

            String(a.fullName).localeCompare(
                String(b.fullName)
            )

        );

}


/* =========================================================
   10. CREATE NEW CASE
   ATOMIC NUMBERING TRANSACTION
   ========================================================= */

export async function createCase(

    input,
    requestedId = generateCaseId()

) {

    const admin = await requireAdministrator();

    const data = validateCaseData(input);

    const caseId = validateDocumentId(requestedId);

    if (data.status === "archived") {

        throw new Error(
            "A new case cannot be registered as archived."
        );

    }

    const year = getRegistrationYear();

    const reference = caseRef(caseId);

    const counterReference = sequenceRef(year);

    const primaryClientReference = clientRef(data.clientId);

    const activityId = generateRecordId();


    await runTransaction(db, async transaction => {

        assertSession(admin.uid);


        // All reads must precede writes.

        const existing = await transaction.get(reference);

        const counter = await transaction.get(counterReference);

        const client = await transaction.get(
            primaryClientReference
        );


        if (existing.exists()) {

            throw new Error(
                "This case ID already exists. " +
                "Check the case directory before retrying."
            );

        }


        if (!client.exists()) {

            throw new Error(
                "The selected client does not exist."
            );

        }


        if (client.data().status === "archived") {

            throw new Error(
                "An archived client cannot register a new case."
            );

        }


        const sequence = readSequence(counter);

        const caseCode = formatCaseCode(sequence, year);


        transaction.set(reference, {

            ...data,

            id: caseId,

            caseCode,

            sequenceNumber: sequence,

            registrationYear: year,

            createdAt: serverTimestamp(),

            createdBy: admin.uid,

            updatedAt: serverTimestamp(),

            updatedBy: admin.uid,

            revision: 1

        });


        transaction.set(counterReference, {

            year,

            nextSequence: sequence + 1,

            lastCaseId: caseId,

            lastCaseCode: caseCode,

            updatedAt: serverTimestamp(),

            updatedBy: admin.uid

        });


        writeActivity(

            transaction,

            caseId,

            admin.uid,

            "registration",

            `Case registered successfully: ${caseCode}`,

            activityId

        );

    });


    return getCase(caseId);

}


/* =========================================================
   11. FETCH CASE RECORDS
   ========================================================= */

export async function getCase(caseId) {

    const admin = await requireAdministrator();

    const snapshot = await getDocFromServer(

        caseRef(caseId)

    );

    assertSession(admin.uid);

    return requireExisting(snapshot, "Case record");

}


export async function fetchCases({

    includeArchived = false

} = {}) {

    const admin = await requireAdministrator();

    const snapshot = await getDocsFromServer(

        casesCollection()

    );

    assertSession(admin.uid);

    return snapshot.docs

        .map(snapshotRecord)

        .filter(record =>

            includeArchived ||
            record.status !== "archived"

        )

        .sort((a, b) =>

            Number(b.registrationYear) -
            Number(a.registrationYear)

            ||

            b.sequenceNumber - a.sequenceNumber

        );

}


/* =========================================================
   12. FETCH CASES ASSOCIATED WITH A CLIENT

   Includes primary and active additional associations.
   ========================================================= */

export async function fetchCasesByClient(

    clientId,

    {

        includeArchived = false,

        includeAdditional = true

    } = {}

) {

    const admin = await requireAdministrator();

    const id = validateDocumentId(clientId);

    const primarySnapshot = await getDocsFromServer(

        query(

            casesCollection(),

            where("clientId", "==", id)

        )

    );

    const records = new Map();

    primarySnapshot.docs.forEach(snapshot => {

        const record = snapshotRecord(snapshot);

        if (
            includeArchived ||
            record.status !== "archived"
        ) {

            records.set(record.id, {

                ...record,

                associationType: "primary",

                associationCapacity: record.clientCapacity

            });

        }

    });


    if (includeAdditional) {

        const allCases = await fetchCases({

            includeArchived

        });


        // Sequential reads avoid unbounded parallel requests.

        for (const record of allCases) {

            if (records.has(record.id)) continue;

            assertSession(admin.uid);

            const association = await getDocFromServer(

                childRef(

                    record.id,

                    CASE_CONFIG.linkedClientCollection,

                    id

                )

            );

            if (
                association.exists() &&
                association.data().active === true
            ) {

                records.set(record.id, {

                    ...record,

                    associationType: "additional",

                    associationCapacity:
                        association.data().capacity

                });

            }

        }

    }

    assertSession(admin.uid);

    return [...records.values()].sort((a, b) =>

        Number(b.registrationYear) -
        Number(a.registrationYear)

        ||

        b.sequenceNumber - a.sequenceNumber

    );

}


/* =========================================================
   13. DUPLICATE CASE DETECTION

   Advisory warning, not a prohibition.
   ========================================================= */

function normalizedText(value) {

    return String(value ?? "")

        .normalize("NFKC")

        .toLowerCase()

        .replace(/\s+/g, " ")

        .trim();

}


function normalizedNumber(value) {

    return normalizedText(value).replace(/\s+/g, "");

}


export async function findDuplicateCases(

    input,

    excludeId = null

) {

    const data = validateCaseData(input);

    const records = await fetchCases({

        includeArchived: true

    });

    const matches = [];


    for (const record of records) {

        if (record.id === excludeId) continue;

        const reasons = [];


        if (

            data.cnrNumber &&

            data.cnrNumber === record.cnrNumber

        ) {

            reasons.push("Matching CNR number");

        }


        if (

            data.caseNumber &&

            data.courtName &&

            normalizedNumber(data.caseNumber) ===

                normalizedNumber(record.caseNumber) &&

            normalizedText(data.courtName) ===

                normalizedText(record.courtName)

        ) {

            reasons.push(
                "Matching court and case number"
            );

        }


        if (

            data.clientId === record.clientId &&

            normalizedText(data.caseTitle) ===

                normalizedText(record.caseTitle)

        ) {

            reasons.push(
                "Matching client and case title"
            );

        }


        if (reasons.length) {

            matches.push({

                id: record.id,

                caseCode: record.caseCode,

                caseTitle: record.caseTitle,

                caseNumber: record.caseNumber,

                cnrNumber: record.cnrNumber,

                status: record.status,

                reasons

            });

        }

    }

    return matches;

}


/* =========================================================
   14. UPDATE EXISTING CASE
   ========================================================= */

export async function updateCase(

    caseId,

    input,

    expectedRevision

) {

    const admin = await requireAdministrator();

    const reference = caseRef(caseId);

    const activityId = generateRecordId();


    await runTransaction(db, async transaction => {

        assertSession(admin.uid);

        const snapshot = await transaction.get(reference);

        const existing = requireExisting(

            snapshot, "Case record"

        );

        ensureRevision(existing, expectedRevision);

        ensureWritableCase(existing);


        const data = validateCaseData({

            ...existing,

            ...input

        });


        if (data.clientId !== existing.clientId) {

            throw new Error(
                "The primary client association cannot be changed."
            );

        }


        if (data.status === "archived") {

            throw new Error(
                "Use the dedicated archive function."
            );

        }


        if (

            isClosedCase(existing) &&

            !CLOSED_STATUSES.includes(data.status)

        ) {

            throw new Error(
                "Use the dedicated reopen function."
            );

        }


        const changedFields = Object.keys(data).filter(

            key => data[key] !== existing[key]

        );


        if (!changedFields.length) return;


        transaction.update(reference, {

            ...data,

            ...updateMetadata(existing, admin.uid)

        });


        const statusChanged =

            data.status !== existing.status;


        const activityType =

            statusChanged

                ? CLOSED_STATUSES.includes(data.status)

                    ? "closure"

                    : "status_change"

                : "profile_update";


        const description = statusChanged

            ? `Case status changed from ${
                CASE_STATUSES[existing.status]
              } to ${
                CASE_STATUSES[data.status]
              }. Updated fields: ${
                changedFields.join(", ")
              }.`

            : `Case profile updated. Modified fields: ${
                changedFields.join(", ")
              }.`;

        writeActivity(

            transaction,

            caseId,

            admin.uid,

            activityType,

            description,

            activityId

        );

    });

    return getCase(caseId);

}


/* =========================================================
   15. UPDATE NEXT HEARING
   ========================================================= */

export async function updateCaseHearing(

    caseId,

    hearing,

    expectedRevision

) {

    const admin = await requireAdministrator();

    const reference = caseRef(caseId);

    const nextHearingDate = cleanDate(

        hearing.nextHearingDate,

        "Next hearing date"

    );

    const nextHearingPurpose = cleanText(

        hearing.nextHearingPurpose, 500

    );

    const currentStage = cleanText(

        hearing.currentStage, 500

    );

    const activityId = generateRecordId();


    await runTransaction(db, async transaction => {

        assertSession(admin.uid);

        const snapshot = await transaction.get(reference);

        const existing = requireExisting(

            snapshot, "Case record"

        );

        ensureRevision(existing, expectedRevision);

        ensureWritableCase(existing);


        if (isClosedCase(existing)) {

            throw new Error(
                "Reopen the case before scheduling a new hearing."
            );

        }


        transaction.update(reference, {

            nextHearingDate,

            nextHearingPurpose,

            currentStage,

            ...updateMetadata(existing, admin.uid)

        });


        writeActivity(

            transaction,

            caseId,

            admin.uid,

            "hearing_update",

            nextHearingDate

                ? `Next hearing updated to ${
                    nextHearingDate
                  }. Purpose: ${
                    nextHearingPurpose || "Not specified"
                  }.`

                : "Next hearing date cleared.",

            activityId

        );

    });

    return getCase(caseId);

}


/* =========================================================
   16. CLOSE CASE
   ========================================================= */

export async function closeCase(

    caseId,

    closure,

    expectedRevision

) {

    const status = closure.status ?? "closed";

    if (!CLOSED_STATUSES.includes(status)) {

        throw new Error("Invalid closure status.");

    }

    return updateCase(

        caseId,

        {

            status,

            disposalDate:

                closure.disposalDate || getIndianDate(),

            disposalOutcome: closure.disposalOutcome,

            closureReason: closure.closureReason,

            nextHearingDate: "",

            nextHearingPurpose: ""

        },

        expectedRevision

    );

}


/* =========================================================
   17. REOPEN CLOSED CASE
   ========================================================= */

export async function reopenCase(

    caseId,

    reason,

    expectedRevision,

    newStatus = "pending"

) {

    const admin = await requireAdministrator();

    const explanation = requiredText(

        reason, 2000, "Reopening reason"

    );

    validateEnum(

        newStatus, CASE_STATUSES, "Case status"

    );

    if (

        CLOSED_STATUSES.includes(newStatus) ||

        newStatus === "archived"

    ) {

        throw new Error("Invalid reopening status.");

    }

    const reference = caseRef(caseId);

    const activityId = generateRecordId();


    await runTransaction(db, async transaction => {

        assertSession(admin.uid);

        const snapshot = await transaction.get(reference);

        const existing = requireExisting(

            snapshot, "Case record"

        );

        ensureRevision(existing, expectedRevision);

        ensureWritableCase(existing);


        if (!isClosedCase(existing)) {

            throw new Error(
                "Only a closed case may be reopened."
            );

        }


        const previousClosure = [

            `Previous status: ${existing.status}`,

            `Previous disposal date: ${existing.disposalDate || "—"}`,

            `Previous outcome: ${existing.disposalOutcome || "—"}`,

            `Previous closure reason: ${existing.closureReason || "—"}`

        ].join("\n");


        // Preserve previous closure information in the case notes.
        // Reject the operation rather than silently truncate it.

        const notes = cleanText(

            [

                existing.notes,

                previousClosure,

                `Reopened: ${getIndianDate()}`,

                `Reason: ${explanation}`

            ].filter(Boolean).join("\n\n"),

            20000,

            "Case notes"

        );


        transaction.update(reference, {

            status: newStatus,

            disposalDate: "",

            disposalOutcome: "",

            closureReason: "",

            notes,

            ...updateMetadata(existing, admin.uid)

        });


        writeActivity(

            transaction,

            caseId,

            admin.uid,

            "status_change",

            `Case reopened. Reason: ${explanation}`,

            activityId

        );

    });

    return getCase(caseId);

}


/* =========================================================
   18. ARCHIVE CASE
   ========================================================= */

export async function archiveCase(

    caseId,

    reason,

    expectedRevision

) {

    const admin = await requireAdministrator();

    const explanation = requiredText(

        reason, 2000, "Archive reason"

    );

    const reference = caseRef(caseId);

    const activityId = generateRecordId();


    await runTransaction(db, async transaction => {

        assertSession(admin.uid);

        const snapshot = await transaction.get(reference);

        const existing = requireExisting(

            snapshot, "Case record"

        );

        ensureRevision(existing, expectedRevision);

        ensureWritableCase(existing);


        transaction.update(reference, {

            status: "archived",

            archivedAt: serverTimestamp(),

            archivedBy: admin.uid,

            archiveReason: explanation,

            ...updateMetadata(existing, admin.uid)

        });


        writeActivity(

            transaction,

            caseId,

            admin.uid,

            "archive",

            `Case archived. Previous status: ${
                existing.status
            }. Reason: ${explanation}`,

            activityId

        );

    });

    return getCase(caseId);

}


/* =========================================================
   19. REACTIVATE ARCHIVED CASE
   ========================================================= */

export async function reactivateCase(

    caseId,

    expectedRevision,

    restoredStatus

) {

    const admin = await requireAdministrator();

    const status = validateEnum(

        restoredStatus,

        CASE_STATUSES,

        "Restored case status"

    );

    if (status === "archived") {

        throw new Error(
            "Select a non-archived status."
        );

    }

    const reference = caseRef(caseId);

    const activityId = generateRecordId();


    await runTransaction(db, async transaction => {

        assertSession(admin.uid);

        const snapshot = await transaction.get(reference);

        const existing = requireExisting(

            snapshot, "Case record"

        );

        ensureRevision(existing, expectedRevision);


        if (existing.status !== "archived") {

            throw new Error(
                "Only archived cases may be reactivated."
            );

        }


        // Preserve closure information.
        // Previously closed matters must first restore
        // to a closed status and then be reopened separately.

        if (

            existing.disposalDate &&

            !CLOSED_STATUSES.includes(status)

        ) {

            throw new Error(
                "Restore this matter to a closed status first, " +
                "then use Reopen Case if necessary."
            );

        }


        const validated = validateCaseData({

            ...existing,

            status

        });


        if (

            validated.nextHearingDate !== existing.nextHearingDate ||

            validated.nextHearingPurpose !== existing.nextHearingPurpose

        ) {

            throw new Error(
                "Selected restoration status conflicts with " +
                "the preserved hearing information."
            );

        }


        transaction.update(reference, {

            status,

            archivedAt: deleteField(),

            archivedBy: deleteField(),

            archiveReason: deleteField(),

            ...updateMetadata(existing, admin.uid)

        });


        writeActivity(

            transaction,

            caseId,

            admin.uid,

            "reactivate",

            `Case reactivated as ${CASE_STATUSES[status]}.`,

            activityId

        );

    });

    return getCase(caseId);

}


/* =========================================================
   20. COURT PROCEEDINGS VALIDATION
   ========================================================= */

export function validateProceedingData(input = {}) {

    const data = {

        hearingDate: cleanDate(

            input.hearingDate, "Hearing date"

        ),

        courtName: cleanText(input.courtName, 300),

        presidingJudge: cleanText(

            input.presidingJudge, 250

        ),

        appearance: cleanText(input.appearance, 2000),

        proceedings: requiredText(

            input.proceedings, 20000, "Proceedings"

        ),

        orderSummary: cleanText(

            input.orderSummary, 20000

        ),

        nextHearingDate: cleanDate(

            input.nextHearingDate, "Next hearing date"

        ),

        nextHearingPurpose: cleanText(

            input.nextHearingPurpose, 500

        ),

        confidentialNotes: cleanText(

            input.confidentialNotes, 20000

        )

    };


    if (!data.hearingDate) {

        throw new Error("Hearing date is required.");

    }


    if (data.hearingDate > getIndianDate()) {

        throw new Error(
            "Historical proceedings cannot have a future hearing date."
        );

    }


    if (

        data.nextHearingDate &&

        data.nextHearingDate < data.hearingDate

    ) {

        throw new Error(
            "Next hearing date cannot precede the recorded hearing."
        );

    }

    return data;

}


/* =========================================================
   21. ADD COURT PROCEEDINGS

   Optionally updates the main case hearing schedule
   within the same transaction.
   ========================================================= */

export async function addProceeding(

    caseId,

    input,

    expectedRevision,

    {

        updateHearing = true,

        proceedingId = generateRecordId()

    } = {}

) {

    const admin = await requireAdministrator();

    const data = validateProceedingData(input);

    const reference = caseRef(caseId);

    const proceedingReference = childRef(

        caseId,

        CASE_CONFIG.proceedingCollection,

        proceedingId

    );

    const activityId = generateRecordId();


    await runTransaction(db, async transaction => {

        assertSession(admin.uid);

        const snapshot = await transaction.get(reference);

        const previous = await transaction.get(

            proceedingReference

        );

        const existing = requireExisting(

            snapshot, "Case record"

        );

        ensureRevision(existing, expectedRevision);

        ensureWritableCase(existing);


        if (previous.exists()) {

            throw new Error(
                "This proceeding has already been recorded."
            );

        }


        if (updateHearing && isClosedCase(existing)) {

            throw new Error(
                "Historical proceedings may be added to a closed case, " +
                "but its hearing schedule cannot be updated."
            );

        }


        transaction.set(proceedingReference, {

            ...data,

            id: proceedingReference.id,

            caseId,

            createdAt: serverTimestamp(),

            createdBy: admin.uid

        });


        if (updateHearing) {

            transaction.update(reference, {

                nextHearingDate: data.nextHearingDate,

                nextHearingPurpose: data.nextHearingPurpose,

                ...updateMetadata(existing, admin.uid)

            });

        } else {

            transaction.update(reference, {

                ...updateMetadata(existing, admin.uid)

            });

        }


        writeActivity(

            transaction,

            caseId,

            admin.uid,

            "proceeding_added",

            `Court proceedings recorded for ${
                data.hearingDate
            }.${
                updateHearing
                    ? " Case hearing schedule updated."
                    : ""
            }`,

            activityId

        );

    });


    return getProceeding(caseId, proceedingReference.id);

}


export async function getProceeding(caseId, proceedingId) {

    const admin = await requireAdministrator();

    const snapshot = await getDocFromServer(

        childRef(

            caseId,

            CASE_CONFIG.proceedingCollection,

            proceedingId

        )

    );

    assertSession(admin.uid);

    return requireExisting(snapshot, "Proceeding");

}


export async function fetchProceedings(caseId) {

    const admin = await requireAdministrator();

    const snapshot = await getDocsFromServer(

        query(

            childCollection(

                caseId,

                CASE_CONFIG.proceedingCollection

            ),

            orderBy("hearingDate", "desc")

        )

    );

    assertSession(admin.uid);

    return snapshot.docs.map(snapshotRecord).sort((a, b) =>

        b.hearingDate.localeCompare(a.hearingDate)

        ||

        timestampMillis(b.createdAt) -

        timestampMillis(a.createdAt)

    );

}


/* =========================================================
   22. TASK VALIDATION
   ========================================================= */

export function validateTaskData(input = {}) {

    return {

        title: requiredText(

            input.title, 300, "Task title"

        ),

        description: cleanText(

            input.description, 10000

        ),

        taskType: validateEnum(

            input.taskType ?? "other",

            TASK_TYPES,

            "Task type"

        ),

        assignedTo: cleanText(

            input.assignedTo, 250

        ),

        dueDate: cleanDate(

            input.dueDate, "Task due date"

        ),

        priority: validateEnum(

            input.priority ?? "normal",

            CASE_PRIORITIES,

            "Task priority"

        ),

        status: validateEnum(

            input.status ?? "pending",

            TASK_STATUSES,

            "Task status"

        ),

        completionNotes: cleanText(

            input.completionNotes, 5000

        )

    };

}


/* =========================================================
   23. CREATE CASE TASK
   ========================================================= */

export async function createCaseTask(

    caseId,

    input,

    taskId = generateRecordId()

) {

    const admin = await requireAdministrator();

    const data = validateTaskData(input);

    if (!["pending", "in_progress"].includes(data.status)) {

        throw new Error(
            "A new task must be pending or in progress."
        );

    }

    const reference = caseRef(caseId);

    const taskReference = childRef(

        caseId,

        CASE_CONFIG.taskCollection,

        taskId

    );

    const activityId = generateRecordId();


    await runTransaction(db, async transaction => {

        assertSession(admin.uid);

        const snapshot = await transaction.get(reference);

        const existingTask = await transaction.get(

            taskReference

        );

        const record = requireExisting(

            snapshot, "Case record"

        );

        ensureWritableCase(record);


        if (existingTask.exists()) {

            throw new Error(
                "This task has already been registered."
            );

        }


        transaction.set(taskReference, {

            ...data,

            id: taskReference.id,

            caseId,

            createdAt: serverTimestamp(),

            createdBy: admin.uid,

            updatedAt: serverTimestamp(),

            updatedBy: admin.uid,

            revision: 1

        });


        writeActivity(

            transaction,

            caseId,

            admin.uid,

            "task_created",

            `Task created: ${data.title}`,

            activityId

        );

    });

    return getCaseTask(caseId, taskReference.id);

}


/* =========================================================
   24. FETCH CASE TASKS
   ========================================================= */

export async function getCaseTask(caseId, taskId) {

    const admin = await requireAdministrator();

    const snapshot = await getDocFromServer(

        childRef(

            caseId,

            CASE_CONFIG.taskCollection,

            taskId

        )

    );

    assertSession(admin.uid);

    return requireExisting(snapshot, "Task");

}


export async function fetchCaseTasks(caseId) {

    const admin = await requireAdministrator();

    const snapshot = await getDocsFromServer(

        childCollection(

            caseId,

            CASE_CONFIG.taskCollection

        )

    );

    assertSession(admin.uid);

    return snapshot.docs.map(snapshotRecord).sort((a, b) => {

        const aClosed = ["completed", "cancelled"]

            .includes(a.status);

        const bClosed = ["completed", "cancelled"]

            .includes(b.status);

        return Number(aClosed) - Number(bClosed)

            ||

            (a.dueDate || "9999-12-31").localeCompare(

                b.dueDate || "9999-12-31"

            )

            ||

            timestampMillis(b.createdAt) -

            timestampMillis(a.createdAt);

    });

}


/* =========================================================
   25. UPDATE CASE TASK
   ========================================================= */

export async function updateCaseTask(

    caseId,

    taskId,

    input,

    expectedRevision

) {

    const admin = await requireAdministrator();

    const reference = caseRef(caseId);

    const taskReference = childRef(

        caseId,

        CASE_CONFIG.taskCollection,

        taskId

    );

    const activityId = generateRecordId();


    await runTransaction(db, async transaction => {

        assertSession(admin.uid);

        const caseSnapshot = await transaction.get(reference);

        const taskSnapshot = await transaction.get(

            taskReference

        );

        const record = requireExisting(

            caseSnapshot, "Case record"

        );

        const existing = requireExisting(

            taskSnapshot, "Task"

        );

        ensureWritableCase(record);

        ensureRevision(existing, expectedRevision);


        const data = validateTaskData({

            ...existing,

            ...input

        });


        const changedFields = Object.keys(data).filter(

            key => data[key] !== existing[key]

        );

        if (!changedFields.length) return;


        const update = {

            ...data,

            ...updateMetadata(existing, admin.uid)

        };


        if (data.status === "completed") {

            if (existing.status !== "completed") {

                update.completedAt = serverTimestamp();

                update.completedBy = admin.uid;

            }

        } else if (existing.status === "completed") {

            update.completedAt = deleteField();

            update.completedBy = deleteField();

        }


        transaction.update(taskReference, update);


        const activityType =

            data.status !== existing.status &&

            data.status === "completed"

                ? "task_completed"

                : data.status !== existing.status &&

                  data.status === "cancelled"

                    ? "task_cancelled"

                    : "task_updated";


        writeActivity(

            transaction,

            caseId,

            admin.uid,

            activityType,

            `Task updated: ${data.title}. Status: ${
                TASK_STATUSES[data.status]
            }. Modified fields: ${
                changedFields.join(", ")
            }.`,

            activityId

        );

    });

    return getCaseTask(caseId, taskId);

}


export async function completeCaseTask(

    caseId,

    taskId,

    completionNotes,

    expectedRevision

) {

    return updateCaseTask(

        caseId,

        taskId,

        {

            status: "completed",

            completionNotes

        },

        expectedRevision

    );

}


export async function cancelCaseTask(

    caseId,

    taskId,

    reason,

    expectedRevision

) {

    return updateCaseTask(

        caseId,

        taskId,

        {

            status: "cancelled",

            completionNotes: requiredText(

                reason, 5000, "Cancellation reason"

            )

        },

        expectedRevision

    );

}


export async function reopenCaseTask(

    caseId,

    taskId,

    expectedRevision

) {

    return updateCaseTask(

        caseId,

        taskId,

        {

            status: "pending"

        },

        expectedRevision

    );

}


/* =========================================================
   26. MANUAL CASE ACTIVITY
   ========================================================= */

export async function addCaseActivity(

    caseId,

    type,

    description,

    activityId = generateRecordId()

) {

    const admin = await requireAdministrator();

    if (!MANUAL_ACTIVITY_TYPES.includes(type)) {

        throw new Error(
            "Invalid manual activity type."
        );

    }

    const content = requiredText(

        description, 10000, "Activity description"

    );

    const reference = caseRef(caseId);

    const activityReference = childRef(

        caseId,

        CASE_CONFIG.activityCollection,

        activityId

    );


    await runTransaction(db, async transaction => {

        assertSession(admin.uid);

        const snapshot = await transaction.get(reference);

        const previous = await transaction.get(

            activityReference

        );

        const existing = requireExisting(

            snapshot, "Case record"

        );

        ensureWritableCase(existing);


        if (previous.exists()) {

            throw new Error(
                "This activity has already been recorded."
            );

        }


        writeActivity(

            transaction,

            caseId,

            admin.uid,

            type,

            content,

            activityId

        );

    });

    return getCaseActivity(caseId, activityId);

}


export async function getCaseActivity(caseId, activityId) {

    const admin = await requireAdministrator();

    const snapshot = await getDocFromServer(

        childRef(

            caseId,

            CASE_CONFIG.activityCollection,

            activityId

        )

    );

    assertSession(admin.uid);

    return requireExisting(snapshot, "Case activity");

}


export async function fetchCaseActivities(caseId) {

    const admin = await requireAdministrator();

    const snapshot = await getDocsFromServer(

        query(

            childCollection(

                caseId,

                CASE_CONFIG.activityCollection

            ),

            orderBy("createdAt", "desc")

        )

    );

    assertSession(admin.uid);

    return snapshot.docs.map(snapshotRecord);

}


/* =========================================================
   27. ADDITIONAL CLIENT ASSOCIATIONS
   ========================================================= */

export async function linkAdditionalClient(

    caseId,

    clientId,

    capacity

) {

    const admin = await requireAdministrator();

    const id = validateDocumentId(clientId);

    const role = requiredText(

        capacity, 100, "Client capacity"

    );

    const reference = caseRef(caseId);

    const associationReference = childRef(

        caseId,

        CASE_CONFIG.linkedClientCollection,

        id

    );

    const activityId = generateRecordId();


    await runTransaction(db, async transaction => {

        assertSession(admin.uid);

        const caseSnapshot = await transaction.get(reference);

        const clientSnapshot = await transaction.get(

            clientRef(id)

        );

        const associationSnapshot = await transaction.get(

            associationReference

        );


        const record = requireExisting(

            caseSnapshot, "Case record"

        );

        const client = requireExisting(

            clientSnapshot, "Client record"

        );

        ensureWritableCase(record);


        if (record.clientId === id) {

            throw new Error(
                "This client is already the primary client."
            );

        }


        if (client.status === "archived") {

            throw new Error(
                "An archived client cannot be linked."
            );

        }


        if (associationSnapshot.exists()) {

            const association = associationSnapshot.data();

            if (

                association.active === true &&

                association.capacity === role

            ) {

                return;

            }


            transaction.update(associationReference, {

                capacity: role,

                active: true,

                updatedAt: serverTimestamp(),

                updatedBy: admin.uid

            });

        } else {

            transaction.set(associationReference, {

                clientId: id,

                caseId,

                capacity: role,

                active: true,

                createdAt: serverTimestamp(),

                createdBy: admin.uid,

                updatedAt: serverTimestamp(),

                updatedBy: admin.uid

            });

        }


        writeActivity(

            transaction,

            caseId,

            admin.uid,

            "client_linked",

            `Client linked: ${
                client.clientCode
            } — ${
                client.fullName
            }. Capacity: ${role}.`,

            activityId

        );

    });

    return getLinkedClient(caseId, id);

}


/* =========================================================
   28. DEACTIVATE CLIENT ASSOCIATION
   ========================================================= */

export async function unlinkAdditionalClient(

    caseId,

    clientId,

    reason

) {

    const admin = await requireAdministrator();

    const id = validateDocumentId(clientId);

    const explanation = requiredText(

        reason, 2000, "Unlinking reason"

    );

    const reference = caseRef(caseId);

    const associationReference = childRef(

        caseId,

        CASE_CONFIG.linkedClientCollection,

        id

    );

    const activityId = generateRecordId();


    await runTransaction(db, async transaction => {

        assertSession(admin.uid);

        const caseSnapshot = await transaction.get(reference);

        const associationSnapshot = await transaction.get(

            associationReference

        );

        const record = requireExisting(

            caseSnapshot, "Case record"

        );

        ensureWritableCase(record);


        if (record.clientId === id) {

            throw new Error(
                "The primary client cannot be unlinked."
            );

        }


        const association = requireExisting(

            associationSnapshot, "Client association"

        );

        if (association.active === false) return;


        transaction.update(associationReference, {

            active: false,

            updatedAt: serverTimestamp(),

            updatedBy: admin.uid

        });


        writeActivity(

            transaction,

            caseId,

            admin.uid,

            "client_unlinked",

            `Additional client association deactivated. ` +

            `Client ID: ${id}. Reason: ${explanation}`,

            activityId

        );

    });

    return getLinkedClient(caseId, id);

}


export async function getLinkedClient(caseId, clientId) {

    const admin = await requireAdministrator();

    const snapshot = await getDocFromServer(

        childRef(

            caseId,

            CASE_CONFIG.linkedClientCollection,

            clientId

        )

    );

    assertSession(admin.uid);

    return requireExisting(

        snapshot, "Client association"

    );

}


export async function fetchLinkedClients(

    caseId,

    {

        includeInactive = false

    } = {}

) {

    const admin = await requireAdministrator();

    const snapshot = await getDocsFromServer(

        childCollection(

            caseId,

            CASE_CONFIG.linkedClientCollection

        )

    );

    assertSession(admin.uid);

    return snapshot.docs

        .map(snapshotRecord)

        .filter(record =>

            includeInactive || record.active === true

        );

}


/* =========================================================
   29. COMPLETE CASE PROFILE
   ========================================================= */

export async function fetchCaseProfile(caseId) {

    const admin = await requireAdministrator();

    const record = await getCase(caseId);


    const [

        clients,

        proceedings,

        tasks,

        activities,

        linkedClients

    ] = await Promise.all([

        fetchCaseClients({

            includeArchived: true

        }),

        fetchProceedings(caseId),

        fetchCaseTasks(caseId),

        fetchCaseActivities(caseId),

        fetchLinkedClients(caseId, {

            includeInactive: true

        })

    ]);


    assertSession(admin.uid);


    const clientMap = new Map(

        clients.map(client => [

            client.id,

            client

        ])

    );


    return {

        case: record,

        primaryClient:

            clientMap.get(record.clientId) || null,

        additionalClients: linkedClients.map(link => ({

            ...link,

            client:

                clientMap.get(link.clientId) || null

        })),

        proceedings,

        tasks,

        activities

    };

}


/* =========================================================
   30. UPCOMING HEARINGS
   ========================================================= */

export async function fetchUpcomingHearings(

    days = 30

) {

    if (

        !Number.isSafeInteger(days) ||

        days < 1 ||

        days > 366

    ) {

        throw new Error("Invalid hearing date range.");

    }

    const today = getIndianDate();

    const endDate = addCalendarDays(today, days - 1);

    const records = await fetchCases();


    return records

        .filter(record =>

            !isClosedCase(record) &&

            record.nextHearingDate &&

            record.nextHearingDate >= today &&

            record.nextHearingDate <= endDate

        )

        .sort((a, b) =>

            a.nextHearingDate.localeCompare(

                b.nextHearingDate

            )

            ||

            a.caseTitle.localeCompare(b.caseTitle)

        )

        .map(record => ({

            caseId: record.id,

            caseCode: record.caseCode,

            caseTitle: record.caseTitle,

            clientId: record.clientId,

            courtName: record.courtName,

            courtNumber: record.courtNumber,

            caseNumber: record.caseNumber,

            assignedAdvocate: record.assignedAdvocate,

            hearingDate: record.nextHearingDate,

            hearingPurpose: record.nextHearingPurpose,

            priority: record.priority,

            status: record.status

        }));

}


/* =========================================================
   31. LIMITATION AND FILING DEADLINES

   Uses manually entered dates.
   Does not calculate statutory limitation.
   ========================================================= */

export async function fetchCaseDeadlines(days = 30) {

    if (

        !Number.isSafeInteger(days) ||

        days < 1 ||

        days > 366

    ) {

        throw new Error("Invalid deadline range.");

    }

    const today = getIndianDate();

    const endDate = addCalendarDays(today, days - 1);

    const records = await fetchCases();


    return records

        .filter(record =>

            !isClosedCase(record) &&

            record.limitationDate &&

            record.limitationDate <= endDate

        )

        .sort((a, b) =>

            a.limitationDate.localeCompare(

                b.limitationDate

            )

        )

        .map(record => ({

            caseId: record.id,

            caseCode: record.caseCode,

            caseTitle: record.caseTitle,

            assignedAdvocate: record.assignedAdvocate,

            deadline: record.limitationDate,

            overdue: record.limitationDate < today,

            dueToday: record.limitationDate === today,

            priority: record.priority

        }));

}


/* =========================================================
   32. DASHBOARD STATISTICS
   ========================================================= */

export function calculateCaseStatistics(records = []) {

    const today = getIndianDate();

    const month = today.slice(0, 7);

    const nextSevenDays = addCalendarDays(today, 6);

    const nextThirtyDays = addCalendarDays(today, 29);


    const statistics = {

        total: records.length,

        active: 0,

        pending: 0,

        preFiling: 0,

        filed: 0,

        stayed: 0,

        reservedForJudgment: 0,

        closed: 0,

        disposed: 0,

        settled: 0,

        withdrawn: 0,

        archived: 0,

        urgent: 0,

        highPriority: 0,

        newThisMonth: 0,

        hearingsToday: 0,

        hearingsNextSevenDays: 0,

        upcomingHearings: 0,

        overdueHearings: 0,

        upcomingDeadlines: 0,

        overdueDeadlines: 0,

        litigation: 0,

        nonLitigation: 0

    };


    for (const record of records) {

        if (record.createdAt?.toDate) {

            const registrationDate = getIndianDate(

                record.createdAt.toDate()

            );

            if (registrationDate.startsWith(month)) {

                statistics.newThisMonth++;

            }

        }


        if (record.status === "archived") {

            statistics.archived++;

            continue;

        }


        if (record.matterType === "litigation") {

            statistics.litigation++;

        } else {

            statistics.nonLitigation++;

        }


        if (isClosedCase(record)) {

            statistics.closed++;

            if (record.status === "disposed") {

                statistics.disposed++;

            }

            if (record.status === "settled") {

                statistics.settled++;

            }

            if (record.status === "withdrawn") {

                statistics.withdrawn++;

            }

            continue;

        }


        statistics.active++;


        if (record.status === "pending") {

            statistics.pending++;

        }


        if ([

            "pre_litigation",

            "drafting",

            "ready_for_filing"

        ].includes(record.status)) {

            statistics.preFiling++;

        }


        if (record.status === "filed") {

            statistics.filed++;

        }


        if (record.status === "stayed") {

            statistics.stayed++;

        }


        if (record.status === "reserved_for_judgment") {

            statistics.reservedForJudgment++;

        }


        if (record.priority === "urgent") {

            statistics.urgent++;

        }


        if (record.priority === "high") {

            statistics.highPriority++;

        }


        const hearing = record.nextHearingDate;


        if (hearing) {

            if (hearing < today) {

                statistics.overdueHearings++;

            }

            if (hearing === today) {

                statistics.hearingsToday++;

            }

            if (

                hearing >= today &&

                hearing <= nextSevenDays

            ) {

                statistics.hearingsNextSevenDays++;

            }

            if (

                hearing >= today &&

                hearing <= nextThirtyDays

            ) {

                statistics.upcomingHearings++;

            }

        }


        const deadline = record.limitationDate;


        if (deadline) {

            if (deadline < today) {

                statistics.overdueDeadlines++;

            } else if (deadline <= nextThirtyDays) {

                statistics.upcomingDeadlines++;

            }

        }

    }

    return statistics;

}


export async function getCaseStatistics() {

    const records = await fetchCases({

        includeArchived: true

    });

    return calculateCaseStatistics(records);

}


/* =========================================================
   33. CASE TASK STATISTICS
   ========================================================= */

export function calculateTaskStatistics(tasks = []) {

    const today = getIndianDate();

    const statistics = {

        total: tasks.length,

        pending: 0,

        inProgress: 0,

        completed: 0,

        cancelled: 0,

        overdue: 0,

        dueToday: 0,

        urgent: 0

    };


    for (const task of tasks) {

        if (task.status === "completed") {

            statistics.completed++;

            continue;

        }

        if (task.status === "cancelled") {

            statistics.cancelled++;

            continue;

        }

        if (task.status === "pending") {

            statistics.pending++;

        }

        if (task.status === "in_progress") {

            statistics.inProgress++;

        }

        if (task.priority === "urgent") {

            statistics.urgent++;

        }

        if (task.dueDate && task.dueDate < today) {

            statistics.overdue++;

        }

        if (task.dueDate === today) {

            statistics.dueToday++;

        }

    }

    return statistics;

}


/* =========================================================
   34. FETCH YEARLY CASE SEQUENCES
   ========================================================= */

export async function fetchCaseSequences() {

    const admin = await requireAdministrator();

    const snapshot = await getDocsFromServer(

        collection(

            db,

            CASE_CONFIG.sequenceCollection

        )

    );

    assertSession(admin.uid);

    return snapshot.docs.map(item => ({

        ...item.data(),

        yearId: item.id

    }));

}


/* =========================================================
   35. CONFIDENTIAL CASE BACKUP

   Read-only export.
   Includes archived cases and inactive associations.
   ========================================================= */

export async function createCaseBackup() {

    const admin = await requireAdministrator();

    const startedAt = new Date().toISOString();


    const [

        cases,

        sequences

    ] = await Promise.all([

        fetchCases({

            includeArchived: true

        }),

        fetchCaseSequences()

    ]);


    const proceedings = {};

    const tasks = {};

    const activities = {};

    const linkedClients = {};


    for (const record of cases) {

        assertSession(admin.uid);


        const [

            caseProceedings,

            caseTasks,

            caseActivities,

            associations

        ] = await Promise.all([

            fetchProceedings(record.id),

            fetchCaseTasks(record.id),

            fetchCaseActivities(record.id),

            fetchLinkedClients(record.id, {

                includeInactive: true

            })

        ]);


        proceedings[record.id] = caseProceedings;

        tasks[record.id] = caseTasks;

        activities[record.id] = caseActivities;

        linkedClients[record.id] = associations;

    }


    assertSession(admin.uid);


    return {

        firm: "MNM Legal Associates",

        module: "Case Management",

        classification: "Confidential",

        backupVersion: CASE_CONFIG.backupVersion,

        backupStartedAt: startedAt,

        backupDate: new Date().toISOString(),

        exportedBy: admin.uid,

        storage: "Firebase Cloud Firestore",

        caseCount: cases.length,

        snapshotType: "Non-atomic application export",

        encrypted: false,

        data: {

            cases,

            sequences,

            proceedings,

            tasks,

            activities,

            linkedClients

        }

    };

}


/* =========================================================
   36. DATABASE CONNECTION VERIFICATION
   ========================================================= */

export async function checkCaseCloudConnection() {

    const admin = await requireAdministrator();

    const year = getRegistrationYear();


    const [

        records,

        counter,

        clients

    ] = await Promise.all([

        getDocsFromServer(casesCollection()),

        getDocFromServer(sequenceRef(year)),

        getDocsFromServer(

            collection(

                db,

                CASE_CONFIG.clientCollection

            )

        )

    ]);


    assertSession(admin.uid);


    const nextSequence = readSequence(counter);


    return {

        connected: true,

        authorized: true,

        administrator: admin.name || "",

        role: admin.role,

        caseCount: records.size,

        clientCount: clients.size,

        registrationYear: year,

        nextCaseCode: formatCaseCode(

            nextSequence,

            year

        ),

        checkedAt: new Date().toISOString()

    };

}


/* =========================================================
   END OF CASE MANAGEMENT CLOUD ENGINE

   MNM LEGAL ASSOCIATES
   Justice, Integrity & Excellence
   ========================================================= */
