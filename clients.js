




/* =========================================================
   MNM LEGAL ASSOCIATES
   LEGAL PRACTICE MANAGEMENT SYSTEM

   CLIENT MANAGEMENT - APPLICATION ENGINE
   Version 1.0

   Justice, Integrity & Excellence
   ========================================================= */

import {
    auth
} from "./firebase-config.js";

import {
    verifyStaffAccess
} from "./auth.js";

import {
    CLIENT_TYPES,
    CLIENT_STATUSES,
    ACTIVITY_TYPES,
    getIndianDate,
    getRegistrationYear,
    generateClientId,
    validateClientData,
    getNextClientCode,
    createClient,
    getClient,
    fetchClients,
    findDuplicateClients,
    updateClient,
    archiveClient,
    reactivateClient,
    deleteClient,
    restoreDeletedClient,
    addClientActivity,
    fetchClientActivities,
    createClientBackup
} from "./clients-cloud.js";


/* =========================================================
   01. APPLICATION CONFIGURATION
   ========================================================= */

const CONFIG = Object.freeze({

    pageSize: 15,

    recentClientLimit: 5,

    timeZone: "Asia/Kolkata",

    firmName: "MNM Legal Associates"

});


const PROFILE_FIELDS = [

    "clientType",
    "fullName",
    "relativeName",
    "contactPerson",
    "mobile",
    "alternateMobile",
    "email",
    "address",
    "city",
    "state",
    "pinCode",
    "occupation",
    "engagementDate",
    "assignedAdvocate",
    "referenceSource",
    "notes",
    "status"

];


const PANELS = [

    "overview",
    "directory",
    "registration",
    "profile",
    "settings"

];


/* =========================================================
   02. APPLICATION STATE

   Confidential records remain in application memory.
   No client records are stored in localStorage.
   ========================================================= */

const state = {

    initialized: false,

    userId: null,

    clients: [],

    filteredClients: [],

    currentClient: null,

    currentActivities: [],

    editingClient: null,

    pendingCreateId: null,

    currentTab: "overview",

    currentPage: 1,

    nextClientCode: "",

    connected: false,

    busy: false,

    formDirty: false,

    syncPromise: null,

    profileRequest: 0,

    lastSynced: null,

    messageTimer: null

};


/* =========================================================
   03. DOM UTILITIES
   ========================================================= */

function $(id) {

    return document.getElementById(id);

}


function setText(id, value) {

    const element = $(id);

    if (element) {

        element.textContent =
            value === null ||
            value === undefined ||
            value === ""

                ? "—"

                : String(value);

    }

}


function setValue(id, value) {

    const element = $(id);

    if (element) {

        element.value = value ?? "";

    }

}


function setHidden(id, hidden) {

    const element = $(id);

    if (element) {

        element.hidden = Boolean(hidden);

    }

}


function createElement(
    tag,
    className = "",
    text = null
) {

    const element = document.createElement(tag);

    if (className) {

        element.className = className;

    }

    if (text !== null) {

        element.textContent = String(text);

    }

    return element;

}


function clearElement(element) {

    if (element) {

        element.replaceChildren();

    }

}


function bind(id, event, handler) {

    const element = $(id);

    if (!element) {

        throw new Error(
            `Required application element missing: ${id}`
        );

    }

    element.addEventListener(event, handler);

}


/* =========================================================
   04. DATE AND TEXT FORMATTING
   ========================================================= */

