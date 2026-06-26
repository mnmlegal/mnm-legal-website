/* =====================================================
   MNM LEGAL ASSOCIATES
   invoice.js
   PART 1
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

const paymentInvoiceNo =
document.getElementById("paymentInvoiceNo");

/* ===========================
   INITIALIZE
=========================== */

let serial = 1;

setTodayDate();

calculateInvoice();

/* ===========================
   DATE
=========================== */

function setTodayDate(){

const d = new Date();

const yyyy = d.getFullYear();

const mm = String(
d.getMonth()+1
).padStart(2,"0");

const dd = String(
d.getDate()
).padStart(2,"0");

invoiceDate.value =
`${yyyy}-${mm}-${dd}`;

}

/* ===========================
   MONEY FORMAT
=========================== */

function money(value){

return Number(value).toLocaleString(
"en-IN",
{
minimumFractionDigits:2,
maximumFractionDigits:2
}
);

}

/* ===========================
   GENERATE ROW
=========================== */

function createRow(){

serial++;

const tr=document.createElement("tr");

tr.innerHTML=`

<td class="serial">
${serial}
</td>

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

/* ===========================
   BUTTON
=========================== */

addItemBtn.addEventListener(

"click",

createRow

);
/* =====================================================
   PART 2
   CALCULATION
===================================================== */

/* ===========================
   ROW EVENTS
=========================== */

function bindRowEvents(row){

row.querySelector(".qty")
.addEventListener("input",calculateInvoice);

row.querySelector(".rate")
.addEventListener("input",calculateInvoice);

row.querySelector(".delete-row")
.addEventListener("click",function(){

if(invoiceBody.rows.length===1){

alert("At least one item is required.");

return;

}

row.remove();

updateSerialNumbers();

calculateInvoice();

});

}

/* ===========================
   UPDATE SERIAL
=========================== */

function updateSerialNumbers(){

serial=0;

document
.querySelectorAll("#invoiceBody tr")
.forEach((row)=>{

serial++;

row.querySelector(".serial").textContent=
serial;

});

}

/* ===========================
   CALCULATE
=========================== */

function calculateInvoice(){

let subtotal=0;

document
.querySelectorAll("#invoiceBody tr")
.forEach((row)=>{

const qty=

parseFloat(
row.querySelector(".qty").value
)||0;

const rate=

parseFloat(
row.querySelector(".rate").value
)||0;

const amount=qty*rate;

row.querySelector(".amount").innerHTML=

"₹"+money(amount);

subtotal+=amount;

});

subTotal.innerHTML=

"₹"+money(subtotal);

const discount=

parseFloat(
discountInput.value
)||0;

let total=

subtotal-discount;

if(total<0){

total=0;

}

grandTotal.innerHTML=

"₹"+money(total);

amountWords.value=

numberToWords(
Math.round(total)
);

}

/* ===========================
   DISCOUNT
=========================== */

discountInput.addEventListener(

"input",

calculateInvoice

);

/* ===========================
   FIRST ROW EVENTS
=========================== */

document
.querySelectorAll("#invoiceBody tr")
.forEach(bindRowEvents);
