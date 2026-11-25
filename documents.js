
/* =========================================================
   MNM LEGAL ASSOCIATES
   DOCUMENT MANAGEMENT APPLICATION ENGINE
   Version 1.0.0
   Justice, Integrity & Excellence
   ========================================================= */

import { auth } from "./firebase-config.js";

import { verifyStaffAccess } from "./auth.js";

import {
    DRIVE_CONFIG,
    DOCUMENT_CATEGORIES,
    validateDriveConfiguration,
    validateDocumentFile,
    formatFileSize,
    getIndianDate
} from "./drive-config.js";

import * as Cloud from "./documents-cloud.js";


/* =========================================================
   01. APPLICATION STATE
   ========================================================= */

const state = {
    initialized: false,
    userId: null,
    invalidated: false,
    busy: false,
    records: [],
    clients: [],
    cases: [],
    profile: null,
    selectedFile: null,
    selectedDriveFile: null,
    pendingId: null,
    versionOperationId: null,
    recovery: null,
    tab: "overview",
    page: 1,
    pageSize: 15,
    lastSync: null,
    connected: false,
    caseRequest: 0
};

const $ = id => document.getElementById(id);

const tabs = [
    "overview",
    "directory",
    "registration",
    "archived",
    "settings"
];

function text(id, value) {
    const element = $(id);
    if (element) {
        element.textContent = String(value ?? "");
    }
}

function show(id, visible = true) {
    const element = $(id);
    if (element) element.hidden = !visible;
}

function disable(id, disabled = true) {
    const element = $(id);
    if (element) element.disabled = disabled;
}

function value(id) {
    return $(id)?.value || "";
}

function setValue(id, content) {
    if ($(id)) $(id).value = content ?? "";
}

function escapeHTML(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]
    );
}

function categoryName(category) {
    const item = DOCUMENT_CATEGORIES[category];

    return typeof item === "string"
        ? item
        : item?.label || item?.name || category || "Unspecified";
}

function dateLabel(date) {
    if (!date) return "Not specified";

    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const [year, month, day] = date.split("-");
        return `${day}/${month}/${year}`;
    }

    return String(date);
}

function timestampLabel(timestamp) {
    if (!timestamp) return "Not available";

    const date = timestamp.toDate
        ? timestamp.toDate()
        : new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
        return "Not available";
    }

    return new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata"
    }).format(date);
}

function errorMessage(error) {
    return Cloud.getDocumentErrorMessage(error)
        || error?.message
        || "The requested operation could not be completed.";
}

function message(content, type = "success") {
    text("appMessage", content);
    $("appMessage").className = `app-message ${type}`;
    show("appMessage");
}

function formError(id, error) {
    text(id, errorMessage(error));
    show(id);
}

function clearError(id) {
    text(id, "");
    show(id, false);
}


/* =========================================================
   02. AUTHORIZATION
   ========================================================= */

async function requireSession() {
    if (
        state.invalidated ||
        !state.userId ||
        auth.currentUser?.uid !== state.userId
    ) {
        throw new Error("Administrator session is unavailable.");
    }

    const profile = await verifyStaffAccess(auth.currentUser);

    if (
        auth.currentUser?.uid !== state.userId ||
        profile?.uid !== state.userId ||
        profile?.active !== true ||
        profile?.role !== "admin"
    ) {
        throw new Error("Administrator authorization is required.");
    }

    return profile;
}

function requireVisibleApplication() {
    if (
        state.invalidated ||
        $("protectedContent").hidden
    ) {
        throw new Error("The protected application is unavailable.");
    }
}

function closeDialogs() {
    document.querySelectorAll("dialog[open]").forEach(dialog => {
        dialog.close();
    });
}

function invalidateSession() {
    state.invalidated = true;

    state.records = [];
    state.clients = [];
    state.cases = [];
    state.profile = null;
    state.selectedFile = null;
    state.selectedDriveFile = null;
    state.recovery = null;

    Cloud.disconnectGoogleDrive();

    closeDialogs();

    $("documentForm")?.reset();
    $("versionForm")?.reset();

    [
        "documentsTableBody",
        "recentDocumentsBody",
        "archivedDocumentsBody",
        "documentVersionsBody",
        "documentActivityTimeline",
        "categorySummary"
    ].forEach(id => {
        if ($(id)) $(id).replaceChildren();
    });

    show("protectedContent", false);
    show("authLoading", true);

    text(
        "loadingMessage",
        "Administrator session has ended. Please sign in again."
    );

    show("loadingSpinner", false);
}


/* =========================================================
   03. BUSY STATE AND CONNECTION
   ========================================================= */

function setBusy(busy) {
    state.busy = busy;

    [
        "refreshDocumentsButton",
        "confirmArchiveButton",
        "confirmRestoreButton",
        "saveNoteButton",
        "recoverRegistrationButton",
        "recoverVersionButton",
        "backupDocumentsButton",
        "exportDocumentsButton",
        "exportAllDocumentsButton",
        "testCloudConnectionButton"
    ].forEach(id => disable(id, busy));

    renderDriveConnection();
    updateSaveAvailability();
}

async function perform(operation, errorId = null) {
    if (state.busy) return;

    if (errorId) clearError(errorId);

    try {
        requireVisibleApplication();
        setBusy(true);

        await requireSession();

        requireVisibleApplication();

        await operation();

    } catch (error) {
        if (!state.invalidated) {
            if (errorId) {
                formError(errorId, error);
            } else {
                message(errorMessage(error), "error");
            }
        }
    } finally {
        setBusy(false);
    }
}

function setCloudStatus(status, description) {
    text("cloudStatus", description);

    $("cloudStatusIndicator").className =
        `connection-indicator ${status}`;
}

function driveReady() {
    const connection = Cloud.getGoogleDriveConnection();

    return connection.connected &&
        connection.rootAuthorized;
}

function renderDriveConnection() {
    const connection = Cloud.getGoogleDriveConnection();

    const connected = connection.connected;

    text(
        "driveConnectionBadge",
        connected ? "Connected" : "Disconnected"
    );

    $("driveConnectionBadge").className =
        `connection-badge ${connected ? "connected" : "disconnected"}`;

    text(
        "driveAccountEmail",
        connection.email || "Not connected"
    );

    text(
        "driveRootStatus",
        connection.rootAuthorized
            ? "Authorized"
            : "Authorization required"
    );

    text(
        "driveTokenStatus",
        connected
            ? timestampLabel(connection.expiresAt)
            : "Not available"
    );

    disable("connectDriveButton", state.busy || connected);

    disable("disconnectDriveButton", state.busy || !connected);

    disable("authorizeRootButton", state.busy || !connected);

    disable("checkDriveButton", state.busy || !connected);

    disable("selectDriveFileButton", state.busy || !connected);

    disable("initialiseFoldersButton", state.busy || !driveReady());

    disable("openRegistrationRecoveryButton", state.busy || !driveReady());

    disable("openVersionRecoveryButton", state.busy || !driveReady());

    disable("openCurrentFileButton", state.busy || !connected);

    disable("downloadCurrentFileButton", state.busy || !connected);

    const active = state.profile?.document?.status === "active";

    disable("addVersionButton", state.busy || !driveReady() || !active);

    disable("saveVersionButton", state.busy || !driveReady());

    text(
        "driveConnectionMessage",
        driveReady()
            ? "Google Drive is connected and the root folder is authorized."
            : connected
                ? "Authorize the designated root folder before uploading documents."
                : "Connect your authorized Google account to access document files."
    );
}


