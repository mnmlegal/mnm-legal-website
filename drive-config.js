
/**
 * =====================================================
 * MNM LEGAL ASSOCIATES
 * DOCUMENT MANAGEMENT SYSTEM
 * GOOGLE DRIVE CONFIGURATION
 * Version 1.0
 * Justice, Integrity & Excellence
 * =====================================================
 */

export const DRIVE_CONFIG = Object.freeze({

    version: "1.0.0",

    firmName: "MNM Legal Associates",

    projectId: "mnm-legal-associates",

    projectNumber: "14199102894",

    clientId:
        "14199102894-fv7a88v3f4h4ci3jdhd4ak3q674c5h0n.apps.googleusercontent.com",

    apiKey: "PASTE_YOUR_NEW_RESTRICTED_PICKER_API_KEY",

    rootFolderId:
        "13pY7zhrwlhpoJMmo2K7JyLQVCitaZJY2",

    authorizedOrigin:
        "https://mnmlegals.com",

    authorizedEmail:
        "mnmlegal.in@gmail.com",

    scope:
        "https://www.googleapis.com/auth/drive.file",

    driveApiUrl:
        "https://www.googleapis.com/drive/v3",

    uploadApiUrl:
        "https://www.googleapis.com/upload/drive/v3",

    identityScriptUrl:
        "https://accounts.google.com/gsi/client",

    pickerScriptUrl:
        "https://apis.google.com/js/api.js",

    folderMimeType:
        "application/vnd.google-apps.folder",

    timeZone: "Asia/Kolkata",

    maxFileSize: 25 * 1024 * 1024,

    allowedRoles: Object.freeze(["admin"]),

    collections: Object.freeze({
        documents: "documents",
        sequences: "documentSequences",
        clients: "clients",
        cases: "cases",
        staff: "staff",
        versions: "versions",
        activities: "activities"
    }),

    folders: Object.freeze({
        clients: "Clients",
        cases: "Cases",
        administration: "Administration",
        general: "General Documents"
    }),

    security: Object.freeze({
        requireFirebaseAuthentication: true,
        requireActiveStaff: true,
        requireGoogleAuthorization: true,
        allowPublicSharing: false,
        allowPermanentDeletion: false,
        persistAccessToken: false
    })

});


/**
 * DOCUMENT CATEGORIES
 */

export const DOCUMENT_CATEGORIES = Object.freeze({

    identity_proof: "Identity Proof",

    address_proof: "Address Proof",

    petition: "Petition",

    plaint: "Plaint",

    written_statement: "Written Statement",

    reply: "Reply",

    rejoinder: "Rejoinder",

    affidavit: "Affidavit",

    vakalatnama: "Vakalatnama",

    application: "Application",

    legal_notice: "Legal Notice",

    agreement: "Agreement",

    court_order: "Court Order",

    judgment: "Judgment",

    evidence: "Evidence",

    police_complaint: "Police Complaint",

    fir: "FIR",

    charge_sheet: "Charge Sheet",

    correspondence: "Correspondence",

    financial_record: "Financial Record",

    receipt: "Receipt",

    research: "Legal Research",

    other: "Other Document"

});


/**
 * DOCUMENT STATUS
 */

export const DOCUMENT_STATUSES = Object.freeze({

    draft: "Draft",

    final: "Final",

    filed: "Filed",

    received: "Received",

    archived: "Archived"

});


/**
 * DOCUMENT CONFIDENTIALITY
 */

export const DOCUMENT_CONFIDENTIALITY = Object.freeze({

    internal: "Internal",

    confidential: "Confidential",

    highly_confidential: "Highly Confidential"

});


/**
 * DOCUMENT FILE TYPES
 */

export const ALLOWED_FILE_TYPES = Object.freeze({

    "application/pdf": "PDF",

    "application/msword": "DOC",

    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",

    "application/vnd.ms-excel": "XLS",

    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",

    "image/jpeg": "JPEG",

    "image/png": "PNG",

    "image/webp": "WEBP",

    "text/plain": "TXT",

    "text/csv": "CSV",

    "audio/mpeg": "MP3",

    "audio/wav": "WAV",

    "video/mp4": "MP4"

});


/**
 * DOCUMENT ACTIVITY TYPES
 */

export const DOCUMENT_ACTIVITY_TYPES = Object.freeze({

    registration: "Document Registered",

    upload: "Document Uploaded",

    import: "Imported from Google Drive",

    profile_update: "Metadata Updated",

    version_added: "New Version Added",

    download: "Document Downloaded",

    archive: "Document Archived",

    reactivate: "Document Restored",

    note: "Note Added"

});


