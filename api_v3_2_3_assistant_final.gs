/*******************************************************
 * ระบบทะเบียนหนังสืออิเล็กทรอนิกส์
 * API V5.0 - Apps Script
 * ใช้ร่วมกับ setup_database_v1.gs
 *******************************************************/

const API_CFG = {
  SPREADSHEET_ID: '1ogp1rJUQWW-5PetCvyDkWk_23FbttSSjKZhNiFSdiL8',
  DRIVE_ROOT_FOLDER_ID: '1XrzK0GIRCi4-RUnXE6B4-GOmicusd-O6',
  TIMEZONE: 'Asia/Bangkok',
  SESSION_TTL: 21600, // 6 ชั่วโมง
  MAX_FILE_BYTES: 10 * 1024 * 1024
};

const API_HEADERS = {
  USERS: ['UserID','Username','FullName','Position','PrimaryOrgUnitID','PrimaryJobID','Status','MustChangePassword','PasswordHash','PasswordSalt','CreatedAt','UpdatedAt'],
  USER_ROLES: ['UserRoleID','UserID','RoleCode','Active','CreatedAt'],
  DOCUMENTS: ['DocumentID','DocumentType','RegisterNo','RegisterYear','DocumentNo','BookNo','BookDate','ReceiveDate','ReceiveTime','SenderName','SenderOrganization','Subject','RelatedOrgUnitID','RelatedJobID','UrgencyLevel','DueDate','CurrentStatus','CurrentQueue','CurrentUserID','QRToken','FileSHA256','CreatedBy','CreatedAt','UpdatedBy','UpdatedAt','IsDeleted','DeleteReason','DeletedBy','DeletedAt'],
  DOCUMENT_FILES: ['FileID','DocumentID','FileName','DriveFileID','FileType','FileSize','FileRole','UploadedBy','UploadedAt','IsDeleted'],
  OPINIONS: ['OpinionID','DocumentID','UserID','OpinionType','SuggestedUserID','OpinionText','ActionDate','ActionTime','CreatedAt'],
  ASSIGNMENTS: ['AssignmentID','DocumentID','AssignedBy','AssignedTo','CommandText','AdditionalText','AssignedDate','AssignedTime','Status','CreatedAt'],
  ACKNOWLEDGEMENTS: ['AckID','DocumentID','AssignmentID','UserID','AckStatus','AckText','AckDate','AckTime','CreatedAt'],
  WORKFLOW_LOG: ['LogID','DocumentID','ActionCode','FromUserID','ToUserID','ActionBy','ActionDateTime','Detail','CreatedAt'],
  NUMBER_COUNTERS: ['CounterID','DocumentType','Year','Prefix','LastNumber','UpdatedAt'],
  MASTER_DATA: ['MasterID','Category','Code','Name','SortOrder','Active'],
  SETTINGS: ['Key','Value']
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ระบบทะเบียนฯ')
    .addItem('ตั้งรหัสผ่าน ADMIN ครั้งแรก', 'bootstrapAdminPassword')
    .addItem('ทดสอบ Login', 'testLoginFromSheet')
    .addSeparator()
    .addItem('ตรวจสอบฐานข้อมูล V1', 'verifyDatabaseV1')
    .addItem('ทดสอบ API Health', 'testApiHealth')
    .addToUi();
}

function onInstall(e) {
  onOpen(e);
}

/** ตั้งรหัสผ่าน U004 แบบครั้งแรก โดยไม่เก็บรหัสผ่านไว้ใน source code */
function bootstrapAdminPassword() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt(
    'ตั้งรหัสผ่าน ADMIN ครั้งแรก',
    'กรอกรหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร สำหรับ U004 (นายจักรี ศรีแสง)',
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() !== ui.Button.OK) return;
  const password = String(result.getResponseText() || '');
  if (password.length < 6) throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
  setPasswordInternal_('U004', password, true);
  ui.alert('สำเร็จ', 'ตั้งรหัสผ่าน ADMIN ให้ U004 แล้ว', ui.ButtonSet.OK);
}

function testApiHealth() {
  const out = apiResponse_({ok:true, action:'health', version:'V3.2.2', time:now_()});
  Logger.log(out.getContent());
}

/** ทดสอบ Login จาก Google Sheet โดยไม่แสดงรหัสผ่านใน Logger */
function testLoginFromSheet() {
  const ui = SpreadsheetApp.getUi();
  const u = ui.prompt('ทดสอบ Login', 'กรอก Username เช่น user004', ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK) return;
  const username = String(u.getResponseText() || '').trim();
  if (!username) return ui.alert('กรุณาระบุ Username');

  const p = ui.prompt('ทดสอบ Login', 'กรอกรหัสผ่าน (ระบบจะไม่บันทึกลง Logger)', ui.ButtonSet.OK_CANCEL);
  if (p.getSelectedButton() !== ui.Button.OK) return;
  const password = String(p.getResponseText() || '');
  if (!password) return ui.alert('กรุณาระบุรหัสผ่าน');

  try {
    const result = login_({username: username, password: password});
    const user = result.data.user;
    ui.alert(
      'Login สำเร็จ',
      'ผู้ใช้: ' + user.FullName +
      '\nUsername: ' + user.Username +
      '\nRole: ' + user.Roles.join(', ') +
      '\nMustChangePassword: ' + user.MustChangePassword,
      ui.ButtonSet.OK
    );
  } catch (err) {
    ui.alert('Login ไม่สำเร็จ', err && err.message ? err.message : String(err), ui.ButtonSet.OK);
  }
}