/* =========================================================
   04. GOOGLE DRIVE OPERATIONS
   ========================================================= */

async function connectDrive() {
    await perform(async () => {
        await Cloud.connectGoogleDrive();

        renderDriveConnection();

        message("Google Drive connected successfully.");
    });
}

async function authorizeRoot() {
    await perform(async () => {
        await Cloud.authorizeRootFolder();

        renderDriveConnection();

        message(
            driveReady()
                ? "Root folder authorized successfully."
                : "Root folder authorization has not been completed.",
            driveReady() ? "success" : "warning"
        );
    });
}

async function checkDrive() {
    await perform(async () => {
        const result = await Cloud.checkRootFolderAccess();

        renderDriveConnection();

        text(
            "driveConnectionMessage",
            JSON.stringify(result, null, 2)
        );
    });
}

async function disconnectDrive() {
    if (state.busy) return;

    Cloud.disconnectGoogleDrive();

    state.selectedDriveFile = null;

    renderSelectedFile();
    renderDriveConnection();

    message("Google Drive disconnected.");
}

async function initialiseFolders() {
    await perform(async () => {
        await Cloud.initialiseDriveFolders();

        message("Google Drive folder structure initialized.");
    });
}


/* =========================================================
   05. NAVIGATION
   ========================================================= */

function activateTab(tab) {
    if (!tabs.includes(tab)) return;

    state.tab = tab;

    show("documentProfilePanel", false);

    tabs.forEach(name => {
        show(`${name}Panel`, name === tab);
    });

    document.querySelectorAll("[data-tab]").forEach(button => {
        const active = button.dataset.tab === tab;

        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
    });

    if (tab === "directory") renderDirectory();

    if (tab === "archived") renderArchived();

    if (tab === "overview") renderOverview();
}

function activateProfileTab(tab) {
    ["summary", "versions", "activity"].forEach(name => {
        const capitalized =
            name.charAt(0).toUpperCase() + name.slice(1);

        show(
            `profile${capitalized}Panel`,
            name === tab
        );
    });

    document.querySelectorAll("[data-profile-tab]").forEach(button => {
        const active = button.dataset.profileTab === tab;

        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
    });
}


/* =========================================================
   06. SELECT OPTIONS
   ========================================================= */

function populateSelect(id, items, placeholder, selected = "") {
    const select = $(id);

    if (!select) return;

    select.replaceChildren();

    select.add(new Option(placeholder, ""));

    items.forEach(item => {
        select.add(
            new Option(item.label, item.value)
        );
    });

    select.value = selected;
}

function categoryOptions() {
    return Object.entries(DOCUMENT_CATEGORIES).map(([key]) => ({
        value: key,
        label: categoryName(key)
    }));
}

function clientOptions() {
    return state.clients.map(client => ({
        value: client.id,
        label: `${client.clientCode} — ${client.fullName}`
    }));
}

function caseOptions(records = state.cases) {
    return records.map(record => ({
        value: record.id,
        label: `${record.caseCode} — ${record.caseTitle}`
    }));
}

function populateOptions() {
    [
        ["documentCategory", categoryOptions(), "Select category"],
        ["recoveryDocumentCategory", categoryOptions(), "Select category"],
        ["categoryFilter", categoryOptions(), "All categories"],
        ["documentClient", clientOptions(), "Select client"],
        ["recoveryClientId", clientOptions(), "Select client"],
        ["clientFilter", clientOptions(), "All clients"],
        ["caseFilter", caseOptions(), "All cases"]
    ].forEach(([id, options, placeholder]) => {
        populateSelect(
            id,
            options,
            placeholder,
            value(id)
        );
    });

    const years = [...new Set(
        state.records.map(record => String(record.registrationYear))
    )].sort().reverse();

    populateSelect(
        "yearFilter",
        years.map(year => ({
            value: year,
            label: year
        })),
        "All years",
        value("yearFilter")
    );
}

async function loadClientCases(
    clientField,
    caseField,
    selectedCase = ""
) {
    const clientId = value(clientField);

    const element = $(caseField);

    const request = String(Date.now()) + Math.random();

    element.dataset.request = request;

    populateSelect(
        caseField,
        [],
        "Client-level document"
    );

    disable(caseField, true);

    if (!clientId) return;

    const records = await Cloud.fetchDocumentCases(clientId);

    if (
        element.dataset.request !== request ||
        value(clientField) !== clientId ||
        state.invalidated
    ) return;

    populateSelect(
        caseField,
        caseOptions(records),
        "Client-level document",
        selectedCase
    );

    disable(caseField, false);

    updateAssociationSummary();
}

function updateAssociationSummary() {
    const client = state.clients.find(
        item => item.id === value("documentClient")
    );

    text(
        "selectedClientSummary",
        client
            ? `${client.clientCode} — ${client.fullName}`
            : ""
    );

    show("selectedClientSummary", Boolean(client));

    const selectedCase = $("documentCase").selectedOptions[0];

    text(
        "selectedCaseSummary",
        value("documentCase")
            ? selectedCase?.textContent
            : ""
    );

    show("selectedCaseSummary", Boolean(value("documentCase")));
}


/* =========================================================
   07. FIRESTORE SYNCHRONIZATION
   ========================================================= */

async function synchronize() {
    setCloudStatus("syncing", "Synchronizing document records...");

    try {
        await requireSession();

        const [records, clients, cases, nextCode] =
            await Promise.all([
                Cloud.fetchDocuments({ includeArchived: true }),
                Cloud.fetchDocumentClients(),
                Cloud.fetchDocumentCases(),
                Cloud.getNextDocumentCode()
            ]);

        if (
            state.invalidated ||
            auth.currentUser?.uid !== state.userId
        ) {
            throw new Error("Administrator session changed.");
        }

        state.records = records;
        state.clients = clients;
        state.cases = cases;
        state.connected = true;
        state.lastSync = new Date();

        text("nextDocumentCode", nextCode);

        if (!value("editingDocumentId")) {
            setValue("documentCode", nextCode);
        }

        text(
            "lastSynced",
            `Last synchronized: ${timestampLabel(state.lastSync)}`
        );

        populateOptions();

        renderOverview();
        renderDirectory();
        renderArchived();

        setCloudStatus("connected", "Firestore connected");

    } catch (error) {
        state.connected = false;

        setCloudStatus("error", "Synchronization failed");

        throw error;
    }
}

