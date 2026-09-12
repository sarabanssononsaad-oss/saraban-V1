ระบบทะเบียนหนังสืออิเล็กทรอนิกส์ สสอ.โนนสะอาด — V5

ไฟล์:
1. code.gs       Backend Apps Script
2. index.html    Frontend
3. app.js        Frontend logic
4. config.js     API URL / application config

V5 เพิ่ม:
- ระบบออกหนังสือราชการ: หนังสือออก / หนังสือเวียน / คำสั่ง
- Counter แยกประเภทและปี
- ออกเลขด้วย LockService ป้องกันเลขซ้ำ
- getNumberStatus / getOutgoingDocuments / getReportSummary
- สถานะเอกสารออกเลขเป็น ISSUED
- รองรับการยกเลิกเลขโดยไม่ย้อนเลข
- โฟลเดอร์ Drive แยกตามประเภท
- คง Workflow หนังสือรับเดิม

สำคัญ:
- ใช้ Spreadsheet เดิม ไม่สร้างฐานข้อมูลใหม่
- NUMBER_COUNTERS เดิมต้องมีปีที่ต้องการใช้งาน
- Prefix สำหรับตัวอย่างของสำนักงาน: OUTGOING='อด 1132/', CIRCULAR='อด 1132/', ORDER='คำสั่งที่ '
- มีฟังก์ชัน configureV5NumberCounters() สำหรับเติม Counter/Prefix ที่ขาด โดยไม่เปลี่ยน LastNumber เดิม
- หนังสืออนุมัติเบิกจ่ายยังไม่เปิดออกเลขจนกว่าจะยืนยันรูปแบบเลขจริง
- หลังอัปโหลด code.gs ให้ Deploy เป็น New version ของ Web App เดิม
