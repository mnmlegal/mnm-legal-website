
/* =========================================================
   MNM LEGAL ASSOCIATES
   PROFESSIONAL INVOICE MANAGEMENT SYSTEM
   Version 3.0
   Justice, Integrity & Excellence
   ========================================================= */
import {
    createCloudInvoice,
    updateCloudInvoice,
    fetchCentralInvoices,
    getCentralSequence,
    getCentralPaymentSettings,
    saveCentralPaymentSettings
} from "./invoice-cloud.js";

let cloudRecords = [];
let cloudSequence = 1;
let cloudPaymentSettings = {};
let pendingCreateId = null;
let cloudSaving = false;

async function syncCloudData() {

    const [records, sequence, settings] =
        await Promise.all([
            fetchCentralInvoices(),
            getCentralSequence(),
            getCentralPaymentSettings()
        ]);

    cloudRecords = records;
    cloudSequence = sequence;
    cloudPaymentSettings = settings;

}
const KEYS = {
    invoices: "mnmSavedBills",
    sequence: "mnmNextInvoiceNumber",
    payment: "mnmFirmPaymentSettings"
};

const $ = id => document.getElementById(id);

const value = id => $(id).value;

const set = (id, val) => {
    $(id).value = val ?? "";
};

const display = (id, val) => {
    $(id).textContent = val ?? "";
};

const show = (id, visible) => {
    $(id).hidden = !visible;
};

const money = amount =>
    new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2
    }).format(amount);

const statusLabels = {
    paid: "Paid",
    partial: "Partially Paid",
    unpaid: "Unpaid"
};

let initialized = false;
let editingId = null;
let originalRecord = null;
let paymentSettings = {};
let dirty = false;
let loadedSnapshot = null;


/* =========================================================
   STORAGE & EXISTING RECORD COMPATIBILITY
   ========================================================= */

function numeric(input) {

    if (input === "" || input == null) return 0;

    const n = Number(input);

    if (!Number.isFinite(n) || n < 0) {
        throw new Error("Invalid numerical value.");
    }

    return n;

}

function paise(input) {

    const result = Math.round(numeric(input) * 100);

    if (!Number.isSafeInteger(result)) {
        throw new Error("Amount exceeds supported limit.");
    }

    return result;

}

function readInvoices() {

    return cloudRecords.filter(
        record => record.recordStatus !== "cancelled"
    );

}

    const ids = new Set();

    for (const record of records) {

        if (
            !record ||
            typeof record !== "object" ||
            record.id == null ||
            typeof record.invoiceNo !== "string" ||
            !record.invoiceNo.trim() ||
            !Array.isArray(record.items)
        ) {
            throw new Error(
                "An existing invoice has an unsupported format."
            );
        }

        const id = String(record.id);

        if (ids.has(id)) {
            throw new Error("Duplicate invoice record IDs detected.");
        }

        ids.add(id);

    }

    return records;

}

function readSequence() {

    const raw = localStorage.getItem(KEYS.sequence);

    if (raw === null) return 1;

    if (!/^\d+$/.test(raw)) {
        throw new Error("Existing invoice sequence is invalid.");
    }

    const number = Number(raw);

    if (!Number.isSafeInteger(number) || number < 1) {
        throw new Error("Existing invoice sequence is invalid.");
    }

    return number;

}

function nextSequence(records = readInvoices()) {

    let sequence = readSequence();

    for (const record of records) {

        const match = record.invoiceNo.match(
            /^MNM\/(\d+)\/\d{4}$/i
        );

        if (match) {

            const number = Number(match[1]);

            if (Number.isSafeInteger(number)) {
                sequence = Math.max(sequence, number + 1);
            }

        }

    }

    if (!Number.isSafeInteger(sequence)) {
        throw new Error("Invoice sequence exceeds supported limit.");
    }

    return sequence;

}

function invoiceNumber(sequence, date) {

    const year = date
        ? date.slice(0, 4)
        : String(new Date().getFullYear());

    return `MNM/${String(sequence).padStart(3, "0")}/${year}`;

}

function readPaymentSettings() {

    const raw = localStorage.getItem(KEYS.payment);

    if (!raw) return {};

    const data = JSON.parse(raw);

    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("Invalid payment settings.");
    }

    return data;

}


/* =========================================================
   LEGACY RECORD NORMALIZATION
   Original stored records are not automatically rewritten.
   ========================================================= */

function normalize(record) {

    const items = record.items.map(item => ({
        description: String(
            item.description ?? item.particular ?? ""
        ),
        quantity: numeric(item.quantity ?? item.qty ?? 1),
        rate: numeric(item.rate ?? 0)
    }));

    const earlier = numeric(record.receivedEarlier ?? 0);

    const now = numeric(
        record.receivedNow ??
        record.amountPaid ??
        0
    );

    return {
        ...record,

        id: String(record.id),

        invoiceNo: record.invoiceNo,

        invoiceDate: record.invoiceDate || "",

        dueDate: record.dueDate || "",

        previousBillNo: record.previousBillNo || "",

        issuedBy: record.issuedBy || "MNM Legal Associates",

        matterReference: record.matterReference || "",

        clientName: record.clientName || "",

        clientPhone:
            record.clientPhone ??
            record.clientMobile ??
            "",

        clientEmail: record.clientEmail || "",

        clientAddress: record.clientAddress || "",

        clientGSTIN: record.clientGSTIN || "",

        items,

        discountAmount: numeric(record.discountAmount ?? 0),

        receivedEarlier: earlier,

        receivedNow: now,

        paymentMode: record.paymentMode || "",

        paymentReference: record.paymentReference || "",

        notes: record.notes || "",

        terms: record.terms ?? DEFAULT_TERMS,

        showPaymentDetails: Boolean(record.showPaymentDetails),

        showSignature: record.showSignature !== false

    };

}


