
/* =========================================================
   MNM LEGAL ASSOCIATES
   FINANCIAL MANAGEMENT SYSTEM
   Application Engine V1.0
   Justice, Integrity & Excellence
   ========================================================= */

import * as Cloud from "./finance-cloud.js";
import { auth } from "./firebase-config.js";
import { verifyStaffAccess } from "./auth.js";

const $ = id => document.getElementById(id);
const $$ = selector => [...document.querySelectorAll(selector)];

const TABS = [
    "overview",
    "transactions",
    "transaction",
    "agreements",
    "ledger",
    "outstanding",
    "invoices",
    "reports",
    "settings"
];

const TYPES = {
    income: "Professional Income",
    expense: "Operating Expense",
    advance: "Client Advance",
    advance_utilization: "Advance Utilization",
    advance_refund: "Advance Refund",
    refund: "Professional Fee Refund",
    capital_in: "Capital Introduced",
    capital_out: "Capital Withdrawal",
    reversal: "Reversal"
};

const MODES = {
    cash: "Cash",
    upi: "UPI",
    neft: "NEFT",
    rtgs: "RTGS",
    imps: "IMPS",
    cheque: "Cheque",
    bank_transfer: "Bank Transfer",
    card: "Card",
    other: "Other"
};

const state = {
    initialized: false,
    userId: "",
    invalidated: false,
    busy: false,
    dirty: false,
    tab: "overview",
    page: 1,
    pageSize: 20,

    transactions: [],
    agreements: [],
    clients: [],
    cases: [],
    invoices: [],
    invoiceLinks: [],

    settings: {
        incomeCategories: [...Cloud.INCOME_CATEGORIES],
        expenseCategories: [...Cloud.EXPENSE_CATEGORIES]
    },

    pendingTransactionId: null,
    pendingAgreementId: null,
    pendingReversalId: null,

    editingAgreement: null,
    selectedInvoice: null,
    selectedTransaction: null,
    reversingTransaction: null,

    ledgerRows: [],
    reportRows: [],
    ledgerReady: false,
    reportReady: false,
    connected: false
};

/* =========================================================
   01. GENERAL UTILITIES
   ========================================================= */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

const esc = escapeHTML;

function value(id) {
    return $(id).value.trim();
}

function setValue(id, val) {
    $(id).value = val ?? "";
}

function setText(id, val) {
    $(id).textContent = String(val ?? "");
}

function today() {
    return Cloud.getIndianDate();
}

function money(paise) {
    return Cloud.formatMoney(Number(paise) || 0);
}