/* =========================
   WEB APP ENTRY POINTS
   ========================= */

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    // รองรับทั้ง parameter ปกติ และ query string โดยตรง เพื่อป้องกันปัญหา
    // บาง deployment/runtime ที่ไม่ populate e.parameter ตามที่คาด
    let action = String(p.action || '').trim();
    let token = String(p.token || '');
    if ((!action || !token) && e && e.queryString) {
      String(e.queryString).split('&').forEach(function(pair){
        const parts = pair.split('=');
        const k = decodeURIComponent(parts.shift() || '').trim();
        const v = decodeURIComponent(parts.join('=') || '').trim();
        if (k === 'action' && !action) action = v;
        if (k === 'token' && !token) token = v;
      });
    }
    const normalized = action.replace(/\s+/g,'').toLowerCase();
    if (!normalized || normalized === 'health') {
      return apiResponse_({ok:true, action:'health', version:'V3.2.3', time:now_()});
    }
    if (normalized === 'getassignableusers') {
      return apiResponse_(getAssignableUsers_(requireSession_({token:token})));
    }
    if (normalized === 'verifyqr') {
      return apiResponse_({ok:true, action:'verifyQR', data:verifyQR_(token)});
    }
    return apiResponse_({ok:false, error:'GET action ไม่รองรับ: ' + action});
  } catch (err) {
    return apiError_(err);
  }
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const req = JSON.parse(raw);
    return apiResponse_(routePost_(req));
  } catch (err) {
    return apiError_(err);
  }
}

function routePost_(req) {
  const action = String(req.action || '').trim();
  const normalized = action.replace(/\s+/g, '');
  switch (normalized) {
    case 'login': return login_(req);
    case 'logout': return logout_(req);
    case 'getCurrentUser': return {ok:true, data:getCurrentUser_(requireSession_(req))};
    case 'getDashboard': return getDashboard_(requireSession_(req));
    case 'getDocuments': return getDocuments_(requireSession_(req), req);
    case 'getDocument': return getDocument_(requireSession_(req), req);
    case 'getAssignableUsers':
    case 'getassignableusers': return getAssignableUsers_(requireSession_(req));
    case 'getNumberStatus': return getNumberStatus_(requireSession_(req), req);
    case 'getOutgoingDocuments': return getOutgoingDocuments_(requireSession_(req), req);
    case 'getReportSummary': return getReportSummary_(requireSession_(req), req);
    case 'getWorkflow': return getWorkflow_(requireSession_(req), req);
    case 'createDocument': return createDocument_(requireSession_(req), req);
    case 'updateDocument': return updateDocument_(requireSession_(req), req);
    case 'uploadFile': return uploadFile_(requireSession_(req), req);
    case 'submitOpinion': return submitOpinion_(requireSession_(req), req);
    case 'assignDocument': return assignDocument_(requireSession_(req), req);
    case 'acknowledgeDocument': return acknowledgeDocument_(requireSession_(req), req);
    case 'updateTask': return updateTask_(requireSession_(req), req);
    case 'cancelDocument': return cancelDocument_(requireSession_(req), req);
    case 'changePassword': return changePassword_(requireSession_(req), req);
    case 'adminResetPassword': return adminResetPassword_(requireSession_(req), req);
    default: throw new Error('ไม่รู้จัก action: ' + action);
  }
}

/* =========================
   AUTHENTICATION
   ========================= */

function login_(req) {
  const username = String(req.username || '').trim();
  const password = String(req.password || '');
  if (!username || !password) throw new Error('กรุณาระบุ username และ password');

  const user = findRowObject_('USERS', 'Username', username);
  if (!user || String(user.Status) !== 'ACTIVE') throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  if (!user.PasswordHash || !user.PasswordSalt) throw new Error('บัญชีนี้ยังไม่ได้ตั้งรหัสผ่าน');

  const hash = hashPassword_(password, String(user.PasswordSalt));
  if (hash !== String(user.PasswordHash)) throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');

  const roles = getUserRoles_(String(user.UserID));
  const token = Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,'');
  const cacheKey = sessionKey_(token);
  CacheService.getScriptCache().put(cacheKey, JSON.stringify({
    userId:String(user.UserID),
    username:String(user.Username),
    roles:roles,
    issuedAt:Date.now()
  }), API_CFG.SESSION_TTL);

  return {
    ok:true,
    data:{
      token:token,
      user:getPublicUser_(user, roles),
      expiresIn:API_CFG.SESSION_TTL
    }
  };
}

function logout_(req) {
  if (req.token) CacheService.getScriptCache().remove(sessionKey_(String(req.token)));
  return {ok:true};
}

function requireSession_(req) {
  const token = String(req.token || '');
  if (!token) throw new Error('ไม่พบ session token');
  const raw = CacheService.getScriptCache().get(sessionKey_(token));
  if (!raw) throw new Error('SESSION_EXPIRED');
  const session = JSON.parse(raw);
  CacheService.getScriptCache().put(sessionKey_(token), raw, API_CFG.SESSION_TTL);
  return session;
}

function getCurrentUser_(session) {
  const user = findRowObject_('USERS', 'UserID', session.userId);
  if (!user) throw new Error('ไม่พบบัญชีผู้ใช้');
  return getPublicUser_(user, getUserRoles_(session.userId));
}

function changePassword_(session, req) {
  const oldPassword = String(req.oldPassword || '');
  const newPassword = String(req.newPassword || '');
  if (newPassword.length < 6) throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');

  const user = findRowObject_('USERS','UserID',session.userId);
  if (!user) throw new Error('ไม่พบบัญชี');
  if (!user.PasswordHash || hashPassword_(oldPassword, String(user.PasswordSalt)) !== String(user.PasswordHash)) {
    throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
  }
  setPasswordInternal_(session.userId, newPassword, false);
  return {ok:true, message:'เปลี่ยนรหัสผ่านสำเร็จ'};
}

