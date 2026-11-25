

all














/* =========================================================
   MNM LEGAL ASSOCIATES
   PROFESSIONAL CLOUD INVOICE MANAGEMENT SYSTEM
   Version 8.0 - Client Resolution and Invoice History
   Justice, Integrity & Excellence
   ========================================================= */

import {
    createCloudInvoice,
    syncNewInvoiceReceipt,
    updateCloudInvoice,
    fetchCentralInvoices,
    getCentralPaymentSettings,
    saveCentralPaymentSettings,
    cancelCloudInvoice,
    fetchMonthlySequences,
    formatMonthlyInvoiceNumber,
    getBillingPeriod,
    getIndianDate
} from "./invoice-cloud.js";

/* APPLICATION STATE */

let cloudRecords = [];
let cloudMonthlySequences = {};
let cloudPaymentSettings = {};
let pendingCreateId = null;
let cloudSaving = false;
let initialized = false;
let editingId = null;
let originalRecord = null;
let paymentSettings = {};
let dirty = false;
let loadedSnapshot = null;
let syncPromise = null;

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

/* =========================================================
   CLOUD SYNCHRONIZATION
   ========================================================= */

async function syncCloudData() {

    if (syncPromise) return syncPromise;

    syncPromise = (async () => {

        const [records, sequences, settings] =
            await Promise.all([
                fetchCentralInvoices(),
                fetchMonthlySequences(),
                getCentralPaymentSettings()
            ]);

        if (!Array.isArray(records)) {
            throw new Error("Invalid cloud invoice records.");
        }

        if (!Array.isArray(sequences)) {
            throw new Error("Invalid monthly invoice counters.");
        }

        const monthlyCounters = {};

        for (const counter of sequences) {

            if (
                !/^\d{4}-(0[1-9]|1[0-2])$/.test(counter.monthId) ||
                !Number.isSafeInteger(counter.nextSequence) ||
                counter.nextSequence < 1 ||
                counter.nextSequence >= Number.MAX_SAFE_INTEGER
            ) {
                throw new Error("Invalid monthly invoice counter.");
            }

            monthlyCounters[counter.monthId] =
                counter.nextSequence;
        }

        const ids = new Set();
        const numbers = new Set();

        for (const record of records) {

            if (
                !record ||
                !record.id ||
                typeof record.invoiceNo !== "string" ||
                !Array.isArray(record.items)
            ) {
                throw new Error("Invalid cloud invoice record.");
            }

            if (
                ids.has(String(record.id)) ||
                numbers.has(record.invoiceNo)
            ) {
                throw new Error("Duplicate cloud invoice detected.");
            }

            ids.add(String(record.id));
            numbers.add(record.invoiceNo);

            calculate(normalize(record));
        }

        if (cloudSaving) return;

        cloudRecords = records;
        cloudMonthlySequences = monthlyCounters;
        cloudPaymentSettings = settings || {};

    })();

    try {
        await syncPromise;
    } finally {
        syncPromise = null;
    }
}

/* =========================================================
   NUMERICAL UTILITIES
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

/* =========================================================
   MONTHLY INVOICE NUMBERING
   Format: MNM/NOV/001/2026
   ========================================================= */

function readInvoices() {

    return cloudRecords.filter(
        record => record.recordStatus !== "cancelled"
    );
}

function readSequence(date = value("invoiceDate") || today()) {

    const period = getBillingPeriod(date);

    return cloudMonthlySequences[period.monthId] || 1;
}

function nextSequence(date = value("invoiceDate") || today()) {

    const period = getBillingPeriod(date);

    let sequence = readSequence(date);
    let legacyCount = 0;

    for (const record of cloudRecords) {

        if (
            !record.invoiceDate ||
            record.invoiceDate.slice(0, 7) !== period.monthId
        ) {
            continue;
        }

        const monthlyMatch = String(record.invoiceNo).match(
            /^MNM\/([A-Z]{3})\/(\d+)\/(\d{4})$/
        );

        const legacyMatch = String(record.invoiceNo).match(
            /^MNM\/(\d+)\/\d{4}$/
        );

        if (monthlyMatch) {

            if (
                monthlyMatch[1] !== period.abbreviation ||
                monthlyMatch[3] !== period.year
            ) {
                throw new Error("Invoice billing period mismatch.");
            }

            const number = Number(monthlyMatch[2]);

            if (
                !Number.isSafeInteger(number) ||
                number < 1
            ) {
                throw new Error("Invalid invoice sequence.");
            }

            sequence = Math.max(sequence, number + 1);

        } else if (legacyMatch) {

            legacyCount++;

        } else {

            throw new Error("Unsupported invoice number.");
        }
    }

    sequence = Math.max(sequence, legacyCount + 1);

    if (
        !Number.isSafeInteger(sequence) ||
        sequence >= Number.MAX_SAFE_INTEGER
    ) {
        throw new Error("Invalid monthly invoice sequence.");
    }

    return sequence;
}

