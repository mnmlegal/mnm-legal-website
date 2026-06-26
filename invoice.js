/* ==========================================
MNM LEGAL BILLING SYSTEM
invoice.js
Part 1/8
========================================== */

// ==============================
// GLOBAL ELEMENTS
// ==============================

const invoiceNo =
document.getElementById("invoiceNo");

const invoiceDate =
document.getElementById("invoiceDate");

const invoiceBody =
document.getElementById("invoiceBody");

const addItemBtn =
document.getElementById("addItemBtn");

const clearTableBtn =
document.getElementById("clearTableBtn");

const discountInput =
document.getElementById("discount");

const subTotal =
document.getElementById("subTotal");

const grandTotal =
document.getElementById("grandTotal");

const amountWords =
document.getElementById("amountWords");

const paymentInvoiceNo =
document.getElementById("paymentInvoiceNo");

// ==============================
// TODAY DATE
// ==============================

(function(){

const today = new Date();

const yyyy = today.getFullYear();

const mm = String(today.getMonth()+1).padStart(2,"0");

const dd = String(today.getDate()).padStart(2,"0");

invoiceDate.value =
`${yyyy}-${mm}-${dd}`;

})();

// ==============================
// RANDOM INVOICE NUMBER
// ==============================

(function(){

const now = new Date();

const random =
Math.floor(Math.random()*9000)+1000;

invoiceNo.value =
`MNM-${now.getFullYear()}-${random}`;

paymentInvoiceNo.textContent =
invoiceNo.value;

})();

// ==============================
// FORMAT CURRENCY
// ==============================

function money(value){

return Number(value).toLocaleString(
"en-IN",
{
minimumFractionDigits:2,
maximumFractionDigits:2
});

}

// ==============================
// CREATE NEW ROW
// ==============================