function adminResetPassword_(session, req) {
  requireRole_(session, ['ADMIN']);
  const userId = String(req.userId || '');
  const newPassword = String(req.newPassword || '');
  if (newPassword.length < 6) throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
  setPasswordInternal_(userId, newPassword, true);
  return {ok:true, message:'ตั้งรหัสผ่านใหม่สำเร็จ'};
}

function setPasswordInternal_(userId, password, mustChange) {
  const sh = sheet_('USERS');
  const idx = headerMap_(sh);
  const row = findRowNumber_(sh, 'UserID', userId);
  if (!row) throw new Error('ไม่พบ UserID: ' + userId);

  const salt = Utilities.getUuid() + Utilities.getUuid();
  const hash = hashPassword_(password, salt);
  sh.getRange(row, idx.PasswordSalt + 1).setValue(salt);
  sh.getRange(row, idx.PasswordHash + 1).setValue(hash);
  sh.getRange(row, idx.MustChangePassword + 1).setValue(!!mustChange);
  sh.getRange(row, idx.UpdatedAt + 1).setValue(now_());
}

function hashPassword_(password, salt) {
  const input = salt + '|' + password;
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    input,
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b){
    const n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}

function sessionKey_(token) {
  return 'SESSION_' + hashPassword_(token, 'SESSION');
}

/* =========================
   DASHBOARD / DOCUMENTS
   ========================= */

function getDashboard_(session) {
  const docs = getAccessibleDocuments_(session);
  const counts = {};
  docs.forEach(function(d){
    const s = String(d.CurrentStatus || '');
    counts[s] = (counts[s] || 0) + 1;
  });
  return {ok:true, data:{
    total:docs.length,
    counts:counts,
    user:getCurrentUser_(session)
  }};
}

