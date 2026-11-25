
/* =========================================================
   MNM LEGAL ASSOCIATES
   CENTRALIZED PAYMENT ENGINE
   Version 1.0.0
   Justice, Integrity & Excellence
   ========================================================= */

import {
    createTransaction,
    reverseTransaction,
    generateTransactionId,
    fetchTransactions,
    fetchInvoiceLinks,
    fetchFinanceInvoices,
    calculateInvoiceReceipts,
    calculateAgreementBalance,
    fetchFeeAgreements,
    getIndianDate,
    rupeesToPaise,
    formatMoney,
    PAYMENT_MODES
} from "./finance-cloud.js";

export const PAYMENT_CONFIG = Object.freeze({
    version: "1.0.0",
    currency: "INR",
    ledger: "financeTransactions",
    timeZone: "Asia/Kolkata"
});

/* =========================================================
   VALIDATION
   ========================================================= */

function fail(message) {
    throw new Error(message);
}

function cleanText(value, maxLength, required = false) {
    const text = String(value ?? "").trim();

    if (required && !text) {
        fail("Required information is missing.");
    }

    if (text.length > maxLength) {
        fail("Text exceeds permitted length.");
    }

    return text;
}

function cleanId(value, required = false) {
    const id = cleanText(value, 128, required);

    if (id && !/^[A-Za-z0-9_-]+$/.test(id)) {
        fail("Invalid record ID.");
    }

    return id;
}

function validateAmount(value) {
    if (
        !Number.isSafeInteger(value) ||
        value <= 0 ||
        value > 1000000000000
    ) {
        fail("Invalid payment amount.");
    }

    return value;
}

function validatePaymentMode(value) {
    const mode = cleanText(value, 40, true);

    if (!PAYMENT_MODES.includes(mode)) {
        fail("Invalid payment mode.");
    }

    return mode;
}

/* =========================================================
   PAYMENT ID
   ========================================================= */

export function generatePaymentId() {
    return generateTransactionId();
}

/* =========================================================
   PAYMENT ASSOCIATION
   ========================================================= */

async function resolveAssociation(input) {
    const invoiceId = cleanId(input.invoiceId);
    const feeAgreementId = cleanId(input.feeAgreementId);

    let clientId = cleanId(input.clientId);
    let caseId = cleanId(input.caseId);

    function applyAssociation(record) {
        const linkedClient = cleanId(
            record.clientId,
            true
        );

        const linkedCase = cleanId(record.caseId);

        if (clientId && clientId !== linkedClient) {
            fail("Client association does not match.");
        }

        if (caseId && caseId !== linkedCase) {
            fail("Case association does not match.");
        }

        clientId = linkedClient;
        caseId = linkedCase;
    }

    if (invoiceId) {
        const links = await fetchInvoiceLinks();

        const link = links.find(
            item => item.invoiceId === invoiceId
        );

        if (!link) {
            fail(
                "Link this invoice to a registered client first."
            );
        }

        applyAssociation(link);
    }

    if (feeAgreementId) {
        const agreements = await fetchFeeAgreements();

        const agreement = agreements.find(
            item => item.id === feeAgreementId
        );

        if (!agreement) {
            fail("Fee agreement not found.");
        }

        applyAssociation(agreement);
    }

    return {
        clientId: cleanId(clientId, true),
        caseId,
        invoiceId,
        feeAgreementId
    };
}

/* =========================================================
   NORMALIZE PAYMENT
   ========================================================= */

async function normalizePayment(input, type) {
    if (!input || typeof input !== "object") {
        fail("Invalid payment information.");
    }

    const association = await resolveAssociation(input);

    const amountPaise = input.amountPaise !== undefined
        ? validateAmount(input.amountPaise)
        : rupeesToPaise(input.amount);

    return {
        ...association,

        transactionDate:
            input.transactionDate || getIndianDate(),

        transactionType: type,

        category: cleanText(
            input.category || "Professional Fees",
            150,
            true
        ),

        amountPaise,

        paymentMode:
            validatePaymentMode(input.paymentMode),

        paymentReference: cleanText(
            input.paymentReference,
            250
        ),

        description: cleanText(
            input.description ||
            (
                type === "refund"
                    ? "Professional fee refund"
                    : "Professional fee received"
            ),
            5000,
            true
        )
    };
}

/* =========================================================
   INVOICE VALIDATION
   ========================================================= */

