# OH Store Hub

Candidate stabilization V8.6.43 — **BLOCKED, ยังไม่ Merge/Deploy**. สถานะและหลักฐานอ่านที่ `RELEASE_STATUS_TH.md`.

ไฟล์หน้าเว็บเดิม `index.html`, PWA `sw.js`, manifest และ icons คงโครงสร้างเดิม. เพิ่ม `store-core.js` สำหรับวางแผนธุรกรรมโดยไม่เขียนข้อมูล และ `store-transport.js` สำหรับ atomic PATCH พร้อม pending journal.

## ทดสอบ

ใช้ Node.js 20 ขึ้นไป: `node --test --test-reporter=tap tests/*.test.cjs`.

Tests ใช้ฐานข้อมูลจำลองในหน่วยความจำ ไม่แตะ Firebase/Sheets จริง และไม่ใช้แทน Browser QA. ผลที่เก็บไว้ใน `evidence/all-tests.tap`.

`python tests/build-browser-fixture.py` สร้าง fixture จาก source ล่าสุด โดยเปลี่ยน endpoint เป็น .invalid และจำลอง fetch ภายในเพื่อแยก Production; fixture นี้ยังไม่ผ่าน Browser QA. อย่าเปิด index.html ของ production เพื่อทดสอบธุรกรรม.

## ก่อน Release

ต้องมี HTTPS staging, Firebase test database/rules, Apps Script/Sheets test deployment และ source ของ Apps Script ที่ deploy อยู่จริง. ไฟล์ .gs ใน repo เป็น V3 แต่ backend ตอบ V8: ห้าม Deploy ทับ. ตรวจ missing stock สองรหัสตามรายงานโดยไม่เดายอดหรือ import ชีตเก่าทับ.

ห้าม Merge จน Store/Undo/ล็อต/Sheets/offline/mobile/regression สำคัญผ่าน และห้ามเขียน Production เพื่อทดสอบหากไม่มี backup และอนุมัติ.
