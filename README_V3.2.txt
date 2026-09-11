FRONTEND/API V3.2 — แก้ Login + SweetAlert + ผช.สสอ.

สาเหตุหลักที่ Login หน้าเว็บใช้งานไม่ได้ใน V3.1:
1) app.js มี syntax error ในฟังก์ชัน toast ทำให้ JavaScript ทั้งไฟล์หยุดทำงาน
2) index.html โหลด SweetAlert2 ซ้ำ 2 ครั้ง
3) api_v3_assistant.gs มีการประกาศ const token ซ้ำใน requireSession_ ซึ่งต้องแก้ก่อน Deploy

สิ่งที่แก้ใน V3.2:
- แก้ syntax error ของ toast
- โหลด SweetAlert2 เพียงครั้งเดียว
- เพิ่ม Loading แบบ SweetAlert2 ระหว่างเรียก API
- ป้องกัน Loading ซ้อนด้วยตัวนับ
- Session หมดอายุ -> ออกจากระบบและแจ้งเตือน
- คง API URL เดิมและ SESSION_KEY เดิม
- คง Workflow ผช.สสอ. และ getAssignableUsers
- ไม่แตะข้อมูล USERS หรือเอกสารเดิม

ติดตั้ง:
1) GitHub Pages: แทน index.html, config.js, app.js
2) Apps Script: แทน api_v3_assistant.gs ด้วยไฟล์ในชุดนี้
3) Save
4) Deploy > Manage deployments > Edit > New version > Deploy
5) ทดสอบ Web App /exec?action=health ให้แน่ใจว่า Deployment เป็นโค้ดล่าสุด
6) GitHub Pages กด Ctrl+F5

หมายเหตุ: API ของ Apps Script ต้องอัปเดต Deployment จริง มิฉะนั้น action getAssignableUsers จะยังไม่รู้จัก
