# OH Store Hub — Final Stabilization R3

สถานะ Release: **BLOCKED — ยังไม่พร้อมประกาศพร้อมใช้งานจริง และยังไม่ Merge / Deploy**

ตรวจวันที่ 19 ตุลาคม 2026 (Asia/Bangkok). ฐาน `main`: `7240bb85b4af3437c1b905de3946f210fd7d353f`.
Branch งาน: `work/final-stabilization-r3`. โค้ดหน้านี้เตรียม manifest V8.6.43 แต่ยังไม่ได้เผยแพร่.

## หลักฐานที่ตรวจจริง

| รายการ | ผล | ขอบเขต / หลักฐาน |
|---|---|---|
| GitHub main และ PR #1–#3 | PASS | ตรวจสถานะและ diff เทียบ main; ไม่ Merge โค้ดทดลอง |
| สิทธิ์ GitHub | PASS | connector รายงาน pull/push/admin บน repository นี้ |
| GitHub Pages เปิดใน Chrome จริง | PASS เฉพาะเวอร์ชัน main | เห็นหน้าเลือกผู้ใช้ หน้าเมนู และหน้า incoming |
| Apps Script GET `mode=store` | PASS ในรอบตรวจ | HTTP 302 ไป googleusercontent แล้ว 200 JSON; `Access-Control-Allow-Origin: *`; status success / API V8 / spreadsheet และ sheetName ตรง config |
| หน้า incoming ใช้ข้อมูลจริง | PASS เฉพาะการอ่าน | Browser เห็นเอกสารและรายการสินค้า; ไม่กดรับหรือเคลียร์; ปุ่มสองรายการถูกพักไว้ |
| ทำซ้ำ Failed to fetch | BLOCKED: ทำซ้ำไม่ได้ในรอบนี้ | ไม่พบ error จากแอปใน log ที่บันทึก; พบ error ของ chrome-extension แยกต่างหาก จึงห้ามสรุปว่าต้นเหตุเดิมเป็น CORS หรือแก้หายถาวรแล้ว |
| Firebase inventory GET | PASS เฉพาะสิทธิ์อ่าน | HTTP 200; พบ 205 child records ใน snapshot ที่ตรวจ ไม่มีการส่งธุรกรรมทดสอบไป Production |
| ความครบถ้วนยอดกลาง | FAIL | `042-01-010-D` และ `042-01-011-D` มีเฉพาะ `easy`, `unit` ไม่มี `stock`; ยังไม่ทราบยอดที่ถูกต้อง ห้ามเดาเป็นศูนย์; ตรวจประวัติกลาง 1,294 ธุรกรรมแล้วไม่พบ transaction lines ของสองรหัสนี้ จึงยังใช้ประวัติกู้ยอดไม่ได้ |
| ตรรกะ Store / Undo / ล็อต / คำตอบหาย / offline | PASS เฉพาะชุดทดสอบจำลอง | 24 tests, 0 failures; `evidence/all-tests.tap`; Node test runner และ VM เรียก handler จริง ไม่ใช่ Browser QA หรือ Firebase Emulator |
| Browser โค้ดใหม่ | BLOCKED | เบราว์เซอร์ปฏิเสธ file:// fixture ตาม URL policy; หยุดเส้นทางนี้ ไม่พยายามเลี่ยงข้อจำกัด |
| Firebase staging จริง / security rules | BLOCKED | ไม่มี endpoint/ข้อมูลทดสอบที่แยกและ rules ให้ตรวจ; ไม่ใช้ production เพื่อทดสอบ PATCH |
| Sheets POST / สำรอง / sync ครบวงจร | BLOCKED | ไม่มี Apps Script deployment และ spreadsheet สำหรับทดสอบแยก; ไม่ส่งยอดทดสอบทับชีตร้าน |
| มือถือจริง / mobile viewport ใหม่ / offline ใน browser | BLOCKED | ยังไม่ได้ทดสอบบนอุปกรณ์หรือสภาพแวดล้อมมือถือที่รองรับ |
| โมดูลตาราง นับของ usage memo อายุสินค้า ลา QR scanner Post-it | BLOCKED ด้าน regression เต็มรูปแบบ | ไม่ทดสอบการเขียนบน Production; บางหน้าถูก catalog update gate บังคับก่อนเข้า ไม่กดปุ่มนั้นเพราะพบโค้ดเสี่ยง |
| Merge และ post-deploy QA | BLOCKED | ไม่ผ่าน release gate จึงไม่ Merge และไม่ Deploy |