function displayDate(date) {
    if (!date) return "—";

    const parts = String(date).split("-");

    if (parts.length !== 3) return date;

    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function typeName(type) {
    return TYPES[type] || type || "—";
}

function modeName(mode) {
    return MODES[mode] || mode || "—";
}

function sum(records, field) {
    return records.reduce(
        (total, record) => total + (Number(record[field]) || 0),
        0
    );
}

function clientName(id) {
    if (!id) return "—";

    const client = state.clients.find(item => item.id === id);

    return client?.fullName || "Unknown Client";
}

function caseName(id) {
    if (!id) return "—";

    const record = state.cases.find(item => item.id === id);

    return record?.caseTitle || "Unknown Matter";
}

function invoiceNumber(record) {
    return record.invoiceNumber ||
        record.invoiceNo ||
        record.number ||
        record.id;
}

function invoiceName(record) {
    return record.clientName ||
        record.billTo?.name ||
        record.client?.name ||
        "—";
}

function invoiceDate(record) {
    return record.invoiceDate ||
        record.date ||
        "";
}

function getTransaction(id) {
    return state.transactions.find(item => item.id === id);
}

function getAgreement(id) {
    return state.agreements.find(item => item.id === id);
}

function getInvoiceLink(id) {
    return state.invoiceLinks.find(
        item => item.invoiceId === id || item.id === id
    );
}

function scrollToElement(id) {
    const element = $(id);

    if (!element || element.hidden) return;

    requestAnimationFrame(() => {
        element.scrollIntoView({
            behavior: window.matchMedia(
                "(prefers-reduced-motion: reduce)"
            ).matches ? "auto" : "smooth",
            block: "start"
        });
    });
}

function emptyRow(columns, message = "No records found.") {
    return `<tr>
        <td colspan="${columns}" class="empty-state">
            ${esc(message)}
        </td>
    </tr>`;
}

function badge(status) {
    const safe = String(status || "").replace(/[^a-z0-9_-]/gi, "");

    return `<span class="status-badge ${safe}">
        ${esc(status || "—")}
    </span>`;
}

function actionButton(action, id, label) {
    return `<button type="button"
        data-action="${esc(action)}"
        data-id="${esc(id)}"
        class="action-button">
        ${esc(label)}
    </button>`;
}

function fillSelect(id, records, placeholder, labelFunction) {
    const select = $(id);
    const previous = select.value;

    select.replaceChildren();

    select.add(new Option(placeholder, ""));

    for (const record of records) {
        select.add(
            new Option(
                labelFunction(record),
                record.id
            )
        );
    }

    if ([...select.options].some(option => option.value === previous)) {
        select.value = previous;
    }
}

function fillValues(id, records, placeholder = "") {
    const select = $(id);
    const previous = select.value;

    select.replaceChildren();

    if (placeholder) {
        select.add(new Option(placeholder, ""));
    }

    for (const item of records) {
        select.add(new Option(item.label, item.value));
    }

    if ([...select.options].some(option => option.value === previous)) {
        select.value = previous;
    }
}

function message(text, type = "success", target = "appMessage") {
    const element = $(target);

    element.className = `message ${type}`;
    element.textContent = text;
    element.hidden = false;

    if (target === "appMessage") {
        scrollToElement(target);
    }
}

function clearMessage(id = "appMessage") {
    $(id).hidden = true;
    $(id).textContent = "";
}

function errorMessage(error) {
    if (error?.code === "permission-denied") {
        return "Firestore permission denied. Verify administrator access and Security Rules V6.0.";
    }

    if (error?.code === "unavailable") {
        return "Cloud connection unavailable. Check your internet connection.";
    }

    return error?.message || "An unexpected error occurred.";
}

/* =========================================================
   02. AUTHENTICATION & OPERATION SECURITY
   ========================================================= */

async function requireSession() {
    if (
        state.invalidated ||
        !auth.currentUser ||
        auth.currentUser.uid !== state.userId
    ) {
        throw new Error("Authentication session changed. Please sign in again.");
    }

    const profile = await verifyStaffAccess(auth.currentUser);

    if (
        !profile ||
        profile.active !== true ||
        profile.role !== "admin" ||
        auth.currentUser?.uid !== state.userId
    ) {
        throw new Error("Administrator authorization required.");
    }

    return profile;
}

function requireVisibleApplication() {
    if ($("protectedContent").hidden) {
        throw new Error("Administrator verification is in progress.");
    }
}

function setBusy(busy) {
    state.busy = busy;

    document.body.classList.toggle("is-busy", busy);

    $$(
        "#protectedContent button, " +
        "#protectedContent input, " +
        "#protectedContent select, " +
        "#protectedContent textarea"
    ).forEach(element => {
        if (element.id === "logoutButton") return;

        if (busy) {
            if (!element.disabled) {
                element.dataset.financeBusy = "true";
                element.disabled = true;
            }
        } else if (element.dataset.financeBusy === "true") {
            element.disabled = false;
            delete element.dataset.financeBusy;
        }
    });
}

async function perform(operation, errorTarget = "appMessage") {
    if (state.busy || state.invalidated) return;

    setBusy(true);
    clearMessage(errorTarget);

    try {
        requireVisibleApplication();
        await requireSession();
        requireVisibleApplication();

        return await operation();

    } catch (error) {
        console.error("Financial operation:", error);

        if (!state.invalidated) {
            message(errorMessage(error), "error", errorTarget);
        }

    } finally {
        if (!state.invalidated) {
            setBusy(false);
        }
    }
}

function invalidateSession() {
    state.invalidated = true;
    state.connected = false;

    state.transactions = [];
    state.agreements = [];
    state.clients = [];
    state.cases = [];
    state.invoices = [];
    state.invoiceLinks = [];
    state.ledgerRows = [];
    state.reportRows = [];

    $$("dialog[open]").forEach(dialog => dialog.close());

    $("protectedContent").hidden = true;

    setBusy(true);
}

/* =========================================================
   03. FINANCIAL PERIODS
   ========================================================= */

function periodRange(period) {
    const current = today();
    const year = Number(current.slice(0, 4));
    const month = Number(current.slice(5, 7));

    if (period === "all") {
        return { from: "", to: "" };
    }

    if (period === "month") {
        return {
            from: current.slice(0, 7) + "-01",
            to: current
        };
    }

    if (period === "quarter") {
        const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;

        return {
            from: `${year}-${String(firstMonth).padStart(2, "0")}-01`,
            to: current
        };
    }

    const startYear = month < 4 ? year - 1 : year;

    return {
        from: `${startYear}-04-01`,
        to: current
    };
}

function inRange(record, range) {
    return (
        (!range.from || record.transactionDate >= range.from) &&
        (!range.to || record.transactionDate <= range.to)
    );
}

function sortedTransactions(records) {
    return [...records].sort((a, b) =>
        b.transactionDate.localeCompare(a.transactionDate) ||
        b.sequenceNumber - a.sequenceNumber
    );
}

function calculateStatistics(filters = {}) {
    return Cloud.calculateFinanceStatistics(
        state.transactions,
        filters
    );
}

/* =========================================================
   04. CLOUD SYNCHRONIZATION
   ========================================================= */

async function synchronize() {
    await requireSession();

    setText("connectionStatus", "Synchronizing...");

    try {
        const [data, settings, nextCode] = await Promise.all([
            Cloud.fetchFinanceData(),
            Cloud.getFinanceSettings(),
            Cloud.getNextTransactionCode(
                value("transactionDate") || today()
            )
        ]);

        await requireSession();

        state.transactions = sortedTransactions(data.transactions);
        state.agreements = data.agreements;
        state.clients = data.clients;
        state.cases = data.cases;
        state.invoices = data.invoices;
        state.invoiceLinks = data.invoiceLinks;
        state.settings = settings;
        state.connected = true;

        setText("connectionStatus", "Connected");

        $("connectionStatus").className = "connected";

        setText(
            "currentFinancialYear",
            Cloud.getFinancialYear()
        );

        setText("nextTransactionCode", nextCode);

        setText(
            "lastSync",
            new Date(data.synchronizedAt).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata"
            })
        );

        populateSelectors();
        renderAll();

    } catch (error) {
        state.connected = false;

        setText("connectionStatus", "Unavailable");

        $("connectionStatus").className = "disconnected";

        throw error;
    }
}

async function refreshAfterCommit(successText) {
    try {
        await synchronize();

        message(successText, "success");

    } catch (error) {
        message(
            successText +
            " The record was saved, but synchronization failed. " +
            "Click Refresh before making further entries.",
            "warning"
        );
    }
}

/* =========================================================
   05. SELECTORS & ASSOCIATIONS
   ========================================================= */

function clientLabel(record) {
    return `${record.clientCode || ""} — ${record.fullName || record.id}`;
}

function caseLabel(record) {
    return `${record.caseCode || ""} — ${record.caseTitle || record.id}`;
}

function availableClients() {
    return state.clients.filter(record =>
        record.status !== "archived"
    );
}

function availableCases(clientId) {
    return state.cases.filter(record =>
        record.status !== "archived" &&
        record.clientId === clientId
    );
}

function populateSelectors() {
    const clients = availableClients();

    for (const id of [
        "transactionClient",
        "agreementClient",
        "invoiceLinkClient"
    ]) {
        fillSelect(id, clients, "Select Client", clientLabel);
    }

    fillSelect(
        "filterClient",
        state.clients,
        "All Clients",
        clientLabel
    );

    fillSelect(
        "ledgerClient",
        state.clients,
        "Select Client",
        clientLabel
    );

    fillValues(
        "filterTransactionType",
        Object.entries(TYPES).map(([key, label]) => ({
            value: key,
            label
        })),
        "All Types"
    );

    updateTransactionAssociations();

    updateCaseSelector("agreementClient", "agreementCase");
    updateCaseSelector("invoiceLinkClient", "invoiceLinkCase");
    updateCaseSelector("ledgerClient", "ledgerCase", "All Matters");

    updateCategories();
}

function updateCaseSelector(clientField, caseField, placeholder = "Not Associated") {
    const clientId = value(clientField);

    fillSelect(
        caseField,
        availableCases(clientId),
        placeholder,
        caseLabel
    );
}

function updateTransactionAssociations() {
    const clientId = value("transactionClient");

    updateCaseSelector(
        "transactionClient",
        "transactionCase"
    );

    const caseId = value("transactionCase");
    const type = value("transactionType");

    const feeRelated = ["income", "refund"].includes(type);

    const agreements = feeRelated
        ? state.agreements.filter(record =>
            record.clientId === clientId &&
            record.caseId === caseId &&
            (record.status === "active" || type === "refund")
        )
        : [];

    fillSelect(
        "transactionAgreement",
        agreements,
        "Not Associated",
        record => `${record.title} — Outstanding ${money(record.outstandingPaise)}`
    );

    const invoices = feeRelated
        ? state.invoices.filter(record => {
            const link = getInvoiceLink(record.id);

            return link &&
                link.clientId === clientId &&
                link.caseId === caseId;
        })
        : [];

    fillSelect(
        "transactionInvoice",
        invoices,
        "Not Associated",
        invoiceNumber
    );

    $("transactionClient").required =
        type.startsWith("advance");

    updateTransactionContext();
}