async function refreshDocuments() {
    await perform(async () => {
        await synchronize();

        if (state.profile && !$("documentProfilePanel").hidden) {
            await loadProfile(state.profile.document.id);
        }

        message("Document records refreshed.");
    });
}

async function refreshAfterCommit(documentId = null) {
    try {
        await synchronize();

        if (documentId) {
            await loadProfile(documentId);
        }

    } catch (error) {
        message(
            "The operation was saved, but the interface could not refresh. Use Refresh before repeating any operation.",
            "warning"
        );
    }
}


/* =========================================================
   08. OVERVIEW
   ========================================================= */

function renderOverview() {
    const statistics =
        Cloud.calculateDocumentStatistics(state.records);

    [
        "totalDocuments",
        "activeDocuments",
        "caseDocuments",
        "clientDocuments",
        "documentsThisMonth",
        "archivedDocuments",
        "totalVersions"
    ].forEach(key => {
        text(key, statistics[key] || 0);
    });

    const categories = Object.entries(
        statistics.categoryCounts || {}
    );

    $("categorySummary").innerHTML = categories.map(
        ([category, count]) => `
            <div class="category-summary-item">
                <div class="category-icon">
                    <i class="fa-solid fa-folder"></i>
                </div>
                <strong>${escapeHTML(categoryName(category))}</strong>
                <span class="category-count">${Number(count)}</span>
            </div>
        `
    ).join("");

    show("emptyCategorySummary", categories.length === 0);

    const recent = state.records
        .filter(record => record.status === "active")
        .slice(0, 5);

    renderRows("recentDocumentsBody", recent);

    show("emptyRecentDocuments", recent.length === 0);
}


/* =========================================================
   09. DOCUMENT DIRECTORY
   ========================================================= */

function clientName(id) {
    return state.clients.find(
        item => item.id === id
    )?.fullName || id || "Not available";
}

function caseTitle(id) {
    if (!id) return "Client-level document";

    return state.cases.find(
        item => item.id === id
    )?.caseTitle || id;
}

function enrichedRecords() {
    return state.records.map(record => ({
        ...record,
        clientName: clientName(record.clientId),
        caseTitle: caseTitle(record.caseId)
    }));
}

function filteredDocuments() {
    return Cloud.filterDocuments(
        enrichedRecords(),
        {
            status: "active",
            search: value("documentSearch"),
            category: value("categoryFilter"),
            clientId: value("clientFilter"),
            caseId: value("caseFilter"),
            year: value("yearFilter")
        }
    );
}

function statusBadge(status) {
    const archived = status === "archived";

    return `
        <span class="status-badge ${archived ? "archived" : "active"}">
            ${archived ? "Archived" : "Active"}
        </span>
    `;
}

function openButton(id) {
    return `
        <button
            type="button"
            class="button button-secondary button-small"
            data-action="profile"
            data-id="${escapeHTML(id)}">
            <i class="fa-solid fa-eye"></i>
            View
        </button>
    `;
}

function renderRows(bodyId, records) {
    const body = $(bodyId);

    if (!body) return;

    body.innerHTML = records.map(record => {

        const code = `
            <span class="document-code">
                ${escapeHTML(record.documentCode)}
            </span>
        `;

        const title = `
            <strong>${escapeHTML(record.title)}</strong>
        `;

        const category = escapeHTML(
            categoryName(record.category)
        );

        const client = escapeHTML(
            clientName(record.clientId)
        );

        const matter = escapeHTML(
            caseTitle(record.caseId)
        );

        const version = `
            <span class="version-badge">
                V${Number(record.currentVersion)}
            </span>
        `;

        const date = escapeHTML(
            dateLabel(record.documentDate)
        );

        const actions = openButton(record.id);

        const table = body.closest("table");

        const headings = Array.from(
            table?.querySelectorAll("thead th") || []
        );

        const cells = headings.map(heading => {
            const name = heading.textContent
                .trim()
                .toLowerCase();

            if (/action|view/.test(name)) return actions;
            if (/archived.*date|archived.*on/.test(name)) {
                return escapeHTML(timestampLabel(record.archivedAt));
            }
            if (/reason/.test(name)) {
                return escapeHTML(record.archiveReason || "");
            }
            if (/version/.test(name)) return version;
            if (/category|type/.test(name)) return category;
            if (/status/.test(name)) return statusBadge(record.status);
            if (/client/.test(name)) return client;
            if (/case|matter/.test(name)) return matter;
            if (/date/.test(name)) return date;
            if (/updated/.test(name)) {
                return escapeHTML(timestampLabel(record.updatedAt));
            }
            if (/created|registered/.test(name)) {
                return escapeHTML(timestampLabel(record.createdAt));
            }
            if (/code|document id|reference/.test(name)) return code;
            if (/title|document name|document/.test(name)) {
                return `${title}<small>${code}</small>`;
            }

            return "—";
        });

        return `<tr>${cells.map(cell =>
            `<td>${cell}</td>`
        ).join("")}</tr>`;

    }).join("");
}

function renderDirectory() {
    const records = filteredDocuments();

    const pages = Math.max(
        1,
        Math.ceil(records.length / state.pageSize)
    );

    state.page = Math.min(state.page, pages);

    const start = (state.page - 1) * state.pageSize;

    renderRows(
        "documentsTableBody",
        records.slice(start, start + state.pageSize)
    );

    text(
        "documentResultCount",
        `${records.length} document(s) found`
    );

    text(
        "paginationInfo",
        `Page ${state.page} of ${pages}`
    );

    disable("previousPageButton", state.page <= 1);
    disable("nextPageButton", state.page >= pages);

    show("emptyDocumentDirectory", records.length === 0);
}

function renderArchived() {
    const records = Cloud.filterDocuments(
        enrichedRecords(),
        {
            status: "archived",
            search: value("archivedDocumentSearch")
        }
    );

    renderRows("archivedDocumentsBody", records);

    text(
        "archivedResultCount",
        `${records.length} archived document(s)`
    );

    show("emptyArchivedDocuments", records.length === 0);
}

function clearFilters() {
    [
        "documentSearch",
        "categoryFilter",
        "clientFilter",
        "caseFilter",
        "yearFilter"
    ].forEach(id => setValue(id, ""));

    state.page = 1;

    renderDirectory();
}


/* =========================================================
   10. FILE SELECTION
   ========================================================= */

function selectLocalFile(file) {
    if (!file) return;

    const validation = validateDocumentFile(file);

    if (!validation.valid) {
        throw new Error(validation.errors.join(" "));
    }

    state.selectedFile = file;
    state.selectedDriveFile = null;
    state.pendingId = null;

    renderSelectedFile();
}

function removeSelectedFile() {
    state.selectedFile = null;
    state.selectedDriveFile = null;
    state.pendingId = null;

    setValue("documentFile", "");

    renderSelectedFile();
}

