/* One-device durable write journal. Ambiguous writes are reconciled, never replayed. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.OHStoreTransport=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function create({url,fetch,storage,same,timeout=20000}){
    const journalKey=`oh_store_pending_v1:${url}`;
    async function request(path,options={}){const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(`${url}/${path}.json${options.method?'':`?t=${Date.now()}`}`,{cache:'no-store',...options,signal:c.signal});if(!r.ok){const e=Error(`Firebase HTTP ${r.status}`);e.status=r.status;throw e}return await r.json()}finally{clearTimeout(timer)}}
    function pending(){const raw=storage.getItem(journalKey);return raw?JSON.parse(raw):null}
    async function recover(){const plan=pending();if(!plan)return null;const tx=await request(`store_hub_transactions/${encodeURIComponent(plan.id)}`);if(!same(tx,plan.tx))throw Error('มีรายการรอตรวจสอบ ห้ามทำซ้ำ: '+plan.id);return plan}
    async function commit(plan){if(pending())throw Error('มีรายการรอตรวจสอบ');storage.setItem(journalKey,JSON.stringify(plan));try{await request('',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(plan.patch)});return plan}catch(e){if([400,401,403,404,413,422].includes(e.status)){storage.removeItem(journalKey);throw e}try{return await recover()}catch(_){throw Error('ยังยืนยันผลบันทึกไม่ได้ ห้ามทำซ้ำ กรุณาเชื่อมต่อแล้วรีเฟรชยอดกลาง · '+plan.id)}}}
    function acknowledge(id){if(pending()?.id!==id)throw Error('รายการรอตรวจสอบไม่ตรงกัน');storage.removeItem(journalKey)}
    return {read:request,pending,recover,commit,acknowledge};
  }
  return {create};
});