function updateCategories() {
    const type = value("transactionType");

    const categories = {
        income: state.settings.incomeCategories,
        expense: state.settings.expenseCategories,
        advance: ["Client Funds Received"],
        advance_utilization: [
            "Court Fees",
            "Stamp Duty",
            "Client Disbursement",
            "Other Client Expense"
        ],
        advance_refund: ["Return of Client Funds"],
        refund: ["Professional Fee Refund"],
        capital_in: ["Capital Introduced"],
        capital_out: ["Capital Withdrawal"]
    }[type] || [];

    fillValues(
        "transactionCategory",
        categories.map(category => ({
            value: category,
            label: category
        })),
        "Select Category"
    );
}

function updateTransactionContext() {
    const clientId = value("transactionClient");
    const agreement = getAgreement(value("transactionAgreement"));

    const parts = [];

    if (clientId) {
        parts.push(
            "Client advance balance: " +
            money(
                Cloud.getClientAdvanceBalance(
                    state.transactions,
                    clientId
                )
            )
        );
    }

    if (agreement) {
        parts.push(
            "Agreement outstanding: " +
            money(agreement.outstandingPaise)
        );
    }

    const element = $("transactionContext");

    element.textContent = parts.join(" | ");
    element.hidden = parts.length === 0;
}

/* =========================================================
   06. TAB NAVIGATION
   ========================================================= */

function activateTab(tab, scroll = true) {
    if (!TABS.includes(tab)) return;

    state.tab = tab;

    for (const name of TABS) {
        $(`${name}Panel`).hidden = name !== tab;
    }

    $$("[data-tab]").forEach(button => {
        const active = button.dataset.tab === tab;

        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
    });

    if (tab === "overview") renderOverview();
    if (tab === "transactions") renderTransactions();
    if (tab === "agreements") renderAgreements();
    if (tab === "outstanding") renderOutstanding();
    if (tab === "invoices") renderInvoices();

    if (scroll) {
        scrollToElement(`${tab}Panel`);
    }
}

function openDialog(id) {
    const dialog = $(id);

    if (!dialog.open) {
        dialog.showModal();
    }
}

function closeDialog(id) {
    const dialog = $(id);

    if (dialog.open) {
        dialog.close();
    }
}

/* =========================================================
   07. FINANCIAL OVERVIEW
   ========================================================= */

function renderOverview() {
    const range = periodRange(value("overviewPeriod"));
    const stats = calculateStatistics(range);
    const allStats = calculateStatistics();

    const outstanding = sum(
        state.agreements.filter(record => record.status === "active"),
        "outstandingPaise"
    );

    setText("totalIncome", money(stats.incomePaise));
    setText("totalExpenses", money(stats.expensePaise));
    setText("netSurplus", money(stats.netSurplusPaise));
    setText("totalOutstanding", money(outstanding));

    setText(
        "totalAdvances",
        money(allStats.advanceBalanceChangePaise)
    );

    setText(
        "capitalMovement",
        money(stats.capitalChangePaise)
    );

    $("netSurplus").className =
        stats.netSurplusPaise < 0
            ? "text-danger"
            : "text-success";

    const rows = state.transactions
        .filter(record => inRange(record, range))
        .slice(0, 8);

    $("recentTransactionsBody").innerHTML = rows.length
        ? rows.map(record => `<tr>
            <td>${esc(displayDate(record.transactionDate))}</td>
            <td>${esc(record.transactionCode)}</td>
            <td>${esc(typeName(record.transactionType))}</td>
            <td class="amount">${esc(money(record.amountPaise))}</td>
            <td>${badge(record.status)}</td>
        </tr>`).join("")
        : emptyRow(5, "No transactions recorded for this period.");

    renderMonthlyPerformance();
}

function renderMonthlyPerformance() {
    const current = today();

    const year = Number(current.slice(0, 4));
    const month = Number(current.slice(5, 7));

    const months = [];

    for (let offset = 5; offset >= 0; offset--) {
        const date = new Date(Date.UTC(year, month - 1 - offset, 1));

        const from = date.toISOString().slice(0, 10);

        const end = new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth() + 1,
            0
        )).toISOString().slice(0, 10);

        const stats = calculateStatistics({
            from,
            to: end
        });

        months.push({
            label: date.toLocaleDateString("en-IN", {
                month: "short",
                year: "2-digit",
                timeZone: "UTC"
            }),
            income: stats.incomePaise,
            expense: stats.expensePaise
        });
    }

    const maximum = Math.max(
        1,
        ...months.flatMap(record => [
            Math.abs(record.income),
            Math.abs(record.expense)
        ])
    );

    $("monthlyPerformance").innerHTML = `
        <div class="chart-legend">
            <span><i class="legend-dot income"></i> Net Income</span>
            <span><i class="legend-dot expense"></i> Expenses</span>
        </div>
        <div class="monthly-chart">
            ${months.map(record => `
                <div class="chart-row">
                    <div class="chart-label">${esc(record.label)}</div>
                    <div class="chart-bars">
                        <small>${esc(money(record.income))}</small>
                        <div class="chart-track">
                            <div class="chart-bar income"
                                style="width:${Math.abs(record.income) / maximum * 100}%">
                            </div>
                        </div>
                        <small>${esc(money(record.expense))}</small>
                        <div class="chart-track">
                            <div class="chart-bar expense"
                                style="width:${Math.abs(record.expense) / maximum * 100}%">
                            </div>
                        </div>
                    </div>
                </div>
            `).join("")}
        </div>`;
}

/* =========================================================
   08. TRANSACTION DIRECTORY
   ========================================================= */

function filteredTransactions() {
    const search = value("transactionSearch").toLowerCase();
    const type = value("filterTransactionType");
    const client = value("filterClient");
    const status = value("filterStatus");
    const from = value("filterFromDate");
    const to = value("filterToDate");

    return state.transactions.filter(record => {
        if (type && record.transactionType !== type) return false;
        if (client && record.clientId !== client) return false;
        if (status && record.status !== status) return false;
        if (!inRange(record, { from, to })) return false;

        const haystack = [
            record.transactionCode,
            record.description,
            record.category,
            record.paymentReference,
            clientName(record.clientId),
            caseName(record.caseId)
        ].join(" ").toLowerCase();

        return !search || haystack.includes(search);
    });
}