/* =========================================================
   DEFAULT INVOICE TERMS
   ========================================================= */

const DEFAULT_TERMS = [

    "1. Professional fees are exclusive of court fees, government fees, stamp duty, registration charges, applicable taxes and other statutory levies, which shall be charged separately, wherever applicable.",

    "2. All expenses towards documentation, photocopying, notarisation, certified copies, postal charges, process fees and other incidental or out-of-pocket expenses shall be borne separately by the Client.",

    "3. Fees for court appearances, additional proceedings, appeals, execution proceedings or any other legal services not specifically covered under this invoice shall be charged separately.",

    "4. Professional fees earned for services rendered shall be non-refundable. Voluntary withdrawal of proceedings, change of advocate, discontinuation of legal services by the Client or settlement between the parties shall not, by itself, constitute grounds for a refund.",

    "5. Professional fees are payable as mutually agreed. Engagement of legal services does not constitute any assurance or guarantee of a favourable outcome in any legal proceeding."

].join("\n\n");

/* =========================================================
   DATE UTILITIES
   ========================================================= */

function today() {

    const date = new Date();

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");

}

function formatDate(date) {

    if (!date) return "—";

    return /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date.split("-").reverse().join("/")
        : date;

}


/* =========================================================
   APPLICATION MESSAGES
   ========================================================= */

function message(text, type = "success") {

    const element = $("appMessage");

    element.className = `app-message no-print ${type}`;

    element.textContent = text;

    element.hidden = false;

}

function handleError(error) {

    message(
        error?.message || "An unexpected error occurred.",
        "error"
    );

}

function safeAction(action) {

    return async event => {

        try {

            await action(event);

        } catch (error) {

            handleError(error);

        }

    };

}


/* =========================================================
   CONFIRMATION DIALOG
   ========================================================= */

function confirmAction(title, text) {

    const dialog = $("confirmationDialog");

    if (!dialog.showModal) {
        return Promise.resolve(window.confirm(text));
    }

    return new Promise(resolve => {

        display("confirmationTitle", title);
        display("confirmationMessage", text);

        dialog.returnValue = "cancel";

        $("acceptConfirmation").onclick = () => {
            dialog.close("confirm");
        };

        $("cancelConfirmation").onclick = () => {
            dialog.close("cancel");
        };

        dialog.addEventListener(
            "close",
            () => resolve(dialog.returnValue === "confirm"),
            { once: true }
        );

        dialog.showModal();

    });

}

async function allowDiscard() {

    if (!dirty) return true;

    return confirmAction(
        "Discard unsaved changes?",
        "Your current unsaved changes will be lost."
    );

}


/* =========================================================
   ADD LEGACY FIELDS TO THE NEW HTML
   ========================================================= */

function insertLegacyFields() {

    const paid = $("amountPaid");

    paid.previousElementSibling.textContent =
        "Received Now (₹)";

    const earlierGroup = document.createElement("div");

    earlierGroup.className = "form-group";

    earlierGroup.innerHTML = `
        <label for="receivedEarlier">
            Received Earlier (₹)
        </label>
        <input type="number"
               id="receivedEarlier"
               min="0"
               step="0.01"
               value="0">
    `;

    paid.closest(".form-group").before(earlierGroup);

    const referenceGroup = document.createElement("div");

    referenceGroup.className = "form-group full-width";

    referenceGroup.innerHTML = `
        <label for="previousBillNo">
            Previous Bill / Reference Number
        </label>
        <input type="text"
               id="previousBillNo"
               maxlength="200"
               placeholder="Optional previous invoice reference">
    `;

    $("matterReference")
        .closest(".form-group")
        .after(referenceGroup);

    const earlierLine = document.createElement("div");

    earlierLine.className = "total-line";

    earlierLine.innerHTML = `
        <span>Received Earlier</span>
        <strong id="previewEarlier">₹0.00</strong>
    `;

    const receivedLine = $("previewPaid").parentElement;

    receivedLine.querySelector("span").textContent =
        "Received Now";

    receivedLine.before(earlierLine);

}


/* =========================================================
   FEE PARTICULARS
   ========================================================= */

function addItem(item = {}) {

    const fragment = $("invoiceItemTemplate")
        .content.cloneNode(true);

    const row = fragment.querySelector("tr");

    row.querySelector(".item-description").value =
        item.description ?? item.particular ?? "";

    row.querySelector(".item-quantity").value =
        item.quantity ?? item.qty ?? 1;

    row.querySelector(".item-rate").value =
        item.rate ?? 0;

    row.querySelector(".remove-item-button")
        .addEventListener("click", safeAction(() => {

            if ($("itemsBody").rows.length <= 1) {

                message(
                    "At least one fee particular is required.",
                    "warning"
                );

                return;

            }

            row.remove();

            dirty = true;

            updatePreview();

        }));

    $("itemsBody").appendChild(fragment);

}

function collectItems() {

    return Array.from($("itemsBody").rows).map(row => ({
        description: row.querySelector(
            ".item-description"
        ).value.trim(),

        quantity: numeric(
            row.querySelector(".item-quantity").value
        ),

        rate: numeric(
            row.querySelector(".item-rate").value
        )
    }));

}


