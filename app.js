// ============================================
// ระบบทะเบียนหนังสืออิเล็กทรอนิกส์ - Frontend V1
// ============================================

const state = {
  session: null,
  user: null,
  dashboard: null,
  documents: []
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  restoreSession();
}

function bindEvents() {
  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.getElementById("refreshBtn").addEventListener("click", loadDashboard);
  document.getElementById("changePasswordBtn").addEventListener("click", showChangePassword);
  document.getElementById("cancelPasswordBtn").addEventListener("click", hideChangePassword);
  document.getElementById("changePasswordForm").addEventListener("submit", changePassword);
  document.getElementById("documentSearch").addEventListener("input", debounce(loadDocuments, 350));
  document.getElementById("statusFilter").addEventListener("change", loadDocuments);
  document.getElementById("typeFilter").addEventListener("change", loadDocuments);
  document.getElementById("closeDocumentBtn").addEventListener("click", closeDocumentModal);
}

function restoreSession() {
  try {
    const raw = localStorage.getItem(APP_CONFIG.SESSION_KEY);
    if (!raw) return showLogin();
    const saved = JSON.parse(raw);
    if (!saved.token) return showLogin();
    state.session = saved;
    state.user = saved.user;
    showApp();
    loadDashboard();
  } catch (_) {
    localStorage.removeItem(APP_CONFIG.SESSION_KEY);
    showLogin();
  }
}