function renderTransactions() {
    const records = filteredTransactions();

    const pages = Math.max(
        1,
        Math.ceil(records.length / state.pageSize)
    );

    state.page = Math.min(state.page, pages);

    const start = (state.page - 1) * state.pageSize;
    const rows = records.slice(start, start + state.pageSize);

    setText(
        "transactionCount",
        `${records.length} transaction(s) found.`
    );

    $("transactionsBody").innerHTML = rows.length
        ? rows.map(record => `<tr>
            <td><strong>${esc(record.transactionCode)}</strong></td>
            <td>${esc(displayDate(record.transactionDate))}</td>
            <td>${esc(typeName(record.transactionType))}</td>
            <td>${esc(clientName(record.clientId))}</td>
            <td>${esc(record.category)}</td>
            <td class="amount">${esc(money(record.amountPaise))}</td>
            <td>${esc(modeName(record.paymentMode))}</td>
            <td>${badge(record.status)}</td>
            <td>
                <div class="table-actions">
                    ${actionButton("view-transaction", record.id, "View")}
                    ${
                        record.status === "posted" &&
                        record.transactionType !== "reversal"
                        ? actionButton("reverse-transaction", record.id, "Reverse")
                        : ""
                    }
                </div>
            </td>
        </tr>`).join("")
        : emptyRow(9);

    $("transactionPagination").innerHTML = `
        <button type="button" data-page="${state.page - 1}"
            ${state.page <= 1 ? "disabled" : ""}>Previous</button>
        <span>Page ${state.page} of ${pages}</span>
        <button type="button" data-page="${state.page + 1}"
            ${state.page >= pages ? "disabled" : ""}>Next</button>
    `;
}

function clearFilters() {
    for (const id of [
        "transactionSearch",
        "filterTransactionType",
        "filterClient",
        "filterStatus",
        "filterFromDate",
        "filterToDate"
    ]) {
        setValue(id, "");
    }

    state.page = 1;

    renderTransactions();
}

/* =========================================================
   09. CREATE TRANSACTIONS
   ========================================================= */

function resetTransactionForm() {
    $("transactionForm").reset();

    setValue("transactionDate", today());

    $("transactionDate").max = today();

    setValue("transactionType", "income");

    state.pendingTransactionId = null;
    state.dirty = false;

    clearMessage("transactionFormError");

    updateCategories();
    updateTransactionAssociations();
}

async function refreshTransactionCode() {
    const date = value("transactionDate");

    if (!date || date > today()) return;

    const code = await Cloud.getNextTransactionCode(date);

    if (value("transactionDate") === date) {
        setText("nextTransactionCode", code);
    }
}

function newTransaction(type = "income", agreement = null, invoice = null) {
    if (state.dirty && !window.confirm(
        "Discard the unsaved transaction form?"
    )) {
        return;
    }

    resetTransactionForm();

    setValue("transactionType", type);

    updateCategories();

    if (agreement) {
        setValue("transactionClient", agreement.clientId);

        updateTransactionAssociations();

        setValue("transactionCase", agreement.caseId);

        updateTransactionAssociations();

        setValue("transactionAgreement", agreement.id);

        if (agreement.outstandingPaise > 0) {
            setValue(
                "transactionAmount",
                (agreement.outstandingPaise / 100).toFixed(2)
            );
        }

        setValue(
            "transactionDescription",
            `Professional fees towards ${agreement.title}`
        );
    }

    if (invoice) {
        const link = getInvoiceLink(invoice.id);

        if (link) {
            setValue("transactionClient", link.clientId);

            updateTransactionAssociations();

            setValue("transactionCase", link.caseId);

            updateTransactionAssociations();

            setValue("transactionInvoice", invoice.id);

            setValue(
                "transactionDescription",
                `Payment towards invoice ${invoiceNumber(invoice)}`
            );
        }
    }

    updateTransactionContext();

    activateTab("transaction");

    refreshTransactionCode().catch(error => {
        message(errorMessage(error), "error", "transactionFormError");
    });
}

async function saveTransaction(event) {
    event.preventDefault();

    if (state.busy || !$("transactionForm").reportValidity()) return;

    await perform(async () => {
        if (!state.connected) {
            throw new Error("Refresh the financial records before posting a transaction.");
        }

        const input = {
            transactionType: value("transactionType"),
            transactionDate: value("transactionDate"),
            category: value("transactionCategory"),
            amountPaise: Cloud.rupeesToPaise(value("transactionAmount")),
            clientId: value("transactionClient"),
            caseId: value("transactionCase"),
            feeAgreementId: value("transactionAgreement"),
            invoiceId: value("transactionInvoice"),
            paymentMode: value("paymentMode"),
            paymentReference: value("paymentReference"),
            description: value("transactionDescription")
        };

        if (!input.description) {
            throw new Error("Enter transaction particulars.");
        }

        const duplicate = state.transactions.find(record =>
            record.status === "posted" &&
            record.transactionType === input.transactionType &&
            record.transactionDate === input.transactionDate &&
            record.amountPaise === input.amountPaise &&
            record.clientId === input.clientId &&
            record.paymentReference === input.paymentReference
        );

        if (
            duplicate &&
            duplicate.id !== state.pendingTransactionId &&
            !window.confirm(
                "A similar transaction already exists: " +
                duplicate.transactionCode +
                ". Confirm that this is a separate payment."
            )
        ) {
            return;
        }

        if (!window.confirm(
            `Post ${typeName(input.transactionType)} of ` +
            `${money(input.amountPaise)}?\n\n` +
            "Posted records can only be corrected by reversal."
        )) {
            return;
        }

        state.pendingTransactionId ||= Cloud.generateTransactionId();

        const saved = await Cloud.createTransaction(
            input,
            state.pendingTransactionId
        );

        resetTransactionForm();

        activateTab("transactions", false);

        await refreshAfterCommit(
            `Transaction ${saved.transactionCode} saved successfully.`
        );

    }, "transactionFormError");
}

/* =========================================================
   10. TRANSACTION DETAILS & REVERSAL
   ========================================================= */

