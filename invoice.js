/* ==========================================================
   MNM LEGAL ASSOCIATES
   INVOICE GENERATOR
   invoice.js
   PART 1A
   ========================================================== */

/* ==========================================================
   ELEMENT REFERENCES
========================================================== */

const invoiceNo = document.getElementById("invoiceNo");
const invoiceDate = document.getElementById("invoiceDate");

const clientName = document.getElementById("clientName");
const clientMobile = document.getElementById("clientMobile");
const clientAddress = document.getElementById("clientAddress");

const invoiceBody = document.getElementById("invoiceBody");

const addItemBtn = document.getElementById("addItemBtn");
const clearTableBtn = document.getElementById("clearTableBtn");
const clearInvoiceBtn = document.getElementById("clearInvoiceBtn");

const discountInput = document.getElementById("discount");

const subTotal = document.getElementById("subTotal");
const grandTotal = document.getElementById("grandTotal");
const amountWords = document.getElementById("amountWords");

const notes = document.getElementById("notes");

const printBtn = document.getElementById("printBtn");
const printInvoiceBottom =
document.getElementById("printInvoiceBottom");

const previewBtn =
document.getElementById("previewBtn");

const downloadPdf =
document.getElementById("downloadPdf");

const downloadPdfBottom =
document.getElementById("downloadPdfBottom");

const loadingPopup =
document.getElementById("loadingPopup");

const successPopup =
document.getElementById("successPopup");

const errorPopup =
document.getElementById("errorPopup");

const errorMessage =
document.getElementById("errorMessage");

const closeSuccessPopup =
document.getElementById("closeSuccessPopup");

const closeErrorPopup =
document.getElementById("closeErrorPopup");

const paymentInvoiceNo =
document.getElementById("paymentInvoiceNo");

const invoicePrintArea =
document.getElementById("invoicePrintArea");


/* ==========================================================
   GLOBAL VARIABLES
========================================================== */

let serial = 1;

const DEFAULT_NOTE = `Professional fees towards legal consultation, drafting, appearance and other agreed legal services.

Court fees, Government fees, Stamp Duty, Registration Charges, Travelling Expenses and other out-of-pocket expenses shall be borne separately unless specifically agreed.

Professional fees once paid shall ordinarily not be refundable after commencement of work.`;


/* ==========================================================
   INITIALIZE
========================================================== */

window.addEventListener("DOMContentLoaded", initializeInvoice);

function initializeInvoice(){

    setTodayDate();

    generateInvoiceNumber();

    if(notes){
        notes.value = DEFAULT_NOTE;
    }

    bindExistingRows();

    bindGlobalEvents();

    calculateInvoice();

}


/* ==========================================================
   BIND GLOBAL EVENTS
========================================================== */

function bindGlobalEvents(){

    if(addItemBtn){

        addItemBtn.addEventListener(
            "click",
            createRow
        );

    }

    if(discountInput){

        discountInput.addEventListener(
            "input",
            calculateInvoice
        );

    }

}


/* ==========================================================
   TODAY DATE
========================================================== */

function setTodayDate(){

    const today = new Date();

    invoiceDate.value = today
        .toISOString()
        .split("T")[0];

}


/* ==========================================================
   AUTO INVOICE NUMBER
========================================================== */

function generateInvoiceNumber(){

    const today = new Date();

    const yyyy = today.getFullYear();

    const mm = String(
        today.getMonth()+1
    ).padStart(2,"0");

    const dd = String(
        today.getDate()
    ).padStart(2,"0");

    const key =
        `mnm_invoice_${yyyy}${mm}${dd}`;

    let count =
        Number(localStorage.getItem(key)) || 0;

    count++;

    localStorage.setItem(key,count);

    const serialNo =
        String(count).padStart(3,"0");

    invoiceNo.value =
        `INV-${yyyy}${mm}${dd}-${serialNo}`;

}


/* ==========================================================
   MONEY FORMAT
========================================================== */

