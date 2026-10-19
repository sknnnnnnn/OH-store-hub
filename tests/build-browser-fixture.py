from pathlib import Path
root=Path(__file__).resolve().parent.parent
s=(root/'index.html').read_text()
for name in ['store-core.js','store-transport.js']:
 s=s.replace(f'<script src="./{name}"></script>','<script>'+ (root/name).read_text()+'</script>')
s=s.replace('https://oj-stock-a6af4-default-rtdb.asia-southeast1.firebasedatabase.app','https://oh-fixture.invalid')
s=s.replace('https://script.google.com/macros/s/AKfycbwe-h24CMCM1c92oIrlh_mOaMr6NJFQ8iaMhAJ_Rr958QAe4qJjoEjj-5ERufIIQr6g/exec','https://sheets-fixture.invalid/exec')
fixture='''<script>
// Synthetic browser fixture: NEVER forwards a network request.
const fixtureProduct={id:'TEST-A',code:'TEST-A',easy:'สินค้าทดสอบ A',real:'สินค้าทดสอบ A',unit:'ถุง',stock:10,category:'chill'};
const fixtureCatalog=[{id:'TEST-A',name:'สินค้าทดสอบ A',unit:'ถุง',category:'chill'}];
const fixtureInitial={store_hub_inventory:{'TEST-A':{stock:10,easy:'สินค้าทดสอบ A',unit:'ถุง'}},store_hub_expiry_rules:{'TEST-A':{days:7}},store_hub_expiry_lots:{test_lot:{productId:'TEST-A',code:'TEST-A',easy:'สินค้าทดสอบ A',storeQty:10,frontQty:0,qty:10,receivedAt:'2026-10-01',reviewDate:'2026-11-01',acknowledged:false}},store_hub_transactions:{}};
let fixtureDB=JSON.parse(localStorage.getItem('OH_FIXTURE_DB')||'null')||fixtureInitial,fixtureMode='online',fixtureCalls=[];
localStorage.setItem('oh_products',JSON.stringify([fixtureProduct]));localStorage.setItem('oh_current_user','p00');localStorage.removeItem('oh_catalog_sheet_signature');
function fixtureStatus(){document.getElementById('fixtureStatus').textContent=`SYNTHETIC · ${fixtureMode} · stock ${fixtureDB.store_hub_inventory['TEST-A'].stock} · transactions ${Object.keys(fixtureDB.store_hub_transactions||{}).length}`}
function fixtureSetMode(mode){fixtureMode=mode;fixtureStatus()}
window.EventSource=class {addEventListener(){} close(){}};
window.fetch=async function(url,options={}){
 const u=new URL(url,location.href),method=options.method||'GET';fixtureCalls.push({host:u.host,path:u.pathname,method});
 if(fixtureMode==='offline')throw new TypeError('Fixture offline');
 if(u.host==='sheets-fixture.invalid'){
   const mode=u.searchParams.get('mode');let data=fixtureCatalog;
   if(mode==='store')data={status:'success',apiVersion:'OH_STORE_HUB_V8',mode,spreadsheetId:'1OyoRne2_qryU0K9k3fXo8sUufWS_wQmpGBSwPhUjlB0',sheetName:'สโตร์',items:fixtureCatalog.map(x=>({...x,stock:999}))};
   if(mode?.startsWith('incoming'))data={status:'success',date:'2026-10-19',documents:[]};
   if(method==='POST'){const body=JSON.parse(options.body);data={status:'success',apiVersion:'OH_STORE_HUB_V8',mode:body.mode,spreadsheetId:'1OyoRne2_qryU0K9k3fXo8sUufWS_wQmpGBSwPhUjlB0',sheetName:'สโตร์',count:body.items?.length||0}}
   return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 }
 if(u.host!=='oh-fixture.invalid')return new Response('{}',{status:404});
 const path=decodeURIComponent(u.pathname.replace(/^\\//,'').replace(/\\.json$/,'')),parts=path?path.split('/'):[];
 if(method==='GET'){let value=fixtureDB;for(const p of parts)value=value?.[p];return new Response(JSON.stringify(value??null),{status:200})}
 if(fixtureMode==='denied')return new Response('{}',{status:403});
 if(method==='PATCH'&&!path){const patch=JSON.parse(options.body),next=JSON.parse(JSON.stringify(fixtureDB));for(const [path,value]of Object.entries(patch)){const p=path.split('/');let o=next;for(const k of p.slice(0,-1))o=o[k]??={};if(value===null)delete o[p.at(-1)];else o[p.at(-1)]=value}fixtureDB=next;localStorage.setItem('OH_FIXTURE_DB',JSON.stringify(fixtureDB));fixtureStatus();if(fixtureMode==='lost'){fixtureMode='online';throw new TypeError('Fixture response lost')}return new Response(JSON.stringify(patch),{status:200})}
 // Non-Store modules are read-only in this fixture.
 return new Response('{}',{status:403});
};
</script>'''
s=s.replace('<div id="app"',fixture+'<div style="position:fixed;top:0;left:0;right:0;z-index:99999;background:#5b2144;color:white;padding:5px;font:12px sans-serif"><span id="fixtureStatus">SYNTHETIC TEST · no production data</span> <button onclick="fixtureSetMode(\'online\')">Test online</button> <button onclick="fixtureSetMode(\'offline\')">Test offline</button> <button onclick="fixtureSetMode(\'denied\')">Test denied</button> <button onclick="fixtureSetMode(\'lost\')">Test lost response</button></div><div id="app"',1)
s=s.replace('window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}))','window.addEventListener("load",()=>{})')
s=s.replace('</body>','<script>fixtureStatus()</script></body>')
(root/'tests/browser-fixture.html').write_text(s)
print(root/'tests/browser-fixture.html')
