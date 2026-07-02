/* =====================================================
   MNM LEGAL ASSOCIATES
   Invoice Generator JavaScript
===================================================== */

/* ===========================
   ELEMENTS
=========================== */

const invoiceNo = document.getElementById("invoiceNo");
const invoiceDate = document.getElementById("invoiceDate");

const invoiceBody = document.getElementById("invoiceBody");
const addItemBtn = document.getElementById("addItemBtn");
const clearTableBtn = document.getElementById("clearTableBtn");

const discountInput = document.getElementById("discount");
const subTotal = document.getElementById("subTotal");
const grandTotal = document.getElementById("grandTotal");
const amountWords = document.getElementById("amountWords");

const printBtn = document.getElementById("printBtn");
const printInvoiceBottom = document.getElementById("printInvoiceBottom");

const downloadPdf = document.getElementById("downloadPdf");
const downloadPdfBottom = document.getElementById("downloadPdfBottom");

const previewBtn = document.getElementById("previewBtn");
const clearInvoiceBtn = document.getElementById("clearInvoiceBtn");

const loadingPopup = document.getElementById("loadingPopup");
const successPopup = document.getElementById("successPopup");
const errorPopup = document.getElementById("errorPopup");
const errorMessage = document.getElementById("errorMessage");

const closeSuccessPopup = document.getElementById("closeSuccessPopup");
const closeErrorPopup = document.getElementById("closeErrorPopup");

const pdfFileName = document.getElementById("pdfFileName");

/* ===========================
   INITIALIZE
=========================== */

setTodayDate();
bindExistingRows();
calculateInvoice();

/* ===========================
   DATE
=========================== */

function setTodayDate() {
  if (!invoiceDate) return;

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  invoiceDate.value = `${yyyy}-${mm}-${dd}`;
}

/* ===========================
   MONEY FORMAT
=========================== */

function money(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/* ===========================
   CREATE ROW
=========================== */

function createRow() {
  const tr = document.createElement("tr");

  tr.innerHTML = `
    <td class="serial"></td>

    <td>
      <input
        type="text"
        class="particular"
        placeholder="Professional Charges"
      >
    </td>

    <td>
      <input
        type="number"
        class="qty"
        value="1"
        min="1"
      >
    </td>

    <td>
      <input
        type="number"
        class="rate"
        value="0"
        min="0"
      >
    </td>

    <td class="amount">₹0.00</td>

    <td>
      <button type="button" class="delete-row">
        <i class="fa-solid fa-trash"></i>
      </button>
    </td>
  `;

  invoiceBody.appendChild(tr);
  bindRowEvents(tr);
  updateSerialNumbers();
  calculateInvoice();
}

/* ===========================
   ROW EVENTS
=========================== */

function bindExistingRows() {
  document.querySelectorAll("#invoiceBody tr").forEach((row) => {
    bindRowEvents(row);
  });

  updateSerialNumbers();
}

function bindRowEvents(row) {
  const qtyInput = row.querySelector(".qty");
  const rateInput = row.querySelector(".rate");
  const particularInput = row.querySelector(".particular");
  const deleteBtn = row.querySelector(".delete-row");

  if (qtyInput) {
    qtyInput.addEventListener("input", calculateInvoice);
  }

  if (rateInput) {
    rateInput.addEventListener("input", calculateInvoice);
  }

  if (particularInput) {
    particularInput.addEventListener("input", calculateInvoice);
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      if (invoiceBody.rows.length === 1) {
        showError("At least one invoice item is required.");
        return;
      }

      row.remove();
      updateSerialNumbers();
      calculateInvoice();
    });
  }
}

/* ===========================
   SERIAL NUMBERS
=========================== */

function updateSerialNumbers() {
  document.querySelectorAll("#invoiceBody tr").forEach((row, index) => {
    const serialCell = row.querySelector(".serial");

    if (serialCell) {
      serialCell.textContent = index + 1;
    }
  });
}

/* ===========================
   CALCULATION
=========================== */

function calculateInvoice() {
  let subtotal = 0;

  document.querySelectorAll("#invoiceBody tr").forEach((row) => {
    const qty = parseFloat(row.querySelector(".qty")?.value) || 0;
    const rate = parseFloat(row.querySelector(".rate")?.value) || 0;
    const amount = qty * rate;

    const amountCell = row.querySelector(".amount");

    if (amountCell) {
      amountCell.textContent = "₹" + money(amount);
    }

    subtotal += amount;
  });

  const discount = parseFloat(discountInput?.value) || 0;
  const total = Math.max(subtotal - discount, 0);

  if (subTotal) {
    subTotal.textContent = "₹" + money(subtotal);
  }

  if (grandTotal) {
    grandTotal.textContent = "₹" + money(total);
  }

  if (amountWords) {
    amountWords.value = numberToWords(Math.round(total)) + " Rupees Only";
  }
}