function showTransaction(id) {
    const record = getTransaction(id);

    if (!record) return;

    state.selectedTransaction = record;

    const fields = [
        ["Transaction Code", record.transactionCode],
        ["Date", displayDate(record.transactionDate)],
        ["Transaction Type", typeName(record.transactionType)],
        ["Amount", money(record.amountPaise)],
        ["Client", clientName(record.clientId)],
        ["Case", caseName(record.caseId)],
        ["Category", record.category],
        ["Payment Mode", modeName(record.paymentMode)],
        ["Payment Reference", record.paymentReference || "—"],
        ["Status", record.status],
        ["Description", record.description]
    ];

    if (record.reversalOf) {
        fields.push([
            "Original Transaction",
            getTransaction(record.reversalOf)?.transactionCode ||
                record.reversalOf
        ]);
    }

    if (record.reversedById) {
        fields.push([
            "Reversal Entry",
            getTransaction(record.reversedById)?.transactionCode ||
                record.reversedById
        ]);
    }

    $("transactionDetailContent").innerHTML = `
        <div class="report-heading">
            <h2>MNM Legal Associates</h2>
            <h3>Financial Transaction Record</h3>
        </div>
        <div class="detail-grid">
            ${fields.map(([label, text]) => `
                <div class="detail-field">
                    <span>${esc(label)}</span>
                    <strong>${esc(text)}</strong>
                </div>
            `).join("")}
        </div>`;

    openDialog("transactionDetailDialog");
}

function showReversal(id) {
    const record = getTransaction(id);

    if (
        !record ||
        record.status !== "posted" ||
        record.transactionType === "reversal"
    ) {
        message("This transaction cannot be reversed.", "error");
        return;
    }

    state.reversingTransaction = record;
    state.pendingReversalId = null;

    $("reversalForm").reset();

    clearMessage("reversalError");

    setText(
        "reversalTransactionDetails",
        `${record.transactionCode} — ${money(record.amountPaise)}`
    );

    openDialog("reversalDialog");
}

async function saveReversal(event) {
    event.preventDefault();

    if (!$("reversalForm").reportValidity()) return;

    await perform(async () => {
        const record = state.reversingTransaction;

        if (!record) {
            throw new Error("No transaction selected.");
        }

        if (record.transactionType === "advance") {
            const balance = Cloud.getClientAdvanceBalance(
                state.transactions,
                record.clientId
            );

            if (balance < record.amountPaise) {
                throw new Error(
                    "Reverse the related advance utilization or refund entries first."
                );
            }
        }

        state.pendingReversalId ||= Cloud.generateTransactionId();

        const reversal = await Cloud.reverseTransaction(
            record.id,
            value("reversalReason"),
            state.pendingReversalId
        );

        closeDialog("reversalDialog");

        state.reversingTransaction = null;
        state.pendingReversalId = null;

        await refreshAfterCommit(
            `Reversal ${reversal.transactionCode} recorded successfully.`
        );

    }, "reversalError");
}

/* =========================================================
   11. FEE AGREEMENTS
   ========================================================= */

function renderAgreements() {
    const records = [...state.agreements].sort((a, b) =>
        String(b.agreementDate).localeCompare(String(a.agreementDate))
    );

    $("agreementsBody").innerHTML = records.length
        ? records.map(record => `<tr>
            <td>${esc(clientName(record.clientId))}</td>
            <td>
                <strong>${esc(record.title)}</strong>
                <small>${esc(caseName(record.caseId))}</small>
            </td>
            <td class="amount">${esc(money(record.agreedAmountPaise))}</td>
            <td class="amount text-success">${esc(money(record.receivedPaise))}</td>
            <td class="amount">${esc(money(record.outstandingPaise))}</td>
            <td>${esc(displayDate(record.dueDate))}</td>
            <td>${badge(record.status)}</td>
            <td>
                ${actionButton("edit-agreement", record.id, "Edit")}
                ${
                    record.status === "active"
                    ? actionButton("agreement-payment", record.id, "Record Payment")
                    : ""
                }
            </td>
        </tr>`).join("")
        : emptyRow(8, "No fee agreements registered.");
}

function showAgreement(id = null) {
    const record = id ? getAgreement(id) : null;

    state.editingAgreement = record;
    state.pendingAgreementId = null;

    $("agreementForm").reset();

    clearMessage("agreementFormError");

    setText(
        "agreementDialogTitle",
        record ? "Edit Fee Agreement" : "New Fee Agreement"
    );

    fillSelect(
        "agreementClient",
        record ? state.clients : availableClients(),
        "Select Client",
        clientLabel
    );

    setValue("agreementClient", record?.clientId || "");

    updateCaseSelector("agreementClient", "agreementCase");

    if (record?.caseId) {
        const select = $("agreementCase");

        if (![...select.options].some(o => o.value === record.caseId)) {
            select.add(new Option(caseName(record.caseId), record.caseId));
        }
    }

    setValue("agreementCase", record?.caseId || "");
    setValue("agreementTitle", record?.title || "");

    setValue(
        "agreementAmount",
        record ? (record.agreedAmountPaise / 100).toFixed(2) : ""
    );

    setValue("agreementDate", record?.agreementDate || today());
    setValue("agreementDueDate", record?.dueDate || "");
    setValue("agreementStatus", record?.status || "active");
    setValue("agreementNotes", record?.notes || "");

    for (const field of [
        "agreementClient",
        "agreementCase",
        "agreementAmount",
        "agreementDate"
    ]) {
        $(field).disabled = Boolean(record);
    }

    $("agreementStatus").disabled = !record;

    openDialog("agreementDialog");
}

async function saveAgreement(event) {
    event.preventDefault();

    if (!$("agreementForm").reportValidity()) return;

    await perform(async () => {
        const existing = state.editingAgreement;

        const input = {
            clientId: value("agreementClient"),
            caseId: value("agreementCase"),
            title: value("agreementTitle"),
            agreementDate: value("agreementDate"),
            dueDate: value("agreementDueDate"),
            notes: value("agreementNotes"),
            status: value("agreementStatus")
        };

        if (input.dueDate && input.dueDate < input.agreementDate) {
            throw new Error("Due date cannot precede the agreement date.");
        }

        if (existing) {
            if (
                input.status === "closed" &&
                existing.outstandingPaise > 0
            ) {
                throw new Error(
                    "This agreement has an outstanding balance. Reconcile the fees before closing it."
                );
            }

            await Cloud.updateFeeAgreement(
                existing.id,
                input,
                existing.revision
            );

        } else {
            input.agreedAmountPaise = Cloud.rupeesToPaise(
                value("agreementAmount")
            );

            if (!window.confirm(
                `Create a fee agreement for ${money(input.agreedAmountPaise)}?`
            )) {
                return;
            }

            state.pendingAgreementId ||= Cloud.generateAgreementId();

            await Cloud.createFeeAgreement(
                input,
                state.pendingAgreementId
            );
        }

        closeDialog("agreementDialog");

        state.editingAgreement = null;
        state.pendingAgreementId = null;

        await refreshAfterCommit("Fee agreement saved successfully.");

    }, "agreementFormError");
}

/* =========================================================
   12. OUTSTANDING FEES
   ========================================================= */

