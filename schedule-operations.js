/* Schedule operations: independent of inventory, opt-in backup/restore, sync and daily staff dashboard. */
(function(){
"use strict";
const endpoint=()=>CONFIG.firebaseDatabaseUrl+"/work_schedules";
const escTools=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const iso=d=>dateKey(d);
const cycleDates=start=>{
 const [y,m,d]=start.split("-").map(Number);
 if(d!==21||!Number.isInteger(y)||m<1||m>12)throw Error("เลือกวันเริ่มรอบเป็นวันที่ 21");
 const x=new Date(y,m-1,21),end=new Date(y,m,20),a=[];
 while(x<=end){a.push(iso(x));x.setDate(x.getDate()+1)}
 return a;
};
const currCycle=()=>{const d=new Date();return iso(new Date(d.getFullYear(),d.getMonth()-(d.getDate()<21?1:0),21))};
const overlay=(content)=>{
 document.getElementById("oh-ops-layer")?.remove();
 const el=document.createElement("div");el.id="oh-ops-layer";el.className="modal-backdrop";
 el.innerHTML='<section class="modal schedule-modal" style="max-width:1020px;max-height:94vh;overflow:auto;padding:18px"><div class="editor-head"><h2>ความปลอดภัยและภาพรวมตารางงาน</h2><button id="oh-ops-close" class="icon-btn">×</button></div>'+content+'</section>';
 document.body.appendChild(el);el.querySelector("#oh-ops-close").onclick=()=>el.remove();return el;
};
const jsonRead=async(url,ms=16000)=>{
 const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
 try{const r=await fetch(url,{cache:"no-store",signal:c.signal});if(!r.ok)throw Error("Firebase HTTP "+r.status);return await r.json()}
 finally{clearTimeout(t)}
};
const localText=()=>({months:scheduleMonths,employees:employees.map(e=>({id:e.id,nick:e.nick}))});
function download(filename,data){
 const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
async function fetchCycle(cycle){
 const ds=cycleDates(cycle),months=[...new Set(ds.map(x=>x.slice(0,7)))],out={};
 await Promise.all(months.map(async m=>{
   const response=await jsonRead(endpoint()+"/"+m+".json");
   if(response!==null&&(typeof response!=="object"||Array.isArray(response)))throw Error("รูปแบบข้อมูลเดือน "+m+" ผิด");
   out[m]=response||{};
 }));
 return {ds,out};
}
function rowsFor(ds,out){
 const rows={};
 for(const emp of employees)for(const d of ds){
   const v=out[d.slice(0,7)]?.[emp.id]?.[d];
   if(v!==undefined&&v!==null) ((rows[emp.id]??={})[d]=String(v));
 }
 return rows;
}
function stats(date){
 const codes={morning:0,afternoon:0,off:0,leave:0,unassigned:0,total:employees.length};
 for(const e of employees){
  const c=getShift(e,date);
  if(c==="NONE")codes.unassigned++;
  else if(["OFF","HOLIDAY"].includes(c))codes.off++;
  else if(["LEAVE","VACATION","EXIT"].includes(c))codes.leave++;
  else if(["6","7","8"].includes(c))codes.morning++;
  else codes.afternoon++;
 }
 return codes;
}
function dashboardMarkup(){
 const d=state.selectedDate||new Date(),today=stats(d),days=[0,1,2,3,4,5,6].map(i=>{
  const x=new Date(d.getFullYear(),d.getMonth(),d.getDate()+i),s=stats(x);
  return '<tr><td>'+escTools(iso(x))+'</td><td>'+s.morning+'</td><td>'+s.afternoon+'</td><td>'+s.off+'</td><td>'+s.leave+'</td><td>'+s.unassigned+'</td></tr>';
 }).join("");
 return '<section style="margin:12px 0"><h3>ภาพรวมกำลังคน (จากตารางที่แสดงในเครื่อง)</h3>'+
 '<p>วันที่ '+escTools(iso(d))+' · กะเช้า '+today.morning+' · กะบ่าย '+today.afternoon+' · หยุด '+today.off+' · ลา/ออก '+today.leave+' · ยังไม่ระบุ '+today.unassigned+'</p>'+
 '<div style="overflow:auto"><table class="schedule-matrix" style="width:100%"><thead><tr><th>วันที่</th><th>เช้า</th><th>บ่าย</th><th>หยุด</th><th>ลา/ออก</th><th>ยังไม่ระบุ</th></tr></thead><tbody>'+days+'</tbody></table></div>'+
 '<p style="font-size:12px;color:#64748b">ข้อมูลนี้ใช้ช่วยจัดกำลังคน ไม่ใช่การตัดสินว่าเวรเพียงพอโดยอัตโนมัติ</p></section>';
}
window.openScheduleOperations=function(){
 const current=currCycle(),opts=[-1,0,1,2].map(offset=>{
  const [y,m]=current.split("-").map(Number),value=iso(new Date(y,m-1+offset,21));
  return '<option value="'+value+'" '+(value===current?'selected':'')+'>'+value+' ถึง '+cycleDates(value).at(-1)+'</option>';
 }).join("");
 const el=overlay('<p style="color:#64748b">สำรอง/ตรวจข้อมูลตารางงานเฉพาะรอบที่เลือก โดยไม่กระทบยอดสต็อก</p>'+
 '<div class="field"><label>รอบตาราง 21–20</label><select id="oh-ops-cycle">'+opts+'</select></div>'+
 '<div class="editor-actions" style="margin:12px 0"><button class="ghost-btn" id="oh-ops-sync">ซิงก์ตารางกลาง</button><button class="ghost-btn" id="oh-ops-backup">ดาวน์โหลดข้อมูลสำรอง</button><button class="ghost-btn" id="oh-ops-restore">ตรวจไฟล์กู้คืน</button></div>'+
 '<input type="file" id="oh-ops-file" accept=".json,application/json" style="display:none">'+
 '<p id="oh-ops-status" role="status" style="font-size:13px;color:#64748b">ยังไม่มีการเขียนข้อมูล</p><div id="oh-ops-dashboard">'+dashboardMarkup()+'</div>');
 const status=el.querySelector("#oh-ops-status"),buttons=[...el.querySelectorAll(".editor-actions button")];
 const setBusy=flag=>buttons.forEach(b=>b.disabled=flag);
 el.querySelector("#oh-ops-sync").onclick=async()=>{
  setBusy(true);status.textContent="กำลังอ่าน Firebase...";
  try{
   const {out}=await fetchCycle(el.querySelector("#oh-ops-cycle").value);
   // Update only the months actually fetched. No write to Firebase.
   for(const [month,data] of Object.entries(out))scheduleMonths[month]=data;
   localStorage.setItem("oh_schedule_months",JSON.stringify(scheduleMonths));
   if(["schedule","day","person","home"].includes(state.view))render();
   status.textContent="อ่านตารางกลางสำเร็จแล้ว (ไม่ได้เขียน Firebase)";
   el.querySelector("#oh-ops-dashboard").innerHTML=dashboardMarkup();
  }catch(e){status.textContent="ซิงก์ไม่สำเร็จ: "+String(e.message||e)}
  finally{setBusy(false)}
 };
 el.querySelector("#oh-ops-backup").onclick=async()=>{
  setBusy(true);status.textContent="กำลังสร้างสำเนาจาก Firebase...";
  try{
   const cycle=el.querySelector("#oh-ops-cycle").value,{ds,out}=await fetchCycle(cycle);
   const payload={format:"oh-store-hub-schedule-cycle-v1",exportedAt:new Date().toISOString(),cycle,dates:ds,rows:rowsFor(ds,out),employeeLabels:employees.map(e=>({id:e.id,nick:e.nick}))};
   download("OH-schedule-backup-"+cycle+".json",payload);
   status.textContent="ดาวน์โหลดสำรองรอบ "+cycle+" แล้ว · ไม่เปลี่ยนตารางจริง";
  }catch(e){status.textContent="สำรองไม่สำเร็จ: "+String(e.message||e)+" · ไม่มีการสร้างสำเนาจากข้อมูลที่ไม่ครบ"}
  finally{setBusy(false)}
 };
 el.querySelector("#oh-ops-restore").onclick=()=>el.querySelector("#oh-ops-file").click();
 el.querySelector("#oh-ops-file").onchange=async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{
   if(file.size>2_000_000)throw Error("ไฟล์มีขนาดเกิน 2 MB");
   const input=JSON.parse(await file.text()),cycle=el.querySelector("#oh-ops-cycle").value,days=cycleDates(cycle),allowed=new Set(days);
   if(input.format!=="oh-store-hub-schedule-cycle-v1"||input.cycle!==cycle||JSON.stringify(input.dates)!==JSON.stringify(days))throw Error("ไฟล์สำรองไม่ตรงกับรอบที่เลือก");
   if(!input.rows||typeof input.rows!=="object"||Array.isArray(input.rows))throw Error("ไฟล์ไม่ถูกต้อง");
   const known=new Set(employees.map(e=>e.id));let count=0;
   for(const [id,entries] of Object.entries(input.rows)){
    if(!known.has(id)||!entries||typeof entries!=="object"||Array.isArray(entries))throw Error("รหัสพนักงานไม่ถูกต้อง");
    for(const [date,code] of Object.entries(entries)){
     if(!allowed.has(date)||!["6","7","8","11","13","OFF","LEAVE","HOLIDAY","VACATION","EXIT","NONE"].includes(code))throw Error("วันหรือรหัสกะอยู่นอกช่วงที่เลือก");
     count++;
    }
   }
   status.textContent="ตรวจไฟล์สำรองผ่าน "+count+" ช่อง · สามารถตรวจตารางกลางและกู้คืนเฉพาะรอบนี้ได้";
   const previous=el.querySelector("#oh-ops-apply-restore");previous?.remove();
   const restore=document.createElement("button");restore.id="oh-ops-apply-restore";restore.className="save-schedule";
   restore.textContent="กู้คืนเฉพาะช่องจากไฟล์ที่ตรวจแล้ว (ต้องยืนยันอีกครั้ง)";
   el.querySelector("#oh-ops-status").after(restore);
   const restoreCycle=cycle,restoreRows=input.rows;
   restore.onclick=async()=>{
     if(el.querySelector("#oh-ops-cycle").value!==restoreCycle){status.textContent="รอบที่เลือกเปลี่ยนไปแล้ว โปรดตรวจไฟล์ใหม่";restore.remove();return}
     if(!confirm("จะตรวจตารางกลางและสำรองข้อมูลปัจจุบันก่อนกู้คืนรอบ "+restoreCycle+" เท่านั้น ยืนยันตรวจข้อมูลต่อหรือไม่?"))return;
     restore.disabled=true;setBusy(true);
     try{
       const {ds,out}=await fetchCycle(restoreCycle),allow=new Set(ds);
       const patch={},changes=[];
       for(const [emp,entries] of Object.entries(restoreRows))for(const [date,value] of Object.entries(entries)){
         if(!allow.has(date))throw Error("พบวันที่นอกรอบ หยุดกู้คืน");
         const month=date.slice(0,7),current=out[month]?.[emp]?.[date]??"NONE";
         if(current===value)continue;
         ((patch[month]??={})[emp+"/"+date]=value);
         changes.push({emp,date,current,value});
       }
       if(!changes.length){status.textContent="ตารางกลางตรงกับไฟล์แล้ว ไม่จำเป็นต้องกู้คืน";return}
       const summary=changes.length+" ช่อง จาก "+Object.keys(patch).length+" เดือน";
       const typed=prompt("พบข้อมูลที่จะเปลี่ยน "+summary+"\nพิมพ์คำว่า RESTORE เพื่อยืนยัน หลังดาวน์โหลดสำเนาตารางกลางปัจจุบัน");
       if(typed!=="RESTORE"){status.textContent="ยกเลิกการกู้คืน ไม่มีการเขียนข้อมูล";return}
       // Always download the complete selected-cycle remote snapshot before any mutation.
       download("OH-before-restore-"+restoreCycle+"-"+Date.now()+".json",{format:"oh-store-hub-schedule-cycle-v1",cycle:restoreCycle,dates:ds,rows:rowsFor(ds,out),exportedAt:new Date().toISOString()});
       status.textContent="สำรองข้อมูลกลางปัจจุบันแล้ว กำลังกู้คืน "+summary;
       for(const [month,entries] of Object.entries(patch)){
         const r=await fetch(endpoint()+"/"+month+".json",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(entries)});
         if(!r.ok)throw Error("Firebase "+month+" HTTP "+r.status+" — โปรดตรวจตารางกลางก่อนทำซ้ำ");
       }
       const verified=await fetchCycle(restoreCycle);
       for(const c of changes){
         if(verified.out[c.date.slice(0,7)]?.[c.emp]?.[c.date]!==c.value)throw Error("อ่านกลับไม่ตรงที่ "+c.date+" / "+c.emp);
       }
       for(const [month,data] of Object.entries(verified.out))scheduleMonths[month]=data;
       localStorage.setItem("oh_schedule_months",JSON.stringify(scheduleMonths));
       if(["schedule","day","person","home"].includes(state.view))render();
       status.textContent="กู้คืนสำเร็จและตรวจข้อมูลกลางแล้ว "+summary;
       alert("กู้คืนสำเร็จ "+summary+" · เก็บไฟล์สำรองก่อนกู้คืนไว้ด้วย");
     }catch(e){status.textContent="ยังยืนยันผลกู้คืนไม่ได้: "+String(e.message||e)+" · ห้ามกดซ้ำจนกว่าจะตรวจ Firebase"}
     finally{restore.disabled=false;setBusy(false)}
   };
  }catch(e){status.textContent="ไฟล์กู้คืนไม่ผ่าน: "+String(e.message||e)}
  finally{event.target.value=""}
 };
};
// Background read-only refresh for devices viewing the roster; never push schedules automatically.
let lastAutoSync=0,autoSyncBusy=false;
document.addEventListener("visibilitychange",()=>{
 if(!document.hidden)lastAutoSync=0;
});
setInterval(async()=>{
 if(autoSyncBusy||document.hidden||!["schedule","day","person"].includes(state.view))return;
 if(state.scheduleEditor||document.getElementById("oh-sheet-schedule-overlay")||document.getElementById("oh-ops-layer"))return;
 if(Date.now()-lastAutoSync<90000)return;
 autoSyncBusy=true;lastAutoSync=Date.now();
 try{
  const d=state.selectedDate||new Date(),cycle=iso(new Date(d.getFullYear(),d.getMonth()-(d.getDate()<21?1:0),21));
  const {out}=await fetchCycle(cycle);
  let changed=false;
  for(const [month,data] of Object.entries(out)){
   if(JSON.stringify(scheduleMonths[month]||{})!==JSON.stringify(data)){
    scheduleMonths[month]=data;changed=true;
   }
  }
  if(changed){localStorage.setItem("oh_schedule_months",JSON.stringify(scheduleMonths));render()}
 }catch(e){console.warn("OH schedule read-only sync unavailable",e)}
 finally{autoSyncBusy=false}
},30000);
})();