/* OH Store Hub — read-only Sheets schedule preview; no write until explicit confirmation. */
(function(){
"use strict";
const VALID=new Set(["6","7","8","11","13","OFF","LEAVE","HOLIDAY","VACATION","EXIT"]);
const codeMap=()=>oj16EmployeeCodeMap();
let draft=null, busy=false;
const PREVIEW_ONLY=true; // Incident recovery: review only; never write Firebase.
// The selected cycle (21st through following 20th) is the ONLY allowed write window.
function assertSelectedCycle(cycle,dates,updates){
 const expected=cycleDates(cycle);
 if(JSON.stringify(dates)!==JSON.stringify(expected))throw Error("รอบวันที่ใน Preview ไม่ตรงกับเดือนที่เลือก");
 if(!Array.isArray(updates)||!updates.length)throw Error("ไม่มีรายการสำหรับนำเข้า");
 const allowed=new Set(expected),unique=new Set();
 for(const u of updates){
   if(!allowed.has(u.date))throw Error("พบวันที่อยู่นอกรอบที่เลือก จึงยกเลิก");
   if(!/^p\d{2}$/.test(u.id))throw Error("รหัสพนักงานไม่ถูกต้อง");
   const key=u.id+"|"+u.date;
   if(unique.has(key))throw Error("พนักงานและวันที่ซ้ำ");
   unique.add(key);
 }
 return {first:expected[0],last:expected[expected.length-1]};
}
const cycleDates=start=>{
  const [y,m,d]=start.split("-").map(Number);
  if(d!==21||!Number.isInteger(y)||m<1||m>12)throw Error("รอบต้องเริ่มวันที่ 21");
  const first=new Date(y,m-1,21),end=new Date(y,m,20),out=[];
  for(let x=new Date(first);x<=end;x.setDate(x.getDate()+1))out.push(dateKey(x));
  return out;
};
const html=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function modal(content){
  document.getElementById("oh-sheet-schedule-overlay")?.remove();
  const el=document.createElement("div");el.id="oh-sheet-schedule-overlay";el.className="modal-backdrop";
  el.innerHTML='<section class="modal schedule-modal" style="max-height:94vh;overflow:auto;max-width:980px"><div class="editor-head"><div class="head-text"><h2>นำเข้าตารางงานจาก Google Sheets</h2><p>เลือกเดือน → อ่านอย่างเดียว → ตรวจทุกคน → ยืนยัน</p></div><button class="icon-btn" id="oh-sheet-close">×</button></div>'+content+'</section>';
  document.body.appendChild(el);
  el.querySelector("#oh-sheet-close").onclick=()=>el.remove();
  return el;
}
const currentCycle=()=>{const d=new Date();return dateKey(new Date(d.getFullYear(),d.getMonth()+(d.getDate()>=21?0:-1),21))};
window.openSheetScheduleImport=function(){
 const chosen=currentCycle();
 const options=[-2,-1,0,1,2].map(delta=>{const [y,m]=chosen.split("-").map(Number),date=new Date(y,m-1+delta,21),value=dateKey(date);return '<option value="'+value+'" '+(value===chosen?'selected':'')+'>'+html(fmtDate(date,false))+' – '+html(fmtDate(new Date(date.getFullYear(),date.getMonth()+1,20),false))+'</option>'}).join("");
 const el=modal('<p style="margin:8px 0 12px">ชีตต้นทางไม่มีเดือนและปีในแถววันที่ โปรดเลือกรอบให้ตรงกับชีตจริง</p><div class="field"><label>รอบตาราง (21 ถึง 20)</label><select id="oh-sheet-cycle">'+options+'</select></div><p style="margin:12px 0;color:#9a3412">ระบบจะไม่แตะ Firebase ระหว่างอ่านหรือดูตัวอย่าง</p><div class="editor-actions"><button class="ghost-btn" id="oh-sheet-cancel">ยกเลิก</button><button class="save-schedule" id="oh-sheet-fetch">อ่านข้อมูลและตรวจสอบ</button></div>');
 el.querySelector("#oh-sheet-cancel").onclick=()=>el.remove();
 el.querySelector("#oh-sheet-fetch").onclick=()=>{
   if(busy)return;
   const btn=el.querySelector("#oh-sheet-fetch");
   btn.disabled=true;btn.textContent="กำลังอ่าน Google Sheets…";
   let status=el.querySelector("#oh-sheet-progress");
   if(!status){status=document.createElement("p");status.id="oh-sheet-progress";status.setAttribute("role","status");btn.parentElement.before(status)}
   status.textContent="กำลังรอ Apps Script ตอบกลับ โปรดรอสักครู่ ไม่ต้องกดซ้ำ";
   load(el.querySelector("#oh-sheet-cycle").value).finally(()=>{
     if(btn.isConnected){btn.disabled=false;btn.textContent="อ่านข้อมูลและตรวจสอบ"}
   });
 };
};
function normalize(raw){
 const x=String(raw??"").trim().toUpperCase();
 if(["F","OFF","OFFOFF","หยุด"].includes(x))return "OFF";
 if(["ลา","LEAVE"].includes(x))return "LEAVE";
 if(x==="นข")return "HOLIDAY";
 if(x==="พร")return "VACATION";
 if(x==="ออก")return "EXIT";
 return VALID.has(x)?x:null;
}
async function load(cycle){
 if(busy)return;busy=true;draft=null;
 try{
  const dates=cycleDates(cycle);
  const url=CONFIG.sheetsWebAppUrl+"?mode=scheduleSheetPreview&cycle="+encodeURIComponent(cycle)+"&t="+Date.now();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  let result;
  try{const response=await fetch(url,{cache:"no-store",signal:controller.signal});if(!response.ok)throw Error("HTTP "+response.status);result=await response.json()}finally{clearTimeout(timer)}
  if(result.status!=="success"||result.mode!=="scheduleSheetPreview"||result.cycle!==cycle||!Array.isArray(result.dates)||JSON.stringify(result.dates)!==JSON.stringify(dates)||!Array.isArray(result.employees))throw Error("Apps Script ยังไม่รองรับการอ่านตาราง หรือวันที่ในชีตไม่ตรงกับรอบที่เลือก");
  // Preview must not depend on access to the Firebase schedule.
  // A failed remote read is visible and never treated as permission to write.
  const remoteMonths={};
  let remoteReadOk=true,remoteReadError="";
  for(const m of (PREVIEW_ONLY?[]:[...new Set(dates.map(d=>d.slice(0,7)))])){
    try {
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
      try {
        const r=await fetch(CONFIG.firebaseDatabaseUrl+"/work_schedules/"+m+".json",{cache:"no-store",signal:controller.signal});
        if(!r.ok)throw Error("HTTP "+r.status);
        const val=await r.json();
        if(val!==null&&(typeof val!=="object"||Array.isArray(val)))throw Error("Firebase ตอบข้อมูลไม่ถูกต้อง");
        remoteMonths[m]=val||{};
      }finally{clearTimeout(timer)}
    } catch(e){
      remoteReadOk=false;remoteReadError=String(e.message||e);
      break;
    }
  }
  if(PREVIEW_ONLY){remoteReadOk=false;remoteReadError="โหมดแสดงตารางจาก Google Sheets โดยไม่อ่านข้อมูล Firebase";}
  const map=codeMap(),updates=[],unmatched=[],unknown=[];
  for(const row of result.employees){
   const id=map[String(row.code||"").trim()];
   if(!id){unmatched.push(String(row.name||row.code||"ไม่ทราบชื่อ"));continue}
   if(!Array.isArray(row.shifts)||row.shifts.length!==dates.length)throw Error("จำนวนช่องตารางงานไม่ตรงกับรอบ");
   row.shifts.forEach((v,i)=>{
     if(v==null||String(v).trim()==="")return; // blanks never clear an existing shift
     const parsed=normalize(v),old=remoteReadOk?(remoteMonths[dates[i].slice(0,7)]?.[id]?.[dates[i]]||"NONE"):"NONE";
     const employee=employees.find(e=>e.id===id);
     const cell={id,name:employee?.nick||row.nickname||row.name||id,date:dates[i],raw:String(v),value:parsed||"NONE",old,review:!parsed};
     updates.push(cell);if(cell.review)unknown.push(cell);
   });
  }
  if(!updates.length)throw Error("ไม่พบข้อมูลกะที่นำเข้าได้");
  assertSelectedCycle(cycle,dates,updates);
  draft={cycle,dates,updates,unmatched,unknown,sheetName:result.sheetName,remoteReadOk,remoteReadError};
  renderPreview();
 }catch(e){modal('<p style="color:#b91c1c">อ่านข้อมูลไม่ได้: '+html(e.message||e)+'</p><div class="editor-actions"><button class="ghost-btn" onclick="openSheetScheduleImport()">กลับไปเลือกรอบ</button></div>')}
 finally{busy=false}
}
function renderPreview(){
 if(!draft)return;
 const label=c=>({HOLIDAY:"นักขัตฤกษ์",VACATION:"พักร้อน",EXIT:"ออกจากงาน",OFF:"หยุด",LEAVE:"ลา",NONE:"—"})[c]||c;
 const short=c=>({HOLIDAY:"นข",VACATION:"พร",EXIT:"ออก",OFF:"หยุด",LEAVE:"ลา",NONE:"—"})[c]||c;
 const kind=c=>["OFF","NONE"].includes(c)?"off":c==="HOLIDAY"?"holiday":["VACATION","LEAVE"].includes(c)?"leave":c==="EXIT"?"exit":"shift";
 const options=["NONE","6","7","8","11","13","OFF","LEAVE","HOLIDAY","VACATION","EXIT"];
 const map=new Map(draft.updates.map((u,i)=>[u.id+"|"+u.date,{u,i}]));
 const people=employees.filter(e=>draft.updates.some(u=>u.id===e.id));
 const weekday=["อา","จ","อ","พ","พฤ","ศ","ส"];
 const head=draft.dates.map(key=>{
  const d=new Date(key+"T00:00:00");
  const split=d.getDate()===1?" month-boundary":"";
  return '<th class="oh-cal-date'+split+'" title="'+html(key)+'"><small>'+weekday[d.getDay()]+'</small><b>'+d.getDate()+'</b><small>'+String(d.getMonth()+1).padStart(2,"0")+'</small></th>';
 }).join("");
 const rows=people.map(emp=>{
   const cells=draft.dates.map(key=>{
     const entry=map.get(emp.id+"|"+key);
     if(!entry)return '<td class="oh-cal-empty" title="ช่องว่างในชีต: คงกะเดิม">—</td>';
     const {u,i}=entry;
     const cls=kind(u.value);
     return '<td class="oh-cal-cell '+(u.review?'oh-cal-review ':'')+(draft.remoteReadOk&&u.old!==u.value?'oh-cal-changed ':'')+'" data-day="'+html(key)+'">'+
     '<select class="oh-cal-select '+cls+'" data-oh-shift="'+i+'" aria-label="'+html(emp.nick+' '+key)+'" title="ในชีต: '+html(u.raw)+' · เดิม: '+html(label(u.old))+'">'+
     options.map(c=>'<option value="'+c+'" '+(u.value===c?'selected':'')+'>'+html(short(c))+'</option>').join("")+
     '</select></td>';
   }).join("");
   return '<tr><th class="oh-cal-name">'+html(emp.nick)+'<small>'+html(emp.id)+'</small></th>'+cells+'</tr>';
 }).join("");
 const previewWarning=(!draft.remoteReadOk?'<p class="oh-cal-warning">ℹ ยังไม่ได้เทียบกับข้อมูล Firebase ('+html(draft.remoteReadError)+') จึงแสดงกะจากชีตได้ แต่ยังเปรียบเทียบข้อมูลเดิมไม่ได้และปิดการบันทึกไว้</p>':'')+
  (PREVIEW_ONLY?'<p class="oh-cal-warning">โหมดตรวจสอบอย่างเดียว: ยังไม่เปิดให้บันทึกลง Firebase</p>':'');
 const warn=draft.unmatched.length?'<p class="oh-cal-warning">⚠ พนักงานที่จับคู่รหัสไม่ได้: '+html(draft.unmatched.join(", "))+' (ยังยืนยันไม่ได้)</p>':"";
 const style='<style>'+
 '#oh-sheet-schedule-overlay .schedule-modal{width:min(98vw,1320px)!important;max-width:1320px!important;padding:16px;max-height:96vh;overflow:auto}'+
 '#oh-sheet-schedule-overlay .oh-cal-wrap{overflow:auto;max-height:62vh;border:1px solid #dce5ef;border-radius:12px;background:white;overscroll-behavior:contain}'+
 '#oh-sheet-schedule-overlay .oh-cal-grid{border-collapse:separate;border-spacing:0;width:max-content;min-width:100%;font-size:12px}'+
 '#oh-sheet-schedule-overlay .oh-cal-grid th,#oh-sheet-schedule-overlay .oh-cal-grid td{padding:5px 4px;text-align:center;border-right:1px solid #e6eaf0;border-bottom:1px solid #e6eaf0;min-width:58px;height:52px}'+
 '#oh-sheet-schedule-overlay .oh-cal-grid thead th{position:sticky;top:0;z-index:3;background:#eaf1f9;color:#284058}'+
 '#oh-sheet-schedule-overlay .oh-cal-grid thead th small{display:block;font-size:10px;font-weight:500}'+
 '#oh-sheet-schedule-overlay .oh-cal-grid thead th b{display:block;font-size:14px}'+
 '#oh-sheet-schedule-overlay .oh-cal-grid .oh-cal-name{position:sticky;left:0;z-index:2;text-align:left;min-width:130px;background:#fff;padding:8px;font-size:13px;white-space:nowrap}'+
 '#oh-sheet-schedule-overlay .oh-cal-grid thead .oh-cal-name{z-index:5;background:#eaf1f9}'+
 '#oh-sheet-schedule-overlay .oh-cal-name small{display:block;color:#8b98a8;font-size:10px}'+
 '#oh-sheet-schedule-overlay .oh-cal-select{font:inherit;font-weight:700;width:52px;min-width:52px;max-width:52px;padding:8px 2px;border:1px solid transparent;border-radius:9px;text-align:center;appearance:none;cursor:pointer}'+
 '#oh-sheet-schedule-overlay .oh-cal-select.shift{background:#e6f0ff;color:#205da0}'+
 '#oh-sheet-schedule-overlay .oh-cal-select.off{background:#eef1f5;color:#64748b}'+
 '#oh-sheet-schedule-overlay .oh-cal-select.holiday{background:#fff0d5;color:#95600a}'+
 '#oh-sheet-schedule-overlay .oh-cal-select.leave{background:#fce3e9;color:#a72b58}'+
 '#oh-sheet-schedule-overlay .oh-cal-select.exit{background:#eadff9;color:#67378e}'+
 '#oh-sheet-schedule-overlay .oh-cal-review .oh-cal-select{border:2px solid #dc2626}'+
 '#oh-sheet-schedule-overlay .oh-cal-changed{box-shadow:inset 0 -3px #3b82f6}'+
 '#oh-sheet-schedule-overlay .month-boundary{border-left:3px solid #80a2ca!important}'+
 '#oh-sheet-schedule-overlay .oh-cal-legend{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;font-size:12px;color:#475569}'+
 '#oh-sheet-schedule-overlay .oh-cal-legend span{padding:5px 9px;border-radius:20px;background:#f1f5f9}'+
 '#oh-sheet-schedule-overlay .oh-cal-warning{color:#ab4318;font-weight:650}'+
 '#oh-sheet-schedule-overlay .oh-cal-summary{display:flex;gap:12px;flex-wrap:wrap;margin:10px 0;font-size:13px}'+
 '#oh-sheet-schedule-overlay .oh-cal-summary b{font-size:17px}'+
 '@media(max-width:650px){#oh-sheet-schedule-overlay .schedule-modal{padding:10px!important}#oh-sheet-schedule-overlay .oh-cal-grid .oh-cal-name{min-width:100px}}'+
 '</style>';
 const summary='<div class="oh-cal-summary"><span>พนักงาน <b>'+people.length+'</b> คน</span><span>วันที่ <b>'+draft.dates.length+'</b> วัน</span><span>ช่องที่ต่างจากเดิม <b id="oh-cal-changed">0</b></span><span>ต้องตรวจ <b id="oh-cal-review">0</b></span></div>';
 const legend='<div class="oh-cal-legend"><span>6/7/8/11/13 = กะทำงาน</span><span>F = หยุด</span><span>นข = นักขัตฤกษ์</span><span>พร = พักร้อน</span><span>ลา = ลางาน</span><span>ออก = ออกจากงาน</span><span>แถบสีน้ำเงินใต้ช่อง = เปลี่ยนจากเดิม</span></div>';
 const el=modal(style+'<p><b>ตารางปฏิทิน · '+html(draft.cycle)+' ถึง '+html(draft.dates.at(-1))+'</b> · ชีต '+html(draft.sheetName)+'</p>'+
 '<p style="padding:9px 12px;background:#edf7ef;color:#276447;border-radius:9px;font-size:13px"><b>ช่วงนำเข้าเฉพาะที่เลือก:</b> '+html(draft.cycle)+' ถึง '+html(draft.dates.at(-1))+' · ตารางก่อนและหลังช่วงนี้ต้องคงเดิม</p>'+summary+warn+legend+
 '<p style="color:#95600a;font-size:12px">เลื่อนตารางซ้าย–ขวาเพื่อดูทุกวัน · แตะกะในช่องเพื่อแก้ · ช่องว่างจะไม่ลบกะเดิม</p>'+
 previewWarning+'<div class="oh-cal-wrap" tabindex="0" aria-label="ตารางกะพนักงานแบบปฏิทิน"><table class="oh-cal-grid"><thead><tr><th class="oh-cal-name">พนักงาน</th>'+head+'</tr></thead><tbody>'+rows+'</tbody></table></div>'+
 '<label style="display:flex;gap:9px;align-items:flex-start;margin:14px 0;font-size:13px"><input id="oh-sheet-cycle-confirm" type="checkbox" style="margin-top:3px"> ฉันตรวจแล้วว่าชีตนี้เป็นรอบวันที่ 21–20 ของเดือนที่เลือกจริง</label>'+
 '<div class="editor-actions"><button class="ghost-btn" id="oh-sheet-back">เลือกรอบใหม่</button><button class="save-schedule" id="oh-sheet-publish">ยืนยันบันทึกเฉพาะช่องที่เปลี่ยน</button></div>');
 function refreshSummary(){
  const changes=draft.remoteReadOk?draft.updates.filter(x=>x.old!==x.value).length:null;
  const reviews=draft.updates.filter(x=>x.review).length;
  el.querySelector("#oh-cal-changed").textContent=changes===null?"ยังไม่เทียบ":changes;
  el.querySelector("#oh-cal-review").textContent=reviews;
  el.querySelector("#oh-sheet-publish").disabled=Boolean(PREVIEW_ONLY||!draft.remoteReadOk||reviews||draft.unmatched.length);
 }
 el.querySelector("#oh-sheet-back").onclick=()=>openSheetScheduleImport();
 el.querySelectorAll("[data-oh-shift]").forEach(select=>select.onchange=()=>{
   const u=draft.updates[Number(select.dataset.ohShift)];
   u.value=select.value;u.review=false;
   const td=select.closest("td");
   td.classList.remove("oh-cal-review");
   td.classList.toggle("oh-cal-changed",draft.remoteReadOk&&u.old!==u.value);
   select.className="oh-cal-select "+kind(u.value);
   refreshSummary();
 });
 el.querySelector("#oh-sheet-publish").onclick=()=>publish(Boolean(el.querySelector("#oh-sheet-cycle-confirm").checked));
 refreshSummary();
}
async function publish(checked){
 if(busy||!draft)return;
 // Fail closed: reject any date outside the cycle, even if a UI or parser bug leaks one in.
 try{assertSelectedCycle(draft.cycle,draft.dates,draft.updates)}catch(e){alert(e.message||e);return}
 if(PREVIEW_ONLY||!draft.remoteReadOk){alert('ขณะนี้เปิดให้ตรวจ Preview เท่านั้น ยังไม่อนุญาตให้เขียนข้อมูล Firebase');return}
 if(!checked){alert("กรุณายืนยันว่ารอบ 21–20 ถูกต้อง");return}
 if(draft.updates.some(u=>u.review)||draft.unmatched.length){alert("ยังมีรหัสกะหรือพนักงานที่ต้องตรวจแก้ก่อนบันทึก");return}
 if(!confirm("ยืนยันนำเข้าตารางงานรอบ "+draft.cycle+"? จะปรับเฉพาะช่องที่ตรวจแล้ว และสำรองตารางเดิมก่อน"))return;
 busy=true;
 try{
  const patch={},old={};
  const changedCells=draft.updates.filter(cell=>cell.value!==cell.old);
  if(!changedCells.length){document.getElementById("oh-sheet-schedule-overlay")?.remove();draft=null;toast("ตารางตรงกับข้อมูลเดิมแล้ว ไม่มีรายการที่ต้องบันทึก");return}
  const allowed=new Set(cycleDates(draft.cycle));
  for(const cell of changedCells){
   if(!allowed.has(cell.date))throw Error("วันที่อยู่นอกรอบที่เลือก: "+cell.date);
   const m=cell.date.slice(0,7);
   const path="work_schedules/"+m+"/"+cell.id+"/"+cell.date;
   if(Object.hasOwn(patch,path))throw Error("ข้อมูลพนักงาน/วันที่ซ้ำ");
   patch[path]=cell.value;old[path]=cell.old;
  }
  // Read central state before commit; stop if someone edited any target cell meanwhile.
  const monthCache={};
  for(const cell of changedCells){
    const m=cell.date.slice(0,7);
    if(!(m in monthCache)){
      const r=await fetch(CONFIG.firebaseDatabaseUrl+"/work_schedules/"+m+".json",{cache:"no-store"});
      if(!r.ok)throw Error("อ่านตารางกลางไม่สำเร็จ: "+r.status);
      monthCache[m]=await r.json()||{};
    }
    const central=monthCache[m]?.[cell.id]?.[cell.date]||"NONE";
    if(central!==cell.old)throw Error("ตารางกลางถูกแก้ไขแล้ว กรุณาอ่านชีตและตรวจใหม่ก่อน");
  }
  const key="oh_schedule_sheet_backup_"+draft.cycle+"_"+Date.now();
  localStorage.setItem(key,JSON.stringify({createdAt:new Date().toISOString(),cycle:draft.cycle,previous:old,changes:patch})); // fail-closed
  // Write through existing per-month schedule nodes (same scope as current schedule editor).
  // Do not PATCH the database root; Firebase rules may reject root-level writes.
  const monthly={};
  for(const cell of changedCells){
    const m=cell.date.slice(0,7);
    (monthly[m]??={})[cell.id+"/"+cell.date]=cell.value;
  }
  for(const [m,changes] of Object.entries(monthly)){
    const response=await fetch(CONFIG.firebaseDatabaseUrl+"/work_schedules/"+m+".json",{
      method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(changes)
    });
    if(!response.ok)throw Error("Firebase "+m+" HTTP "+response.status+" — อาจมีบางเดือนบันทึกแล้ว โปรดตรวจข้อมูลกลางก่อนส่งซ้ำ");
  }
  // Confirm central values after the write before reporting success.
  const readBack={};
  for(const cell of changedCells){
    const m=cell.date.slice(0,7);
    if(!(m in readBack)){
      const r=await fetch(CONFIG.firebaseDatabaseUrl+"/work_schedules/"+m+".json",{cache:"no-store"});
      if(!r.ok)throw Error("อ่านผลยืนยันหลังบันทึกไม่ได้: HTTP "+r.status);
      readBack[m]=await r.json()||{};
    }
    if(readBack[m]?.[cell.id]?.[cell.date]!==cell.value)throw Error("ข้อมูล Firebase หลังบันทึกไม่ตรงกับตารางที่ยืนยัน");
  }
  // Firebase read-back passed. Local cache/display errors must not be reported as a failed write.
  for(const cell of changedCells){const m=cell.date.slice(0,7);scheduleMonths[m]??={};scheduleMonths[m][cell.id]??={};scheduleMonths[m][cell.id][cell.date]=cell.value}
  let localWarning="";
  try{saveData()}catch(e){localWarning="สำเร็จใน Firebase แต่สำรองข้อมูลในเบราว์เซอร์ไม่ได้: "+String(e.message||e)}
  draft=null;document.getElementById("oh-sheet-schedule-overlay")?.remove();
  try{render()}catch(e){localWarning+=" · หน้าเว็บอัปเดตไม่สำเร็จ กรุณารีโหลด"}
  alert(localWarning||"บันทึกและตรวจยืนยันข้อมูลตารางงานใน Firebase สำเร็จแล้ว");
 }catch(e){alert("ยังไม่สามารถยืนยันผลการบันทึกได้: "+(e.message||e)+"\nอย่ากดนำเข้าซ้ำจนกว่าจะตรวจข้อมูลกลาง");}
 finally{busy=false}
}
})();
