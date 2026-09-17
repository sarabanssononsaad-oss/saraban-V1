ระบบทะเบียนหนังสืออิเล็กทรอนิกส์ V5.5.2

รายการแก้ไข:
- เปลี่ยน Global API loading จาก SweetAlert กลางจอเป็นตัวแสดงสถานะเล็กแบบ non-blocking มุมล่างขวา
- เพิ่ม API timeout 20 วินาทีด้วย AbortController เพื่อป้องกันหน้าจอค้าง
- คง Silent Auto Refresh และไม่แสดง loading สำหรับ background sync
- ปรับการปิดงานให้ปิด modal เดิมก่อน refresh และเปิดงานถัดไปอัตโนมัติเมื่อมีงานค้าง
- แก้ logic การสร้าง acknowledgement สำหรับ ASSIGNED_ACK / ASSIGNED_BOTH / IN_PROGRESS_BOTH ตอนปิดงาน
- ไม่เปลี่ยน schema, ไม่ migration, ไม่ reset counter, ไม่ลบข้อมูลหรือไฟล์เดิม
- ใช้ Spreadsheet/Drive เดิมตาม config

สถานะ: Static-checked; ยังไม่ได้ deploy production