function getDocuments_(session, req) {
  const docs = getAccessibleDocuments_(session);
  const status = String(req.status || '');
  const type = String(req.documentType || '');
  const q = String(req.q || '').trim().toLowerCase();

  const filtered = docs.filter(function(d){
    if (status && String(d.CurrentStatus) !== status) return false;
    if (type && String(d.DocumentType) !== type) return false;
    if (q) {
      const hay = [
        d.RegisterNo,d.DocumentNo,d.Subject,d.SenderName,d.SenderOrganization
      ].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });

  filtered.sort(function(a,b){
    return String(b.UpdatedAt || '').localeCompare(String(a.UpdatedAt || ''));
  });

  return {ok:true, data:filtered};
}

function getDocument_(session, req) {
  const docId = String(req.documentId || '');
  const doc = findRowObject_('DOCUMENTS','DocumentID',docId);
  if (!doc) throw new Error('ไม่พบเอกสาร');
  assertDocumentAccess_(session, doc);

  return {ok:true, data:{
    document:safeDocument_(doc),
    files:findAllRows_('DOCUMENT_FILES','DocumentID',docId).filter(function(x){return !x.IsDeleted;}),
    opinions:findAllRows_('OPINIONS','DocumentID',docId),
    assignments:findAllRows_('ASSIGNMENTS','DocumentID',docId),
    acknowledgements:findAllRows_('ACKNOWLEDGEMENTS','DocumentID',docId),
    workflow:findAllRows_('WORKFLOW_LOG','DocumentID',docId)
  }};
}

function getAssignableUsers_(session) {
  requireRole_(session, ['ADMIN','ASSISTANT_SSO','SSO']);
  const users = findAllRows_('USERS').filter(function(u){ return String(u.Status) === 'ACTIVE'; });
  return {ok:true, data:users.filter(function(u){ return getUserRoles_(String(u.UserID)).indexOf('STAFF') >= 0; }).map(function(u){ return {UserID:u.UserID, FullName:u.FullName, Position:u.Position, PrimaryOrgUnitID:u.PrimaryOrgUnitID, PrimaryJobID:u.PrimaryJobID}; })};
}

function getWorkflow_(session, req) {
  const doc = findRowObject_('DOCUMENTS','DocumentID',String(req.documentId || ''));
  if (!doc) throw new Error('ไม่พบเอกสาร');
  assertDocumentAccess_(session, doc);
  return {ok:true, data:findAllRows_('WORKFLOW_LOG','DocumentID',doc.DocumentID)};
}

function getAccessibleDocuments_(session) {
  const docs = findAllRows_('DOCUMENTS').filter(function(d){ return !truthy_(d.IsDeleted); });
  const roles = session.roles || [];

  if (roles.indexOf('ADMIN') >= 0 || roles.indexOf('REGISTRAR') >= 0) return docs;

  if (roles.indexOf('SSO') >= 0) {
    return docs.filter(function(d){
      return String(d.CurrentQueue) === 'SSO' || String(d.CurrentUserID) === session.userId;
    });
  }

  if (roles.indexOf('ASSISTANT_SSO') >= 0) {
    const assigned = assignedDocumentIds_(session.userId);
    return docs.filter(function(d){
      return String(d.CurrentQueue) === 'ASSISTANT_SSO' ||
             String(d.CurrentUserID) === session.userId ||
             assigned[String(d.DocumentID)];
    });
  }

  if (roles.indexOf('STAFF') >= 0) {
    const assigned = assignedDocumentIds_(session.userId);
    return docs.filter(function(d){
      return String(d.CurrentUserID) === session.userId || assigned[String(d.DocumentID)];
    });
  }

  return [];
}

function assertDocumentAccess_(session, doc) {
  const roles = session.roles || [];
  if (roles.indexOf('ADMIN') >= 0 || roles.indexOf('REGISTRAR') >= 0) return;

  if (roles.indexOf('SSO') >= 0 &&
      (String(doc.CurrentQueue) === 'SSO' || String(doc.CurrentUserID) === session.userId)) return;

  if (roles.indexOf('ASSISTANT_SSO') >= 0 &&
      (String(doc.CurrentQueue) === 'ASSISTANT_SSO' ||
       String(doc.CurrentUserID) === session.userId ||
       isAssignedTo_(doc.DocumentID, session.userId))) return;

  if (roles.indexOf('STAFF') >= 0 &&
      (String(doc.CurrentUserID) === session.userId || isAssignedTo_(doc.DocumentID, session.userId))) return;

  throw new Error('ไม่มีสิทธิ์เข้าถึงเอกสารนี้');
}

/* =========================
   CREATE / UPDATE
   ========================= */

function createDocument_(session, req) {
  const data = req.data || {};
  const type = String(data.DocumentType || 'INCOMING');
  if (['INCOMING','OUTGOING','CIRCULAR','ORDER'].indexOf(type) < 0) throw new Error('DocumentType ไม่ถูกต้อง');
  if (type === 'INCOMING') requireRole_(session, ['ADMIN','REGISTRAR']);
  else requireRole_(session, ['ADMIN','REGISTRAR','STAFF']);

  const now = new Date();
  const year = Number(data.RegisterYear || buddhistYear_(now));
  if (!year || year < 2500 || year > 2700) throw new Error('ปี พ.ศ. ไม่ถูกต้อง');
  if (type !== 'INCOMING') {
    if (!String(data.Subject || '').trim()) throw new Error('กรุณาระบุเรื่อง');
    if (!String(data.BookDate || '').trim()) throw new Error('กรุณาระบุวันที่หนังสือ');
    if (!String(data.SenderName || data.FromOrganization || '').trim()) throw new Error('กรุณาระบุจากหน่วยงาน');
    if (!String(data.SenderOrganization || data.ToOrganization || '').trim()) throw new Error('กรุณาระบุถึงหน่วยงาน');
  }
  const docId = id_('DOC');
  const qrToken = token_();

  let registerNo = String(data.RegisterNo || '');
  let documentNo = String(data.DocumentNo || '');

  if (!registerNo && type === 'INCOMING') registerNo = nextNumber_(type, year);
  if (!documentNo && type !== 'INCOMING') documentNo = nextNumber_(type, year);

  const status = type === 'INCOMING' ? 'WAIT_ASSISTANT_OPINION' : 'ISSUED';
  const queue = type === 'INCOMING' ? 'ASSISTANT_SSO' : 'OUTGOING';

  const row = {
    DocumentID:docId, DocumentType:type, RegisterNo:registerNo, RegisterYear:year,
    DocumentNo:documentNo, BookNo:String(data.BookNo || ''), BookDate:String(data.BookDate || ''),
    ReceiveDate:String(data.ReceiveDate || (type === 'INCOMING' ? formatDate_(now) : '')), ReceiveTime:String(data.ReceiveTime || (type === 'INCOMING' ? formatTime_(now) : '')),
    SenderName:String(data.SenderName || data.FromOrganization || ''), SenderOrganization:String(data.SenderOrganization || data.ToOrganization || ''),
    Subject:String(data.Subject || ''), RelatedOrgUnitID:String(data.RelatedOrgUnitID || data.GroupID || ''),
    RelatedJobID:String(data.RelatedJobID || ''), UrgencyLevel:String(data.UrgencyLevel || ''),
    DueDate:String(data.DueDate || ''), CurrentStatus:status, CurrentQueue:queue,
    CurrentUserID:'', QRToken:qrToken, FileSHA256:'',
    CreatedBy:session.userId, CreatedAt:now_(), UpdatedBy:session.userId, UpdatedAt:now_(),
    IsDeleted:false, DeleteReason:'', DeletedBy:'', DeletedAt:''
  };

  appendObject_('DOCUMENTS', row);
  logWorkflow_(docId, 'CREATE_DOCUMENT', '', queue, session.userId, 'สร้างทะเบียนเอกสาร');

  return {ok:true, data:safeDocument_(row)};
}

function updateDocument_(session, req) {
  requireRole_(session, ['ADMIN','REGISTRAR']);
  const docId = String(req.documentId || '');
  const doc = findRowObject_('DOCUMENTS','DocumentID',docId);
  if (!doc) throw new Error('ไม่พบเอกสาร');

  const data = req.data || {};
  const allowed = [
    'BookNo','BookDate','SenderName','SenderOrganization','Subject',
    'RelatedOrgUnitID','RelatedJobID','UrgencyLevel','DueDate','ReceiveDate','ReceiveTime'
  ];
  const patch = {};
  allowed.forEach(function(k){
    if (Object.prototype.hasOwnProperty.call(data,k)) patch[k] = String(data[k] == null ? '' : data[k]);
  });
  patch.UpdatedBy = session.userId;
  patch.UpdatedAt = now_();

  updateObject_('DOCUMENTS','DocumentID',docId,patch);
  logWorkflow_(docId, 'UPDATE_DOCUMENT', '', '', session.userId, 'แก้ไขข้อมูลทะเบียน');
  return {ok:true, data:findRowObject_('DOCUMENTS','DocumentID',docId)};
}

function cancelDocument_(session, req) {
  requireRole_(session, ['ADMIN','REGISTRAR']);
  const docId = String(req.documentId || '');
  const doc = findRowObject_('DOCUMENTS','DocumentID',docId);
  if (!doc) throw new Error('ไม่พบเอกสาร');

  updateObject_('DOCUMENTS','DocumentID',docId,{
    CurrentStatus:'CANCELLED',
    CurrentQueue:'',
    CurrentUserID:'',
    UpdatedBy:session.userId,
    UpdatedAt:now_()
  });
  logWorkflow_(docId, 'CANCEL_DOCUMENT', doc.CurrentQueue, '', session.userId, String(req.reason || 'ยกเลิกเอกสาร'));
  return {ok:true};
}

/* =========================
   FILE UPLOAD
   ========================= */

function uploadFile_(session, req) {
  requireRole_(session, ['ADMIN','REGISTRAR']);
  const docId = String(req.documentId || '');
  const fileName = String(req.fileName || 'document.pdf');
  const mimeType = String(req.mimeType || 'application/pdf');
  const base64 = String(req.base64 || '');
  if (!docId || !base64) throw new Error('ข้อมูลไฟล์ไม่ครบ');

  const doc = findRowObject_('DOCUMENTS','DocumentID',docId);
  if (!doc) throw new Error('ไม่พบเอกสาร');

  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > API_CFG.MAX_FILE_BYTES) throw new Error('ไฟล์ใหญ่เกิน 10 MB');

  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const root = DriveApp.getFolderById(API_CFG.DRIVE_ROOT_FOLDER_ID);
  const folder = getDriveFolderForType_(root, String(doc.DocumentType));
  const file = folder.createFile(blob);

  const fileId = id_('FILE');
  const fileObj = {
    FileID:fileId, DocumentID:docId, FileName:fileName, DriveFileID:file.getId(),
    FileType:mimeType, FileSize:bytes.length, FileRole:String(req.fileRole || 'MAIN_DOCUMENT'),
    UploadedBy:session.userId, UploadedAt:now_(), IsDeleted:false
  };
  appendObject_('DOCUMENT_FILES', fileObj);

  if (String(req.fileRole || 'MAIN_DOCUMENT') === 'MAIN_DOCUMENT') {
    const sha = sha256Bytes_(bytes);
    updateObject_('DOCUMENTS','DocumentID',docId,{
      FileSHA256:sha, UpdatedBy:session.userId, UpdatedAt:now_()
    });
  }

  logWorkflow_(docId, 'UPLOAD_FILE', '', '', session.userId, fileName);
  return {ok:true, data:fileObj};
}