function money(value){

    return Number(value).toLocaleString(

        "en-IN",

        {

            minimumFractionDigits:2,

            maximumFractionDigits:2

        }

    );

}


/* ==========================================================
   SHOW ERROR
========================================================== */

function showError(message){

    if(errorPopup){

        errorMessage.textContent = message;

        errorPopup.style.display = "flex";

    }

    else{

        alert(message);

    }

}


/* ==========================================================
   SHOW SUCCESS
========================================================== */

function showSuccess(){

    if(successPopup){

        successPopup.style.display = "flex";

    }

}


/* ==========================================================
   CLOSE POPUPS
========================================================== */

if(closeSuccessPopup){

    closeSuccessPopup.onclick = function(){

        successPopup.style.display="none";

    };

}

if(closeErrorPopup){

    closeErrorPopup.onclick = function(){

        errorPopup.style.display="none";

    };

}


/* ==========================================================
   LOADING POPUP
========================================================== */

function showLoading(){

    if(loadingPopup){

        loadingPopup.style.display="flex";

    }

}

function hideLoading(){

    if(loadingPopup){

        loadingPopup.style.display="none";

    }

}


/* ==========================================================
   BIND FIRST ROW
========================================================== */

function bindExistingRows(){

    document
    .querySelectorAll("#invoiceBody tr")
    .forEach(bindRowEvents);

}
/* ==========================================================
   ROW CREATION
========================================================== */

function createRow(){

    serial++;

    const tr = document.createElement("tr");

    tr.innerHTML = `

        <td class="serial">${serial}</td>

        <td>
            <input
                type="text"
                class="particular"
                placeholder="Professional Charges">
        </td>

        <td>
            <input
                type="number"
                class="qty"
                value="1"
                min="1">
        </td>

        <td>
            <input
                type="number"
                class="rate"
                value="0"
                min="0">
        </td>

        <td class="amount">
            ₹0.00
        </td>

        <td>

            <button
                type="button"
                class="delete-row">

                <i class="fa-solid fa-trash"></i>

            </button>

        </td>

    `;

    invoiceBody.appendChild(tr);

    bindRowEvents(tr);

    calculateInvoice();

}


/* ==========================================================
   ROW EVENTS
========================================================== */

function bindRowEvents(row){

    const qty =
    row.querySelector(".qty");

    const rate =
    row.querySelector(".rate");

    const remove =
    row.querySelector(".delete-row");

    qty.addEventListener(
        "input",
        calculateInvoice
    );

    rate.addEventListener(
        "input",
        calculateInvoice
    );

    remove.addEventListener(

        "click",

        function(){

            if(invoiceBody.rows.length===1){

                showError(
                    "At least one invoice item is required."
                );

                return;

            }

            row.remove();

            updateSerialNumbers();

            calculateInvoice();

        }

    );

}


/* ==========================================================
   UPDATE SERIAL NUMBERS
========================================================== */

function updateSerialNumbers(){

    serial = 0;

    document

    .querySelectorAll("#invoiceBody tr")

    .forEach(function(row){

        serial++;

        row.querySelector(".serial").textContent =
        serial;

    });

}


/* ==========================================================
   CALCULATE INVOICE
========================================================== */

function calculateInvoice(){

    let subtotal = 0;

    document

    .querySelectorAll("#invoiceBody tr")

    .forEach(function(row){

        const qty =

        parseFloat(
            row.querySelector(".qty").value
        ) || 0;

        const rate =

        parseFloat(
            row.querySelector(".rate").value
        ) || 0;

        const amount =
        qty * rate;

        row.querySelector(".amount").innerHTML =

        "₹" + money(amount);

        subtotal += amount;

    });

    subTotal.innerHTML =
    "₹" + money(subtotal);

    let discount =

    parseFloat(
        discountInput.value
    ) || 0;

    if(discount < 0){

        discount = 0;

        discountInput.value = 0;

    }

    let total = subtotal - discount;

    if(total < 0){

        total = 0;

    }

    grandTotal.innerHTML =
    "₹" + money(total);

    amountWords.value =
    numberToWords(
        Math.round(total)
    );

    if(paymentInvoiceNo){

        paymentInvoiceNo.value =
        invoiceNo.value;

    }

}