function renderOutstanding() {
    const records = state.agreements.filter(record =>
        record.status === "active" &&
        record.outstandingPaise > 0
    );

    const overdue = records.filter(record =>
        record.dueDate && record.dueDate < today()
    );

    setText(
        "outstandingAmount",
        money(sum(records, "outstandingPaise"))
    );

    setText(
        "overdueAmount",
        money(sum(overdue, "outstandingPaise"))
    );

    setText("pendingAgreementCount", records.length);

    $("outstandingBody").innerHTML = records.length
        ? records.map(record => `<tr>
            <td>${esc(clientName(record.clientId))}</td>
            <td>${esc(record.title)}</td>
            <td>${esc(money(record.agreedAmountPaise))}</td>
            <td class="text-success">${esc(money(record.receivedPaise))}</td>
            <td class="amount text-danger">${esc(money(record.outstandingPaise))}</td>
            <td>
                ${esc(displayDate(record.dueDate))}
                ${
                    record.dueDate && record.dueDate < today()
                    ? badge("overdue")
                    : ""
                }
            </td>
            <td>
                ${actionButton("agreement-payment", record.id, "Record Payment")}
            </td>
        </tr>`).join("")
        : emptyRow(7, "No outstanding fee agreements.");
}

/* =========================================================
   13. CLIENT & CASE LEDGER
   ========================================================= */

function renderLedger(scroll = true) {
    const clientId = value("ledgerClient");
    const caseId = value("ledgerCase");

    if (!clientId) {
        state.ledgerReady = false;
        state.ledgerRows = [];
        $("ledgerResult").hidden = true;

        if (scroll) {
            message("Select a client to view the ledger.", "warning");
        }

        return;
    }

    const filters = { clientId, caseId };

    const stats = calculateStatistics(filters);

    const agreements = state.agreements.filter(record =>
        record.clientId === clientId &&
        (!caseId || record.caseId === caseId)
    );

    state.ledgerRows = state.transactions.filter(record =>
        record.clientId === clientId &&
        (!caseId || record.caseId === caseId)
    );

    setText(
        "ledgerAgreed",
        money(sum(agreements, "agreedAmountPaise"))
    );

    setText("ledgerReceived", money(stats.incomePaise));

    setText(
        "ledgerOutstanding",
        money(sum(
            agreements.filter(record => record.status === "active"),
            "outstandingPaise"
        ))
    );

    setText(
        "ledgerAdvance",
        money(stats.advanceBalanceChangePaise)
    );

    setText(
        "ledgerTitle",
        clientName(clientId) +
        (caseId ? ` — ${caseName(caseId)}` : " — Financial Ledger")
    );

    $("ledgerBody").innerHTML = state.ledgerRows.length
        ? state.ledgerRows.map(record => `<tr>
            <td>${esc(displayDate(record.transactionDate))}</td>
            <td>${esc(record.transactionCode)}</td>
            <td>${esc(record.description)}</td>
            <td>${esc(typeName(record.transactionType))}</td>
            <td class="amount">${esc(money(record.amountPaise))}</td>
            <td>${badge(record.status)}</td>
        </tr>`).join("")
        : emptyRow(6, "No financial transactions for this client.");

    state.ledgerReady = true;

    $("ledgerResult").hidden = false;

    if (scroll) scrollToElement("ledgerResult");
}

/* =========================================================
   14. INVOICE REGISTER & RECONCILIATION
   ========================================================= */

function renderInvoices() {
    const search = value("invoiceSearch").toLowerCase();

    const records = state.invoices.filter(record =>
        [
            invoiceNumber(record),
            invoiceName(record)
        ].join(" ").toLowerCase().includes(search)
    );

    $("invoicesBody").innerHTML = records.length
        ? records.map(record => {
            const link = getInvoiceLink(record.id);

            const received = Cloud.calculateInvoiceReceipts(
                record.id,
                state.transactions
            );

            return `<tr>
                <td>
                    <strong>${esc(invoiceNumber(record))}</strong>
                    ${record.status ? `<small>${esc(record.status)}</small>` : ""}
                </td>
                <td>${esc(displayDate(invoiceDate(record)))}</td>
                <td>${esc(invoiceName(record))}</td>
                <td class="amount">${esc(money(received))}</td>
                <td>
                    ${
                        link
                        ? `${esc(clientName(link.clientId))}
                           <small>${esc(caseName(link.caseId))}</small>`
                        : "Not Linked"
                    }
                </td>
                <td>
                    ${
                        !link
                        ? actionButton("link-invoice", record.id, "Link Invoice")
                        : record.status !== "cancelled"
                            ? actionButton("invoice-payment", record.id, "Record Payment")
                            : "Cancelled"
                    }
                </td>
            </tr>`;
        }).join("")
        : emptyRow(6, "No invoices found.");
}

function showInvoiceLink(id) {
    const record = state.invoices.find(item => item.id === id);

    if (!record) return;

    if (getInvoiceLink(id)) {
        message("This invoice is already linked.", "warning");
        return;
    }

    state.selectedInvoice = record;

    $("invoiceLinkForm").reset();

    clearMessage("invoiceLinkError");

    setText(
        "invoiceLinkTitle",
        `${invoiceNumber(record)} — ${invoiceName(record)}`
    );

    updateCaseSelector("invoiceLinkClient", "invoiceLinkCase");

    openDialog("invoiceLinkDialog");
}

async function saveInvoiceLink(event) {
    event.preventDefault();

    if (!$("invoiceLinkForm").reportValidity()) return;

    await perform(async () => {
        const record = state.selectedInvoice;

        if (!record) {
            throw new Error("No invoice selected.");
        }

        if (!window.confirm(
            "Confirm permanent association of this invoice with the selected client and matter?"
        )) {
            return;
        }

        await Cloud.linkInvoice(
            record.id,
            value("invoiceLinkClient"),
            value("invoiceLinkCase")
        );

        closeDialog("invoiceLinkDialog");

        state.selectedInvoice = null;

        await refreshAfterCommit("Invoice linked successfully.");

    }, "invoiceLinkError");
}

/* =========================================================
   15. FINANCIAL REPORTS
   ========================================================= */

function updateReportDates() {
    const period = value("reportPeriod");

    const custom = period === "custom";

    $("reportFromDate").disabled = !custom;
    $("reportToDate").disabled = !custom;

    if (!custom) {
        const range = periodRange(period);

        setValue("reportFromDate", range.from);
        setValue("reportToDate", range.to);
    }

    state.reportReady = false;

    $("reportResult").hidden = true;
}