function renderSelectedFile() {
    const file = state.selectedFile;
    const driveFile = state.selectedDriveFile;

    const selected = file || driveFile;

    show("selectedFileCard", Boolean(selected));

    if (selected) {
        text(
            "selectedFileName",
            file ? file.name : driveFile.fileName
        );

        text(
            "selectedFileSize",
            formatFileSize(file ? file.size : driveFile.sizeBytes)
        );

        text(
            "selectedFileType",
            file ? file.type : driveFile.mimeType
        );
    }

    updateSaveAvailability();
}

function updateSource() {
    const upload = $("sourceUpload").checked;

    show("uploadSourcePanel", upload);
    show("driveSourcePanel", !upload);

    removeSelectedFile();
}

async function selectDriveFile() {
    await perform(async () => {
        const file = await Cloud.selectGoogleDriveDocument();

        if (!file) return;

        state.selectedDriveFile = file;
        state.selectedFile = null;
        state.pendingId = null;

        renderSelectedFile();
    }, "documentFormError");
}

function updateSaveAvailability() {
    const editing = Boolean(value("editingDocumentId"));

    const hasFile = Boolean(
        state.selectedFile || state.selectedDriveFile
    );

    disable(
        "saveDocumentButton",
        state.busy ||
        !state.connected ||
        (!editing && (!driveReady() || !hasFile))
    );
}


/* =========================================================
   11. DOCUMENT REGISTRATION FORM
   ========================================================= */

function resetDocumentForm() {
    $("documentForm").reset();

    setValue("editingDocumentId", "");
    setValue("editingDocumentRevision", "");
    setValue("documentDate", getIndianDate());

    setValue(
        "documentCode",
        $("nextDocumentCode").textContent ||
        "Assigned on registration"
    );

    disable("documentClient", false);
    disable("documentCase", true);

    populateSelect(
        "documentCase",
        [],
        "Client-level document"
    );

    show("fileSourceSection", true);
    show("cancelDocumentEditButton", false);

    text("documentFormHeading", "Register New Document");

    text("saveDocumentButtonText", "Register Document");

    clearError("documentFormError");

    state.pendingId = null;

    updateSource();
    updateAssociationSummary();
}

function readDocumentForm() {
    return {
        title: value("documentTitle").trim(),
        category: value("documentCategory"),
        documentDate: value("documentDate"),
        clientId: value("documentClient"),
        caseId: value("documentCase"),
        description: value("documentDescription").trim(),
        versionNotes: value("documentVersionNotes").trim()
    };
}

function showUploadProgress(visible, title = "", description = "") {
    show("uploadProgressCard", visible);

    text("uploadProgressTitle", title);

    text("uploadProgressMessage", description);

    if ($("uploadProgress")) {
        $("uploadProgress").removeAttribute("value");
    }
}

async function saveDocument(event) {
    event.preventDefault();

    if (!$("documentForm").reportValidity()) return;

    await perform(async () => {

        const input = readDocumentForm();

        const editingId = value("editingDocumentId");

        if (editingId) {
            const revision = Number(
                value("editingDocumentRevision")
            );

            await Cloud.updateDocument(
                editingId,
                input,
                revision
            );

            resetDocumentForm();

            message("Document details updated.");

            await refreshAfterCommit(editingId);

            return;
        }

        if (!driveReady()) {
            throw new Error("Connect and authorize Google Drive first.");
        }

        if (!state.selectedFile && !state.selectedDriveFile) {
            throw new Error("Select a document file.");
        }

        Cloud.validateDocumentData(input);

        state.pendingId ||= Cloud.generateDocumentId();

        showUploadProgress(
            true,
            "Registering document",
            "Saving the file to Google Drive and registering its metadata."
        );

        try {
            let result;

            if (state.selectedFile) {
                result = await Cloud.createDocument(
                    input,
                    state.selectedFile,
                    state.pendingId
                );
            } else {
                result = await Cloud.importDocument(
                    input,
                    state.selectedDriveFile.driveFileId,
                    state.pendingId
                );
            }

            const documentId = result?.id || state.pendingId;

            resetDocumentForm();

            message("Document registered successfully.");

            await refreshAfterCommit(documentId);

        } catch (error) {
            if (error.code === "dms/registration-pending") {
                showRecoveryInformation(error, input, "registration");
            }

            throw error;

        } finally {
            showUploadProgress(false);
        }

    }, "documentFormError");
}


/* =========================================================
   12. DOCUMENT PROFILE
   ========================================================= */

async function loadProfile(documentId) {
    const profile = await Cloud.fetchDocumentProfile(documentId);

    if (state.invalidated) return;

    state.profile = profile;

    tabs.forEach(tab => show(`${tab}Panel`, false));

    show("documentProfilePanel");

    renderProfile();

    activateProfileTab("summary");
}

function renderProfile() {
    const profile = state.profile;

    if (!profile) return;

    const record = profile.document;

    const current = profile.currentVersion;

    const archived = record.status === "archived";

    const fields = {
        profileDocumentCode: record.documentCode,
        profileDocumentTitle: record.title,
        profileDocumentCategory: categoryName(record.category),
        profileDocumentVersion: `Version ${record.currentVersion}`,
        profileDocumentStatus: archived ? "Archived" : "Active",
        profileDetailsCode: record.documentCode,
        profileDetailsDate: dateLabel(record.documentDate),
        profileDetailsCategory: categoryName(record.category),
        profileDetailsVersion: record.currentVersion,
        profileDetailsClient: profile.client?.fullName || record.clientId,
        profileDetailsCase: profile.case?.caseTitle || "Client-level document",
        profileCreatedAt: timestampLabel(record.createdAt),
        profileUpdatedAt: timestampLabel(record.updatedAt),
        profileDescription: record.description || "No description",
        currentFileName: current?.fileName || "Not available",
        currentFileSize: current ? formatFileSize(current.sizeBytes) : "—",
        currentFileMimeType: current?.mimeType || "—",
        currentFileVersion: current?.version || "—",
        currentVersionCreatedAt: timestampLabel(current?.createdAt),
        currentVersionNotes: current?.notes || "No version notes",
        linkedClientName: profile.client?.fullName || "Not available",
        linkedClientCode: profile.client?.clientCode || record.clientId,
        linkedCaseTitle: profile.case?.caseTitle || "No linked case",
        linkedCaseCode: profile.case?.caseCode || "",
        profileArchivedAt: timestampLabel(record.archivedAt),
        profileArchiveReason: record.archiveReason || ""
    };

    Object.entries(fields).forEach(([id, content]) => {
        text(id, content);
    });

    $("profileDocumentStatus").className =
        `status-badge ${archived ? "archived" : "active"}`;

    show("archiveDetails", archived);
    show("archiveDocumentButton", !archived);
    show("restoreDocumentButton", archived);
    show("editDocumentButton", !archived);

    disable("openLinkedClientButton", !profile.client);
    disable("openLinkedCaseButton", !profile.case);
    disable("addDocumentNoteButton", archived);

    renderVersions();
    renderActivities();
    renderDriveConnection();
}


