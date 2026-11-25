


/* =========================================================
   MNM LEGAL ASSOCIATES
   CENTRALIZED PAYMENT ENGINE
   Version 2.1.0
   Justice, Integrity & Excellence
   ========================================================= */

import {
    postInitialInvoiceReceipt,
    createTransaction,
    reverseTransaction,
    generateTransactionId,
    fetchTransactions,
    fetchInvoiceLinks,
    fetchFinanceInvoices,
    fetchFeeAgreements,
    calculateInvoiceReceipts,
    calculateAgreementBalance,
    getTransaction,
    getIndianDate,
    rupeesToPaise,
    formatMoney,
    PAYMENT_MODES
} from "./finance-cloud.js";

export const PAYMENT_CONFIG = Object.freeze({
    version: "2.1.0",
    currency: "INR",
    ledger: "financeTransactions",
    requestCollection: "paymentRequests",
    timeZone: "Asia/Kolkata"
});

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

export function generatePaymentId() {
    return generateTransactionId();
}

/* =========================================================
   CLIENT, CASE AND INVOICE ASSOCIATION
   ========================================================= */

async function resolveAssociation(input) {
    const invoiceId = cleanId(input.invoiceId);
    const feeAgreementId = cleanId(input.feeAgreementId);

    let clientId = cleanId(input.clientId);
    let caseId = cleanId(input.caseId);
    let resolved = false;

    function applyAssociation(record) {
        const linkedClient = cleanId(record.clientId, true);
        const linkedCase = cleanId(record.caseId);

        if (clientId && clientId !== linkedClient) {
            fail("Client association does not match.");
        }

        if (
            (resolved || caseId) &&
            caseId !== linkedCase
        ) {
            fail("Case association does not match.");
        }

        clientId = linkedClient;
        caseId = linkedCase;
        resolved = true;
    }

    if (invoiceId) {
        const links = await fetchInvoiceLinks();

        const link = links.find(
            item => item.invoiceId === invoiceId
        );

        if (!link) {
            fail(
                "Link the invoice to a registered client first."
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
   PAYMENT NORMALIZATION
   ========================================================= */

async function normalizePayment(input, type) {
    if (!input || typeof input !== "object") {
        fail("Invalid payment information.");
    }

    const association = await resolveAssociation(input);

    const amountPaise = validateAmount(
        input.amountPaise !== undefined
            ? input.amountPaise
            : rupeesToPaise(input.amount)
    );

    const paymentMode = cleanText(
        input.paymentMode,
        40,
        true
    );

    if (!PAYMENT_MODES.includes(paymentMode)) {
        fail("Invalid payment mode.");
    }

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

        paymentMode,

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
   INVOICE VERIFICATION
   ========================================================= */

async function verifyInvoice(invoiceId, type) {
    if (!invoiceId) {
        return null;
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
        (
            invoice.recordStatus === "cancelled" ||
            invoice.status === "cancelled" ||
            invoice.status === "Cancelled"
        )
    ) {
        fail(
            "Payment cannot be received against a cancelled invoice."
        );
    }

    return invoice;
}

/* =========================================================
   PAYMENT PREVIEW
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
   CENTRALIZED PAYMENT RECEIPT
   ========================================================= */

export async function receivePayment(
    input,
    paymentId
) {
    const requestId = cleanId(paymentId, true);

    const payment = await normalizePayment(
        input,
        "income"
    );

    /*
       Invoice-linked posting remains locked until
       invoice reconciliation and balance validation
       are implemented.
    */

    if (payment.invoiceId) {
        fail(
            "Invoice-linked payment posting requires " +
            "the invoice synchronization upgrade."
        );
    }

    return createTransaction(
        payment,
        requestId
    );
}

/* =========================================================
   CENTRALIZED REFUND
   ========================================================= */

export async function refundPayment(
    input,
    paymentId
) {
    cleanId(paymentId, true);

    /*
       Fail closed until refundable balances can
       be validated atomically.
    */

    fail(
        "Centralized refunds require the atomic " +
        "refund balance validation upgrade."
    );
}

/* =========================================================
   PAYMENT REVERSAL
   ========================================================= */

export async function reversePayment(
    originalPaymentId,
    reason,
    reversalId
) {
    const originalId = cleanId(
        originalPaymentId,
        true
    );

    const requestId = cleanId(
        reversalId,
        true
    );

    const explanation = cleanText(
        reason,
        4900,
        true
    );

    const original = await getTransaction(originalId);

    if (!original) {
        fail("Original payment not found.");
    }

    if (
        !["income", "refund"].includes(
            original.transactionType
        )
    ) {
        fail("Record is not a professional fee payment.");
    }

    if (original.invoiceId) {
        fail(
            "Invoice-linked reversal requires " +
            "the invoice synchronization upgrade."
        );
    }

    return reverseTransaction(
        originalId,
        explanation,
        requestId
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

    return {
        invoiceId: id,
        invoice,
        association,
        linked: Boolean(association),

        receivedPaise,
        receivedAmount: receivedPaise / 100,
        formattedReceived: formatMoney(receivedPaise),

        paymentHistory: transactions.filter(
            item => item.invoiceId === id
        ),

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
   PAYMENT HISTORY
   ========================================================= */

function selectPayments(rows, field, id) {
    const originals = new Map(
        rows.map(item => [item.id, item])
    );

    return rows.filter(item => {
        if (item[field] !== id) {
            return false;
        }

        if (
            ["income", "refund"].includes(
                item.transactionType
            )
        ) {
            return true;
        }

        if (item.transactionType === "reversal") {
            const original = originals.get(
                item.reversalOf
            );

            return Boolean(
                original &&
                ["income", "refund"].includes(
                    original.transactionType
                )
            );
        }

        return false;
    });
}

export async function getClientPaymentHistory(
    clientId
) {
    const id = cleanId(clientId, true);

    return selectPayments(
        await fetchTransactions(),
        "clientId",
        id
    );
}

export async function getCasePaymentHistory(
    caseId
) {
    const id = cleanId(caseId, true);

    return selectPayments(
        await fetchTransactions(),
        "caseId",
        id
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
        postingEnabled: true,
        invoicePostingEnabled: false,
        refundEnabled: false,
        integrationStatus: "partial_activation"
    };
}

/* END OF CENTRALIZED PAYMENT ENGINE */

/* Initial receipt for a newly saved, linked invoice.
   Historical receipts and subsequent installments are not imported here. */
export async function syncInitialInvoicePayment(input) {
    if (!input || typeof input !== "object") fail("Invalid invoice payment information.");
    if (input.confirmedReceipt !== true) fail("Confirm actual receipt before posting.");
    const invoiceId = cleanId(input.invoiceId, true);
    const payment = await normalizePayment({...input, invoiceId}, "income");
    if (payment.feeAgreementId) fail("Initial invoice receipt cannot link a fee agreement yet.");
    await verifyInvoice(invoiceId, "income");
    return postInitialInvoiceReceipt({
        invoiceId, clientId: payment.clientId, caseId: payment.caseId,
        amountPaise: payment.amountPaise, transactionDate: payment.transactionDate,
        paymentMode: payment.paymentMode, paymentReference: payment.paymentReference,
        confirmedReceipt: true
    });
}


