
/* =========================================================
   MNM LEGAL ASSOCIATES
   LEGAL PRACTICE MANAGEMENT SYSTEM

   CASE MANAGEMENT APPLICATION
   Version 1.0

   Justice, Integrity & Excellence
   ========================================================= */

import { auth } from "./firebase-config.js";
import { verifyStaffAccess } from "./auth.js";
import * as cloud from "./cases-cloud.js";


/* =========================================================
   01. APPLICATION STATE
   ========================================================= */

const PAGE_SIZE = 15;

const CLOSED = new Set([
    "disposed",
    "settled",
    "withdrawn",
    "closed"
]);

const state = {
    initialized: false,
    userId: null,
    cases: [],
    clients: [],
    tasks: [],
    filteredCases: [],
    profile: null,
    editingCase: null,
    editingTask: null,
    pendingCaseId: null,
    pendingRecords: {},
    tab: "overview",
    profileTab: "summary",
    page: 1,
    nextCode: "",
    busy: false,
    dirty: false,
    connected: false,
    invalidated: false,
    lastSync: 0,
    messageTimer: null
};

const CASE_FIELDS = [
    "clientId",
    "caseTitle",
    "matterType",
    "clientCapacity",
    "practiceArea",
    "natureOfProceedings",
    "applicableLaw",
    "courtName",
    "courtCity",
    "courtNumber",
    "caseNumber",
    "cnrNumber",
    "filingNumber",
    "filingDate",
    "courtRegistrationDate",
    "presidingJudge",
    "oppositeParty",
    "oppositePartyAdvocate",
    "oppositePartyAddress",
    "assignedAdvocate",
    "engagementDate",
    "status",
    "priority",
    "currentStage",
    "nextHearingDate",
    "nextHearingPurpose",
    "limitationDate",
    "briefFacts",
    "reliefsSought",
    "legalStrategy",
    "pendingWork",
    "notes",
    "disposalDate",
    "disposalOutcome",
    "closureReason"
];

const TASK_FIELDS = {
    title: "taskTitle",
    taskType: "taskType",
    assignedTo: "taskAssignedTo",
    dueDate: "taskDueDate",
    priority: "taskPriority",
    status: "taskStatus",
    description: "taskDescription",
    completionNotes: "taskCompletionNotes"
};


/* =========================================================
   02. DOM UTILITIES
   ========================================================= */

const $ = id => document.getElementById(id);

function text(id, value) {
    const element = $(id);
    if (element) {
        element.textContent = String(value ?? "—");
    }
}

function value(id) {
    return $(id)?.value ?? "";
}

function setValue(id, content) {
    if ($(id)) {
        $(id).value = content ?? "";
    }
}

function show(id, visible = true) {
    if ($(id)) {
        $(id).hidden = !visible;
    }
}

function disable(id, disabled = true) {
    if ($(id)) {
        $(id).disabled = disabled;
    }
}

function bind(id, event, handler) {
    $(id)?.addEventListener(event, handler);
}

function element(tag, className = "", content = "") {
    const node = document.createElement(tag);

    if (className) {
        node.className = className;
    }

    node.textContent = String(content ?? "");

    return node;
}

function clear(id) {
    $(id)?.replaceChildren();
}

function label(dictionary, key) {
    return dictionary[key] || key || "—";
}

function normalize(input) {
    return String(input ?? "")
        .normalize("NFKC")
        .trim()
        .toLowerCase();
}

function display(input) {
    return input === null ||
        input === undefined ||
        input === ""
        ? "—"
        : String(input);
}

function unique(items) {
    return [...new Set(items.filter(Boolean))]
        .sort((a, b) => String(a).localeCompare(String(b)));
}

function activeCase(record) {
    return record.status !== "archived" &&
        !CLOSED.has(record.status);
}

function currentCase() {
    if (!state.profile?.case) {
        throw new Error("Please open a case first.");
    }

    return state.profile.case;
}

function clientById(id) {
    return state.clients.find(client => client.id === id);
}

function clientName(id) {
    return clientById(id)?.fullName || "Client unavailable";
}

function caseById(id) {
    return state.cases.find(record => record.id === id);
}

function today() {
    return cloud.getIndianDate();
}

function addDays(date, days) {
    const result = new Date(date + "T00:00:00Z");

    result.setUTCDate(result.getUTCDate() + days);

    return result.toISOString().slice(0, 10);
}

function formatDate(date) {
    if (!date) return "—";

    const parsed = new Date(date + "T00:00:00Z");

    if (Number.isNaN(parsed.getTime())) return "—";

    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC"
    }).format(parsed);
}

function formatTimestamp(timestamp) {
    if (!timestamp) return "—";

    const date = timestamp.toDate
        ? timestamp.toDate()
        : new Date(timestamp);

    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata"
    }).format(date);
}

function daysRemaining(date) {
    if (!date) return null;

    return Math.round(
        (
            Date.parse(date + "T00:00:00Z") -
            Date.parse(today() + "T00:00:00Z")
        ) / 86400000
    );
}

function dateStatus(date) {
    const days = daysRemaining(date);

    if (days === null) return "Not scheduled";
    if (days < 0) return `${Math.abs(days)} day(s) overdue`;
    if (days === 0) return "Due today";

    return `${days} day(s) remaining`;
}

function taskOverdue(task) {
    return ["pending", "in_progress"].includes(task.status) &&
        Boolean(task.dueDate) &&
        task.dueDate < today();
}


/* =========================================================
   03. AUTHORIZATION AND SESSION SECURITY
   ========================================================= */

function invalidateSession() {
    state.invalidated = true;
    state.cases = [];
    state.clients = [];
    state.tasks = [];
    state.filteredCases = [];
    state.profile = null;
    state.editingCase = null;
    state.editingTask = null;
    state.pendingCaseId = null;
    state.pendingRecords = {};

    document.querySelectorAll("dialog[open]")
        .forEach(dialog => dialog.close());

    show("protectedContent", false);

    [
        "casesTableBody",
        "recentCasesBody",
        "hearingsTableBody",
        "upcomingHearingsBody",
        "deadlinesTableBody",
        "allTasksTableBody",
        "caseTasksTableBody",
        "linkedClientsTableBody",
        "activityTimeline",
        "proceedingsTimeline",
        "caseAlertsList",
        "duplicateCasesList",
        "selectedClientSummary"
    ].forEach(clear);

    document.querySelectorAll("#protectedContent form")
        .forEach(form => form.reset());

    document.querySelectorAll(
        "#protectedContent [id^='profile']"
    ).forEach(node => {
        if (node.matches("dd, strong, span, h2, .profile-notes")) {
            node.textContent = "";
        }
    });
}

async function requireSession() {
    if (
        state.invalidated ||
        !auth.currentUser ||
        auth.currentUser.uid !== state.userId
    ) {
        invalidateSession();
        throw new Error("Your session is no longer authorized.");
    }

    let profile;

    try {
        profile = await verifyStaffAccess(auth.currentUser);
    } catch (error) {
        invalidateSession();
        throw error;
    }

    if (
        !profile ||
        profile.active !== true ||
        profile.role !== "admin" ||
        auth.currentUser?.uid !== state.userId
    ) {
        invalidateSession();

        throw new Error("Administrator access is required.");
    }

    return profile;
}


/* =========================================================
   04. APPLICATION MESSAGES
   ========================================================= */

function message(content, type = "success") {
    if (state.invalidated) return;

    const node = $("appMessage");

    if (!node) return;

    clearTimeout(state.messageTimer);

    node.className = `app-message ${type}`;
    node.textContent = content;
    node.hidden = false;

    state.messageTimer = setTimeout(() => {
        node.hidden = true;
    }, type === "error" ? 15000 : 6000);
}

function connection(status) {
    state.connected = status === "online";

    if ($("cloudStatusIndicator")) {
        $("cloudStatusIndicator").className =
            `connection-indicator ${status}`;
    }

    const labels = {
        online: "Connected to Firebase",
        syncing: "Synchronizing with Firebase...",
        offline: "Connection unavailable"
    };

    text("cloudStatus", labels[status] || status);
    text("databaseConnectionStatus", labels[status] || status);
}

function reportError(error) {
    console.error(
        "Case Management:",
        error?.code || error?.name || "Error"
    );

    if (state.invalidated) {
        window.location.reload();
        return;
    }

    if (
        error?.code === "permission-denied" ||
        error?.code === "unauthenticated"
    ) {
        message(
            "Access denied. Verify your authorization and Firestore rules.",
            "error"
        );
        return;
    }

    message(
        error?.message || "The operation could not be completed.",
        "error"
    );
}