/* =========================================================
   FINANCIAL CALCULATIONS
   All monetary totals calculated in integer paise.
   ========================================================= */

function calculate(data) {

    const lines = data.items.map(item => {

        const quantity = numeric(item.quantity);

        const rate = paise(item.rate);

        const amount = Math.round(quantity * rate);

        if (!Number.isSafeInteger(amount)) {
            throw new Error("Fee amount exceeds supported limit.");
        }

        return {
            ...item,
            amount
        };

    });

    const subtotal = lines.reduce(
        (sum, item) => sum + item.amount,
        0
    );

    const discount = paise(data.discountAmount);

    const earlier = paise(data.receivedEarlier);

    const now = paise(data.receivedNow);

    const total = Math.max(0, subtotal - discount);

    const paid = earlier + now;

    const balance = Math.max(0, total - paid);

    if (
        !Number.isSafeInteger(subtotal) ||
        !Number.isSafeInteger(paid)
    ) {
        throw new Error("Total exceeds supported limit.");
    }

    const status = paid >= total
        ? "paid"
        : paid > 0
            ? "partial"
            : "unpaid";

    return {
        lines,
        subtotal,
        discount,
        total,
        earlier,
        now,
        paid,
        balance,
        status
    };

}


/* =========================================================
   INDIAN AMOUNT IN WORDS
   ========================================================= */

function numberWords(number) {

    const ones = [
        "Zero", "One", "Two", "Three", "Four",
        "Five", "Six", "Seven", "Eight", "Nine",
        "Ten", "Eleven", "Twelve", "Thirteen",
        "Fourteen", "Fifteen", "Sixteen",
        "Seventeen", "Eighteen", "Nineteen"
    ];

    const tens = [
        "", "", "Twenty", "Thirty", "Forty",
        "Fifty", "Sixty", "Seventy",
        "Eighty", "Ninety"
    ];

    if (number < 20) return ones[number];

    if (number < 100) {

        return tens[Math.floor(number / 10)] +
            (number % 10
                ? " " + ones[number % 10]
                : "");

    }

    const units = [
        [10000000, "Crore"],
        [100000, "Lakh"],
        [1000, "Thousand"],
        [100, "Hundred"]
    ];

    for (const [divisor, label] of units) {

        if (number >= divisor) {

            const remainder = number % divisor;

            return numberWords(
                Math.floor(number / divisor)
            ) + " " + label +
                (remainder
                    ? " " + numberWords(remainder)
                    : "");

        }

    }

    return "Zero";

}

function amountInWords(amountPaise) {

    const rupees = Math.floor(amountPaise / 100);

    const remainder = amountPaise % 100;

    return "Indian Rupees " +
        numberWords(rupees) +
        (remainder
            ? " and " + numberWords(remainder) + " Paise"
            : "") +
        " Only";

}


/* =========================================================
   COLLECT CURRENT INVOICE
   ========================================================= */

function collectInvoice() {

    return {

        id: editingId || crypto.randomUUID(),

        invoiceNo: value("invoiceNumber"),

        invoiceDate: value("invoiceDate"),

        dueDate: value("dueDate"),

        issuedBy: value("issuedBy"),

        matterReference: value("matterReference").trim(),

        previousBillNo: value("previousBillNo").trim(),

        clientName: value("clientName").trim(),

        clientPhone: value("clientPhone").trim(),

        clientEmail: value("clientEmail").trim(),

        clientAddress: value("clientAddress").trim(),

        clientGSTIN: value("clientGSTIN")
            .trim().toUpperCase(),

        items: collectItems(),

        discountAmount: numeric(value("discountAmount")),

        receivedEarlier: numeric(value("receivedEarlier")),

        receivedNow: numeric(value("amountPaid")),

        paymentMode: value("paymentMode"),

        paymentReference: value("paymentReference").trim(),

        notes: value("invoiceNotes").trim(),

        terms: value("invoiceTerms").trim(),

        showPaymentDetails: $("showPaymentDetails").checked,

        showSignature: $("showSignature").checked

    };

}


/* =========================================================
   LIVE INVOICE PREVIEW
   ========================================================= */

