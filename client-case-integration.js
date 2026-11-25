
/* =========================================================
   MNM LEGAL ASSOCIATES
   LEGAL PRACTICE MANAGEMENT SYSTEM

   CLIENT - CASE MANAGEMENT INTEGRATION
   Version 1.0

   Justice, Integrity & Excellence
   ========================================================= */

import { auth } from "./firebase-config.js";
import { verifyStaffAccess } from "./auth.js";

import {
    fetchCasesByClient,
    CASE_STATUSES,
    CASE_PRIORITIES
} from "./cases-cloud.js";


/* =========================================================
   01. CONFIGURATION
   ========================================================= */

const CLOSED_STATUSES = new Set([
    "disposed",
    "settled",
    "withdrawn",
    "closed"
]);

const state = {
    request: 0,
    client: null,
    records: [],
    filter: "all",
    search: "",
    userId: null
};


/* =========================================================
   02. UTILITIES
   ========================================================= */

function element(tag, className = "", content = "") {
    const node = document.createElement(tag);

    if (className) {
        node.className = className;
    }

    node.textContent = String(content ?? "");

    return node;
}

function display(value) {
    return value === null ||
        value === undefined ||
        value === ""
        ? "—"
        : String(value);
}

function formatDate(value) {
    if (!value) return "Not scheduled";

    const date = new Date(value + "T00:00:00Z");

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC"
    }).format(date);
}

function isActive(record) {
    return record.status !== "archived" &&
        !CLOSED_STATUSES.has(record.status);
}

function getToday() {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());

    const get = type =>
        parts.find(part => part.type === type).value;

    return `${get("year")}-${get("month")}-${get("day")}`;
}

async function requireAdministrator() {
    await auth.authStateReady();

    const user = auth.currentUser;

    if (!user?.uid) {
        throw new Error("Authentication required.");
    }

    const profile = await verifyStaffAccess(user);

    if (
        profile?.active !== true ||
        profile?.role !== "admin" ||
        auth.currentUser?.uid !== user.uid
    ) {
        throw new Error("Administrator authorization required.");
    }

    return user.uid;
}


/* =========================================================
   03. INTEGRATION STYLES
   ========================================================= */