async function runAction(action, buttonId = null) {
    if (state.busy || state.invalidated) return;

    state.busy = true;

    const button = buttonId ? $(buttonId) : null;

    if (button) {
        button.disabled = true;
        button.classList.add("is-loading");
    }

    try {
        await requireSession();
        await action();
    } catch (error) {
        reportError(error);
    } finally {
        state.busy = false;

        if (button) {
            button.disabled = false;
            button.classList.remove("is-loading");
        }
    }
}


/* =========================================================
   05. SAFE UI COMPONENTS
   ========================================================= */

function actionButton(title, callback, danger = false) {
    const button = element(
        "button",
        `button button-small ${
            danger ? "button-danger-outline" : "button-secondary"
        }`,
        title
    );

    button.type = "button";

    button.addEventListener("click", () => {
        if (!state.busy && !state.invalidated) {
            callback();
        }
    });

    return button;
}

function statusBadge(status) {
    const node = element(
        "span",
        "status-badge",
        label(cloud.CASE_STATUSES, status)
    );

    node.dataset.status = status;

    return node;
}

function priorityBadge(priority) {
    const node = element(
        "span",
        "priority-badge",
        label(cloud.CASE_PRIORITIES, priority)
    );

    node.dataset.priority = priority;

    return node;
}

function taskBadge(task) {
    const overdue = taskOverdue(task);

    const node = element(
        "span",
        "task-status-badge",
        overdue
            ? "Overdue"
            : label(cloud.TASK_STATUSES, task.status)
    );

    node.dataset.status = overdue ? "overdue" : task.status;

    return node;
}

function stacked(primary, secondary, className = "case-title") {
    const node = element("div");

    node.append(
        element("span", className, display(primary))
    );

    if (secondary) {
        node.append(
            element("small", "case-secondary", secondary)
        );
    }

    return node;
}

function actions(...buttons) {
    const node = element("div", "table-actions");

    buttons.filter(Boolean).forEach(button => node.append(button));

    return node;
}

function tableRow(bodyId, cells, className = "") {
    const body = $(bodyId);

    if (!body) return;

    const row = element("tr", className);

    for (const content of cells) {
        const cell = element("td");

        if (content instanceof Node) {
            cell.append(content);
        } else {
            cell.textContent = display(content);
        }

        row.append(cell);
    }

    body.append(row);
}

function setOptions(id, options, firstLabel = "All", firstValue = "all") {
    const select = $(id);

    if (!select) return;

    const previous = select.value;

    select.replaceChildren(
        new Option(firstLabel, firstValue)
    );

    for (const option of options) {
        select.add(new Option(option.label, option.value));
    }

    if ([...select.options].some(option => option.value === previous)) {
        select.value = previous;
    }
}

function optionsFromStrings(items) {
    return unique(items).map(item => ({
        label: item,
        value: item
    }));
}


/* =========================================================
   06. DATABASE SYNCHRONIZATION
   ========================================================= */

async function synchronize({ loadTasks = true } = {}) {
    await requireSession();

    connection("syncing");

    try {
        const [cases, clients, nextCode] = await Promise.all([
            cloud.fetchCases({ includeArchived: true }),
            cloud.fetchCaseClients({ includeArchived: true }),
            cloud.getNextCaseCode()
        ]);

        const ids = new Set();
        const codes = new Set();

        for (const record of cases) {
            if (
                !record.id ||
                !record.caseCode ||
                ids.has(record.id) ||
                codes.has(record.caseCode)
            ) {
                throw new Error(
                    "Case identity inconsistency detected. Contact the administrator."
                );
            }

            ids.add(record.id);
            codes.add(record.caseCode);
        }

        let tasks = state.tasks;

        if (loadTasks) {
            const results = [];

            // Small batches avoid excessive concurrent requests.

            for (let index = 0; index < cases.length; index += 5) {
                const batch = cases.slice(index, index + 5);

                const groups = await Promise.all(
                    batch.map(async record => {
                        const records = await cloud.fetchCaseTasks(record.id);

                        return records.map(task => ({
                            ...task,
                            caseId: record.id
                        }));
                    })
                );

                results.push(...groups.flat());
            }

            tasks = results;
        }

        await requireSession();

        state.cases = cases;
        state.clients = clients;
        state.tasks = tasks;
        state.nextCode = nextCode;
        state.lastSync = Date.now();

        populateFilters();
        populateClientSelect();
        renderOverview();
        renderDirectory();
        renderHearings();
        renderAllTasks();
        renderSettings();

        if (!state.editingCase) {
            setValue("caseCode", state.nextCode);
        }

        connection("online");

        text(
            "lastSynced",
            "Last synced: " +
            formatTimestamp(new Date())
        );

    } catch (error) {
        connection("offline");
        throw error;
    }
}


/* =========================================================
   07. MODULE NAVIGATION
   ========================================================= */

function confirmDialog(title, description, acceptLabel = "Continue") {
    const dialog = $("confirmationDialog");

    if (!dialog?.showModal) {
        return Promise.resolve(
            window.confirm(`${title}\n\n${description}`)
        );
    }

    return new Promise(resolve => {
        text("confirmationTitle", title);
        text("confirmationMessage", description);
        text("acceptConfirmation", acceptLabel);

        const accept = $("acceptConfirmation");
        const cancel = $("cancelConfirmation");

        let result = false;

        function yes() {
            result = true;
            dialog.close();
        }

        function no() {
            dialog.close();
        }

        function finish() {
            accept.removeEventListener("click", yes);
            cancel.removeEventListener("click", no);

            resolve(result && !state.invalidated);
        }

        accept.addEventListener("click", yes);
        cancel.addEventListener("click", no);

        dialog.addEventListener("close", finish, {
            once: true
        });

        dialog.showModal();
    });
}

async function mayLeaveForm() {
    if (!state.dirty) return true;

    return confirmDialog(
        "Unsaved case details",
        "Your unsaved changes will be discarded. If a previous save failed, check the case directory before registering the same matter again.",
        "Discard changes"
    );
}

function activateTab(tab) {
    state.tab = tab;

    document.querySelectorAll(".module-panel")
        .forEach(panel => {
            panel.hidden = panel.id !== `${tab}Panel`;
        });

    document.querySelectorAll("[data-tab]")
        .forEach(button => {
            const selected = button.dataset.tab === tab;

            button.classList.toggle("active", selected);
            button.setAttribute("aria-selected", String(selected));
            button.tabIndex = selected ? 0 : -1;
        });

    window.scrollTo({
        top: 0,
        behavior: "auto"
    });
}

async function navigate(tab) {
    if (state.busy || state.invalidated) return;

    if (tab === state.tab) return;

    if (!(await mayLeaveForm())) return;

    if (state.tab === "registration") {
        resetCaseForm();
    }

    if (tab === "registration") {
        resetCaseForm();
    }

    activateTab(tab);
}

function activateProfileTab(tab) {
    state.profileTab = tab;

    const target =
        `profile${tab.charAt(0).toUpperCase()}${tab.slice(1)}Panel`;

    document.querySelectorAll(".profile-panel")
        .forEach(panel => {
            panel.hidden = panel.id !== target;
        });

    document.querySelectorAll("[data-profile-tab]")
        .forEach(button => {
            const selected = button.dataset.profileTab === tab;

            button.classList.toggle("active", selected);
            button.setAttribute("aria-selected", String(selected));
            button.tabIndex = selected ? 0 : -1;
        });
}

function bindTabKeyboard(selector, dataKey, callback) {
    const buttons = [...document.querySelectorAll(selector)];

    buttons.forEach((button, index) => {
        button.addEventListener("keydown", event => {
            let next = index;

            if (event.key === "ArrowRight") {
                next = (index + 1) % buttons.length;
            } else if (event.key === "ArrowLeft") {
                next = (index - 1 + buttons.length) % buttons.length;
            } else if (event.key === "Home") {
                next = 0;
            } else if (event.key === "End") {
                next = buttons.length - 1;
            } else {
                return;
            }

            event.preventDefault();

            buttons[next].focus();

            callback(buttons[next].dataset[dataKey]);
        });
    });
}


/* =========================================================
   08. OVERVIEW DASHBOARD
   ========================================================= */