function updatePreview() {

    const data = collectInvoice();

    const totals = calculate(data);

    Array.from($("itemsBody").rows).forEach((row, index) => {

        row.querySelector(".item-amount").textContent =
            money(totals.lines[index].amount / 100);

    });

    const outputs = {

        subtotalDisplay: totals.subtotal,

        discountDisplay: totals.discount,

        grandTotalDisplay: totals.total,

        paidDisplay: totals.paid,

        balanceDisplay: totals.balance,

        previewSubtotal: totals.subtotal,

        previewDiscount: totals.discount,

        previewGrandTotal: totals.total,

        previewEarlier: totals.earlier,

        previewPaid: totals.now,

        previewBalance: totals.balance

    };

    for (const [id, amount] of Object.entries(outputs)) {

        display(id, money(amount / 100));

    }

    set("paymentStatus", statusLabels[totals.status]);

    display(
        "previewPaymentStatus",
        statusLabels[totals.status].toUpperCase()
    );

    $("previewPaymentStatus").className =
        `payment-status ${totals.status}`;

    display("previewInvoiceNumber", data.invoiceNo);

    display(
        "previewInvoiceDate",
        formatDate(data.invoiceDate)
    );

    display(
        "previewDueDate",
        formatDate(data.dueDate)
    );

    show("previewDueDateRow", Boolean(data.dueDate));

    display("previewIssuedBy", data.issuedBy);

    display(
        "previewMatterReference",
        [
            data.matterReference,
            data.previousBillNo
                ? "Previous Bill: " + data.previousBillNo
                : ""
        ].filter(Boolean).join("\n")
    );

    display(
        "previewClientName",
        data.clientName || "Client Name"
    );

    display("previewClientAddress", data.clientAddress);

    display("previewClientPhone", data.clientPhone);

    display("previewClientEmail", data.clientEmail);

    display(
        "previewClientGSTIN",
        data.clientGSTIN
            ? "GSTIN: " + data.clientGSTIN
            : ""
    );

    const tbody = $("previewItemsBody");

    tbody.replaceChildren();

    totals.lines.forEach((item, index) => {

        const row = document.createElement("tr");

        const cells = [
            index + 1,
            item.description || "Professional Services",
            item.quantity,
            money(item.rate),
            money(item.amount / 100)
        ];

        for (const text of cells) {

            const cell = document.createElement("td");

            cell.textContent = text;

            row.appendChild(cell);

        }

        tbody.appendChild(row);

    });

    display(
        "previewAmountWords",
        amountInWords(totals.total)
    );

    display(
        "previewPaymentMode",
        data.paymentMode
            ? "Payment Mode: " + data.paymentMode
            : ""
    );

    display(
        "previewPaymentReference",
        data.paymentReference
            ? "Reference: " + data.paymentReference
            : ""
    );

    show(
        "previewPaymentRecord",
        Boolean(data.paymentMode || data.paymentReference)
    );

    display("previewNotes", data.notes);

    show("previewNotesSection", Boolean(data.notes));

    display("previewTerms", data.terms);

    show("previewTermsSection", Boolean(data.terms));

    show("previewSignatureSection", data.showSignature);

    renderPaymentDetails(data.showPaymentDetails);

    return totals;

}


/* =========================================================
   FIRM PAYMENT DETAILS
   ========================================================= */

const paymentFields = {

    firmAccountName: ["accountName", "previewAccountName", "Account Holder"],

    firmBankName: ["bankName", "previewBankName", "Bank"],

    firmAccountNumber: ["accountNumber", "previewAccountNumber", "Account No."],

    firmIFSC: ["ifsc", "previewIFSC", "IFSC"],

    firmUPI: ["upi", "previewUPI", "UPI ID"]

};

function renderPaymentDetails(visible) {

    let hasDetails = false;

    for (const [, [key, previewId, label]]
        of Object.entries(paymentFields)) {

        const text = paymentSettings[key] || "";

        if (text) hasDetails = true;

        display(
            previewId,
            text ? `${label}: ${text}` : ""
        );

    }

    show(
        "previewPaymentDetails",
        visible && hasDetails
    );

}

function loadPaymentSettings() {

    paymentSettings = readPaymentSettings();

    for (const [id, [key]]
        of Object.entries(paymentFields)) {

        set(id, paymentSettings[key] || "");

    }

}

function savePaymentSettings(event) {

    event.preventDefault();

    const settings = {};

    for (const [id, [key]]
        of Object.entries(paymentFields)) {

        settings[key] = value(id).trim();

    }

    settings.ifsc = settings.ifsc.toUpperCase();

    if (
        settings.ifsc &&
        !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(settings.ifsc)
    ) {
        throw new Error("Please enter a valid IFSC code.");
    }

    localStorage.setItem(
        KEYS.payment,
        JSON.stringify(settings)
    );

    paymentSettings = settings;

    updatePreview();

    message("Firm payment details saved successfully.");

}


/* =========================================================
   INVOICE VALIDATION
   ========================================================= */

function validateInvoice() {

    if (!$("invoiceForm").reportValidity()) {

        throw new Error(
            "Please complete the required invoice fields."
        );

    }

    const data = collectInvoice();

    const totals = calculate(data);

    if (!data.clientName) {
        throw new Error("Please enter the client name.");
    }

    if (!data.invoiceDate) {
        throw new Error("Please select the invoice date.");
    }

    if (
        data.dueDate &&
        data.dueDate < data.invoiceDate
    ) {
        throw new Error(
            "Due date cannot precede invoice date."
        );
    }

    if (
        !data.items.length ||
        data.items.some(item =>
            !item.description || item.quantity <= 0
        )
    ) {
        throw new Error(
            "Please enter valid fee particulars."
        );
    }

    if (totals.subtotal <= 0) {
        throw new Error(
            "Invoice amount must be greater than zero."
        );
    }

    if (totals.discount > totals.subtotal) {
        throw new Error(
            "Discount cannot exceed the subtotal."
        );
    }

    if (totals.paid > totals.total) {
        throw new Error(
            "Total payments exceed the invoice amount. " +
            "Please verify the payment entries."
        );
    }

    if (
        data.clientGSTIN &&
        !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
            .test(data.clientGSTIN)
    ) {
        throw new Error("Please verify the GSTIN format.");
    }

    return data;

}


/* =========================================================
   STORAGE WRITE LOCK
   Prevent simultaneous writes across supported browser tabs.
   ========================================================= */

async function withStorageLock(action) {

    if (!navigator.locks?.request) {

        throw new Error(
            "This browser does not support safe invoice " +
            "write locking. Please use an updated browser."
        );

    }

    return navigator.locks.request(
        "mnm-invoice-storage-v3",
        { mode: "exclusive" },
        action
    );

}