function formatDate(value, includeTime = false) {

    if (!value) return "—";

    let date;

    if (typeof value.toDate === "function") {

        date = value.toDate();

    } else if (
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {

        date = new Date(value + "T00:00:00Z");

    } else {

        date = new Date(value);

    }

    if (!Number.isFinite(date.getTime())) {

        return "—";

    }

    const options = {

        timeZone: CONFIG.timeZone,

        day: "2-digit",

        month: "short",

        year: "numeric"

    };

    if (includeTime) {

        options.hour = "2-digit";

        options.minute = "2-digit";

        options.hour12 = true;

    }

    return new Intl.DateTimeFormat(
        "en-IN",
        options
    ).format(date);

}


function getMonthKey(timestamp) {

    if (!timestamp?.toDate) return "";

    const parts = new Intl.DateTimeFormat(
        "en-GB",
        {
            timeZone: CONFIG.timeZone,
            year: "numeric",
            month: "2-digit"
        }
    ).formatToParts(timestamp.toDate());

    const year = parts.find(
        item => item.type === "year"
    )?.value;

    const month = parts.find(
        item => item.type === "month"
    )?.value;

    return `${year}-${month}`;

}


function normalizeText(value) {

    return String(value ?? "")

        .normalize("NFKC")

        .trim()

        .replace(/\s+/g, " ")

        .toLowerCase();

}


function normalizePhone(value) {

    let phone = String(value ?? "")
        .replace(/\D/g, "");

    if (
        phone.length === 12 &&
        phone.startsWith("91")
    ) {

        phone = phone.slice(2);

    }

    if (
        phone.length === 11 &&
        phone.startsWith("0")
    ) {

        phone = phone.slice(1);

    }

    return phone;

}


function getInitials(name) {

    const words = String(name || "Client")

        .trim()

        .split(/\s+/)

        .filter(Boolean);

    return words

        .slice(0, 2)

        .map(word => Array.from(word)[0] || "")

        .join("")

        .toUpperCase();

}


function getClientTypeLabel(type) {

    return CLIENT_TYPES[type] || "Other";

}


function getStatusLabel(status) {

    return CLIENT_STATUSES[status] || "Unknown";

}


function getFullAddress(client) {

    return [

        client.address,

        client.city,

        client.state,

        client.pinCode

    ].filter(Boolean).join(", ");

}


/* =========================================================
   05. AUTHORIZATION
   ========================================================= */

async function requireAuthorizedSession() {

    await auth.authStateReady();

    const user = auth.currentUser;

    if (
        !user?.uid ||
        user.uid !== state.userId
    ) {

        clearSensitiveState();

        throw new Error(
            "Your session has expired. Please sign in again."
        );

    }

    const profile = await verifyStaffAccess(user);

    if (
        profile.active !== true ||
        profile.role !== "admin" ||
        auth.currentUser?.uid !== state.userId
    ) {

        clearSensitiveState();

        throw new Error(
            "Client Management access is no longer authorized."
        );

    }

    return user;

}


function clearSensitiveState() {

    state.clients = [];

    state.filteredClients = [];

    state.currentClient = null;

    state.currentActivities = [];

    state.editingClient = null;

    state.pendingCreateId = null;

    state.connected = false;

    state.formDirty = false;

    state.profileRequest++;

    setHidden("protectedContent", true);

    setHidden("authLoading", false);

    setHidden("loadingSpinner", true);

    setText(
        "loadingMessage",
        "Authorization required. Please sign in again."
    );

    [

        "clientsTableBody",
        "recentClientsBody",
        "activityTimeline",
        "duplicateClientsList"

    ].forEach(id => clearElement($(id)));

    $("clientForm")?.reset();

    $("activityForm")?.reset();

    $("archiveForm")?.reset();

    setValue("editingClientId", "");

    setValue("clientSearch", "");

    document.querySelectorAll(
        "#profilePanel [id^='profile']"
    ).forEach(element => {

        if (
            element.matches(
                "dd, p, h2, span, strong"
            )
        ) {

            element.textContent = "—";

        }

    });

    document.querySelectorAll(
        "dialog[open]"
    ).forEach(dialog => dialog.close());

}


/* =========================================================
   06. APPLICATION MESSAGES
   ========================================================= */

function showMessage(message, type = "info") {

    const element = $("appMessage");

    if (!element) return;

    clearTimeout(state.messageTimer);

    element.className = `app-message ${type}`;

    element.textContent = message;

    element.hidden = false;

    if (type === "success") {

        state.messageTimer = setTimeout(() => {

            element.hidden = true;

        }, 6500);

    }

}


function hideMessage() {

    clearTimeout(state.messageTimer);

    setHidden("appMessage", true);

}


function getErrorMessage(error) {

    const code = String(error?.code || "");

    if (code.includes("permission-denied")) {

        return "Access denied by Firebase Security Rules. " +

            "Verify your administrator authorization and published rules.";

    }

    if (
        code.includes("unavailable") ||
        code.includes("deadline-exceeded")
    ) {

        return "Cloud database is temporarily unavailable. " +

            "Refresh the records before retrying any save operation.";

    }

    if (code.includes("resource-exhausted")) {

        return "Firebase usage limit has been reached. " +

            "Please try again later.";

    }

    return error?.message ||

        "An unexpected application error occurred.";

}


function reportError(error) {

    console.error(
        "Client Management operation failed:",
        error?.code || error?.name || "Error"
    );

    showMessage(
        getErrorMessage(error),
        "error"
    );

}


/* =========================================================
   07. CLOUD CONNECTION STATUS
   ========================================================= */

function setCloudStatus(status) {

    const indicator = $("cloudStatusIndicator");

    if (indicator) {

        indicator.className =
            `connection-indicator ${status}`;

    }

    if (status === "online") {

        state.connected = true;

        setText(
            "cloudStatus",
            "Cloud Connected"
        );

        setText(
            "databaseConnectionStatus",
            "Connected to Firebase Cloud Firestore"
        );

    } else if (status === "syncing") {

        setText(
            "cloudStatus",
            "Synchronizing cloud records..."
        );

        setText(
            "databaseConnectionStatus",
            "Synchronizing"
        );

    } else {

        state.connected = false;

        setText(
            "cloudStatus",
            "Cloud connection unavailable"
        );

        setText(
            "databaseConnectionStatus",
            "Connection unavailable"
        );

    }

    if (state.lastSynced) {

        setText(

            "lastSynced",

            "Last synchronized: " +

            formatDate(
                state.lastSynced,
                true
            )

        );

    }

}


/* =========================================================
   08. BUSY STATE AND OPERATION LOCK
   ========================================================= */

async function runAction(
    buttonId,
    operation,
    errorHandler = reportError
) {

    if (state.busy) return;

    state.busy = true;

    const button = buttonId
        ? $(buttonId)
        : null;

    const originalDisabled =
        button?.disabled || false;

    if (button) {

        button.disabled = true;

        button.classList.add("is-loading");

    }

    try {

        await requireAuthorizedSession();

        return await operation();

    } catch (error) {

        errorHandler(error);

    } finally {

        state.busy = false;

        if (button) {

            button.disabled = originalDisabled;

            button.classList.remove("is-loading");

        }

    }

}


/* =========================================================
   09. CLIENT DATABASE SYNCHRONIZATION
   ========================================================= */

async function synchronizeClients() {

    if (state.syncPromise) {

        return state.syncPromise;

    }

    state.syncPromise = (async () => {

        setCloudStatus("syncing");

        try {

            await requireAuthorizedSession();

            const [

                records,

                nextCode

            ] = await Promise.all([

                fetchClients({

                    includeArchived: true

                }),

                getNextClientCode()

            ]);

            await requireAuthorizedSession();

            const ids = new Set();

            const codes = new Set();

            for (const client of records) {

                if (
                    !client.id ||
                    !client.clientCode ||
                    ids.has(client.id) ||
                    codes.has(client.clientCode)
                ) {

                    throw new Error(

                        "Duplicate or invalid client identifiers detected. " +

                        "Review the database before continuing."

                    );

                }

                ids.add(client.id);

                codes.add(client.clientCode);

            }

            state.clients = records;

            state.nextClientCode = nextCode;

            state.lastSynced = new Date();

            setCloudStatus("online");

            renderOverview();

            renderYearFilter();

            renderDirectory();

            renderSettings();

            if (!state.editingClient) {

                setValue(
                    "clientCode",
                    state.nextClientCode
                );

            }

            return records;

        } catch (error) {

            setCloudStatus("offline");

            throw error;

        }

    })();

    try {

        return await state.syncPromise;

    } finally {

        state.syncPromise = null;

    }

}


async function refreshAfterSave() {

    try {

        await synchronizeClients();

        return true;

    } catch (error) {

        setCloudStatus("offline");

        showMessage(

            "The record was saved, but the directory could not " +

            "be refreshed. Use Refresh before making further changes.",

            "warning"

        );

        return false;

    }

}


/* =========================================================
   10. MODULE NAVIGATION
   ========================================================= */

function activateTab(tab) {

    if (!PANELS.includes(tab)) return;

    state.currentTab = tab;

    for (const panel of PANELS) {

        setHidden(
            `${panel}Panel`,
            panel !== tab
        );

    }

    document.querySelectorAll(
        ".module-tab[data-tab]"
    ).forEach(button => {

        const selected =
            button.dataset.tab === tab;

        button.classList.toggle(
            "active",
            selected
        );

        button.setAttribute(
            "aria-selected",
            String(selected)
        );

        button.tabIndex = selected ? 0 : -1;

    });

    if (tab === "profile") {

        $("directoryTab").tabIndex = 0;

    }

    if (tab === "directory") {

        renderDirectory();

    }

    if (tab === "settings") {

        renderSettings();

    }

}


function confirmDiscardChanges() {

    if (!state.formDirty) return true;

    return window.confirm(

        "You have unsaved client information. " +

        "Discard these changes?"

    );

}


function navigateTo(tab) {

    if (state.busy) return;

    if (
        state.currentTab === "registration" &&
        tab !== "registration" &&
        !confirmDiscardChanges()
    ) {

        return;

    }

    if (
        state.currentTab === "registration" &&
        tab !== "registration"
    ) {

        resetClientForm();

    }

    activateTab(tab);

}


function openNewRegistration() {

    if (state.busy) return;

    if (!confirmDiscardChanges()) return;

    resetClientForm();

    activateTab("registration");

    $("fullName").focus();

}


/* =========================================================
   11. CLIENT STATUS BADGES
   ========================================================= */

function createStatusBadge(status) {

    const badge = createElement(

        "span",

        "status-badge",

        getStatusLabel(status)

    );

    if (
        Object.prototype.hasOwnProperty.call(
            CLIENT_STATUSES,
            status
        )
    ) {

        badge.dataset.status = status;

    }

    return badge;

}


/* =========================================================
   12. OVERVIEW STATISTICS
   ========================================================= */

function renderOverview() {

    const month = getIndianDate().slice(0, 7);

    const stats = {

        total: state.clients.length,

        active: 0,

        prospective: 0,

        inactive: 0,

        archived: 0,

        newThisMonth: 0

    };

    for (const client of state.clients) {

        if (
            Object.prototype.hasOwnProperty.call(
                CLIENT_STATUSES,
                client.status
            )
        ) {

            stats[client.status]++;

        }

        if (
            getMonthKey(client.createdAt) === month
        ) {

            stats.newThisMonth++;

        }

    }

    setText("totalClients", stats.total);

    setText("activeClients", stats.active);

    setText("prospectiveClients", stats.prospective);

    setText("inactiveClients", stats.inactive);

    setText("archivedClients", stats.archived);

    setText("newThisMonth", stats.newThisMonth);

    renderRecentClients();

}


/* =========================================================
   13. RECENT CLIENTS
   ========================================================= */

function appendCell(row, value) {

    const cell = createElement("td");

    if (value instanceof Node) {

        cell.appendChild(value);

    } else {

        cell.textContent =
            value === null ||
            value === undefined ||
            value === ""

                ? "—"

                : String(value);

    }

    row.appendChild(cell);

    return cell;

}


function createActionButton(
    label,
    action,
    clientId
) {

    const button = createElement(

        "button",

        "button button-secondary button-small",

        label

    );

    button.type = "button";

    button.dataset.action = action;

    button.dataset.clientId = clientId;

    return button;

}


function renderRecentClients() {

    const body = $("recentClientsBody");

    clearElement(body);

    const recent = state.clients.filter(c => c.status !== "archived").slice(
        0,
        CONFIG.recentClientLimit
    );

    for (const client of recent) {

        const row = createElement("tr");

        appendCell(row, client.clientCode);

        appendCell(row, client.fullName);

        appendCell(row, client.mobile);

        appendCell(
            row,
            getClientTypeLabel(client.clientType)
        );

        appendCell(
            row,
            createStatusBadge(client.status)
        );

        appendCell(

            row,

            createActionButton(
                "View Profile",
                "view",
                client.id
            )

        );

        body.appendChild(row);

    }

    setHidden(
        "emptyRecentClients",
        recent.length > 0
    );

}


/* =========================================================
   14. CLIENT DIRECTORY FILTERS
   ========================================================= */

function renderYearFilter() {

    const select = $("clientYearFilter");

    const previous = select.value;

    const years = [

        ...new Set(

            state.clients.map(

                client => client.registrationYear

            ).filter(Boolean)

        )

    ].sort().reverse();

    select.replaceChildren();

    const all = createElement(
        "option",
        "",
        "All Years"
    );

    all.value = "all";

    select.appendChild(all);

    for (const year of years) {

        const option = createElement(
            "option",
            "",
            year
        );

        option.value = year;

        select.appendChild(option);

    }

    select.value = years.includes(previous)

        ? previous

        : "all";

}


function compareRegistration(a, b) {

    const year = String(
        b.registrationYear
    ).localeCompare(
        String(a.registrationYear)
    );

    if (year !== 0) return year;

    return Number(b.sequenceNumber || 0) -

        Number(a.sequenceNumber || 0);

}


function getFilteredClients() {

    const search = normalizeText(
        $("clientSearch").value
    );

    const searchPhone = normalizePhone(search);

    const status = $("clientStatusFilter").value;

    const type = $("clientTypeFilter").value;

    const year = $("clientYearFilter").value;

    const sort = $("clientSort").value;

    const records = state.clients.filter(client => {

        if (status === "all" && client.status === "archived") return false;

        if (
            status !== "all" &&
            client.status !== status
        ) return false;

        if (
            type !== "all" &&
            client.clientType !== type
        ) return false;

        if (
            year !== "all" &&
            client.registrationYear !== year
        ) return false;

        if (!search) return true;

        const searchable = normalizeText([

            client.clientCode,

            client.fullName,

            client.relativeName,

            client.contactPerson,

            client.mobile,

            client.alternateMobile,

            client.email,

            client.assignedAdvocate,

            client.city

        ].filter(Boolean).join(" "));

        const textMatch = search

            .split(/\s+/)

            .every(term => searchable.includes(term));

        const phoneMatch =

            searchPhone.length >= 4 &&

            /^[+\d\s()-]+$/.test(search) &&

            [

                normalizePhone(client.mobile),

                normalizePhone(client.alternateMobile)

            ].some(

                phone => phone.includes(searchPhone)

            );

        return textMatch || phoneMatch;

    });

    records.sort((a, b) => {

        if (sort === "name-asc") {

            return String(a.fullName).localeCompare(
                String(b.fullName),
                "en-IN"
            );

        }

        if (sort === "name-desc") {

            return String(b.fullName).localeCompare(
                String(a.fullName),
                "en-IN"
            );

        }

        if (sort === "oldest") {

            return compareRegistration(b, a);

        }

        return compareRegistration(a, b);

    });

    return records;

}


function clearFilters() {

    setValue("clientSearch", "");

    setValue("clientStatusFilter", "all");

    setValue("clientTypeFilter", "all");

    setValue("clientYearFilter", "all");

    setValue("clientSort", "newest");

    state.currentPage = 1;

    renderDirectory();

}


/* =========================================================
   15. CLIENT DIRECTORY AND PAGINATION
   ========================================================= */

function renderDirectory() {

    const records = getFilteredClients();

    state.filteredClients = records;

    const total = records.length;

    const totalPages = Math.max(

        1,

        Math.ceil(total / CONFIG.pageSize)

    );

    state.currentPage = Math.min(

        Math.max(1, state.currentPage),

        totalPages

    );

    const start =

        (state.currentPage - 1) *

        CONFIG.pageSize;

    const end = Math.min(

        start + CONFIG.pageSize,

        total

    );

    const visible = records.slice(start, end);

    const body = $("clientsTableBody");

    clearElement(body);

    for (const client of visible) {

        const row = createElement("tr");

        appendCell(row, client.clientCode);

        const name = createElement("div");

        name.appendChild(

            createElement(
                "strong",
                "",
                client.fullName
            )

        );

        if (client.city) {

            name.appendChild(

                createElement(
                    "small",
                    "",
                    client.city
                )

            );

        }

        appendCell(row, name);

        const contact = createElement("div");

        contact.appendChild(

            createElement(
                "strong",
                "",
                client.mobile || "—"
            )

        );

        if (client.email) {

            contact.appendChild(

                createElement(
                    "small",
                    "",
                    client.email
                )

            );

        }

        appendCell(row, contact);

        appendCell(

            row,

            getClientTypeLabel(client.clientType)

        );

        appendCell(
            row,
            client.assignedAdvocate
        );

        appendCell(

            row,

            createStatusBadge(client.status)

        );

        const actions = createElement(

            "div",

            "table-actions"

        );

        actions.appendChild(

            createActionButton(
                "View",
                "view",
                client.id
            )

        );

        if (client.status !== "archived") {

            actions.appendChild(

                createActionButton(
                    "Edit",
                    "edit",
                    client.id
                )

            );

        }

        const deletionAction = createActionButton(
            client.status === "archived" ? "Restore" : "Delete",
            client.status === "archived" ? "restore" : "delete",
            client.id
        );
        if (client.status !== "archived") deletionAction.classList.add("button-danger");
        actions.appendChild(deletionAction);

        appendCell(row, actions);

        body.appendChild(row);

    }

    setText(

        "clientResultCount",

        `${total} client${total === 1 ? "" : "s"} found`

    );

    setText(

        "paginationInfo",

        total

            ? `Showing ${start + 1}–${end} of ${total} clients`

            : "Showing 0 clients"

    );

    setText(

        "currentPageNumber",

        `Page ${state.currentPage} of ${totalPages}`

    );

    $("previousPageButton").disabled =

        state.currentPage <= 1;

    $("nextPageButton").disabled =

        state.currentPage >= totalPages;

    setHidden("emptyClients", total > 0);

}


/* =========================================================
   16. CLIENT REGISTRATION FORM
   ========================================================= */

function updateClientTypeFields() {

    const individual =

        $("clientType").value === "individual";

    setHidden(

        "relativeNameGroup",

        !individual

    );

    setHidden(

        "contactPersonGroup",

        individual

    );

}


function resetClientForm() {

    $("clientForm").reset();

    state.editingClient = null;

    state.pendingCreateId = null;

    state.formDirty = false;

    setValue("editingClientId", "");

    setValue("clientType", "individual");

    setValue("clientStatus", "active");

    setValue(

        "clientCode",

        state.nextClientCode

    );

    setValue(

        "engagementDate",

        getIndianDate()

    );

    setText(

        "registrationHeading",

        "New Client Registration"

    );

    setText(

        "registrationDescription",

        "Enter client information to create a permanent profile."

    );

    setText(

        "saveClientButtonText",

        "Register Client"

    );

    setHidden("duplicateWarning", true);

    clearElement($("duplicateClientsList"));

    updateClientTypeFields();

}


function collectClientForm() {

    const input = {};

    for (const field of PROFILE_FIELDS) {

        const elementId = field === "status"

            ? "clientStatus"

            : field;

        input[field] = $(elementId).value;

    }

    if (input.clientType === "individual") {

        input.contactPerson = "";

    } else {

        input.relativeName = "";

    }

    return validateClientData(input);

}


function populateClientForm(client) {

    if (client.status === "archived") {

        throw new Error(

            "Reactivate the archived client before editing."

        );

    }

    state.editingClient = client;

    state.pendingCreateId = null;

    setValue(
        "editingClientId",
        client.id
    );

    setValue(
        "clientCode",
        client.clientCode
    );

    for (const field of PROFILE_FIELDS) {

        const elementId = field === "status"

            ? "clientStatus"

            : field;

        setValue(

            elementId,

            client[field] || ""

        );

    }

    setText(

        "registrationHeading",

        "Edit Client Profile"

    );

    setText(

        "registrationDescription",

        `Update client details for ${client.clientCode}.`

    );

    setText(

        "saveClientButtonText",

        "Save Changes"

    );

    setHidden("duplicateWarning", true);

    clearElement($("duplicateClientsList"));

    updateClientTypeFields();

    state.formDirty = false;

    activateTab("registration");

}


/* =========================================================
   17. CONFIRMATION DIALOG
   ========================================================= */

function confirmAction(
    title,
    message,
    confirmLabel = "Confirm"
) {

    const dialog = $("confirmationDialog");

    if (
        !dialog ||
        typeof dialog.showModal !== "function"
    ) {

        return Promise.resolve(

            window.confirm(
                `${title}\n\n${message}`
            )

        );

    }

    return new Promise(resolve => {

        setText("confirmationTitle", title);

        setText("confirmationMessage", message);

        setText(
            "acceptConfirmation",
            confirmLabel
        );

        const accept = $("acceptConfirmation");

        const cancel = $("cancelConfirmation");

        let result = false;

        function onAccept() {

            result = true;

            dialog.close();

        }

        function onCancel() {

            result = false;

            dialog.close();

        }

        function onClose() {

            accept.removeEventListener(
                "click",
                onAccept
            );

            cancel.removeEventListener(
                "click",
                onCancel
            );

            resolve(result);

        }

        accept.addEventListener(
            "click",
            onAccept
        );

        cancel.addEventListener(
            "click",
            onCancel
        );

        dialog.addEventListener(

            "close",

            onClose,

            { once: true }

        );

        dialog.showModal();

    });

}


/* =========================================================
   18. DUPLICATE CLIENT DETECTION
   ========================================================= */

function renderDuplicateWarning(matches) {

    const container = $("duplicateClientsList");

    clearElement(container);

    for (const match of matches) {

        const card = createElement(

            "div",

            "duplicate-client"

        );

        card.appendChild(

            createElement(

                "strong",

                "",

                `${match.fullName} — ${match.clientCode}`

            )

        );

        card.appendChild(

            createElement(

                "p",

                "",

                [

                    match.mobile,

                    match.email,

                    getStatusLabel(match.status)

                ].filter(Boolean).join(" | ")

            )

        );

        card.appendChild(

            createElement(

                "small",

                "",

                match.reasons.join(", ")

            )

        );

        container.appendChild(card);

    }

    setHidden(

        "duplicateWarning",

        matches.length === 0

    );

}


/* =========================================================
   19. SAVE CLIENT REGISTRATION OR PROFILE
   ========================================================= */

function lockForm(form) {

    const controls = [

        ...form.querySelectorAll(

            "input, select, textarea, button"

        )

    ];

    const previous = controls.map(

        element => element.disabled

    );

    controls.forEach(element => {

        element.disabled = true;

    });

    return () => {

        controls.forEach((element, index) => {

            element.disabled = previous[index];

        });

    };

}


async function recoverPendingRegistration() {

    if (!state.pendingCreateId) {

        return null;

    }

    const records = await fetchClients({

        includeArchived: true

    });

    return records.find(

        client => client.id === state.pendingCreateId

    ) || null;

}


async function handleClientSubmit(event) {

    event.preventDefault();

    if (state.busy) return;

    const form = $("clientForm");

    if (!form.reportValidity()) return;

    await runAction(

        "saveClientButton",

        async () => {

            hideMessage();

            const input = collectClientForm();

            const editing = state.editingClient;

            const unlock = lockForm(form);

            let saved = null;

            try {

                setText(

                    "saveClientButtonText",

                    "Checking client information..."

                );


                /* RECOVER AN UNCERTAIN PREVIOUS SAVE */

                if (
                    !editing &&
                    state.pendingCreateId
                ) {

                    saved =

                        await recoverPendingRegistration();

                }


                /* DUPLICATE CHECK */

                if (!saved) {

                    const matches =

                        await findDuplicateClients(

                            input,

                            editing?.id || null

                        );

                    renderDuplicateWarning(matches);

                    if (matches.length) {

                        const proceed = await confirmAction(

                            "Possible Duplicate Client",

                            `${matches.length} similar client record(s) ` +

                            "were found. Continue only if this is a " +

                            "separate or intentionally updated profile.",

                            "Continue Saving"

                        );

                        if (!proceed) {

                            showMessage(

                                "Client save cancelled. Review the matching records.",

                                "warning"

                            );

                            return;

                        }

                    }

                }


                /* SAVE CLIENT */

                setText(

                    "saveClientButtonText",

                    "Saving to Cloud..."

                );

                if (!saved) {

                    if (editing) {

                        saved = await updateClient(

                            editing.id,

                            input,

                            editing.revision

                        );

                    } else {

                        if (!state.pendingCreateId) {

                            state.pendingCreateId =

                                generateClientId();

                        }

                        saved = await createClient(

                            input,

                            state.pendingCreateId

                        );

                    }

                }

                await requireAuthorizedSession();

                state.pendingCreateId = null;

                state.formDirty = false;

                resetClientForm();

                const refreshed =

                    await refreshAfterSave();

                try {

                    await loadClientProfile(
                        saved.id
                    );

                } catch (error) {

                    activateTab("directory");

                    showMessage(

                        "Client saved successfully, but the profile " +

                        "could not be reopened. Refresh the directory.",

                        "warning"

                    );

                    return;

                }

                if (refreshed) {

                    showMessage(

                        editing

                            ? `Client profile ${saved.clientCode} updated successfully.`

                            : `Client registered successfully. Client ID: ${saved.clientCode}`,

                        "success"

                    );

                }

            } catch (error) {

                if (
                    !editing &&
                    state.pendingCreateId
                ) {

                    showMessage(

                        getErrorMessage(error) +

                        " Registration confirmation is pending. " +

                        "Retry from this form to check the same record " +

                        "before creating another client.",

                        "error"

                    );

                } else {

                    reportError(error);

                }

            } finally {

                unlock();

                setText(

                    "saveClientButtonText",

                    state.editingClient

                        ? "Save Changes"

                        : "Register Client"

                );

            }

        }

    );

}


/* =========================================================
   20. CLIENT PROFILE LOADING
   ========================================================= */

async function loadClientProfile(clientId) {

    const request = ++state.profileRequest;

    const [

        client,

        activities

    ] = await Promise.all([

        getClient(clientId),

        fetchClientActivities(clientId)

    ]);

    await requireAuthorizedSession();

    if (request !== state.profileRequest) {

        return;

    }

    state.currentClient = client;

    state.currentActivities = activities;

    renderClientProfile();

    renderActivityTimeline();

    activateTab("profile");

}


async function openClientProfile(clientId) {

    if (!confirmDiscardChanges()) return;

    await runAction(

        null,

        async () => {

            await loadClientProfile(clientId);

            state.formDirty = false;

        }

    );

}


async function openClientEditor(clientId) {

    if (!confirmDiscardChanges()) return;

    await runAction(

        null,

        async () => {

            const client = await getClient(clientId);

            await requireAuthorizedSession();

            populateClientForm(client);

        }

    );

}


/* =========================================================
   21. CLIENT PROFILE RENDERING
   ========================================================= */

function renderClientProfile() {

    const client = state.currentClient;

    if (!client) return;

    setText(

        "profileInitials",

        getInitials(client.fullName)

    );

    setText(

        "profileClientCode",

        client.clientCode

    );

    setText("profileName", client.fullName);

    setText(

        "profileClientType",

        getClientTypeLabel(client.clientType)

    );

    const badge = $("profileStatus");

    badge.className = "status-badge";

    badge.dataset.status = client.status;

    badge.textContent =

        getStatusLabel(client.status);

    setText(

        "profileRegisteredOn",

        formatDate(client.createdAt)

    );

    setText(

        "profileFullName",

        client.fullName

    );

    setText(

        "profileRelativeName",

        client.relativeName

    );

    setText(

        "profileContactPerson",

        client.contactPerson

    );

    setText(

        "profileOccupation",

        client.occupation

    );

    setText(

        "profileMobile",

        client.mobile

    );

    setText(

        "profileAlternateMobile",

        client.alternateMobile

    );

    setText(

        "profileEmail",

        client.email

    );

    setText(

        "profileAddress",

        getFullAddress(client)

    );

    setText(

        "profileEngagementDate",

        formatDate(client.engagementDate)

    );

    setText(

        "profileAssignedAdvocate",

        client.assignedAdvocate

    );

    setText(

        "profileReferenceSource",

        client.referenceSource

    );

    setText(

        "profileLastUpdated",

        formatDate(client.updatedAt, true)

    );

    setText(

        "profileNotes",

        client.notes ||

        "No internal notes recorded."

    );

    const archived =

        client.status === "archived";

    setHidden("deleteClientButton", archived);

    setHidden(

        "archivedClientNotice",

        !archived

    );

    setHidden(

        "editClientButton",

        archived

    );

    setHidden(

        "archiveClientButton",

        archived

    );

    setHidden(

        "reactivateClientButton",

        !archived

    );

    setHidden(

        "addActivityButton",

        archived

    );

    setText(

        "profileArchiveReason",

        archived

            ? `Reason: ${client.archiveReason || "Not specified"}`

            : ""

    );

}


/* =========================================================
   22. CLIENT ACTIVITY TIMELINE
   ========================================================= */

function renderActivityTimeline() {

    const container = $("activityTimeline");

    clearElement(container);

    for (const activity of state.currentActivities) {

        const item = createElement(

            "article",

            "activity-item"

        );

        const header = createElement(

            "div",

            "activity-header"

        );

        header.appendChild(

            createElement(

                "strong",

                "activity-type",

                ACTIVITY_TYPES[activity.type] ||

                "Client Activity"

            )

        );

        header.appendChild(

            createElement(

                "span",

                "activity-date",

                formatDate(
                    activity.createdAt,
                    true
                )

            )

        );

        item.appendChild(header);

        item.appendChild(

            createElement(

                "p",

                "",

                activity.description

            )

        );

        container.appendChild(item);

    }

    setHidden(

        "emptyActivities",

        state.currentActivities.length > 0

    );

}


/* =========================================================
   23. ADD CLIENT ACTIVITY
   ========================================================= */

function openActivityDialog() {

    if (
        state.busy ||
        !state.currentClient ||
        state.currentClient.status === "archived"
    ) {

        return;

    }

    $("activityForm").reset();

    $("activityDialog").showModal();

}


async function handleActivitySubmit(event) {

    event.preventDefault();

    const client = state.currentClient;

    if (!client || state.busy) return;

    const form = $("activityForm");

    if (!form.reportValidity()) return;

    const type = $("activityType").value;

    const description =

        $("activityDescription").value.trim();

    if (!description) return;

    await runAction(

        "saveActivityButton",

        async () => {

            const unlock = lockForm(form);

            try {

                await addClientActivity(

                    client.id,

                    type,

                    description

                );

                $("activityDialog").close();

                form.reset();

                try {

                    await loadClientProfile(client.id);

                    showMessage(

                        "Client activity recorded successfully.",

                        "success"

                    );

                } catch {

                    showMessage(

                        "Activity saved. Reopen the client profile " +

                        "to refresh its communication history.",

                        "warning"

                    );

                }

            } catch (error) {

                window.alert(

                    getErrorMessage(error) +

                    "\n\nCheck the activity history before retrying."

                );

            } finally {

                unlock();

            }

        }

    );

}


/* =========================================================
   24. ARCHIVE CLIENT
   ========================================================= */

function openArchiveDialog() {

    if (
        state.busy ||
        !state.currentClient ||
        state.currentClient.status === "archived"
    ) {

        return;

    }

    $("archiveForm").reset();

    $("archiveDialog").showModal();

}


async function handleArchiveSubmit(event) {

    event.preventDefault();

    const client = state.currentClient;

    if (!client || state.busy) return;

    const form = $("archiveForm");

    if (!form.reportValidity()) return;

    const reason =

        $("archiveReason").value.trim();

    if (!reason) return;

    await runAction(

        "confirmArchiveButton",

        async () => {

            const unlock = lockForm(form);

            try {

                await archiveClient(

                    client.id,

                    reason,

                    client.revision

                );

                $("archiveDialog").close();

                form.reset();

                const refreshed =

                    await refreshAfterSave();

                try {

                    await loadClientProfile(client.id);

                } catch {

                    activateTab("directory");

                    showMessage(

                        "Client archived. Refresh the directory " +

                        "before reopening the profile.",

                        "warning"

                    );

                    return;

                }

                if (refreshed) {

                    showMessage(

                        "Client archived successfully. " +

                        "All historical records have been preserved.",

                        "success"

                    );

                }

            } catch (error) {

                window.alert(

                    getErrorMessage(error) +

                    "\n\nReopen the profile to verify its current status."

                );

            } finally {

                unlock();

            }

        }

    );

}


/* =========================================================
   25. REACTIVATE CLIENT
   ========================================================= */

async function handleReactivateClient() {

    const client = state.currentClient;

    if (
        !client ||
        client.status !== "archived" ||
        state.busy
    ) {

        return;

    }

    await runAction(

        "reactivateClientButton",

        async () => {

            const confirmed = await confirmAction(

                "Reactivate Client",

                `Reactivate ${client.fullName}? ` +

                "The original Client ID will remain unchanged.",

                "Reactivate"

            );

            if (!confirmed) return;

            await reactivateClient(

                client.id,

                client.revision

            );

            const refreshed =

                await refreshAfterSave();

            try {

                await loadClientProfile(client.id);

            } catch {

                activateTab("directory");

                showMessage(

                    "Client reactivated. Refresh the directory " +

                    "before reopening the profile.",

                    "warning"

                );

                return;

            }

            if (refreshed) {

                showMessage(

                    "Client profile reactivated successfully.",

                    "success"

                );

            }

        }

    );

}


/* =========================================================
   26. SETTINGS PANEL
   ========================================================= */

function renderSettings() {

    setValue(

        "currentRegistrationYear",

        getRegistrationYear()

    );

    setValue(

        "nextClientCodeSetting",

        state.nextClientCode

    );

    setText(

        "storageClientCount",

        state.clients.length

    );

    setText(

        "databaseConnectionStatus",

        state.connected

            ? "Connected to Firebase Cloud Firestore"

            : "Connection unavailable"

    );

}


/* =========================================================
   27. FILE EXPORT UTILITIES
   ========================================================= */

function downloadFile(
    filename,
    content,
    mimeType
) {

    const blob = new Blob(

        [content],

        { type: mimeType }

    );

    const url = URL.createObjectURL(blob);

    const anchor = createElement("a");

    anchor.href = url;

    anchor.download = filename;

    document.body.appendChild(anchor);

    anchor.click();

    anchor.remove();

    setTimeout(() => {

        URL.revokeObjectURL(url);

    }, 30000);

}


/* Prevent spreadsheet formula injection. */

function csvCell(value) {

    let text = String(value ?? "");

    if (

        /^[\s]*[=+\-@]/.test(text) ||

        /^[\t\r\n]/.test(text)

    ) {

        text = "'" + text;

    }

    return '"' +

        text.replace(/"/g, '""') +

        '"';

}


/* =========================================================
   28. EXPORT CLIENT DIRECTORY AS CSV
   ========================================================= */

async function exportClientsCSV() {

    await runAction(

        "exportClientsCSVButton",

        async () => {

            await synchronizeClients();

            const records = getFilteredClients();

            if (!records.length) {

                showMessage(

                    "No matching client records are available for export.",

                    "warning"

                );

                return;

            }

            const confirmed = await confirmAction(

                "Export Confidential Client Directory",

                `Export ${records.length} matching client records? ` +

                "The CSV contains confidential contact information. " +

                "Store the exported file securely.",

                "Export CSV"

            );

            if (!confirmed) return;

            await requireAuthorizedSession();

            const headers = [

                "Client ID",

                "Client Name",

                "Client Type",

                "Relative Name",

                "Contact Person",

                "Primary Mobile",

                "Alternate Mobile",

                "Email",

                "Address",

                "City",

                "State",

                "PIN Code",

                "Occupation",

                "Engagement Date",

                "Assigned Advocate",

                "Reference Source",

                "Status",

                "Registration Year",

                "Registered On"

            ];

            const rows = records.map(client => [

                client.clientCode,

                client.fullName,

                getClientTypeLabel(client.clientType),

                client.relativeName,

                client.contactPerson,

                client.mobile,

                client.alternateMobile,

                client.email,

                client.address,

                client.city,

                client.state,

                client.pinCode,

                client.occupation,

                client.engagementDate,

                client.assignedAdvocate,

                client.referenceSource,

                getStatusLabel(client.status),

                client.registrationYear,

                formatDate(client.createdAt)

            ]);

            const csv = [

                headers,

                ...rows

            ].map(

                row => row.map(csvCell).join(",")

            ).join("\r\n");

            downloadFile(

                `MNM-Client-Directory-${getIndianDate()}.csv`,

                "\uFEFF" + csv,

                "text/csv;charset=utf-8"

            );

            showMessage(

                "Client directory export prepared. " +

                "Check your browser downloads.",

                "success"

            );

        }

    );

}


/* =========================================================
   29. COMPLETE CONFIDENTIAL JSON BACKUP
   ========================================================= */

async function exportClientBackup() {

    await runAction(

        "downloadClientBackupButton",

        async () => {

            const confirmed = await confirmAction(

                "Confidential Database Backup",

                "This backup includes all client profiles, internal " +

                "notes, activity history and numbering counters. " +

                "Keep the file in secure, restricted storage.",

                "Create Backup"

            );

            if (!confirmed) return;

            showMessage(

                "Preparing confidential client database backup...",

                "info"

            );

            const backup = await createClientBackup();

            await requireAuthorizedSession();

            const json = JSON.stringify(

                backup,

                null,

                2

            );

            downloadFile(

                `MNM-Confidential-Client-Backup-${getIndianDate()}.json`,

                json,

                "application/json;charset=utf-8"

            );

            showMessage(

                `Backup prepared for ${backup.clientCount} clients. ` +

                "Check your browser downloads.",

                "success"

            );

        }

    );

}


/* =========================================================
   30. REFRESH AND CONNECTION VERIFICATION
   ========================================================= */

async function handleRefresh(
    buttonId = "refreshClientsButton"
) {

    await runAction(

        buttonId,

        async () => {

            await synchronizeClients();

            if (

                state.currentTab === "profile" &&

                state.currentClient

            ) {

                await loadClientProfile(

                    state.currentClient.id

                );

            }

            showMessage(

                "Client records synchronized successfully.",

                "success"

            );

        }

    );

}


/* =========================================================
   31. TABLE ACTION HANDLING
   ========================================================= */

async function changeClientDeletionStatus(clientId, restore = false) {
    if (state.busy || !confirmDiscardChanges()) return;
    await runAction(null, async () => {
        const client = await getClient(clientId);
        if (restore !== (client.status === "archived")) throw new Error("Client status changed. Refresh and try again.");
        const confirmed = await confirmAction(
            restore ? "Restore Client" : "Delete Client",
            restore ? `Restore ${client.fullName} to the directory?` : `Remove ${client.fullName} from the active directory? This is recoverable deletion. All linked cases, invoices, documents and financial records remain preserved.`,
            restore ? "Restore" : "Delete"
        );
        if (!confirmed) return;
        if (restore) {
            await restoreDeletedClient(client.id, client.revision);
        } else {
            const reason = window.prompt("Enter the reason for deleting this client:");
            if (reason === null) return;
            if (!reason.trim()) throw new Error("A deletion reason is required.");
            await deleteClient(client.id, reason.trim(), client.revision);
        }
        state.formDirty = false;
        const refreshed = await refreshAfterSave();
        setValue("clientStatusFilter", "all");
        state.currentPage = 1;
        activateTab("directory");
        renderDirectory();
        if (refreshed) showMessage(restore ? "Client restored successfully." : "Client removed from the directory. Restore from Archived / Deleted.", "success");
    });
}

function handleTableAction(event) {

    const button = event.target.closest(

        "button[data-action][data-client-id]"

    );

    if (!button || state.busy) return;

    const clientId = button.dataset.clientId;

    if (button.dataset.action === "view") {

        void openClientProfile(clientId);

    }

    if (button.dataset.action === "delete" || button.dataset.action === "restore") {
        void changeClientDeletionStatus(clientId, button.dataset.action === "restore");
    }

    if (button.dataset.action === "edit") {

        void openClientEditor(clientId);

    }

}


/* =========================================================
   32. KEYBOARD ACCESSIBLE NAVIGATION
   ========================================================= */

function handleTabKeyboard(event) {

    const tabs = [

        ...document.querySelectorAll(

            ".module-tab[data-tab]"

        )

    ];

    const index = tabs.indexOf(event.target);

    if (index < 0 || state.busy) return;

    let nextIndex = index;

    switch (event.key) {

        case "ArrowRight":

            nextIndex = (index + 1) % tabs.length;

            break;

        case "ArrowLeft":

            nextIndex =

                (index - 1 + tabs.length) %

                tabs.length;

            break;

        case "Home":

            nextIndex = 0;

            break;

        case "End":

            nextIndex = tabs.length - 1;

            break;

        default:

            return;

    }

    event.preventDefault();

    navigateTo(tabs[nextIndex].dataset.tab);

    if (
        state.currentTab ===
        tabs[nextIndex].dataset.tab
    ) {

        tabs[nextIndex].focus();

    }

}


/* =========================================================
   33. APPLICATION EVENT LISTENERS
   ========================================================= */

function bindApplicationEvents() {
    const statusFilter = $("clientStatusFilter");
    if (statusFilter) {
        for (const option of statusFilter.options) {
            if (option.value === "all") option.textContent = "All Current Clients";
            if (option.value === "archived") option.textContent = "Archived / Deleted";
        }
    }
    const archiveButton = $("archiveClientButton");
    if (archiveButton && !$("deleteClientButton")) {
        const button = createElement("button", "button button-danger", "Delete Client");
        button.type = "button";
        button.id = "deleteClientButton";
        button.hidden = true;
        archiveButton.after(button);
        button.addEventListener("click", () => {
            if (state.currentClient) void changeClientDeletionStatus(state.currentClient.id);
        });
    }


    /* MODULE NAVIGATION */

    document.querySelectorAll(

        ".module-tab[data-tab]"

    ).forEach(button => {

        button.addEventListener(

            "click",

            () => navigateTo(button.dataset.tab)

        );

        button.addEventListener(

            "keydown",

            handleTabKeyboard

        );

    });


    document.querySelectorAll(

        "[data-open-tab]"

    ).forEach(button => {

        button.addEventListener(

            "click",

            () => {

                if (
                    button.dataset.openTab ===
                    "registration"
                ) {

                    openNewRegistration();

                } else {

                    navigateTo(
                        button.dataset.openTab
                    );

                }

            }

        );

    });


    /* QUICK ACTIONS */

    bind(

        "newClientButton",

        "click",

        openNewRegistration

    );

    bind(

        "refreshClientsButton",

        "click",

        () => void handleRefresh()

    );

    bind(

        "quickProspectiveButton",

        "click",

        () => {

            if (state.busy) return;

            clearFilters();

            setValue(

                "clientStatusFilter",

                "prospective"

            );

            navigateTo("directory");

        }

    );


    /* CLIENT DIRECTORY */

    bind(

        "clientSearch",

        "input",

        () => {

            state.currentPage = 1;

            renderDirectory();

        }

    );

    [

        "clientStatusFilter",

        "clientTypeFilter",

        "clientYearFilter",

        "clientSort"

    ].forEach(id => {

        bind(

            id,

            "change",

            () => {

                state.currentPage = 1;

                renderDirectory();

            }

        );

    });

    bind(

        "clearFiltersButton",

        "click",

        clearFilters

    );

    bind(

        "previousPageButton",

        "click",

        () => {

            state.currentPage--;

            renderDirectory();

        }

    );

    bind(

        "nextPageButton",

        "click",

        () => {

            state.currentPage++;

            renderDirectory();

        }

    );

    bind(

        "clientsTableBody",

        "click",

        handleTableAction

    );

    bind(

        "recentClientsBody",

        "click",

        handleTableAction

    );


    /* REGISTRATION FORM */

    bind(

        "clientForm",

        "submit",

        handleClientSubmit

    );

    bind(

        "clientForm",

        "input",

        () => {

            state.formDirty = true;

            setHidden(
                "duplicateWarning",
                true
            );

        }

    );

    bind(

        "clientForm",

        "change",

        () => {

            state.formDirty = true;

        }

    );

    bind(

        "clientType",

        "change",

        updateClientTypeFields

    );

    bind(

        "resetClientFormButton",

        "click",

        () => {

            if (
                state.busy ||
                !confirmDiscardChanges()
            ) return;

            if (state.editingClient) {

                populateClientForm(
                    state.editingClient
                );

            } else {

                resetClientForm();

            }

        }

    );

    bind(

        "cancelRegistrationButton",

        "click",

        () => navigateTo("directory")

    );


    /* CLIENT PROFILE */

    bind(

        "backToDirectoryButton",

        "click",

        () => navigateTo("directory")

    );

    bind(

        "editClientButton",

        "click",

        () => {

            if (state.currentClient) {

                void openClientEditor(

                    state.currentClient.id

                );

            }

        }

    );


    /* CLIENT ACTIVITY */

    bind(

        "addActivityButton",

        "click",

        openActivityDialog

    );

    bind(

        "activityForm",

        "submit",

        handleActivitySubmit

    );

    [

        "closeActivityDialogButton",

        "cancelActivityButton"

    ].forEach(id => {

        bind(

            id,

            "click",

            () => {

                if (!state.busy) {

                    $("activityDialog").close();

                }

            }

        );

    });


    /* ARCHIVE AND REACTIVATION */

    bind(

        "archiveClientButton",

        "click",

        openArchiveDialog

    );

    bind(

        "archiveForm",

        "submit",

        handleArchiveSubmit

    );

    bind(

        "cancelArchiveButton",

        "click",

        () => {

            if (!state.busy) {

                $("archiveDialog").close();

            }

        }

    );

    bind(

        "reactivateClientButton",

        "click",

        handleReactivateClient

    );


    /* PREVENT DISMISSAL DURING SAVE */

    [

        "activityDialog",

        "archiveDialog"

    ].forEach(id => {

        bind(

            id,

            "cancel",

            event => {

                if (state.busy) {

                    event.preventDefault();

                }

            }

        );

    });


    /* SETTINGS AND BACKUP */

    bind(

        "checkConnectionButton",

        "click",

        () => void handleRefresh(

            "checkConnectionButton"

        )

    );

    bind(

        "exportClientsCSVButton",

        "click",

        exportClientsCSV

    );

    bind(

        "downloadClientBackupButton",

        "click",

        exportClientBackup

    );


    /* UNSAVED INFORMATION PROTECTION */

    window.addEventListener(

        "beforeunload",

        event => {

            if (

                state.formDirty ||

                state.busy ||

                state.pendingCreateId

            ) {

                event.preventDefault();

                event.returnValue = "";

            }

        }

    );


    /* NETWORK CONNECTION EVENTS */

    window.addEventListener(

        "offline",

        () => {

            setCloudStatus("offline");

            showMessage(

                "Internet connection lost. " +

                "Displayed records may be outdated. " +

                "Reconnect before saving changes.",

                "warning"

            );

        }

    );

    window.addEventListener(

        "online",

        () => {

            if (

                state.initialized &&

                !state.busy &&

                !state.formDirty

            ) {

                void synchronizeClients()

                    .catch(reportError);

            }

        }

    );


    /* REFRESH AFTER RETURNING TO APPLICATION */

    document.addEventListener(

        "visibilitychange",

        () => {

            if (

                document.visibilityState !== "visible" ||

                !state.initialized ||

                state.busy ||

                state.formDirty

            ) {

                return;

            }

            const elapsed =

                Date.now() -

                (state.lastSynced?.getTime() || 0);

            if (elapsed < 30000) return;

            void runAction(

                null,

                async () => {

                    await synchronizeClients();

                    if (

                        state.currentTab === "profile" &&

                        state.currentClient

                    ) {

                        await loadClientProfile(

                            state.currentClient.id

                        );

                    }

                }

            );

        }

    );


    /* AUTHENTICATION SESSION MONITOR */

    auth.onAuthStateChanged(user => {

        if (

            !user ||

            user.uid !== state.userId

        ) {

            clearSensitiveState();

        }

    });

}


/* =========================================================
   34. APPLICATION INITIALIZATION
   ========================================================= */

export async function initialiseClientSystem(user) {

    if (!user?.uid) {

        throw new Error(

            "Authorized administrator session required."

        );

    }

    if (state.initialized) {

        if (state.userId !== user.uid) {

            clearSensitiveState();

            throw new Error(

                "Authentication session changed."

            );

        }

        return;

    }

    state.userId = user.uid;

    await requireAuthorizedSession();

    await synchronizeClients();

    resetClientForm();

    bindApplicationEvents();

    activateTab("overview");

    await requireAuthorizedSession();

    state.initialized = true;

    hideMessage();

}


/* =========================================================
   MNM LEGAL ASSOCIATES
   CLIENT - DOCUMENT MANAGEMENT INTEGRATION
   Version 1.0
   ========================================================= */

(() => {

    let incomingProfileHandled = false;

    const protectedContent = document.getElementById(
        "protectedContent"
    );

    function removeDocumentIntegration() {
        document.getElementById(
            "clientDocumentIntegration"
        )?.remove();
    }

    function renderDocumentIntegration() {

        if (
            !state.initialized ||
            protectedContent?.hidden ||
            auth.currentUser?.uid !== state.userId ||
            state.currentTab !== "profile" ||
            !state.currentClient
        ) {
            removeDocumentIntegration();
            return;
        }

        const client = state.currentClient;

        const heading = document.getElementById(
            "profileName"
        );

        if (!heading) return;

        let container = document.getElementById(
            "clientDocumentIntegration"
        );

        if (!container) {

            container = document.createElement("div");

            container.id = "clientDocumentIntegration";

            container.style.cssText = `
                display:flex;
                flex-wrap:wrap;
                gap:10px;
                margin:16px 0;
                align-items:center;
            `;

            const button = document.createElement("button");

            button.type = "button";

            button.className = "button button-primary";

            const icon = document.createElement("i");

            icon.className = "fa-solid fa-folder-open";

            button.appendChild(icon);

            button.appendChild(
                document.createTextNode(
                    " View Client Documents"
                )
            );

            button.addEventListener("click", async () => {

                try {

                    if (
                        protectedContent.hidden ||
                        !state.currentClient ||
                        state.busy
                    ) return;

                    const clientId = state.currentClient.id;

                    await requireAuthorizedSession();

                    if (
                        protectedContent.hidden ||
                        auth.currentUser?.uid !== state.userId ||
                        state.currentClient?.id !== clientId
                    ) return;

                    window.location.href =
                        "/documents.html?clientId=" +
                        encodeURIComponent(clientId);

                } catch (error) {

                    showMessage(
                        getErrorMessage(error),
                        "error"
                    );

                }

            });

            container.appendChild(button);

            heading.insertAdjacentElement(
                "afterend",
                container
            );

        }

        container.dataset.clientId = client.id;

    }

    async function handleIncomingClientProfile() {

        if (
            incomingProfileHandled ||
            !state.initialized ||
            protectedContent?.hidden ||
            state.busy
        ) return;

        incomingProfileHandled = true;

        const parameters = new URLSearchParams(
            window.location.search
        );

        const clientId = parameters.get("clientId");

        if (!clientId) return;

        try {

            await requireAuthorizedSession();

            if (
                protectedContent.hidden ||
                auth.currentUser?.uid !== state.userId
            ) return;

            await openClientProfile(clientId);

            renderDocumentIntegration();

        } catch (error) {

            showMessage(
                getErrorMessage(error),
                "error"
            );

        }

    }

    let scheduled = false;

    function scheduleIntegration() {

        if (scheduled) return;

        scheduled = true;

        queueMicrotask(() => {

            scheduled = false;

            renderDocumentIntegration();

            void handleIncomingClientProfile();

        });

    }

    if (protectedContent) {

        const observer = new MutationObserver(
            scheduleIntegration
        );

        observer.observe(protectedContent, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["hidden"]
        });

    }

    auth.onAuthStateChanged(user => {

        if (!user || user.uid !== state.userId) {

            removeDocumentIntegration();

        } else {

            scheduleIntegration();

        }

    });

    scheduleIntegration();

})();

/* =========================================================
   END OF CLIENT - DOCUMENT INTEGRATION
   ========================================================= */

/* =========================================================
   END OF CLIENT MANAGEMENT APPLICATION ENGINE

   MNM LEGAL ASSOCIATES
   Legal Practice Management System

   Version 1.0
   Justice, Integrity & Excellence
   ========================================================= */