/* ==========================================================
   CLEAR ALL ITEMS
========================================================== */

if(clearTableBtn){

    clearTableBtn.addEventListener(

        "click",

        function(){

            if(

                !confirm(
                    "Remove all invoice items?"
                )

            ){

                return;

            }

            invoiceBody.innerHTML = "";

            serial = 0;

            createRow();

        }

    );

}


/* ==========================================================
   CLEAR COMPLETE INVOICE
========================================================== */

if(clearInvoiceBtn){

    clearInvoiceBtn.addEventListener(

        "click",

        function(){

            if(

                !confirm(
                    "Clear complete invoice?"
                )

            ){

                return;

            }

            clientName.value = "";

            clientMobile.value = "";

            clientAddress.value = "";

            discountInput.value = 0;

            amountWords.value = "";

            notes.value = DEFAULT_NOTE;

            invoiceBody.innerHTML = "";

            serial = 0;

            generateInvoiceNumber();

            createRow();

            calculateInvoice();

        }

    );

}
/* ==========================================================
   PART 2
   VALIDATION + NUMBER TO WORDS
========================================================== */

/* ==========================================================
   VALIDATE INVOICE
========================================================== */

function validateInvoice(){

    if(clientName.value.trim()===""){

        showError("Please enter client name.");

        clientName.focus();

        return false;

    }

    if(clientMobile.value.trim()===""){

        showError("Please enter mobile number.");

        clientMobile.focus();

        return false;

    }

    let hasItem=false;

    document
    .querySelectorAll("#invoiceBody tr")
    .forEach(function(row){

        const particular=
        row.querySelector(".particular").value.trim();

        const rate=
        parseFloat(
            row.querySelector(".rate").value
        )||0;

        if(particular!=="" && rate>0){

            hasItem=true;

        }

    });

    if(!hasItem){

        showError(
            "Please add at least one valid invoice item."
        );

        return false;

    }

    return true;

}


/* ==========================================================
   NUMBER TO WORDS
   INDIAN FORMAT
========================================================== */