/* =========================================================
   SAVE INVOICE
   ========================================================= */

async function saveInvoice(event) {

    event.preventDefault();

    const button = $("saveInvoiceButton");

    button.disabled = true;

    try {

        const data = validateInvoice();

        await withStorageLock(() => {

            const records = readInvoices();

            const isEditing = editingId !== null;

            let index = -1;

            if (isEditing) {

                index = records.findIndex(
                    record => String(record.id) === editingId
                );

                if (index < 0) {
                    throw new Error(
                        "This invoice no longer exists."
                    );
                }

                if (
                    JSON.stringify(records[index]) !==
                    loadedSnapshot
                ) {
                    throw new Error(
                        "This invoice was changed elsewhere. " +
                        "Please reopen it before saving."
                    );
                }

                data.invoiceNo = records[index].invoiceNo;

                data.id = records[index].id;

            } else {

                const sequence = nextSequence(records);

                data.invoiceNo = invoiceNumber(
                    sequence,
                    data.invoiceDate
                );

            }

            if (records.some(record =>
                record.invoiceNo === data.invoiceNo &&
                String(record.id) !== String(data.id)
            )) {
                throw new Error(
                    "Duplicate invoice number detected."
                );
            }

            const saved = {

                ...(isEditing ? records[index] : {}),

                ...data,

                schemaVersion: 3,

                clientMobile: data.clientPhone,

                amountPaid:
                    data.receivedEarlier + data.receivedNow,

                items: data.items.map(item => ({
                    ...item,
                    particular: item.description,
                    qty: item.quantity
                })),

                createdAt:
                    (isEditing && records[index].createdAt) ||
                    new Date().toISOString(),

                updatedAt: new Date().toISOString()

            };

            if (isEditing) {

                records[index] = saved;

            } else {

                records.push(saved);

            }

            /*
             * Write invoice first.
             * Sequence can be recovered from saved numbers
             * if updating the sequence key fails.
             */

            localStorage.setItem(
                KEYS.invoices,
                JSON.stringify(records)
            );

            editingId = String(saved.id);

            originalRecord = saved;

            loadedSnapshot = JSON.stringify(saved);

            set("editingInvoiceId", editingId);

            set("invoiceNumber", saved.invoiceNo);

            dirty = false;

            if (!isEditing) {

                try {

                    localStorage.setItem(
                        KEYS.sequence,
                        String(nextSequence(records))
                    );

                } catch {

                    message(
                        "Invoice saved. Sequence storage " +
                        "could not be updated; it will be " +
                        "recovered from saved invoice numbers.",
                        "warning"
                    );

                }

            }

        });

        display("saveInvoiceButton", "Update Invoice");

        updatePreview();

        refreshRecords();

        message(
            "Invoice " + value("invoiceNumber") +
            " saved successfully."
        );

    } finally {

        button.disabled = false;

    }

}


/* =========================================================
   NEW INVOICE & RESET
   ========================================================= */

function resetForm() {

    editingId = null;

    originalRecord = null;

    loadedSnapshot = null;

    $("invoiceForm").reset();

    set("editingInvoiceId", "");

    set("invoiceDate", today());

    set(
        "invoiceNumber",
        invoiceNumber(nextSequence(), today())
    );

    set("dueDate", "");

    set("receivedEarlier", 0);

    set("amountPaid", 0);

    set("discountAmount", 0);

    set("invoiceTerms", DEFAULT_TERMS);

    $("itemsBody").replaceChildren();

    addItem();

    display("saveInvoiceButton", "Save Invoice");

    dirty = false;

    updatePreview();

}

async function newInvoice() {

    if (!(await allowDiscard())) return;

    resetForm();

    activateTab("create");

    window.scrollTo({ top: 0, behavior: "smooth" });

}


/* =========================================================
   OPEN EXISTING INVOICE
   ========================================================= */

async function loadInvoice(id) {

    if (!(await allowDiscard())) return false;

    const record = readInvoices().find(
        item => String(item.id) === String(id)
    );

    if (!record) {
        throw new Error("Invoice could not be found.");
    }

    const data = normalize(record);

    originalRecord = record;

    editingId = String(record.id);

    loadedSnapshot = JSON.stringify(record);

    set("editingInvoiceId", editingId);

    set("invoiceNumber", data.invoiceNo);

    set("invoiceDate", data.invoiceDate);

    set("dueDate", data.dueDate);

    set("issuedBy", data.issuedBy);

    set("matterReference", data.matterReference);

    set("previousBillNo", data.previousBillNo);

    set("clientName", data.clientName);

    set("clientPhone", data.clientPhone);

    set("clientEmail", data.clientEmail);

    set("clientAddress", data.clientAddress);

    set("clientGSTIN", data.clientGSTIN);

    set("discountAmount", data.discountAmount);

    set("receivedEarlier", data.receivedEarlier);

    set("amountPaid", data.receivedNow);

    set("paymentMode", data.paymentMode);

    set("paymentReference", data.paymentReference);

    set("invoiceNotes", data.notes);

    set("invoiceTerms", data.terms);

    $("showPaymentDetails").checked =
        data.showPaymentDetails;

    $("showSignature").checked =
        data.showSignature;

    $("itemsBody").replaceChildren();

    data.items.forEach(addItem);

    if (!data.items.length) addItem();

    display("saveInvoiceButton", "Update Invoice");

    dirty = false;

    activateTab("create");

    updatePreview();

    window.scrollTo({ top: 0, behavior: "smooth" });

    return true;

}