function installStyles() {
    if (document.getElementById("clientCaseIntegrationStyles")) {
        return;
    }

    const style = document.createElement("style");

    style.id = "clientCaseIntegrationStyles";

    style.textContent = `
        #clientCaseIntegration {
            margin-top: 24px;
            margin-bottom: 24px;
        }

        #clientCaseIntegration .cci-heading {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
            margin-bottom: 22px;
        }

        #clientCaseIntegration .cci-heading h2 {
            margin: 0 0 6px;
            font-size: 20px;
        }

        #clientCaseIntegration .cci-heading p {
            margin: 0;
            color: #64748b;
            font-size: 13px;
        }

        #clientCaseIntegration .cci-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        #clientCaseIntegration .cci-stats {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
            margin-bottom: 22px;
        }

        #clientCaseIntegration .cci-stat {
            padding: 16px;
            border: 1px solid #e1ded6;
            border-radius: 10px;
            background: #f7f6f2;
        }

        #clientCaseIntegration .cci-stat span {
            display: block;
            color: #64748b;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 8px;
        }

        #clientCaseIntegration .cci-stat strong {
            display: block;
            font-size: 27px;
            color: #101d30;
        }

        #clientCaseIntegration .cci-toolbar {
            display: grid;
            grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
            gap: 12px;
            margin-bottom: 16px;
        }

        #clientCaseIntegration .cci-toolbar input,
        #clientCaseIntegration .cci-toolbar select {
            width: 100%;
            min-height: 44px;
            padding: 10px 12px;
            border: 1px solid #d9dee5;
            border-radius: 8px;
            background: #fff;
            color: #101d30;
            font: inherit;
        }

        #clientCaseIntegration .cci-table-wrapper {
            width: 100%;
            overflow-x: auto;
        }

        #clientCaseIntegration .cci-table {
            width: 100%;
            min-width: 1000px;
            border-collapse: collapse;
            font-size: 13px;
        }

        #clientCaseIntegration .cci-table th {
            text-align: left;
            padding: 13px;
            color: #fff;
            background: #101d30;
            white-space: nowrap;
        }

        #clientCaseIntegration .cci-table td {
            padding: 13px;
            border-bottom: 1px solid #e5e7eb;
            vertical-align: middle;
        }

        #clientCaseIntegration .cci-table tbody tr:hover {
            background: #f7f6f2;
        }

        #clientCaseIntegration .cci-code {
            color: #80612e;
            font-weight: 700;
            white-space: nowrap;
        }

        #clientCaseIntegration .cci-title {
            display: block;
            font-weight: 700;
            color: #101d30;
            margin-bottom: 5px;
        }

        #clientCaseIntegration .cci-secondary {
            display: block;
            color: #64748b;
            font-size: 11px;
            margin-top: 4px;
        }

        #clientCaseIntegration .cci-empty {
            padding: 30px 15px;
            text-align: center;
            color: #64748b;
        }

        #clientCaseIntegration .cci-error {
            padding: 15px;
            color: #991b1b;
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 8px;
        }

        #clientCaseIntegration .cci-result {
            margin: 12px 0;
            font-size: 12px;
            color: #64748b;
        }

        #clientCaseIntegration .cci-priority {
            display: inline-block;
            padding: 5px 9px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 700;
            background: #e2e8f0;
            color: #334155;
        }

        #clientCaseIntegration .cci-priority[data-priority="high"] {
            background: #fef3c7;
            color: #92400e;
        }

        #clientCaseIntegration .cci-priority[data-priority="urgent"] {
            background: #fee2e2;
            color: #991b1b;
        }

        #clientCaseIntegration .cci-link {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 40px;
            padding: 9px 13px;
            border-radius: 7px;
            background: #101d30;
            color: #fff;
            text-decoration: none;
            font-size: 12px;
            font-weight: 600;
            white-space: nowrap;
        }

        #clientCaseIntegration .cci-link:hover {
            background: #263d59;
        }

        #clientCaseIntegration .cci-link:focus-visible {
            outline: 3px solid #c3a16b;
            outline-offset: 3px;
        }

        @media (max-width: 700px) {
            #clientCaseIntegration .cci-stats {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            #clientCaseIntegration .cci-toolbar {
                grid-template-columns: 1fr;
            }

            #clientCaseIntegration .cci-actions {
                width: 100%;
            }

            #clientCaseIntegration .cci-actions > * {
                flex: 1;
            }

            #clientCaseIntegration .cci-toolbar input,
            #clientCaseIntegration .cci-toolbar select {
                font-size: 16px;
            }
        }
    `;

    document.head.append(style);
}


/* =========================================================
   04. SECURE CROSS-MODULE NAVIGATION

   Use URL fragments rather than query parameters.
   No client names or confidential facts in URLs.
   ========================================================= */

function caseURL(caseId) {
    return "/cases.html#case=" +
        encodeURIComponent(caseId);
}

function registrationURL(clientId) {
    return "/cases.html#new-client=" +
        encodeURIComponent(clientId);
}

function createLink(title, url, className = "cci-link") {
    const link = element("a", className, title);

    link.href = url;
    link.referrerPolicy = "no-referrer";

    return link;
}


/* =========================================================
   05. CREATE PROFILE SECTION
   ========================================================= */

function createSection(client) {
    document.getElementById("clientCaseIntegration")?.remove();

    const profile = document.getElementById("profilePanel");

    const grid = profile?.querySelector(".integration-grid");

    if (!grid) {
        throw new Error(
            "Client profile integration area was not found."
        );
    }

    const section = element("section", "content-card");

    section.id = "clientCaseIntegration";

    const heading = element("div", "cci-heading");

    const title = element("div");

    title.append(
        element("h2", "", "Associated Legal Matters"),

        element(
            "p",
            "",
            "All primary and additional case associations for this client."
        )
    );

    const actions = element("div", "cci-actions");

    const refresh = element(
        "button",
        "button button-secondary",
        "Refresh Cases"
    );

    refresh.type = "button";

    refresh.addEventListener("click", () => {
        renderClientCases(client);
    });

    actions.append(refresh);

    if (client.status !== "archived") {
        actions.append(
            createLink(
                "+ Register New Case",
                registrationURL(client.id),
                "button button-primary"
            )
        );
    }

    heading.append(title, actions);

    const statistics = element("div", "cci-stats");
    statistics.id = "cciStatistics";

    const toolbar = element("div", "cci-toolbar");

    const search = element("input");

    search.type = "search";
    search.placeholder = "Search associated cases...";
    search.setAttribute("aria-label", "Search associated cases");
    search.value = state.search;

    search.addEventListener("input", () => {
        state.search = search.value;
        renderRecords();
    });

    const filter = element("select");

    filter.setAttribute("aria-label", "Filter associated cases");

    [
        ["all", "All Cases"],
        ["active", "Active Matters"],
        ["closed", "Closed Matters"],
        ["archived", "Archived Matters"],
        ["primary", "Primary Associations"],
        ["additional", "Additional Associations"]
    ].forEach(([value, title]) => {
        filter.add(new Option(title, value));
    });

    filter.value = state.filter;

    filter.addEventListener("change", () => {
        state.filter = filter.value;
        renderRecords();
    });

    toolbar.append(search, filter);

    const result = element("div", "cci-result");
    result.id = "cciResult";

    const records = element("div");
    records.id = "cciRecords";

    records.append(
        element("div", "cci-empty", "Loading associated cases...")
    );

    section.append(
        heading,
        statistics,
        toolbar,
        result,
        records
    );

    grid.parentNode.insertBefore(section, grid);

    return section;
}


