// OH STORE HUB — วางไฟล์นี้แทน Code.gs เดิมใน Apps Script ที่ผูกกับชีต OH016_stock_count
// หลังบันทึก: Deploy > Manage deployments > Edit > New version > Deploy

var STORE_SHEET_NAME = 'สโตร์';
var STORE_HEADERS = ['รหัสสินค้า', 'ชื่อสินค้าจริง', 'หน่วย', 'ยอดคงเหลือ', 'แก้ไขล่าสุด', 'แก้ไขโดยใคร'];
var PROMOTION_FOLDER_ID = '1l9fgwddPAkCuaM2HaRwJ5OHOMcSHtGLP';
var SPREADSHEET_ID = '1OyoRne2_qryU0K9k3fXo8sUufWS_wQmpGBSwPhUjlB0';

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function doGet(e) {
  try {
    var mode = String((e && e.parameter && e.parameter.mode) || 'daily');
    if (mode === 'store') {
      ensureStoreSheet_();
      return jsonOutput_({status: 'success', spreadsheetId: SPREADSHEET_ID, items: readStore_()});
    }
    if (mode === 'usageCurrent') return jsonOutput_(readUsageCurrent_());
    if (mode === 'daily' || mode === 'weekly') return jsonOutput_(readCatalog_(mode));
    return jsonOutput_({status: 'error', message: 'Unknown mode: ' + mode});
  } catch (error) {
    return jsonOutput_({status: 'error', message: String(error && error.message || error)});
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var mode = String(data.mode || '');
    if (mode === 'daily' || mode === 'weekly') return jsonOutput_(saveCount_(mode, data.items || []));
    if (mode === 'storeSave') return jsonOutput_(saveStore_(data));
    if (mode === 'promotionUpload') return jsonOutput_(uploadPromotion_(data));
    return jsonOutput_({status: 'error', message: 'Unknown mode: ' + mode});
  } catch (error) {
    return jsonOutput_({status: 'error', message: String(error && error.message || error)});
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function saveCount_(mode, items) {
  var ss = getSpreadsheet_();
  var sheetName = mode === 'daily' ? 'Stock_Daily' : 'Stock_Weekly';
  var sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  var timestamp = new Date();
  var values = items.map(function(item) {
    var today = item.today || {};
    return [
      timestamp,
      item.id || '',
      item.name || '',
      item.category || 'ทั่วไป',
      presentNumber_(today.full),
      presentNumber_(today.frac_normal),
      presentNumber_(today.frac_tare_net)
    ];
  });
  var oldRows = Math.max(0, sheet.getLastRow() - 1);
  if (values.length) sheet.getRange(2, 1, values.length, 7).setValues(values);
  if (oldRows > values.length) sheet.getRange(values.length + 2, 1, oldRows - values.length, 7).clearContent();
  SpreadsheetApp.flush();
  return {status: 'success', mode: mode, count: values.length, timestamp: timestamp.toISOString()};
}

function readCatalog_(mode) {
  var sheetName = mode === 'daily' ? 'daily' : 'weekly';
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var rows = sheet.getDataRange().getValues();
  var tareIndex = mode === 'daily' ? 4 : -1;
  var countTypeIndex = mode === 'daily' ? 5 : 4;
  return rows.slice(1).reduce(function(items, row) {
    var id = row[0] == null ? '' : String(row[0]);
    var name = row[1] == null ? '' : String(row[1]);
    if (!id && !name) return items;
    items.push({
      id: id,
      name: name,
      category: row[2] == null || row[2] === '' ? 'ทั่วไป' : String(row[2]),
      unit: row[3] == null ? '' : String(row[3]),
      tare: tareIndex >= 0 && row[tareIndex] !== '' ? number_(row[tareIndex]) : 0,
      count_type: row[countTypeIndex] == null || row[countTypeIndex] === '' ? 'both' : String(row[countTypeIndex]).trim()
    });
    return items;
  }, []);
}

function ensureStoreSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(STORE_SHEET_NAME) || ss.insertSheet(STORE_SHEET_NAME);
  sheet.getRange(1, 1, 1, STORE_HEADERS.length).setValues([STORE_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, STORE_HEADERS.length).setFontWeight('bold').setBackground('#18382e').setFontColor('#ffffff');
  sheet.setColumnWidth(1, 140);
  sheet.setColumnWidth(2, 390);
  sheet.setColumnWidth(3, 90);
  sheet.setColumnWidth(4, 110);
  sheet.setColumnWidth(5, 165);
  sheet.setColumnWidth(6, 130);
  return sheet;
}

function readStore_() {
  var sheet = getSpreadsheet_().getSheetByName(STORE_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues().reduce(function(items, row) {
    var id = row[0] == null ? '' : String(row[0]);
    if (!id) return items;
    items.push({
      id: id,
      name: row[1] == null ? '' : String(row[1]),
      unit: row[2] == null ? '' : String(row[2]),
      stock: number_(row[3]),
      updatedAt: row[4] instanceof Date ? row[4].toISOString() : String(row[4] || ''),
      updatedBy: row[5] == null ? '' : String(row[5])
    });
    return items;
  }, []);
}

function saveStore_(data) {
  var sheet = ensureStoreSheet_();
  var items = Array.isArray(data.items) ? data.items : [];
  var operator = String(data.operator || 'ไม่ระบุ');
  var timestamp = new Date();
  var values = items.map(function(item) {
    return [String(item.id || item.code || ''), String(item.name || ''), String(item.unit || ''), number_(item.stock), timestamp, operator];
  }).filter(function(row) { return row[0]; });
  var oldRows = Math.max(0, sheet.getLastRow() - 1);
  if (values.length) {
    sheet.getRange(2, 1, values.length, 6).setValues(values);
    sheet.getRange(2, 4, values.length, 1).setNumberFormat('0.00');
    sheet.getRange(2, 5, values.length, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  }
  if (oldRows > values.length) sheet.getRange(values.length + 2, 1, oldRows - values.length, 6).clearContent();
  SpreadsheetApp.flush();
  return {status: 'success', count: values.length, timestamp: timestamp.toISOString(), operator: operator};
}

function readUsageCurrent_() {
  var ss = getSpreadsheet_();
  var dailySheet = ss.getSheetByName('DAILY');
  var catalog = readCatalog_('daily');
  var catalogById = {};
  catalog.forEach(function(item) { catalogById[String(item.id)] = item; });
  var merged = {};
  var sourceTimestamp = '';
  if (dailySheet) {
    var a1 = dailySheet.getRange('A1').getValue();
    sourceTimestamp = a1 instanceof Date ? a1.toISOString() : String(a1 || '');
    var lastRow = dailySheet.getLastRow();
    if (lastRow >= 2) {
      var dailyRows = dailySheet.getRange(2, 2, lastRow - 1, 9).getValues(); // B:J
      dailyRows.forEach(function(row) {
        var id = row[0] == null ? '' : String(row[0]);
        if (!id) return;
        var catalogItem = catalogById[id] || {};
        merged[id] = {id: id, name: String(row[1] || catalogItem.name || id), unit: String(catalogItem.unit || ''), daily: number_(row[8]), store: 0};
      });
    }
  }
  readStore_().forEach(function(item) {
    if (!merged[item.id]) merged[item.id] = {id: item.id, name: item.name || item.id, unit: item.unit || '', daily: 0, store: 0};
    merged[item.id].store = number_(item.stock);
    if (!merged[item.id].unit) merged[item.id].unit = item.unit || '';
    if (!merged[item.id].name) merged[item.id].name = item.name || item.id;
  });
  var items = Object.keys(merged).map(function(id) {
    var item = merged[id];
    item.total = number_(item.daily) + number_(item.store);
    return item;
  });
  return {status: 'success', sourceTimestamp: sourceTimestamp, fetchedAt: new Date().toISOString(), items: items};
}

function uploadPromotion_(data) {
  var base64 = String(data.base64 || '');
  if (!base64) throw new Error('ไม่พบข้อมูลไฟล์ PDF');
  var folderId = String(data.folderId || PROMOTION_FOLDER_ID);
  var folder = DriveApp.getFolderById(folderId);
  var title = cleanFileName_(data.title || data.fileName || 'Memo');
  var fileName = title.toLowerCase().endsWith('.pdf') ? title : title + '.pdf';
  var bytes = Utilities.base64Decode(base64);
  if (bytes.length > 8 * 1024 * 1024) throw new Error('ไฟล์ PDF ต้องไม่เกิน 8 MB');
  var blob = Utilities.newBlob(bytes, MimeType.PDF, fileName);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {
    status: 'success',
    fileId: file.getId(),
    fileName: file.getName(),
    previewUrl: 'https://drive.google.com/file/d/' + file.getId() + '/preview',
    viewUrl: 'https://drive.google.com/file/d/' + file.getId() + '/view'
  };
}

function presentNumber_(value) {
  return value !== '' && value !== null && value !== undefined ? number_(value) : 0;
}

function number_(value) {
  var n = Number(value);
  return isFinite(n) ? n : 0;
}

function cleanFileName_(value) {
  return String(value || 'Memo').replace(/[\\/:*?"<>|#%{}]/g, '-').replace(/\s+/g, ' ').trim().substring(0, 120) || 'Memo';
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