function invoiceNumber(sequence, date) {

    if (!date) return "";

    return formatMonthlyInvoiceNumber(sequence, date);
}

function refreshDraftNumber() {

    if (editingId) return;

    const date = value("invoiceDate");

    set(
        "invoiceNumber",
        date ? invoiceNumber(nextSequence(date), date) : ""
    );
}

function readPaymentSettings() {
    return cloudPaymentSettings;
}

/* =========================================================
   DEFAULT TERMS AND CONDITIONS
   ========================================================= */

const DEFAULT_TERMS = [

    "1. Professional fees are exclusive of court fees, government fees, stamp duty, registration charges, applicable taxes and other statutory levies, which shall be charged separately, wherever applicable.",

    "2. All expenses towards documentation, photocopying, notarisation, certified copies, postal charges, process fees and other incidental or out-of-pocket expenses shall be borne separately by the Client.",

    "3. Fees for court appearances, additional proceedings, appeals, execution proceedings or any other legal services not specifically covered under this invoice shall be charged separately.",

    "4. Professional fees earned for services rendered shall be non-refundable. Voluntary withdrawal of proceedings, change of advocate, discontinuation of legal services by the Client or settlement between the parties shall not, by itself, constitute grounds for a refund.",

    "5. Professional fees are payable as mutually agreed. Engagement of legal services does not constitute any assurance or guarantee of a favourable outcome in any legal proceeding."

].join("\n\n");

/* =========================================================
   RECORD NORMALIZATION
   ========================================================= */

function normalize(record) {

    const items = record.items.map(item => ({
        description: String(
            item.description ?? item.particular ?? ""
        ),
        quantity: numeric(item.quantity ?? item.qty ?? 1),
        rate: numeric(item.rate ?? 0)
    }));

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
            record.clientPhone ?? record.clientMobile ?? "",
        clientEmail: record.clientEmail || "",
        clientAddress: record.clientAddress || "",
        clientGSTIN: record.clientGSTIN || "",
        items,
        discountAmount: numeric(record.discountAmount ?? 0),
        receivedEarlier: numeric(record.receivedEarlier ?? 0),
        receivedNow: numeric(
            record.receivedNow ?? record.amountPaid ?? 0
        ),
        paymentMode: record.paymentMode || "",
        paymentReference: record.paymentReference || "",
        notes: record.notes || "",
        terms: record.terms ?? DEFAULT_TERMS,
        showPaymentDetails: Boolean(record.showPaymentDetails),
        showSignature: record.showSignature !== false
    };
}

/* =========================================================
   DATE UTILITIES - INDIAN STANDARD TIME
   ========================================================= */

