# เปิดทดสอบฟีเจอร์อ่านตารางงานจาก Google Sheets (ยังไม่ปล่อยจริง)

**สถานะ:** โค้ดหน้าเว็บอยู่ PR #5 (ยังเป็น Draft ไม่ Merge) และ Apps Script ยังไม่ได้ Deploy

## เป้าหมาย
เมนู `ตารางงาน > จัดการตารางและพนักงาน > อ่านตารางจาก Google Sheets` เลือกรอบ 21–20 แล้วอ่าน `ตารางงาน` เพื่อแสดง Preview ผู้ใช้ต้องกดยืนยันก่อนบันทึกลง Firebase. ไม่ยุ่งกับ Store/Stock/Incoming/Count.

## ขั้นตอนเชื่อม Apps Script **เดิม** (ต้องมีสิทธิ์แก้ Project เดิม)
1. สำรอง Apps Script project/version ปัจจุบันไว้ก่อน ไม่ลบไฟล์เดิม
2. สร้างไฟล์ .gs ใหม่ในโปรเจกต์ Apps Script เดิม แล้ววางเนื้อหาจาก `backend/schedule-readonly.gs` **เฉพาะตัวฟังก์ชัน scheduleSheetPreview_()** ไม่ต้องนำตัวอย่าง doGet จาก comment ไปแทนที่โค้ดเดิม
3. ใน `doGet(e)` เดิม ใต้บรรทัด `var mode = String((e && e.parameter && e.parameter.mode) || 'daily');` เพิ่ม:
```js
if (mode === 'scheduleSheetPreview') {
  return jsonOutput_(scheduleSheetPreview_(String((e && e.parameter && e.parameter.cycle) || '')));
}
```
4. บันทึกและ Deploy > Manage deployments > Edit > New version > Deploy **ใน Deployment เดิม** (ไม่สร้าง URL ใหม่). ตรวจว่า GET daily/weekly/store ยังคงตอบตามเดิม
5. เช็ก GET URL: `<existing-exec-url>?mode=scheduleSheetPreview&cycle=2026-10-21`. ตัวอย่างเดือนต้องเป็น **รอบจริงในชีต**; ข้อมูลมีแต่เลขวัน ไม่มีเดือนปีในหัวตาราง จึงต้องตรวจความตรงกับปฏิทินก่อนบันทึก

## สำคัญด้านสิทธิ์และความปลอดภัย
Endpoint อ่านจากชีต `ตารางงาน` มีรหัสพนักงานและตารางกะ จึงต้องพิจารณาสิทธิ์เข้าถึง Web App ก่อนเผยแพร่. อย่าเปลี่ยนสิทธิ์ Apps Script หรือฐานข้อมูลร้านให้สาธารณะกว่าเดิมเพียงเพื่อให้ทดสอบได้.
เมื่อมี endpoint แล้ว ต้องตรวจเส้นทางอ่านและ Preview ก่อนจะ Merge PR #5. หน้าเว็บบน main ยังไม่มีปุ่มนี้จนกว่าจะ Merge.

## ข้อควรระวัง
- การเลือกเดือนใน UI คือการระบุเดือน/ปีที่ไม่มีอยู่ในชีต ไม่ใช่ข้อมูลที่อ่านยืนยันได้อัตโนมัติ
- ถ้ารหัสกะไม่รู้จัก / รหัสพนักงานไม่ตรง จะกั้นการยืนยัน
- การอ่านและ Preview ไม่เขียนชีตหรือ Firebase แต่ขั้นตอนยืนยันจะเปลี่ยนตารางงานกลางจริง
- เวอร์ชันนี้ยังไม่ได้ Browser QA และยังมี race ระหว่าง GET ค่ากลางกับ PATCH; จึงยังไม่ควรเปิดปุ่ม Publish ให้พนักงานทั่วไปใช้งาน