/* =========================================================
   06. UPDATE EXISTING LEGAL CASES CARD
   ========================================================= */

function updateIntegrationCard() {
    const profile = document.getElementById("profilePanel");

    const cards = profile?.querySelectorAll(".integration-card");

    if (!cards) return;

    for (const card of cards) {
        const heading = card.querySelector("h3");

        if (heading?.textContent.trim() !== "Legal Cases") {
            continue;
        }

        const status = card.querySelector(".coming-soon");

        if (status) {
            status.textContent = "Integrated";
            status.style.color = "#166534";
            status.style.background = "#dcfce7";
        }

        const description = card.querySelector("p");

        if (description) {
            description.textContent =
                "Case records are available in the Associated Legal Matters section.";
        }

        break;
    }
}


/* =========================================================
   07. CASE STATISTICS
   ========================================================= */

function renderStatistics() {
    const container = document.getElementById("cciStatistics");

    if (!container) return;

    container.replaceChildren();

    const records = state.records;

    const statistics = [
        ["Total Cases", records.length],

        [
            "Active Matters",
            records.filter(isActive).length
        ],

        [
            "Closed Matters",
            records.filter(record =>
                CLOSED_STATUSES.has(record.status)
            ).length
        ],

        [
            "Archived Matters",
            records.filter(record =>
                record.status === "archived"
            ).length
        ]
    ];

    for (const [title, count] of statistics) {
        const card = element("article", "cci-stat");

        card.append(
            element("span", "", title),
            element("strong", "", count)
        );

        container.append(card);
    }
}


/* =========================================================
   08. FILTER ASSOCIATED CASES
   ========================================================= */

function filteredRecords() {
    const search = state.search
        .normalize("NFKC")
        .trim()
        .toLowerCase();

    return state.records.filter(record => {
        const searchable = [
            record.caseCode,
            record.caseTitle,
            record.caseNumber,
            record.cnrNumber,
            record.courtName,
            record.practiceArea,
            record.associationCapacity,
            record.assignedAdvocate
        ].join(" ")
            .normalize("NFKC")
            .toLowerCase();

        if (search && !searchable.includes(search)) {
            return false;
        }

        switch (state.filter) {
            case "active":
                return isActive(record);

            case "closed":
                return CLOSED_STATUSES.has(record.status);

            case "archived":
                return record.status === "archived";

            case "primary":
                return record.associationType === "primary";

            case "additional":
                return record.associationType === "additional";

            default:
                return true;
        }
    });
}


/* =========================================================
   09. RENDER CASE DIRECTORY
   ========================================================= */