async function verifyInvoice(invoiceId, type) {
    if (!invoiceId) {
        return;
    }

    const invoices = await fetchFinanceInvoices();

    const invoice = invoices.find(
        item => item.id === invoiceId
    );

    if (!invoice) {
        fail("Invoice not found.");
    }

    if (
        type === "income" &&
        invoice.recordStatus === "cancelled"
    ) {
        fail(
            "Payment cannot be received against a cancelled invoice."
        );
    }
}

/* =========================================================
   PAYMENT PREVIEW
   Read-only validation before posting
   ========================================================= */

export async function previewPayment(input) {
    const payment = await normalizePayment(
        input,
        "income"
    );

    await verifyInvoice(
        payment.invoiceId,
        "income"
    );

    return payment;
}

/* =========================================================
   PAYMENT POSTING
   Reserved for the next integration phase.
   ========================================================= */

export async function receivePayment(
    input,
    paymentId
) {
    fail(
        "Centralized payment posting is disabled until " +
        "the synchronization security upgrade is installed."
    );
}

export async function refundPayment(
    input,
    paymentId
) {
    fail(
        "Centralized refunds are disabled until " +
        "the synchronization security upgrade is installed."
    );
}

export async function reversePayment(
    originalPaymentId,
    reason,
    reversalId
) {
    fail(
        "Centralized payment reversal is disabled until " +
        "the synchronization security upgrade is installed."
    );
}

/* =========================================================
   INVOICE PAYMENT SUMMARY
   ========================================================= */

export async function getInvoicePaymentSummary(
    invoiceId
) {
    const id = cleanId(invoiceId, true);

    const [
        transactions,
        invoices,
        links
    ] = await Promise.all([
        fetchTransactions(),
        fetchFinanceInvoices(),
        fetchInvoiceLinks()
    ]);

    const invoice = invoices.find(
        item => item.id === id
    );

    if (!invoice) {
        fail("Invoice not found.");
    }

    const association = links.find(
        item => item.invoiceId === id
    ) || null;

    const receivedPaise = calculateInvoiceReceipts(
        id,
        transactions
    );

    const paymentHistory = transactions.filter(
        item => item.invoiceId === id
    );

    return {
        invoiceId: id,
        invoice,
        association,
        linked: Boolean(association),
        receivedPaise,
        receivedAmount: receivedPaise / 100,
        formattedReceived: formatMoney(receivedPaise),
        paymentHistory,
        legacyReconciliationRequired: true,
        synchronizedAt: new Date().toISOString()
    };
}

/* =========================================================
   FEE AGREEMENT PAYMENT SUMMARY
   ========================================================= */

export async function getFeePaymentSummary(
    feeAgreementId
) {
    const id = cleanId(feeAgreementId, true);

    const [
        agreements,
        transactions
    ] = await Promise.all([
        fetchFeeAgreements(),
        fetchTransactions()
    ]);

    const agreement = agreements.find(
        item => item.id === id
    );

    if (!agreement) {
        fail("Fee agreement not found.");
    }

    return {
        ...calculateAgreementBalance(
            agreement,
            transactions
        ),

        paymentHistory: transactions.filter(
            item => item.feeAgreementId === id
        ),

        synchronizedAt: new Date().toISOString()
    };
}

/* =========================================================
   CLIENT PAYMENT HISTORY
   ========================================================= */

export async function getClientPaymentHistory(
    clientId
) {
    const id = cleanId(clientId, true);

    const transactions = await fetchTransactions();

    return transactions.filter(
        item =>
            item.clientId === id &&
            [
                "income",
                "refund",
                "reversal"
            ].includes(item.transactionType)
    );
}

/* =========================================================
   CASE PAYMENT HISTORY
   ========================================================= */

export async function getCasePaymentHistory(
    caseId
) {
    const id = cleanId(caseId, true);

    const transactions = await fetchTransactions();

    return transactions.filter(
        item =>
            item.caseId === id &&
            [
                "income",
                "refund",
                "reversal"
            ].includes(item.transactionType)
    );
}

/* =========================================================
   PAYMENT ENGINE STATUS
   ========================================================= */

export function getPaymentEngineStatus() {
    return {
        version: PAYMENT_CONFIG.version,
        ledger: PAYMENT_CONFIG.ledger,
        currency: PAYMENT_CONFIG.currency,
        readEnabled: true,
        postingEnabled: false,
        integrationStatus: "pending_security_upgrade"
    };
}

/* END OF CENTRALIZED PAYMENT ENGINE */