function createRow(){

const row =
document.createElement("tr");

row.innerHTML = `

<td>

<input
type="text"
class="particular"
placeholder="Legal Service">

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

invoiceBody.appendChild(row);

attachEvents(row);

}

// ==============================
// ADD BUTTON
// ==============================

addItemBtn.addEventListener(
"click",
createRow
);
/* ==========================================
CALCULATE ROW TOTAL
========================================== */

function calculateRow(row){

const qty =
Number(
row.querySelector(".qty").value
) || 0;

const rate =
Number(
row.querySelector(".rate").value
) || 0;

const total = qty * rate;

row.querySelector(".amount").innerHTML =
"₹" + money(total);

return total;

}

/* ==========================================
CALCULATE GRAND TOTAL
========================================== */

function calculateInvoice(){

let subtotal = 0;

const rows =
document.querySelectorAll("#invoiceBody tr");

rows.forEach(row=>{

subtotal += calculateRow(row);

});

subTotal.innerHTML =
"₹" + money(subtotal);

const discount =
Number(discountInput.value) || 0;

let grand =
subtotal-discount;

if(grand<0){

grand=0;

}

grandTotal.innerHTML =
"₹" + money(grand);

amountWords.value =
numberToWords(
Math.round(grand)
);

}

/* ==========================================
ATTACH EVENTS
========================================== */

function attachEvents(row){

row.querySelector(".qty")
.addEventListener(
"input",
calculateInvoice
);

row.querySelector(".rate")
.addEventListener(
"input",
calculateInvoice
);

const del =
row.querySelector(".delete-row");

del.addEventListener("click",()=>{

if(
document.querySelectorAll("#invoiceBody tr").length>1
){

row.remove();

calculateInvoice();

}

});

}

/* ==========================================
INITIAL EVENTS
========================================== */

document
.querySelectorAll("#invoiceBody tr")
.forEach(row=>{

attachEvents(row);

});

discountInput.addEventListener(

"input",

calculateInvoice

);

clearTableBtn.addEventListener(

"click",

()=>{

if(

confirm(

"Remove all invoice items?"

)

){

invoiceBody.innerHTML="";

createRow();

calculateInvoice();

}

}

);

calculateInvoice();
/* ==========================================
NUMBER TO WORDS (INDIAN FORMAT)
========================================== */

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

/* ==========================================
TWO DIGITS
========================================== */

function twoDigits(num){

if(num < 20){

return ones[num];

}

let t = Math.floor(num / 10);

let o = num % 10;

return tens[t] + (o ? " " + ones[o] : "");

}

/* ==========================================
THREE DIGITS
========================================== */

function threeDigits(num){

let word = "";

if(num >= 100){

word += ones[Math.floor(num/100)] + " Hundred ";

num = num % 100;

}

if(num > 0){

word += twoDigits(num);

}

return word.trim();

}

/* ==========================================
INDIAN NUMBER SYSTEM
========================================== */

function numberToWords(number){

if(number === 0){

return "Zero Rupees Only";

}

let result = "";

const crore = Math.floor(number / 10000000);

number %= 10000000;

const lakh = Math.floor(number / 100000);

number %= 100000;

const thousand = Math.floor(number / 1000);

number %= 1000;

const hundred = number;

if(crore){

result += threeDigits(crore) + " Crore ";

}

if(lakh){

result += threeDigits(lakh) + " Lakh ";

}

if(thousand){

result += threeDigits(thousand) + " Thousand ";

}

if(hundred){

result += threeDigits(hundred);

}

return result.trim() + " Rupees Only";

}

/* ==========================================
AUTO UPDATE WORDS
========================================== */

function updateAmountWords(){

const totalText =
grandTotal.innerText
.replace("₹","")
.replace(/,/g,"");

const amount =
Math.round(Number(totalText));

amountWords.value =
numberToWords(amount);

}

discountInput.addEventListener(

"input",

updateAmountWords

);

calculateInvoice();

updateAmountWords();
/* ==========================================
BUTTONS
========================================== */

const printBtn =
document.getElementById("printBtn");

const pdfBtn =
document.getElementById("downloadPdf");

const pdfBtnBottom =
document.getElementById("downloadPdfBottom");

const previewBtn =
document.getElementById("previewBtn");

const whatsappBtn =
document.getElementById("whatsappBtn");

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

const loadingPopup =
document.getElementById("loadingPopup");


/* ==========================================
SHOW ERROR
========================================== */

function showError(msg){

errorMessage.innerHTML = msg;

errorPopup.style.display = "flex";

}

closeErrorPopup.addEventListener(

"click",

()=>{

errorPopup.style.display="none";

}

);


/* ==========================================
SHOW SUCCESS
========================================== */

function showSuccess(){

successPopup.style.display="flex";

}

closeSuccessPopup.addEventListener(

"click",

()=>{

successPopup.style.display="none";

}

);


/* ==========================================
VALIDATION
========================================== */

function validateInvoice(){

if(

document.getElementById("clientName").value.trim()==""

){

showError(

"Please enter Client Name."

);

return false;

}


if(

document.getElementById("clientMobile").value.trim()==""

){

showError(

"Please enter Client Mobile Number."

);

return false;

}


const rows =
document.querySelectorAll("#invoiceBody tr");

let valid=false;

rows.forEach(row=>{

const p =
row.querySelector(".particular").value.trim();

const r =
Number(row.querySelector(".rate").value);

if(p!="" && r>0){

valid=true;

}

});

if(!valid){

showError(

"Please add at least one invoice item."

);

return false;

}

return true;

}


/* ==========================================
PRINT
========================================== */

function printInvoice(){

if(!validateInvoice()) return;

window.print();

}

printBtn.addEventListener(

"click",

printInvoice

);

previewBtn.addEventListener(

"click",

printInvoice

);


/* ==========================================
LOADING
========================================== */

function showLoading(){

loadingPopup.style.display="flex";

}

function hideLoading(){

loadingPopup.style.display="none";

}
/* ==========================================
PDF GENERATOR
========================================== */

function generatePDF(){

if(!validateInvoice()) return;

showLoading();

const element =
document.getElementById("invoicePrintArea");

const client =
document.getElementById("clientName")
.value
.trim()
.replace(/\s+/g,"_");

const invoice =
invoiceNo.value;

const filename =

(invoice=="" ? "Invoice" : invoice) +

(client=="" ? "" : "_" + client)

+ ".pdf";

const options = {

margin:0.35,

filename:filename,

image:{

type:"jpeg",

quality:1

},

html2canvas:{

scale:3,

useCORS:true,

logging:false,

letterRendering:true,

scrollY:0

},

jsPDF:{

unit:"in",

format:"a4",

orientation:"portrait"

},

pagebreak:{

mode:[
"avoid-all",
"css",
"legacy"
]

}

};

html2pdf()

.set(options)

.from(element)

.save()

.then(()=>{

hideLoading();

showSuccess();

})

.catch((err)=>{

hideLoading();

console.error(err);

showError(

"Unable to generate PDF."

);

});

}

/* ==========================================
DOWNLOAD BUTTONS
========================================== */

pdfBtn.addEventListener(

"click",

generatePDF

);

pdfBtnBottom.addEventListener(

"click",

generatePDF

);

/* ==========================================
AUTO FILE NAME UPDATE
========================================== */

document

.getElementById("clientName")

.addEventListener(

"input",

()=>{

document.getElementById("pdfFileName").value=

invoiceNo.value;

}

);

/* ==========================================
CTRL + P
========================================== */

document.addEventListener(

"keydown",

function(e){

if(

e.ctrlKey &&

e.key.toLowerCase()=="p"

){

e.preventDefault();

printInvoice();

}

}

);

/* ==========================================
CTRL + S
========================================== */

document.addEventListener(

"keydown",

function(e){

if(

e.ctrlKey &&

e.key.toLowerCase()=="s"

){

e.preventDefault();

generatePDF();

}

}

);
/* ==========================================
WHATSAPP
========================================== */

function sendWhatsApp(){

if(!validateInvoice()) return;

const client =
document.getElementById("clientName").value;

const mobile =
document.getElementById("clientMobile")
.value
.replace(/\D/g,"");

const total =
grandTotal.innerText;

const invoice =
invoiceNo.value;

let message =

`Hello ${client},

MNM Legal Associates

Invoice No : ${invoice}

Amount : ${total}

Thank you for choosing MNM Legal Associates.

Please find the attached Invoice PDF.

`;

const url =

mobile.length >= 10

?

`https://wa.me/91${mobile}?text=${encodeURIComponent(message)}`

:

`https://wa.me/?text=${encodeURIComponent(message)}`;

window.open(

url,

"_blank"

);

}