function sha256Bytes_(bytes) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return digest.map(function(b){
    const n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}

function getDriveFolderForType_(root, type) {
  const names = {
    INCOMING:'01_หนังสือรับ',
    OUTGOING:'02_หนังสือส่งออก',
    CIRCULAR:'03_หนังสือเวียน',
    ORDER:'04_คำสั่ง',
    APPROVAL:'05_หนังสืออนุมัติเบิกจ่าย'
  };
  const name = names[type] || '05_เอกสารแนบ';
  const it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

/* =========================
   WORKFLOW
   ========================= */

function submitOpinion_(session, req) {
  requireRole_(session, ['ADMIN','ASSISTANT_SSO']);
  const docId = String(req.documentId || '');
  const doc = findRowObject_('DOCUMENTS','DocumentID',docId);
  if (!doc) throw new Error('ไม่พบเอกสาร');
  if (String(doc.CurrentStatus) !== 'WAIT_ASSISTANT_OPINION') throw new Error('เอกสารไม่อยู่ในคิวให้ความเห็น');

  const data = req.data || {};
  const opinion = {
    OpinionID:id_('OPN'), DocumentID:docId, UserID:session.userId,
    OpinionType:String(data.OpinionType || 'RECOMMEND_ASSIGN'),
    SuggestedUserID:String(data.SuggestedUserID || ''),
    OpinionText:String(data.OpinionText || ''),
    ActionDate:formatDate_(new Date()), ActionTime:formatTime_(new Date()), CreatedAt:now_()
  };
  appendObject_('OPINIONS', opinion);

  updateObject_('DOCUMENTS','DocumentID',docId,{
    CurrentStatus:'WAIT_SSO', CurrentQueue:'SSO', CurrentUserID:'',
    UpdatedBy:session.userId, UpdatedAt:now_()
  });
  logWorkflow_(docId,'SUBMIT_OPINION','ASSISTANT_SSO','SSO',session.userId,opinion.OpinionText);

  return {ok:true, data:opinion};
}

function assignDocument_(session, req) {
  requireRole_(session, ['ADMIN','SSO']);
  const docId = String(req.documentId || '');
  const assignedTo = String(req.assignedTo || '');
  if (!assignedTo) throw new Error('ต้องระบุผู้รับมอบหมาย');

  const doc = findRowObject_('DOCUMENTS','DocumentID',docId);
  if (!doc) throw new Error('ไม่พบเอกสาร');
  if (String(doc.CurrentStatus) !== 'WAIT_SSO') throw new Error('เอกสารไม่อยู่ในคิว สสอ.');

  const target = findRowObject_('USERS','UserID',assignedTo);
  if (!target || String(target.Status) !== 'ACTIVE') throw new Error('ผู้รับมอบหมายไม่ถูกต้อง');

  const data = req.data || {};
  const now = new Date();
  const assignment = {
    AssignmentID:id_('ASN'), DocumentID:docId, AssignedBy:session.userId, AssignedTo:assignedTo,
    CommandText:String(data.CommandText || ''), AdditionalText:String(data.AdditionalText || ''),
    AssignedDate:formatDate_(now), AssignedTime:formatTime_(now), Status:'ASSIGNED', CreatedAt:now_()
  };
  appendObject_('ASSIGNMENTS', assignment);

  updateObject_('DOCUMENTS','DocumentID',docId,{
    CurrentStatus:'WAIT_ACKNOWLEDGEMENT', CurrentQueue:'STAFF', CurrentUserID:assignedTo,
    UpdatedBy:session.userId, UpdatedAt:now_()
  });
  logWorkflow_(docId,'ASSIGN_DOCUMENT','SSO',assignedTo,session.userId,assignment.CommandText);

  return {ok:true, data:assignment};
}

function acknowledgeDocument_(session, req) {
  requireRole_(session, ['ADMIN','STAFF']);
  const docId = String(req.documentId || '');
  const doc = findRowObject_('DOCUMENTS','DocumentID',docId);
  if (!doc) throw new Error('ไม่พบเอกสาร');

  if (session.roles.indexOf('STAFF') >= 0 && String(doc.CurrentUserID) !== session.userId) {
    throw new Error('เอกสารนี้ไม่ได้มอบหมายให้คุณ');
  }

  const assignments = findAllRows_('ASSIGNMENTS','DocumentID',docId);
  const active = assignments.filter(function(a){return String(a.AssignedTo) === session.userId && String(a.Status) === 'ASSIGNED';});
  if (session.roles.indexOf('ADMIN') < 0 && !active.length) throw new Error('ไม่พบงานที่มอบหมายให้ผู้ใช้นี้');

  const assignment = active.length ? active[active.length-1] : (assignments.length ? assignments[assignments.length-1] : null);
  const data = req.data || {};
  const now = new Date();
  const ack = {
    AckID:id_('ACK'), DocumentID:docId, AssignmentID:assignment ? assignment.AssignmentID : '',
    UserID:session.userId, AckStatus:String(data.AckStatus || 'ACKNOWLEDGED'),
    AckText:String(data.AckText || ''), AckDate:formatDate_(now), AckTime:formatTime_(now), CreatedAt:now_()
  };
  appendObject_('ACKNOWLEDGEMENTS', ack);

  if (assignment) updateObject_('ASSIGNMENTS','AssignmentID',assignment.AssignmentID,{Status:'ACKNOWLEDGED'});

  updateObject_('DOCUMENTS','DocumentID',docId,{
    CurrentStatus:'IN_PROGRESS', CurrentQueue:'STAFF', CurrentUserID:session.userId,
    UpdatedBy:session.userId, UpdatedAt:now_()
  });
  logWorkflow_(docId,'ACKNOWLEDGE','STAFF',session.userId,session.userId,ack.AckText);

  return {ok:true, data:ack};
}

function updateTask_(session, req) {
  requireRole_(session, ['ADMIN','STAFF']);
  const docId = String(req.documentId || '');
  const doc = findRowObject_('DOCUMENTS','DocumentID',docId);
  if (!doc) throw new Error('ไม่พบเอกสาร');

  if (session.roles.indexOf('STAFF') >= 0 && String(doc.CurrentUserID) !== session.userId) {
    throw new Error('เอกสารนี้ไม่ได้มอบหมายให้คุณ');
  }

  const status = String((req.data || {}).status || 'IN_PROGRESS');
  if (['IN_PROGRESS','COMPLETED'].indexOf(status) < 0) throw new Error('สถานะงานไม่ถูกต้อง');

  updateObject_('DOCUMENTS','DocumentID',docId,{
    CurrentStatus:status,
    CurrentQueue:status === 'COMPLETED' ? '' : 'STAFF',
    CurrentUserID:status === 'COMPLETED' ? '' : session.userId,
    UpdatedBy:session.userId, UpdatedAt:now_()
  });
  logWorkflow_(docId,status === 'COMPLETED' ? 'COMPLETE_TASK' : 'UPDATE_TASK',
    'STAFF','',session.userId,String((req.data || {}).note || ''));
  return {ok:true, data:findRowObject_('DOCUMENTS','DocumentID',docId)};
}

/* =========================
   QR VERIFY - PUBLIC
   ========================= */

function verifyQR_(token) {
  if (!token) throw new Error('ไม่พบ QR token');
  const doc = findRowObject_('DOCUMENTS','QRToken',token);
  if (!doc || truthy_(doc.IsDeleted)) throw new Error('ไม่พบข้อมูล QR หรือ QR ไม่ถูกต้อง');

  return {
    DocumentID:doc.DocumentID,
    Organization:'สำนักงานสาธารณสุขอำเภอโนนสะอาด',
    DocumentType:doc.DocumentType,
    RegisterNo:doc.RegisterNo,
    RegisterYear:doc.RegisterYear,
    DocumentNo:doc.DocumentNo,
    ReceiveDate:doc.ReceiveDate,
    Subject:doc.Subject,
    CurrentStatus:doc.CurrentStatus,
    FileSHA256:doc.FileSHA256 || ''
  };
}

/* =========================
   NUMBERING
   ========================= */

function configureV5NumberCounters(){
  const sh=sheet_('NUMBER_COUNTERS'),map=headerMap_(sh),values=sh.getDataRange().getValues(),year=buddhistYear_(new Date()),defaults={OUTGOING:'อด 1132/',CIRCULAR:'อด 1132/',ORDER:'คำสั่งที่ ',APPROVAL:''};
  Object.keys(defaults).forEach(function(type){let found=false;for(let i=1;i<values.length;i++){if(String(values[i][map.DocumentType])===type&&Number(values[i][map.Year])===year){found=true;if(!String(values[i][map.Prefix]||'')&&defaults[type])sh.getRange(i+1,map.Prefix+1).setValue(defaults[type]);break;}}if(!found&&type!=='APPROVAL'){sh.appendRow(['C_V5_'+type, type, year, defaults[type], 0, now_()]);}});
  return 'ตั้งค่า Counter V5 สำหรับปี '+year+' แล้ว (ไม่เปลี่ยน LastNumber เดิม)';
}

function nextNumber_(documentType, year) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_('NUMBER_COUNTERS'); const map=headerMap_(sh); const values=sh.getDataRange().getValues(); let row=-1;
    for(let i=1;i<values.length;i++){ if(String(values[i][map.DocumentType])===documentType && Number(values[i][map.Year])===Number(year)){row=i+1;break;} }
    if(row<0) throw new Error('ไม่พบ counter ของ '+documentType+'/'+year+' กรุณาเพิ่ม Counter ก่อน');
    const lastCol=map.LastNumber+1, prefix=String(sh.getRange(row,map.Prefix+1).getValue()||'');
    const last=Number(sh.getRange(row,lastCol).getValue()||0)+1; sh.getRange(row,lastCol).setValue(last); sh.getRange(row,map.UpdatedAt+1).setValue(now_());
    return formatDocumentNumber_(documentType,prefix,last,year);
  } finally { lock.releaseLock(); }
}
function formatDocumentNumber_(type,prefix,number,year){ const yy=String(year).slice(-2), n=String(number); if(type==='CIRCULAR')return (prefix||'')+'ว'+n+'/'+yy; if(type==='ORDER')return (prefix||'คำสั่งที่ ')+n+'/'+yy; return (prefix||'')+n+'/'+yy; }
function getNumberStatus_(session,req){
  requireRole_(session,['ADMIN','REGISTRAR','STAFF']); const year=Number(req.year||buddhistYear_(new Date())), types=['OUTGOING','CIRCULAR','ORDER','APPROVAL'];
  const sh=sheet_('NUMBER_COUNTERS'),map=headerMap_(sh),values=sh.getDataRange().getValues(),out=[];
  for(let i=1;i<values.length;i++){const type=String(values[i][map.DocumentType]||'');if(types.indexOf(type)<0||Number(values[i][map.Year])!==year)continue;const last=Number(values[i][map.LastNumber]||0),prefix=String(values[i][map.Prefix]||'');out.push({DocumentType:type,Year:year,LastNumber:last,LatestNumber:last?formatDocumentNumber_(type,prefix,last,year):'-',NextNumber:formatDocumentNumber_(type,prefix,last+1,year)});}
  types.forEach(function(type){if(!out.some(function(x){return x.DocumentType===type;}))out.push({DocumentType:type,Year:year,LastNumber:0,LatestNumber:'-',NextNumber:'รอตั้ง Counter'});}); return {ok:true,data:out};
}
function getOutgoingDocuments_(session,req){
  requireRole_(session,['ADMIN','REGISTRAR','STAFF']); const allowed=['OUTGOING','CIRCULAR','ORDER','APPROVAL']; const type=String(req.documentType||''),year=String(req.year||''),q=String(req.q||'').trim().toLowerCase();
  let docs=findAllRows_('DOCUMENTS').filter(function(d){return allowed.indexOf(String(d.DocumentType))>=0&&!truthy_(d.IsDeleted);});
  docs=docs.filter(function(d){if(type&&String(d.DocumentType)!==type)return false;if(year&&String(d.RegisterYear)!==year)return false;if(q){const hay=[d.DocumentNo,d.Subject,d.SenderName,d.SenderOrganization,d.RelatedOrgUnitID,d.RelatedJobID].join(' ').toLowerCase();if(hay.indexOf(q)<0)return false;}return true;});
  return {ok:true,data:docs.sort(function(a,b){return String(b.UpdatedAt||'').localeCompare(String(a.UpdatedAt||''));})};
}
function getReportSummary_(session,req){
  requireRole_(session,['ADMIN','REGISTRAR','STAFF','SSO','ASSISTANT_SSO']); const year=String(req.year||buddhistYear_(new Date())),type=String(req.documentType||''),group=String(req.groupId||''),job=String(req.jobId||'');
  let docs=findAllRows_('DOCUMENTS').filter(function(d){return !truthy_(d.IsDeleted)&&String(d.RegisterYear)===year;}); if(type)docs=docs.filter(function(d){return String(d.DocumentType)===type;});if(group)docs=docs.filter(function(d){return String(d.RelatedOrgUnitID)===group;});if(job)docs=docs.filter(function(d){return String(d.RelatedJobID)===job;});
  const byType={},byGroup={},byJob={}; docs.forEach(function(d){const t=String(d.DocumentType||'');byType[t]=(byType[t]||0)+1;const g=String(d.RelatedOrgUnitID||'ไม่ระบุกลุ่มงาน');byGroup[g]=(byGroup[g]||0)+1;const j=String(d.RelatedJobID||'ไม่ระบุงาน');byJob[j]=(byJob[j]||0)+1;}); return {ok:true,data:{year:Number(year),total:docs.length,byType:byType,byGroup:byGroup,byJob:byJob,documents:docs}};
}
function logWorkflow_(documentId, actionCode, fromUser, toUser, actionBy, detail) {
  appendObject_('WORKFLOW_LOG',{
    LogID:id_('LOG'), DocumentID:documentId, ActionCode:actionCode,
    FromUserID:fromUser || '', ToUserID:toUser || '', ActionBy:actionBy || '',
    ActionDateTime:now_(), Detail:String(detail || ''), CreatedAt:now_()
  });
}

