/* Read-only schedule endpoint for the EXISTING shared Apps Script.
 * Integrate one line in existing doGet(e) BEFORE its default catalog route:
 *   if (String(e.parameter.mode||'') === 'scheduleSheetPreview')
 *      return jsonOutput_(scheduleSheetPreview_(e.parameter.cycle)); 
 * The existing shared project helper is jsonOutput_().
 * DO NOT replace doGet/doPost or change Store/inventory routes.
 */
function scheduleSheetPreview_(cycle) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-21$/.test(String(cycle||''))) throw Error('Invalid schedule cycle');
  var bits=cycle.split('-').map(Number),start=new Date(bits[0],bits[1]-1,21),end=new Date(bits[0],bits[1],20),dates=[];
  for(var d=new Date(start);d<=end;d.setDate(d.getDate()+1))dates.push(Utilities.formatDate(d,'Asia/Bangkok','yyyy-MM-dd'));
  var sheet=getSpreadsheet_().getSheetByName('ตารางงาน');
  if(!sheet)throw Error('Missing ตารางงาน sheet');
  var matrix=sheet.getRange(1,1,Math.min(Math.max(sheet.getLastRow(),1),100),Math.min(Math.max(sheet.getLastColumn(),36),45)).getDisplayValues();
  var firstCol=5,header=-1;
  for(var r=0;r<Math.min(matrix.length,12);r++){
    var vals=matrix[r].slice(firstCol,firstCol+dates.length).map(function(v){return String(v).trim()});
    if(vals.length===dates.length && vals.every(function(v,i){return Number(v)===Number(dates[i].slice(-2))})){header=r;break}
  }
  if(header<0)throw Error('Sheet header dates do not match selected 21–20 cycle');
  var employees=[],seen={};
  for(var i=header+1;i<matrix.length;i++){
    var row=matrix[i],code=String(row[1]||'').trim();
    if(!/^\d{5,8}$/.test(code))continue; // excludes time-description rows
    if(seen[code])throw Error('Duplicate employee code '+code);
    seen[code]=true;
    employees.push({code:code,
      shifts:row.slice(firstCol,firstCol+dates.length).map(function(v){return String(v||'').trim()})});
  }
  if(!employees.length)throw Error('No employee rows found');
  return {status:'success',mode:'scheduleSheetPreview',sheetName:'ตารางงาน',cycle:cycle,dates:dates,employees:employees};
}