## ข้อค้นพบและการแก้ใน branch นี้

1. Catalog update เดิม PATCH `/store_hub_inventory` โดยใส่ `{id: {easy, unit}}` สำหรับรายการเดิม ซึ่งแทนที่ child object ทั้งก้อนและอาจทำให้ stock/last หาย แก้เป็นอ่านข้อมูลกลางและอัปเดต catalog ในเครื่องเท่านั้น ไม่มี Firebase write จากขั้นตอนนี้ ไม่ยืนยันว่ารหัสที่ไม่มี stock ทั้งสองเกิดจากเหตุนี้โดยไม่มี audit ก่อนหน้า.
2. รวมการเขียน stock, last, transaction history, expiry lots และ lastChanged meta เป็น Firebase root multi-location PATCH เดียว ไม่เขียนทับทั้ง database. ต้องพิสูจน์สิทธิ์ atomic PATCH บน staging ก่อน Merge.
3. เปลี่ยนยอดในเครื่องหลังได้รับผลยืนยันเท่านั้น; HTTP rejection หรือ offline ไม่เพิ่มยอด/ประวัติในเครื่องก่อนบันทึกสำเร็จ.
4. เก็บ pending journal ใน localStorage ก่อนส่ง พร้อม UUID เดียวกัน ตรวจ transaction record หลัง response หาย/รีโหลด ไม่ส่ง receive ซ้ำอัตโนมัติ. ถ้ายังอ่านผลไม่ได้หรือไม่พบ record จะกั้นธุรกรรมถัดไปและแสดง ID ให้ตรวจสอบ. ไม่ล้าง journal หรือ replay โดยเดา.
5. Undo ตรวจ marker ของธุรกรรม ยอด และล็อตที่เกี่ยวข้องก่อนวางแผนย้อนกลับ แล้วส่งยอด/ล็อต/ประวัติ Undo พร้อมกัน เก็บประวัติเดิมและ originalTxId ไว้.
6. พัก Sheet restore ที่อาจเขียนทับยอด manual; การสำรองชีตต้องอ่าน Firebase สำเร็จและมียอดตัวเลขครบ ห้ามใช้ cache เป็นยอดสำรองเมื่ออ่านกลางไม่ได้. ไม่สร้าง stock จาก row.stock ในชีตให้สินค้าใหม่อัตโนมัติ.
7. Catalog เก็บสินค้าที่หายจากชีตเก่าไว้; ตรวจ missing stock แทนการเปลี่ยนเป็น 0. พบ missing stock จริง จึงอาจระงับ catalog/backup จนยืนยันยอดให้ครบ.
8. เพิ่มการตรวจ HTTP failure สำหรับ Firebase writes ของโมดูลเดิม; ไม่ใช่หลักฐานว่า optimistic UI/rollback ทุกโมดูลถูกต้องแล้ว ต้องทดสอบต่อ.
9. ไม่เขียนตารางงานจาก embedded recovery โดยอัตโนมัติเพียงเพราะเปิดเว็บหรืออ่าน network ไม่ได้.
10. จำกัดการทำธุรกรรม Store กับ Sheet backup ไม่ให้ซ้อนกันในเครื่องเดียว; ไม่มีการเพิ่มระบบล็อกหลายเครื่อง.
11. แยก transaction ที่ถูก Undo ออกจากการคำนวณ usage รุ่นใหม่. ประวัติ Undo เก่าที่ไม่มี originalTxId ยังผูกกลับอัตโนมัติไม่ได้ ต้องตรวจแยก.
12. เพิ่ม timeout และข้อความผิดพลาดที่อ่านได้สำหรับ Sheets request สำคัญ ใช้ text/plain POST เดิม ไม่ใช้ no-cors, JSONP หรือ proxy สาธารณะ. ไม่อ้างว่าสามารถรับประกัน network สำเร็จทุกครั้ง.
13. Service Worker เปลี่ยน cache เป็น v18 และเพิ่ม module สองไฟล์ใน app shell เพื่อใช้หลัง release ที่ผ่านการตรวจ.

## ผลตรวจ PR เดิม

| PR | สถานะจริง | ข้อสรุป |
|---|---|---|
| #1 | open / draft; head 39b26f5 | มี reservation/ETag และ receipt safety แต่ยังมีการเขียนไม่ atomic และงานทดสอบค้าง ไม่รวม branch นี้อัตโนมัติ |
| #2 | merged | main พัก incoming receive/clear แล้ว รักษา guard และปุ่มเดิมไว้ |
| #3 | open / draft; head 6eb21b6 | ตรวจแนวทาง fail-closed และ HTTP guards; ไม่ Merge เนื่องจากยังเปลี่ยน local ก่อนยืนยันและ Undo ยังแยกคำขอ; นำหลักการมาแก้ใหม่ใน branch นี้ |