/* ===========================
   NUMBER TO WORDS
=========================== */

function numberToWords(num) {
  if (num === 0) {
    return "Zero";
  }

  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen"
  ];

  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety"
  ];

  function convertBelowHundred(n) {
    if (n < 20) {
      return ones[n];
    }

    return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  }

  function convertBelowThousand(n) {
    let words = "";

    if (n >= 100) {
      words += ones[Math.floor(n / 100)] + " Hundred";

      if (n % 100) {
        words += " ";
      }
    }

    words += convertBelowHundred(n % 100);

    return words.trim();
  }

  let words = "";

  const crore = Math.floor(num / 10000000);
  num %= 10000000;

  const lakh = Math.floor(num / 100000);
  num %= 100000;

  const thousand = Math.floor(num / 1000);
  num %= 1000;

  if (crore) {
    words += convertBelowThousand(crore) + " Crore ";
  }

  if (lakh) {
    words += convertBelowThousand(lakh) + " Lakh ";
  }

  if (thousand) {
    words += convertBelowThousand(thousand) + " Thousand ";
  }

  if (num) {
    words += convertBelowThousand(num);
  }

  return words.trim();
}

/* ===========================
   VALIDATION
=========================== */

function validateInvoice() {
  if (!invoiceNo.value.trim()) {
    showError("Please enter invoice number.");
    invoiceNo.focus();
    return false;
  }

  if (!invoiceDate.value) {
    showError("Please select invoice date.");
    invoiceDate.focus();
    return false;
  }

  const clientName = document.getElementById("clientName");

  if (!clientName.value.trim()) {
    showError("Please enter client name.");
    clientName.focus();
    return false;
  }

  let hasValidItem = false;

  document.querySelectorAll("#invoiceBody tr").forEach((row) => {
    const particular = row.querySelector(".particular")?.value.trim();
    const qty = parseFloat(row.querySelector(".qty")?.value) || 0;
    const rate = parseFloat(row.querySelector(".rate")?.value) || 0;

    if (particular && qty > 0 && rate > 0) {
      hasValidItem = true;
    }
  });

  if (!hasValidItem) {
    showError("Please enter at least one valid invoice item.");
    return false;
  }

  return true;
}

/* ===========================
   PRINT
=========================== */

function printInvoice() {
  calculateInvoice();
  window.print();
}

/* ===========================
   PDF DOWNLOAD
=========================== */

function downloadInvoicePdf() {
  if (!validateInvoice()) {
    return;
  }

  calculateInvoice();
  showLoading();

  const element = document.getElementById("invoicePrintArea");
  const fileName = buildPdfFileName();

  const options = {
    margin: 10,
    filename: fileName,
    image: {
      type: "jpeg",
      quality: 0.98
    },
    html2canvas: {
      scale: 2,
      useCORS: true
    },
    jsPDF: {
      unit: "mm",
      format: "a4",
      orientation: "portrait"
    }
  };

  html2pdf()
    .set(options)
    .from(element)
    .save()
    .then(() => {
      hideLoading();
      showSuccess();
    })
    .catch(() => {
      hideLoading();
      showError("Unable to generate PDF. Please try again.");
    });
}

function buildPdfFileName() {
  const baseName = pdfFileName?.value || "MNM-Invoice";
  const number = invoiceNo.value.trim() || "Draft";

  return `${baseName}-${number}.pdf`;
}

/* ===========================
   PREVIEW
=========================== */

function previewInvoice() {
  calculateInvoice();
  window.print();
}

/* ===========================
   CLEAR
=========================== */

function clearTable() {
  if (!confirm("Clear all invoice items?")) {
    return;
  }

  invoiceBody.innerHTML = "";
  createRow();
  calculateInvoice();
}

function clearInvoice() {
  if (!confirm("Clear the complete invoice?")) {
    return;
  }

  invoiceNo.value = "";
  document.getElementById("clientName").value = "";
  document.getElementById("clientMobile").value = "";
  document.getElementById("clientAddress").value = "";
  discountInput.value = "0";

  invoiceBody.innerHTML = "";
  createRow();

  setTodayDate();
  calculateInvoice();
}

/* ===========================
   POPUPS
=========================== */

function showLoading() {
  if (loadingPopup) {
    loadingPopup.style.display = "flex";
  }
}

function hideLoading() {
  if (loadingPopup) {
    loadingPopup.style.display = "none";
  }
}

function showSuccess() {
  if (successPopup) {
    successPopup.style.display = "flex";
  }
}

function hideSuccess() {
  if (successPopup) {
    successPopup.style.display = "none";
  }
}

function showError(message) {
  if (errorPopup && errorMessage) {
    errorMessage.textContent = message;
    errorPopup.style.display = "flex";
  } else {
    alert(message);
  }
}

function hideError() {
  if (errorPopup) {
    errorPopup.style.display = "none";
  }
}

