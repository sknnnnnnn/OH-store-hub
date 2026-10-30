/* OH scanner: auto-detect plus editable four-corner perspective correction. */
(function(){
 let cvPromise=null,editor=null;
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const image=src=>new Promise((ok,no)=>{const x=new Image();x.onload=()=>ok(x);x.onerror=no;x.src=src});
 function cvReady(){
  if(window.cv&&typeof window.cv.Mat==="function")return Promise.resolve(window.cv);
  if(cvPromise)return cvPromise;
  cvPromise=new Promise((resolve,reject)=>{
   const script=document.createElement("script");script.src="https://docs.opencv.org/4.x/opencv.js";script.async=true;
   const timeout=setTimeout(()=>reject(Error("โหลดเครื่องมือตรวจขอบไม่สำเร็จ")),14000);
   script.onload=()=>{
    const poll=()=>{if(window.cv&&typeof cv.Mat==="function"){clearTimeout(timeout);resolve(cv)}else setTimeout(poll,100)};
    poll();
   };script.onerror=()=>{clearTimeout(timeout);reject(Error("โหลดระบบตรวจขอบไม่สำเร็จ"))};document.head.appendChild(script);
  });return cvPromise;
 }
 const defaultPoints=()=>[[.05,.05],[.95,.05],[.95,.95],[.05,.95]];
 async function detect(data){
  const cv=await cvReady(),im=await image(data),scale=Math.min(1,1000/Math.max(im.naturalWidth,im.naturalHeight));
  const canvas=document.createElement("canvas");canvas.width=Math.round(im.naturalWidth*scale);canvas.height=Math.round(im.naturalHeight*scale);
  canvas.getContext("2d").drawImage(im,0,0,canvas.width,canvas.height);
  let src,gray,blur,edges,contours,hierarchy;
  try{
   src=cv.imread(canvas);gray=new cv.Mat();blur=new cv.Mat();edges=new cv.Mat();contours=new cv.MatVector();hierarchy=new cv.Mat();
   cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);
   cv.Canny(blur,edges,55,160);cv.findContours(edges,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
   let best=null,bestArea=0;
   for(let i=0;i<contours.size();i++){const ct=contours.get(i),peri=cv.arcLength(ct,true),poly=new cv.Mat();cv.approxPolyDP(ct,poly,.025*peri,true);
    const area=Math.abs(cv.contourArea(poly));
    if(poly.rows===4&&cv.isContourConvex(poly)&&area>bestArea&&area>canvas.width*canvas.height*.15){
     const p=[];for(let j=0;j<4;j++)p.push([poly.data32S[j*2]/canvas.width,poly.data32S[j*2+1]/canvas.height]);
     const sums=p.map(x=>x[0]+x[1]),diffs=p.map(x=>x[0]-x[1]);
     const ordered=[p[sums.indexOf(Math.min(...sums))],p[diffs.indexOf(Math.max(...diffs))],p[sums.indexOf(Math.max(...sums))],p[diffs.indexOf(Math.min(...diffs))]];
     if(new Set(ordered.map(x=>x.join(","))).size===4){best=ordered;bestArea=area}
    }poly.delete();ct.delete();
   }
   return best;
  }finally{[src,gray,blur,edges,contours,hierarchy].forEach(x=>x&&x.delete())}
 }
 function draw(){
  if(!editor)return;
  const g=document.getElementById("scanQuad");if(!g)return;
  g.setAttribute("points",editor.points.map(p=>(p[0]*100)+","+(p[1]*100)).join(" "));
  editor.points.forEach((p,i)=>{const node=document.getElementById("scanCorner"+i);if(node){node.setAttribute("cx",p[0]*100);node.setAttribute("cy",p[1]*100)}});
 }
 window.scanOpenCrop=async function(id){
  const page=state.scanPages.find(x=>x.id===id);if(!page)return;
  const pts=page.quad||defaultPoints();editor={id,points:pts.map(p=>p.slice()),drag:-1};
  document.body.style.overflow="hidden";
  const ui=document.createElement("div");ui.id="scanAutoEditor";ui.innerHTML='<div class="sa-head"><b>ปรับขอบเอกสาร</b><button onclick="scanCloseCrop()">✕</button></div><div class="sa-stage"><div class="sa-surface" id="saSurface"><img id="saImage"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polygon id="scanQuad" fill="rgba(21,171,119,.13)" stroke="#40f6b2" stroke-width=".6"/>'+[0,1,2,3].map(i=>'<circle id="scanCorner'+i+'" data-corner="'+i+'" r="2.5" fill="#fff" stroke="#16875b" stroke-width="1"/>').join("")+'</svg></div></div><p class="sa-hint" id="saHint">ลากจุดทั้ง 4 มุมให้ตรงขอบกระดาษ</p><div class="sa-controls"><button onclick="scanAutoDetect()">✨ จับขอบใหม่</button><button onclick="scanResetCrop()">เต็มภาพ</button><button class="sa-save" onclick="scanSaveCrop()">ใช้กรอบนี้</button></div>';
  document.body.appendChild(ui);document.getElementById("saImage").src=page.data;
  const surface=document.getElementById("saSurface");
  const point=e=>{const r=surface.getBoundingClientRect();return [clamp((e.clientX-r.left)/r.width,0,1),clamp((e.clientY-r.top)/r.height,0,1)]};
  surface.addEventListener("pointerdown",e=>{const i=Number(e.target.dataset.corner);if(!e.target.hasAttribute("data-corner"))return;editor.drag=i;surface.setPointerCapture(e.pointerId);e.preventDefault()});
  surface.addEventListener("pointermove",e=>{if(!editor||editor.drag<0)return;editor.points[editor.drag]=point(e);draw()});
  surface.addEventListener("pointerup",()=>{if(editor)editor.drag=-1});
  surface.addEventListener("pointercancel",()=>{if(editor)editor.drag=-1});
  draw();
  if(!page.quad)scanAutoDetect();
 };
 window.scanAutoDetect=async function(){
  if(!editor)return;const id=editor.id;document.getElementById("saHint").textContent="กำลังตรวจหาขอบเอกสาร…";
  try{const page=state.scanPages.find(p=>p.id===id),pts=await detect(page.data);
   if(editor?.id!==id)return;
   if(pts){editor.points=pts;draw();document.getElementById("saHint").textContent="ตรวจพบเอกสารแล้ว · ลากมุมแก้ได้";}
   else document.getElementById("saHint").textContent="ไม่พบขอบที่มั่นใจ · กรุณาลากมุมเอง";
  }catch(e){if(editor?.id===id)document.getElementById("saHint").textContent="ตรวจอัตโนมัติไม่พร้อม · ลากมุมเองได้";}
 };
 window.scanResetCrop=()=>{if(editor){editor.points=defaultPoints();draw()}};
 window.scanSaveCrop=()=>{if(!editor)return;const p=state.scanPages.find(x=>x.id===editor.id);if(p){p.quad=editor.points.map(x=>x.slice());delete p.crop}scanCloseCrop();render()};
 window.scanCloseCrop=()=>{editor=null;document.getElementById("scanAutoEditor")?.remove();document.body.style.overflow=""};
 const oldProcessed=window.scanProcessedPage;
 window.scanProcessedPage=async function(page){
  if(!page.quad)return oldProcessed(page);
  try{
   const cv=await cvReady(),img=await image(page.data),srcCanvas=document.createElement("canvas");
   srcCanvas.width=img.naturalWidth;srcCanvas.height=img.naturalHeight;srcCanvas.getContext("2d").drawImage(img,0,0);
   let src,transformed,srcPts,dstPts,M;
   try{
    src=cv.imread(srcCanvas);
    const q=page.quad.map(p=>[p[0]*img.naturalWidth,p[1]*img.naturalHeight]);
    const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
    const w=Math.max(1,Math.min(4096,Math.round(Math.max(dist(q[0],q[1]),dist(q[3],q[2])))));
    const h=Math.max(1,Math.min(4096,Math.round(Math.max(dist(q[0],q[3]),dist(q[1],q[2])))));
    srcPts=cv.matFromArray(4,1,cv.CV_32FC2,q.flat());dstPts=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,w,0,w,h,0,h]);M=cv.getPerspectiveTransform(srcPts,dstPts);
    transformed=new cv.Mat();cv.warpPerspective(src,transformed,M,new cv.Size(w,h),cv.INTER_LINEAR,cv.BORDER_CONSTANT,new cv.Scalar(255,255,255,255));
    let c=document.createElement("canvas");cv.imshow(c,transformed);
    if(page.rotation){const rotated=await oldProcessed({...page,data:c.toDataURL("image/png"),crop:null,quad:null});c=rotated}
    if(state.scanMode==="document"){
     const ctx=c.getContext("2d",{willReadFrequently:true}),d=ctx.getImageData(0,0,c.width,c.height),a=d.data;
     for(let i=0;i<a.length;i+=4){let g=.299*a[i]+.587*a[i+1]+.114*a[i+2];g=clamp((g-128)*1.6+128,0,255);g=g<80?g*.5:g>190?255:g;a[i]=a[i+1]=a[i+2]=g}ctx.putImageData(d,0,0)
    }return c;
   }finally{[src,transformed,srcPts,dstPts,M].forEach(x=>x&&x.delete())}
  }catch(e){console.error("Perspective correction failed",e);throw new Error("ปรับมุมเอกสารไม่สำเร็จ กรุณาลองอีกครั้งหรือเลือกเต็มภาพ")}
 };
 const css=document.createElement("style");css.textContent='#scanAutoEditor{position:fixed;inset:0;z-index:999;background:#111827;color:#fff;display:flex;flex-direction:column;padding:env(safe-area-inset-top) 10px env(safe-area-inset-bottom)}.sa-head{display:flex;justify-content:space-between;align-items:center;padding:14px}.sa-head button,.sa-controls button{border:0;border-radius:12px;padding:12px;background:#e5e7eb;color:#111827}.sa-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden}.sa-surface{position:relative;display:inline-block;max-width:100%;max-height:100%;touch-action:none}.sa-surface img{display:block;max-width:100%;max-height:calc(100dvh - 210px);object-fit:contain}.sa-surface svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;touch-action:none}.sa-surface circle{cursor:grab;pointer-events:all}.sa-hint{text-align:center;font-size:12px;color:#d1d5db;margin:9px}.sa-controls{display:flex;gap:7px;margin-bottom:10px}.sa-controls button{flex:1;font-size:12px}.sa-controls .sa-save{background:#16a36f;color:white}';document.head.appendChild(css);
})();