## Source of truth ของ Apps Script ยังไม่ครบ

ไฟล์ `OH_STORE_HUB_APPS_SCRIPT.gs` ใน repository ระบุ API V3 ขณะที่ deployment จริงตอบ API V8 และรองรับ incoming ซึ่งไม่มีในไฟล์ V3. จึงห้ามนำไฟล์ V3 นี้ Deploy ทับ backend ปัจจุบัน และห้ามเปลี่ยน string V3 เป็น V8 แล้วถือว่าเทียบเท่ากัน.

ต้องมี source ของ deployment ปัจจุบันและ test deployment แยกเพื่อวิเคราะห์ POST, redirect, timeout, permission และ schema โดยไม่กระทบร้าน. GET ที่ผ่านไม่ได้พิสูจน์ว่า POST หรือทุกโมดูลผ่าน.

## สิ่งที่ยังต้องทำก่อนอนุญาต Merge

1. สำรอง Production ที่กู้คืนได้ก่อนพิจารณาการแก้ข้อมูลจริง พร้อมยืนยันยอดของสองรหัสที่ไม่มี stock. งานนี้ยังไม่มีตัวเลขที่ตรวจยืนยันและยังไม่ได้แก้ Production.
2. จัดเตรียม Firebase test database พร้อม rules/schema เทียบ production และ Sheets/Apps Script test deployment ที่ใช้ข้อมูลสังเคราะห์. ห้ามเพิ่มสิทธิ์ public ของ Production เพื่อให้ test ผ่าน.
3. ให้ Browser QA ใช้ HTTPS staging ของ candidate นี้: รับเข้า/เบิก/adjust ทุกเหตุผล/Undo/FIFO/รีโหลด/ดับเบิลคลิก/offline ก่อนส่งและหลัง server commit/HTTP 403/timeout/storage เต็ม/backup แล้วเกิดรายการถัดไป.
4. ตรวจว่า stock, history, lots, journal และ Sheets ตรงกันหลังทุกกรณี; เก็บ network/console/screenshot/รุ่น browser จริง และทดสอบมือถือ.
5. Regression ทุกโมดูลตามตาราง; โดยเฉพาะ usage ที่เขียน/ล้างรอบและ consume expiry, Post-it ที่แก้ local ก่อน response และ import schedule.
6. เมื่อข้อสำคัญ PASS ทั้งหมดจึง Merge candidate ที่ตรวจแล้วเข้า main แล้วตรวจ Pages deploy, service-worker update และ reload ด้วย cache รุ่นเก่าซ้ำบนระบบจริงแบบไม่ใช้ข้อมูลสังเคราะห์เขียน Production.

## หลักฐานและวิธีรันทดสอบ

- `node --test --test-reporter=tap tests/*.test.cjs`
- `node --check store-core.js`, `node --check store-transport.js`, `node --check sw.js` และ syntax check inline script ผ่าน.
- `git diff --check` ผ่าน.
- `evidence/all-tests.tap`: 24 tests PASS. ใช้ข้อมูลสังเคราะห์ทั้งหมด ไม่มีการเรียก production จาก tests.
- `tests/build-browser-fixture.py`: สร้างหน้า fixture แยกสำหรับทดสอบภายหลัง; ยังไม่ผ่าน Browser QA. ไม่มีการส่งต่อ fetch ไป Production.
- ภาพ `evidence/live-update-gate.jpg`, DOM `evidence/live-snapshot.txt` และ console `evidence/live-console.json` เป็นหลักฐาน local ของ main เวอร์ชันเดิม ไม่เผยแพร่ข้อมูลร้านใน repository สาธารณะ.

ข้อจำกัดสำคัญ: multi-location PATCH ให้ atomicity แต่ไม่มี compare-and-swap ข้ามทุก path. ออกแบบตามร้านใช้เครื่องทำ stock เพียงเครื่องเดียว; ยังต้องตรวจว่าโปรแกรมอื่นไม่ได้เขียน stock หรือล็อตชนกัน. ถ้าล็อตเปลี่ยนจาก usage หรือการตรวจอายุ Undo จะถูกปฏิเสธ. Pending ที่ไม่สามารถพิสูจน์ผลได้ต้องตรวจ ID และข้อมูลกลางก่อนปลด ไม่ปลดอัตโนมัติ.