/* =========================================================
   DELETE SAVED INVOICE
   Deleted invoice numbers are not intentionally reused.
   ========================================================= */

async function deleteInvoice(id) {

    const confirmed = await confirmAction(
        "Delete saved invoice?",
        "This permanently removes the selected local invoice. " +
        "Its invoice number will not be reused."
    );

    if (!confirmed) return;

    await withStorageLock(() => {

        const records = readInvoices();

        const sequence = nextSequence(records);

        const remaining = records.filter(
            record => String(record.id) !== String(id)
        );

        localStorage.setItem(
            KEYS.sequence,
            String(sequence)
        );

        localStorage.setItem(
            KEYS.invoices,
            JSON.stringify(remaining)
        );

    });

    if (editingId === String(id)) {
        resetForm();
    }

    refreshRecords();

    message("Selected invoice deleted.");

}


/* =========================================================
   SAVED INVOICE TABLE
   ========================================================= */

function actionButton(label, callback, extraClass = "") {

    const button = document.createElement("button");

    button.type = "button";

    button.className =
        `action-button ${extraClass}`;

    button.textContent = label;

    button.addEventListener(
        "click",
        safeAction(callback)
    );

    return button;

}

function filteredInvoices() {

    const query = value("invoiceSearch")
        .trim().toLowerCase();

    const status = value("statusFilter");

    const year = value("yearFilter");

    const sort = value("sortInvoices");

    const records = readInvoices().map(record => {

        const data = normalize(record);

        return {
            data,
            totals: calculate(data)
        };

    });

    const filtered = records.filter(({ data, totals }) => {

        const searchText = [
            data.invoiceNo,
            data.clientName,
            data.clientPhone,
            data.matterReference,
            data.previousBillNo
        ].join(" ").toLowerCase();

        return (
            (!query || searchText.includes(query)) &&
            (status === "all" || totals.status === status) &&
            (
                year === "all" ||
                data.invoiceDate.slice(0, 4) === year
            )
        );

    });

    filtered.sort((a, b) => {

        if (sort === "amount-high") {
            return b.totals.total - a.totals.total;
        }

        if (sort === "amount-low") {
            return a.totals.total - b.totals.total;
        }

        if (sort === "oldest") {
            return a.data.invoiceDate.localeCompare(
                b.data.invoiceDate
            );
        }

        return b.data.invoiceDate.localeCompare(
            a.data.invoiceDate
        );

    });

    return filtered;

}

function renderSavedInvoices() {

    const records = filteredInvoices();

    const tbody = $("savedInvoicesBody");

    tbody.replaceChildren();

    for (const { data, totals } of records) {

        const row = document.createElement("tr");

        const values = [

            data.invoiceNo,

            formatDate(data.invoiceDate),

            data.clientName,

            money(totals.total / 100),

            money(totals.paid / 100),

            money(totals.balance / 100)

        ];

        for (const text of values) {

            const cell = document.createElement("td");

            cell.textContent = text;

            row.appendChild(cell);

        }

        const statusCell = document.createElement("td");

        const badge = document.createElement("span");

        badge.className =
            `status-badge ${totals.status}`;

        badge.textContent = statusLabels[totals.status];

        statusCell.appendChild(badge);

        row.appendChild(statusCell);

        const actionsCell = document.createElement("td");

        const actions = document.createElement("div");

        actions.className = "invoice-actions";

        actions.append(

            actionButton(
                "Edit",
                () => loadInvoice(data.id)
            ),

            actionButton(
                "Print",
                async () => {

                    if (await loadInvoice(data.id)) {
                        await printInvoice();
                    }

                }
            ),

            actionButton(
                "Delete",
                () => deleteInvoice(data.id),
                "delete"
            )

        );

        actionsCell.appendChild(actions);

        row.appendChild(actionsCell);

        tbody.appendChild(row);

    }

    show("emptyInvoices", records.length === 0);

    display(
        "invoiceResultCount",
        `${records.length} invoice(s) found`
    );

}


/* =========================================================
   FINANCIAL SUMMARY
   ========================================================= */

function refreshRecords() {

    const records = readInvoices();

    let billed = 0;

    let received = 0;

    let outstanding = 0;

    const years = new Set();

    for (const record of records) {

        const data = normalize(record);

        const totals = calculate(data);

        billed += totals.total;

        received += totals.paid;

        outstanding += totals.balance;

        if (data.invoiceDate) {
            years.add(data.invoiceDate.slice(0, 4));
        }

    }

    display("totalInvoices", records.length);

    display("totalBilled", money(billed / 100));

    display("totalReceived", money(received / 100));

    display("totalOutstanding", money(outstanding / 100));

    display("storageInvoiceCount", records.length);

    set("currentSequence", nextSequence(records));

    set(
        "numberingFormat",
        "MNM/NNN/YYYY"
    );

    const yearFilter = $("yearFilter");

    const selected = yearFilter.value;

    yearFilter.replaceChildren(
        new Option("All Years", "all")
    );

    [...years].sort().reverse().forEach(year => {

        yearFilter.add(new Option(year, year));

    });

    yearFilter.value = years.has(selected)
        ? selected
        : "all";

    renderSavedInvoices();

}


/* =========================================================
   TAB NAVIGATION
   ========================================================= */