function renderOverview() {
    const stats = cloud.calculateCaseStatistics(state.cases);

    const fields = {
        totalCases: stats.total,
        activeCases: stats.active,
        preFilingCases: stats.preFiling,
        hearingsToday: stats.hearingsToday,
        urgentCases: stats.urgent,
        closedCases: stats.closed,
        upcomingDeadlines: stats.upcomingDeadlines,
        overdueDeadlines: stats.overdueDeadlines
    };

    Object.entries(fields).forEach(([id, count]) => {
        text(id, count);
    });

    renderAlerts();
    renderRecentCases();
    renderUpcomingHearings();
}

function renderAlerts() {
    clear("caseAlertsList");

    const alerts = [];

    for (const record of state.cases.filter(activeCase)) {
        const deadline = daysRemaining(record.limitationDate);
        const hearing = daysRemaining(record.nextHearingDate);

        if (deadline !== null && deadline <= 7) {
            alerts.push({
                record,
                title: deadline < 0
                    ? "Overdue recorded deadline"
                    : "Upcoming recorded deadline",
                description:
                    `${formatDate(record.limitationDate)} · ` +
                    dateStatus(record.limitationDate),
                type: deadline <= 0 ? "danger" : "warning",
                rank: deadline
            });
        }

        if (hearing !== null && hearing <= 0) {
            alerts.push({
                record,
                title: hearing < 0
                    ? "Past hearing date — update required"
                    : "Hearing scheduled today",
                description:
                    `${formatDate(record.nextHearingDate)} · ` +
                    display(record.courtName),
                type: hearing < 0 ? "warning" : "info",
                rank: hearing
            });
        }

        if (record.priority === "urgent") {
            alerts.push({
                record,
                title: "Urgent priority matter",
                description: display(record.currentStage),
                type: "danger",
                rank: 10
            });
        }
    }

    alerts.sort((a, b) => a.rank - b.rank);

    for (const alert of alerts.slice(0, 15)) {
        const node = element("article", `case-alert ${alert.type}`);

        const icon = element("i", "fa-solid fa-circle-exclamation");

        icon.setAttribute("aria-hidden", "true");

        const content = element("div", "alert-content");

        content.append(
            element("h3", "", alert.title),
            element(
                "p",
                "",
                `${alert.record.caseCode} — ${alert.record.caseTitle}`
            ),
            element("p", "", alert.description)
        );

        node.append(
            icon,
            content,
            actionButton("Open Case", () => openProfile(alert.record.id))
        );

        $("caseAlertsList")?.append(node);
    }

    show("emptyCaseAlerts", alerts.length === 0);
}

function renderRecentCases() {
    clear("recentCasesBody");

    const records = state.cases
        .filter(record => record.status !== "archived")
        .slice()
        .sort(compareNewest)
        .slice(0, 8);

    records.forEach(record => {
        tableRow("recentCasesBody", [
            element("span", "case-code", record.caseCode),
            record.caseTitle,
            clientName(record.clientId),
            record.practiceArea,
            statusBadge(record.status),
            actionButton("View", () => openProfile(record.id))
        ]);
    });

    show("emptyRecentCases", records.length === 0);
}

function renderUpcomingHearings() {
    clear("upcomingHearingsBody");

    const end = addDays(today(), 6);

    const records = state.cases
        .filter(record =>
            activeCase(record) &&
            record.nextHearingDate &&
            record.nextHearingDate >= today() &&
            record.nextHearingDate <= end
        )
        .sort((a, b) =>
            a.nextHearingDate.localeCompare(b.nextHearingDate)
        );

    records.forEach(record => {
        tableRow("upcomingHearingsBody", [
            formatDate(record.nextHearingDate),
            stacked(record.caseTitle, record.caseCode),
            record.courtName,
            record.nextHearingPurpose,
            record.assignedAdvocate,
            actionButton("View", () => openProfile(record.id))
        ]);
    });

    show("emptyUpcomingHearings", records.length === 0);
}


/* =========================================================
   09. DIRECTORY FILTERS
   ========================================================= */

function compareNewest(a, b) {
    return String(b.registrationYear).localeCompare(
        String(a.registrationYear)
    ) || Number(b.sequenceNumber) - Number(a.sequenceNumber);
}

function populateFilters() {
    setOptions(
        "practiceAreaFilter",
        optionsFromStrings([
            ...cloud.PRACTICE_AREAS,
            ...state.cases.map(record => record.practiceArea)
        ]),
        "All Practice Areas"
    );

    const advocates = optionsFromStrings(
        state.cases.map(record => record.assignedAdvocate)
    );

    setOptions("caseAdvocateFilter", advocates, "All Advocates");
    setOptions("hearingAdvocateFilter", advocates, "All Advocates");

    setOptions(
        "caseYearFilter",
        optionsFromStrings(
            state.cases.map(record => record.registrationYear)
        ).reverse(),
        "All Years"
    );

    setOptions(
        "taskCaseFilter",
        state.cases.map(record => ({
            value: record.id,
            label: `${record.caseCode} — ${record.caseTitle}`
        })),
        "All Cases"
    );
}

function filterCases() {
    const search = normalize(value("caseSearch"));

    const filters = {
        status: value("caseStatusFilter"),
        practiceArea: value("practiceAreaFilter"),
        matterType: value("matterTypeFilter"),
        priority: value("casePriorityFilter"),
        assignedAdvocate: value("caseAdvocateFilter"),
        registrationYear: value("caseYearFilter")
    };

    let records = state.cases.filter(record => {
        const searchable = normalize([
            record.caseCode,
            record.caseTitle,
            record.caseNumber,
            record.cnrNumber,
            record.filingNumber,
            record.courtName,
            record.oppositeParty,
            record.assignedAdvocate,
            clientName(record.clientId)
        ].join(" "));

        if (search && !searchable.includes(search)) {
            return false;
        }

        return Object.entries(filters).every(([key, selected]) =>
            !selected ||
            selected === "all" ||
            String(record[key]) === selected
        );
    });

    const sort = value("caseSort");

    const priorities = {
        urgent: 0,
        high: 1,
        normal: 2
    };

    records.sort((a, b) => {
        switch (sort) {
            case "oldest":
                return compareNewest(b, a);

            case "title-asc":
                return a.caseTitle.localeCompare(b.caseTitle);

            case "hearing-asc":
                return (a.nextHearingDate || "9999-12-31")
                    .localeCompare(b.nextHearingDate || "9999-12-31");

            case "priority":
                return (
                    (priorities[a.priority] ?? 3) -
                    (priorities[b.priority] ?? 3)
                ) || compareNewest(a, b);

            default:
                return compareNewest(a, b);
        }
    });

    state.filteredCases = records;

    return records;
}

function renderDirectory() {
    const records = filterCases();

    const pages = Math.max(
        1,
        Math.ceil(records.length / PAGE_SIZE)
    );

    state.page = Math.max(1, Math.min(state.page, pages));

    const start = (state.page - 1) * PAGE_SIZE;

    const visible = records.slice(start, start + PAGE_SIZE);

    clear("casesTableBody");

    for (const record of visible) {
        tableRow("casesTableBody", [
            element("span", "case-code", record.caseCode),

            stacked(
                record.caseTitle,
                record.caseNumber || record.cnrNumber || ""
            ),

            clientName(record.clientId),

            stacked(record.courtName, record.courtCity),

            formatDate(record.nextHearingDate),

            priorityBadge(record.priority),

            statusBadge(record.status),

            actions(
                actionButton("View", () => openProfile(record.id)),

                record.status !== "archived" &&
                !CLOSED.has(record.status)
                    ? actionButton("Edit", () => openEditor(record.id))
                    : null
            )
        ]);
    }

    text(
        "caseResultCount",
        `${records.length} case(s) found`
    );

    text(
        "paginationInfo",
        records.length
            ? `Showing ${start + 1}–${start + visible.length} of ${records.length}`
            : "No matching cases"
    );

    text("currentPageNumber", state.page);

    disable("previousPageButton", state.page <= 1);
    disable("nextPageButton", state.page >= pages);

    show("emptyCases", records.length === 0);
}

function clearFilters() {
    [
        "caseStatusFilter",
        "practiceAreaFilter",
        "matterTypeFilter",
        "casePriorityFilter",
        "caseAdvocateFilter",
        "caseYearFilter"
    ].forEach(id => setValue(id, "all"));

    setValue("caseSearch", "");
    setValue("caseSort", "newest");

    state.page = 1;

    renderDirectory();
}


/* =========================================================
   10. CLIENT SELECTION
   ========================================================= */