function renderRecords() {
    const container = document.getElementById("cciRecords");

    if (!container) return;

    container.replaceChildren();

    const records = filteredRecords();

    const result = document.getElementById("cciResult");

    if (result) {
        result.textContent =
            `${records.length} of ${state.records.length} associated matter(s)`;
    }

    if (!records.length) {
        container.append(
            element(
                "div",
                "cci-empty",
                state.records.length
                    ? "No cases match the selected filters."
                    : "No legal matters have been registered for this client."
            )
        );

        return;
    }

    const wrapper = element("div", "cci-table-wrapper");
    const table = element("table", "cci-table");

    const head = element("thead");
    const headerRow = element("tr");

    [
        "Internal Case ID",
        "Case Title / Court No.",
        "Court / Authority",
        "Client Capacity",
        "Status",
        "Priority",
        "Next Hearing",
        "Action"
    ].forEach(title => {
        const cell = element("th", "", title);

        cell.scope = "col";

        headerRow.append(cell);
    });

    head.append(headerRow);

    const body = element("tbody");

    for (const record of records) {
        const row = element("tr");

        const title = element("div");

        title.append(
            element(
                "strong",
                "cci-title",
                record.caseTitle
            ),

            element(
                "small",
                "cci-secondary",
                record.caseNumber ||
                record.cnrNumber ||
                "Court number not assigned"
            )
        );

        const court = element("div");

        court.append(
            element("span", "", display(record.courtName)),

            element(
                "small",
                "cci-secondary",
                record.courtCity || ""
            )
        );

        const capacity = element("div");

        capacity.append(
            element(
                "span",
                "",
                display(record.associationCapacity)
            ),

            element(
                "small",
                "cci-secondary",
                record.associationType === "primary"
                    ? "Primary Client"
                    : "Additional Client"
            )
        );

        const status = element(
            "span",
            "status-badge",
            CASE_STATUSES[record.status] || record.status
        );

        status.dataset.status = record.status;

        const priority = element(
            "span",
            "cci-priority",
            CASE_PRIORITIES[record.priority] ||
                record.priority
        );

        priority.dataset.priority = record.priority;

        const hearing = element(
            "div",
            "",
            formatDate(record.nextHearingDate)
        );

        if (
            isActive(record) &&
            record.nextHearingDate &&
            record.nextHearingDate < getToday()
        ) {
            const warning = element(
                "small",
                "cci-secondary",
                "Past date — update required"
            );

            warning.style.color = "#b91c1c";

            hearing.append(warning);
        }

        const cells = [
            element("span", "cci-code", record.caseCode),
            title,
            court,
            capacity,
            status,
            priority,
            hearing,
            createLink("View Case", caseURL(record.id))
        ];

        for (const content of cells) {
            const cell = element("td");

            cell.append(content);

            row.append(cell);
        }

        body.append(row);
    }

    table.append(head, body);
    wrapper.append(table);
    container.append(wrapper);
}


/* =========================================================
   10. CLEAR CONFIDENTIAL DATA
   ========================================================= */

export function clearClientCaseIntegration() {
    state.request++;

    state.client = null;
    state.records = [];
    state.userId = null;
    state.search = "";
    state.filter = "all";

    document.getElementById("clientCaseIntegration")?.remove();
}


/* =========================================================
   11. MAIN INTEGRATION FUNCTION
   ========================================================= */

export async function renderClientCases(client) {
    if (!client?.id) return;

    const request = ++state.request;

    if (state.client?.id !== client.id) {
        state.search = "";
        state.filter = "all";
    }

    state.client = client;
    state.records = [];

    try {
        installStyles();

        const section = createSection(client);

        const userId = await requireAdministrator();

        if (request !== state.request) return;

        state.userId = userId;

        const records = await fetchCasesByClient(
            client.id,
            {
                includeArchived: true,
                includeAdditional: true
            }
        );

        const verifiedUserId = await requireAdministrator();

        if (
            request !== state.request ||
            userId !== verifiedUserId ||
            state.client?.id !== client.id ||
            !section.isConnected ||
            document.getElementById("protectedContent")?.hidden
        ) {
            return;
        }

        state.records = records;

        renderStatistics();
        renderRecords();
        updateIntegrationCard();

    } catch (error) {
        if (request !== state.request) return;

        state.records = [];

        console.error(
            "Client case integration:",
            error?.code || error?.name || "Error"
        );

        const container = document.getElementById("cciRecords");

        if (container) {
            container.replaceChildren(
                element(
                    "div",
                    "cci-error",
                    "Associated cases could not be loaded. Please refresh cases or verify administrator permissions."
                )
            );
        }
    }
}


/* =========================================================
   12. SESSION INVALIDATION
   ========================================================= */

auth.onAuthStateChanged(user => {
    if (
        !user ||
        (state.userId && user.uid !== state.userId)
    ) {
        clearClientCaseIntegration();
    }
});

const protectedContent =
    document.getElementById("protectedContent");

if (protectedContent) {
    const observer = new MutationObserver(() => {
        if (protectedContent.hidden) {
            clearClientCaseIntegration();
        }
    });

    observer.observe(protectedContent, {
        attributes: true,
        attributeFilter: ["hidden"]
    });
}


/* =========================================================
   END OF CLIENT - CASE MANAGEMENT INTEGRATION

   MNM LEGAL ASSOCIATES
   Justice, Integrity & Excellence
   ========================================================= */