function renderReport(scroll = true) {
    const range = {
        from: value("reportFromDate"),
        to: value("reportToDate")
    };

    if (!range.from || !range.to || range.from > range.to) {
        throw new Error("Select a valid reporting date range.");
    }

    const stats = calculateStatistics(range);

    state.reportRows = state.transactions.filter(record =>
        inRange(record, range)
    );

    setText(
        "reportDateRange",
        `${displayDate(range.from)} to ${displayDate(range.to)}`
    );

    setText("reportIncome", money(stats.incomePaise));
    setText("reportExpenses", money(stats.expensePaise));
    setText("reportSurplus", money(stats.netSurplusPaise));

    setText(
        "reportAdvanceMovement",
        money(stats.advanceBalanceChangePaise)
    );

    $("reportBody").innerHTML = state.reportRows.length
        ? state.reportRows.map(record => `<tr>
            <td>${esc(displayDate(record.transactionDate))}</td>
            <td>${esc(record.transactionCode)}</td>
            <td>${esc(record.category)}</td>
            <td>${esc(typeName(record.transactionType))}</td>
            <td class="amount">${esc(money(record.amountPaise))}</td>
            <td>${badge(record.status)}</td>
        </tr>`).join("")
        : emptyRow(6, "No transactions during this period.");

    state.reportReady = true;

    $("reportResult").hidden = false;

    if (scroll) scrollToElement("reportResult");
}

/* =========================================================
   16. FINANCIAL SETTINGS
   ========================================================= */

function renderSettings() {
    setValue(
        "incomeCategories",
        state.settings.incomeCategories.join("\n")
    );

    setValue(
        "expenseCategories",
        state.settings.expenseCategories.join("\n")
    );
}

async function saveSettings(event) {
    event.preventDefault();

    await perform(async () => {
        const clean = id => value(id)
            .split(/\r?\n/)
            .map(item => item.trim())
            .filter(Boolean);

        const input = {
            incomeCategories: clean("incomeCategories"),
            expenseCategories: clean("expenseCategories")
        };

        if (
            !input.incomeCategories.length ||
            !input.expenseCategories.length
        ) {
            throw new Error("At least one income and expense category is required.");
        }

        state.settings = await Cloud.saveFinanceSettings(input);

        updateCategories();
        renderSettings();

        message("Financial settings saved successfully.");

    });
}

/* =========================================================
   17. EXPORT & BACKUP
   ========================================================= */

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], {
        type: mimeType
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);

    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCSV(records, prefix) {
    const csv = Cloud.generateFinanceCSV(records);

    downloadFile(
        "\uFEFF" + csv,
        `MNM-${prefix}-${today()}.csv`,
        "text/csv;charset=utf-8"
    );

    message("CSV export prepared.");
}

async function backupFinance() {
    await perform(async () => {
        if (!window.confirm(
            "Download confidential financial records as an unencrypted JSON backup?"
        )) {
            return;
        }

        setText("backupStatus", "Preparing backup...");

        try {
            const backup = await Cloud.createFinanceBackup();

            await requireSession();

            downloadFile(
                JSON.stringify(backup, null, 2),
                `MNM-Financial-Backup-${today()}.json`,
                "application/json"
            );

            setText("backupStatus", "Backup download initiated.");

            message("Financial backup prepared successfully.");

        } catch (error) {
            setText("backupStatus", "Backup failed.");

            throw error;
        }
    });
}

/* =========================================================
   18. PRINTING
   ========================================================= */

async function printDocument(type) {
    await perform(async () => {
        if (type === "ledger" && !state.ledgerReady) {
            throw new Error("Generate the client ledger first.");
        }

        if (type === "report" && !state.reportReady) {
            throw new Error("Generate the financial report first.");
        }

        if (type === "receipt" && !state.selectedTransaction) {
            throw new Error("Select a transaction first.");
        }

        document.body.classList.add(`print-${type}`);

        try {
            window.print();

        } finally {
            document.body.classList.remove(`print-${type}`);
        }
    });
}

/* =========================================================
   19. MASTER RENDER
   ========================================================= */

function renderAll() {
    renderOverview();
    renderTransactions();
    renderAgreements();
    renderOutstanding();
    renderInvoices();
    renderSettings();

    if (state.ledgerReady) {
        renderLedger(false);
    }

    if (state.reportReady) {
        renderReport(false);
    }
}

/* =========================================================
   20. DELEGATED CLICK HANDLER
   ========================================================= */

function handleClick(event) {
    const button = event.target.closest("button");

    if (!button || state.busy || state.invalidated) return;

    if (!$("protectedContent").contains(button)) return;

    if ($("protectedContent").hidden) return;

    if (button.dataset.closeDialog) {
        closeDialog(button.dataset.closeDialog);
        return;
    }

    if (button.dataset.tab) {
        activateTab(button.dataset.tab);
        return;
    }

    if (button.dataset.openTab) {
        activateTab(button.dataset.openTab);
        return;
    }

    if (button.dataset.newType) {
        newTransaction(button.dataset.newType);
        return;
    }

    if (button.dataset.page) {
        state.page = Math.max(1, Number(button.dataset.page));

        renderTransactions();

        return;
    }

    const action = button.dataset.action;
    const id = button.dataset.id;

    switch (action) {
        case "view-transaction":
            showTransaction(id);
            break;

        case "reverse-transaction":
            showReversal(id);
            break;

        case "edit-agreement":
            showAgreement(id);
            break;

        case "agreement-payment": {
            const agreement = getAgreement(id);

            if (agreement) {
                newTransaction("income", agreement);
            }

            break;
        }

        case "link-invoice":
            showInvoiceLink(id);
            break;

        case "invoice-payment": {
            const invoice = state.invoices.find(record => record.id === id);

            if (invoice && invoice.status !== "cancelled") {
                newTransaction("income", null, invoice);
            }

            break;
        }
    }
}

/* =========================================================
   21. EVENT REGISTRATION
   ========================================================= */