function populateClientSelect() {
    const selected = value("clientId");

    const available = state.clients.filter(client =>
        client.status !== "archived" ||
        client.id === state.editingCase?.clientId
    );

    setOptions(
        "clientId",
        available.map(client => ({
            value: client.id,
            label: `${client.clientCode} — ${client.fullName}`
        })),
        "Select Registered Client",
        ""
    );

    if (selected) {
        setValue("clientId", selected);
    }

    renderSelectedClient();
}

function renderSelectedClient() {
    const client = clientById(value("clientId"));

    clear("selectedClientSummary");

    show("selectedClientSummary", Boolean(client));

    if (!client) return;

    const grid = element("div", "client-summary-grid");

    const details = [
        ["Client ID", client.clientCode],
        ["Client Name", client.fullName],
        ["Mobile", client.mobile],
        ["Email", client.email],
        ["Assigned Advocate", client.assignedAdvocate],
        ["Client Status", client.status]
    ];

    details.forEach(([name, content]) => {
        const node = element("div");

        node.append(
            element("span", "", name),
            element("strong", "", display(content))
        );

        grid.append(node);
    });

    $("selectedClientSummary")?.append(grid);
}


/* =========================================================
   11. CASE REGISTRATION FORM
   ========================================================= */

function updateFormVisibility() {
    show(
        "disposalDetailsCard",
        CLOSED.has(value("status"))
    );

    // Court details remain accessible for advisory matters
    // involving an existing or anticipated proceeding.
}

function resetCaseForm() {
    $("caseForm")?.reset();

    state.editingCase = null;
    state.pendingCaseId = null;
    state.dirty = false;

    setValue("editingCaseId", "");
    setValue("caseCode", state.nextCode);
    setValue("engagementDate", today());
    setValue("status", "drafting");
    setValue("priority", "normal");
    setValue("matterType", "litigation");

    disable("clientId", false);

    text("registrationHeading", "Register New Case");
    text("saveCaseButtonText", "Register Case");

    clear("duplicateCasesList");
    show("duplicateWarning", false);

    populateClientSelect();
    updateFormVisibility();
}

function collectCaseForm() {
    const data = {};

    CASE_FIELDS.forEach(field => {
        data[field] = value(field).trim();
    });

    if (state.editingCase) {
        data.clientId = state.editingCase.clientId;
    }

    data.cnrNumber = data.cnrNumber.toUpperCase();

    return cloud.validateCaseData(data);
}

function renderDuplicates(matches) {
    clear("duplicateCasesList");

    matches.forEach(match => {
        const node = element("div", "duplicate-case");

        node.append(
            element(
                "strong",
                "",
                `${match.caseCode} — ${match.caseTitle}`
            ),

            element(
                "p",
                "",
                match.reasons.join("; ")
            )
        );

        $("duplicateCasesList")?.append(node);
    });

    show("duplicateWarning", matches.length > 0);
}

async function openEditor(id) {
    if (!(await mayLeaveForm())) return;

    await runAction(async () => {
        const record = await cloud.getCase(id);

        if (!activeCase(record)) {
            throw new Error(
                "Reopen or reactivate this matter before editing."
            );
        }

        resetCaseForm();

        state.editingCase = record;

        populateClientSelect();

        CASE_FIELDS.forEach(field => {
            setValue(field, record[field] ?? "");
        });

        setValue("editingCaseId", record.id);
        setValue("caseCode", record.caseCode);

        // Preserve the primary client association.

        disable("clientId", true);

        text("registrationHeading", "Edit Case Details");
        text("saveCaseButtonText", "Save Changes");

        renderSelectedClient();
        updateFormVisibility();

        state.dirty = false;

        activateTab("registration");
    });
}

async function submitCase(event) {
    event.preventDefault();

    if (!$("caseForm").reportValidity()) return;

    await runAction(async () => {
        const data = collectCaseForm();

        const existing = state.editingCase;

        let saved;

        // Recover a registration that may already have
        // committed before a network or read-back failure.

        if (!existing && state.pendingCaseId) {
            const records = await cloud.fetchCases({
                includeArchived: true
            });

            saved = records.find(
                record => record.id === state.pendingCaseId
            );
        }

        if (!saved) {
            const matches = await cloud.findDuplicateCases(
                data,
                existing?.id || null
            );

            renderDuplicates(matches);

            if (matches.length) {
                const proceed = await confirmDialog(
                    "Possible duplicate case",
                    "One or more similar matters already exist. Verify the case number, CNR and client association before proceeding.",
                    "Continue Anyway"
                );

                if (!proceed) return;
            }

            if (existing) {
                saved = await cloud.updateCase(
                    existing.id,
                    data,
                    existing.revision
                );
            } else {
                state.pendingCaseId ||= cloud.generateCaseId();

                saved = await cloud.createCase(
                    data,
                    state.pendingCaseId
                );
            }
        }

        await requireSession();

        state.dirty = false;
        state.pendingCaseId = null;

        resetCaseForm();

        message(
            `Case ${saved.caseCode} saved successfully.`
        );

        try {
            await synchronize();
            await loadProfile(saved.id);
        } catch (error) {
            activateTab("directory");

            message(
                "Case saved, but the directory could not be refreshed. Refresh before making further changes.",
                "warning"
            );
        }

    }, "saveCaseButton");
}


/* =========================================================
   12. CASE PROFILE
   ========================================================= */

async function openProfile(id) {
    if (!(await mayLeaveForm())) return;

    await runAction(async () => {
        state.dirty = false;

        await loadProfile(id);
    });
}

async function loadProfile(id, tab = "summary") {
    const profile = await cloud.fetchCaseProfile(id);

    await requireSession();

    state.profile = profile;

    renderProfile();

    activateTab("profile");
    activateProfileTab(tab);
}

function renderProfile() {
    const profile = state.profile;
    const record = profile.case;
    const primary = profile.primaryClient;

    text("profileCaseCode", record.caseCode);
    text("profileCaseTitle", record.caseTitle);
    text("profilePracticeArea", record.practiceArea);
    text("profileRegisteredOn", formatTimestamp(record.createdAt));

    text(
        "profileStatus",
        label(cloud.CASE_STATUSES, record.status)
    );

    $("profileStatus").dataset.status = record.status;

    text(
        "profilePriority",
        label(cloud.CASE_PRIORITIES, record.priority)
    );

    $("profilePriority").dataset.priority = record.priority;

    const fields = {
        profileFullCaseTitle: record.caseTitle,
        profileMatterType: label(cloud.MATTER_TYPES, record.matterType),
        profilePrimaryClientName: primary?.fullName,
        profileClientCapacity: record.clientCapacity,
        profileNatureOfProceedings: record.natureOfProceedings,
        profileAssignedAdvocate: record.assignedAdvocate,
        profileEngagementDate: formatDate(record.engagementDate),
        profileCurrentStage: record.currentStage,
        profileLastUpdated: formatTimestamp(record.updatedAt),

        profileCourtName: record.courtName,
        profileCourtCity: record.courtCity,
        profileCourtNumber: record.courtNumber,
        profilePresidingJudge: record.presidingJudge,
        profileCaseNumber: record.caseNumber,
        profileCnrNumber: record.cnrNumber,
        profileFilingNumber: record.filingNumber,
        profileFilingDate: formatDate(record.filingDate),
        profileCourtRegistrationDate:
            formatDate(record.courtRegistrationDate),

        profileNextHearingDate: formatDate(record.nextHearingDate),
        profileNextHearingPurpose: record.nextHearingPurpose,
        profileLimitationDate: formatDate(record.limitationDate),

        profileOppositeParty: record.oppositeParty,
        profileOppositePartyAdvocate: record.oppositePartyAdvocate,
        profileOppositePartyAddress: record.oppositePartyAddress,

        profileDisposalDate: formatDate(record.disposalDate),
        profileDisposalOutcome: record.disposalOutcome,
        profileClosureReason: record.closureReason,

        profilePrimaryClientCode: primary?.clientCode,
        profileLinkedPrimaryName: primary?.fullName,
        profilePrimaryClientMobile: primary?.mobile,
        profilePrimaryClientEmail: primary?.email,
        profilePrimaryClientCapacity: record.clientCapacity,

        profileApplicableLaw: record.applicableLaw,
        profileBriefFacts: record.briefFacts,
        profileReliefsSought: record.reliefsSought,
        profileLegalStrategy: record.legalStrategy,
        profilePendingWork: record.pendingWork,
        profileNotes: record.notes
    };

    Object.entries(fields).forEach(([id, content]) => {
        text(id, display(content));
    });

    const archived = record.status === "archived";
    const closed = CLOSED.has(record.status);
    const active = !archived && !closed;

    show("archivedCaseNotice", archived);
    show("closedCaseNotice", closed);

    if (archived) {
        text(
            "archivedCaseNotice",
            "Archived matter. Reason: " +
            display(record.archiveReason)
        );
    }

    show("editCaseButton", active);
    show("closeCaseButton", active);
    show("reopenCaseButton", closed);
    show("archiveCaseButton", !archived);
    show("reactivateCaseButton", archived);

    disable("copyCnrButton", !record.cnrNumber);
    disable("updateHearingButton", !active);
    disable("addProceedingButton", !active);
    disable("addTaskButton", !active);
    disable("linkClientButton", !active);
    disable("addActivityButton", archived);

    renderLinkedClients();
    renderProceedings();
    renderProfileTasks();
    renderActivities();
}

