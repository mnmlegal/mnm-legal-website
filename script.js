'use strict';
const menu=document.querySelector('.hamburger'), links=document.querySelector('.nav-links');
if(menu&&links){const close=()=>{links.classList.remove('active');menu.setAttribute('aria-expanded','false')};menu.addEventListener('click',()=>{menu.setAttribute('aria-expanded',String(links.classList.toggle('active')))});links.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});}
const dialog=document.querySelector('#disclaimer-popup'), agree=document.querySelector('#agreeBtn');
if(dialog&&agree&&typeof dialog.showModal==='function'){let accepted=false;try{accepted=sessionStorage.getItem('mnmDisclaimerAcceptedV2')==='yes'}catch(e){}if(!accepted)dialog.showModal();dialog.addEventListener('cancel',e=>e.preventDefault());agree.addEventListener('click',()=>{try{sessionStorage.setItem('mnmDisclaimerAcceptedV2','yes')}catch(e){}dialog.close()});}