const ones=[

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

const tens=[

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

function twoDigitWords(num){

    if(num<20){

        return ones[num];

    }

    return (

        tens[Math.floor(num/10)] +

        (num%10
            ? " "+ones[num%10]
            : "")

    );

}

function threeDigitWords(num){

    let str="";

    if(num>=100){

        str+=

        ones[Math.floor(num/100)] +

        " Hundred";

        num%=100;

        if(num){

            str+=" ";

        }

    }

    if(num){

        str+=twoDigitWords(num);

    }

    return str;

}

function numberToWords(number){

    number=Math.floor(number);

    if(number===0){

        return "Zero Rupees Only";

    }

    let result="";

    const crore=

    Math.floor(number/10000000);

    number%=10000000;

    const lakh=

    Math.floor(number/100000);

    number%=100000;

    const thousand=

    Math.floor(number/1000);

    number%=1000;

    const hundred=number;

    if(crore){

        result+=

        threeDigitWords(crore)+

        " Crore ";

    }

    if(lakh){

        result+=

        threeDigitWords(lakh)+

        " Lakh ";

    }

    if(thousand){

        result+=

        threeDigitWords(thousand)+

        " Thousand ";

    }

    if(hundred){

        result+=

        threeDigitWords(hundred);

    }

    result=result.trim();

    return result+" Rupees Only";

}


/* ==========================================================
   LIVE UPDATE
========================================================== */

clientName.addEventListener(

    "input",

    calculateInvoice

);

clientMobile.addEventListener(

    "input",

    calculateInvoice

);

clientAddress.addEventListener(

    "input",

    calculateInvoice

);


/* ==========================================================
   PREVENT NEGATIVE VALUES
========================================================== */

document

.querySelectorAll(

'.qty,.rate,#discount'

)

.forEach(function(input){

    input.addEventListener(

        "input",

        function(){

            if(Number(this.value)<0){

                this.value=0;

            }

        }

    );

});


/* ==========================================================
   ENTER KEY NAVIGATION
========================================================== */

document.addEventListener(

    "keydown",

    function(e){

        if(e.key!=="Enter"){

            return;

        }

        const fields=[

            ...document.querySelectorAll(

            "input,textarea"

            )

        ];

        const index=

        fields.indexOf(

            document.activeElement

        );

        if(index>-1){

            e.preventDefault();

            const next=

            fields[index+1];

            if(next){

                next.focus();

                next.select?.();

            }

        }

    }

);
/* ==========================================================
   PART 4
   PRINT • PDF • PREVIEW • POPUPS
========================================================== */

/* ==========================================================
   PRINT
========================================================== */

function printInvoice(){

    if(!validateInvoice()) return;

    window.print();

}

if(printBtn){

    printBtn.addEventListener(

        "click",

        printInvoice

    );

}

if(printInvoiceBottom){

    printInvoiceBottom.addEventListener(

        "click",

        printInvoice

    );

}


/* ==========================================================
   PREVIEW
========================================================== */

function previewInvoice(){

    if(!validateInvoice()) return;

    const previewWindow =

    window.open(

        "",

        "_blank"

    );

    previewWindow.document.write(`

        <html>

        <head>

        <title>

        Invoice Preview

        </title>

        <link
        rel="stylesheet"
        href="style.css">

        <link
        rel="stylesheet"
        href="invoice.css">

        </head>

        <body>

        ${invoicePrintArea.outerHTML}

        </body>

        </html>

    `);

    previewWindow.document.close();

}

if(previewBtn){

    previewBtn.addEventListener(

        "click",

        previewInvoice

    );

}


/* ==========================================================
   PDF DOWNLOAD
========================================================== */

function downloadInvoicePDF(){

    if(!validateInvoice()) return;

    showLoading();

    const opt={

        margin:0,

        filename:

        invoiceNo.value+".pdf",

        image:{

            type:"jpeg",

            quality:1

        },

        html2canvas:{

            scale:2,

            useCORS:true,

            scrollY:0

        },

        jsPDF:{

            unit:"mm",

            format:"a4",

            orientation:"portrait"

        }

    };

    html2pdf()

    .set(opt)

    .from(invoicePrintArea)

    .save()

    .then(function(){

        hideLoading();

        showSuccess();

    })

    .catch(function(){

        hideLoading();

        showError(

            "Unable to generate PDF."

        );

    });

}

if(downloadPdf){

    downloadPdf.addEventListener(

        "click",

        downloadInvoicePDF

    );

}

if(downloadPdfBottom){

    downloadPdfBottom.addEventListener(

        "click",

        downloadInvoicePDF

    );

}


/* ==========================================================
   CLOSE POPUPS
========================================================== */

window.addEventListener(

    "click",

    function(e){

        if(

            e.target===successPopup

        ){

            successPopup.style.display="none";

        }

        if(

            e.target===errorPopup

        ){

            errorPopup.style.display="none";

        }

    }

);


/* ==========================================================
   ESC KEY
========================================================== */

document.addEventListener(

    "keydown",

    function(e){

        if(e.key==="Escape"){

            if(successPopup){

                successPopup.style.display="none";

            }

            if(errorPopup){

                errorPopup.style.display="none";

            }

        }

    }

);


/* ==========================================================
   AUTO CALCULATE ON LOAD
========================================================== */

window.addEventListener(

    "load",

    function(){

        calculateInvoice();

    }

);


/* ==========================================================
   END OF FILE
========================================================== */