async function refreshProfile(tab = state.profileTab) {
    const id = currentCase().id;

    await synchronize();

    await loadProfile(id, tab);
}

async function finishMutation(dialogId, success, tab = state.profileTab) {
    $(dialogId)?.close();

    message(success);

    try {
        await refreshProfile(tab);
    } catch (error) {
        state.profile = null;

        activateTab("directory");

        message(
            "Change saved, but refresh failed. Reopen the matter after synchronizing.",
            "warning"
        );
    }
}


/* =========================================================
   13. HEARING SCHEDULE AND DEADLINES
   ========================================================= */

function renderHearings() {
    const stats = cloud.calculateCaseStatistics(state.cases);

    text("hearingTodayCount", stats.hearingsToday);
    text("hearingWeekCount", stats.hearingsNextSevenDays);
    text("hearingMonthCount", stats.upcomingHearings);
    text("overdueHearingCount", stats.overdueHearings);

    const period = value("hearingPeriodFilter");
    const advocate = value("hearingAdvocateFilter");
    const search = normalize(value("hearingSearch"));

    const records = state.cases
        .filter(record => {
            if (!activeCase(record) || !record.nextHearingDate) {
                return false;
            }

            if (
                advocate &&
                advocate !== "all" &&
                record.assignedAdvocate !== advocate
            ) {
                return false;
            }

            const searchable = normalize([
                record.caseTitle,
                record.caseCode,
                record.caseNumber,
                record.courtName,
                record.nextHearingPurpose
            ].join(" "));

            if (search && !searchable.includes(search)) {
                return false;
            }

            const days = daysRemaining(record.nextHearingDate);

            if (period === "today") return days === 0;
            if (period === "overdue") return days < 0;
            if (period === "all") return true;

            return days >= 0 && days < Number(period || 30);
        })
        .sort((a, b) =>
            a.nextHearingDate.localeCompare(b.nextHearingDate)
        );

    clear("hearingsTableBody");

    records.forEach(record => {
        tableRow("hearingsTableBody", [
            stacked(
                formatDate(record.nextHearingDate),
                dateStatus(record.nextHearingDate),
                "date-cell"
            ),

            stacked(record.caseTitle, record.caseCode),
            record.caseNumber,
            stacked(record.courtName, record.courtNumber),
            record.nextHearingPurpose,
            record.assignedAdvocate,

            actionButton("Open", () => openProfile(record.id))
        ]);
    });

    show("emptyHearings", records.length === 0);

    renderDeadlines();
}

function renderDeadlines() {
    clear("deadlinesTableBody");

    const records = state.cases
        .filter(record =>
            activeCase(record) &&
            record.limitationDate
        )
        .sort((a, b) =>
            a.limitationDate.localeCompare(b.limitationDate)
        );

    records.forEach(record => {
        const days = daysRemaining(record.limitationDate);

        const badge = element(
            "span",
            "deadline-badge",
            dateStatus(record.limitationDate)
        );

        badge.dataset.status =
            days < 0 ? "overdue" :
            days === 0 ? "today" :
            "upcoming";

        tableRow("deadlinesTableBody", [
            formatDate(record.limitationDate),
            stacked(record.caseTitle, record.caseCode),
            record.assignedAdvocate,
            priorityBadge(record.priority),
            badge,
            actionButton("Open", () => openProfile(record.id))
        ]);
    });

    show("emptyDeadlines", records.length === 0);
}

function openHearingDialog() {
    const record = currentCase();

    if (!activeCase(record)) return;

    setValue("hearingNextDate", record.nextHearingDate);
    setValue("hearingNextPurpose", record.nextHearingPurpose);
    setValue("hearingCurrentStage", record.currentStage);

    $("hearingDialog").showModal();
}

async function saveHearing(event) {
    event.preventDefault();

    await runAction(async () => {
        const record = currentCase();

        await cloud.updateCaseHearing(
            record.id,
            {
                nextHearingDate: value("hearingNextDate"),
                nextHearingPurpose: value("hearingNextPurpose"),
                currentStage: value("hearingCurrentStage")
            },
            record.revision
        );

        await finishMutation(
            "hearingDialog",
            "Hearing schedule updated successfully.",
            "summary"
        );

    }, "saveHearingButton");
}


/* =========================================================
   14. COURT PROCEEDINGS
   ========================================================= */

function renderProceedings() {
    clear("proceedingsTimeline");

    const records = state.profile.proceedings;

    records.forEach(record => {
        const card = element("article", "proceeding-item");

        const header = element("div", "proceeding-header");

        header.append(
            element("h3", "", "Court Proceedings"),
            element(
                "span",
                "proceeding-date",
                formatDate(record.hearingDate)
            )
        );

        card.append(header);

        const meta = element(
            "div",
            "proceeding-meta",
            [
                record.courtName,
                record.presidingJudge
            ].filter(Boolean).join(" · ")
        );

        card.append(meta);

        const sections = [
            ["Appearance", record.appearance],
            ["Proceedings", record.proceedings],
            ["Order / Directions", record.orderSummary],
            ["Confidential Notes", record.confidentialNotes]
        ];

        sections.forEach(([title, content]) => {
            if (!content) return;

            const section = element("div", "proceeding-section");

            section.append(
                element("h4", "", title),
                element("p", "", content)
            );

            card.append(section);
        });

        if (record.nextHearingDate) {
            card.append(
                element(
                    "div",
                    "proceeding-next-hearing",
                    `Next hearing: ${formatDate(record.nextHearingDate)} — ${
                        display(record.nextHearingPurpose)
                    }`
                )
            );
        }

        card.append(
            element(
                "div",
                "proceeding-footer",
                `Recorded: ${formatTimestamp(record.createdAt)}`
            )
        );

        $("proceedingsTimeline")?.append(card);
    });

    show("emptyProceedings", records.length === 0);
}

function openProceedingDialog() {
    const record = currentCase();

    if (!activeCase(record)) return;

    $("proceedingForm").reset();

    setValue("proceedingHearingDate", today());
    setValue("proceedingCourtName", record.courtName);
    setValue("proceedingJudge", record.presidingJudge);

    $("updateMainHearingCheckbox").checked = false;

    state.pendingRecords.proceeding = null;

    $("proceedingDialog").showModal();
}

async function saveProceeding(event) {
    event.preventDefault();

    await runAction(async () => {
        const record = currentCase();

        const input = cloud.validateProceedingData({
            hearingDate: value("proceedingHearingDate"),
            courtName: value("proceedingCourtName"),
            presidingJudge: value("proceedingJudge"),
            appearance: value("proceedingAppearance"),
            proceedings: value("proceedingDetails"),
            orderSummary: value("proceedingOrderSummary"),
            nextHearingDate: value("proceedingNextDate"),
            nextHearingPurpose: value("proceedingNextPurpose"),
            confidentialNotes: value("proceedingConfidentialNotes")
        });

        const updateHearing =
            $("updateMainHearingCheckbox").checked;

        if (updateHearing && !input.nextHearingDate) {
            const accepted = await Promise.resolve(
                window.confirm(
                    "No next hearing date has been entered. Updating the main schedule may clear its existing hearing date. Continue?"
                )
            );

            if (!accepted) return;
        }

        let saved = false;

        if (state.pendingRecords.proceeding) {
            const records = await cloud.fetchProceedings(record.id);

            saved = records.some(item =>
                item.id === state.pendingRecords.proceeding
            );
        }

        if (!saved) {
            state.pendingRecords.proceeding ||=
                cloud.generateRecordId();

            await cloud.addProceeding(
                record.id,
                input,
                record.revision,
                {
                    updateHearing,
                    proceedingId: state.pendingRecords.proceeding
                }
            );
        }

        state.pendingRecords.proceeding = null;

        await finishMutation(
            "proceedingDialog",
            "Court proceedings recorded successfully.",
            "proceedings"
        );

    }, "saveProceedingButton");
}