/* =========================================================
   13. DOCUMENT METADATA EDITING
   ========================================================= */

async function editDocument() {
    await perform(async () => {
        const record = state.profile?.document;

        if (!record || record.status !== "active") return;

        resetDocumentForm();

        setValue("editingDocumentId", record.id);
        setValue("editingDocumentRevision", record.revision);
        setValue("documentCode", record.documentCode);
        setValue("documentTitle", record.title);
        setValue("documentCategory", record.category);
        setValue("documentDate", record.documentDate);
        setValue("documentDescription", record.description);

        if (!state.clients.some(client => client.id === record.clientId)) {
            $("documentClient").add(
                new Option(
                    state.profile.client?.fullName || record.clientId,
                    record.clientId
                )
            );
        }

        setValue("documentClient", record.clientId);

        populateSelect(
            "documentCase",
            record.caseId
                ? [{
                    value: record.caseId,
                    label: state.profile.case?.caseTitle || record.caseId
                }]
                : [],
            "Client-level document",
            record.caseId
        );

        disable("documentClient", true);
        disable("documentCase", true);

        show("fileSourceSection", false);
        show("cancelDocumentEditButton");

        text("documentFormHeading", "Edit Document Details");

        text("saveDocumentButtonText", "Save Changes");

        updateAssociationSummary();

        activateTab("registration");

        updateSaveAvailability();
    });
}


/* =========================================================
   14. OPEN AND DOWNLOAD DOCUMENT
   ========================================================= */

async function openDocumentFile(documentId, version = null) {
    if (state.busy) return;

    const popup = window.open("about:blank", "_blank");

    if (!popup) {
        message("Allow browser pop-ups to open the document.", "warning");
        return;
    }

    popup.opener = null;

    try {
        requireVisibleApplication();

        setBusy(true);

        await requireSession();

        const result = await Cloud.getDocumentOpenUrl(
            documentId,
            version
        );

        const url = new URL(
            typeof result === "string" ? result : result.url
        );

        if (
            url.protocol !== "https:" ||
            !["drive.google.com", "docs.google.com"].includes(url.hostname)
        ) {
            throw new Error("Invalid document viewer URL.");
        }

        requireVisibleApplication();

        popup.location.replace(url.href);

    } catch (error) {
        popup.close();

        message(errorMessage(error), "error");

    } finally {
        setBusy(false);
    }
}

async function downloadFile(documentId, version = null) {
    await perform(async () => {
        await Cloud.downloadDocument(documentId, version);

        message("Document download requested.");
    });
}


/* =========================================================
   15. VERSION HISTORY
   ========================================================= */

function renderVersions() {
    const versions = state.profile?.versions || [];

    const body = $("documentVersionsBody");

    body.innerHTML = versions.map(version => {

        const number = Number(version.version);

        const current =
            number === Number(state.profile.document.currentVersion);

        const actions = `
            <div class="table-actions">
                <button
                    type="button"
                    class="button button-secondary button-small"
                    data-action="open-version"
                    data-version="${number}">
                    Open
                </button>
                <button
                    type="button"
                    class="button button-secondary button-small"
                    data-action="download-version"
                    data-version="${number}">
                    Download
                </button>
            </div>
        `;

        const headings = Array.from(
            body.closest("table")?.querySelectorAll("thead th") || []
        );

        const cells = headings.map(heading => {
            const name = heading.textContent.trim().toLowerCase();

            if (/action/.test(name)) return actions;
            if (/version/.test(name)) {
                return `
                    <span class="version-badge ${current ? "current" : ""}">
                        V${number}${current ? " — Current" : ""}
                    </span>
                `;
            }
            if (/size/.test(name)) {
                return escapeHTML(formatFileSize(version.sizeBytes));
            }
            if (/date|created|uploaded/.test(name)) {
                return escapeHTML(timestampLabel(version.createdAt));
            }
            if (/notes|description/.test(name)) {
                return escapeHTML(version.notes || "—");
            }
            if (/status/.test(name)) {
                return current ? "Current" : "Previous";
            }
            if (/type/.test(name)) {
                return escapeHTML(version.mimeType);
            }

            return escapeHTML(version.fileName);
        });

        return `<tr>${cells.map(cell =>
            `<td>${cell}</td>`
        ).join("")}</tr>`;

    }).join("");

    show("emptyVersionHistory", versions.length === 0);
}

function openVersionDialog() {
    const record = state.profile?.document;

    if (!record || record.status !== "active") return;

    $("versionForm").reset();

    clearError("versionFormError");

    setValue("versionDocumentId", record.id);
    setValue("versionExpectedRevision", record.revision);

    text("versionDocumentTitle", record.title);
    text("versionDocumentCode", record.documentCode);
    text("versionNumberPreview", `Version ${record.currentVersion + 1}`);

    state.versionOperationId = null;

    show("versionUploadProgress", false);

    $("versionDialog").showModal();
}

async function saveVersion(event) {
    event.preventDefault();

    if (!$("versionForm").reportValidity()) return;

    await perform(async () => {
        const id = value("versionDocumentId");

        const file = $("versionFile").files[0];

        const notes = value("versionNotes");

        const revision = Number(
            value("versionExpectedRevision")
        );

        const validation = validateDocumentFile(file);

        if (!validation.valid) {
            throw new Error(validation.errors.join(" "));
        }

        state.versionOperationId ||= Cloud.generateDocumentId();

        show("versionUploadProgress");

        try {
            await Cloud.addDocumentVersion(
                id,
                file,
                notes,
                revision,
                state.versionOperationId
            );

            $("versionDialog").close();

            state.versionOperationId = null;

            message("New document version registered.");

            await refreshAfterCommit(id);

        } catch (error) {
            if (error.code === "dms/version-pending") {
                $("versionDialog").close();

                showRecoveryInformation(
                    error,
                    { notes },
                    "version"
                );
            }

            throw error;

        } finally {
            show("versionUploadProgress", false);
        }

    }, "versionFormError");
}


/* =========================================================
   16. ARCHIVE AND RESTORE
   ========================================================= */

function openArchiveDialog() {
    const record = state.profile?.document;

    if (!record || record.status !== "active") return;

    $("archiveForm").reset();

    clearError("archiveFormError");

    setValue("archiveDocumentId", record.id);
    setValue("archiveExpectedRevision", record.revision);

    $("archiveDialog").showModal();
}

async function archiveDocument(event) {
    event.preventDefault();

    await perform(async () => {
        const id = value("archiveDocumentId");

        await Cloud.archiveDocument(
            id,
            value("archiveReason"),
            Number(value("archiveExpectedRevision"))
        );

        $("archiveDialog").close();

        message("Document archived. Original files retained.");

        await refreshAfterCommit(id);

    }, "archiveFormError");
}