/**
 * CONFIGURATION VALIDATION
 */

export function validateDriveConfiguration() {

    const errors = [];

    if (!DRIVE_CONFIG.clientId.endsWith(
        ".apps.googleusercontent.com"
    )) {
        errors.push("Invalid Google OAuth Client ID.");
    }

    if (
        !DRIVE_CONFIG.apiKey ||
        DRIVE_CONFIG.apiKey.startsWith("PASTE_") ||
        !DRIVE_CONFIG.apiKey.startsWith("AIza")
    ) {
        errors.push(
            "Google Picker API Key is not configured."
        );
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(
        DRIVE_CONFIG.rootFolderId
    )) {
        errors.push("Invalid Google Drive root folder ID.");
    }

    if (
        typeof window !== "undefined" &&
        window.location.origin !==
            DRIVE_CONFIG.authorizedOrigin
    ) {
        errors.push("Unauthorized application origin.");
    }

    return {
        valid: errors.length === 0,
        errors
    };

}


/**
 * FILE VALIDATION
 */

export function validateDocumentFile(file) {

    const errors = [];

    if (
        typeof File === "undefined" ||
        !(file instanceof File)
    ) {
        return {
            valid: false,
            errors: ["Please select a valid file."]
        };
    }

    if (!file.name || file.size === 0) {
        errors.push("The selected file is empty or invalid.");
    }

    if (file.size > DRIVE_CONFIG.maxFileSize) {
        errors.push(
            "Maximum permitted file size is 25 MB."
        );
    }

    if (!Object.prototype.hasOwnProperty.call(
        ALLOWED_FILE_TYPES,
        file.type
    )) {
        errors.push("This file type is not supported.");
    }

    return {
        valid: errors.length === 0,
        errors
    };

}


/**
 * FILE SIZE FORMATTING
 */

export function formatFileSize(bytes) {

    if (!Number.isFinite(bytes) || bytes < 0) {
        return "Unknown";
    }

    if (bytes === 0) {
        return "0 Bytes";
    }

    const units = [
        "Bytes",
        "KB",
        "MB",
        "GB",
        "TB"
    ];

    const index = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1
    );

    const safeIndex = Math.max(0, index);

    const size = bytes / Math.pow(1024, safeIndex);

    return `${Number(size.toFixed(2))} ${units[safeIndex]}`;

}


/**
 * GOOGLE DRIVE URL GENERATORS
 */

function validateDriveId(id) {

    if (
        typeof id !== "string" ||
        !/^[a-zA-Z0-9_-]+$/.test(id)
    ) {
        throw new Error("Invalid Google Drive ID.");
    }

    return id;

}


export function getDriveFileUrl(fileId) {

    return `https://drive.google.com/file/d/${validateDriveId(fileId)}/view`;

}


export function getDriveFolderUrl(folderId) {

    return `https://drive.google.com/drive/folders/${validateDriveId(folderId)}`;

}


export function getRootFolderUrl() {

    return getDriveFolderUrl(
        DRIVE_CONFIG.rootFolderId
    );

}


/**
 * SAFE FILE NAME GENERATOR
 */

export function sanitizeFileName(name) {

    const sanitized = String(name || "Document")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);

    return sanitized || "Document";

}


/**
 * INTERNAL DOCUMENT NUMBER
 */

export function formatDocumentCode(
    sequenceNumber,
    year
) {

    if (
        !Number.isSafeInteger(sequenceNumber) ||
        sequenceNumber < 1
    ) {
        throw new Error(
            "Invalid document sequence number."
        );
    }

    if (!/^[0-9]{4}$/.test(String(year))) {
        throw new Error(
            "Invalid registration year."
        );
    }

    const sequence = String(sequenceNumber)
        .padStart(3, "0");

    return `MNM/DOC/${sequence}/${year}`;

}


/**
 * INDIAN CALENDAR DATE
 */

export function getIndianDate(
    date = new Date()
) {

    const parts = new Intl.DateTimeFormat(
        "en-GB",
        {
            timeZone: DRIVE_CONFIG.timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }
    ).formatToParts(date);

    const values = Object.fromEntries(
        parts.map(part => [
            part.type,
            part.value
        ])
    );

    return `${values.year}-${values.month}-${values.day}`;

}


export function getRegistrationYear() {

    return getIndianDate().slice(0, 4);

}


/**
 * END OF GOOGLE DRIVE CONFIGURATION
 * MNM LEGAL ASSOCIATES
 */