/* =========================================================
   15. TASK MANAGEMENT
   ========================================================= */

function taskActions(task, record) {
    if (!record || !activeCase(record)) {
        return element("span", "text-muted", "Read only");
    }

    return actions(
        actionButton("Edit", () => openTaskDialog(task, record.id))
    );
}

function renderTaskRow(bodyId, task, includeCase = false) {
    const record = caseById(task.caseId) ||
        state.profile?.case;

    const cells = [
        stacked(task.title, task.description, "task-title")
    ];

    if (includeCase) {
        cells.push(
            stacked(record?.caseTitle, record?.caseCode)
        );
    }

    cells.push(
        task.assignedTo,
        formatDate(task.dueDate),
        priorityBadge(task.priority),
        taskBadge(task),
        taskActions(task, record)
    );

    tableRow(
        bodyId,
        cells,
        taskOverdue(task) ? "task-overdue" : ""
    );
}

function renderProfileTasks() {
    const tasks = state.profile.tasks.map(task => ({
        ...task,
        caseId: state.profile.case.id
    }));

    const stats = cloud.calculateTaskStatistics(tasks);

    text("profileTotalTasks", stats.total);
    text("profilePendingTasks", stats.pending);
    text("profileInProgressTasks", stats.inProgress);
    text("profileCompletedTasks", stats.completed);
    text("profileOverdueTasks", stats.overdue);

    clear("caseTasksTableBody");

    tasks.forEach(task => {
        renderTaskRow("caseTasksTableBody", task);
    });

    show("emptyCaseTasks", tasks.length === 0);
}

function renderAllTasks() {
    const tasks = state.tasks.filter(task => {
        const record = caseById(task.caseId);

        return record && record.status !== "archived";
    });

    const stats = cloud.calculateTaskStatistics(tasks);

    text("totalTasks", stats.total);
    text("pendingTasks", stats.pending);
    text("inProgressTasks", stats.inProgress);
    text("overdueTasks", stats.overdue);
    text("completedTasks", stats.completed);

    const caseId = value("taskCaseFilter");
    const status = value("taskStatusFilter");
    const priority = value("taskPriorityFilter");
    const search = normalize(value("taskSearch"));

    const filtered = tasks.filter(task => {
        const record = caseById(task.caseId);

        if (
            caseId &&
            caseId !== "all" &&
            task.caseId !== caseId
        ) return false;

        if (status === "overdue") {
            if (!taskOverdue(task)) return false;
        } else if (
            status &&
            status !== "all" &&
            task.status !== status
        ) {
            return false;
        }

        if (
            priority &&
            priority !== "all" &&
            task.priority !== priority
        ) return false;

        return !search || normalize([
            task.title,
            task.description,
            task.assignedTo,
            record?.caseTitle,
            record?.caseCode
        ].join(" ")).includes(search);
    });

    filtered.sort((a, b) =>
        (a.dueDate || "9999-12-31")
            .localeCompare(b.dueDate || "9999-12-31")
    );

    clear("allTasksTableBody");

    filtered.forEach(task => {
        renderTaskRow("allTasksTableBody", task, true);
    });

    show("emptyAllTasks", filtered.length === 0);
}

function updateTaskFormVisibility() {
    show(
        "taskCompletionNotesGroup",
        ["completed", "cancelled"].includes(value("taskStatus"))
    );
}

function openTaskDialog(task = null, parentId = null) {
    const caseId = parentId || currentCase().id;

    const record = caseById(caseId) || currentCase();

    if (!activeCase(record)) return;

    $("taskForm").reset();

    state.editingTask = task;
    state.pendingRecords.task = null;

    setValue("taskParentCaseId", caseId);
    setValue("editingTaskId", task?.id || "");

    text(
        "taskDialogTitle",
        task ? "Edit Case Task" : "Create Case Task"
    );

    if (task) {
        Object.entries(TASK_FIELDS).forEach(([key, id]) => {
            setValue(id, task[key]);
        });
    } else {
        setValue("taskAssignedTo", record.assignedAdvocate);
        setValue("taskStatus", "pending");
        setValue("taskPriority", "normal");
        setValue("taskType", "other");
    }

    for (const option of $("taskStatus").options) {
        option.disabled =
            !task &&
            ["completed", "cancelled"].includes(option.value);
    }

    updateTaskFormVisibility();

    $("taskDialog").showModal();
}

async function saveTask(event) {
    event.preventDefault();

    await runAction(async () => {
        const caseId = value("taskParentCaseId");

        const input = {};

        Object.entries(TASK_FIELDS).forEach(([key, id]) => {
            input[key] = value(id);
        });

        const data = cloud.validateTaskData(input);

        if (state.editingTask) {
            await cloud.updateCaseTask(
                caseId,
                state.editingTask.id,
                data,
                state.editingTask.revision
            );
        } else {
            let saved = false;

            if (state.pendingRecords.task) {
                const tasks = await cloud.fetchCaseTasks(caseId);

                saved = tasks.some(task =>
                    task.id === state.pendingRecords.task
                );
            }

            if (!saved) {
                state.pendingRecords.task ||=
                    cloud.generateRecordId();

                await cloud.createCaseTask(
                    caseId,
                    data,
                    state.pendingRecords.task
                );
            }
        }

        state.pendingRecords.task = null;
        state.editingTask = null;

        $("taskDialog").close();

        message("Task saved successfully.");

        try {
            await synchronize();

            if (state.tab === "profile") {
                await loadProfile(caseId, "tasks");
            } else {
                activateTab("tasks");
            }
        } catch (error) {
            activateTab("directory");

            message(
                "Task saved. Refresh the application to view the latest data.",
                "warning"
            );
        }

    }, "saveTaskButton");
}


/* =========================================================
   16. ADDITIONAL CLIENT ASSOCIATIONS
   ========================================================= */

function renderLinkedClients() {
    clear("linkedClientsTableBody");

    const record = state.profile.case;

    const links = state.profile.additionalClients;

    links.forEach(link => {
        const client = link.client;

        const badge = element(
            "span",
            `association-status ${link.active ? "active" : ""}`,
            link.active ? "Active" : "Inactive"
        );

        tableRow("linkedClientsTableBody", [
            client?.clientCode || "—",
            client?.fullName || "Client unavailable",
            link.capacity,
            badge,

            link.active && activeCase(record)
                ? actionButton(
                    "Unlink",
                    () => openUnlinkDialog(link.clientId),
                    true
                )
                : "—"
        ]);
    });

    show("emptyLinkedClients", links.length === 0);
}

function openLinkDialog() {
    const record = currentCase();

    if (!activeCase(record)) return;

    $("linkClientForm").reset();

    const linked = new Set(
        state.profile.additionalClients
            .filter(link => link.active)
            .map(link => link.clientId)
    );

    const clients = state.clients.filter(client =>
        client.id !== record.clientId &&
        client.status !== "archived" &&
        !linked.has(client.id)
    );

    setOptions(
        "additionalClientId",
        clients.map(client => ({
            value: client.id,
            label: `${client.clientCode} — ${client.fullName}`
        })),
        "Select Client",
        ""
    );

    $("linkClientDialog").showModal();
}

async function saveLinkedClient(event) {
    event.preventDefault();

    await runAction(async () => {
        if (!$("clientConflictCheck").checked) {
            throw new Error(
                "Confirm that the conflict-of-interest review has been completed."
            );
        }

        await cloud.linkAdditionalClient(
            currentCase().id,
            value("additionalClientId"),
            value("additionalClientCapacity")
        );

        await finishMutation(
            "linkClientDialog",
            "Additional client linked successfully.",
            "clients"
        );

    }, "confirmLinkClientButton");
}

function openUnlinkDialog(clientId) {
    $("unlinkClientForm").reset();

    setValue("unlinkClientId", clientId);

    $("unlinkClientDialog").showModal();
}

async function unlinkClient(event) {
    event.preventDefault();

    await runAction(async () => {
        await cloud.unlinkAdditionalClient(
            currentCase().id,
            value("unlinkClientId"),
            value("unlinkClientReason")
        );

        await finishMutation(
            "unlinkClientDialog",
            "Client association deactivated. History preserved.",
            "clients"
        );

    }, "confirmUnlinkClientButton");
}