function openRestoreDialog() {
    const record = state.profile?.document;

    if (!record || record.status !== "archived") return;

    clearError("restoreFormError");

    setValue("restoreDocumentId", record.id);
    setValue("restoreExpectedRevision", record.revision);

    $("restoreDialog").showModal();
}

async function restoreDocument(event) {
    event.preventDefault();

    await perform(async () => {
        const id = value("restoreDocumentId");

        await Cloud.reactivateDocument(
            id,
            Number(value("restoreExpectedRevision"))
        );

        $("restoreDialog").close();

        message("Document restored successfully.");

        await refreshAfterCommit(id);

    }, "restoreFormError");
}


/* =========================================================
   17. DOCUMENT ACTIVITY AND NOTES
   ========================================================= */

function renderActivities() {
    const activities = state.profile?.activities || [];

    $("documentActivityTimeline").innerHTML =
        activities.map(activity => `
            <article class="activity-item">
                <div class="activity-icon">
                    <i class="fa-solid fa-clock-rotate-left"></i>
                </div>
                <div class="activity-content">
                    <h3>
                        ${escapeHTML(
                            Cloud.DMS_CONFIG.activityTypes[activity.type]
                            || activity.type
                            || "Document Activity"
                        )}
                    </h3>
                    <p>${escapeHTML(activity.description || "")}</p>
                    <small>
                        ${escapeHTML(timestampLabel(activity.createdAt))}
                    </small>
                </div>
            </article>
        `).join("");

    show("emptyDocumentActivities", activities.length === 0);
}

function openNoteDialog() {
    const record = state.profile?.document;

    if (!record || record.status !== "active") return;

    $("noteForm").reset();

    clearError("noteFormError");

    setValue("noteDocumentId", record.id);

    $("noteDialog").showModal();
}

async function saveNote(event) {
    event.preventDefault();

    await perform(async () => {
        const id = value("noteDocumentId");

        await Cloud.addDocumentNote(
            id,
            value("documentNote")
        );

        $("noteDialog").close();

        message("Document note added.");

        await loadProfile(id);

        activateProfileTab("activity");

    }, "noteFormError");
}


/* =========================================================
   18. FAILED REGISTRATION RECOVERY
   ========================================================= */

function showRecoveryInformation(error, input, type) {
    const details = {
        documentId: error.documentId || error.details?.documentId,
        driveFileId: error.driveFileId || error.details?.driveFileId,
        operationId: error.operationId || error.details?.operationId,
        expectedRevision:
            error.expectedRevision || error.details?.expectedRevision,
        intendedVersion:
            error.intendedVersion || error.details?.intendedVersion
    };

    state.recovery = {
        type,
        details,
        input
    };

    text(
        "recoveryInformation",
        JSON.stringify(state.recovery, null, 2)
    );

    if (!$("recoveryInformationDialog").open) {
        $("recoveryInformationDialog").showModal();
    }
}

async function copyRecoveryInformation() {
    try {
        await navigator.clipboard.writeText(
            $("recoveryInformation").textContent
        );

        message(
            "Recovery information copied. Keep it confidential."
        );

    } catch {
        message(
            "Clipboard unavailable. Select and copy the recovery information manually.",
            "warning"
        );
    }
}

function openRegistrationRecovery() {
    $("registrationRecoveryForm").reset();

    clearError("registrationRecoveryError");

    populateSelect(
        "recoveryCaseId",
        [],
        "Client-level document"
    );

    disable("recoveryCaseId", true);

    $("registrationRecoveryDialog").showModal();
}

function openVersionRecovery() {
    $("versionRecoveryForm").reset();

    clearError("versionRecoveryError");

    $("versionRecoveryDialog").showModal();
}

async function continueRecovery() {
    const recovery = state.recovery;

    if (!recovery) return;

    $("recoveryInformationDialog").close();

    const details = recovery.details;

    if (recovery.type === "registration") {
        openRegistrationRecovery();

        const input = recovery.input;

        setValue("recoveryDocumentId", details.documentId);
        setValue("recoveryDriveFileId", details.driveFileId);
        setValue("recoveryDocumentTitle", input.title);
        setValue("recoveryDocumentCategory", input.category);
        setValue("recoveryDocumentDate", input.documentDate);
        setValue("recoveryClientId", input.clientId);
        setValue("recoveryDescription", input.description);
        setValue("recoveryVersionNotes", input.versionNotes);

        try {
            await loadClientCases(
                "recoveryClientId",
                "recoveryCaseId",
                input.caseId
            );
        } catch (error) {
            formError("registrationRecoveryError", error);
        }

    } else {
        openVersionRecovery();

        setValue("recoveryVersionDocumentId", details.documentId);
        setValue("recoveryVersionFileId", details.driveFileId);
        setValue("recoveryOperationId", details.operationId);
        setValue("recoveryExpectedRevision", details.expectedRevision);
        setValue("recoveryIntendedVersion", details.intendedVersion);
        setValue("recoveryNewVersionNotes", recovery.input.notes);
    }
}

async function recoverRegistration(event) {
    event.preventDefault();

    await perform(async () => {
        const id = value("recoveryDocumentId").trim();

        const input = {
            title: value("recoveryDocumentTitle"),
            category: value("recoveryDocumentCategory"),
            documentDate: value("recoveryDocumentDate"),
            clientId: value("recoveryClientId"),
            caseId: value("recoveryCaseId"),
            description: value("recoveryDescription"),
            versionNotes: value("recoveryVersionNotes")
        };

        await Cloud.recoverDocumentRegistration(
            input,
            id,
            value("recoveryDriveFileId").trim()
        );

        $("registrationRecoveryDialog").close();

        state.recovery = null;

        resetDocumentForm();

        message("Document registration recovered successfully.");

        await refreshAfterCommit(id);

    }, "registrationRecoveryError");
}

async function recoverVersion(event) {
    event.preventDefault();

    await perform(async () => {
        const id = value("recoveryVersionDocumentId").trim();

        await Cloud.recoverDocumentVersion(
            id,
            value("recoveryVersionFileId").trim(),
            value("recoveryOperationId").trim(),
            value("recoveryNewVersionNotes"),
            Number(value("recoveryExpectedRevision")),
            Number(value("recoveryIntendedVersion"))
        );

        $("versionRecoveryDialog").close();

        state.recovery = null;
        state.versionOperationId = null;

        message("Document version recovered successfully.");

        await refreshAfterCommit(id);

    }, "versionRecoveryError");
}


/* =========================================================
   19. CONFIRMATION DIALOG
   ========================================================= */

function confirmAction(title, description) {
    return new Promise(resolve => {
        const dialog = $("confirmationDialog");

        text("confirmationTitle", title);
        text("confirmationMessage", description);

        let accepted = false;

        $("acceptConfirmation").onclick = () => {
            accepted = true;
            dialog.close();
        };

        $("cancelConfirmation").onclick = () => {
            dialog.close();
        };

        dialog.addEventListener("close", () => {
            resolve(accepted);
        }, { once: true });

        dialog.showModal();
    });
}