whatsappBtn.addEventListener(

"click",

sendWhatsApp

);

/* ==========================================
CLEAR COMPLETE FORM
========================================== */

const clearInvoiceBtn =
document.getElementById("clearInvoiceBtn");

function clearInvoice(){

if(

!confirm(

"Clear complete invoice?"

)

){

return;

}

document.getElementById("clientName").value="";

document.getElementById("clientMobile").value="";

document.getElementById("clientAddress").value="";

document.getElementById("transactionRef").value="";

document.getElementById("notes").value="Professional fees towards legal consultation, drafting, appearance and other agreed legal services.\n\nCourt fees, Government fees, Stamp Duty, Registration Charges, Travelling Expenses and other out-of-pocket expenses shall be borne separately unless otherwise agreed.\n\nProfessional fees once paid shall ordinarily not be refundable after commencement of work.";

discountInput.value=0;

invoiceBody.innerHTML="";

createRow();

generateInvoiceNumber();

setTodayDate();

calculateInvoice();

updateAmountWords();

}

clearInvoiceBtn.addEventListener(

"click",

clearInvoice

);

/* ==========================================
NEW INVOICE NUMBER
========================================== */

function generateInvoiceNumber(){

const now = new Date();

const year = now.getFullYear();

const random =
Math.floor(Math.random()*9000)+1000;

invoiceNo.value =

`MNM-${year}-${random}`;

paymentInvoiceNo.innerHTML =
invoiceNo.value;

}

/* ==========================================
TODAY DATE
========================================== */

function setTodayDate(){

const d = new Date();

const yyyy = d.getFullYear();

const mm =
String(d.getMonth()+1)
.padStart(2,"0");

const dd =
String(d.getDate())
.padStart(2,"0");

invoiceDate.value =

`${yyyy}-${mm}-${dd}`;

}

/* ==========================================
INITIALIZE
========================================== */

generateInvoiceNumber();

setTodayDate();

calculateInvoice();

updateAmountWords();
/* ==========================================
AUTO SAVE DRAFT
========================================== */

function saveDraft(){

const data={

invoiceNo:invoiceNo.value,

invoiceDate:invoiceDate.value,

clientName:document.getElementById("clientName").value,

clientMobile:document.getElementById("clientMobile").value,

clientAddress:document.getElementById("clientAddress").value,

discount:discountInput.value,

paymentMode:document.getElementById("paymentMode").value,

paymentStatus:document.getElementById("paymentStatus").value,

transactionRef:document.getElementById("transactionRef").value,

notes:document.getElementById("notes").value

};

localStorage.setItem(

"mnmInvoiceDraft",

JSON.stringify(data)

);

}

/* ==========================================
RESTORE DRAFT
========================================== */