function today() {
    return getIndianDate();
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

let invoiceMessageTimer;
let invoiceMessageHideTimer;

function message(text, type = "success") {
    const element = $("appMessage");
    clearTimeout(invoiceMessageTimer);
    clearTimeout(invoiceMessageHideTimer);
    element.className = `app-message no-print ${type}`;
    element.textContent = text;
    element.style.transition = "opacity 200ms ease";
    element.style.opacity = "1";
    element.hidden = false;
    if (["success", "info"].includes(type)) {
        invoiceMessageTimer = setTimeout(() => {
            element.style.opacity = "0";
            invoiceMessageHideTimer = setTimeout(() => {
                element.hidden = true;
                element.style.opacity = "1";
            }, 200);
        }, 1800);
    }
}

function handleError(error) {

    console.error("MNM Invoice Error:", error);

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

    if (cloudSaving) return false;
    if (!dirty) return true;

    return confirmAction(
        "Discard unsaved changes?",
        "Your current unsaved changes will be lost."
    );
}

/* =========================================================
   EXISTING INVOICE HTML COMPATIBILITY
   ========================================================= */

function insertLegacyFields() {

    const paid = $("amountPaid");

    paid.previousElementSibling.textContent =
        "Received Now (₹)";

    if (!$("receivedEarlier")) {

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
    }

    if (!$("previousBillNo")) {

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
    }

    if (!$("previewEarlier")) {

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
}

/* =========================================================
   FEE PARTICULARS
   ========================================================= */

/* Smart particulars: built-in catalogue + saved invoice descriptions. */
const LEGAL_PARTICULARS = [
"Legal Consultation", "Legal Opinion", "Legal Advisory Services", "Legal Notice Drafting", "Reply to Legal Notice", "Legal Notice Dispatch", "Legal Document Review", "Legal Research", "Case File Review", "Conference with Client", "Professional Retainer Fees",
"Divorce Petition – Mutual Consent", "Divorce Petition – Contested", "Mutual Consent Divorce – First Motion", "Mutual Consent Divorce – Second Motion", "Restitution of Conjugal Rights Petition", "Judicial Separation Petition", "Maintenance Application", "Interim Maintenance Application", "Permanent Alimony Application", "Child Custody Petition", "Child Visitation Application", "Guardianship Petition", "Domestic Violence Application", "Domestic Violence Reply", "Matrimonial Settlement Drafting", "Mediation Appearance",
"Anticipatory Bail Application", "Regular Bail Application", "Default Bail Application", "Interim Bail Application", "Bail Cancellation Application", "FIR Quashing Petition", "Criminal Complaint Drafting", "Police Complaint Drafting", "Criminal Trial Appearance", "Criminal Revision Application", "Criminal Appeal", "Discharge Application", "Exemption Application", "Remand Hearing Appearance", "Protest Petition", "Written Arguments – Criminal Matter",
"Civil Suit Drafting", "Money Recovery Suit", "Summary Suit", "Permanent Injunction Suit", "Temporary Injunction Application", "Declaration Suit", "Specific Performance Suit", "Partition Suit", "Written Statement", "Rejoinder Drafting", "Replication Drafting", "Civil Appeal", "Civil Revision Application", "Execution Petition", "Caveat Application", "Notice of Motion", "Evidence Affidavit", "Cross-Examination Appearance", "Written Arguments – Civil Matter",
"Cheque Bounce Legal Notice", "Cheque Bounce Complaint – Section 138 NI Act", "Cheque Bounce Defence", "Cheque Bounce Settlement", "Consumer Complaint Drafting", "Consumer Complaint Reply", "Consumer Complaint Rejoinder", "Consumer Commission Appearance", "Consumer Appeal", "Insurance Claim Dispute", "Banking Dispute Consultation", "Loan Dispute Legal Notice", "DRT Application", "SARFAESI Legal Advisory", "RERA Complaint", "RERA Reply", "RERA Appearance",
"Property Title Verification", "Property Due Diligence", "Title Search Report", "Sale Deed Drafting", "Agreement to Sell Drafting", "Gift Deed Drafting", "Rent Agreement Drafting", "Leave and Licence Agreement", "Lease Deed Drafting", "Release Deed Drafting", "Relinquishment Deed Drafting", "Power of Attorney Drafting", "Will Drafting", "Succession Certificate Petition", "Legal Heir Documentation", "Probate Petition", "Property Dispute Consultation", "Society Legal Advisory", "Society Maintenance Recovery Notice", "Society Dispute Representation",
"Affidavit Drafting", "Declaration Drafting", "Indemnity Bond Drafting", "Undertaking Drafting", "Memorandum of Understanding", "Settlement Agreement Drafting", "Partnership Deed Drafting", "LLP Agreement Drafting", "Commercial Agreement Drafting", "Employment Agreement Drafting", "Non-Disclosure Agreement", "Contract Review", "Trademark Application Assistance", "Copyright Legal Advisory", "Copyright Infringement Notice", "Business Registration Assistance", "MSME Registration Assistance", "GST Registration Assistance", "Shop and Establishment Registration Assistance", "FSSAI Registration Assistance", "Company Incorporation Assistance",
"High Court Appearance", "District Court Appearance", "Family Court Appearance", "Magistrate Court Appearance", "Tribunal Appearance", "Court Hearing Professional Fees", "Petition Drafting", "Application Drafting", "Vakalatnama Preparation", "Document Compilation", "Court Filing Assistance", "Certified Copy Assistance", "Court Fee Reimbursement", "Travel Expense Reimbursement", "Printing and Documentation Expenses", "Postal and Courier Expenses", "Professional Fees – Part Payment", "Professional Fees – Final Payment"
];
// Shared inline suggestions: no floating overlay or native datalist.
function attachSuggestions(field, search, select) {
    if (!field || field.dataset.mnmSuggestions) return;
    field.dataset.mnmSuggestions = '1';
    const panel = document.createElement('div');
    panel.style.cssText = 'display:none;position:relative;width:100%;max-height:230px;overflow-y:auto;background:white;border:1px solid #c3a16b;border-radius:6px;margin-top:4px;text-align:left;';
    field.after(panel);
    let generation = 0;
    function close() { generation++; panel.style.display = 'none'; panel.replaceChildren(); }
    async function render() {
        const token = ++generation;
        const q = field.value.trim().toLowerCase();
        if (!q) { close(); return; }
        try {
            const results = await search(q);
            if (token !== generation || document.activeElement !== field || !field.isConnected) return;
            panel.replaceChildren();
            for (const result of results.slice(0,12)) {
                const button = document.createElement('button');
                button.type = 'button'; button.textContent = result.label;
                button.style.cssText = 'display:block;width:100%;padding:10px;background:white;color:#263345;text-align:left;border:0;border-bottom:1px solid #ddd;white-space:normal;cursor:pointer;font:inherit;';
                button.addEventListener('mousedown', e => e.preventDefault());
                button.addEventListener('click', () => { select(result); close(); dirty = true; updatePreview(); });
                panel.append(button);
            }
            panel.style.display = results.length ? 'block' : 'none';
        } catch (error) {
            if (token !== generation) return;
            panel.textContent = 'Unable to load suggestions. Manual entry is available.';
            panel.style.display = 'block'; console.error('MNM suggestions:', error);
        }
    }
    field.addEventListener('input', render);
    field.addEventListener('focus', render);
    field.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== field && !panel.contains(document.activeElement)) close(); }, 180));
    field.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}