/* ===========================
   EVENTS
=========================== */

if (addItemBtn) {
  addItemBtn.addEventListener("click", createRow);
}

if (clearTableBtn) {
  clearTableBtn.addEventListener("click", clearTable);
}

if (discountInput) {
  discountInput.addEventListener("input", calculateInvoice);
}

if (printBtn) {
  printBtn.addEventListener("click", printInvoice);
}

if (printInvoiceBottom) {
  printInvoiceBottom.addEventListener("click", printInvoice);
}

if (downloadPdf) {
  downloadPdf.addEventListener("click", downloadInvoicePdf);
}

if (downloadPdfBottom) {
  downloadPdfBottom.addEventListener("click", downloadInvoicePdf);
}

if (previewBtn) {
  previewBtn.addEventListener("click", previewInvoice);
}

if (clearInvoiceBtn) {
  clearInvoiceBtn.addEventListener("click", clearInvoice);
}

if (closeSuccessPopup) {
  closeSuccessPopup.addEventListener("click", hideSuccess);
}

if (closeErrorPopup) {
  closeErrorPopup.addEventListener("click", hideError);
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideSuccess();
    hideError();
    hideLoading();
  }
});
function buildPremiumInvoice() {
  const printBox = document.getElementById("premiumPrintInvoice");

  const invNo = invoiceNo.value || "";
  const date = invoiceDate.value
    ? invoiceDate.value.split("-").reverse().join("/")
    : "";

  const clientName = document.getElementById("clientName").value || "";
  const clientMobile = document.getElementById("clientMobile").value || "";
  const clientAddress = document.getElementById("clientAddress").value || "";
  const words = amountWords.value || "";

  let rows = "";
  let subtotal = 0;

  document.querySelectorAll("#invoiceBody tr").forEach((row, index) => {
    const particular = row.querySelector(".particular")?.value || "";
    const qty = parseFloat(row.querySelector(".qty")?.value) || 0;
    const rate = parseFloat(row.querySelector(".rate")?.value) || 0;
    const amount = qty * rate;

    subtotal += amount;

    rows += `
      <tr>
        <td>${index + 1}.</td>
        <td>${particular}</td>
        <td>${qty}</td>
        <td>${money(rate)}</td>
        <td>${money(amount)}</td>
      </tr>
    `;
  });

  const discount = parseFloat(discountInput.value) || 0;
  const total = Math.max(subtotal - discount, 0);

  printBox.innerHTML = `
    <div class="premium-head">
      <img src="images/letterhead-logo.png" alt="MNM Legal Associates">
      <div class="premium-office">
        <h1>MNM LEGAL ASSOCIATES</h1>
        <div>Adv. Aman Mishra | Adv. Sonali Pandey</div>
        <div>Office No. 511, Vedmata Cooperative Housing Society, IOC Road, Chandkheda, Ahmedabad, Gujarat - 382424</div>
        <div>Mo: +91 9898172734 | +91 9579220137</div>
        <div>Email: mnmlegal.in@gmail.com</div>
      </div>
    </div>

    <div class="premium-title">TAX INVOICE / PROFESSIONAL BILL</div>

    <div class="premium-meta">
      <div>Bill No: ${invNo}</div>
      <div>Date: ${date}</div>
    </div>

    <div class="premium-billto">
      <h3>BILL TO:</h3>
      <p>${clientName}</p>
      <p>Add: ${clientAddress}</p>
      <p>Mo: ${clientMobile}</p>
    </div>

    <table class="premium-table">
      <thead>
        <tr>
          <th>SR. NO</th>
          <th>PARTICULARS</th>
          <th>QTY.</th>
          <th>FEE (₹)</th>
          <th>AMOUNT (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr>
          <td colspan="4" class="premium-total-label">TOTAL</td>
          <td><strong>₹ ${money(total)}</strong></td>
        </tr>
      </tbody>
    </table>

    <div class="premium-words">
      <strong>AMOUNT IN WORDS:</strong><br>
      ${words}
    </div>

    <div class="premium-separator"></div>

    <div class="premium-notes">
      <h3>NOTES:</h3>
      <ul>
        <li>Professional charges are exclusive of court fees, government fees, stamp duty, registration charges and other statutory levies, wherever applicable.</li>
        <li>All out-of-pocket expenses including travel, courier/postal charges, documentation, photocopying, miscellaneous expenses and any other incidental expenses shall be borne by the Client.</li>
        <li>Fees for litigation, court appearances, appeals, execution proceedings or any additional legal work not specifically covered under this Invoice shall be charged separately.</li>
        <li>Professional fees paid against services rendered shall not ordinarily be refundable once the work has commenced.</li>
      </ul>
    </div>

    <div class="premium-sign">
      FOR MNM LEGAL ASSOCIATES
    </div>
  `;
}