/* =========================
   SHEET HELPERS
   ========================= */

function ss_() {
  return SpreadsheetApp.openById(API_CFG.SPREADSHEET_ID);
}

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบ Sheet: ' + name);
  return sh;
}

function headerMap_(sh) {
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach(function(h,i){ map[String(h)] = i; });
  return map;
}

function findRowNumber_(sh, key, value) {
  const map = headerMap_(sh);
  const idx = map[key];
  if (idx == null) return 0;
  const dataRows = sh.getLastRow() - 1;
  if (dataRows <= 0) return 0;
  const values = sh.getRange(2,idx+1,dataRows,1).getValues();
  for (let i=0;i<values.length;i++) if (String(values[i][0]) === String(value)) return i+2;
  return 0;
}

function findRowObject_(sheetName, key, value) {
  const sh = sheet_(sheetName);
  if (sh.getLastRow() < 2) return null;
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  const idx = headers.indexOf(String(key));
  if (idx < 0) return null;
  const values = sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues();
  for (let i=0;i<values.length;i++) {
    if (String(values[i][idx]) === String(value)) return objectFromRow_(headers, values[i]);
  }
  return null;
}

function findAllRows_(sheetName, key, value) {
  const sh = sheet_(sheetName);
  if (sh.getLastRow() < 2) return [];
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  const values = sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues();
  const idx = key ? headers.indexOf(String(key)) : -1;
  const out = [];
  for (let i=0;i<values.length;i++) {
    if (idx < 0 || String(values[i][idx]) === String(value)) out.push(objectFromRow_(headers,values[i]));
  }
  return out;
}