/* =========================================================
   20. EXPORT AND BACKUP
   ========================================================= */

function downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], {
        type: mimeType
    });

    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;

    document.body.appendChild(anchor);

    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function exportDocuments(all = false) {
    await perform(async () => {
        const confirmed = await confirmAction(
            "Export Confidential Records",
            "The exported CSV contains confidential legal document metadata. Store it securely."
        );

        if (!confirmed) return;

        await requireSession();

        requireVisibleApplication();

        const records = all
            ? state.records
            : filteredDocuments();

        const csv = Cloud.generateDocumentCSV(records);

        downloadBlob(
            csv,
            `MNM-Documents-${getIndianDate()}.csv`,
            "text/csv;charset=utf-8"
        );

        message("Document register exported.");
    });
}

async function backupDocuments() {
    await perform(async () => {
        const confirmed = await confirmAction(
            "Create Metadata Backup",
            "This backup contains confidential metadata, not the original Google Drive files. The exported JSON is not encrypted."
        );

        if (!confirmed) return;

        const backup = await Cloud.createDocumentBackup();

        await requireSession();

        requireVisibleApplication();

        downloadBlob(
            JSON.stringify(backup, null, 2),
            `MNM-Document-Backup-${getIndianDate()}.json`,
            "application/json"
        );

        message("Document metadata backup created.");
    });
}


/* =========================================================
   21. CLOUD CONNECTION TEST
   ========================================================= */

async function testCloudConnection() {
    await perform(async () => {
        const result = await Cloud.checkDocumentCloudConnection();

        text(
            "settingsConnectionResult",
            JSON.stringify(result, null, 2)
        );

        show("settingsConnectionResult");
    });
}


/* =========================================================
   22. CLIENT AND CASE NAVIGATION
   ========================================================= */

async function openLinkedClient() {
    await perform(async () => {
        const clientId = state.profile?.document?.clientId;

        if (!clientId) return;

        window.location.href =
            `/clients.html?clientId=${encodeURIComponent(clientId)}`;
    });
}

async function openLinkedCase() {
    await perform(async () => {
        const caseId = state.profile?.document?.caseId;

        if (!caseId) return;

        window.location.href =
            `/cases.html?caseId=${encodeURIComponent(caseId)}`;
    });
}


/* =========================================================
   23. EVENT BINDINGS
   ========================================================= */

function bindClick(id, callback) {
    $(id)?.addEventListener("click", callback);
}

function bindSubmit(id, callback) {
    $(id)?.addEventListener("submit", callback);
}

function bindEvents() {

    bindClick("connectDriveButton", connectDrive);
    bindClick("authorizeRootButton", authorizeRoot);
    bindClick("checkDriveButton", checkDrive);
    bindClick("disconnectDriveButton", disconnectDrive);
    bindClick("initialiseFoldersButton", initialiseFolders);

    bindClick("refreshDocumentsButton", refreshDocuments);

    bindClick("selectDriveFileButton", selectDriveFile);
    bindClick("removeSelectedFileButton", removeSelectedFile);

    bindClick("resetDocumentFormButton", () => {
        if (!state.busy) resetDocumentForm();
    });

    bindClick("cancelDocumentEditButton", () => {
        if (state.busy) return;

        resetDocumentForm();

        if (state.profile) {
            tabs.forEach(tab => show(`${tab}Panel`, false));
            show("documentProfilePanel");
            renderProfile();
        } else {
            activateTab("directory");
        }
    });

    bindClick("clearFiltersButton", clearFilters);

    bindClick("previousPageButton", () => {
        state.page = Math.max(1, state.page - 1);
        renderDirectory();
    });

    bindClick("nextPageButton", () => {
        state.page++;
        renderDirectory();
    });

    bindClick("backToDirectoryButton", () => {
        activateTab("directory");
    });

    bindClick("editDocumentButton", editDocument);

    bindClick("openCurrentFileButton", () => {
        if (state.profile) {
            openDocumentFile(state.profile.document.id);
        }
    });

    bindClick("downloadCurrentFileButton", () => {
        if (state.profile) {
            downloadFile(state.profile.document.id);
        }
    });

    bindClick("addVersionButton", openVersionDialog);
    bindClick("archiveDocumentButton", openArchiveDialog);
    bindClick("restoreDocumentButton", openRestoreDialog);
    bindClick("addDocumentNoteButton", openNoteDialog);

    bindClick("openLinkedClientButton", openLinkedClient);
    bindClick("openLinkedCaseButton", openLinkedCase);

    bindClick("openRegistrationRecoveryButton", openRegistrationRecovery);
    bindClick("openVersionRecoveryButton", openVersionRecovery);

    bindClick("copyRecoveryInformationButton", copyRecoveryInformation);
    bindClick("continueRecoveryButton", continueRecovery);

    bindClick("exportDocumentsButton", () => exportDocuments(false));
    bindClick("exportAllDocumentsButton", () => exportDocuments(true));

    bindClick("backupDocumentsButton", backupDocuments);
    bindClick("testCloudConnectionButton", testCloudConnection);

    bindSubmit("documentForm", saveDocument);
    bindSubmit("versionForm", saveVersion);
    bindSubmit("archiveForm", archiveDocument);
    bindSubmit("restoreForm", restoreDocument);
    bindSubmit("noteForm", saveNote);

    bindSubmit("registrationRecoveryForm", recoverRegistration);
    bindSubmit("versionRecoveryForm", recoverVersion);

    ["sourceUpload", "sourceDrive"].forEach(id => {
        $(id).addEventListener("change", updateSource);
    });

    $("documentFile").addEventListener("change", event => {
        try {
            clearError("documentFormError");

            selectLocalFile(event.target.files[0]);

        } catch (error) {
            removeSelectedFile();
            formError("documentFormError", error);
        }
    });

    $("versionFile").addEventListener("change", event => {
        const file = event.target.files[0];

        state.versionOperationId = null;

        text(
            "versionSelectedFile",
            file
                ? `${file.name} — ${formatFileSize(file.size)}`
                : ""
        );
    });

    $("documentClient").addEventListener("change", async () => {
        try {
            state.pendingId = null;

            await loadClientCases(
                "documentClient",
                "documentCase"
            );

        } catch (error) {
            formError("documentFormError", error);
        }
    });

    $("documentCase").addEventListener("change", () => {
        state.pendingId = null;
        updateAssociationSummary();
    });

    $("recoveryClientId").addEventListener("change", async () => {
        try {
            await loadClientCases(
                "recoveryClientId",
                "recoveryCaseId"
            );
        } catch (error) {
            formError("registrationRecoveryError", error);
        }
    });

    $("documentSearch").addEventListener("input", () => {
        state.page = 1;
        renderDirectory();
    });

    [
        "categoryFilter",
        "clientFilter",
        "caseFilter",
        "yearFilter"
    ].forEach(id => {
        $(id).addEventListener("change", () => {
            state.page = 1;
            renderDirectory();
        });
    });

    $("archivedDocumentSearch").addEventListener(
        "input",
        renderArchived
    );

    bindDropZone();

    document.addEventListener("click", handleDelegatedClick);

    document.addEventListener("keydown", handleTabKeyboard);

    window.addEventListener("offline", () => {
        setCloudStatus("offline", "Internet connection unavailable");
    });

    window.addEventListener("online", () => {
        if (!state.invalidated && !$("protectedContent").hidden) {
            message(
                "Internet connection restored. Refresh the document register.",
                "warning"
            );
        }
    });

    window.addEventListener("beforeunload", event => {
        if (state.busy || state.recovery) {
            event.preventDefault();
            event.returnValue = "";
        }
    });

    window.addEventListener("focus", () => {
        if (!state.invalidated) {
            renderDriveConnection();
            updateSaveAvailability();
        }
    });
}