/* =========================================================
   17. CASE ACTIVITY HISTORY
   ========================================================= */

function renderActivities() {
    clear("activityTimeline");

    const activities = state.profile.activities;

    activities.forEach(activity => {
        const node = element("article", "activity-item");

        const header = element("div", "activity-header");

        header.append(
            element(
                "strong",
                "activity-type",
                label(cloud.CASE_ACTIVITY_TYPES, activity.type)
            ),

            element(
                "span",
                "activity-date",
                formatTimestamp(activity.createdAt)
            )
        );

        node.append(
            header,
            element(
                "p",
                "activity-description",
                activity.description
            )
        );

        $("activityTimeline")?.append(node);
    });

    show("emptyActivities", activities.length === 0);
}

function openActivityDialog() {
    if (currentCase().status === "archived") return;

    $("activityForm").reset();

    state.pendingRecords.activity = null;

    $("activityDialog").showModal();
}

async function saveActivity(event) {
    event.preventDefault();

    await runAction(async () => {
        const record = currentCase();

        let saved = false;

        if (state.pendingRecords.activity) {
            const records = await cloud.fetchCaseActivities(record.id);

            saved = records.some(activity =>
                activity.id === state.pendingRecords.activity
            );
        }

        if (!saved) {
            state.pendingRecords.activity ||=
                cloud.generateRecordId();

            await cloud.addCaseActivity(
                record.id,
                value("activityType"),
                value("activityDescription"),
                state.pendingRecords.activity
            );
        }

        state.pendingRecords.activity = null;

        await finishMutation(
            "activityDialog",
            "Case activity recorded successfully.",
            "activity"
        );

    }, "saveActivityButton");
}


/* =========================================================
   18. CASE CLOSURE
   ========================================================= */

function openCloseDialog() {
    if (!activeCase(currentCase())) return;

    $("closeCaseForm").reset();

    setValue("closureDate", today());

    $("closeCaseDialog").showModal();
}

async function saveClosure(event) {
    event.preventDefault();

    await runAction(async () => {
        const record = currentCase();

        const outstanding = state.profile.tasks.filter(task =>
            ["pending", "in_progress"].includes(task.status)
        );

        if (outstanding.length) {
            const accepted = window.confirm(
                `${outstanding.length} unfinished task(s) remain. Closing the matter does not automatically complete these tasks. Continue?`
            );

            if (!accepted) return;
        }

        await cloud.closeCase(
            record.id,
            {
                status: value("closureStatus"),
                disposalDate: value("closureDate"),
                disposalOutcome: value("closureOutcome"),
                closureReason: value("closureExplanation")
            },
            record.revision
        );

        await finishMutation(
            "closeCaseDialog",
            "Case closed successfully. Historical records preserved.",
            "summary"
        );

    }, "confirmCloseCaseButton");
}


/* =========================================================
   19. CASE REOPENING
   ========================================================= */

function openReopenDialog() {
    if (!CLOSED.has(currentCase().status)) return;

    $("reopenCaseForm").reset();

    $("reopenCaseDialog").showModal();
}

async function saveReopening(event) {
    event.preventDefault();

    await runAction(async () => {
        const record = currentCase();

        await cloud.reopenCase(
            record.id,
            value("reopenCaseReason"),
            record.revision,
            value("reopenCaseStatus")
        );

        await finishMutation(
            "reopenCaseDialog",
            "Case reopened successfully.",
            "summary"
        );

    }, "confirmReopenCaseButton");
}


/* =========================================================
   20. ARCHIVE AND REACTIVATE
   ========================================================= */

function openArchiveDialog() {
    if (currentCase().status === "archived") return;

    $("archiveForm").reset();

    $("archiveDialog").showModal();
}

async function saveArchive(event) {
    event.preventDefault();

    await runAction(async () => {
        const record = currentCase();

        await cloud.archiveCase(
            record.id,
            value("archiveReason"),
            record.revision
        );

        await finishMutation(
            "archiveDialog",
            "Case archived. No records have been permanently deleted.",
            "summary"
        );

    }, "confirmArchiveButton");
}

function openReactivateDialog() {
    const record = currentCase();

    if (record.status !== "archived") return;

    $("reactivateForm").reset();

    const select = $("reactivateStatus");

    [...select.options].forEach(option => {
        option.disabled = Boolean(
            record.disposalDate &&
            option.value &&
            !CLOSED.has(option.value)
        );
    });

    setValue("reactivateStatus", "");

    $("reactivateDialog").showModal();
}

async function saveReactivation(event) {
    event.preventDefault();

    await runAction(async () => {
        const record = currentCase();

        await cloud.reactivateCase(
            record.id,
            record.revision,
            value("reactivateStatus")
        );

        await finishMutation(
            "reactivateDialog",
            "Case reactivated successfully.",
            "summary"
        );

    }, "confirmReactivateButton");
}


/* =========================================================
   21. SETTINGS AND CLOUD CONNECTION
   ========================================================= */

function renderSettings() {
    setValue(
        "currentRegistrationYear",
        cloud.getRegistrationYear()
    );

    setValue("nextCaseCodeSetting", state.nextCode);

    text("storageCaseCount", state.cases.length);
    text("storageClientCount", state.clients.length);
}

async function checkConnection() {
    await runAction(async () => {
        connection("syncing");

        try {
            const result = await cloud.checkCaseCloudConnection();

            await requireSession();

            text("storageCaseCount", result.caseCount);
            text("storageClientCount", result.clientCount);

            setValue("nextCaseCodeSetting", result.nextCaseCode);

            connection("online");

            message(
                "Firebase connection verified. Administrator access confirmed."
            );

        } catch (error) {
            connection("offline");
            throw error;
        }

    }, "checkConnectionButton");
}


/* =========================================================
   22. CONFIDENTIAL EXPORTS
   ========================================================= */