function appendObject_(sheetName, obj) {
  const sh = sheet_(sheetName);
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  const row = headers.map(function(h){ return obj[h] !== undefined ? obj[h] : ''; });
  sh.appendRow(row);
}

function updateObject_(sheetName, key, value, patch) {
  const sh = sheet_(sheetName);
  const row = findRowNumber_(sh,key,value);
  if (!row) throw new Error('ไม่พบข้อมูล ' + sheetName + '/' + value);
  const map = headerMap_(sh);
  Object.keys(patch).forEach(function(k){
    if (map[k] != null) sh.getRange(row,map[k]+1).setValue(patch[k]);
  });
}

function objectFromRow_(headers, row) {
  const o = {};
  headers.forEach(function(h,i){ o[h] = normalizeCell_(row[i]); });
  return o;
}

function normalizeCell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v,API_CFG.TIMEZONE,'yyyy-MM-dd HH:mm:ss');
  return v;
}

function safeDocument_(doc) {
  const out = {};
  Object.keys(doc).forEach(function(k){
    if (['PasswordHash','PasswordSalt'].indexOf(k) < 0) out[k] = doc[k];
  });
  return out;
}

function getPublicUser_(user, roles) {
  return {
    UserID:user.UserID, Username:user.Username, FullName:user.FullName,
    Position:user.Position, PrimaryOrgUnitID:user.PrimaryOrgUnitID,
    PrimaryJobID:user.PrimaryJobID, Status:user.Status,
    MustChangePassword:truthy_(user.MustChangePassword), Roles:roles
  };
}