function restoreDraft(){

const draft=

localStorage.getItem(

"mnmInvoiceDraft"

);

if(!draft) return;

const data=

JSON.parse(draft);

invoiceNo.value=data.invoiceNo||invoiceNo.value;

invoiceDate.value=data.invoiceDate||invoiceDate.value;

document.getElementById("clientName").value=data.clientName||"";

document.getElementById("clientMobile").value=data.clientMobile||"";

document.getElementById("clientAddress").value=data.clientAddress||"";

discountInput.value=data.discount||0;

document.getElementById("paymentMode").value=data.paymentMode||"Cash";

document.getElementById("paymentStatus").value=data.paymentStatus||"Paid";

document.getElementById("transactionRef").value=data.transactionRef||"";

document.getElementById("notes").value=data.notes||"";

calculateInvoice();

updateAmountWords();

}

/* ==========================================
AUTO SAVE EVENTS
========================================== */

document

.querySelectorAll(

"input, textarea, select"

)

.forEach(el=>{

el.addEventListener(

"input",

saveDraft

);

el.addEventListener(

"change",

saveDraft

);

});

/* ==========================================
KEYBOARD SHORTCUTS
========================================== */

document.addEventListener(

"keydown",

function(e){

if(e.ctrlKey && e.key==="n"){

e.preventDefault();

clearInvoice();

}

if(e.ctrlKey && e.key==="d"){

e.preventDefault();

createRow();

calculateInvoice();

}

});

/* ==========================================
WINDOW LOAD
========================================== */

window.addEventListener(

"load",

()=>{

restoreDraft();

calculateInvoice();

updateAmountWords();

});

/* ==========================================
BEFORE UNLOAD
========================================== */

window.addEventListener(

"beforeunload",

saveDraft

);
/* ==========================================
MNM LEGAL BILLING SYSTEM
FINAL INITIALIZATION
Part 8/8
========================================== */

/* ===============================
AUTO FOCUS
=============================== */

window.addEventListener("load",()=>{

const clientName =
document.getElementById("clientName");

if(clientName){

clientName.focus();

}

});

/* ===============================
SAFE BUTTON BINDING
=============================== */

function bindButton(id,callback){

const btn=document.getElementById(id);

if(btn){

btn.removeEventListener("click",callback);

btn.addEventListener("click",callback);

}

}

bindButton("printBtn",printInvoice);

bindButton("downloadPdf",generatePDF);

bindButton("downloadPdfBottom",generatePDF);

bindButton("previewBtn",printInvoice);

bindButton("whatsappBtn",sendWhatsApp);

bindButton("clearInvoiceBtn",clearInvoice);

/* ===============================
AUTO CALCULATE
=============================== */

document.addEventListener("input",(e)=>{

if(

e.target.classList.contains("qty") ||

e.target.classList.contains("rate")

){

calculateInvoice();

updateAmountWords();

saveDraft();

}

});

/* ===============================
ENTER KEY NAVIGATION
=============================== */

document.addEventListener("keydown",function(e){

if(e.key==="Enter"){

const tag=e.target.tagName.toLowerCase();

if(tag==="input"){

e.preventDefault();

const fields=[

...document.querySelectorAll(

"input,textarea,select"

)

];

const index=

fields.indexOf(e.target);

if(index>-1 && index<fields.length-1){

fields[index+1].focus();

}

}

}

});

/* ===============================
REMOVE EMPTY ROWS
=============================== */

function removeEmptyRows(){

const rows=

document.querySelectorAll("#invoiceBody tr");

rows.forEach(row=>{

const particular=

row.querySelector(".particular").value.trim();

const qty=

Number(row.querySelector(".qty").value);

const rate=

Number(row.querySelector(".rate").value);

if(

particular==="" &&

qty===0 &&

rate===0 &&

rows.length>1

){

row.remove();

}

});

}

/* ===============================
AUTO CLEANUP
=============================== */

setInterval(()=>{

removeEmptyRows();

},10000);

/* ===============================
VERSION
=============================== */

console.log(
"%cMNM LEGAL BILLING SYSTEM",
"color:#d4af37;font-size:18px;font-weight:bold;"
);

console.log(
"Version : 1.0.0"
);

console.log(
"Developed for MNM Legal Associates"
);

/* ===============================
START APPLICATION
=============================== */

generateInvoiceNumber();

setTodayDate();

calculateInvoice();

updateAmountWords();

restoreDraft();

console.log(
"Invoice Generator Ready."
);

/* ==========================================
END OF FILE
========================================== */