function activateTab(name) {

    for (const tab of ["create", "saved", "settings"]) {

        const active = tab === name;

        $(tab + "Tab").classList.toggle("active", active);

        $(tab + "Tab").setAttribute(
            "aria-selected",
            String(active)
        );

        $(tab + "Tab").tabIndex = active ? 0 : -1;

        show(tab + "Panel", active);

    }

    if (name === "saved") {
        refreshRecords();
    }

    if (name === "settings") {

        set("currentSequence", nextSequence());

        display(
            "storageInvoiceCount",
            readInvoices().length
        );

    }

}


/* =========================================================
   PRINT & SAVE PDF
   Unsaved invoices must be saved before official printing.
   ========================================================= */

async function printInvoice() {

    if (!editingId || dirty) {

        message(
            "Please save the invoice before printing.",
            "warning"
        );

        return;

    }

    const current = readInvoices().find(
        record => String(record.id) === editingId
    );

    if (
        !current ||
        JSON.stringify(current) !== loadedSnapshot
    ) {

        throw new Error(
            "Invoice has changed. Reopen it before printing."
        );

    }

    activateTab("create");

    updatePreview();

    if (document.fonts?.ready) {
        await document.fonts.ready;
    }

    const images = $("invoicePreview")
        .querySelectorAll("img");

    await Promise.all(
        Array.from(images).map(image =>
            image.decode
                ? image.decode().catch(() => {})
                : Promise.resolve()
        )
    );

    const oldTitle = document.title;

    document.title =
        value("invoiceNumber").replaceAll("/", "-");

    try {

        window.print();

    } finally {

        document.title = oldTitle;

    }

}


/* =========================================================
   FILE DOWNLOAD UTILITY
   ========================================================= */

function downloadFile(content, filename, type) {

    const blob = new Blob([content], { type });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download = filename;

    document.body.appendChild(link);

    link.click();

    link.remove();

    setTimeout(
        () => URL.revokeObjectURL(url),
        1000
    );

}


/* =========================================================
   CSV EXPORT
   Protect against spreadsheet formula injection.
   ========================================================= */

function csvCell(input) {

    let text = String(input ?? "");

    if (/^[\s]*[=+\-@]/.test(text)) {
        text = "'" + text;
    }

    return '"' + text.replaceAll('"', '""') + '"';

}

function exportCSV() {

    const rows = [[

        "Invoice Number",
        "Invoice Date",
        "Client Name",
        "Total Amount",
        "Received Earlier",
        "Received Now",
        "Total Received",
        "Balance Due",
        "Payment Status"

    ]];

    for (const { data, totals } of filteredInvoices()) {

        rows.push([

            data.invoiceNo,

            data.invoiceDate,

            data.clientName,

            (totals.total / 100).toFixed(2),

            (totals.earlier / 100).toFixed(2),

            (totals.now / 100).toFixed(2),

            (totals.paid / 100).toFixed(2),

            (totals.balance / 100).toFixed(2),

            statusLabels[totals.status]

        ]);

    }

    const csv = "\uFEFF" + rows.map(
        row => row.map(csvCell).join(",")
    ).join("\r\n");

    downloadFile(
        csv,
        `MNM-Invoices-${today()}.csv`,
        "text/csv;charset=utf-8"
    );

    message("CSV export requested.");

}


/* =========================================================
   OPTIONAL BACKUP DOWNLOAD
   ========================================================= */

function downloadBackup() {

    const data = {};

    for (const key of Object.values(KEYS)) {

        data[key] = localStorage.getItem(key);

    }

    const backup = {

        firm: "MNM Legal Associates",

        backupVersion: 3,

        backupDate: new Date().toISOString(),

        source: location.origin,

        data

    };

    downloadFile(

        JSON.stringify(backup, null, 2),

        `MNM-Invoice-Backup-${today()}.json`,

        "application/json"

    );

    message(
        "Backup download requested. " +
        "Keep the file confidential."
    );

}


/* =========================================================
   BACKUP IMPORT
   Merge only. Existing records are never replaced.
   ========================================================= */

async function importBackup(event) {

    const file = event.target.files[0];

    event.target.value = "";

    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {

        throw new Error("Backup file is too large.");

    }

    const backup = JSON.parse(await file.text());

    if (
        backup.firm !== "MNM Legal Associates" ||
        !backup.data ||
        ![1, 3].includes(backup.backupVersion)
    ) {

        throw new Error("Unsupported backup file.");

    }

    const raw = backup.data[KEYS.invoices];

    const imported = raw == null ? [] : JSON.parse(raw);

    if (!Array.isArray(imported)) {

        throw new Error("Invalid invoice backup.");

    }

    for (const record of imported) {

        if (
            !record ||
            record.id == null ||
            typeof record.invoiceNo !== "string" ||
            !record.invoiceNo.trim() ||
            !Array.isArray(record.items)
        ) {

            throw new Error(
                "Backup contains invalid invoice records."
            );

        }

        calculate(normalize(record));

    }

    const confirmed = await confirmAction(

        "Import invoice backup?",

        `Merge ${imported.length} invoice record(s)? ` +
        "Existing records will not be overwritten. " +
        "Conflicting records will be skipped."

    );

    if (!confirmed) return;

    let added = 0;

    let skipped = 0;

    await withStorageLock(() => {

        const records = readInvoices();

        const ids = new Set(
            records.map(record => String(record.id))
        );

        const numbers = new Set(
            records.map(record => record.invoiceNo)
        );

        for (const record of imported) {

            if (
                ids.has(String(record.id)) ||
                numbers.has(record.invoiceNo)
            ) {

                skipped++;

                continue;

            }

            records.push(record);

            ids.add(String(record.id));

            numbers.add(record.invoiceNo);

            added++;

        }

        let sequence = nextSequence(records);

        const backupSequence =
            backup.data[KEYS.sequence];

        if (backupSequence != null) {

            const number = Number(backupSequence);

            if (
                !Number.isSafeInteger(number) ||
                number < 1
            ) {

                throw new Error(
                    "Backup sequence is invalid."
                );

            }

            sequence = Math.max(sequence, number);

        }

        localStorage.setItem(
            KEYS.sequence,
            String(sequence)
        );

        localStorage.setItem(
            KEYS.invoices,
            JSON.stringify(records)
        );

    });

    refreshRecords();

    if (!editingId) {

        set(
            "invoiceNumber",
            invoiceNumber(
                nextSequence(),
                value("invoiceDate")
            )
        );

        updatePreview();

    }

    message(
        `Import complete. Added: ${added}. ` +
        `Skipped: ${skipped}.`
    );

}