function csvCell(input) {
    let content = String(input ?? "");

    // Prevent spreadsheet formula injection.

    if (/^[\s]*[=+\-@]/.test(content) ||
        /^[\t\r\n]/.test(content)) {
        content = "'" + content;
    }

    return '"' + content.replace(/"/g, '""') + '"';
}

function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], {
        type: mimeType
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.append(link);

    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportCSV() {
    await runAction(async () => {
        const accepted = await confirmDialog(
            "Confidential case directory",
            "This CSV contains confidential client and case information. Store it securely and do not distribute it without authorization.",
            "Download CSV"
        );

        if (!accepted) return;

        await requireSession();

        const records = filterCases();

        const rows = [[
            "Internal Case ID",
            "Case Title",
            "Client ID",
            "Client Name",
            "Matter Type",
            "Practice Area",
            "Court",
            "Court Case Number",
            "CNR",
            "Assigned Advocate",
            "Status",
            "Priority",
            "Next Hearing",
            "Recorded Deadline"
        ]];

        records.forEach(record => {
            rows.push([
                record.caseCode,
                record.caseTitle,
                clientById(record.clientId)?.clientCode || "",
                clientName(record.clientId),
                label(cloud.MATTER_TYPES, record.matterType),
                record.practiceArea,
                record.courtName,
                record.caseNumber,
                record.cnrNumber,
                record.assignedAdvocate,
                label(cloud.CASE_STATUSES, record.status),
                label(cloud.CASE_PRIORITIES, record.priority),
                record.nextHearingDate,
                record.limitationDate
            ]);
        });

        const csv = "\uFEFF" + rows.map(row =>
            row.map(csvCell).join(",")
        ).join("\r\n");

        downloadFile(
            `MNM-Case-Directory-${today()}.csv`,
            csv,
            "text/csv;charset=utf-8"
        );

        message("Case directory export prepared.");

    }, "exportCasesCSVButton");
}

async function downloadBackup() {
    await runAction(async () => {
        const accepted = await confirmDialog(
            "Download confidential backup",
            "This JSON backup contains confidential case details, legal strategy, proceedings, tasks and activity history. The downloaded file is not encrypted. Keep it in secure storage.",
            "Download Backup"
        );

        if (!accepted) return;

        const backup = await cloud.createCaseBackup();

        await requireSession();

        downloadFile(
            `MNM-Case-Backup-${today()}.json`,
            JSON.stringify(backup, null, 2),
            "application/json"
        );

        message("Confidential case backup prepared.");

    }, "downloadCaseBackupButton");
}


/* =========================================================
   23. COPY CNR NUMBER
   ========================================================= */

async function copyCnr() {
    await runAction(async () => {
        const cnr = currentCase().cnrNumber;

        if (!cnr) return;

        if (!navigator.clipboard?.writeText) {
            throw new Error(
                "Clipboard access unavailable. Copy the CNR manually."
            );
        }

        await navigator.clipboard.writeText(cnr);

        message("CNR number copied.");

    }, "copyCnrButton");
}


/* =========================================================
   24. REFRESH APPLICATION
   ========================================================= */

async function refreshApplication(buttonId = "refreshCasesButton") {
    await runAction(async () => {
        const currentId = state.profile?.case?.id;

        await synchronize();

        if (state.tab === "profile" && currentId) {
            await loadProfile(currentId, state.profileTab);
        }

        message("Case Management synchronized successfully.");

    }, buttonId);
}


/* =========================================================
   25. EVENT BINDINGS
   ========================================================= */

function bindEvents() {
    document.querySelectorAll("[data-tab]")
        .forEach(button => {
            button.addEventListener("click", () => {
                navigate(button.dataset.tab);
            });
        });

    document.querySelectorAll("[data-open-tab]")
        .forEach(button => {
            button.addEventListener("click", () => {
                navigate(button.dataset.openTab);
            });
        });

    document.querySelectorAll("[data-profile-tab]")
        .forEach(button => {
            button.addEventListener("click", () => {
                if (!state.busy) {
                    activateProfileTab(button.dataset.profileTab);
                }
            });
        });

    bindTabKeyboard(
        "[data-tab]",
        "tab",
        navigate
    );

    bindTabKeyboard(
        "[data-profile-tab]",
        "profileTab",
        activateProfileTab
    );

    bind("newCaseButton", "click", async () => {
        if (state.busy) return;

        if (!(await mayLeaveForm())) return;

        resetCaseForm();
        activateTab("registration");
    });

    bind("refreshCasesButton", "click", () => {
        refreshApplication();
    });

    bind("refreshTasksButton", "click", () => {
        refreshApplication("refreshTasksButton");
    });

    bind("caseForm", "submit", submitCase);

    bind("caseForm", "input", () => {
        state.dirty = true;
    });

    bind("caseForm", "change", () => {
        state.dirty = true;
    });

    bind("clientId", "change", () => {
        renderSelectedClient();

        const client = clientById(value("clientId"));

        if (client && !value("assignedAdvocate")) {
            setValue(
                "assignedAdvocate",
                client.assignedAdvocate
            );
        }
    });

    bind("status", "change", updateFormVisibility);

    bind("cnrNumber", "input", () => {
        setValue(
            "cnrNumber",
            value("cnrNumber").toUpperCase()
        );
    });

    bind("resetCaseFormButton", "click", async () => {
        if (state.busy) return;

        if (await mayLeaveForm()) {
            resetCaseForm();
        }
    });

    bind("cancelRegistrationButton", "click", () => {
        navigate("directory");
    });

    bind("caseSearch", "input", () => {
        state.page = 1;
        renderDirectory();
    });

    [
        "caseStatusFilter",
        "practiceAreaFilter",
        "matterTypeFilter",
        "casePriorityFilter",
        "caseAdvocateFilter",
        "caseYearFilter",
        "caseSort"
    ].forEach(id => {
        bind(id, "change", () => {
            state.page = 1;
            renderDirectory();
        });
    });

    bind("clearCaseFiltersButton", "click", clearFilters);

    bind("previousPageButton", "click", () => {
        state.page--;
        renderDirectory();
    });

    bind("nextPageButton", "click", () => {
        state.page++;
        renderDirectory();
    });

    bind("backToDirectoryButton", "click", () => {
        navigate("directory");
    });

    bind("editCaseButton", "click", () => {
        openEditor(currentCase().id);
    });

    bind("copyCnrButton", "click", copyCnr);

    bind("updateHearingButton", "click", openHearingDialog);
    bind("hearingForm", "submit", saveHearing);

    [
        "hearingPeriodFilter",
        "hearingAdvocateFilter"
    ].forEach(id => {
        bind(id, "change", renderHearings);
    });

    bind("hearingSearch", "input", renderHearings);

    bind("addProceedingButton", "click", openProceedingDialog);
    bind("proceedingForm", "submit", saveProceeding);

    bind("addTaskButton", "click", () => {
        openTaskDialog();
    });

    bind("taskForm", "submit", saveTask);
    bind("taskStatus", "change", updateTaskFormVisibility);

    [
        "taskCaseFilter",
        "taskStatusFilter",
        "taskPriorityFilter"
    ].forEach(id => {
        bind(id, "change", renderAllTasks);
    });

    bind("taskSearch", "input", renderAllTasks);

    bind("linkClientButton", "click", openLinkDialog);
    bind("linkClientForm", "submit", saveLinkedClient);
    bind("unlinkClientForm", "submit", unlinkClient);

    bind("addActivityButton", "click", openActivityDialog);
    bind("activityForm", "submit", saveActivity);

    bind("closeCaseButton", "click", openCloseDialog);
    bind("closeCaseForm", "submit", saveClosure);

    bind("reopenCaseButton", "click", openReopenDialog);
    bind("reopenCaseForm", "submit", saveReopening);

    bind("archiveCaseButton", "click", openArchiveDialog);
    bind("archiveForm", "submit", saveArchive);

    bind("reactivateCaseButton", "click", openReactivateDialog);
    bind("reactivateForm", "submit", saveReactivation);

    bind("checkConnectionButton", "click", checkConnection);
    bind("exportCasesCSVButton", "click", exportCSV);
    bind("downloadCaseBackupButton", "click", downloadBackup);

    const cancelButtons = {
        cancelHearingButton: "hearingDialog",
        cancelProceedingButton: "proceedingDialog",
        cancelTaskButton: "taskDialog",
        cancelActivityButton: "activityDialog",
        cancelLinkClientButton: "linkClientDialog",
        cancelUnlinkClientButton: "unlinkClientDialog",
        cancelCloseCaseButton: "closeCaseDialog",
        cancelReopenCaseButton: "reopenCaseDialog",
        cancelArchiveButton: "archiveDialog",
        cancelReactivateButton: "reactivateDialog"
    };

    Object.entries(cancelButtons).forEach(([button, dialog]) => {
        bind(button, "click", () => {
            if (!state.busy) {
                $(dialog)?.close();
            }
        });
    });

    document.querySelectorAll("dialog")
        .forEach(dialog => {
            dialog.addEventListener("cancel", event => {
                if (state.busy) {
                    event.preventDefault();
                }
            });
        });

    window.addEventListener("beforeunload", event => {
        if (state.dirty || state.busy) {
            event.preventDefault();
            event.returnValue = "";
        }
    });

    window.addEventListener("offline", () => {
        connection("offline");
    });

    window.addEventListener("online", () => {
        automaticRefresh();
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            automaticRefresh();
        }
    });
}


/* =========================================================
   26. AUTOMATIC REFRESH
   ========================================================= */

async function automaticRefresh() {
    if (
        !state.initialized ||
        state.invalidated ||
        state.busy ||
        state.dirty ||
        $("protectedContent")?.hidden ||
        document.querySelector("dialog[open]") ||
        Date.now() - state.lastSync < 30000
    ) {
        return;
    }

    await runAction(async () => {
        const id = state.profile?.case?.id;

        await synchronize();

        if (state.tab === "profile" && id) {
            await loadProfile(id, state.profileTab);
        }
    });
}


/* =========================================================
   27. APPLICATION INITIALIZATION
   ========================================================= */

export async function initialiseCaseSystem(user) {
    if (!user?.uid) {
        throw new Error("Authentication required.");
    }

    if (state.initialized) {
        if (state.userId !== user.uid) {
            invalidateSession();

            throw new Error("Authentication session changed.");
        }

        await requireSession();

        return;
    }

    state.userId = user.uid;

    await requireSession();

    connection("syncing");

    await synchronize();

    resetCaseForm();

    bindEvents();

    activateTab("overview");

    await requireSession();

    state.initialized = true;

    auth.onAuthStateChanged(currentUser => {
        if (
            !currentUser ||
            currentUser.uid !== state.userId
        ) {
            invalidateSession();
        }
    });

    // Never reveal protected content here.
    // Page visibility remains controlled by auth.js.

    return true;
}


/* =========================================================
   END OF CASE MANAGEMENT APPLICATION

   MNM LEGAL ASSOCIATES
   Legal Practice Management System

   Version 1.0

   Justice, Integrity & Excellence
   ========================================================= */