async function api(action, payload = {}, authenticated = true) {
  const body = { action, ...payload };
  if (authenticated && state.session?.token) body.token = state.session.token;

  const response = await fetch(APP_CONFIG.API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error("API ส่งข้อมูลกลับมาไม่ใช่ JSON");
  }

  if (!result.ok) {
    if (result.error === "SESSION_EXPIRED") {
      forceLogout("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
    }
    throw new Error(result.error || "เกิดข้อผิดพลาดจาก API");
  }
  return result;
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  if (!username || !password) return toast("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน", "error");

  setLoginBusy(true);
  try {
    const result = await api("login", { username, password }, false);
    state.session = { token: result.data.token, user: result.data.user };
    state.user = result.data.user;
    localStorage.setItem(APP_CONFIG.SESSION_KEY, JSON.stringify(state.session));

    document.getElementById("loginForm").reset();
    showApp();

    if (state.user.MustChangePassword) {
      toast("เข้าสู่ระบบสำเร็จ กรุณาเปลี่ยนรหัสผ่าน", "info");
      showChangePassword();
    } else {
      toast("เข้าสู่ระบบสำเร็จ", "success");
    }
    await loadDashboard();
  } catch (err) {
    toast(err.message, "error");
  } finally {
    setLoginBusy(false);
  }
}

async function logout() {
  try {
    if (state.session?.token) await api("logout", {}, true);
  } catch (_) {}
  forceLogout("ออกจากระบบแล้ว");
}

function forceLogout(message = "") {
  localStorage.removeItem(APP_CONFIG.SESSION_KEY);
  state.session = null;
  state.user = null;
  state.dashboard = null;
  state.documents = [];
  if (message) toast(message, "info");
  showLogin();
}

function showLogin() {
  document.getElementById("loginView").classList.remove("hidden");
  document.getElementById("appView").classList.add("hidden");
  document.getElementById("username").focus();
}

function showApp() {
  document.getElementById("loginView").classList.add("hidden");
  document.getElementById("appView").classList.remove("hidden");

  document.getElementById("userName").textContent = state.user?.FullName || "-";
  document.getElementById("userPosition").textContent = state.user?.Position || "-";
  document.getElementById("userRoles").textContent = (state.user?.Roles || []).join(" · ");

  renderRoleMenu();
}

function renderRoleMenu() {
  const roles = state.user?.Roles || [];
  const canRegister = roles.includes("ADMIN") || roles.includes("REGISTRAR");
  document.querySelectorAll("[data-role-menu]").forEach(el => {
    el.classList.toggle("hidden", !canRegister);
  });
}

async function loadDashboard() {
  setLoading(true);
  try {
    const result = await api("getDashboard");
    state.dashboard = result.data;
    renderDashboard();
    await loadDocuments();
  } catch (err) {
    toast(err.message, "error");
  } finally {
    setLoading(false);
  }
}

function renderDashboard() {
  const d = state.dashboard || {};
  document.getElementById("totalDocs").textContent = d.total ?? 0;

  const counts = d.counts || {};
  document.getElementById("countAssistant").textContent = counts.WAIT_ASSISTANT_OPINION || 0;
  document.getElementById("countSSO").textContent = counts.WAIT_SSO || 0;
  document.getElementById("countAck").textContent = counts.WAIT_ACKNOWLEDGEMENT || 0;
  document.getElementById("countProgress").textContent = counts.IN_PROGRESS || 0;
  document.getElementById("countCompleted").textContent = counts.COMPLETED || 0;
}

async function loadDocuments() {
  if (!state.session) return;

  const q = document.getElementById("documentSearch").value.trim();
  const status = document.getElementById("statusFilter").value;
  const documentType = document.getElementById("typeFilter").value;

  try {
    const result = await api("getDocuments", { q, status, documentType });
    state.documents = result.data || [];
    renderDocuments();
  } catch (err) {
    toast(err.message, "error");
  }
}

function renderDocuments() {
  const tbody = document.getElementById("documentRows");
  const empty = document.getElementById("emptyDocuments");
  tbody.innerHTML = "";

  if (!state.documents.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  state.documents.forEach(doc => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="px-4 py-3 whitespace-nowrap font-medium">${escapeHtml(doc.RegisterNo || doc.DocumentNo || "-")}</td>
      <td class="px-4 py-3">${escapeHtml(documentTypeLabel(doc.DocumentType))}</td>
      <td class="px-4 py-3 max-w-md">${escapeHtml(doc.Subject || "-")}</td>
      <td class="px-4 py-3">${escapeHtml(doc.ReceiveDate || doc.BookDate || "-")}</td>
      <td class="px-4 py-3">${statusBadge(doc.CurrentStatus)}</td>
      <td class="px-4 py-3 text-right">
        <button class="text-blue-700 hover:underline font-medium" onclick="openDocument('${escapeJs(doc.DocumentID)}')">ดูรายละเอียด</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function openDocument(documentId) {
  try {
    const result = await api("getDocument", { documentId });
    renderDocumentModal(result.data);
    document.getElementById("documentModal").classList.remove("hidden");
  } catch (err) {
    toast(err.message, "error");
  }
}

function renderDocumentModal(data) {
  const doc = data.document || {};
  document.getElementById("modalTitle").textContent = doc.Subject || "รายละเอียดเอกสาร";

  const detail = document.getElementById("documentDetail");
  detail.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${detailItem("ประเภท", documentTypeLabel(doc.DocumentType))}
      ${detailItem("เลขทะเบียน/เลขที่", doc.RegisterNo || doc.DocumentNo || "-")}
      ${detailItem("วันที่รับ", doc.ReceiveDate || "-")}
      ${detailItem("เวลา", doc.ReceiveTime || "-")}
      ${detailItem("จาก", doc.SenderName || "-")}
      ${detailItem("หน่วยงาน", doc.SenderOrganization || "-")}
      ${detailItem("เรื่อง", doc.Subject || "-")}
      ${detailItem("สถานะ", statusLabel(doc.CurrentStatus))}
    </div>
  `;

  const timeline = document.getElementById("workflowTimeline");
  const workflow = data.workflow || [];
  timeline.innerHTML = workflow.length
    ? workflow.map(x => `
      <div class="border-l-2 border-slate-200 pl-4 pb-4">
        <div class="font-semibold">${escapeHtml(actionLabel(x.ActionCode))}</div>
        <div class="text-sm text-slate-500">${escapeHtml(x.ActionDateTime || "")}</div>
        <div class="text-sm mt-1">${escapeHtml(x.Detail || "")}</div>
      </div>
    `).join("")
    : `<div class="text-slate-500">ยังไม่มีประวัติ Workflow</div>`;

  const files = document.getElementById("fileList");
  files.innerHTML = (data.files || []).length
    ? data.files.map(f => `
      <div class="flex items-center justify-between gap-3 border rounded-lg p-3">
        <div>
          <div class="font-medium">${escapeHtml(f.FileName)}</div>
          <div class="text-xs text-slate-500">${formatBytes(Number(f.FileSize || 0))}</div>
        </div>
        <a class="text-blue-700 hover:underline" target="_blank"
           href="https://drive.google.com/file/d/${encodeURIComponent(f.DriveFileID)}/view">เปิดไฟล์</a>
      </div>
    `).join("")
    : `<div class="text-slate-500">ยังไม่มีไฟล์แนบ</div>`;
}

function closeDocumentModal() {
  document.getElementById("documentModal").classList.add("hidden");
}

function showChangePassword() {
  document.getElementById("passwordModal").classList.remove("hidden");
  document.getElementById("oldPassword").focus();
}

function hideChangePassword() {
  document.getElementById("passwordModal").classList.add("hidden");
  document.getElementById("changePasswordForm").reset();
}

async function changePassword(e) {
  e.preventDefault();
  const oldPassword = document.getElementById("oldPassword").value;
  const newPassword = document.getElementById("newPassword").value;
  const confirm = document.getElementById("confirmPassword").value;

  if (newPassword.length < 6) return toast("รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร", "error");
  if (newPassword !== confirm) return toast("ยืนยันรหัสผ่านไม่ตรงกัน", "error");

  try {
    await api("changePassword", { oldPassword, newPassword });
    state.user.MustChangePassword = false;
    state.session.user = state.user;
    localStorage.setItem(APP_CONFIG.SESSION_KEY, JSON.stringify(state.session));
    hideChangePassword();
    toast("เปลี่ยนรหัสผ่านสำเร็จ", "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

function setLoginBusy(busy) {
  const btn = document.getElementById("loginBtn");
  btn.disabled = busy;
  btn.textContent = busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ";
}

function setLoading(busy) {
  document.getElementById("loadingBar").classList.toggle("hidden", !busy);
}

function statusBadge(status) {
  const map = {
    WAIT_ASSISTANT_OPINION: ["รอความเห็น ผช.สสอ.", "bg-amber-100 text-amber-800"],
    WAIT_SSO: ["รอ สสอ. พิจารณา", "bg-orange-100 text-orange-800"],
    WAIT_ACKNOWLEDGEMENT: ["รอรับทราบ", "bg-blue-100 text-blue-800"],
    IN_PROGRESS: ["กำลังดำเนินการ", "bg-violet-100 text-violet-800"],
    COMPLETED: ["เสร็จสิ้น", "bg-emerald-100 text-emerald-800"],
    CANCELLED: ["ยกเลิก", "bg-slate-200 text-slate-700"],
    RECEIVED: ["รับแล้ว", "bg-cyan-100 text-cyan-800"],
    DRAFT: ["ร่าง", "bg-slate-100 text-slate-700"]
  };
  const [label, cls] = map[status] || [status || "-", "bg-slate-100 text-slate-700"];
  return `<span class="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${cls}">${escapeHtml(label)}</span>`;
}

function statusLabel(s) {
  const temp = document.createElement("div");
  temp.innerHTML = statusBadge(s);
  return temp.textContent;
}

function documentTypeLabel(type) {
  return {
    INCOMING: "หนังสือรับ",
    OUTGOING: "หนังสือส่งออก",
    CIRCULAR: "หนังสือเวียน",
    ORDER: "คำสั่ง"
  }[type] || type || "-";
}

function actionLabel(code) {
  return {
    CREATE_DOCUMENT: "สร้างทะเบียนเอกสาร",
    UPDATE_DOCUMENT: "แก้ไขข้อมูลทะเบียน",
    UPLOAD_FILE: "แนบไฟล์",
    SUBMIT_OPINION: "ให้ความเห็น",
    ASSIGN_DOCUMENT: "มอบหมายงาน",
    ACKNOWLEDGE: "รับทราบ/ปฏิบัติ",
    UPDATE_TASK: "อัปเดตงาน",
    COMPLETE_TASK: "ปิดงาน",
    CANCEL_DOCUMENT: "ยกเลิกเอกสาร"
  }[code] || code || "-";
}

function detailItem(label, value) {
  return `<div><div class="text-xs text-slate-500">${escapeHtml(label)}</div><div class="mt-1 font-medium">${escapeHtml(String(value))}</div></div>`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function toast(message, type = "info") {
  const el = document.getElementById("toast");
  const colors = {
    success: "bg-emerald-600",
    error: "bg-red-600",
    info: "bg-slate-800"
  };
  el.className = `fixed bottom-5 right-5 z-[100] max-w-sm px-4 py-3 rounded-xl text-white shadow-lg ${colors[type] || colors.info}`;
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

function escapeJs(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

window.openDocument = openDocument;