/* =========================================================
   EVENT HANDLERS
   ========================================================= */

function bindEvents() {

    $("invoiceForm").addEventListener(
        "submit",
        safeAction(saveInvoice)
    );

    $("invoiceForm").addEventListener(
        "input",
        safeAction(event => {

            dirty = true;

            if (
                event.target.id === "invoiceDate" &&
                !editingId
            ) {

                set(
                    "invoiceNumber",
                    invoiceNumber(
                        nextSequence(),
                        value("invoiceDate")
                    )
                );

            }

            updatePreview();

        })
    );

    $("addItemButton").addEventListener(
        "click",
        safeAction(() => {

            addItem();

            dirty = true;

            updatePreview();

        })
    );

    $("newInvoiceButton").addEventListener(
        "click",
        safeAction(newInvoice)
    );

    $("resetInvoiceButton").addEventListener(
        "click",
        safeAction(newInvoice)
    );

    for (const id of [
        "printInvoiceButton",
        "previewPrintButton"
    ]) {

        $(id).addEventListener(
            "click",
            safeAction(printInvoice)
        );

    }

    for (const name of ["create", "saved", "settings"]) {

        $(name + "Tab").addEventListener(
            "click",
            safeAction(() => activateTab(name))
        );

    }

    const tabNames = ["create", "saved", "settings"];

    tabNames.forEach((name, index) => {

        $(name + "Tab").addEventListener(
            "keydown",
            safeAction(event => {

                let next;

                if (event.key === "ArrowRight") {
                    next = (index + 1) % tabNames.length;
                } else if (event.key === "ArrowLeft") {
                    next = (index + 2) % tabNames.length;
                } else if (event.key === "Home") {
                    next = 0;
                } else if (event.key === "End") {
                    next = tabNames.length - 1;
                } else {
                    return;
                }

                event.preventDefault();

                activateTab(tabNames[next]);

                $(tabNames[next] + "Tab").focus();

            })
        );

    });

    $("invoiceSearch").addEventListener(
        "input",
        safeAction(renderSavedInvoices)
    );

    for (const id of [
        "statusFilter",
        "yearFilter",
        "sortInvoices"
    ]) {

        $(id).addEventListener(
            "change",
            safeAction(renderSavedInvoices)
        );

    }

    $("paymentSettingsForm").addEventListener(
        "submit",
        safeAction(savePaymentSettings)
    );

    $("exportCSVButton").addEventListener(
        "click",
        safeAction(exportCSV)
    );

    $("downloadBackupButton").addEventListener(
        "click",
        safeAction(downloadBackup)
    );

    $("restoreBackupButton").addEventListener(
        "click",
        () => $("backupFileInput").click()
    );

    $("backupFileInput").addEventListener(
        "change",
        safeAction(importBackup)
    );

    window.addEventListener(
        "beforeunload",
        event => {

            if (dirty) {

                event.preventDefault();

                event.returnValue = "";

            }

        }
    );

    window.addEventListener(
        "storage",
        safeAction(event => {

            if (
                event.key === KEYS.invoices ||
                event.key === KEYS.sequence
            ) {

                refreshRecords();

                if (!editingId) {

                    set(
                        "invoiceNumber",
                        invoiceNumber(
                            nextSequence(),
                            value("invoiceDate")
                        )
                    );

                    updatePreview();

                }

            }

            if (event.key === KEYS.payment) {

                loadPaymentSettings();

                updatePreview();

            }

        })
    );

}


/* =========================================================
   FIREBASE AUTHENTICATED INITIALIZATION
   Called from invoice.html after authentication.
   ========================================================= */

export async function initialiseInvoiceSystem(user) {

    if (!user || !user.uid) {

        throw new Error(
            "Authentication is required."
        );

    }

    if (initialized) return;

    /*
     * Verify existing data before enabling the application.
     * Initialization does not overwrite invoice storage.
     */

    const records = readInvoices();

    readSequence();

    records.forEach(record => {

        calculate(normalize(record));

    });

    insertLegacyFields();

    loadPaymentSettings();

    resetForm();

    bindEvents();

    refreshRecords();

    activateTab("create");

    initialized = true;

}


/* =========================================================
   END OF INVOICE MANAGEMENT SYSTEM
   MNM LEGAL ASSOCIATES
   Justice, Integrity & Excellence
   ========================================================= */
