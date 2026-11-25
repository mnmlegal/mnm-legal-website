


import { auth, db } from './firebase-config.js';
import { verifyStaffAccess } from './auth.js';
import { collection, doc, getDocFromServer, getDocsFromServer, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';

export const FINANCE_CONFIG = Object.freeze({version:'1.2.0', currency:'INR', timeZone:'Asia/Kolkata', maxAmountPaise:1000000000000});
export const INCOME_CATEGORIES = ['Professional Fees','Consultation Fees','Drafting Fees','Appearance Fees','Retainer Fees','Documentation Fees','Registration Fees','Other Income'];
export const EXPENSE_CATEGORIES = ['Office Rent','Staff Salary','Court Expenses','Travel Expenses','Printing & Stationery','Electricity & Internet','Software & Subscription','Office Maintenance','Professional Expenses','Other Expenses'];
export const TRANSACTION_TYPES = ['income','expense','advance','advance_utilization','advance_refund','refund','capital_in','capital_out','reversal'];
export const PAYMENT_MODES = ['cash','upi','neft','rtgs','imps','cheque','bank_transfer','card','other'];
const C={transactions:'financeTransactions',agreements:'feeAgreements',sequences:'financeSequences',links:'invoiceLinks',settings:'financeSettings'};
const ref=(c,id)=>doc(db,c,id);
const fail=m=>{throw new Error(m)};
async function admin(){await auth.authStateReady();const u=auth.currentUser;if(!u)fail('Sign in required.');const p=await verifyStaffAccess(u);if(!p?.active||p.role!=='admin'||auth.currentUser?.uid!==u.uid)fail('Administrator access required.');return u.uid;}
function session(uid){if(auth.currentUser?.uid!==uid)fail('Session changed.');}
function str(v,max,required=false){const s=String(v??'').trim();if(s.length>max||(required&&!s))fail('Invalid text field.');return s;}
function id(v,required=false){const s=str(v,128,required);if(s&&!/^[A-Za-z0-9_-]+$/.test(s))fail('Invalid record ID.');return s;}
export function getIndianDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function date(v,required=false){const s=str(v,10,required);if(s&&(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s))fail('Invalid date.');return s;}
export function getFinancialYear(d=getIndianDate()){date(d,true);const y=Number(d.slice(0,4))-(Number(d.slice(5,7))<4?1:0);return `${y}-${String(y+1).slice(-2)}`;}
export function rupeesToPaise(v){const s=String(v).trim();if(!/^\d+(\.\d{1,2})?$/.test(s))fail('Enter a valid rupee amount.');const [a,b='']=s.split('.');return amount(Number(a)*100+Number(b.padEnd(2,'0')));}
function amount(v){if(!Number.isSafeInteger(v)||v<=0||v>FINANCE_CONFIG.maxAmountPaise)fail('Invalid amount in paise.');return v;}
export const formatMoney=p=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(p/100);
export const generateTransactionId=()=>doc(collection(db,C.transactions)).id;
export const generateAgreementId=()=>doc(collection(db,C.agreements)).id;
export const formatTransactionCode=(y,n)=>`MNM/FIN/${String(n).padStart(3,'0')}/${y}`;
async function all(c,uid){const s=await getDocsFromServer(collection(db,c));session(uid);return s.docs.map(d=>({...d.data(),id:d.id}));}
async function one(c,i,uid){const s=await getDocFromServer(ref(c,id(i,true)));session(uid);if(!s.exists())fail('Record not found.');return {...s.data(),id:s.id};}
export async function fetchTransactions(){return (await all(C.transactions,await admin())).sort((a,b)=>b.transactionDate.localeCompare(a.transactionDate)||b.sequenceNumber-a.sequenceNumber);}
export async function fetchFeeAgreements(){return all(C.agreements,await admin());}
export async function fetchInvoiceLinks(){return all(C.links,await admin());}
export async function fetchFinanceClients(){return all('clients',await admin());}
export async function fetchFinanceCases(){return all('cases',await admin());}
export async function fetchFinanceInvoices(){return all('invoices',await admin());}
export async function getTransaction(i){return one(C.transactions,i,await admin());}
export async function getNextTransactionCode(d=getIndianDate()){const uid=await admin(),y=getFinancialYear(d),s=await getDocFromServer(ref(C.sequences,y));session(uid);return formatTransactionCode(y,s.exists()?s.data().nextSequence:1);}
function normalize(input){const t={transactionDate:date(input.transactionDate,true),transactionType:str(input.transactionType,40,true),category:str(input.category,150,true),amountPaise:amount(input.amountPaise),clientId:id(input.clientId),caseId:id(input.caseId),invoiceId:id(input.invoiceId),feeAgreementId:id(input.feeAgreementId),paymentMode:str(input.paymentMode,40,true),paymentReference:str(input.paymentReference,250),description:str(input.description,5000,true)};if(!TRANSACTION_TYPES.includes(t.transactionType)||t.transactionType==='reversal'||!PAYMENT_MODES.includes(t.paymentMode))fail('Invalid transaction type or payment mode.');if(t.transactionDate>getIndianDate())fail('Future payment dates are not allowed.');if((t.caseId||t.invoiceId||t.feeAgreementId||t.transactionType.startsWith('advance'))&&!t.clientId)fail('Client required.');if(t.feeAgreementId&&!['income','refund'].includes(t.transactionType))fail('Only fee receipts or refunds may link to a fee agreement.');if(t.invoiceId&&!['income','refund'].includes(t.transactionType))fail('Only fee receipts or refunds may link to an invoice.');return t;}
async function association(tx,d){if(d.clientId&&!(await tx.get(ref('clients',d.clientId))).exists())fail('Client not found.');if(d.caseId){const s=await tx.get(ref('cases',d.caseId));if(!s.exists())fail('Case not found.');if(s.data().clientId!==d.clientId){const l=await tx.get(doc(db,'cases',d.caseId,'linkedClients',d.clientId));if(!l.exists()||l.data().active!==true)fail('Client not linked to case.');}}for(const [field,c] of [['invoiceId',C.links],['feeAgreementId',C.agreements]])if(d[field]){const s=await tx.get(ref(c,d[field]));if(!s.exists()||s.data().clientId!==d.clientId||s.data().caseId!==d.caseId)fail('Invalid financial association.');}}
function writeTransaction(tx,i,d,y,seq,uid,reversalOf=''){const payment=['income','refund','reversal'].includes(d.transactionType);if(payment){d={...d,paymentRequestId:i};tx.set(ref('paymentRequests',i),{transactionId:i,createdAt:serverTimestamp(),createdBy:uid});}const code=formatTransactionCode(y,seq);tx.set(ref(C.transactions,i),{...d,id:i,transactionCode:code,sequenceNumber:seq,financialYear:y,status:'posted',reversalOf,createdAt:serverTimestamp(),createdBy:uid});tx.set(ref(C.sequences,y),{year:y,nextSequence:seq+1,lastTransactionId:i,lastTransactionCode:code,updatedAt:serverTimestamp(),updatedBy:uid});}
export async function createTransaction(input,requestedId=generateTransactionId()){const uid=await admin(),d=normalize(input),i=id(requestedId,true),y=getFinancialYear(d.transactionDate);if(['advance_utilization','advance_refund'].includes(d.transactionType)){const rows=await all(C.transactions,uid);if(getClientAdvanceBalance(rows,d.clientId)<d.amountPaise)fail('Insufficient client advance balance.');}await runTransaction(db,async tx=>{session(uid);const old=await tx.get(ref(C.transactions,i));if(old.exists()){if(Object.keys(d).every(k=>old.data()[k]===d[k]))return;fail('Transaction ID already used.');}const s=await tx.get(ref(C.sequences,y));await association(tx,d);session(uid);writeTransaction(tx,i,d,y,s.exists()?s.data().nextSequence:1,uid);});return one(C.transactions,i,uid);}
export async function reverseTransaction(originalId,reason,requestedId=generateTransactionId()){const uid=await admin(),i=id(requestedId,true),o=id(originalId,true),why=str(reason,4900,true),today=getIndianDate(),y=getFinancialYear(today);await runTransaction(db,async tx=>{session(uid);const old=await tx.get(ref(C.transactions,o)),existing=await tx.get(ref(C.transactions,i));if(existing.exists()){if(existing.data().reversalOf===o&&existing.data().description===`Reversal: ${why}`)return;fail('Reversal ID already used.');}if(!old.exists()||old.data().status!=='posted'||old.data().transactionType==='reversal')fail('Transaction cannot be reversed.');const s=await tx.get(ref(C.sequences,y)),a=old.data();const d={transactionDate:today,transactionType:'reversal',category:a.category,amountPaise:a.amountPaise,clientId:a.clientId,caseId:a.caseId,invoiceId:a.invoiceId,feeAgreementId:a.feeAgreementId,paymentMode:a.paymentMode,paymentReference:a.paymentReference,description:`Reversal: ${why}`};session(uid);writeTransaction(tx,i,d,y,s.exists()?s.data().nextSequence:1,uid,o);tx.update(ref(C.transactions,o),{status:'reversed',reversedById:i,reversedAt:serverTimestamp(),reversedBy:uid});});return one(C.transactions,i,uid);}
export async function createFeeAgreement(input,requestedId=generateAgreementId()){const uid=await admin(),i=id(requestedId,true),d={id:i,clientId:id(input.clientId,true),caseId:id(input.caseId),title:str(input.title,500,true),agreedAmountPaise:amount(input.agreedAmountPaise),agreementDate:date(input.agreementDate,true),dueDate:date(input.dueDate),notes:str(input.notes,10000)};await runTransaction(db,async tx=>{const s=await tx.get(ref(C.agreements,i));if(s.exists()){if(Object.keys(d).every(k=>s.data()[k]===d[k]))return;fail('Agreement ID already used.');}await association(tx,d);session(uid);tx.set(ref(C.agreements,i),{...d,status:'active',revision:1,createdAt:serverTimestamp(),createdBy:uid,updatedAt:serverTimestamp(),updatedBy:uid});});return one(C.agreements,i,uid);}
export async function updateFeeAgreement(i,input,expectedRevision){const uid=await admin();i=id(i,true);await runTransaction(db,async tx=>{const s=await tx.get(ref(C.agreements,i));if(!s.exists()||s.data().revision!==expectedRevision)fail('Agreement changed. Refresh first.');const a=s.data(),status=input.status??a.status;if(!['active','closed'].includes(status))fail('Invalid status.');session(uid);tx.update(ref(C.agreements,i),{title:str(input.title??a.title,500,true),dueDate:date(input.dueDate??a.dueDate),notes:str(input.notes??a.notes,10000),status,revision:a.revision+1,updatedAt:serverTimestamp(),updatedBy:uid});});return one(C.agreements,i,uid);}
export async function linkInvoice(invoiceId,clientId,caseId=''){const uid=await admin(),i=id(invoiceId,true),d={invoiceId:i,clientId:id(clientId,true),caseId:id(caseId)};await runTransaction(db,async tx=>{const old=await tx.get(ref(C.links,i));if(old.exists()){if(old.data().clientId===d.clientId&&old.data().caseId===d.caseId)return;fail('Invoice already linked.');}if(!(await tx.get(ref('invoices',i))).exists())fail('Invoice not found.');await association(tx,{...d,invoiceId:''});session(uid);tx.set(ref(C.links,i),{...d,createdAt:serverTimestamp(),createdBy:uid});});return one(C.links,i,uid);}
// Reversals are booked on their own dates; original entries remain in historical reports.
function effects(rows){const map=new Map(rows.map(r=>[r.id,r]));return rows.map(r=>{if(r.transactionType!=='reversal')return {...r,effectiveType:r.transactionType,signedAmount:r.amountPaise};const old=map.get(r.reversalOf);if(!old)fail('Missing original transaction for reversal. Load full ledger.');return {...r,effectiveType:old.transactionType,signedAmount:-r.amountPaise};});}
export function calculateFinanceStatistics(rows,{from='',to='',clientId='',caseId=''}={}){const out={incomePaise:0,expensePaise:0,advanceBalanceChangePaise:0,capitalChangePaise:0,transactionCount:0};for(const r of effects(rows)){if((from&&r.transactionDate<from)||(to&&r.transactionDate>to)||(clientId&&r.clientId!==clientId)||(caseId&&r.caseId!==caseId))continue;const a=r.signedAmount;switch(r.effectiveType){case 'income':out.incomePaise+=a;break;case 'refund':out.incomePaise-=a;break;case 'expense':out.expensePaise+=a;break;case 'advance':out.advanceBalanceChangePaise+=a;break;case 'advance_utilization':case 'advance_refund':out.advanceBalanceChangePaise-=a;break;case 'capital_in':out.capitalChangePaise+=a;break;case 'capital_out':out.capitalChangePaise-=a;break;}out.transactionCount++;}out.netSurplusPaise=out.incomePaise-out.expensePaise;return out;}
export function getClientAdvanceBalance(rows,clientId){return calculateFinanceStatistics(rows,{clientId:id(clientId,true)}).advanceBalanceChangePaise;}
export function calculateAgreementBalance(agreement,rows){let received=0;for(const r of effects(rows))if(r.feeAgreementId===agreement.id){if(r.effectiveType==='income')received+=r.signedAmount;if(r.effectiveType==='refund')received-=r.signedAmount;}return {...agreement,receivedPaise:received,outstandingPaise:Math.max(0,agreement.agreedAmountPaise-received),excessPaise:Math.max(0,received-agreement.agreedAmountPaise)};}
export function calculateInvoiceReceipts(invoiceId,rows){return effects(rows).filter(r=>r.invoiceId===invoiceId).reduce((n,r)=>n+(r.effectiveType==='income'?r.signedAmount:r.effectiveType==='refund'?-r.signedAmount:0),0);}
export async function fetchFinanceData(){const uid=await admin();const [transactions,agreements,invoiceLinks,clients,cases,invoices]=await Promise.all([all(C.transactions,uid),all(C.agreements,uid),all(C.links,uid),all('clients',uid),all('cases',uid),all('invoices',uid)]);return {transactions,agreements:agreements.map(a=>calculateAgreementBalance(a,transactions)),invoiceLinks,clients,cases,invoices,statistics:calculateFinanceStatistics(transactions),synchronizedAt:new Date().toISOString()};}
export async function getFinanceSettings(){const uid=await admin(),s=await getDocFromServer(ref(C.settings,'preferences'));session(uid);return s.exists()?s.data():{incomeCategories:INCOME_CATEGORIES,expenseCategories:EXPENSE_CATEGORIES};}
export async function saveFinanceSettings(input){const uid=await admin();const clean=a=>{if(!Array.isArray(a)||a.length>100)fail('Invalid categories.');return [...new Set(a.map(v=>str(v,150,true)))];};const d={incomeCategories:clean(input.incomeCategories),expenseCategories:clean(input.expenseCategories)};await runTransaction(db,async tx=>{session(uid);tx.set(ref(C.settings,'preferences'),{...d,updatedAt:serverTimestamp(),updatedBy:uid});});return d;}
export function generateFinanceCSV(rows){const keys=['transactionCode','transactionDate','transactionType','category','amountPaise','clientId','caseId','invoiceId','feeAgreementId','paymentMode','paymentReference','description','status','reversalOf'];const cell=v=>{let s=String(v??'');if(/^[\s]*[=+\-@]|^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};return [keys.join(','),...rows.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n');}
export async function createFinanceBackup(){const uid=await admin();const [transactions,feeAgreements,invoiceLinks,financeSequences,financeSettings]=await Promise.all(Object.values(C).map(c=>all(c,uid)));const paymentRequests=await all('paymentRequests',uid);return {paymentRequests,application:'MNM Financial Management',version:FINANCE_CONFIG.version,generatedAt:new Date().toISOString(),generatedBy:uid,transactions,feeAgreements,invoiceLinks,financeSequences,financeSettings};}
export async function checkFinanceCloudConnection(){const uid=await admin();await all(C.sequences,uid);return {connected:true,authorized:true,checkedAt:new Date().toISOString()};}

// Staged invoice receipt API. Only for a newly created invoice, never for
// historical invoices or ordinary edits. Caller must confirm actual receipt.
export async function postInitialInvoiceReceipt(input) {
    const uid = await admin();
    const invoiceId = id(input.invoiceId, true);
    const clientId = id(input.clientId, true);
    const caseId = id(input.caseId);
    const receiptId = id('invoice_initial_' + invoiceId, true);
    if (input.confirmedReceipt !== true) fail('Confirm actual receipt before posting.');
    const d = normalize({transactionDate: input.transactionDate,
        transactionType: 'income', category: 'Professional Fees',
        amountPaise: input.amountPaise, clientId, caseId, invoiceId,
        feeAgreementId: '', paymentMode: input.paymentMode,
        paymentReference: input.paymentReference,
        description: 'Initial invoice payment: ' + invoiceId});
    const y = getFinancialYear(d.transactionDate);
    // Historical/manual entries require review, not automatic import.
    const rows = await all(C.transactions, uid);
    if (rows.some(r => r.invoiceId === invoiceId && r.id !== receiptId))
        fail('Existing invoice ledger entries require reconciliation.');
    await runTransaction(db, async tx => {
        session(uid);
        const existing = await tx.get(ref(C.transactions, receiptId));
        if (existing.exists()) {
            if (Object.keys(d).every(k => existing.data()[k] === d[k])) return;
            fail('Initial receipt already posted with different details. Reconcile first.');
        }
        const inv = await tx.get(ref('invoices', invoiceId));
        if (!inv.exists()) fail('Invoice not found.');
        const a = inv.data();
        if (a.recordStatus !== 'active' || a.revision !== 1)
            fail('Only new active invoices qualify for initial receipt posting.');
        if (Number(a.receivedEarlier ?? 0) !== 0 ||
            rupeesToPaise(a.receivedNow ?? a.amountPaid ?? 0) !== d.amountPaise)
            fail('Invoice receipt amount differs or earlier payments require review.');
        const seq = await tx.get(ref(C.sequences, y));
        await association(tx, d);
        session(uid);
        writeTransaction(tx, receiptId, d, y, seq.exists() ? seq.data().nextSequence : 1, uid);
    });
    return one(C.transactions, receiptId, uid);
}