function getUserRoles_(userId) {
  return findAllRows_('USER_ROLES','UserID',userId)
    .filter(function(r){return truthy_(r.Active);})
    .map(function(r){return String(r.RoleCode);});
}

function assignedDocumentIds_(userId) {
  const map = {};
  findAllRows_('ASSIGNMENTS','AssignedTo',userId).forEach(function(a){
    map[String(a.DocumentID)] = true;
  });
  return map;
}

function isAssignedTo_(docId,userId) {
  return !!assignedDocumentIds_(userId)[String(docId)];
}

function requireRole_(session, allowed) {
  const roles = session.roles || [];
  if (!allowed.some(function(r){return roles.indexOf(r) >= 0;})) {
    throw new Error('ไม่มีสิทธิ์สำหรับการดำเนินการนี้');
  }
}

/* =========================
   GENERAL HELPERS
   ========================= */

function id_(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g,'');
}

function token_() {
  return Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,'');
}

function now_() {
  return Utilities.formatDate(new Date(),API_CFG.TIMEZONE,'yyyy-MM-dd HH:mm:ss');
}

function formatDate_(d) {
  return Utilities.formatDate(d,API_CFG.TIMEZONE,'yyyy-MM-dd');
}

function formatTime_(d) {
  return Utilities.formatDate(d,API_CFG.TIMEZONE,'HH:mm:ss');
}

function buddhistYear_(d) {
  return Number(Utilities.formatDate(d,API_CFG.TIMEZONE,'yyyy')) + 543;
}

function truthy_(v) {
  return v === true || v === 1 || String(v).toUpperCase() === 'TRUE';
}

function verifyDatabaseV1() {
  const required = Object.keys(API_HEADERS);
  const missing = [];
  required.forEach(function(name) {
    const sh = ss_().getSheetByName(name);
    if (!sh) {
      missing.push(name + ': ไม่พบ Sheet');
      return;
    }
    const actual = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
    API_HEADERS[name].forEach(function(h) {
      if (actual.indexOf(h) < 0) missing.push(name + ': ขาดคอลัมน์ ' + h);
    });
  });
  const users = ss_().getSheetByName('USERS');
  const roles = ss_().getSheetByName('USER_ROLES');
  const msg = missing.length
    ? 'พบปัญหา:\n' + missing.join('\n')
    : 'ฐานข้อมูล V1 พร้อมใช้งาน\nUSERS: ' + Math.max(users.getLastRow()-1,0) +
      '\nUSER_ROLES: ' + Math.max(roles.getLastRow()-1,0);
  SpreadsheetApp.getUi().alert('ตรวจสอบฐานข้อมูล V1', msg, SpreadsheetApp.getUi().ButtonSet.OK);
  return {ok: missing.length === 0, missing: missing};
}

function apiResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function apiError_(err) {
  console.error(err && err.stack ? err.stack : err);
  return apiResponse_({
    ok:false,
    error:err && err.message ? err.message : String(err)
  });
}
