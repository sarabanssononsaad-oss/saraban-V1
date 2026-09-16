ระบบทะเบียนหนังสืออิเล็กทรอนิกส์ V5.5.0 — CONSOLIDATED PERFORMANCE SAFE FINAL

ฐาน: V5.4.5

การปรับหลัก:
- Search: ใช้ TextFinder หา candidate rows เมื่อมีคำค้น ก่อน materialize เอกสารเต็ม
- Outgoing register: ใช้ candidate rows จากคำค้น/ปี ก่อนกรองและ sort
- Report: อ่านเฉพาะคอลัมน์ที่จำเป็น และสร้างชุดข้อมูลตามสิทธิ์สำหรับรายงาน
- Document Detail: หาแถวที่มี DocumentID ก่อนอ่านรายละเอียดเต็ม ลด over-fetch
- คง Request Context, Stable Cache, Fresh Data Sync และ Authorization

ความปลอดภัย:
- ไม่เปลี่ยน Spreadsheet ID / Drive Root ID
- ไม่เปลี่ยน Schema 12 Sheets
- ไม่ Reset / Seed / Migration / Delete ข้อมูล
- คง LockService และ Numbering safety
- Live data เช่น Documents/Assignments/Workflow/Counters ไม่ถูก stable-cache

หมายเหตุ: ผ่าน static checks ในสภาพแวดล้อมพัฒนา ยังไม่ได้ deploy/test กับ Production จริง