/* =========================================================
   24. DRAG AND DROP
   ========================================================= */

function bindDropZone() {
    const zone = $("documentDropZone");

    ["dragenter", "dragover"].forEach(name => {
        zone.addEventListener(name, event => {
            event.preventDefault();

            if (!state.busy) {
                zone.classList.add("drag-over");
            }
        });
    });

    ["dragleave", "drop"].forEach(name => {
        zone.addEventListener(name, event => {
            event.preventDefault();
            zone.classList.remove("drag-over");
        });
    });

    zone.addEventListener("drop", event => {
        if (state.busy) return;

        try {
            const files = event.dataTransfer.files;

            if (files.length !== 1) {
                throw new Error("Select one document at a time.");
            }

            clearError("documentFormError");

            selectLocalFile(files[0]);

        } catch (error) {
            formError("documentFormError", error);
        }
    });

    if (zone.tagName !== "LABEL") {
        zone.addEventListener("click", event => {
            if (
                !state.busy &&
                event.target !== $("documentFile")
            ) {
                $("documentFile").click();
            }
        });
    }

    zone.addEventListener("keydown", event => {
        if (
            !state.busy &&
            ["Enter", " "].includes(event.key)
        ) {
            event.preventDefault();

            $("documentFile").click();
        }
    });
}


/* =========================================================
   25. DELEGATED ACTIONS
   ========================================================= */

function handleDelegatedClick(event) {
    const button = event.target.closest("button");

    if (!button) return;

    if (button.dataset.closeDialog) {
        if (!state.busy) {
            $(button.dataset.closeDialog)?.close();
        }
        return;
    }

    if (state.busy || state.invalidated) return;

    if (button.dataset.tab) {
        activateTab(button.dataset.tab);
        return;
    }

    if (button.dataset.openTab) {
        activateTab(button.dataset.openTab);
        return;
    }

    if (button.dataset.profileTab) {
        activateProfileTab(button.dataset.profileTab);
        return;
    }

    if (button.dataset.quickAction) {
        resetDocumentForm();

        activateTab("registration");

        const upload =
            button.dataset.quickAction === "upload";

        $("sourceUpload").checked = upload;
        $("sourceDrive").checked = !upload;

        updateSource();

        return;
    }

    const action = button.dataset.action;

    if (action === "profile") {
        perform(async () => {
            await loadProfile(button.dataset.id);
        });
    }

    if (action === "open-version" && state.profile) {
        openDocumentFile(
            state.profile.document.id,
            Number(button.dataset.version)
        );
    }

    if (action === "download-version" && state.profile) {
        downloadFile(
            state.profile.document.id,
            Number(button.dataset.version)
        );
    }
}

function handleTabKeyboard(event) {
    const current = event.target.closest('[role="tab"]');

    if (!current) return;

    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        return;
    }

    const tablist = current.closest('[role="tablist"]');

    if (!tablist) return;

    const buttons = Array.from(
        tablist.querySelectorAll('[role="tab"]')
    );

    const index = buttons.indexOf(current);

    let next = index;

    if (event.key === "ArrowRight") {
        next = (index + 1) % buttons.length;
    }

    if (event.key === "ArrowLeft") {
        next = (index - 1 + buttons.length) % buttons.length;
    }

    if (event.key === "Home") next = 0;

    if (event.key === "End") next = buttons.length - 1;

    event.preventDefault();

    buttons[next].focus();
    buttons[next].click();
}


/* =========================================================
   26. INCOMING CLIENT / CASE FILTERS
   ========================================================= */

function applyIncomingParameters() {
    const parameters = new URLSearchParams(
        window.location.search
    );

    const clientId = parameters.get("clientId");

    const caseId = parameters.get("caseId");

    if (clientId) {
        setValue("clientFilter", clientId);
    }

    if (caseId) {
        setValue("caseFilter", caseId);
    }

    if (clientId || caseId) {
        activateTab("directory");
    }
}


/* =========================================================
   27. GOOGLE CONFIGURATION STATUS
   ========================================================= */

function renderConfigurationStatus() {
    const result = validateDriveConfiguration();

    const valid = result === true || result?.valid === true;

    show("driveConfigurationWarning", !valid);

    if (!valid) {
        text(
            "driveConfigurationWarning",
            Array.isArray(result?.errors)
                ? result.errors.join(" ")
                : "Google Drive configuration requires verification."
        );
    }
}


/* =========================================================
   28. APPLICATION INITIALIZATION
   ========================================================= */

export async function initialiseDocumentSystem(user) {

    if (!user?.uid) {
        throw new Error("Authenticated administrator is required.");
    }

    if (state.initialized) {
        if (state.userId !== user.uid) {
            throw new Error("Administrator session changed.");
        }

        await requireSession();

        return true;
    }

    state.userId = user.uid;

    await requireSession();

    setCloudStatus(
        "syncing",
        "Initializing Document Management System..."
    );

    renderConfigurationStatus();

    await synchronize();

    resetDocumentForm();

    bindEvents();

    renderDriveConnection();

    activateTab("overview");

    applyIncomingParameters();

    await requireSession();

    state.initialized = true;

    auth.onAuthStateChanged(currentUser => {
        if (currentUser?.uid !== state.userId) {
            invalidateSession();
        }
    });

    const observer = new MutationObserver(() => {
        if ($("protectedContent").hidden) {
            closeDialogs();
        } else if (!state.invalidated) {
            renderDriveConnection();
            updateSaveAvailability();
        }
    });

    observer.observe($("protectedContent"), {
        attributes: true,
        attributeFilter: ["hidden"]
    });

    return true;
}


/* =========================================================
   END OF DOCUMENT MANAGEMENT APPLICATION ENGINE
   MNM LEGAL ASSOCIATES
   Justice, Integrity & Excellence
   ========================================================= */
