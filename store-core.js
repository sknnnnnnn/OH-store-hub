/* Pure Store planning. No network or localStorage; input snapshots are never mutated. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.OHStoreCore=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const copy=x=>x==null?x:JSON.parse(JSON.stringify(x));
  function key(x){x=String(x);if(!x||/[.#$\[\]\/]/.test(x))throw Error('รหัส Firebase ไม่ถูกต้อง');return x}
  function amount(x){if(x===null||x===''||typeof x==='boolean')throw Error('ยอดไม่ถูกต้อง');const n=Number(x);if(!Number.isFinite(n)||n<0)throw Error('ยอดไม่ถูกต้อง');return n}
  const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
  function stable(x){return x&&typeof x==='object'?Array.isArray(x)?x.map(stable):Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x}
  function catalog(rows,previous,inventory){
    if(!Array.isArray(rows)||!rows.length||!inventory||typeof inventory!=='object')throw Error('อ่านรายการสินค้าหรือยอดกลางไม่สำเร็จ');
    const old=new Map(previous.map(p=>[String(p.code),p])),result=new Map();
    for(const row of rows){const id=String(row.id||row.code||'').trim();if(!id)continue;key(id);const prev=old.get(id)||{},saved=inventory[id];
      result.set(id,{...prev,id,code:id,easy:saved?.easy||prev.easy||row.name||id,real:String(row.name||row.real||prev.real||''),category:prev.category||row.category||'ทั่วไป',unit:row.unit||prev.unit||saved?.unit||'หน่วย',stock:saved?amount(saved.stock):Number(prev.stock)||0,last:saved?.last||prev.last||null,min:Number(saved?.min??prev.min??0)});
    }
    // Retain products missing from a stale Sheet, including all central balances.
    for(const p of previous)if(!result.has(String(p.code)))result.set(String(p.code),copy(p));
    for(const [id,row] of Object.entries(inventory)){key(id);if(!row||row.stock==null)throw Error('ยอดกลางไม่มี stock: '+id);const p=result.get(id);if(p){p.stock=amount(row.stock);p.last=copy(row.last||null)}else result.set(id,{id,code:id,easy:row.easy||id,real:row.easy||id,unit:row.unit||'หน่วย',category:'ทั่วไป',stock:amount(row.stock),last:copy(row.last||null),min:0})}
    return [...result.values()];
  }
  function plan({id,type,lines,products,inventory,lots={},rules={},operator,operatorId,time,day,reviewDay}){
    key(id);if(!['receive','issue','adjust'].includes(type)||!lines.length)throw Error('ไม่มีรายการ');
    const patch={},inverse={},lotBefore={},lotAfter={},nextLots=copy(lots),txLines=[],seen=new Set();
    const set=(path,value,before)=>{patch[path]=copy(value);inverse[path]=copy(before??null)};
    const sq=l=>amount(l.storeQty??l.qty??0),fq=l=>amount(l.frontQty??0);
    for(const line of lines){const pid=key(line.id);if(seen.has(pid))throw Error('รายการซ้ำ');seen.add(pid);const p=products.find(x=>String(x.id)===pid),row=inventory[pid];if(!p||!row)throw Error('ไม่พบยอดกลางสินค้า');
      const before=amount(row.stock);if(Math.abs(before-amount(line.before))>0.0001)throw Error('ยอดกลางเปลี่ยน กรุณารีเฟรชและทำรายการใหม่');
      const target=amount(type==='adjust'?line.target:type==='receive'?before+amount(line.qty):before-amount(line.qty));const qty=Math.abs(target-before);if(!qty)throw Error('ยอดไม่เปลี่ยน');
      const reason=type==='adjust'?(target>before?'count_plus':line.reason||'forgot_issue'):'';
      const last={type,qty,time,operator,operatorId,reason,before,after:target,txId:id};
      set(`store_hub_inventory/${pid}/stock`,target,before);set(`store_hub_inventory/${pid}/last`,last,row.last);
      txLines.push({productId:pid,easy:p.easy,code:p.code,unit:p.unit,qty,before,balance:target,reason,last});
      const candidates=Object.entries(nextLots).filter(([,l])=>!l.acknowledged&&(String(l.productId)===pid||String(l.code)===String(p.code))).sort((a,b)=>String(type==='adjust'&&target<before&&reason!=='forgot_issue'?a[1].reviewDate||a[1].receivedAt||'':a[1].receivedAt||a[1].receivedDate||'').localeCompare(String(type==='adjust'&&target<before&&reason!=='forgot_issue'?b[1].reviewDate||b[1].receivedAt||'':b[1].receivedAt||b[1].receivedDate||'')));
      const touch=(lid,lot)=>{key(lid);if(!(lid in lotBefore))lotBefore[lid]=copy(lots[lid]??null);nextLots[lid]=lot;lotAfter[lid]=copy(lot)};
      if(target>before){
        const rule=rules[pid]||Object.values(rules).find(r=>String(r.productId)===pid||String(r.code)===String(p.code));
        if(type==='adjust'&&candidates.length){const [lid,l]=candidates[0];touch(lid,{...l,storeQty:sq(l)+qty,lastAdjustedAt:time,lastAdjustedBy:operator})}
        else if(type==='adjust'||Number(rule?.days)>=1){const lid=key(`${id}_${pid}`),days=Math.floor(Number(rule?.days)||0);touch(lid,{productId:pid,code:p.code,easy:p.easy,unit:p.unit,qty,storeQty:qty,frontQty:0,receivedDate:day,receivedAt:time,reviewDate:days?reviewDay(days):day,ruleDays:days,receivedBy:operator,receivedById:operatorId,acknowledged:false,...(type==='adjust'?{adjustmentOnly:true}:{})})}
      }else{let remaining=qty;for(const [lid,l] of candidates){const take=Math.min(remaining,sq(l));if(take<=0)continue;touch(lid,{...l,storeQty:sq(l)-take,frontQty:fq(l)+(type==='issue'||reason==='forgot_issue'?take:0),lastAdjustedAt:time,lastAdjustedBy:operator});remaining-=take;if(remaining<=0)break}}
    }
    for(const [lid,after] of Object.entries(lotAfter))set(`store_hub_expiry_lots/${lid}`,after,lotBefore[lid]);
    const tx={type,operator,operatorId,time,lines:txLines,schemaVersion:1};
    patch[`store_hub_transactions/${id}`]=tx;
    patch['store_hub_meta/lastChangedAt']=time;patch['store_hub_meta/lastChangedBy']=operator;
    return {id,patch,inverse,lotBefore,lotAfter,tx};
  }
  function undo({id,original,inventory,lots,operator,operatorId,time}){
    key(id);for(const line of original.tx.lines){const row=inventory[line.productId];if(!row||row.last?.txId!==original.id||amount(row.stock)!==line.balance)throw Error('ยอดกลางเปลี่ยนแล้ว ยกเลิกรายการนี้ไม่ได้')}
    for(const [lid,after] of Object.entries(original.lotAfter))if(!same(lots[lid],after))throw Error('ล็อตเปลี่ยนแล้ว ยกเลิกรายการนี้ไม่ได้');
    const tx={type:'undo',originalTxId:original.id,originalType:original.tx.type,operator,operatorId,time,lines:original.tx.lines.map(x=>({...x,balance:x.before,before:x.balance}))};
    const patch={...copy(original.inverse),[`store_hub_transactions/${id}`]:tx,'store_hub_meta/lastChangedAt':time,'store_hub_meta/lastChangedBy':operator};
    return {id,patch,tx};
  }
  return {catalog,plan,undo,same};
});