function attachParticularSuggestions(field) {
    attachSuggestions(field, q => LEGAL_PARTICULARS.filter(s => q.split(/\s+/).every(w => s.toLowerCase().includes(w))).map(s => ({label:s})), result => { field.value = result.label; });
}
let clientCache = null, clientCacheTime = 0, clientRequest = null;
let selectedClientId = null;
let pendingClientId = null;
async function resolveBillingClient(data, existingInvoiceId = null) {
    const api = await import('./clients-cloud.js');
    const input = {fullName:data.clientName, mobile:data.clientPhone, email:data.clientEmail, address:data.clientAddress, clientType:'individual', status:'active', referenceSource:'Invoice Generator'};
    const normalized = api.validateClientData(input);
    const records = await api.fetchClients({includeArchived:true});
    const norm = v => String(v || '').trim().replace(/\s+/g,' ').toLowerCase();
    if (existingInvoiceId) {
        const {fetchInvoiceLinks} = await import('./finance-cloud.js');
        const link = (await fetchInvoiceLinks()).find(l => l.invoiceId === existingInvoiceId);
        if (link) {
            const linked = records.find(c => c.id === link.clientId);
            if (!linked || norm(linked.fullName) !== norm(input.fullName) || (selectedClientId && selectedClientId !== linked.id)) throw new Error('This invoice is already linked to a different client. Restore the original billing client.');
            return { ...linked, existingInvoiceLink: true };
        }
    }
    const chosen = records.find(c => c.id === selectedClientId || c.id === pendingClientId);
    if (chosen) {
        if (chosen.status === 'archived' || norm(chosen.fullName) !== norm(input.fullName)) throw new Error('Client selection has changed. Start a new invoice or select the correct client.');
        return chosen;
    }
    const matches = await api.findDuplicateClients(normalized);
    if (matches.length) {
        const exact = matches.filter(c => norm(c.fullName) === norm(input.fullName));
        const candidate = exact.length === 1 && matches.length === 1
            ? records.find(c => c.id === exact[0].id) : null;
        if (candidate && candidate.status !== 'archived') {
            const phone = v => String(v || '').replace(/\\D/g, '').replace(/^91(?=\\d{10}$)/, '');
            const suppliedPhone = phone(input.mobile);
            const knownPhones = [candidate.mobile, candidate.alternateMobile].map(phone).filter(Boolean);
            const suppliedEmail = norm(input.email);
            const knownEmail = norm(candidate.email);
            const conflict = (suppliedPhone && knownPhones.length && !knownPhones.includes(suppliedPhone)) ||
                (suppliedEmail && knownEmail && suppliedEmail !== knownEmail);
            if (!conflict && window.confirm('Use existing registered client ' + candidate.fullName + ' (' + candidate.clientCode + ') for this invoice?')) {
                selectedClientId = candidate.id;
                return candidate;
            }
        }
        throw new Error('Select the correct registered client from suggestions. Possible match: ' + matches.map(c => c.fullName + ' (' + c.clientCode + ')').join(', '));
    }
    // Saving an invoice for a new client authorizes registration.
    pendingClientId = pendingClientId || api.generateClientId();
    const client = await api.createClient(normalized, pendingClientId);
    selectedClientId = client.id;
    clientCache = null;
    return client;
}
async function searchRegisteredClients(q) {
    if (!clientCache || Date.now() - clientCacheTime > 60000) {
        if (!clientRequest) clientRequest = (async () => {
            const {fetchClients} = await import('./clients-cloud.js');
            clientCache = await fetchClients({includeArchived:false});
            clientCacheTime = Date.now();
        })().finally(() => { clientRequest = null; });
        await clientRequest;
    }
    return clientCache.filter(c => c.fullName && [c.fullName,c.mobile,c.clientCode].some(v => String(v ?? '').toLowerCase().includes(q))).map(c => ({client:c,label:[c.fullName,c.clientCode,c.mobile].filter(Boolean).join(' · ')}));
}
function attachClientSuggestions() {
    $('clientName').addEventListener('input', () => { selectedClientId = null; });
    attachSuggestions($('clientName'), searchRegisteredClients, ({client:c}) => {
        selectedClientId = c.id;
        set('clientName', c.fullName);
        set('clientPhone', c.mobile || c.alternateMobile || '');
        set('clientEmail', c.email || '');
        set('clientAddress', [...new Set([c.address,c.city,c.state,c.pinCode].map(v => String(v ?? '').trim()).filter(Boolean))].join(', '));
    });
}

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

            if (cloudSaving) return;

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
    attachParticularSuggestions(row.querySelector(".item-description"));
}

