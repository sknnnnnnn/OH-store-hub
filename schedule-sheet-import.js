/* OH Store Hub — read-only Sheets schedule preview; no write until explicit confirmation. */
(function(){
"use strict";
const VALID=new Set(["6","7","8","11","13","OFF","LEAVE","HOLIDAY","VACATION","EXIT"]);
const codeMap=()=>oj16EmployeeCodeMap();
let draft=null, busy=false;
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
 el.querySelector("#oh-sheet-fetch").onclick=()=>load(el.querySelector("#oh-sheet-cycle").value);
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
  const map=codeMap(),updates=[],unmatched=[],unknown=[];
  for(const row of result.employees){
   const id=map[String(row.code||"").trim()];
   if(!id){unmatched.push(String(row.name||row.code||"ไม่ทราบชื่อ"));continue}
   if(!Array.isArray(row.shifts)||row.shifts.length!==dates.length)throw Error("จำนวนช่องตารางงานไม่ตรงกับรอบ");
   row.shifts.forEach((v,i)=>{
     if(v==null||String(v).trim()==="")return; // blanks never clear an existing shift
     const parsed=normalize(v),old=scheduleMonths[monthKey(new Date(dates[i]+"T00:00:00"))]?.[id]?.[dates[i]]||"NONE";
     const employee=employees.find(e=>e.id===id);
     const cell={id,name:employee?.nick||row.nickname||row.name||id,date:dates[i],raw:String(v),value:parsed||"NONE",old,review:!parsed};
     updates.push(cell);if(cell.review)unknown.push(cell);
   });
  }
  if(!updates.length)throw Error("ไม่พบข้อมูลกะที่นำเข้าได้");
  draft={cycle,dates,updates,unmatched,unknown,sheetName:result.sheetName};
  renderPreview();
 }catch(e){modal('<p style="color:#b91c1c">อ่านข้อมูลไม่ได้: '+html(e.message||e)+'</p><div class="editor-actions"><button class="ghost-btn" onclick="openSheetScheduleImport()">กลับไปเลือกรอบ</button></div>')}
 finally{busy=false}
}
function renderPreview(){
 if(!draft)return;
 const changed=draft.updates.filter(x=>x.old!==x.value).length;
 const review=draft.updates.filter(x=>x.review);
 const label=c=>({HOLIDAY:"วันหยุดนักขัตฤกษ์",VACATION:"พักร้อน",EXIT:"ออกจากงาน",OFF:"วันหยุด",LEAVE:"ลางาน",NONE:"ยังไม่กำหนด"})[c]||c;
 const rows=draft.updates.map((u,i)=>'<tr><td>'+html(u.name)+'</td><td>'+html(u.date)+'</td><td>'+html(label(u.old))+'</td><td>'+html(u.raw)+'</td><td><select data-oh-shift="'+i+'" style="min-width:95px;'+(u.review?'border:2px solid #dc2626':'')+'">'+["NONE","6","7","8","11","13","OFF","LEAVE","HOLIDAY","VACATION","EXIT"].map(c=>'<option value="'+c+'" '+(u.value===c?'selected':'')+'>'+html(label(c))+'</option>').join("")+'</select></td></tr>').join("");
 const warn=draft.unmatched.length?'<p style="color:#b91c1c">รหัสพนักงานที่ยังจับคู่ไม่ได้ (จะไม่บันทึก): '+html(draft.unmatched.join(", "))+'</p>':"";
 const el=modal('<p><b>ชีต: '+html(draft.sheetName)+'</b> · รอบ '+html(draft.cycle)+' ถึง '+html(draft.dates.at(-1))+'</p><p>พบ '+draft.updates.length+' ช่อง · ต่างจากเดิม '+changed+' ช่อง · ต้องแก้รหัสกะ '+review.length+' ช่อง</p>'+warn+'<p style="color:#9a3412">ช่องว่างในชีตจะไม่ลบกะเดิม ตรวจว่ารอบเดือนตรงกับต้นทางก่อนยืนยัน</p><div class="matrix-wrap" style="max-height:55vh"><table class="schedule-matrix"><thead><tr><th>พนักงาน</th><th>วันที่</th><th>เดิม</th><th>ในชีต</th><th>นำเข้าเป็น</th></tr></thead><tbody>'+rows+'</tbody></table></div><label style="display:block;margin:12px 0"><input id="oh-sheet-cycle-confirm" type="checkbox"> ฉันตรวจแล้วว่าเลขวัน 21–20 ในชีตเป็นรอบเดือนที่เลือกจริง</label><div class="editor-actions"><button class="ghost-btn" id="oh-sheet-back">เลือกรอบใหม่</button><button class="save-schedule" id="oh-sheet-publish">ยืนยันบันทึกเฉพาะช่องที่แสดง</button></div>');
 el.querySelector("#oh-sheet-back").onclick=()=>openSheetScheduleImport();
 el.querySelectorAll("[data-oh-shift]").forEach(select=>select.onchange=()=>{const cell=draft.updates[Number(select.dataset.ohShift)];cell.value=select.value;cell.review=false;select.style.border=""});
 el.querySelector("#oh-sheet-publish").onclick=()=>publish(Boolean(el.querySelector("#oh-sheet-cycle-confirm").checked));
}
async function publish(checked){
 if(busy||!draft)return;
 if(!checked){alert("กรุณายืนยันว่ารอบ 21–20 ถูกต้อง");return}
 if(draft.updates.some(u=>u.review)||draft.unmatched.length){alert("ยังมีรหัสกะหรือพนักงานที่ต้องตรวจแก้ก่อนบันทึก");return}
 if(!confirm("ยืนยันนำเข้าตารางงานรอบ "+draft.cycle+"? จะปรับเฉพาะช่องที่ตรวจแล้ว และสำรองตารางเดิมก่อน"))return;
 busy=true;
 try{
  const patch={},old={};
  const changedCells=draft.updates.filter(cell=>cell.value!==cell.old);
  if(!changedCells.length){document.getElementById("oh-sheet-schedule-overlay")?.remove();draft=null;toast("ตารางตรงกับข้อมูลเดิมแล้ว ไม่มีรายการที่ต้องบันทึก");return}
  for(const cell of changedCells){
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
  const response=await fetch(CONFIG.firebaseDatabaseUrl+"/.json",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(patch)});
  if(!response.ok)throw Error("Firebase HTTP "+response.status);
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
  for(const cell of changedCells){const m=cell.date.slice(0,7);scheduleMonths[m]??={};scheduleMonths[m][cell.id]??={};scheduleMonths[m][cell.id][cell.date]=cell.value}
  saveData();draft=null;document.getElementById("oh-sheet-schedule-overlay")?.remove();render();toast("บันทึกตารางจาก Sheets แล้ว (เก็บสำเนาก่อนเปลี่ยน)");
 }catch(e){alert("ยังไม่ยืนยันว่าบันทึกสำเร็จ: "+(e.message||e)+"\nอย่ากดนำเข้าซ้ำจนกว่าจะตรวจข้อมูลกลาง");}
 finally{busy=false}
}
})();