function bindEvents() {
    document.addEventListener("click", handleClick);

    $("refreshButton").addEventListener("click", () => {
        perform(async () => {
            await synchronize();

            message("Financial records synchronized successfully.");
        });
    });

    $("overviewPeriod").addEventListener(
        "change",
        renderOverview
    );

    for (const id of [
        "transactionSearch",
        "filterTransactionType",
        "filterClient",
        "filterStatus",
        "filterFromDate",
        "filterToDate"
    ]) {
        $(id).addEventListener("input", () => {
            state.page = 1;

            renderTransactions();
        });
    }

    $("clearFiltersButton").addEventListener(
        "click",
        clearFilters
    );

    $("transactionType").addEventListener("change", () => {
        updateCategories();
        updateTransactionAssociations();
    });

    $("transactionClient").addEventListener("change", () => {
        setValue("transactionCase", "");
        setValue("transactionAgreement", "");
        setValue("transactionInvoice", "");

        updateTransactionAssociations();
    });

    $("transactionCase").addEventListener("change", () => {
        setValue("transactionAgreement", "");
        setValue("transactionInvoice", "");

        updateTransactionAssociations();
    });

    $("transactionAgreement").addEventListener(
        "change",
        updateTransactionContext
    );

    $("transactionDate").addEventListener("change", () => {
        refreshTransactionCode().catch(error => {
            message(
                errorMessage(error),
                "error",
                "transactionFormError"
            );
        });
    });

    $("transactionForm").addEventListener(
        "submit",
        saveTransaction
    );

    $("transactionForm").addEventListener("input", () => {
        state.dirty = true;
    });

    $("transactionForm").addEventListener("reset", event => {
        if (event.isTrusted) {
            state.pendingTransactionId = null;
            state.dirty = false;

            setTimeout(() => {
                setValue("transactionDate", today());
                updateCategories();
                updateTransactionAssociations();
            }, 0);
        }
    });

    $("newAgreementButton").addEventListener("click", () => {
        showAgreement();
    });

    $("agreementClient").addEventListener("change", () => {
        updateCaseSelector("agreementClient", "agreementCase");
    });

    $("agreementForm").addEventListener(
        "submit",
        saveAgreement
    );

    $("reversalForm").addEventListener(
        "submit",
        saveReversal
    );

    $("ledgerClient").addEventListener("change", () => {
        updateCaseSelector("ledgerClient", "ledgerCase", "All Matters");

        state.ledgerReady = false;

        $("ledgerResult").hidden = true;
    });

    $("ledgerCase").addEventListener("change", () => {
        state.ledgerReady = false;

        $("ledgerResult").hidden = true;
    });

    $("loadLedgerButton").addEventListener("click", () => {
        perform(async () => renderLedger());
    });

    $("invoiceSearch").addEventListener(
        "input",
        renderInvoices
    );

    $("invoiceLinkClient").addEventListener("change", () => {
        updateCaseSelector("invoiceLinkClient", "invoiceLinkCase");
    });

    $("invoiceLinkForm").addEventListener(
        "submit",
        saveInvoiceLink
    );

    $("reportPeriod").addEventListener(
        "change",
        updateReportDates
    );

    for (const id of ["reportFromDate", "reportToDate"]) {
        $(id).addEventListener("change", () => {
            state.reportReady = false;

            $("reportResult").hidden = true;
        });
    }

    $("generateReportButton").addEventListener("click", () => {
        perform(async () => renderReport());
    });

    $("financeSettingsForm").addEventListener(
        "submit",
        saveSettings
    );

    $("exportTransactionsButton").addEventListener("click", () => {
        perform(async () => {
            exportCSV(filteredTransactions(), "Transactions");
        });
    });

    $("exportLedgerButton").addEventListener("click", () => {
        perform(async () => {
            if (!state.ledgerReady) {
                throw new Error("Generate the ledger first.");
            }

            exportCSV(state.ledgerRows, "Client-Ledger");
        });
    });

    $("exportReportButton").addEventListener("click", () => {
        perform(async () => {
            if (!state.reportReady) {
                throw new Error("Generate the report first.");
            }

            exportCSV(state.reportRows, "Financial-Report");
        });
    });

    $("fullCSVButton").addEventListener("click", () => {
        perform(async () => {
            exportCSV(state.transactions, "All-Transactions");
        });
    });

    $("fullBackupButton").addEventListener(
        "click",
        backupFinance
    );

    $("verifyConnectionButton").addEventListener("click", () => {
        perform(async () => {
            await Cloud.checkFinanceCloudConnection();

            await synchronize();

            message("Cloud connection and administrator access verified.");
        });
    });

    $("printLedgerButton").addEventListener(
        "click",
        () => printDocument("ledger")
    );

    $("printReportButton").addEventListener(
        "click",
        () => printDocument("report")
    );

    $("printReceiptButton").addEventListener(
        "click",
        () => printDocument("receipt")
    );

    window.addEventListener("beforeunload", event => {
        if (state.dirty || state.busy) {
            event.preventDefault();

            event.returnValue = "";
        }
    });

    window.addEventListener("offline", () => {
        state.connected = false;

        setText("connectionStatus", "Offline");

        $("connectionStatus").className = "disconnected";
    });

    window.addEventListener("online", () => {
        if (!state.busy && !state.invalidated && !state.dirty) {
            perform(async () => synchronize());
        }
    });

    $$("dialog").forEach(dialog => {
        dialog.addEventListener("cancel", event => {
            if (state.busy) {
                event.preventDefault();
            }
        });
    });

    auth.onAuthStateChanged(user => {
        if (!user || user.uid !== state.userId) {
            invalidateSession();
        }
    });

    const observer = new MutationObserver(() => {
        if ($("protectedContent").hidden) {
            $$("dialog[open]").forEach(dialog => dialog.close());
        }
    });

    observer.observe($("protectedContent"), {
        attributes: true,
        attributeFilter: ["hidden"]
    });
}

/* =========================================================
   22. CLIENT & CASE ENTRY LINKS
   ========================================================= */

function processIncomingLinks() {
    const params = new URLSearchParams(window.location.search);

    const clientId = params.get("clientId") || "";
    const caseId = params.get("caseId") || "";

    if (!clientId) return;

    const client = state.clients.find(record => record.id === clientId);

    if (!client) return;

    setValue("ledgerClient", clientId);

    updateCaseSelector("ledgerClient", "ledgerCase", "All Matters");

    if (caseId) {
        const record = availableCases(clientId).find(
            item => item.id === caseId
        );

        if (!record) {
            message("The requested case is not available for this client.", "warning");
            return;
        }

        setValue("ledgerCase", caseId);
    }

    activateTab("ledger", false);

    renderLedger(false);
}

/* =========================================================
   23. APPLICATION INITIALIZATION
   ========================================================= */

export async function initialiseFinanceSystem(user) {
    if (!user?.uid) {
        throw new Error("Authentication required.");
    }

    if (state.initialized) {
        if (state.userId !== user.uid) {
            invalidateSession();

            throw new Error("Authentication session changed.");
        }

        await requireSession();

        return true;
    }

    state.userId = user.uid;

    await requireSession();

    setValue("transactionDate", today());

    $("transactionDate").max = today();

    setValue("overviewPeriod", "month");

    setValue("reportPeriod", "month");

    await synchronize();

    resetTransactionForm();

    updateReportDates();

    bindEvents();

    activateTab("overview", false);

    processIncomingLinks();

    await requireSession();

    state.initialized = true;

    return true;
}

/* =========================================================
   END OF FINANCIAL MANAGEMENT APPLICATION ENGINE
   ========================================================= */