function collectItems() {

    return Array.from($("itemsBody").rows)
        .map(row => ({
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
   All amounts calculated in integer paise.
   ========================================================= */

function calculate(data) {

    const lines = data.items.map(item => {

        const quantity = numeric(item.quantity);
        const rate = paise(item.rate);
        const amount = Math.round(quantity * rate);

        if (!Number.isSafeInteger(amount)) {
            throw new Error("Fee amount exceeds supported limit.");
        }

        return { ...item, amount };
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
        "Fourteen", "Fifteen", "Sixteen", "Seventeen",
        "Eighteen", "Nineteen"
    ];

    const tens = [
        "", "", "Twenty", "Thirty", "Forty",
        "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
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
   COLLECT INVOICE DATA
   ========================================================= */

function collectInvoice() {

    return {
        id: editingId || pendingCreateId || crypto.randomUUID(),
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
        clientGSTIN: value("clientGSTIN").trim().toUpperCase(),
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

    Array.from($("itemsBody").rows)
        .forEach((row, index) => {

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
   CENTRALIZED FIRM PAYMENT DETAILS
   ========================================================= */

const paymentFields = {

    firmAccountName: [
        "accountName",
        "previewAccountName",
        "Account Holder"
    ],

    firmBankName: [
        "bankName",
        "previewBankName",
        "Bank"
    ],

    firmAccountNumber: [
        "accountNumber",
        "previewAccountNumber",
        "Account No."
    ],

    firmIFSC: [
        "ifsc",
        "previewIFSC",
        "IFSC"
    ],

    firmUPI: [
        "upi",
        "previewUPI",
        "UPI ID"
    ]
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

    show("previewPaymentDetails", visible && hasDetails);
}

function loadPaymentSettings() {

    paymentSettings = { ...readPaymentSettings() };

    for (const [id, [key]]
        of Object.entries(paymentFields)) {

        set(id, paymentSettings[key] || "");
    }
}

async function savePaymentSettings(event) {

    event.preventDefault();

    if (cloudSaving) return;

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

    cloudSaving = true;

    const form = $("paymentSettingsForm");

    form.inert = true;

    try {

        await saveCentralPaymentSettings(settings);

        cloudPaymentSettings = settings;
        paymentSettings = settings;

        updatePreview();

        message(
            "Firm payment details saved to Firebase Cloud."
        );

    } finally {

        form.inert = false;
        cloudSaving = false;
    }
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

    getBillingPeriod(data.invoiceDate);

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
        throw new Error("Please enter valid fee particulars.");
    }

    if (totals.subtotal <= 0) {
        throw new Error(
            "Invoice amount must be greater than zero."
        );
    }

    if (totals.discount > totals.subtotal) {
        throw new Error("Discount cannot exceed the subtotal.");
    }

    if (totals.paid > totals.total) {
        throw new Error("Total payments exceed the invoice amount.");
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
   CLOUD INVOICE SAVING
   Final number allocated by Firestore transaction.
   ========================================================= */

async function saveInvoice(event) {

    event.preventDefault();

    if (cloudSaving) return;

    const button = $("saveInvoiceButton");
    const form = $("invoiceForm");

    let saveAttempted = false;
    cloudSaving = true;
    button.disabled = true;

    try {

        const data = validateInvoice();
        const isEditing = editingId !== null;
        // New receipts only. Existing invoices require reconciliation.
        const initialReceipt = !isEditing && Number(data.receivedNow) > 0 && Number(data.receivedEarlier) === 0;
        if (initialReceipt && !["cash", "upi", "bank transfer", "cheque", "card", "other"].includes(String(data.paymentMode).trim().toLowerCase())) {
            throw new Error("Select a single payment mode before saving a paid invoice.");
        }
        const receiptDate = today();


        const payload = {
            ...data,
            clientMobile: data.clientPhone,
            amountPaid:
                data.receivedEarlier + data.receivedNow,

            items: data.items.map(item => ({
                ...item,
                particular: item.description,
                qty: item.quantity
            }))
        };

        form.inert = true;

        display(
            "saveInvoiceButton",
            "Saving to Cloud..."
        );

        let saved;
        const billingClient = await resolveBillingClient(data, isEditing ? editingId : null);

        if (isEditing) {

            if (!originalRecord) {
                throw new Error(
                    "Please reopen the saved invoice."
                );
            }

            saveAttempted = true;
            saved = await updateCloudInvoice(
                editingId,
                payload,
                originalRecord.revision
            );

        } else {

            pendingCreateId =
                pendingCreateId || crypto.randomUUID();

            payload.id = pendingCreateId;

            saveAttempted = true;
            saved = await createCloudInvoice(payload);
        }

        editingId = String(saved.id);
        originalRecord = saved;
        loadedSnapshot = JSON.stringify(saved);
        pendingCreateId = null;

        set("editingInvoiceId", editingId);
        set("invoiceNumber", saved.invoiceNo);

        $("invoiceDate").readOnly = true;

        dirty = false;

        const index = cloudRecords.findIndex(
            record => String(record.id) === editingId
        );

        if (index >= 0) {
            cloudRecords[index] = saved;
        } else {
            cloudRecords.push(saved);
        }

        if (saved.numberingFormat === "MONTHLY") {

            const monthId = saved.invoiceDate.slice(0, 7);

            cloudMonthlySequences[monthId] = Math.max(
                cloudMonthlySequences[monthId] || 1,
                Number(saved.sequenceNumber) + 1
            );
        }

        updatePreview();
        refreshRecords();
        if (billingClient) {
            try {
                const {linkInvoice} = await import('./finance-cloud.js');
                if (!billingClient.existingInvoiceLink) await linkInvoice(saved.id, billingClient.id);
                if (initialReceipt) {
                    try {
                        await syncNewInvoiceReceipt(saved.id, {confirmedReceipt: true, transactionDate: receiptDate});
                        message('Invoice ' + saved.invoiceNo + ' saved. Payment posted to Financial Management.');
                    } catch (paymentError) {
                        console.error('Invoice receipt synchronization failed:', paymentError);
                        const warning = 'Invoice saved and linked, but finance posting could not be confirmed. Check the Finance Ledger before recording or retrying payment. Do not create another invoice. ' + paymentError.message;
                        message(warning, 'error');
                        window.alert(warning);
                    }
                } else if (!isEditing && Number(data.receivedEarlier) > 0) {
                    message('Invoice saved. Earlier receipts require reconciliation in Financial Management.', 'error');
                } else if (isEditing) {
                    message('Invoice updated. Payment changes are not automatically posted for existing invoices; reconcile in Financial Management.', 'error');
                } else {
                    message('Invoice ' + saved.invoiceNo + ' saved and linked to ' + billingClient.clientCode + '.');
                }
            } catch (linkError) {
                console.error('Invoice association failed:', linkError);
                message('Invoice and client saved, but linking failed. Link this saved invoice in Financial Management. Do not create another invoice.', 'error');
                window.alert('Invoice and client saved. Association failed: ' + linkError.message + '\nLink the saved invoice in Financial Management. Do not create another invoice.');
            }
        } else {
            message('Invoice ' + saved.invoiceNo + ' successfully saved to Firebase Cloud.');
        }

    } catch (error) {

        console.error("Cloud invoice save error:", error);

        message(
            (saveAttempted ? "Cloud save could not be confirmed. Check Saved Invoices before retrying. " : "Invoice not submitted. ") +
            error.message,
            "error"
        );

        window.alert(
            "Cloud save could not be confirmed.\n\n" +
            "Check Saved Invoices before retrying.\n\n" +
            error.message
        );

    } finally {

        cloudSaving = false;
        form.inert = false;
        button.disabled = false;

        display(
            "saveInvoiceButton",
            editingId ? "Update Invoice" : "Save Invoice"
        );
    }
}

/* =========================================================
   NEW INVOICE AND RESET
   ========================================================= */

function resetForm() {

    selectedClientId = null;
    pendingClientId = null;

    editingId = null;
    originalRecord = null;
    loadedSnapshot = null;
    pendingCreateId = null;

    $("invoiceForm").reset();

    set("editingInvoiceId", "");
    set("invoiceDate", today());

    $("invoiceDate").readOnly = false;

    refreshDraftNumber();

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

    if (cloudSaving) return;

    if (!(await allowDiscard())) return;

    await syncCloudData();

    resetForm();

    activateTab("create");

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

/* =========================================================
   OPEN EXISTING CLOUD INVOICE
   ========================================================= */

async function loadInvoice(id) {

    if (cloudSaving) return false;

    if (!(await allowDiscard())) return false;

    await syncCloudData();

    const record = readInvoices().find(
        item => String(item.id) === String(id)
    );

    if (!record) {
        throw new Error(
            "Invoice could not be found or has been cancelled."
        );
    }

    const data = normalize(record);

    selectedClientId = null;
    pendingClientId = null;
    originalRecord = record;
    editingId = String(record.id);
    loadedSnapshot = JSON.stringify(record);
    pendingCreateId = null;

    set("editingInvoiceId", editingId);
    set("invoiceNumber", data.invoiceNo);
    set("invoiceDate", data.invoiceDate);

    $("invoiceDate").readOnly = true;

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

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    return true;
}

/* =========================================================
   CANCEL INVOICE
   Permanent deletion is prohibited.
   ========================================================= */

async function deleteInvoice(id) {

    if (cloudSaving) return;

    if (editingId === String(id) && dirty) {
        throw new Error(
            "Save or discard your unsaved changes first."
        );
    }

    await syncCloudData();

    const record = readInvoices().find(
        item => String(item.id) === String(id)
    );

    if (!record) {
        throw new Error("Invoice is unavailable.");
    }

    const confirmed = await confirmAction(
        "Cancel saved invoice?",
        "The invoice will be marked as cancelled. " +
        "Its record and invoice number will remain " +
        "preserved in Firebase Cloud."
    );

    if (!confirmed) return;

    const reason = window.prompt(
        "Enter the reason for cancellation:"
    );

    if (!reason || !reason.trim()) return;

    if (cloudSaving) return;

    cloudSaving = true;

    try {

        await cancelCloudInvoice(
            record.id,
            reason.trim(),
            record.revision
        );

        cloudRecords = cloudRecords.map(item =>

            String(item.id) === String(id)

                ? {
                    ...item,
                    recordStatus: "cancelled",
                    cancellationReason: reason.trim()
                }

                : item
        );

    } finally {

        cloudSaving = false;
    }

    await syncCloudData();

    if (editingId === String(id)) {
        resetForm();
    }

    refreshRecords();

    message("Invoice cancelled. Cloud record preserved.");
}

/* =========================================================
   SAVED INVOICE TABLE
   ========================================================= */

function actionButton(label, callback, extraClass = "") {

    const button = document.createElement("button");

    button.type = "button";
    button.className = `action-button ${extraClass}`;
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

    const records = cloudRecords.map(record => {

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
            (status === "all" ||
                (status === "active" && data.recordStatus !== "cancelled") ||
                (status === "cancelled" && data.recordStatus === "cancelled" && !String(data.cancellationReason || "").startsWith("[RECOVERABLE_DELETE] ")) ||
                (status === "deleted" && data.recordStatus === "cancelled" && String(data.cancellationReason || "").startsWith("[RECOVERABLE_DELETE] ")) ||
                (data.recordStatus !== "cancelled" && totals.status === status)) &&
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

        const dateComparison =
            a.data.invoiceDate.localeCompare(
                b.data.invoiceDate
            );

        const sequenceComparison =
            Number(a.data.sequenceNumber || 0) -
            Number(b.data.sequenceNumber || 0);

        if (sort === "oldest") {
            return dateComparison || sequenceComparison;
        }

        return -dateComparison || -sequenceComparison;
    });

    return filtered;
}

function invoiceHistoryStatus(data, totals) {
    if (data.recordStatus !== "cancelled") return statusLabels[totals.status];
    return String(data.cancellationReason || "").startsWith("[RECOVERABLE_DELETE] ") ? "Deleted" : "Cancelled";
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

        badge.textContent =
            invoiceHistoryStatus(data, totals);
        if (data.recordStatus === "cancelled") badge.title = String(data.cancellationReason || "");

        statusCell.appendChild(badge);
        row.appendChild(statusCell);

        const actionsCell = document.createElement("td");
        const actions = document.createElement("div");

        actions.className = "invoice-actions";

        if (data.recordStatus === "cancelled") {
            actions.append(actionButton("Details", () => {
                window.alert("Invoice: " + data.invoiceNo + "\\nStatus: " + invoiceHistoryStatus(data, totals) + "\\nReason: " + (data.cancellationReason || "Not recorded") + "\\nOriginal amount: " + money(totals.total / 100) + "\\nRecorded receipts: " + money(totals.paid / 100));
            }));
        } else actions.append(

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
                "Cancel",
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

    set("currentSequence", nextSequence(today()));
    set("numberingFormat", "MNM/MMM/NNN/YYYY");

    for (const record of cloudRecords) if (record.invoiceDate) years.add(record.invoiceDate.slice(0, 4));

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

        set("currentSequence", nextSequence(today()));

        display(
            "storageInvoiceCount",
            readInvoices().length
        );
    }
}

async function openTab(name) {

    if (cloudSaving) return;

    if (name === "saved" || name === "settings") {

        await syncCloudData();

        refreshRecords();

        if (!editingId) {
            refreshDraftNumber();
            updatePreview();
        }
    }

    activateTab(name);
}

/* =========================================================
   PRINT AND SAVE PDF
   Existing A4 design controlled by invoice.css.
   ========================================================= */

async function printInvoice() {

    if (cloudSaving) return;

    if (!editingId || dirty) {

        window.alert(
            "Please save or update the invoice before printing."
        );

        $("saveInvoiceButton").scrollIntoView({
            behavior: "smooth",
            block: "center"
        });

        $("saveInvoiceButton").focus();

        return;
    }

    await syncCloudData();

    const current = readInvoices().find(
        record => String(record.id) === editingId
    );

    if (
        !current ||
        !originalRecord ||
        current.revision !== originalRecord.revision
    ) {
        throw new Error(
            "Invoice has changed or been cancelled. " +
            "Please reopen it before printing."
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
   ========================================================= */

function csvCell(input) {

    let text = String(input ?? "");

    if (/^[\s]*[=+\-@]/.test(text)) {
        text = "'" + text;
    }

    return '"' + text.replaceAll('"', '""') + '"';
}

async function exportCSV() {

    if (cloudSaving) return;

    await syncCloudData();

    refreshRecords();

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
            invoiceHistoryStatus(data, totals)
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

    message("Cloud invoice CSV export requested.");
}

/* =========================================================
   CLOUD BACKUP
   Includes monthly counters and cancelled invoices.
   ========================================================= */

async function downloadBackup() {

    if (cloudSaving) return;

    await syncCloudData();

    const backup = {
        firm: "MNM Legal Associates",
        backupVersion: 5,
        backupDate: new Date().toISOString(),
        source: location.origin,
        storage: "Firebase Cloud Firestore",
        numberingFormat: "MNM/MMM/NNN/YYYY",

        data: {
            invoices: cloudRecords,
            monthlySequences: cloudMonthlySequences,
            paymentSettings: cloudPaymentSettings
        }
    };

    downloadFile(
        JSON.stringify(backup, null, 2),
        `MNM-Cloud-Backup-${today()}.json`,
        "application/json"
    );

    message(
        "Cloud backup download requested. " +
        "Keep this confidential file in a secure location."
    );
}

/* =========================================================
   BACKUP RESTORATION PROTECTION
   ========================================================= */

async function importBackup(event) {

    if (event?.target) {
        event.target.value = "";
    }

    window.alert(
        "Automatic backup restoration is disabled " +
        "to protect centralized invoice records " +
        "and invoice numbering."
    );
}

/* =========================================================
   CLOUD REFRESH
   ========================================================= */

async function refreshCloudView() {

    if (cloudSaving) return;

    await syncCloudData();

    if (cloudSaving) return;

    refreshRecords();

    if (!editingId) {

        refreshDraftNumber();

        updatePreview();
    }
}

/* =========================================================
   EVENT HANDLERS
   ========================================================= */

function bindEvents() {
    const historyFilter = $("statusFilter");
    for (const [label, key] of [["Active Invoices", "active"], ["Cancelled Invoices", "cancelled"], ["Deleted Invoices", "deleted"]]) {
        if (![...historyFilter.options].some(o => o.value === key)) historyFilter.add(new Option(label, key));
    }


    $("invoiceForm").addEventListener(
        "submit",
        safeAction(saveInvoice)
    );

    $("invoiceForm").addEventListener(
        "input",
        safeAction(event => {

            if (cloudSaving) return;

            dirty = true;

            if (
                event.target.id === "invoiceDate" &&
                !editingId
            ) {
                refreshDraftNumber();
            }

            updatePreview();
        })
    );

    $("invoiceForm").addEventListener(
        "change",
        safeAction(event => {

            if (cloudSaving) return;

            if (
                event.target.id === "invoiceDate" &&
                !editingId
            ) {

                dirty = true;

                refreshDraftNumber();

                updatePreview();
            }
        })
    );

    $("addItemButton").addEventListener(
        "click",
        safeAction(() => {

            if (cloudSaving) return;

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

    for (const name of [
        "create",
        "saved",
        "settings"
    ]) {

        $(name + "Tab").addEventListener(
            "click",
            safeAction(() => openTab(name))
        );
    }

    const tabNames = [
        "create",
        "saved",
        "settings"
    ];

    tabNames.forEach((name, index) => {

        $(name + "Tab").addEventListener(
            "keydown",
            safeAction(async event => {

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

                await openTab(tabNames[next]);

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
        safeAction(() => importBackup())
    );

    $("backupFileInput").addEventListener(
        "change",
        safeAction(importBackup)
    );

    window.addEventListener(
        "beforeunload",
        event => {

            if (dirty || cloudSaving) {

                event.preventDefault();

                event.returnValue = "";
            }
        }
    );

    window.addEventListener(
        "focus",
        safeAction(refreshCloudView)
    );

    window.addEventListener(
        "online",
        safeAction(refreshCloudView)
    );
}

/* =========================================================
   FIREBASE AUTHENTICATED INITIALIZATION
   ========================================================= */

export async function initialiseInvoiceSystem(user) {

    if (!user || !user.uid) {
        throw new Error("Authentication is required.");
    }

    if (initialized) return;

    await syncCloudData();

    // Remove obsolete browser-only storage notice after cloud sync succeeds.
    document.querySelectorAll(".storage-notice").forEach(notice => {
        if (notice.textContent.includes("Cloud synchronisation is not yet enabled")) {
            notice.remove();
        }
    });

    insertLegacyFields();

    loadPaymentSettings();

    resetForm();

    bindEvents();
    attachClientSuggestions();

    refreshRecords();

    activateTab("create");

    initialized = true;

    message(
        "Invoice system connected to Firebase Cloud. " +
        "Monthly invoice numbering is active."
    );
}

/* =========================================================
   END OF PROFESSIONAL CLOUD INVOICE MANAGEMENT SYSTEM

   MNM LEGAL ASSOCIATES
   Version 6.0
   Justice, Integrity & Excellence
   ========================================================= */








