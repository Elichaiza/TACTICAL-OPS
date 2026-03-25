import { useState, useEffect, useRef, useCallback, Component } from "react";
/* ── Error Boundary — תופס שגיאות render ── */
class ErrorBoundary extends Component {
 constructor(props) { super(props); this.state = { error: null }; }
 static getDerivedStateFromError(e) { return { error: e }; }
 render() {
  if (this.state.error) {
   return (
    <div style={{padding:40,background:"#0d1117",color:"#f87171",fontFamily:"monospace",direction:"ltr",minHeight:"100vh"}}>
     <h2 style={{color:"#f87171"}}>⚠ Runtime Error</h2>
     <pre style={{whiteSpace:"pre-wrap",fontSize:13,color:"#fca5a5"}}>
      {this.state.error?.message}
     </pre>
     <pre style={{whiteSpace:"pre-wrap",fontSize:11,color:"#475569",marginTop:16}}>
      {this.state.error?.stack}
     </pre>
     <button onClick={()=>this.setState({error:null})}
      style={{marginTop:16,padding:"8px 20px",background:"#1e293b",color:"#e2e8f0",border:"1px solid #334155",borderRadius:8,cursor:"pointer"}}>
      נסה שוב </button> </div> ); }
  return this.props.children; } }
/* ===========================================================
 CONSTANTS
=========================================================== */
const ROLES_SYSTEM = ["admin", "manager", "viewer"];
const ROLE_LABELS = { admin: "מנהל מערכת", manager: "מפקד", viewer: "חייל / צפייה" };
const ROLE_COLORS = { admin: { bg: "#2d1b69", color: "#c4b5fd" }, manager: { bg: "#0f2a1e", color: "#86efac" }, viewer: { bg: "#1c1917", color: "#a8a29e" } };
/* ── hash סיסמה — fallback בטוח לסביבת sandbox ── */
async function hashPassword(pwd) {
 try {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
   const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pwd));
   return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join(""); }
 } catch(e) {}
 let hash = 0;
 for (let i = 0; i < pwd.length; i++) {
  hash = ((hash << 5) - hash) + pwd.charCodeAt(i);
  hash |= 0; }
 return "fb_" + Math.abs(hash).toString(16).padStart(8, "0") + "_" + pwd.length; }
const SOLDIER_ROLES = ["חייל", "סמל", "מפקד", "מפקד משימה", "קצין"];
const ROLE_RANK = { "חייל": 0, "סמל": 1, "מפקד": 2, "מפקד משימה": 3, "קצין": 4 };
const SPECIAL_ROLES = ["סמל", "מפקד", "מפקד משימה", "קצין"];
const CERTS = ["קלע","נגב","מטול","מאג","רחפן","חובש","נהג-דוד","נהג-סאוונה","נהג-פנתר","נהג-טיגריס","נהג-האמר","נהג-לבן"];
const CERT_LABELS = {"קלע":"קלע","נגב":"נגב","מטול":"מטול","מאג":"מאג","רחפן":"רחפן","חובש":"חובש","נהג-דוד":"נהג דוד","נהג-סאוונה":"נהג סאוונה","נהג-פנתר":"נהג פנתר","נהג-טיגריס":"נהג טיגריס","נהג-האמר":"נהג האמר","נהג-לבן":"נהג לבן"};
const MAIN_TABS = [
 { id:"soldiers",   icon:"👤", label:"חיילים",       roles:["admin","manager"] },
 { id:"missions",   icon:"🎯", label:"משימות",       roles:["admin","manager"] },
 { id:"attendance", icon:"📋", label:"נוכחות",       roles:["admin","manager"] },
 { id:"assignment", icon:"⚔️", label:"שיבוץ",        roles:["admin","manager"] },
 { id:"datatable",  icon:"📊", label:"טבלת נתונים",  roles:["admin","manager"] },
 { id:"myshift",    icon:"🪖", label:"המשמרת שלי",   roles:["viewer"] },
 { id:"users",      icon:"⚙️", label:"ניהול משתמשים", roles:["admin"] }, ];
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function todayStr() { return new Date().toISOString().split("T")[0]; }
function fmtDate(d) { if(!d)return""; const[y,m,day]=d.split("-"); return`${day}/${m}/${y}`; }
function parseTime(t) { const[h,m]=t.split(":").map(Number); return h*60+(m||0); }
function addMins(t,mins) { const tot=parseTime(t)+mins; return`${String(Math.floor(tot/60)%24).padStart(2,"0")}:${String(tot%60).padStart(2,"0")}`; }
function shiftDur(s,e) { let sv=parseTime(s),ev=parseTime(e); if(ev<=sv)ev+=1440; return ev-sv; }
/* ===========================================================
 STORAGE HELPERS
=========================================================== */
async function sGet(key, shared=false) {
 try { const r=await window.storage.get(key,shared); return r?JSON.parse(r.value):null; } catch(e) { return null; } }
async function sSet(key, val, shared=false) {
 try { await window.storage.set(key,JSON.stringify(val),shared); return true; } catch(e) { return false; } }
function timeToMins(t) {
 if (!t) return 0;
 const [h, m] = t.split(":").map(Number);
 return h * 60 + (m || 0); }
function absRange(startTime, endTime, dayOffset = 0) {
 const s = dayOffset * 1440 + timeToMins(startTime);
 let e   = dayOffset * 1440 + timeToMins(endTime);
 if (e <= s) e += 1440;
 return { s, e, dur: e - s }; }
function minsWorkedInWindow(busySlots, windowEnd) {
 const ws = windowEnd - 1440;
 return busySlots.reduce((sum, b) =>
  sum + Math.max(0, Math.min(b.e, windowEnd) - Math.max(b.s, ws)), 0); }
function missionHardness(mission) {
 let score = 0;
 const minS = mission.minSpecialRoles || 0;
 const mandatory = mission.mandatoryRoles || [];
 score += minS * 12;
 score += mandatory.length * 15;
 mandatory.forEach(r => score += (ROLE_RANK[r]||0) * 5);
 score += (mission.requiredCerts?.length || 0) * 5;
 return score; }
function fmtMins(mins) {
 if (mins >= 9000) return "לא שובץ עדיין";
 const h = Math.floor(mins / 60), m = mins % 60;
 return `${h}ש'${m > 0 ? ` ${m}ד'` : ""}`; }
function computeMissionShifts(f) {
 const n = f.numShifts || 1;
 const startM = timeToMins(f.startTime);
 const endM   = timeToMins(f.endTime);
 const [sy,smo,sd] = (f.startDate||"2000-01-01").split("-").map(Number);
 const [ey,emo,ed] = (f.endDate||"2000-01-01").split("-").map(Number);
 const dayDiff = Math.round((Date.UTC(ey,emo-1,ed) - Date.UTC(sy,smo-1,sd)) / 86400000);
 const totalMins = dayDiff * 1440 + (endM - startM);
 if (totalMins <= 0) return [];
 const cycleMins = totalMins >= 1440 ? 1440 : totalMins;
 const shiftMins = cycleMins / n;
 const totalShifts = Math.round(totalMins / shiftMins);
 function addDays(dateStr, days) {
  const [y,mo,d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y,mo-1,d) + days*86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,"0")}-${String(dt.getUTCDate()).padStart(2,"0")}`;
 }
 function minsToTime(v) {
  const w = ((Math.round(v)%1440)+1440)%1440;
  return `${String(Math.floor(w/60)).padStart(2,"0")}:${String(w%60).padStart(2,"0")}`; }
 const shifts = [];
 for (let i = 0; i < totalShifts; i++) {
  const so = i * shiftMins;
  const eo = (i === totalShifts-1) ? totalMins : (i+1)*shiftMins;
  shifts.push({
   start:      minsToTime(startM + so),
   end:        minsToTime(startM + eo),
   startDate:  addDays(f.startDate, Math.floor(so/1440)),
   endDate:    addDays(f.startDate, Math.floor(eo/1440)),
   dayNum:        Math.floor(so/1440) + 1,
   shiftOfDay:    (i % n) + 1,
   startOffsetMins: so,
   endOffsetMins:   eo,
  }); }
 return shifts; }
/* ── עוזר נוכחות: תומך בפורמט ישן (מחרוזת) וחדש (אובייקט) ── */
function getAttStatus(val) {
 if (!val) return "unknown";
 if (typeof val === "string") return val;
 return val.status || "unknown"; }
function getAttField(val, field, def="") {
 if (!val || typeof val === "string") return def;
 return (val[field] !== undefined && val[field] !== null) ? val[field] : def; }
function buildAssignment(missions, soldiers, attendanceToday, missionHistory = {}, fullAtt = {}, pinnedAssignments = {}) {
 const MIN_REST  = 450;
 const MAX_DAILY = 480;
 const present = soldiers.filter(s => getAttStatus(attendanceToday[s.id]) === 'present');
 if (!present.length)
  return missions.map(m => ({ missionId:m.id, missionName:m.name, shifts:[] }));
 /* ── 1. בנה סלוטים ───────────────────────────────────────── */
 const allSlots = [];
 function missionDayDate(mission, dayNum) {
  const [y,m,d] = (mission.startDate||"2000-01-01").split("-").map(Number);
  const dt = new Date(Date.UTC(y,m-1,d) + (dayNum-1)*86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,"0")}-${String(dt.getUTCDate()).padStart(2,"0")}`;
 }
 missions.forEach((mission, missionIdx) => {
  computeMissionShifts(mission).forEach((sh, si) => {
   const mS = timeToMins(mission.startTime);
   const s  = mS + (sh.startOffsetMins != null ? sh.startOffsetMins : 0);
   const eR = mS + (sh.endOffsetMins   != null ? sh.endOffsetMins   : sh.startOffsetMins || 0);
   const e  = eR > s ? eR : eR + 1440;
   const dn = sh.dayNum || 1;
   allSlots.push({
    missionId:     mission.id,
    missionName:   mission.name,
    missionIdx,
    shiftIdx:      si,
    start:         sh.start,
    end:           sh.end,
    dayNum:        dn,
    slotDate:      missionDayDate(mission, dn),
    shiftOfDay:    sh.shiftOfDay || (si + 1),
    startAbs:      s,
    endAbs:        e,
    dur:           e - s,
    needed:           mission.soldiersPerShift || 1,
    minSpecialRoles:  mission.minSpecialRoles  || 0,
    mandatoryRoles:   mission.mandatoryRoles   || [],
    requiredCerts:    mission.requiredCerts || [],
    hardness:      missionHardness(mission),
    assigned:      [],
    assignedIds:   new Set(),
   });
  });
 });
 /* ── 2. מצב חיילים ──────────────────────────────────────── */
 const state = {};
 present.forEach((s, idx) => {
  state[s.id] = { totalMins:0, shiftCount:0, lastEndAbs:-9999, busySlots:[], idx,
   missionCounts: { ...(missionHistory[s.id] || {}) } };
 });
 allSlots.forEach(slot => {
  const key = `${slot.missionId}__${slot.shiftIdx}`;
  const pinIds = pinnedAssignments[key] || [];
  pinIds.forEach(sid => {
   const soldier = soldiers.find(s => s.id === sid);
   if (!soldier) return;
   if (slot.assignedIds.has(sid)) return;
   slot.assigned.push({ id: sid, name: soldier.name, role: soldier.role, reason: '📌 שובץ ידנית', pinned: true });
   slot.assignedIds.add(sid);
   if (state[sid]) {
    state[sid].totalMins  += slot.dur;
    state[sid].shiftCount += 1;
    state[sid].lastEndAbs  = Math.max(state[sid].lastEndAbs, slot.endAbs);
    state[sid].busySlots.push({ s: slot.startAbs, e: slot.endAbs });
    state[sid].missionCounts[slot.missionId] = (state[sid].missionCounts[slot.missionId] || 0) + 1; }
  });
 });
 /* ── 3. בדיקות חוקיות ─────────────────────────────────────── */
 /* ── slotRoleOk: האם שיבוץ חייל זה עדיין משאיר את הסלוט בר-מילוי? ── */
 function slotRoleOk(soldier, slot) {
  const remaining = slot.needed - slot.assigned.length;
  if (remaining <= 0) return false;
  const assignedSpecial = slot.assigned.filter(a => SPECIAL_ROLES.includes(a.role)).length;
  const unmetMandatory = (slot.mandatoryRoles || []).filter(
   r => !slot.assigned.some(a => a.role === r) );
  const newSpecial = assignedSpecial + (SPECIAL_ROLES.includes(soldier.role) ? 1 : 0);
  let newUnmet = [...unmetMandatory];
  const midx = newUnmet.indexOf(soldier.role);
  if (midx >= 0) newUnmet.splice(midx, 1);
  const newSpecialNeeded = Math.max(0, (slot.minSpecialRoles || 0) - newSpecial);
  const neededSpecialExtra = Math.max(0, newSpecialNeeded - newUnmet.length);
  const locked = newUnmet.length + neededSpecialExtra;
  return (remaining - 1) >= locked; }
 function hardOk(soldier, slot) {
  if (slot.assignedIds.has(soldier.id)) return false;
  if (slot.requiredCerts.length > 0 &&
    !slot.requiredCerts.every(c => soldier.certifications?.includes(c))) return false;
  const st = state[soldier.id];
  if (st.busySlots.some(b => b.s < slot.endAbs && slot.startAbs < b.e)) return false;
  const dayAttVal = (fullAtt[slot.slotDate] || {})[soldier.id];
  if (dayAttVal && typeof dayAttVal === 'object') {
   const fromStr = getAttField(dayAttVal, 'from', '10:00');
   const toStr   = getAttField(dayAttVal, 'to',   '10:00');
   if (fromStr !== toStr) {
    const fromM = timeToMins(fromStr);
    const toM0  = timeToMins(toStr);
    const toM   = toM0 < fromM ? toM0 + 1440 : toM0;
    const dayOffset    = (slot.dayNum - 1) * 1440;
    const availFromAbs = dayOffset + fromM;
    const availToAbs   = dayOffset + toM;
    if (slot.startAbs < availFromAbs || slot.endAbs > availToAbs) return false; } }
  if (!slotRoleOk(soldier, slot)) return false;
  return true; }
 function lv1(soldier, slot) {
  if (!hardOk(soldier, slot)) return false;
  const st = state[soldier.id];
  if (st.lastEndAbs > -9999 && (slot.startAbs - st.lastEndAbs) < MIN_REST) return false;
  const ws = slot.endAbs - 1440;
  const worked = st.busySlots.reduce(
   (sum, b) => sum + Math.max(0, Math.min(b.e, slot.endAbs) - Math.max(b.s, ws)), 0);
  if (worked + slot.dur > MAX_DAILY) return false;
  return true; }
 function lv2(soldier, slot) {
  if (!hardOk(soldier, slot)) return false;
  const st = state[soldier.id];
  const ws = slot.endAbs - 1440;
  const worked = st.busySlots.reduce(
   (sum, b) => sum + Math.max(0, Math.min(b.e, slot.endAbs) - Math.max(b.s, ws)), 0);
  if (worked + slot.dur > MAX_DAILY) return false;
  return true; }
 function lv3(soldier, slot) {
  return hardOk(soldier, slot); }
 /* ── 4. דירוג חיילים — totalMins ראשון, גיוון משימות כ-tiebreaker ── */
 const missionSeed = {};
 missions.forEach((m, i) => { missionSeed[m.id] = i; });
 const n = present.length || 1;
 function rank(pool, slot) {
  const seed = missionSeed[slot.missionId] || 0;
  return pool.slice().sort((a, b) => {
   const A = state[a.id], B = state[b.id];
   if (A.totalMins  !== B.totalMins)  return A.totalMins  - B.totalMins;
   const mA = A.missionCounts[slot.missionId] || 0;
   const mB = B.missionCounts[slot.missionId] || 0;
   if (mA !== mB) return mA - mB;
   if (A.shiftCount !== B.shiftCount) return A.shiftCount - B.shiftCount;
   const rA = A.lastEndAbs < 0 ? 999999 : slot.startAbs - A.lastEndAbs;
   const rB = B.lastEndAbs < 0 ? 999999 : slot.startAbs - B.lastEndAbs;
   if (rA !== rB) return rB - rA;
   return ((A.idx + seed) % n) - ((B.idx + seed) % n);
  }); }
 const numMissions = missions.length || 1;
 let round = 0;
 const dayGroups = {};
 allSlots.forEach(sl => {
  const d = sl.dayNum || 1;
  (dayGroups[d] = dayGroups[d] || []).push(sl);
 });
 const sortedDays = Object.keys(dayGroups).map(Number).sort((a, b) => a - b);
 for (const day of sortedDays) {
  present.forEach(s => { state[s.id].busySlots = []; });
  const daySlots = dayGroups[day];
  let progress = true;
  while (progress) {
   progress = false;
   const open = daySlots.filter(sl => sl.assigned.length < sl.needed);
   if (!open.length) break;
   open.forEach(sl => {
    sl._lv1 = present.filter(s => lv1(s, sl)).length;
    sl._lv2 = present.filter(s => lv2(s, sl)).length;
    sl._lv3 = present.filter(s => lv3(s, sl)).length;
    sl._score = sl._lv1 > 0 ? sl._lv1
         : sl._lv2 > 0 ? 10000 + sl._lv2
         : sl._lv3 > 0 ? 20000 + sl._lv3
         : 99999;
   });
   const viable = open.filter(sl => sl._lv3 > 0);
   if (!viable.length) break;
   const missionProgress = {};
   allSlots.forEach(sl => {
    missionProgress[sl.missionId] = (missionProgress[sl.missionId]||0) + sl.assigned.length;
   });
   viable.sort((a, b) => {
    if (a._score !== b._score) return a._score - b._score;
    const pa = missionProgress[a.missionId] || 0;
    const pb = missionProgress[b.missionId] || 0;
    if (pa !== pb) return pa - pb;
    if (a.startAbs !== b.startAbs) return a.startAbs - b.startAbs;
    if (a.hardness !== b.hardness) return b.hardness - a.hardness;
    return ((a.missionIdx - round) % numMissions + numMissions) % numMissions
      - ((b.missionIdx - round) % numMissions + numMissions) % numMissions;
   });
   const slot = viable[0];
   let pool;
   if      (slot._lv1 > 0) pool = present.filter(s => lv1(s, slot));
   else if (slot._lv2 > 0) pool = present.filter(s => lv2(s, slot));
   else                    pool = present.filter(s => lv3(s, slot));
   const ranked = rank(pool, slot);
   const pick   = ranked[0];
   const st     = state[pick.id];
   const restMins = st.lastEndAbs < 0 ? 99999 : slot.startAbs - st.lastEndAbs;
   const parts = [`שעות: ${fmtMins(st.totalMins)}`, `מנוחה: ${fmtMins(restMins)}`];
   if (slot.minSpecialRoles > 0 || slot.mandatoryRoles.length > 0) parts.push(`תפקיד: ${pick.role}`);
   if (slot.requiredCerts.length > 0)
    parts.push(`הסמכה: ${slot.requiredCerts.map(c => CERT_LABELS[c]).join(', ')}`);
   parts.push(`שיבוץ #${st.shiftCount + 1}`);
   if (slot._lv1 === 0 && slot._lv2 > 0) parts.push('⚠ מנוחה קצרה');
   if (slot._lv1 === 0 && slot._lv2 === 0) parts.push('⚠ עומס גבוה');
   slot.assigned.push({ id:pick.id, name:pick.name, role:pick.role, reason:parts.join(' · ') });
   slot.assignedIds.add(pick.id);
   st.totalMins  += slot.dur;
   st.shiftCount += 1;
   st.lastEndAbs  = slot.endAbs;
   st.busySlots.push({ s:slot.startAbs, e:slot.endAbs });
   st.missionCounts[slot.missionId] = (st.missionCounts[slot.missionId] || 0) + 1;
   round++;
   progress = true; } }
 /* ── 6. הרכב תוצאות ─────────────────────────────────────── */
 const resultMap = {};
 missions.forEach(m => {
  resultMap[m.id] = {
   missionId:   m.id,
   missionName: m.name,
   shifts: computeMissionShifts(m).map(sh => ({
    ...sh,
    soldierIds:     [],
    soldierNames:   [],
    soldierDetails: [],
    needed:         m.soldiersPerShift || 1,
    filled:         false,
   })), };
 });
 allSlots.forEach(slot => {
  const mRes = resultMap[slot.missionId]; if (!mRes) return;
  const sh   = mRes.shifts[slot.shiftIdx]; if (!sh)   return;
  sh.soldierIds     = slot.assigned.map(a => a.id);
  sh.soldierNames   = slot.assigned.map(a => a.name);
  sh.soldierDetails = slot.assigned;
  sh.filled         = slot.assigned.length >= slot.needed;
 });
 return missions.map(m => resultMap[m.id]); }
/* ===========================================================
 ROOT APP
=========================================================== */
function AppInner() {
 const [screen, setScreen] = useState("loading");
 const [inviteData, setInviteData] = useState(null);
 const [currentUser, setCurrentUser] = useState(null);
 const [profileOpen, setProfileOpen] = useState(false);
 const [users, setUsers] = useState([]);
 const [deployments, setDeployments] = useState([]);
 const [currentDepId, setCurrentDepId] = useState(null);
 const [activeTab, setActiveTab] = useState(null);
 const [notification, setNotification] = useState(null);
 const [dataLoaded, setDataLoaded] = useState(false);
 const isSaving = useRef(false);
 const notify = (msg, type="success") => {
  setNotification({ msg, type });
  setTimeout(() => setNotification(null), 3500); };
 useEffect(() => {
  (async () => {
   const storedUsers = await sGet("tac:users", true);
   const storedDeps = await sGet("tac:deployments", true);
   const session = await sGet("tac:session", false);
   if (storedUsers) setUsers(storedUsers);
   if (storedDeps) setDeployments(storedDeps);
   const urlParams = new URLSearchParams(window.location.search);
   const inviteToken = urlParams.get("invite");
   if (inviteToken) {
    const inv = await sGet("tac:invite", true);
    if (inv && inv.active && inv.token === inviteToken) {
     setInviteData(inv);
     setScreen("register");
     setDataLoaded(true);
     return; } }
   if (session && storedUsers) {
    const u = storedUsers.find(u => u.email===session.email);
    if (u && u.role !== "pending" && !u.blocked) {
     setCurrentUser(u); setScreen("app");
     setActiveTab(u.role==="viewer"?"myshift":"soldiers");
    } else setScreen("login");
   } else setScreen("login");
   setDataLoaded(true);
  })();
 }, []);
 useEffect(() => {
  if (!dataLoaded) return;
  const interval = setInterval(async () => {
   if (isSaving.current) return;
   const storedDeps = await sGet("tac:deployments", true);
   const storedUsers = await sGet("tac:users", true);
   if (isSaving.current) return;
   if (storedDeps) setDeployments(storedDeps);
   if (storedUsers) setUsers(storedUsers);
  }, 5000);
  return () => clearInterval(interval);
 }, [dataLoaded]);
 async function saveUsers(u) {
  isSaving.current = true;
  setUsers(u);
  await sSet("tac:users", u, true);
  isSaving.current = false; }
 async function saveDeps(d) {
  isSaving.current = true;
  setDeployments(d);
  await sSet("tac:deployments", d, true);
  isSaving.current = false; }
 async function updateDep(fn) {
  const next = deployments.map(d => d.id===currentDepId ? fn(d) : d);
  await saveDeps(next); }
 async function handleLogin(email, password) {
  const norm = email.toLowerCase().trim();
  let allUsers = [...users];
  const user = allUsers.find(u => u.email === norm);
  if (!user && allUsers.length === 0) {
   const passwordHash = await hashPassword(password);
   const admin = { id:uid(), email:norm, name:norm.split("@")[0], role:"admin",
    passwordHash, createdAt:new Date().toISOString() };
   allUsers = [admin];
   await saveUsers(allUsers);
   setCurrentUser(admin);
   await sSet("tac:session", { email:norm }, false);
   setScreen("app"); setActiveTab("soldiers");
   notify("ברוך הבא! הוגדרת כמנהל מערכת ראשי.", "success");
   return "ok"; }
  if (!user) {
   notify("משתמש לא קיים. פנה למנהל המערכת.", "error");
   return "unknown"; }
  if (user.blocked) {
   notify("חשבון זה חסום. פנה למנהל המערכת.", "error");
   return "blocked"; }
  if (user.role === "pending") {
   notify("הגישה שלך ממתינה לאישור מנהל.", "warn");
   return "pending"; }
  if (!user.passwordHash) {
   const passwordHash = await hashPassword(password);
   const updated = { ...user, passwordHash };
   await saveUsers(allUsers.map(u => u.id===user.id ? updated : u));
   setCurrentUser(updated);
   await sSet("tac:session", { email:norm }, false);
   setScreen("app");
   setActiveTab(user.role==="viewer" ? "myshift" : "soldiers");
   notify(`שלום, ${updated.name}! סיסמה הוגדרה.`, "success");
   return "ok"; }
  const hash = await hashPassword(password);
  if (hash !== user.passwordHash) {
   notify("סיסמה שגויה.", "error");
   return "wrong_password"; }
  setCurrentUser(user);
  await sSet("tac:session", { email:norm }, false);
  setScreen("app");
  setActiveTab(user.role==="viewer" ? "myshift" : "soldiers");
  notify(`שלום, ${user.name}!`, "success");
  return "ok"; }
 async function handleLogout() {
  await sSet("tac:session", null, false);
  setCurrentUser(null);
  setScreen("login"); }
 async function handleRegister(name, email, password) {
  const norm = email.toLowerCase().trim();
  const allUsers = [...users];
  if (allUsers.find(u=>u.email===norm)) { notify("אימייל כבר קיים","error"); return "exists"; }
  const passwordHash = await hashPassword(password);
  const newUser = { id:uid(), email:norm, name:name.trim(), role:inviteData?.defaultRole||"viewer",
   passwordHash, createdAt:new Date().toISOString(), inviteRegistered:true };
  const updated = [...allUsers, newUser];
  await saveUsers(updated);
  setCurrentUser(newUser);
  await sSet("tac:session", { email:norm }, false);
  window.history.replaceState({}, "", window.location.pathname);
  setScreen("app");
  setActiveTab("myshift");
  notify(`ברוך הבא, ${name}!`, "success");
  return "ok"; }
 const currentDep = deployments.find(d => d.id===currentDepId) || null;
 if (screen==="loading")  return <LoadingScreen />;
 if (screen==="login")    return <LoginScreen onLogin={handleLogin} usersExist={users.length>0} />;
 if (screen==="register") return <RegisterScreen onRegister={handleRegister} inviteData={inviteData} />;
 const allowedTabs = MAIN_TABS.filter(t => t.roles.includes(currentUser?.role));
 return (
  <div style={S.app} dir="rtl">
   <style>{globalCSS}</style>
      {notification && (
    <div style={{ ...S.notif, ...(notification.type==="warn"?S.notifWarn:notification.type==="error"?S.notifErr:{}) }}>
     {notification.type==="success"?"✓":notification.type==="warn"?"⚠":""} {notification.msg} </div> )}
   
   <header style={S.header}>
    <div style={S.headerInner}>
     <div style={S.logo}>
      <span style={S.logoGlyph}>⚔</span>
      <div>
       <div style={S.logoTitle}>TACTICAL OPS</div>
       <div style={S.logoSub}>מערכת שיבוץ מבצעי</div> </div> </div>
     <div style={S.depArea}>
      {deployments.map(d => (
       <button key={d.id}
        onClick={() => { setCurrentDepId(d.id); if(!activeTab||!allowedTabs.find(t=>t.id===activeTab)) setActiveTab(allowedTabs[0]?.id); }}
        style={{ ...S.depPill, ...(d.id===currentDepId?S.depPillActive:{}) }}>
        {d.name} </button>
      ))}
      {(currentUser?.role==="admin"||currentUser?.role==="manager") && (
       <NewDepButton onAdd={async name => {
        const dep = { id:uid(), name, soldiers:[], missions:[], attendance:{}, assignments:[] };
        await saveDeps([...deployments, dep]);
        setCurrentDepId(dep.id);
        setActiveTab("soldiers");
       }} /> )} </div>
     <div style={S.userArea}>
      <span style={{ ...S.rolePill, ...ROLE_COLORS[currentUser?.role] }}>{ROLE_LABELS[currentUser?.role]}</span>
      <button onClick={()=>setProfileOpen(true)}
       style={{...S.logoutBtn,borderColor:"#1e3a5f",color:"#93c5fd",display:"flex",alignItems:"center",gap:5}}>
       👤 <span style={{maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{currentUser?.name}</span>
      </button>
      <button onClick={handleLogout} style={S.logoutBtn}>יציאה →</button> </div> </div> </header>
   {!currentDep ? (
    <EmptyState onNew={async name => {
     const dep = { id:uid(), name, soldiers:[], missions:[], attendance:{}, assignments:[] };
     await saveDeps([...deployments, dep]);
     setCurrentDepId(dep.id); setActiveTab("soldiers");
    }} canCreate={currentUser?.role!=="viewer"} />
   ) : (
    <div style={S.workspace}>
     <nav style={S.tabBar}>
      {allowedTabs.map(t => (
       <button key={t.id} onClick={()=>setActiveTab(t.id)}
        style={{ ...S.tab, ...(activeTab===t.id?S.tabActive:{}) }}>
        <span style={{fontSize:18}}>{t.icon}</span>
        <span>{t.label}</span>
        {activeTab===t.id && <span style={S.tabUnderline}/>} </button>
      ))} </nav>
     <div style={S.tabContent}>
      {activeTab==="soldiers"   && <SoldiersTab dep={currentDep} updateDep={updateDep} notify={notify} role={currentUser?.role} />}
      {activeTab==="missions"   && <MissionsTab dep={currentDep} updateDep={updateDep} notify={notify} role={currentUser?.role} />}
      {activeTab==="attendance" && <AttendanceTab dep={currentDep} updateDep={updateDep} notify={notify} role={currentUser?.role} />}
      {activeTab==="assignment" && <AssignmentTab dep={currentDep} updateDep={updateDep} notify={notify} role={currentUser?.role} />}
      {activeTab==="datatable"  && <DataTableTab dep={currentDep} />}
      {activeTab==="myshift"    && <MyShiftTab dep={currentDep} currentUser={currentUser} users={users} saveUsers={saveUsers} notify={notify} />}
      {activeTab==="users"      && <UsersTab users={users} saveUsers={saveUsers} currentUser={currentUser} dep={currentDep} notify={notify} />}
     </div> </div> )}
   {profileOpen && (
    <ProfileModal
     currentUser={currentUser}
     users={users}
     saveUsers={saveUsers}
     dep={currentDep}
     updateDep={updateDep}
     onClose={()=>setProfileOpen(false)}
     onUserUpdated={u=>setCurrentUser(u)}
     notify={notify} /> )} </div> ); }
/* ===========================================================
 PROFILE MODAL
=========================================================== */
function ProfileModal({ currentUser, users, saveUsers, dep, updateDep, onClose, onUserUpdated, notify }) {
 const [tab, setTab]         = useState("details");
 const [name, setName]       = useState(currentUser?.name || "");
 const [phone, setPhone]     = useState(currentUser?.phone || "");
 const [bio, setBio]         = useState(currentUser?.bio || "");
 const [oldPwd, setOldPwd]   = useState("");
 const [newPwd, setNewPwd]   = useState("");
 const [newPwd2, setNewPwd2] = useState("");
 const [showPwd, setShowPwd] = useState(false);
 const [saving, setSaving]   = useState(false);
 const linkedSoldier = dep?.soldiers?.find(s => s.id === currentUser?.soldierId);
 const [soldierRole,  setSoldierRole]  = useState(linkedSoldier?.role  || "חייל");
 const [soldierCerts, setSoldierCerts] = useState(linkedSoldier?.certifications || []);
 const [soldierPhone, setSoldierPhone] = useState(linkedSoldier?.phone || "");
 const [soldierNotes, setSoldierNotes] = useState(linkedSoldier?.notes || "");
 const stats = { shifts:0, hours:0, missions:{}, presenceDays:0 };
 if (linkedSoldier) {
  (dep?.assignments||[]).forEach(a => {
   (a.data||[]).forEach(m => {
    (m.shifts||[]).forEach(sh => {
     if ((sh.soldierIds||[]).includes(linkedSoldier.id)) {
      stats.shifts++;
      const s2=timeToMins(sh.start||"00:00"),e2=timeToMins(sh.end||"00:00");
      stats.hours += (e2>s2?e2-s2:e2+1440-s2)/60;
      stats.missions[m.missionName]=(stats.missions[m.missionName]||0)+1; }
    });
   });
  });
  Object.values(dep?.attendance||{}).forEach(dayRec => {
   if (getAttStatus(dayRec[linkedSoldier.id]) === "present") stats.presenceDays++;
  }); }
 async function saveDetails() {
  if (!name.trim()) return;
  setSaving(true);
  const updatedUser = { ...currentUser, name:name.trim(), phone:phone.trim(), bio:bio.trim() };
  await saveUsers(users.map(u => u.id===currentUser.id ? updatedUser : u));
  onUserUpdated(updatedUser);
  notify("פרטים עודכנו","success");
  setSaving(false); }
 async function saveSoldierDetails() {
  if (!linkedSoldier || !updateDep) return;
  setSaving(true);
  await updateDep(d => ({
   ...d,
   soldiers: d.soldiers.map(s => s.id===linkedSoldier.id
    ? { ...s, role:soldierRole, certifications:soldierCerts,
      phone:soldierPhone.trim(), notes:soldierNotes.trim() }
    : s
   )
  }));
  notify("פרטי חייל עודכנו","success");
  setSaving(false); }
 async function changePassword() {
  if (!oldPwd || !newPwd || newPwd !== newPwd2) return;
  const oldHash = await hashPassword(oldPwd);
  if (oldHash !== currentUser.passwordHash) { notify("סיסמה נוכחית שגויה","error"); return; }
  if (newPwd.length < 6) { notify("סיסמה חדשה חייבת להיות לפחות 6 תווים","error"); return; }
  setSaving(true);
  const newHash = await hashPassword(newPwd);
  const updated = { ...currentUser, passwordHash:newHash };
  await saveUsers(users.map(u => u.id===currentUser.id ? updated : u));
  onUserUpdated(updated);
  setOldPwd(""); setNewPwd(""); setNewPwd2("");
  notify("סיסמה שונתה בהצלחה","success");
  setSaving(false); }
 function toggleCert(c) {
  setSoldierCerts(prev => prev.includes(c) ? prev.filter(x=>x!==c) : [...prev, c]); }
 const roleC = ROLE_COLORS[currentUser?.role] || {};
 const TABS = [
  ["details","👤 פרטים"],
  ...(linkedSoldier ? [["soldier","🪖 פרטי חייל"]] : []),
  ["security","🔒 אבטחה"],
  ["stats","📊 סטטיסטיקות"], ];
 return (
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:2000,
   display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
   <div style={{background:"#0a0f1a",border:"1px solid #1e293b",borderRadius:16,
    width:"100%",maxWidth:540,maxHeight:"92vh",overflow:"auto",
    boxShadow:"0 25px 80px rgba(0,0,0,0.8)"}}>
    
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
     padding:"20px 24px 16px",borderBottom:"1px solid #1e293b"}}>
     <div style={{display:"flex",alignItems:"center",gap:14}}>
      <div style={{width:52,height:52,borderRadius:"50%",background:roleC.bg||"#1e293b",
       display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700,
       border:`2px solid ${roleC.color||"#334155"}`,color:roleC.color||"#e2e8f0",flexShrink:0}}>
       {(currentUser?.name||"?")[0].toUpperCase()} </div>
      <div>
       <div style={{fontWeight:700,color:"#e2e8f0",fontSize:16}}>{currentUser?.name}</div>
       <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>{currentUser?.email}</div>
       <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        <span style={{...roleC,padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:600}}>
         {ROLE_LABELS[currentUser?.role]||currentUser?.role} </span>
        {linkedSoldier && (
         <span style={{background:"#071510",color:"#4ade80",border:"1px solid #16a34a",
          padding:"2px 8px",borderRadius:10,fontSize:11}}>
          🪖 {linkedSoldier.name} </span> )} </div> </div> </div>
     <button onClick={onClose}
      style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:22,padding:4}}>✕</button>
    </div>
    
    <div style={{display:"flex",borderBottom:"1px solid #1e293b",padding:"0 24px",overflowX:"auto"}}>
     {TABS.map(([id,label])=>(
      <button key={id} onClick={()=>setTab(id)} style={{
       background:"none",border:"none",cursor:"pointer",padding:"10px 12px",fontSize:12,
       whiteSpace:"nowrap",color:tab===id?"#93c5fd":"#64748b",fontWeight:tab===id?700:400,
       borderBottom:tab===id?"2px solid #3b82f6":"2px solid transparent",transition:"color 0.15s"}}>
       {label} </button>
     ))} </div>
    <div style={{padding:24}}>
     
     {tab==="details" && (
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
       <div>
        <div style={S.label}>שם מלא</div>
        <input value={name} onChange={e=>setName(e.target.value)}
         style={S.input} placeholder="שם מלא"/> </div>
       <div>
        <div style={S.label}>אימייל <span style={{color:"#334155",fontSize:11}}>(לא ניתן לשינוי)</span></div>
        <div style={{...S.input,color:"#475569",background:"#080c14"}}>{currentUser?.email}</div> </div>
       <div>
        <div style={S.label}>תפקיד במערכת <span style={{color:"#334155",fontSize:11}}>(משתנה ע"י מנהל)</span></div>
        <div style={{...S.input,color:"#475569",background:"#080c14"}}>{ROLE_LABELS[currentUser?.role]||currentUser?.role}</div>
       </div>
       <div>
        <div style={S.label}>טלפון</div>
        <input value={phone} onChange={e=>setPhone(e.target.value)}
         style={S.input} placeholder="050-0000000" type="tel"/> </div>
       <div>
        <div style={S.label}>על עצמי</div>
        <textarea value={bio} onChange={e=>setBio(e.target.value)}
         style={{...S.input,minHeight:72,resize:"vertical",fontFamily:"inherit"}}
         placeholder="ספר קצת על עצמך..."></textarea> </div>
       <div style={{fontSize:11,color:"#334155"}}>
        חשבון נוצר: {currentUser?.createdAt ? new Date(currentUser.createdAt).toLocaleDateString("he-IL") : "—"} </div>
       <div style={{display:"flex",gap:8}}>
        <button onClick={saveDetails} disabled={saving||!name.trim()}
         style={{...S.btnPrimary,flex:1,opacity:name.trim()?1:0.4}}>
         {saving?"שומר...":"💾 שמור פרטים"} </button>
        <button onClick={onClose} style={S.btnGhost}>סגור</button> </div> </div> )}
     
     {tab==="soldier" && linkedSoldier && (
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
       <div style={{background:"#071510",border:"1px solid #16a34a",borderRadius:8,
        padding:"10px 14px",fontSize:12,color:"#4ade80"}}>
        🪖 עריכת פרטי החייל המקושר: <strong>{linkedSoldier.name}</strong> </div>
       <div>
        <div style={S.label}>תפקיד צבאי</div>
        <select value={soldierRole} onChange={e=>setSoldierRole(e.target.value)} style={{...S.select,marginTop:4}}>
         {SOLDIER_ROLES.map(r=><option key={r} value={r}>{r}</option>)} </select> </div>
       <div>
        <div style={S.label}>טלפון (שיבוץ)</div>
        <input value={soldierPhone} onChange={e=>setSoldierPhone(e.target.value)}
         style={S.input} placeholder="050-0000000" type="tel"/> </div>
       <div>
        <div style={S.label}>הסמכות</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
         {CERTS.map(c => {
          const on = soldierCerts.includes(c);
          return (
           <button key={c} onClick={()=>toggleCert(c)}
            style={{padding:"5px 12px",borderRadius:14,border:`1px solid ${on?"#16a34a":"#1e293b"}`,
             background:on?"#0d3320":"transparent",color:on?"#4ade80":"#64748b",
             cursor:"pointer",fontSize:12,transition:"all 0.15s"}}>
            {on?"✓ ":""}{CERT_LABELS[c]||c} </button> );
         })} </div>
        {soldierCerts.length > 0 && (
         <div style={{marginTop:10,fontSize:12,color:"#64748b"}}>
          נבחרו: <strong style={{color:"#4ade80"}}>{soldierCerts.map(c=>CERT_LABELS[c]||c).join("، ")}</strong> </div>
        )} </div>
       <div>
        <div style={S.label}>הערות</div>
        <textarea value={soldierNotes} onChange={e=>setSoldierNotes(e.target.value)}
         style={{...S.input,minHeight:60,resize:"vertical",fontFamily:"inherit"}}
         placeholder="הערות על החייל..."></textarea> </div>
       <button onClick={saveSoldierDetails} disabled={saving}
        style={S.btnPrimary}>
        {saving?"שומר...":"💾 שמור פרטי חייל"} </button> </div> )}
     
     {tab==="security" && (
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
       <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:8,
        padding:"10px 14px",fontSize:12,color:"#93c5fd"}}>
        🔒 סיסמה מוצפנת עם SHA-256. לא מאוחסנת בטקסט פתוח. </div>
       {[["סיסמה נוכחית",oldPwd,setOldPwd],
        ["סיסמה חדשה (לפחות 6 תווים)",newPwd,setNewPwd],
        ["אימות סיסמה חדשה",newPwd2,setNewPwd2]
       ].map(([lbl,val,set])=>(
        <div key={lbl}>
         <div style={S.label}>{lbl}</div>
         <input value={val} onChange={e=>set(e.target.value)}
          type={showPwd?"text":"password"} style={S.input} placeholder="••••••••"/> </div>
       ))}
       {newPwd && newPwd2 && newPwd!==newPwd2 &&
        <div style={{color:"#f87171",fontSize:12}}>⚠ הסיסמאות אינן תואמות</div>}
       <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:"#64748b"}}>
        <input type="checkbox" checked={showPwd} onChange={e=>setShowPwd(e.target.checked)} style={{accentColor:"#3b82f6"}}/>
        הצג סיסמאות </label>
       <button onClick={changePassword}
        disabled={saving||!oldPwd||!newPwd||newPwd!==newPwd2||newPwd.length<6}
        style={{...S.btnPrimary,opacity:(oldPwd&&newPwd&&newPwd===newPwd2&&newPwd.length>=6)?1:0.4}}>
        {saving?"שומר...":"🔑 שנה סיסמה"} </button> </div> )}
     
     {tab==="stats" && (
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
       {!linkedSoldier ? (
        <div style={{textAlign:"center",padding:32,color:"#64748b"}}>
         👤 חשבונך אינו מקושר לחייל. פנה למנהל לקישור. </div>
       ) : (
        <>
         <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[
           ["📋","ימי נוכחות",`${stats.presenceDays} ימים`,"#93c5fd"],
           ["⏱","שעות שיבוץ",`${stats.hours.toFixed(1)}ש'`,"#c4b5fd"],
           ["🔄","משמרות",`${stats.shifts}`,"#4ade80"],
           ["🏅","הסמכות",(linkedSoldier.certifications||[]).length > 0
            ? (linkedSoldier.certifications||[]).map(c=>CERT_LABELS[c]||c).join("، ")
            : "אין","#fb923c"],
          ].map(([icon,label,val,color])=>(
           <div key={label} style={{background:"#080c14",border:"1px solid #1e293b",
            borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>{icon} {label}</div>
            <div style={{fontSize:13,fontWeight:600,color,wordBreak:"break-word"}}>{val}</div> </div>
          ))} </div>
         {Object.keys(stats.missions).length > 0 && (
          <div>
           <div style={{fontSize:13,color:"#64748b",marginBottom:8}}>פילוח משימות:</div>
           {Object.entries(stats.missions).sort((a,b)=>b[1]-a[1]).map(([m,c])=>{
            const mx=Math.max(...Object.values(stats.missions));
            return (
             <div key={m} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <div style={{width:80,fontSize:12,color:"#e2e8f0",textAlign:"right",flexShrink:0}}>{m}</div>
              <div style={{flex:1,height:10,background:"#06090f",borderRadius:5,overflow:"hidden",border:"1px solid #1e293b"}}>
               <div style={{height:"100%",width:`${Math.round(c/mx*100)}%`,background:"#3b82f6",borderRadius:5}}/>
              </div>
              <span style={{fontSize:12,color:"#93c5fd",width:24,textAlign:"left"}}>{c}×</span> </div> );
           })} </div> )} </> )} </div> )} </div> </div> </div> ); }
export default function App() {
 return <ErrorBoundary><AppInner /></ErrorBoundary>; }
function LoadingScreen() {
 return (
  <div style={S.loadWrap}>
   <style>{globalCSS}</style>
   <div style={S.loadContent}>
    <div style={S.loadGlyph}>⚔</div>
    <div style={S.loadBar}><div style={S.loadProgress}/></div>
    <div style={S.loadText}>INITIALIZING SYSTEM...</div> </div> </div> ); }
/* ===========================================================
 LOGIN SCREEN
=========================================================== */
function LoginScreen({ onLogin, usersExist }) {
 const [email, setEmail]       = useState("");
 const [password, setPassword] = useState("");
 const [status, setStatus]     = useState(null);
 const [errMsg, setErrMsg]     = useState("");
 const [scanLine, setScanLine] = useState(0);
 useEffect(() => {
  const i = setInterval(() => setScanLine(l => (l+1)%100), 40);
  return () => clearInterval(i);
 }, []);
 async function submit() {
  if (!email.includes("@") || !password) return;
  setStatus("loading"); setErrMsg("");
  const res = await onLogin(email, password);
  if (res === "ok") { setStatus(null); return; }
  setStatus("error");
  if (res === "wrong_password") setErrMsg("סיסמה שגויה. נסה שוב.");
  else if (res === "unknown")   setErrMsg("משתמש לא קיים. פנה למנהל המערכת.");
  else if (res === "blocked")   setErrMsg("חשבון זה חסום. פנה למנהל המערכת.");
  else if (res === "pending")   setErrMsg("הגישה ממתינה לאישור מנהל.");
  else setErrMsg("שגיאת כניסה. נסה שוב."); }
 return (
  <div style={S.loginWrap}>
   <style>{globalCSS}</style>
   <div style={S.gridBg}/>
   <div style={{ ...S.scanLine, top:`${scanLine}%` }}/>
   <div style={S.loginCard} className="loginCard">
    <div style={S.loginGlyph}>⚔</div>
    <div style={S.loginTitle}>TACTICAL OPS</div>
    <div style={S.loginSubtitle}>מערכת שיבוץ מבצעי</div>
    {!usersExist && (
     <div style={S.firstUserNote}>
      🔑 ראשון מגדיר את הסיסמה שלו ויהפוך למנהל מערכת </div> )}
    <div style={S.loginForm}>
     <div style={S.inputGroup}>
      <label style={S.loginLabel}>כתובת אימייל</label>
      <input value={email} onChange={e=>{setEmail(e.target.value);setStatus(null);}}
       style={S.loginInput} placeholder="your@email.com" type="email"
       onKeyDown={e=>e.key==="Enter"&&submit()} autoFocus/> </div>
     <div style={S.inputGroup}>
      <label style={S.loginLabel}>
       סיסמה
       {!usersExist && <span style={{color:"#64748b",fontSize:11,marginRight:6}}>(הגדר סיסמה חדשה)</span>} </label>
      <input value={password} onChange={e=>{setPassword(e.target.value);setStatus(null);}}
       style={S.loginInput} placeholder={usersExist ? "הכנס סיסמה..." : "בחר סיסמה..."}
       type="password" onKeyDown={e=>e.key==="Enter"&&submit()}/> </div>
     {errMsg && (
      <div style={{background:"#1f0a0a",border:"1px solid #f87171",borderRadius:8,
       padding:"8px 12px",color:"#f87171",fontSize:13,textAlign:"center"}}>
       {errMsg} </div> )}
     <button onClick={submit}
      disabled={status==="loading" || !email.includes("@") || !password}
      style={{ ...S.loginBtn, opacity:(!email.includes("@")||!password)?0.4:1 }}>
      {status==="loading" ? <span className="spin">◌</span> : "כניסה למערכת →"} </button>
     {usersExist && (
      <div style={{textAlign:"center",fontSize:12,color:"#475569",marginTop:4}}>
       אין לך חשבון? פנה למנהל המערכת </div> )} </div> </div>
   <div style={S.loginFooter}>SECURE MILITARY OPERATIONS PLATFORM • v2.0</div> </div> ); }
/* ===========================================================
 NEW DEP BUTTON
=========================================================== */
function RegisterScreen({ onRegister, inviteData }) {
 const [name, setName]     = useState("");
 const [email, setEmail]   = useState("");
 const [password, setPassword] = useState("");
 const [password2,setPassword2]= useState("");
 const [status, setStatus] = useState(null);
 const [errMsg, setErrMsg] = useState("");
 const [scanLine, setScanLine] = useState(0);
 useEffect(() => {
  const i = setInterval(() => setScanLine(l => (l+1)%100), 40);
  return () => clearInterval(i);
 }, []);
 async function submit() {
  if (!name.trim() || !email.includes("@") || !password || password !== password2) return;
  if (password.length < 6) { setErrMsg("סיסמה חייבת להיות לפחות 6 תווים"); return; }
  setStatus("loading"); setErrMsg("");
  const res = await onRegister(name.trim(), email, password);
  if (res === "ok") return;
  setStatus(null);
  if (res === "exists") setErrMsg("אימייל כבר רשום במערכת. נסה להתחבר.");
  else setErrMsg("שגיאה בהרשמה. נסה שוב."); }
 return (
  <div style={S.loginWrap}>
   <style>{globalCSS}</style>
   <div style={S.gridBg}/>
   <div style={{ ...S.scanLine, top:`${scanLine}%` }}/>
   <div style={S.loginCard} className="loginCard">
    <div style={S.loginGlyph}>🔗</div>
    <div style={S.loginTitle}>הצטרפות</div>
    <div style={S.loginSubtitle}>הרשמה למערכת שיבוץ מבצעי</div>
    {inviteData?.defaultRole && (
     <div style={S.firstUserNote}>
      תצורף כ: {ROLE_LABELS[inviteData.defaultRole] || inviteData.defaultRole} </div> )}
    <div style={S.loginForm}>
     {[
      ["שם מלא", name, setName, "text", "השם שלך..."],
      ["אימייל", email, setEmail, "email", "your@email.com"],
      ["סיסמה (לפחות 6 תווים)", password, setPassword, "password", "בחר סיסמה..."],
      ["אימות סיסמה", password2, setPassword2, "password", "חזור על הסיסמה..."],
     ].map(([label, val, set, type, ph]) => (
      <div key={label} style={S.inputGroup}>
       <label style={S.loginLabel}>{label}</label>
       <input value={val} onChange={e=>{set(e.target.value);setErrMsg("");}}
        type={type} style={S.loginInput} placeholder={ph}
        onKeyDown={e=>e.key==="Enter"&&submit()}/> </div>
     ))}
     {password && password2 && password !== password2 && (
      <div style={{color:"#f87171",fontSize:12,textAlign:"center"}}>⚠ הסיסמאות אינן תואמות</div> )}
     {errMsg && (
      <div style={{background:"#1f0a0a",border:"1px solid #f87171",borderRadius:8,
       padding:"8px 12px",color:"#f87171",fontSize:13,textAlign:"center"}}>
       {errMsg} </div> )}
     <button onClick={submit}
      disabled={status==="loading" || !name.trim() || !email.includes("@") || !password || password!==password2}
      style={{...S.loginBtn, opacity:(!name.trim()||!email.includes("@")||!password||password!==password2)?0.4:1}}>
      {status==="loading" ? <span className="spin">◌</span> : "הצטרף למערכת →"} </button> </div> </div>
   <div style={S.loginFooter}>SECURE MILITARY OPERATIONS PLATFORM • v2.0</div> </div> ); }
function NewDepButton({ onAdd }) {
 const [open, setOpen] = useState(false);
 const [name, setName] = useState("");
 if (!open) return <button onClick={()=>setOpen(true)} style={S.depAddBtn}>+ תעסוקה</button>;
 return (
  <div style={{display:"flex",gap:6,alignItems:"center"}}>
   <input value={name} onChange={e=>setName(e.target.value)} placeholder="שם תעסוקה"
    style={{...S.loginInput,padding:"5px 10px",fontSize:13,width:130}} autoFocus
    onKeyDown={e=>{ if(e.key==="Enter"&&name.trim()){onAdd(name.trim());setName("");setOpen(false);} }}/>
   <button onClick={()=>{if(name.trim()){onAdd(name.trim());setName("");setOpen(false);}}} style={{...S.btnPrimary,padding:"5px 12px",fontSize:12}}>צור</button>
   <button onClick={()=>setOpen(false)} style={{...S.btnGhost,padding:"5px 10px",fontSize:12}}>✕</button> </div> ); }
function EmptyState({ onNew, canCreate }) {
 const [name, setName] = useState("");
 return (
  <div style={S.emptyWrap}>
   <div style={S.emptyGlyph}>⚔</div>
   <h2 style={S.emptyTitle}>אין תעסוקה פעילה</h2>
   {canCreate ? (
    <div style={{display:"flex",gap:8,marginTop:20}}>
     <input value={name} onChange={e=>setName(e.target.value)} placeholder="שם תעסוקה חדשה"
      style={{...S.loginInput,width:220}} />
     <button onClick={()=>{if(name.trim())onNew(name.trim());}} style={S.btnPrimary}>צור תעסוקה</button> </div>
   ) : (
    <p style={{color:"#64748b"}}>ממתין למנהל שיצור תעסוקה</p> )} </div> ); }
/* ===========================================================
 SOLDIERS TAB
=========================================================== */
function SoldiersTab({ dep, updateDep, notify }) {
 const empty = { id:"",name:"",role:"חייל",phone:"",notes:"",certifications:[] };
 const [form, setForm] = useState(empty);
 const [editing, setEditing] = useState(null);
 const [showForm, setShowForm] = useState(false);
 const [search, setSearch] = useState("");
 const [filterRole, setFilterRole] = useState("");
 function save() {
  if(!form.name.trim()) return;
  if(editing) updateDep(d=>({...d,soldiers:d.soldiers.map(s=>s.id===editing?{...form}:s)}));
  else updateDep(d=>({...d,soldiers:[...d.soldiers,{...form,id:uid()}]}));
  notify(editing?"חייל עודכן":"חייל נוסף","success");
  setForm(empty); setShowForm(false); setEditing(null); }
 function del(id) { updateDep(d=>({...d,soldiers:d.soldiers.filter(s=>s.id!==id)})); notify("חייל הוסר","success"); }
 function edit(s) { setForm({...s}); setEditing(s.id); setShowForm(true); }
 function toggleCert(c) { setForm(f=>({...f,certifications:f.certifications.includes(c)?f.certifications.filter(x=>x!==c):[...f.certifications,c]})); }
 const filtered = dep.soldiers.filter(s =>
  (!search || s.name.includes(search)||s.role.includes(search)) &&
  (!filterRole || s.role===filterRole) );
 return (
  <div>
   <PanelHeader title="חיילים" icon="👤" count={dep.soldiers.length} countLabel="חיילים">
    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 חיפוש..." style={{...S.input,width:150}}/>
    <select value={filterRole} onChange={e=>setFilterRole(e.target.value)} style={{...S.select,width:130}}>
     <option value="">כל התפקידים</option>
     {SOLDIER_ROLES.map(r=><option key={r}>{r}</option>)} </select>
    <button onClick={()=>{setForm(empty);setEditing(null);setShowForm(true)}} style={S.btnPrimary}>+ חייל חדש</button>
   </PanelHeader>
   {showForm && (
    <FormCard title={editing?"עריכת חייל":"חייל חדש"} onClose={()=>{setShowForm(false);setEditing(null);setForm(empty);}}>
     <div style={S.formGrid}>
      <FormField label="שם מלא *">
       <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={S.input} placeholder="הכנס שם..."/>
      </FormField>
      <FormField label="תפקיד">
       <select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} style={S.select}>
        {SOLDIER_ROLES.map(r=><option key={r}>{r}</option>)} </select>
      </FormField>
      <FormField label="טלפון">
       <input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} style={S.input} placeholder="050-..."/>
      </FormField>
      <FormField label="הערות">
       <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={S.input} placeholder="הערה קצרה..."/>
      </FormField> </div>
     <FormField label="הסמכות">
      <CertPicker value={form.certifications} onChange={certs=>setForm(f=>({...f,certifications:certs}))}/>
     </FormField>
     <div style={S.formActions}>
      <button onClick={save} style={S.btnPrimary}>💾 שמור</button>
      <button onClick={()=>{setShowForm(false);setEditing(null);setForm(empty)}} style={S.btnGhost}>ביטול</button>
     </div>
    </FormCard> )}
   <div style={S.tableWrap}>
    <table style={S.table}>
     <thead><tr>{["שם","תפקיד","טלפון","הסמכות","הערות",""].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
     <tbody>
      {filtered.map((s,i)=>(
       <tr key={s.id} style={{...S.tr,...(i%2===0?S.trAlt:{})}}><td style={S.td}><strong style={{color:"#e2e8f0"}}>{s.name}</strong></td><td style={S.td}><RoleBadge role={s.role}/></td><td style={S.td}>{s.phone||"—"}</td><td style={S.td}><CertList certs={s.certifications}/></td><td style={S.td}><span style={{color:"#94a3b8",fontSize:12}}>{s.notes||"—"}</span></td><td style={S.td}>
         <button onClick={()=>edit(s)} style={S.iconBtn} title="ערוך">✏️</button>
         <button onClick={()=>del(s.id)} style={S.iconBtn} title="מחק">🗑️</button></td></tr>
      ))}
      {filtered.length===0&&<tr><td colSpan={6} style={S.emptyCell}>אין חיילים</td></tr>}
     </tbody>
    </table> </div> </div> ); }
/* ===========================================================
 MISSIONS TAB
=========================================================== */
function MissionsTab({ dep, updateDep, notify }) {
 const emptyM = { id:"",name:"",startDate:todayStr(),startTime:"06:00",endDate:todayStr(),endTime:"06:00",numShifts:1,soldiersPerShift:2,minSpecialRoles:0,mandatoryRoles:[],requiredCerts:[],countMission:true,location:"",priority:"normal",shifts:[] };
 const [form, setForm] = useState(emptyM);
 const [editing, setEditing] = useState(null);
 const [showForm, setShowForm] = useState(false);
 const [expanded, setExpanded] = useState(null);
 function computeMissionShifts(f) {
  const n = f.numShifts || 1;
  const startM = timeToMins(f.startTime);
  const endM   = timeToMins(f.endTime);
  const [sy,smo,sd] = (f.startDate||"").split("-").map(Number);
  const [ey,emo,ed] = (f.endDate||"").split("-").map(Number);
  const dayDiff = Math.round(
   (Date.UTC(ey,emo-1,ed) - Date.UTC(sy,smo-1,sd)) / 86400000 );
  const totalMins = dayDiff * 1440 + (endM - startM);
  if (totalMins <= 0) return [];
  const cycleMins = totalMins >= 1440 ? 1440 : totalMins;
  const shiftMins = cycleMins / n;
  const totalShifts = Math.round(totalMins / shiftMins);
  function addDays(dateStr, days) {
   const [y,mo,d] = dateStr.split("-").map(Number);
   const t = Date.UTC(y, mo-1, d) + days * 86400000;
   const dt = new Date(t);
   return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,"0")}-${String(dt.getUTCDate()).padStart(2,"0")}`;
  }
  function minsToTime(totalMinsVal) {
   const wrapped = ((Math.round(totalMinsVal) % 1440) + 1440) % 1440;
   return `${String(Math.floor(wrapped/60)).padStart(2,"0")}:${String(wrapped%60).padStart(2,"0")}`; }
  const shifts = [];
  for (let i = 0; i < totalShifts; i++) {
   const startOffsetMins = i * shiftMins;
   const endOffsetMins   = (i === totalShifts - 1) ? totalMins : (i + 1) * shiftMins;
   const absStart = startM + startOffsetMins;
   const absEnd   = startM + endOffsetMins;
   const startDayOffset = Math.floor(startOffsetMins / 1440);
   const endDayOffset   = Math.floor(endOffsetMins   / 1440);
   shifts.push({
    start:      minsToTime(absStart),
    end:        minsToTime(absEnd),
    startDate:  addDays(f.startDate, startDayOffset),
    endDate:    addDays(f.startDate, endDayOffset),
    dayNum:     startDayOffset + 1,
    shiftOfDay: (i % n) + 1,
   }); }
  return shifts; }
 function save() {
  if(!form.name.trim()) return;
  const m={...form,shifts:computeMissionShifts(form),id:editing||uid()};
  if(editing) updateDep(d=>({...d,missions:d.missions.map(x=>x.id===editing?m:x)}));
  else updateDep(d=>({...d,missions:[...d.missions,m]}));
  notify(editing?"משימה עודכנה":"משימה נוספה");
  setForm(emptyM);setShowForm(false);setEditing(null); }
 const PRIORITIES = {high:{label:"דחוף",bg:"#3d1515",color:"#f87171"},normal:{label:"רגיל",bg:"#1e293b",color:"#94a3b8"},low:{label:"נמוך",bg:"#0a1f0a",color:"#4ade80"}};
 return (
  <div>
   <PanelHeader title="משימות" icon="🎯" count={dep.missions.length} countLabel="משימות">
    <button onClick={()=>{setForm(emptyM);setEditing(null);setShowForm(true)}} style={S.btnPrimary}>+ משימה חדשה</button>
   </PanelHeader>
   {showForm && (
    <FormCard title={editing?"עריכת משימה":"משימה חדשה"} onClose={()=>{setShowForm(false);setEditing(null);}}>
     <div style={S.formGrid}>
      <FormField label="שם משימה *" wide>
       <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={S.input} placeholder="שם המשימה..."/>
      </FormField>
      <FormField label="מיקום">
       <input value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} style={S.input} placeholder="מיקום..."/>
      </FormField>
      <FormField label="עדיפות">
       <select value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))} style={S.select}>
        <option value="high">דחוף</option>
        <option value="normal">רגיל</option>
        <option value="low">נמוך</option> </select>
      </FormField>
      <FormField label="תאריך התחלה"><input type="date" value={form.startDate} onChange={e=>setForm(f=>({...f,startDate:e.target.value}))} style={S.input}/></FormField>
      <FormField label="שעת התחלה"><input type="time" value={form.startTime} onChange={e=>setForm(f=>({...f,startTime:e.target.value}))} style={S.input}/></FormField>
      <FormField label="תאריך סיום"><input type="date" value={form.endDate} onChange={e=>setForm(f=>({...f,endDate:e.target.value}))} style={S.input}/></FormField>
      <FormField label="שעת סיום"><input type="time" value={form.endTime} onChange={e=>setForm(f=>({...f,endTime:e.target.value}))} style={S.input}/></FormField>
      <FormField label="מספר משמרות"><input type="number" min={1} max={24} value={form.numShifts} onChange={e=>setForm(f=>({...f,numShifts:+e.target.value}))} style={S.input}/></FormField>
      <FormField label="חיילים למשמרת"><input type="number" min={1} max={20} value={form.soldiersPerShift} onChange={e=>setForm(f=>({...f,soldiersPerShift:+e.target.value}))} style={S.input}/></FormField>
      <FormField label="דרישות תפקיד" wide>
       <div style={{display:"flex",flexDirection:"column",gap:12}}>
        
        <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
         <div style={{display:"flex",alignItems:"center",gap:8}}>
          <label style={{...S.label,whiteSpace:"nowrap"}}>מינימום בעלי תפקיד מיוחד:</label>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
           <button onClick={()=>setForm(f=>({...f,minSpecialRoles:Math.max(0,(f.minSpecialRoles||0)-1)}))}
            style={{width:28,height:28,borderRadius:6,border:"1px solid #1e293b",background:"#06090f",color:"#94a3b8",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
           <span style={{width:32,textAlign:"center",fontSize:16,fontWeight:700,color:(form.minSpecialRoles||0)>0?"#fbbf24":"#475569"}}>
            {form.minSpecialRoles||0} </span>
           <button onClick={()=>setForm(f=>({...f,minSpecialRoles:Math.min(f.soldiersPerShift||1,(f.minSpecialRoles||0)+1)}))}
            style={{width:28,height:28,borderRadius:6,border:"1px solid #1e293b",background:"#06090f",color:"#94a3b8",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
          </div>
          <span style={{color:"#475569",fontSize:11}}>מתוך {form.soldiersPerShift||1} חיילים</span> </div>
         {(form.minSpecialRoles||0)>0&&(
          <span style={{fontSize:11,color:"#fbbf24",background:"#2a1f0a",padding:"3px 10px",borderRadius:8,border:"1px solid #d97706"}}>
           ⭐ לפחות {form.minSpecialRoles} מתוך: סמל / מפקד / מפקד משימה / קצין </span> )} </div>
        
        <div>
         <div style={{color:"#93c5fd",fontSize:11,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
          <span>🎖 תפקיד חובה</span>
          <span style={{color:"#334155",fontSize:10}}>— חייב שיהיה לפחות אחד כזה בכל משמרת</span> </div>
         <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {SPECIAL_ROLES.map(r=>{
           const on=(form.mandatoryRoles||[]).includes(r);
           const maxReached=(form.mandatoryRoles||[]).length>=(form.soldiersPerShift||1);
           return (
            <button key={r} onClick={()=>{
             const cur=form.mandatoryRoles||[];
             if(on) setForm(f=>({...f,mandatoryRoles:cur.filter(x=>x!==r)}));
             else if(!maxReached) {
              const newMandatory=[...cur,r];
              setForm(f=>({...f,mandatoryRoles:newMandatory,
               minSpecialRoles:Math.max(f.minSpecialRoles||0,newMandatory.length)})); }
            }} disabled={!on&&maxReached}
            style={{padding:"5px 14px",borderRadius:10,
             border:`1px solid ${on?"#3b82f6":"#1e293b"}`,
             background:on?"#0d1f3c":"transparent",
             color:on?"#93c5fd":"#475569",
             cursor:(!on&&maxReached)?"not-allowed":"pointer",
             fontSize:12,fontWeight:on?700:400,
             opacity:(!on&&maxReached)?0.4:1}}>
             {r}{on?" 🎖":""} </button> );
          })} </div> </div>
        
        {((form.minSpecialRoles||0)>0||(form.mandatoryRoles||[]).length>0)&&(
         <div style={{background:"#06090f",borderRadius:6,padding:"8px 12px",border:"1px solid #1e293b",fontSize:11,color:"#64748b",display:"flex",flexWrap:"wrap",gap:10}}>
          {(form.minSpecialRoles||0)>0&&(
           <span>⭐ לפחות <strong style={{color:"#fbbf24"}}>{form.minSpecialRoles}</strong> בעלי תפקיד מיוחד</span> )}
          {(form.mandatoryRoles||[]).length>0&&(
           <span>🎖 חובה: {(form.mandatoryRoles||[]).map(r=><strong key={r} style={{color:"#93c5fd",marginRight:4}}>{r}</strong>)}</span>
          )}
          {(form.minSpecialRoles||0)===0&&(form.mandatoryRoles||[]).length===0&&(
           <span style={{color:"#334155"}}>ללא דרישות תפקיד</span> )} </div> )} </div>
      </FormField> </div>
     <FormField label="הסמכה נדרשת">
      <CertPicker value={form.requiredCerts} onChange={c=>setForm(f=>({...f,requiredCerts:c}))}/>
     </FormField>
     <div style={{display:"flex",alignItems:"center",gap:16,marginTop:12}}>
      <label style={S.label}>ספירת משימות:</label>
      <ToggleBtn on={form.countMission} onChange={v=>setForm(f=>({...f,countMission:v}))} label={form.countMission?"כן":"לא"}/>
      <span style={{color:"#64748b",fontSize:12}}>האם לצבור ספירת משימות לחיילים?</span> </div>
     
     {form.numShifts>=1 && form.startDate && form.endDate && (
      <div style={{marginTop:12,padding:10,background:"#0a0e18",borderRadius:8,border:"1px solid #1e293b"}}>
       {(() => {
        const allShifts = computeMissionShifts(form);
        const totalDays = Math.round((new Date(`${form.endDate}T${form.endTime}`) - new Date(`${form.startDate}T${form.startTime}`)) / 86400000) || 1;
        const shiftMins = allShifts.length > 0 ? Math.round((new Date(`${form.endDate}T${form.endTime}`) - new Date(`${form.startDate}T${form.startTime}`)) / 60000 / allShifts.length) : 0;
        const hrs = Math.floor(shiftMins/60), mins2 = shiftMins%60;
        return <>
         <div style={{color:"#4ade80",fontSize:12,marginBottom:8,display:"flex",gap:12,flexWrap:"wrap"}}>
          <span>📅 {totalDays} ימים × {form.numShifts} משמרות = <strong>{allShifts.length} משמרות סה"כ</strong></span>
          <span>⏱ {hrs>0?`${hrs}ש' `:""}{ mins2>0?`${mins2}ד'`:""} למשמרת</span> </div>
         
         {Array.from({length:totalDays},(_,dayIdx)=>{
          const dayShifts = allShifts.filter(sh=>sh.dayNum===dayIdx+1);
          if(!dayShifts.length) return null;
          return (
           <div key={dayIdx} style={{marginBottom:6}}>
            <div style={{color:"#64748b",fontSize:11,marginBottom:4}}>יום {dayIdx+1} ({fmtDate(dayShifts[0].startDate)}):</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
             {dayShifts.map((sh,i)=><span key={i} style={S.shiftPreview}>משמרת {sh.shiftOfDay}: {sh.start}–{sh.end}</span>)}
            </div> </div> );
         })}
        </>;
       })()} </div> )}
     <div style={S.formActions}>
      <button onClick={save} style={S.btnPrimary}>💾 שמור</button>
      <button onClick={()=>{setShowForm(false);setEditing(null)}} style={S.btnGhost}>ביטול</button> </div>
    </FormCard> )}
   <div style={{display:"flex",flexDirection:"column",gap:10}}>
    {dep.missions.map(m=>{
     const pri=PRIORITIES[m.priority||"normal"];
     return (
      <div key={m.id} style={{...S.mCard,borderRight:`3px solid ${pri.color}`}}>
       <div style={S.mCardTop}>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
         <span style={{fontSize:15,fontWeight:700,color:"#e2e8f0"}}>{m.name}</span>
         <span style={{...S.badge,background:pri.bg,color:pri.color}}>{pri.label}</span>
         {m.location&&<span style={{...S.badge,background:"#1e293b",color:"#94a3b8"}}>📍 {m.location}</span>}
         {m.countMission&&<span style={{...S.badge,background:"#2d1b69",color:"#c4b5fd"}}>📊 נספר</span>} </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
         <span style={S.badge}>{fmtDate(m.startDate)} {m.startTime} → {fmtDate(m.endDate)} {m.endTime}</span>
         <span style={S.badge}>🔄 {m.numShifts} משמרות/יום × {m.shifts?.length||0} סה"כ × 👥 {m.soldiersPerShift}</span>
         {m.requiredRole&&<RoleBadge role={m.requiredRole} suffix="+"/>}
         {(m.minSpecialRoles||0)>0&&(
          <span style={{padding:"2px 9px",borderRadius:8,background:"#2a1f0a",color:"#fbbf24",fontSize:11,border:"1px solid #d97706"}}>
           ⭐ ×{m.minSpecialRoles} מיוחד </span> )}
         {(m.mandatoryRoles||[]).length>0&&(
          <span style={{display:"inline-flex",gap:3,alignItems:"center"}}>
           <span style={{fontSize:10,color:"#93c5fd",marginLeft:2}}>🎖</span>
           {(m.mandatoryRoles||[]).map(r=><RoleBadge key={r} role={r}/>)} </span> )}
         <CertList certs={m.requiredCerts}/>
         <button onClick={()=>setExpanded(expanded===m.id?null:m.id)} style={S.iconBtn}>{expanded===m.id?"🔼":"🔽"}</button>
         <button onClick={()=>{setForm({...m});setEditing(m.id);setShowForm(true)}} style={S.iconBtn}>✏️</button>
         <button onClick={()=>{updateDep(d=>({...d,missions:d.missions.filter(x=>x.id!==m.id)}));notify("משימה הוסרה")}} style={S.iconBtn}>🗑️</button>
        </div> </div>
       {expanded===m.id&&(
        <div style={{marginTop:10}}>
         {(() => {
          const shifts = m.shifts||[];
          const days = [...new Set(shifts.map(sh=>sh.dayNum||1))];
          return days.map(d=>{
           const dayShifts = shifts.filter(sh=>(sh.dayNum||1)===d);
           return (
            <div key={d} style={{marginBottom:6}}>
             <span style={{color:"#64748b",fontSize:11,marginLeft:6}}>יום {d}{dayShifts[0]?.startDate?` (${fmtDate(dayShifts[0].startDate)})`:""}: </span>
             <span style={{display:"inline-flex",gap:4,flexWrap:"wrap"}}>
              {dayShifts.map((sh,i)=><span key={i} style={S.shiftPreview}>מ{sh.shiftOfDay||i+1}: {sh.start}–{sh.end}</span>)}
             </span> </div> );
          });
         })()} </div> )} </div> );
    })}
    {dep.missions.length===0&&<EmptyMsg>אין משימות. הוסף משימה חדשה.</EmptyMsg>} </div> </div> ); }
/* ===========================================================
 ATTENDANCE TAB
=========================================================== */
function AttendanceTab({ dep, updateDep, notify }) {
 const [selectedDate, setSelectedDate] = useState(todayStr());
 const [addDateVal, setAddDateVal]     = useState("");
 const [view, setView]                 = useState("table");
 const [search, setSearch]             = useState("");
 const [filterStatus, setFilterStatus] = useState("");
 const att   = dep.attendance||{};
 const rec   = att[selectedDate]||{};
 const allDates = Array.from(new Set([todayStr(),...Object.keys(att)])).sort().reverse();
 function setField(id, field, value) {
  updateDep(d => {
   const prev    = d.attendance?.[selectedDate]?.[id];
   const prevObj = typeof prev === "string"
    ? { status: prev, note: "", from: "10:00", to: "10:00" }
    : { status: "unknown", note: "", from: "10:00", to: "10:00", ...(prev||{}) };
   return { ...d, attendance: { ...d.attendance, [selectedDate]: {
    ...(d.attendance[selectedDate]||{}),
    [id]: { ...prevObj, [field]: value }
   }}};
  }); }
 function mark(id, status) { setField(id, "status", status); }
 const presentIds = dep.soldiers.filter(s=>getAttStatus(rec[s.id])==="present").map(s=>s.id);
 const absentIds  = dep.soldiers.filter(s=>getAttStatus(rec[s.id])==="absent").map(s=>s.id);
 const unknownCnt = dep.soldiers.length - presentIds.length - absentIds.length;
 const nextDay    = (() => { const d=new Date(selectedDate); d.setDate(d.getDate()+1); return d.toISOString().split("T")[0]; })();
 const filteredSoldiers = dep.soldiers.filter(s => {
  if (search && !s.name.includes(search) && !s.role.includes(search)) return false;
  if (filterStatus) {
   const st = getAttStatus(rec[s.id]);
   if (filterStatus === "unknown" && st !== "unknown") return false;
   if (filterStatus !== "unknown" && st !== filterStatus) return false; }
  return true;
 });
 const soldierPresenceCounts = {};
 dep.soldiers.forEach(s => { soldierPresenceCounts[s.id] = 0; });
 Object.entries(att).forEach(([date, dayRec]) => {
  dep.soldiers.forEach(s => {
   if (getAttStatus(dayRec[s.id]) === "present") soldierPresenceCounts[s.id]++;
  });
 });
 const totalDaysRecorded = allDates.length;
 function exportAttendancePDF() {
  const presentList = dep.soldiers.filter(s => getAttStatus(rec[s.id]) === "present");
  const absentList  = dep.soldiers.filter(s => getAttStatus(rec[s.id]) === "absent");
  const unknownList = dep.soldiers.filter(s => {
   const st = getAttStatus(rec[s.id]);
   return st !== "present" && st !== "absent";
  });
  const sRow = (s, statusLabel, color) => {
   const val  = rec[s.id];
   const note = getAttField(val,"note","");
   const from = getAttField(val,"from","10:00");
   const to   = getAttField(val,"to","10:00");
   const hours = from !== to ? `${from}–${to}` : "כל היום";
   return `<tr>
    <td style="padding:6px 12px;border:1px solid #e2e8f0;font-weight:600">${s.name}</td>
    <td style="padding:6px 12px;border:1px solid #e2e8f0;color:#64748b">${s.role}</td>
    <td style="padding:6px 12px;border:1px solid #e2e8f0;color:${color};font-weight:700">${statusLabel}</td>
    <td style="padding:6px 12px;border:1px solid #e2e8f0;font-family:monospace">${statusLabel==="בבסיס"?hours:"—"}</td>
    <td style="padding:6px 12px;border:1px solid #e2e8f0;color:#64748b;font-size:12px">${note||"—"}</td>
   </tr>`; };
  const allRows = [
   ...presentList.map(s=>sRow(s,"בבסיס","#16a34a")),
   ...absentList.map(s=>sRow(s,"בבית","#dc2626")),
   ...unknownList.map(s=>sRow(s,"לא ידוע","#d97706")),
  ].join("");
  const html = `<!DOCTYPE html><html dir="rtl"><head>
   <meta charset="utf-8">
   <title>נוכחות ${fmtDate(selectedDate)}</title>
   <style>
    *{box-sizing:border-box} body{font-family:Arial,sans-serif;padding:28px;direction:rtl;color:#111;font-size:13px}
    h1{font-size:20px;margin:0 0 4px} .meta{color:#666;font-size:12px;margin-bottom:20px;border-bottom:1px solid #ddd;padding-bottom:10px}
    table{width:100%;border-collapse:collapse} th{background:#1b3a2a;color:#fff;padding:8px 12px;text-align:right}
    .stat-box{display:inline-block;padding:10px 20px;margin:6px;border-radius:8px;text-align:center}
    @media print{body{padding:10px} @page{margin:15mm}}
   </style></head><body>
   <h1>📋 דו"ח נוכחות — ${fmtDate(selectedDate)}</h1>
   <div class="meta">
    הופק: ${new Date().toLocaleString("he-IL")} &nbsp;|&nbsp;
    תעסוקה: ${dep.name} &nbsp;|&nbsp;
    סה"כ חיילים: ${dep.soldiers.length} </div>
   <div style="margin-bottom:20px">
    <div class="stat-box" style="background:#dcfce7;color:#15803d"><strong style="font-size:22px">${presentList.length}</strong><br>בבסיס</div>
    <div class="stat-box" style="background:#fee2e2;color:#dc2626"><strong style="font-size:22px">${absentList.length}</strong><br>בבית</div>
    <div class="stat-box" style="background:#fef9c3;color:#d97706"><strong style="font-size:22px">${unknownList.length}</strong><br>לא ידוע</div>
   </div>
   <table>
    <thead><tr><th>שם</th><th>תפקיד</th><th>סטטוס</th><th>שעות נוכחות</th><th>הערה</th></tr></thead>
    <tbody>${allRows}</tbody>
   </table>
  </body></html>`;
  const blob = new Blob([html], {type:"text/html;charset=utf-8"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href=url; a.target="_blank"; a.rel="noopener";
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 3000); }
 function copyToClipboard() {
  const lines = ["נוכחות " + fmtDate(selectedDate), ""];
  const present = dep.soldiers.filter(s=>getAttStatus(rec[s.id])==="present");
  const absent  = dep.soldiers.filter(s=>getAttStatus(rec[s.id])==="absent");
  if (present.length) { lines.push("✅ בבסיס:"); present.forEach(s=>{ const note=getAttField(rec[s.id],"note",""); lines.push(`  • ${s.name} (${s.role})${note?" — "+note:""}`); }); }
  if (absent.length)  { lines.push(""); lines.push("❌ בבית:");  absent.forEach(s=>{ const note=getAttField(rec[s.id],"note",""); lines.push(`  • ${s.name}${note?" — "+note:""}`); }); }
  navigator.clipboard?.writeText(lines.join("\n")).then(()=>notify("הועתק ללוח","success")); }
 function exportCSV() {
  const rows = [["שם","תפקיד","סטטוס","מגיע","יוצא","הערה"]];
  dep.soldiers.forEach(s => {
   const val  = rec[s.id];
   const st   = getAttStatus(val);
   rows.push([s.name, s.role, st==="present"?"בבסיס":st==="absent"?"בבית":"לא ידוע",
    getAttField(val,"from",""), getAttField(val,"to",""), getAttField(val,"note","")]);
  });
  const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href=url; a.download=`נוכחות_${selectedDate}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),3000);
  notify("CSV יוצא","success"); }
 return (
  <div>
   <PanelHeader title="נוכחות" icon="📋">
    <StatChip icon="✓" count={presentIds.length} color="#4ade80" bg="#0d3320" label="בבסיס"/>
    <StatChip icon="✗" count={absentIds.length}  color="#f87171" bg="#3d1515" label="בבית"/>
    <StatChip icon="?" count={unknownCnt}         color="#fbbf24" bg="#2a2a1a" label="לא ידוע"/>
    <button onClick={exportAttendancePDF} style={{...S.btnSmall,borderColor:"#7c3aed",color:"#c4b5fd"}}>📄 PDF</button>
    <button onClick={copyToClipboard}     style={{...S.btnSmall,borderColor:"#0891b2",color:"#67e8f9"}}>📋 העתק</button>
    <button onClick={exportCSV}           style={{...S.btnSmall,borderColor:"#16a34a",color:"#4ade80"}}>📊 CSV</button>
   </PanelHeader>
   
   <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
    {allDates.map(d=>(
     <button key={d} onClick={()=>setSelectedDate(d)}
      style={{...S.datePill,...(d===selectedDate?S.datePillActive:{})}}>
      {fmtDate(d)}{d===todayStr()&&<span style={{fontSize:10,color:"#4ade80",marginRight:4}}>היום</span>}
      
      {(() => {
       const p = dep.soldiers.filter(s=>getAttStatus((att[d]||{})[s.id])==="present").length;
       if (!p) return null;
       return <span style={{marginRight:4,fontSize:10,color:"#4ade80"}}>({p}✓)</span>;
      })()} </button>
    ))}
    <div style={{display:"flex",gap:4}}>
     <input type="date" value={addDateVal} onChange={e=>setAddDateVal(e.target.value)} style={{...S.input,padding:"4px 8px",fontSize:12}}/>
     <button onClick={()=>{if(addDateVal){setSelectedDate(addDateVal);updateDep(d=>({...d,attendance:{...d.attendance,[addDateVal]:d.attendance[addDateVal]||{}}}));setAddDateVal("");}}}
      style={{...S.btnPrimary,padding:"4px 10px",fontSize:12}}>+ תאריך</button>
     <button onClick={()=>{
      const dt=new Date(selectedDate+"T00:00:00Z");
      dt.setUTCDate(dt.getUTCDate()+1);
      const next=dt.toISOString().split("T")[0];
      setSelectedDate(next);
      updateDep(d=>({...d,attendance:{...d.attendance,[next]:d.attendance[next]||{}}}));
     }} style={{...S.btnPrimary,padding:"4px 10px",fontSize:12,background:"#1e3a5f"}}>+יום →</button> </div> </div>
   <div style={{color:"#4a5568",fontSize:12,marginBottom:12}}>
    📅 נוכחות מ-10:00 {fmtDate(selectedDate)} עד 10:00 {fmtDate(nextDay)} </div>
   
   <div style={{display:"flex",gap:4,marginBottom:14}}>
    {[["table","📋 טבלה"],["stats","📊 סטטיסטיקות"],["history","📆 היסטוריה"]].map(([id,label])=>(
     <button key={id} onClick={()=>setView(id)}
      style={{...S.btnSmall,...(view===id?{background:"#1e3a5f",borderColor:"#3b82f6",color:"#93c5fd"}:{})}}>
      {label} </button>
    ))} </div>
   
   {view==="table" && <>
    
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
     <button onClick={()=>dep.soldiers.forEach(s=>mark(s.id,"present"))} style={{...S.btnSmall,borderColor:"#4ade80",color:"#4ade80"}}>✓ כולם בבסיס</button>
     <button onClick={()=>dep.soldiers.forEach(s=>mark(s.id,"absent"))}  style={{...S.btnSmall,borderColor:"#f87171",color:"#f87171"}}>✗ כולם בבית</button>
     <button onClick={()=>dep.soldiers.forEach(s=>mark(s.id,null))}      style={S.btnSmall}>↺ נקה הכל</button>
     <div style={{marginRight:"auto",display:"flex",gap:6}}>
      <input placeholder="🔍 חיפוש..." value={search} onChange={e=>setSearch(e.target.value)}
       style={{...S.input,padding:"4px 10px",fontSize:12,width:130}}/>
      <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
       style={{...S.select,padding:"4px 8px",fontSize:12,width:"auto"}}>
       <option value="">כולם</option>
       <option value="present">בבסיס</option>
       <option value="absent">בבית</option>
       <option value="unknown">לא ידוע</option> </select> </div> </div>
    <div style={S.tableWrap}>
     <table style={S.table}>
      <thead><tr>
       {["שם","תפקיד","סטטוס","שעות נוכחות","הערה"].map(h=><Th key={h}>{h}</Th>)}
      </tr></thead>
      <tbody>
       {filteredSoldiers.map((s,i)=>{
        const val    = rec[s.id];
        const status = getAttStatus(val);
        const note   = getAttField(val,"note","");
        const from   = getAttField(val,"from","10:00");
        const to     = getAttField(val,"to","10:00");
        return (
         <tr key={s.id} style={{
          ...S.tr,...(i%2===0?S.trAlt:{}),
          ...(status==="present"?{background:"#071510"}:{}),
          ...(status==="absent" ?{background:"#150707"}:{}),
         }}>
          <td style={S.td}><strong style={{color:"#e2e8f0"}}>{s.name}</strong></td>
          <td style={S.td}><RoleBadge role={s.role}/></td>
          <td style={S.td}>
           <div style={{display:"flex",gap:6}}>
            <button onClick={()=>mark(s.id,"present")} style={{...S.statusBtn,...(status==="present"?S.statusPresent:{})}}>✓ בבסיס</button>
            <button onClick={()=>mark(s.id,"absent")}  style={{...S.statusBtn,...(status==="absent" ?S.statusAbsent:{})}}>✗ בבית</button>
           </div> </td>
          <td style={S.td}>
           {status==="present" ? (
            <div style={{display:"flex",alignItems:"center",gap:4}}>
             <input type="time" value={from} onChange={e=>setField(s.id,"from",e.target.value)}
              style={{...S.input,padding:"2px 6px",fontSize:12,width:82}}/>
             <span style={{color:"#64748b",fontSize:11}}>עד</span>
             <input type="time" value={to}   onChange={e=>setField(s.id,"to",e.target.value)}
              style={{...S.input,padding:"2px 6px",fontSize:12,width:82}}/> </div>
           ) : <span style={{color:"#334155",fontSize:11}}>—</span>} </td>
          <td style={S.td}>
           <input type="text" value={note} placeholder="הערה..."
            onChange={e=>setField(s.id,"note",e.target.value)}
            style={{...S.input,padding:"3px 8px",fontSize:12,width:"100%",minWidth:120,
             background:note?"#0d1a0d":"#0a0e18", borderColor:note?"#16a34a":"#1e293b"}}/> </td> </tr> );
       })}
       {filteredSoldiers.length===0&&<tr><td colSpan={5} style={S.emptyCell}>אין תוצאות</td></tr>}
      </tbody>
     </table> </div>
   </>}
   
   {view==="stats" && (
    <div>
     <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
      {[
       ["📊","ימים מתועדים",totalDaysRecorded,"#93c5fd"],
       ["✅","בבסיס היום",presentIds.length,"#4ade80"],
       ["❌","בבית היום",absentIds.length,"#f87171"],
      ].map(([icon,label,val,color])=>(
       <div key={label} style={{background:"#0a0e18",border:"1px solid #1e293b",borderRadius:10,padding:"16px",textAlign:"center"}}>
        <div style={{fontSize:24,marginBottom:4}}>{icon}</div>
        <div style={{fontSize:22,fontWeight:700,color}}>{val}</div>
        <div style={{fontSize:11,color:"#475569"}}>{label}</div> </div>
      ))} </div>
     <div style={{fontWeight:600,color:"#94a3b8",fontSize:13,marginBottom:10}}>נוכחות מצטברת לפי חייל ({totalDaysRecorded} ימים):</div>
     <div style={S.tableWrap}>
      <table style={S.table}>
       <thead><tr>
        <Th>שם</Th><Th>תפקיד</Th><Th>ימי נוכחות</Th><Th>אחוז נוכחות</Th><Th>היום</Th>
       </tr></thead>
       <tbody>
        {dep.soldiers
         .slice().sort((a,b)=>(soldierPresenceCounts[b.id]||0)-(soldierPresenceCounts[a.id]||0))
         .map((s,i)=>{
          const cnt = soldierPresenceCounts[s.id]||0;
          const pct = totalDaysRecorded>0 ? Math.round(cnt/totalDaysRecorded*100) : 0;
          const todaySt = getAttStatus(rec[s.id]);
          const barColor = pct>80?"#4ade80":pct>50?"#fbbf24":"#f87171";
          return (
           <tr key={s.id} style={{...S.tr,...(i%2===0?S.trAlt:{})}}>
            <td style={S.td}><strong style={{color:"#e2e8f0"}}>{s.name}</strong></td>
            <td style={S.td}><RoleBadge role={s.role}/></td>
            <td style={{...S.td,textAlign:"center"}}>
             <span style={{color:"#93c5fd",fontWeight:600}}>{cnt}</span>
             <span style={{color:"#334155",fontSize:11}}> / {totalDaysRecorded}</span> </td>
            <td style={{...S.td,minWidth:140}}>
             <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{flex:1,height:8,background:"#0a0e18",borderRadius:4,overflow:"hidden",border:"1px solid #1e293b"}}>
               <div style={{height:"100%",width:`${pct}%`,background:barColor,borderRadius:4}}/> </div>
              <span style={{fontSize:12,color:barColor,width:36,textAlign:"left"}}>{pct}%</span> </div> </td>
            <td style={{...S.td,textAlign:"center"}}>
             {todaySt==="present"?<span style={{color:"#4ade80",fontSize:13}}>✓</span>
             :todaySt==="absent"?<span style={{color:"#f87171",fontSize:13}}>✗</span>
             :<span style={{color:"#334155",fontSize:13}}>?</span>} </td> </tr> );
         })}
       </tbody>
      </table> </div> </div> )}
   
   {view==="history" && (
    <div>
     <div style={{fontWeight:600,color:"#94a3b8",fontSize:13,marginBottom:12}}>
      היסטוריית נוכחות — {allDates.length} ימים מתועדים </div>
     {allDates.length===0 ? <EmptyMsg>אין ימים מתועדים.</EmptyMsg> : (
      <div style={S.tableWrap}>
       <table style={S.table}>
        <thead>
         <tr>
          <Th>תאריך</Th>
          {dep.soldiers.map(s=><th key={s.id} style={{...S.th,fontSize:11,padding:"6px 8px",maxWidth:80,textAlign:"center"}}>{s.name}</th>)}
          <Th>נוכחים</Th>
          <Th>נעדרים</Th> </tr>
        </thead>
        <tbody>
         {allDates.map((d,i)=>{
          const dayRec = att[d]||{};
          const pCount = dep.soldiers.filter(s=>getAttStatus(dayRec[s.id])==="present").length;
          const aCount = dep.soldiers.filter(s=>getAttStatus(dayRec[s.id])==="absent").length;
          const isToday = d===todayStr();
          return (
           <tr key={d} style={{...S.tr,...(i%2===0?S.trAlt:{}),...(isToday?{background:"#071510"}:{})}}>
            <td style={{...S.td,fontWeight:isToday?700:400,color:isToday?"#4ade80":"#e2e8f0",cursor:"pointer",textDecoration:"underline"}}
             onClick={()=>{setSelectedDate(d);setView("table");}}>
             {fmtDate(d)}{isToday&&" 📍"} </td>
            {dep.soldiers.map(s=>{
             const st=getAttStatus(dayRec[s.id]);
             return (
              <td key={s.id} style={{...S.td,textAlign:"center",padding:"4px 8px"}}>
               {st==="present"?<span style={{color:"#4ade80",fontSize:14}}>✓</span>
               :st==="absent"?<span style={{color:"#f87171",fontSize:14}}>✗</span>
               :<span style={{color:"#1e293b",fontSize:14}}>·</span>} </td> );
            })}
            <td style={{...S.td,textAlign:"center",color:"#4ade80",fontWeight:600}}>{pCount||"—"}</td>
            <td style={{...S.td,textAlign:"center",color:"#f87171",fontWeight:600}}>{aCount||"—"}</td> </tr> );
         })}
        </tbody>
       </table> </div> )} </div> )} </div> ); }
/* ===========================================================
 ASSIGNMENT TAB
=========================================================== */
function AssignmentTab({ dep, updateDep, notify }) {
 const [selDate, setSelDate] = useState(todayStr());
 const [selMissions, setSelMissions] = useState([]);
 const [result, setResult] = useState(null);
 const [historyDays, setHistoryDays] = useState(0);
 const [debugInfo, setDebugInfo] = useState(null);
 const [pinnedAssignments, setPinnedAssignments] = useState({});
 const printRef = useRef();
 const att = dep.attendance||{};
 const allDates = Array.from(new Set([todayStr(),...Object.keys(att)])).sort().reverse();
 const presentSoldiers = dep.soldiers.filter(s=>getAttStatus((att[selDate]||{})[s.id])==="present");
 function run() {
  const missions = dep.missions.filter(m=>selMissions.includes(m.id));
  const missionHistory = {};
  (dep.assignments||[])
   .filter(a => a.date !== selDate)
   .forEach(a => {
    (a.data||[]).forEach(m => {
     (m.shifts||[]).forEach(sh => {
      (sh.soldierIds||[]).forEach(sid => {
       if (!missionHistory[sid]) missionHistory[sid] = {};
       missionHistory[sid][m.missionId] = (missionHistory[sid][m.missionId]||0) + 1;
      });
     });
    });
   });
  const pastDays = (dep.assignments||[]).filter(a => a.date !== selDate).length;
  setHistoryDays(pastDays);
  const dbg = {};
  dep.soldiers.forEach(s => {
   dbg[s.id] = { name: s.name, counts: { ...(missionHistory[s.id] || {}) } };
  });
  setDebugInfo({ pastDays, history: dbg, missionNames: Object.fromEntries(missions.map(m=>[m.id,m.name])) });
  setResult(buildAssignment(missions, dep.soldiers, att[selDate]||{}, missionHistory, att, pinnedAssignments)); }
 function togglePin(missionId, shiftIdx, sid) {
  const key = `${missionId}__${shiftIdx}`;
  setPinnedAssignments(prev => {
   const cur = prev[key] || [];
   const next = cur.includes(sid) ? cur.filter(x => x !== sid) : [...cur, sid];
   return { ...prev, [key]: next };
  }); }
 function isPinned(missionId, shiftIdx, sid) {
  return (pinnedAssignments[`${missionId}__${shiftIdx}`] || []).includes(sid); }
 function clearAllPins() { setPinnedAssignments({}); }
 function getSoldier(id) { return dep.soldiers.find(s=>s.id===id); }
 function removeSoldier(mIdx,sIdx,i) {
  setResult(r=>r.map((m,mi)=>mi!==mIdx?m:{...m,shifts:m.shifts.map((sh,si)=>si!==sIdx?sh:{...sh,soldierIds:sh.soldierIds.filter((_,j)=>j!==i),soldierNames:sh.soldierNames.filter((_,j)=>j!==i)})}));
 }
 function addSoldier(mIdx,sIdx,sid) {
  const s=getSoldier(sid); if(!s)return;
  setResult(r=>r.map((m,mi)=>mi!==mIdx?m:{...m,shifts:m.shifts.map((sh,si)=>si!==sIdx?sh:sh.soldierIds.includes(sid)?sh:{...sh,soldierIds:[...sh.soldierIds,sid],soldierNames:[...sh.soldierNames,s.name]})}));
 }
 function saveAssignment() {
  if(!result) return;
  updateDep(d=>({...d,assignments:[...(d.assignments||[]).filter(a=>a.date!==selDate),{date:selDate,data:result,createdAt:new Date().toISOString()}]}));
  notify("שיבוץ נשמר בהצלחה!"); }
 function exportPDF() {
  const rows = result?.map(m => {
   const byDay = {};
   m.shifts.forEach((sh,i)=>{
    const day = sh.dayNum||1;
    if(!byDay[day]) byDay[day]={date:sh.startDate,shifts:[]};
    byDay[day].shifts.push({...sh,idx:i});
   });
   const days = Object.keys(byDay).map(Number).sort((a,b)=>a-b);
   return days.map(dayNum => {
    const {date, shifts: dayShifts} = byDay[dayNum];
    const dayHeader = `<tr class="day-row"><td colspan="4">📅 יום ${dayNum} — ${fmtDate(date)}</td></tr>`;
    const shiftRows = dayShifts.map(sh => {
     const soldiers = (sh.soldierIds||[]).map(sid=>{
      const s=getSoldier(sid);
      return `<span class="soldier-tag">${s?.name||sid} <span class="role">${s?.role||""}</span></span>`;
     }).join(" ");
     const status = sh.filled
      ? `<span style="color:#16a34a">✓</span>`
      : `<span style="color:#dc2626">⚠ חסרים ${(sh.needed||1)-(sh.soldierIds?.length||0)}</span>`;
     return `<tr class="shift-row">
      <td class="mission-cell">${m.missionName}</td>
      <td class="time-cell">${sh.start} – ${sh.end}</td>
      <td>${soldiers||"—"}</td>
      <td class="status-cell">${status}</td>
     </tr>`;
    }).join("");
    return dayHeader + shiftRows;
   }).join("");
  }).join("") || "";
  const html = `<!DOCTYPE html><html dir="rtl"><head>
  <meta charset="UTF-8">
  <title>שיבוץ ${fmtDate(selDate)}</title>
  <style>
   * { box-sizing: border-box; }
   body { font-family: Arial, sans-serif; padding: 28px; direction: rtl; color: #111; font-size: 13px; }
   h1 { font-size: 20px; margin: 0 0 4px; }
   .meta { color: #666; font-size: 12px; margin-bottom: 20px; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
   table { width: 100%; border-collapse: collapse; }
   th { background: #1b3a2a; color: #fff; padding: 8px 12px; text-align: right; font-size: 12px; }
   td { border: 1px solid #e2e8f0; padding: 7px 12px; vertical-align: middle; }
   .day-row td { background: #e8f5e9; font-weight: 700; color: #15803d; font-size: 12px; border-top: 2px solid #16a34a; }
   .shift-row:nth-child(odd) td { background: #fafafa; }
   .shift-row:nth-child(even) td { background: #fff; }
   .mission-cell { font-weight: 600; color: #1e293b; }
   .time-cell { font-family: monospace; font-size: 13px; font-weight: 700; white-space: nowrap; color: #0f172a; }
   .status-cell { text-align: center; width: 70px; }
   .soldier-tag { display: inline-block; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 4px; padding: 1px 7px; margin: 2px; font-size: 12px; }
   .role { background: #dcfce7; color: #15803d; border-radius: 3px; padding: 0 4px; font-size: 10px; margin-right: 4px; }
   @media print { body { padding: 10px; } @page { margin: 15mm; } }
  </style></head>
  <body>
   <h1>⚔ שיבוץ מבצעי — ${fmtDate(selDate)}</h1>
   <div class="meta">הופק: ${new Date().toLocaleString("he-IL")} &nbsp;|&nbsp; חיילים בבסיס: ${presentSoldiers.length} &nbsp;|&nbsp; משימות: ${result?.length||0}</div>
   <table>
    <thead><tr><th>משימה</th><th>שעות</th><th>חיילים</th><th>סטטוס</th></tr></thead>
    <tbody>${rows}</tbody>
   </table>
  </body></html>`;
  const blob = new Blob([html], {type:"text/html;charset=utf-8"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.target = "_blank"; a.rel = "noopener";
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000); }
 const loadStats={};
 presentSoldiers.forEach(s=>{ loadStats[s.id]={count:0, mins:0}; });
 result?.forEach(m=>{
  const mObj = dep.missions.find(x=>x.id===m.missionId);
  m.shifts.forEach(sh=>{
   let s2=timeToMins(sh.start), e2=timeToMins(sh.end);
   if(e2<=s2) e2+=1440;
   const dur=e2-s2;
   sh.soldierIds.forEach(id=>{
    if(!loadStats[id]) loadStats[id]={count:0,mins:0};
    loadStats[id].count+=1;
    loadStats[id].mins+=dur;
   });
  });
 });
 const maxMins = Math.max(1,...Object.values(loadStats).map(x=>x.mins));
 return (
  <div>
   <PanelHeader title="שיבוץ חכם" icon="⚔️">
    <span style={{...S.badge,background:"#0d3320",color:"#4ade80"}}>👥 {presentSoldiers.length} בבסיס</span>
    {result && <>
     <button onClick={saveAssignment} style={{...S.btnPrimary,background:"#15803d"}}>💾 שמור שיבוץ</button>
     <button onClick={exportPDF} style={{...S.btnPrimary,background:"#7c3aed"}}>📄 PDF</button>
    </>}
   </PanelHeader>
   
   <div style={{marginBottom:16}}>
    <div style={S.label}>תאריך שיבוץ:</div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
     {allDates.map(d=><button key={d} onClick={()=>{setSelDate(d);setResult(null);}} style={{...S.datePill,...(d===selDate?S.datePillActive:{})}}>{fmtDate(d)}{d===todayStr()&&<span style={{fontSize:10,color:"#4ade80",marginRight:4}}>היום</span>}</button>)}
    </div> </div>
   {presentSoldiers.length===0&&<div style={{...S.alert,borderColor:"#f87171",color:"#f87171",background:"#150707"}}>⚠️ אין חיילים נוכחים בתאריך זה. עבור לטאב נוכחות וסמן חיילים.</div>}
   
   <FormCard title="בחר משימות לשיבוץ">
    {dep.missions.length===0?<EmptyMsg>אין משימות.</EmptyMsg>:(
     <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {dep.missions.map(m=>(
       <div key={m.id} style={{...S.mSelectRow,...(selMissions.includes(m.id)?S.mSelectActive:{})}}
        onClick={()=>setSelMissions(s=>s.includes(m.id)?s.filter(x=>x!==m.id):[...s,m.id])}>
        <input type="checkbox" checked={selMissions.includes(m.id)} onChange={()=>{}} style={{accentColor:"#4ade80"}}/>
        <strong style={{color:"#e2e8f0"}}>{m.name}</strong>
        <span style={S.badge}>{m.numShifts} × {m.soldiersPerShift} חיילים</span>
        {(m.minSpecialRoles||0)>0&&<span style={{fontSize:11,color:"#fbbf24",background:"#2a1f0a",padding:"1px 7px",borderRadius:8,border:"1px solid #d97706"}}>⭐ ×{m.minSpecialRoles} מיוחד</span>}
        {(m.mandatoryRoles||[]).length>0&&<span style={{fontSize:11,color:"#93c5fd",background:"#0d1f3c",padding:"1px 7px",borderRadius:8,border:"1px solid #3b82f6"}}>🎖 {(m.mandatoryRoles).join("/")}</span>}
        <CertList certs={m.requiredCerts}/> </div>
      ))} </div> )}
    <div style={{marginTop:16,display:"flex",flexDirection:"column",gap:10}}>
     <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
      <button onClick={run} disabled={!selMissions.length||!presentSoldiers.length}
       style={{...S.btnPrimary,opacity:(!selMissions.length||!presentSoldiers.length)?0.4:1,fontSize:15,padding:"11px 28px"}}>
       ⚡ צור שיבוץ אופטימלי </button>
      {Object.values(pinnedAssignments).some(v=>v.length>0) && (
       <button onClick={clearAllPins} style={{...S.btnSmall,borderColor:"#f59e0b",color:"#f59e0b"}}>
        🗑 נקה כל הנעיצות ({Object.values(pinnedAssignments).reduce((s,v)=>s+v.length,0)}) </button> )}
      {(() => {
       const saved = (dep.assignments||[]).filter(a => a.date !== selDate).length;
       return saved > 0
        ? <span style={{fontSize:12,color:"#4ade80",background:"#071510",border:"1px solid #16a34a",borderRadius:8,padding:"5px 12px"}}>
          🔄 גיוון מבוסס {saved} ימי היסטוריה </span>
        : <span style={{fontSize:11,color:"#475569"}}>
          💡 שמור שיבוצים קודמים כדי לשפר גיוון משימות
         </span>;
      })()} </div>
     
     <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:8,padding:"10px 14px",fontSize:12,color:"#93c5fd",lineHeight:1.6}}>
      <strong style={{color:"#60a5fa"}}>💡 לגיוון מקסימלי בין ימים:</strong>
      {" "}צור שיבוץ <strong>יום בנפרד</strong> ← שמור 💾 ← עבור לתאריך הבא ← צור שיבוץ.
      כך האלגוריתם ישתמש בהיסטוריה היומית ויחלק את המשימות בצורה מגוונת. </div> </div>
   </FormCard>
   
   {selMissions.length > 0 && presentSoldiers.length > 0 && (
    <FormCard title="📌 שיבוץ ידני — נעץ חיילים למשמרות">
     <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>
      בחר חיילים שתרצה לנעוץ למשמרות ספציפיות לפני הריצה. האלגוריתם ישלים את השאר בהתאם. </div>
     {dep.missions.filter(m=>selMissions.includes(m.id)).map(m=>{
      const shifts = computeMissionShifts(m);
      return (
       <div key={m.id} style={{marginBottom:16}}>
        <div style={{fontWeight:700,color:"#93c5fd",fontSize:13,marginBottom:6}}>🎯 {m.name}</div>
        {shifts.map((sh,si)=>{
         const key = `${m.id}__${si}`;
         const pins = pinnedAssignments[key]||[];
         return (
          <div key={si} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,
           background:"#0a0e18",border:"1px solid "+(pins.length?"#d97706":"#1e293b"),
           borderRadius:8,padding:"6px 10px",flexWrap:"wrap"}}>
           <span style={{fontFamily:"monospace",fontSize:12,color:"#e2e8f0",minWidth:110,flexShrink:0}}>
            {sh.start}–{sh.end}
            {sh.dayNum>1&&<span style={{fontSize:10,color:"#64748b",marginRight:4}}> יום {sh.dayNum}</span>} </span>
           {pins.length>0&&(
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
             {pins.map(sid=>{
              const s=dep.soldiers.find(x=>x.id===sid);
              return s?(
               <span key={sid} style={{background:"#2a1f0a",border:"1px solid #d97706",
                borderRadius:6,padding:"2px 8px",fontSize:11,color:"#fbbf24",
                display:"flex",alignItems:"center",gap:4}}>
                📌 {s.name}
                <button onClick={()=>togglePin(m.id,si,sid)}
                 style={{background:"none",border:"none",cursor:"pointer",color:"#f87171",fontSize:12,padding:0,lineHeight:1}}>×</button>
               </span>
              ):null;
             })} </div> )}
           <select
            value=""
            onChange={e=>{ if(e.target.value) togglePin(m.id,si,e.target.value); }}
            style={{...S.input,padding:"2px 8px",fontSize:11,width:"auto",minWidth:120,color:"#94a3b8"}}>
            <option value="">+ הוסף חייל...</option>
            {presentSoldiers
             .filter(s=>!pins.includes(s.id))
             .map(s=><option key={s.id} value={s.id}>{s.name} ({s.role})</option>)} </select> </div> );
        })} </div> );
     })}
    </FormCard> )}
   
   {debugInfo && (
    <FormCard title="🔍 אבחון גיוון — היסטוריה שנטענה">
     <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>
      {debugInfo.pastDays > 0
       ? `נטענו ${debugInfo.pastDays} שיבוצים שמורים. הטבלה מראה כמה פעמים כל חייל שובץ לכל משימה בעבר:`
       : "⚠️ אין שיבוצים שמורים — אין היסטוריה. שמור שיבוצים קודמים עם 💾 כדי שהגיוון יעבוד."} </div>
     {debugInfo.pastDays > 0 && (
      <div style={{overflowX:"auto"}}>
       <table style={{borderCollapse:"collapse",fontSize:11,width:"100%"}}>
        <thead>
         <tr>
          <th style={{padding:"4px 10px",background:"#0d1a0d",color:"#4ade80",textAlign:"right",border:"1px solid #1e293b"}}>חייל</th>
          {Object.entries(debugInfo.missionNames).map(([id,name])=>(
           <th key={id} style={{padding:"4px 10px",background:"#0d1a0d",color:"#93c5fd",textAlign:"center",border:"1px solid #1e293b"}}>{name}</th>
          ))} </tr>
        </thead>
        <tbody>
         {Object.values(debugInfo.history).map(({name,counts})=>{
          const vals = Object.entries(debugInfo.missionNames).map(([id])=>counts[id]||0);
          const max = Math.max(...vals,1);
          return (
           <tr key={name}>
            <td style={{padding:"3px 10px",color:"#e2e8f0",border:"1px solid #1e293b",fontWeight:600}}>{name}</td>
            {Object.entries(debugInfo.missionNames).map(([id])=>{
             const v=counts[id]||0;
             const isMax = v===max && v>0;
             return <td key={id} style={{padding:"3px 10px",textAlign:"center",border:"1px solid #1e293b",
              color: v===0?"#334155":isMax?"#f87171":"#4ade80",
              background: isMax?"#1f0a0a":"transparent",fontWeight:isMax?700:400}}>
              {v===0?"—":v}
             </td>;
            })} </tr> );
         })}
        </tbody>
       </table>
       <div style={{marginTop:6,fontSize:10,color:"#334155"}}>🟢 מעט = עדיפות לקבל משימה זו · 🔴 הרבה = יקבל עדיפות נמוכה</div>
      </div> )}
    </FormCard> )}
   {result && <>
     
     <FormCard title="📊 מד עומס חיילים — שוויון ומנוחה">
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
       {presentSoldiers
        .slice()
        .sort((a,b)=>(loadStats[b.id]?.mins||0)-(loadStats[a.id]?.mins||0))
        .map(s=>{
         const st=loadStats[s.id]||{count:0,mins:0};
         const pct=Math.round((st.mins/maxMins)*100);
         const hrs=Math.floor(st.mins/60), mins2=st.mins%60;
         const col=pct>75?"#f87171":pct>40?"#fbbf24":"#4ade80";
         return (
          <div key={s.id} style={{display:"flex",alignItems:"center",gap:10}}>
           <div style={{width:90,fontSize:12,color:"#e2e8f0",fontWeight:600,textAlign:"right",flexShrink:0}}>{s.name}</div>
           <RoleBadge role={s.role} small/>
           <div style={{flex:1,height:14,background:"#0a0e18",borderRadius:7,overflow:"hidden",border:"1px solid #1e293b"}}>
            <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${col}88,${col})`,borderRadius:7,transition:"width 0.5s ease"}}/>
           </div>
           <div style={{width:90,fontSize:11,color:col,textAlign:"left",flexShrink:0}}>
            {hrs>0?`${hrs}ש' `:""}{ mins2>0?`${mins2}ד'`:hrs===0?"0 ד'":""} ({st.count} משמרות) </div> </div> );
       })} </div>
      <div style={{marginTop:12,fontSize:11,color:"#334155",borderTop:"1px solid #0d1117",paddingTop:8}}>
       🟢 עומס נמוך &nbsp;|&nbsp; 🟡 עומס בינוני &nbsp;|&nbsp; 🔴 עומס גבוה — דרישות: מנוחה ≥7.5ש׳ · מקסימום 8ש׳/יממה · אנטי-עייפות מובנה
      </div>
     </FormCard>
     
     <div ref={printRef}>
      {result.map((m,mIdx)=>{
       const byDay = {};
       m.shifts.forEach((sh,sIdx)=>{
        const day = sh.dayNum || 1;
        if(!byDay[day]) byDay[day] = {date: sh.startDate, shifts:[]};
        byDay[day].shifts.push({...sh, sIdx});
       });
       const days = Object.keys(byDay).map(Number).sort((a,b)=>a-b);
       const totalFilled = m.shifts.filter(sh=>sh.filled).length;
       const totalShifts = m.shifts.length;
       return (
        <div key={m.missionId} style={{...S.assignCard, marginBottom:16}}>
         
         <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:12,borderBottom:"1px solid #0d1a0d",marginBottom:4}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
           <span style={{fontSize:16,fontWeight:800,color:"#e2e8f0",letterSpacing:0.5}}>{m.missionName}</span>
           <span style={{fontSize:11,color:"#64748b"}}>{days.length} ימים · {totalShifts} משמרות</span> </div>
          <span style={{fontSize:12,padding:"3px 10px",borderRadius:8,
           background: totalFilled===totalShifts?"#071510":"#150707",
           color: totalFilled===totalShifts?"#4ade80":"#f87171",
           border:`1px solid ${totalFilled===totalShifts?"#16a34a":"#dc2626"}`}}>
           {totalFilled}/{totalShifts} ✓ </span> </div>
         
         <div style={{display:"flex",flexDirection:"column",gap:12,marginTop:12}}>
          {days.map(dayNum=>{
           const {date, shifts: dayShifts} = byDay[dayNum];
           return (
            <div key={dayNum}>
             
             <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <div style={{background:"#0d2a1a",border:"1px solid #16a34a",borderRadius:6,padding:"3px 12px",fontSize:12,fontWeight:700,color:"#4ade80",flexShrink:0}}>
               יום {dayNum} </div>
              <div style={{fontSize:13,color:"#94a3b8",fontWeight:600}}>
               {fmtDate(date)} </div>
              <div style={{flex:1,height:1,background:"#0d2a1a"}}/> </div>
             
             <div style={{display:"flex",flexDirection:"column",gap:6,paddingRight:8,borderRight:"2px solid #0d2a1a"}}>
              {dayShifts.map(sh=>(
               <div key={sh.sIdx} style={{
                background: sh.filled?"#06090f":"#0f0606",
                border:`1px solid ${sh.filled?"#1e293b":"#7f1d1d"}`,
                borderRadius:8, padding:"10px 14px",
                display:"flex", alignItems:"flex-start", gap:12, flexWrap:"wrap"
               }}>
                
                <div style={{flexShrink:0,minWidth:90}}>
                 <div style={{fontSize:14,fontWeight:700,color:"#e2e8f0",fontFamily:"monospace"}}>
                  {sh.start} – {sh.end} </div>
                 <div style={{fontSize:10,color:"#475569",marginTop:2}}>
                  משמרת {sh.shiftOfDay||sh.sIdx+1}
                  {!sh.filled&&<span style={{color:"#f87171",marginRight:6}}>· ⚠ חסרים {sh.needed-(sh.soldierIds?.length||0)}</span>}
                 </div> </div>
                
                <div style={{width:1,alignSelf:"stretch",background:"#1e293b",flexShrink:0}}/>
                
                <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",flex:1}}>
                 {(sh.soldierIds||[]).map((sid,i)=>{
                  const s=getSoldier(sid);
                  const detail=(sh.soldierDetails||[]).find(d=>d.id===sid);
                  const pinned = detail?.pinned || isPinned(m.missionId, sh.sIdx, sid);
                  return (
                   <div key={sid} style={{display:"flex",flexDirection:"column",gap:2,padding:"5px 10px",background: pinned?"#1a1200":"#0d1117",borderRadius:7,border:`1px solid ${pinned?"#d97706":"#1e293b"}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                     {pinned&&<span style={{fontSize:11}} title="שובץ ידנית">📌</span>}
                     <RoleBadge role={s?.role||"חייל"} small/>
                     <span style={{color: pinned?"#fbbf24":"#e2e8f0",fontSize:13,fontWeight:600}}>{s?.name||sid}</span>
                     <button onClick={()=>removeSoldier(mIdx,sh.sIdx,i)} style={{padding:"1px 5px",borderRadius:3,border:"none",background:"transparent",color:"#475569",cursor:"pointer",fontSize:11,marginRight:2}} title="הסר">✕</button>
                    </div>
                    {detail?.reason&&<div style={{fontSize:10,color: pinned?"#92400e":"#334155"}}>{detail.reason}</div>}
                   </div> );
                 })}
                 {(sh.soldierIds?.length||0)<sh.needed&&(
                  <QuickAddSoldier soldiers={dep.soldiers} present={att[selDate]||{}} existing={sh.soldierIds||[]}
                   onAdd={sid=>addSoldier(mIdx,sh.sIdx,sid)}/> )} </div> </div>
              ))} </div> </div> );
          })} </div> </div> );
      })} </div> </> }
   
   {(dep.assignments||[]).length>0 && (
    <div style={{marginTop:24}}>
     <div style={{color:"#64748b",fontSize:13,marginBottom:8}}>📁 שיבוצים שמורים:</div>
     <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      {dep.assignments.map(a=>(
       <div key={a.date} style={{display:"flex",alignItems:"center",gap:3}}>
        <button onClick={()=>{setSelDate(a.date);setResult(a.data);}}
         style={{...S.datePill,...(selDate===a.date&&result?S.datePillActive:{})}}>
         {fmtDate(a.date)} </button>
        <button onClick={()=>{
         updateDep(d=>({...d,assignments:(d.assignments||[]).filter(x=>x.date!==a.date)}));
         if(selDate===a.date) setResult(null);
         notify("שיבוץ נמחק");
        }} style={{padding:"3px 6px",borderRadius:4,border:"1px solid #3d1515",background:"transparent",color:"#7f1d1d",cursor:"pointer",fontSize:11}} title="מחק שיבוץ">🗑</button>
       </div>
      ))} </div> </div> )} </div> ); }
/* ===========================================================
 MY SHIFT TAB (viewer)
=========================================================== */
function MyShiftTab({ dep, currentUser, users, saveUsers, notify }) {
 const [tab, setTab]       = useState("shifts");
 const [name, setName]     = useState(currentUser?.name || "");
 const [phone, setPhone]   = useState(currentUser?.phone || "");
 const [bio, setBio]       = useState(currentUser?.bio || "");
 const [oldPwd, setOldPwd] = useState("");
 const [newPwd, setNewPwd] = useState("");
 const [newPwd2,setNewPwd2]= useState("");
 const [showPwd,setShowPwd]= useState(false);
 const [saving, setSaving] = useState(false);
 const [notifPref, setNotifPref] = useState(currentUser?.notifPref !== undefined ? currentUser.notifPref : true);
 const [theme, setTheme]   = useState(currentUser?.theme || "dark");
 const userRecord = users.find(u=>u.email===currentUser?.email);
 const linkedSoldierId = userRecord?.soldierId;
 const soldier = dep?.soldiers?.find(s=>s.id===linkedSoldierId);
 const today = todayStr();
 const myShifts = [];
 if (soldier) {
  (dep?.assignments||[]).forEach(a=>{
   a.data?.forEach(m=>{
    m.shifts?.forEach((sh,i)=>{
     if(sh.soldierIds?.includes(soldier.id)) {
      const shiftDate = sh.startDate || a.date;
      myShifts.push({ date:shiftDate, missionName:m.missionName, shiftIndex:i+1, start:sh.start, end:sh.end, total:sh.soldierIds.length, assignmentDate:a.date });
     }
    });
   });
  }); }
 myShifts.sort((a,b)=>a.date.localeCompare(b.date));
 const upcoming = myShifts.filter(s=>s.date>=today);
 const past     = myShifts.filter(s=>s.date<today);
 const presenceDays = Object.values(dep?.attendance||{}).filter(d=>getAttStatus(d[linkedSoldierId])==="present").length;
 const missionCounts = {};
 myShifts.forEach(s=>{ missionCounts[s.missionName]=(missionCounts[s.missionName]||0)+1; });
 const totalHours = myShifts.reduce((sum,s)=>{ const sv=timeToMins(s.start),ev=timeToMins(s.end); return sum+(ev>sv?ev-sv:ev+1440-sv)/60; },0);
 const nextShift = upcoming[0] || null;
 const daysToNext = nextShift ? Math.ceil((new Date(nextShift.date) - new Date(today)) / 86400000) : null;
 async function saveProfile() {
  if (!name.trim()) return;
  setSaving(true);
  const updated = { ...currentUser, name:name.trim(), phone:phone.trim(), bio:bio.trim() };
  await saveUsers(users.map(u=>u.id===currentUser.id?updated:u));
  notify("פרטים עודכנו","success");
  setSaving(false); }
 async function changePassword() {
  if (!oldPwd || !newPwd || newPwd!==newPwd2 || newPwd.length<6) return;
  const oldHash = await hashPassword(oldPwd);
  if (oldHash !== currentUser.passwordHash) { notify("סיסמה נוכחית שגויה","error"); return; }
  setSaving(true);
  const updated = { ...currentUser, passwordHash: await hashPassword(newPwd) };
  await saveUsers(users.map(u=>u.id===currentUser.id?updated:u));
  setOldPwd(""); setNewPwd(""); setNewPwd2("");
  notify("סיסמה שונתה","success");
  setSaving(false); }
 async function saveSettings() {
  setSaving(true);
  const updated = { ...currentUser, notifPref, theme };
  await saveUsers(users.map(u=>u.id===currentUser.id?updated:u));
  notify("הגדרות נשמרו","success");
  setSaving(false); }
 const ROLE_C = ROLE_COLORS[currentUser?.role] || {};
 const TAB_ITEMS = [["shifts","🪖","משמרות"],["profile","👤","הפרופיל שלי"],["settings","⚙️","הגדרות"]];
 return (
  <div>
   
   <div style={{background:"linear-gradient(135deg,#0d1a2e,#0a1628)",border:"1px solid #1e3a5f",
    borderRadius:14,padding:"20px 24px",marginBottom:20,display:"flex",alignItems:"center",gap:18,flexWrap:"wrap"}}>
    <div style={{width:56,height:56,borderRadius:"50%",background:ROLE_C.bg||"#1e293b",
     display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:700,
     border:`2px solid ${ROLE_C.color||"#334155"}`,color:ROLE_C.color||"#e2e8f0",flexShrink:0}}>
     {(currentUser?.name||"?")[0].toUpperCase()} </div>
    <div style={{flex:1}}>
     <div style={{fontSize:20,fontWeight:700,color:"#e2e8f0"}}>{currentUser?.name}</div>
     <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>{currentUser?.email}</div>
     <span style={{...ROLE_C,padding:"2px 10px",borderRadius:12,fontSize:11,fontWeight:600}}>
      {ROLE_LABELS[currentUser?.role]||currentUser?.role} </span>
     {soldier && <span style={{marginRight:8,fontSize:12,color:"#4ade80"}}>🪖 {soldier.name} · {soldier.role}</span>}
    </div>
    {nextShift && (
     <div style={{background:"#071510",border:"1px solid #16a34a",borderRadius:10,padding:"10px 16px",textAlign:"center"}}>
      <div style={{fontSize:11,color:"#4ade80",marginBottom:2}}>המשמרת הבאה שלך</div>
      <div style={{fontWeight:700,color:"#e2e8f0",fontSize:14}}>{nextShift.missionName}</div>
      <div style={{fontSize:12,color:"#94a3b8"}}>{fmtDate(nextShift.date)} {nextShift.start}–{nextShift.end}</div>
      {daysToNext===0&&<span style={{fontSize:11,color:"#4ade80",fontWeight:700}}>⚡ היום!</span>}
      {daysToNext===1&&<span style={{fontSize:11,color:"#fbbf24"}}>מחר</span>}
      {daysToNext>1&&<span style={{fontSize:11,color:"#64748b"}}>בעוד {daysToNext} ימים</span>} </div> )} </div>
   
   <div style={{display:"flex",gap:2,borderBottom:"1px solid #1e293b",marginBottom:20}}>
    {TAB_ITEMS.map(([id,icon,label])=>(
     <button key={id} onClick={()=>setTab(id)} style={{
      background:"none",border:"none",cursor:"pointer",padding:"10px 18px",fontSize:13,
      color:tab===id?"#93c5fd":"#64748b",fontWeight:tab===id?700:400,
      borderBottom:tab===id?"2px solid #3b82f6":"2px solid transparent",
      display:"flex",alignItems:"center",gap:6}}>
      <span>{icon}</span><span>{label}</span> </button>
    ))} </div>
   
   {tab==="shifts" && (
    <div>
     
     {soldier && (
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
       {[
        ["📅","ימי נוכחות",presenceDays,"#93c5fd"],
        ["🔄","סה\"כ משמרות",myShifts.length,"#4ade80"],
        ["⏱","שעות עבודה",`${totalHours.toFixed(1)}ש'`,"#c4b5fd"],
        ["🗓","משמרות קרובות",upcoming.length,"#fbbf24"],
       ].map(([icon,label,val,color])=>(
        <div key={label} style={{background:"#0a0e18",border:"1px solid #1e293b",borderRadius:10,padding:"12px",textAlign:"center"}}>
         <div style={{fontSize:18,marginBottom:4}}>{icon}</div>
         <div style={{fontSize:18,fontWeight:700,color}}>{val}</div>
         <div style={{fontSize:11,color:"#475569"}}>{label}</div> </div>
       ))} </div> )}
     {!soldier && (
      <div style={{textAlign:"center",padding:40,color:"#64748b"}}>
       <div style={{fontSize:40,marginBottom:12}}>🔗</div>
       <div style={{color:"#e2e8f0",fontSize:16,fontWeight:600,marginBottom:6}}>החשבון לא מקושר לחייל</div>
       <div style={{fontSize:13}}>פנה למנהל שיקשר את החשבון שלך לפרופיל החייל.</div> </div> )}
     {soldier && upcoming.length===0 && past.length===0 && (
      <EmptyMsg>אין שיבוצים עדיין.</EmptyMsg> )}
     {upcoming.length>0 && (
      <>
       <div style={S.sectionTitle}>📅 משמרות קרובות</div>
       <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {upcoming.map((s,i)=>(
         <div key={i} style={{...S.myShiftCard,...(s.date===today?{borderColor:"#4ade80",background:"#071510"}:{})}}>
          {s.date===today&&<span style={{...S.badge,background:"#0d3320",color:"#4ade80",marginBottom:8,display:"inline-block"}}>⚡ היום</span>}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
           <div>
            <div style={{fontWeight:700,color:"#e2e8f0",fontSize:16}}>{s.missionName}</div>
            <div style={{color:"#94a3b8",marginTop:4,fontSize:13}}>📅 {fmtDate(s.date)} &nbsp;·&nbsp; ⏰ {s.start}–{s.end}</div>
            <div style={{color:"#64748b",fontSize:12,marginTop:2}}>משמרת {s.shiftIndex} · {s.total} חיילים</div> </div>
           <div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:8,padding:"6px 12px",textAlign:"center",flexShrink:0}}>
            {(() => {
             const d = Math.ceil((new Date(s.date)-new Date(today))/86400000);
             return d===0?<span style={{color:"#4ade80",fontWeight:700,fontSize:12}}>היום</span>
              :d===1?<span style={{color:"#fbbf24",fontSize:12}}>מחר</span>
              :<span style={{color:"#64748b",fontSize:12}}>בעוד {d}ד'</span>;
            })()} </div> </div> </div>
        ))} </div> </> )}
     {past.length>0 && (
      <>
       <div style={{...S.sectionTitle,marginTop:24,color:"#475569"}}>🗂 היסטוריית משמרות</div>
       {Object.keys(missionCounts).length>0 && (
        <div style={{background:"#0a0e18",border:"1px solid #1e293b",borderRadius:10,padding:"12px 16px",marginBottom:12}}>
         <div style={{fontSize:12,color:"#64748b",marginBottom:8}}>פילוח משימות:</div>
         <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {Object.entries(missionCounts).sort((a,b)=>b[1]-a[1]).map(([m,c])=>(
           <span key={m} style={{background:"#0d1a2e",border:"1px solid #1e3a5f",borderRadius:8,
            padding:"3px 10px",fontSize:12,color:"#93c5fd"}}>
            {m} <strong>×{c}</strong> </span>
          ))} </div> </div> )}
       <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {past.slice().reverse().map((s,i)=>(
         <div key={i} style={{...S.myShiftCard,opacity:0.65,padding:"10px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between"}}>
           <div>
            <span style={{fontWeight:600,color:"#94a3b8"}}>{s.missionName}</span>
            <span style={{color:"#475569",fontSize:12,marginRight:8}}> · משמרת {s.shiftIndex}</span> </div>
           <span style={{color:"#334155",fontSize:12}}>{fmtDate(s.date)}</span> </div>
          <div style={{color:"#334155",fontSize:12,marginTop:2}}>{s.start}–{s.end}</div> </div>
        ))} </div> </> )} </div> )}
   
   {tab==="profile" && (
    <div style={{maxWidth:480}}>
     <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div>
       <div style={S.label}>שם מלא</div>
       <input value={name} onChange={e=>setName(e.target.value)} style={S.input} placeholder="שם מלא"/> </div>
      <div>
       <div style={S.label}>אימייל <span style={{color:"#334155",fontSize:11}}>(לא ניתן לשינוי)</span></div>
       <div style={{...S.input,color:"#475569",background:"#0a0e18"}}>{currentUser?.email}</div> </div>
      <div>
       <div style={S.label}>טלפון</div>
       <input value={phone} onChange={e=>setPhone(e.target.value)} style={S.input} placeholder="050-0000000" type="tel"/>
      </div>
      <div>
       <div style={S.label}>על עצמי (ביו קצרה)</div>
       <textarea value={bio} onChange={e=>setBio(e.target.value)}
        style={{...S.input,minHeight:80,resize:"vertical",fontFamily:"inherit"}}
        placeholder="ספר קצת על עצמך..."></textarea> </div>
      {soldier && (
       <div style={{background:"#071510",border:"1px solid #16a34a",borderRadius:8,padding:"10px 14px",fontSize:13}}>
        🪖 <strong style={{color:"#4ade80"}}>{soldier.name}</strong>
        <span style={{color:"#475569",marginRight:8}}> · {soldier.role}</span>
        {(soldier.certifications||[]).length>0 && (
         <div style={{marginTop:6}}><CertList certs={soldier.certifications}/></div> )} </div> )}
      <button onClick={saveProfile} disabled={saving||!name.trim()}
       style={{...S.btnPrimary,opacity:name.trim()?1:0.4}}>
       {saving?"שומר...":"💾 שמור פרטים"} </button>
      <div style={{borderTop:"1px solid #1e293b",paddingTop:16,marginTop:4}}>
       <div style={{fontWeight:600,color:"#94a3b8",fontSize:13,marginBottom:12}}>🔒 שינוי סיסמה</div>
       {[["סיסמה נוכחית",oldPwd,setOldPwd],["סיסמה חדשה (≥6 תווים)",newPwd,setNewPwd],["אימות סיסמה חדשה",newPwd2,setNewPwd2]].map(([lbl,val,set])=>(
        <div key={lbl} style={{marginBottom:10}}>
         <div style={S.label}>{lbl}</div>
         <input value={val} onChange={e=>set(e.target.value)}
          type={showPwd?"text":"password"} style={S.input} placeholder="••••••••"/> </div>
       ))}
       {newPwd && newPwd2 && newPwd!==newPwd2 &&
        <div style={{color:"#f87171",fontSize:12,marginBottom:8}}>⚠ הסיסמאות אינן תואמות</div>}
       <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,color:"#64748b",marginBottom:12}}>
        <input type="checkbox" checked={showPwd} onChange={e=>setShowPwd(e.target.checked)} style={{accentColor:"#3b82f6"}}/>
        הצג סיסמאות </label>
       <button onClick={changePassword}
        disabled={saving||!oldPwd||!newPwd||newPwd!==newPwd2||newPwd.length<6}
        style={{...S.btnPrimary,opacity:(oldPwd&&newPwd&&newPwd===newPwd2&&newPwd.length>=6)?1:0.4}}>
        {saving?"שומר...":"🔑 שנה סיסמה"} </button> </div> </div> </div> )}
   
   {tab==="settings" && (
    <div style={{maxWidth:420}}>
     <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{background:"#0a0e18",border:"1px solid #1e293b",borderRadius:12,padding:"16px 20px"}}>
       <div style={{fontWeight:600,color:"#e2e8f0",marginBottom:14}}>🎨 מראה</div>
       <div style={S.label}>ערכת נושא</div>
       <div style={{display:"flex",gap:8,marginTop:6}}>
        {[["dark","🌑 כהה"],["dim","🌓 עמום"]].map(([val,lbl])=>(
         <button key={val} onClick={()=>setTheme(val)}
          style={{...S.btnSmall,...(theme===val?{borderColor:"#3b82f6",color:"#93c5fd",background:"#0d1a2e"}:{}),flex:1}}>
          {lbl} </button>
        ))} </div> </div>
      <div style={{background:"#0a0e18",border:"1px solid #1e293b",borderRadius:12,padding:"16px 20px"}}>
       <div style={{fontWeight:600,color:"#e2e8f0",marginBottom:14}}>🔔 התראות</div>
       <label style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
        <span style={{fontSize:13,color:"#94a3b8"}}>הצג משמרות קרובות</span>
        <div onClick={()=>setNotifPref(v=>!v)}
         style={{width:44,height:24,borderRadius:12,background:notifPref?"#16a34a":"#1e293b",
          position:"relative",cursor:"pointer",transition:"background 0.2s",border:`1px solid ${notifPref?"#4ade80":"#334155"}`}}>
         <div style={{position:"absolute",top:2,left:notifPref?20:2,width:18,height:18,
          borderRadius:"50%",background:notifPref?"#4ade80":"#475569",transition:"left 0.2s"}}/> </div> </label> </div>
      <div style={{background:"#0a0e18",border:"1px solid #1e293b",borderRadius:12,padding:"16px 20px"}}>
       <div style={{fontWeight:600,color:"#e2e8f0",marginBottom:10}}>ℹ️ פרטי חשבון</div>
       <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:12}}>
        {[
         ["אימייל",currentUser?.email],
         ["תפקיד",ROLE_LABELS[currentUser?.role]||currentUser?.role],
         ["נוצר",currentUser?.createdAt?new Date(currentUser.createdAt).toLocaleDateString("he-IL"):"—"],
        ].map(([k,v])=>(
         <div key={k} style={{display:"flex",justifyContent:"space-between",
          padding:"6px 0",borderBottom:"1px solid #0f172a"}}>
          <span style={{color:"#475569"}}>{k}</span>
          <span style={{color:"#94a3b8"}}>{v}</span> </div>
        ))} </div> </div>
      <button onClick={saveSettings} disabled={saving}
       style={S.btnPrimary}>{saving?"שומר...":"שמור הגדרות"}</button> </div> </div> )} </div> ); }
// USERS TAB (admin only)
function UsersTab({ users, saveUsers, currentUser, dep, notify }) {
 const [tab, setTab]           = useState("users");
 const [form, setForm]         = useState({ name:"", email:"", role:"viewer", password:"" });
 const [resetTarget, setResetTarget] = useState(null);
 const [resetPwd, setResetPwd] = useState("");
 const [showPwd, setShowPwd]   = useState({});
 const [invite, setInvite]     = useState(null);
 const [inviteRole, setInviteRole] = useState("viewer");
 const [copied, setCopied]     = useState(false);
 useEffect(() => {
  sGet("tac:invite", true).then(v => v && setInvite(v)).catch(()=>{});
 }, []);
 const inviteUrl = invite
  ? `${window.location.origin}${window.location.pathname}?invite=${invite.token}`
  : null;
 async function createUser() {
  if (!form.name || !form.email.includes("@") || !form.password) return;
  const norm = form.email.toLowerCase().trim();
  if (users.find(u=>u.email===norm)) { notify("אימייל כבר קיים","error"); return; }
  const passwordHash = await hashPassword(form.password);
  const newUser = { id:uid(), email:norm, name:form.name.trim(), role:form.role,
   passwordHash, createdAt:new Date().toISOString(), createdBy:currentUser?.id };
  await saveUsers([...users, newUser]);
  notify(`משתמש ${form.name} נוצר בהצלחה`,"success");
  setForm({ name:"", email:"", role:"viewer", password:"" });
  setTab("users"); }
 async function setRole(id, role) {
  if (id===currentUser?.id && role!=="admin") { notify("לא ניתן לשנות הרשאות עצמך","error"); return; }
  await saveUsers(users.map(u=>u.id===id?{...u,role}:u));
  notify("הרשאה עודכנה"); }
 async function toggleBlock(id) {
  if (id===currentUser?.id) { notify("לא ניתן לחסום את עצמך","error"); return; }
  const u = users.find(x=>x.id===id);
  await saveUsers(users.map(x=>x.id===id?{...x,blocked:!x.blocked}:x));
  notify(u?.blocked ? "משתמש שוחרר" : "משתמש חסום"); }
 async function doResetPassword() {
  if (!resetPwd || !resetTarget) return;
  const passwordHash = await hashPassword(resetPwd);
  await saveUsers(users.map(u=>u.id===resetTarget?{...u,passwordHash}:u));
  notify("סיסמה אופסה","success");
  setResetTarget(null); setResetPwd(""); }
 async function removeUser(id) {
  if (id===currentUser?.id) { notify("לא ניתן להסיר את עצמך","error"); return; }
  if (typeof window !== 'undefined' && window.confirm && !window.confirm("האם למחוק משתמש זה לצמיתות?")) return;
  await saveUsers(users.filter(u=>u.id!==id));
  notify("משתמש הוסר"); }
 async function linkSoldier(id, soldierId) {
  await saveUsers(users.map(u=>u.id===id?{...u,soldierId:soldierId||null}:u));
  notify("חייל קושר"); }
 async function generateInvite() {
  const token = uid() + uid();
  const newInvite = { token, active:true, defaultRole:inviteRole,
   createdAt:new Date().toISOString(), createdBy:currentUser?.name };
  await sSet("tac:invite", newInvite, true);
  setInvite(newInvite);
  notify("קישור הזמנה נוצר","success"); }
 async function toggleInviteActive() {
  if (!invite) return;
  const updated = { ...invite, active:!invite.active };
  await sSet("tac:invite", updated, true);
  setInvite(updated);
  notify(updated.active ? "קישור הופעל" : "קישור נחסם"); }
 async function revokeInvite() {
  await sSet("tac:invite", null, true);
  setInvite(null);
  notify("קישור נמחק"); }
 function copyInviteUrl() {
  if (!inviteUrl) return;
  navigator.clipboard?.writeText(inviteUrl).then(() => {
   setCopied(true);
   setTimeout(() => setCopied(false), 2500);
  }); }
 const pending = users.filter(u=>u.role==="pending");
 const active  = users.filter(u=>u.role!=="pending");
 const RolePill = ({role,blocked}) => {
  if (blocked) return <span style={{background:"#3d1515",color:"#f87171",padding:"2px 8px",borderRadius:12,fontSize:11,fontWeight:600}}>🚫 חסום</span>;
  const c = ROLE_COLORS[role]||{bg:"#1e293b",color:"#94a3b8"};
  return <span style={{...c,padding:"2px 8px",borderRadius:12,fontSize:11,fontWeight:600}}>{ROLE_LABELS[role]||role}</span>;
 };
 return (
  <div>
   <PanelHeader title="ניהול משתמשים" icon="⚙️">
    <StatChip icon="👤" count={active.length}   color="#93c5fd" bg="#0d1f3c" label="פעילים"/>
    {pending.length>0&&<StatChip icon="⏳" count={pending.length} color="#fbbf24" bg="#2a2a1a" label="ממתינים"/>}
    <StatChip icon="🚫" count={users.filter(u=>u.blocked).length} color="#f87171" bg="#3d1515" label="חסומים"/>
   </PanelHeader>
   
   <div style={{display:"flex",gap:4,marginBottom:16}}>
    {[["users","👥 משתמשים"],["create","➕ משתמש חדש"],["invite","🔗 קישור הרשמה"]].map(([id,label])=>(
     <button key={id} onClick={()=>setTab(id)}
      style={{...S.btnSmall,...(tab===id?{background:"#1e3a5f",borderColor:"#3b82f6",color:"#93c5fd"}:{})}}>
      {label} </button>
    ))} </div>
   
   {tab==="create" && (
    <div style={S.formCard}>
     <div style={{fontWeight:700,color:"#93c5fd",marginBottom:14}}>➕ יצירת משתמש חדש</div>
     <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
      <div>
       <div style={S.label}>שם מלא *</div>
       <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
        style={S.input} placeholder="שם המשתמש"/> </div>
      <div>
       <div style={S.label}>אימייל *</div>
       <input value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}
        type="email" style={S.input} placeholder="user@example.com"/> </div>
      <div>
       <div style={S.label}>תפקיד</div>
       <select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} style={S.select}>
        {ROLES_SYSTEM.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)} </select> </div>
      <div>
       <div style={S.label}>סיסמה ראשונית *</div>
       <div style={{position:"relative"}}>
        <input value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))}
         type={showPwd.create?"text":"password"} style={{...S.input,paddingLeft:32}} placeholder="הגדר סיסמה..."/>
        <button onClick={()=>setShowPwd(p=>({...p,create:!p.create}))}
         style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#64748b",fontSize:13}}>
         {showPwd.create?"🙈":"👁"} </button> </div> </div> </div>
     <div style={{fontSize:11,color:"#64748b",marginBottom:12}}>
      💡 המשתמש יוכל להתחבר עם האימייל והסיסמה שהגדרת. בכניסה ראשונה יתבקש לאשר את הסיסמה. </div>
     <button onClick={createUser}
      disabled={!form.name||!form.email.includes("@")||!form.password}
      style={{...S.btnPrimary,opacity:(!form.name||!form.email.includes("@")||!form.password)?0.4:1}}>
      ➕ צור משתמש </button> </div> )}
   
   {tab==="users" && pending.length>0 && (
    <div style={{...S.formCard,borderColor:"#d97706",marginBottom:16}}>
     <div style={{color:"#fbbf24",fontWeight:700,marginBottom:10}}>⏳ בקשות ממתינות ({pending.length})</div>
     {pending.map(u=>(
      <div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
       padding:"8px 0",borderBottom:"1px solid #1e293b"}}>
       <div>
        <strong style={{color:"#e2e8f0"}}>{u.name}</strong>
        <span style={{color:"#64748b",marginRight:8,fontSize:12}}>{u.email}</span> </div>
       <div style={{display:"flex",gap:6}}>
        <button onClick={()=>setRole(u.id,"viewer")} style={{...S.btnSmall,borderColor:"#4ade80",color:"#4ade80"}}>✓ חייל</button>
        <button onClick={()=>setRole(u.id,"manager")} style={{...S.btnSmall,borderColor:"#93c5fd",color:"#93c5fd"}}>✓ מפקד</button>
        <button onClick={()=>removeUser(u.id)} style={{...S.btnSmall,borderColor:"#f87171",color:"#f87171"}}>✗ דחה</button>
       </div> </div>
     ))} </div> )}
   
   {resetTarget && (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:1000,
     display:"flex",alignItems:"center",justifyContent:"center"}}>
     <div style={{...S.formCard,width:340,boxShadow:"0 20px 60px #000"}}>
      <div style={{fontWeight:700,color:"#fbbf24",marginBottom:12}}>🔑 איפוס סיסמה</div>
      <div style={{color:"#94a3b8",fontSize:13,marginBottom:12}}>
       {users.find(u=>u.id===resetTarget)?.name} ({users.find(u=>u.id===resetTarget)?.email}) </div>
      <div style={S.label}>סיסמה חדשה</div>
      <div style={{position:"relative",marginBottom:12}}>
       <input value={resetPwd} onChange={e=>setResetPwd(e.target.value)}
        type={showPwd.reset?"text":"password"} style={{...S.input,paddingLeft:32}} placeholder="סיסמה חדשה..."/>
       <button onClick={()=>setShowPwd(p=>({...p,reset:!p.reset}))}
        style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#64748b",fontSize:13}}>
        {showPwd.reset?"🙈":"👁"} </button> </div>
      <div style={{display:"flex",gap:8}}>
       <button onClick={doResetPassword} disabled={!resetPwd}
        style={{...S.btnPrimary,flex:1,opacity:resetPwd?1:0.4}}>שמור סיסמה חדשה</button>
       <button onClick={()=>{setResetTarget(null);setResetPwd("");}} style={{...S.btnGhost}}>ביטול</button> </div>
     </div> </div> )}
   
   {tab==="users" && (
    <div style={S.tableWrap}>
     <table style={S.table}>
      <thead><tr>{["שם","אימייל","תפקיד","קישור לחייל","פעולות"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
      <tbody>
       {active.map((u,i)=>(
        <tr key={u.id} style={{...S.tr,...(i%2===0?S.trAlt:{}),
         ...(u.blocked?{opacity:0.6}:{})}}>
         <td style={S.td}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
           <strong style={{color:"#e2e8f0"}}>{u.name}</strong>
           {u.id===currentUser?.id&&<span style={{...S.badge,background:"#0d3320",color:"#4ade80",fontSize:10}}>אתה</span>}
           <RolePill role={u.role} blocked={u.blocked}/> </div> </td>
         <td style={{...S.td,fontSize:12,color:"#64748b"}}>{u.email}</td>
         <td style={S.td}>
          <select value={u.role} onChange={e=>setRole(u.id,e.target.value)}
           disabled={u.id===currentUser?.id||u.blocked}
           style={{...S.select,padding:"3px 8px",fontSize:12,width:"auto"}}>
           {ROLES_SYSTEM.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)} </select> </td>
         <td style={S.td}>
          <select value={u.soldierId||""} onChange={e=>linkSoldier(u.id,e.target.value)}
           style={{...S.select,padding:"3px 8px",fontSize:12,width:"auto"}}>
           <option value="">— לא מקושר —</option>
           {(dep?.soldiers||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)} </select> </td>
         <td style={S.td}>
          <div style={{display:"flex",gap:4}}>
           <button onClick={()=>{setResetTarget(u.id);setResetPwd("");}}
            title="איפוס סיסמה"
            style={{...S.iconBtn,fontSize:14}} disabled={u.id===currentUser?.id}>
            🔑 </button>
           <button onClick={()=>toggleBlock(u.id)}
            title={u.blocked?"שחרר חסימה":"חסום משתמש"}
            style={{...S.iconBtn,fontSize:14,color:u.blocked?"#4ade80":"#f87171"}}
            disabled={u.id===currentUser?.id}>
            {u.blocked?"✅":"🚫"} </button>
           <button onClick={()=>removeUser(u.id)}
            title="מחק משתמש"
            style={{...S.iconBtn,fontSize:14}}
            disabled={u.id===currentUser?.id}>
            🗑️ </button> </div> </td> </tr>
       ))}
       {active.length===0&&<tr><td colSpan={5} style={S.emptyCell}>אין משתמשים</td></tr>}
      </tbody>
     </table> </div> )}
   
   {tab==="invite" && (
    <div style={{maxWidth:540}}>
     <div style={{background:"#0a0f1a",border:"1px solid #1e293b",borderRadius:12,padding:"20px 24px",marginBottom:16}}>
      <div style={{fontWeight:700,color:"#93c5fd",fontSize:14,marginBottom:4}}>🔗 קישור הרשמה עצמית</div>
      <div style={{fontSize:12,color:"#64748b",marginBottom:16,lineHeight:1.6}}>
       צור קישור ייחודי ושלח אותו לאנשים שאתה רוצה שיירשמו בעצמם למערכת.
       כל מי שנכנס דרך הקישור יוכל להירשם עם שם, אימייל וסיסמה שהוא בוחר.
       תוכל לנעול את הקישור בכל עת — מי שנרשם כבר יישאר במערכת. </div>
      
      <div style={{marginBottom:16}}>
       <div style={S.label}>תפקיד ברירת מחדל לנרשמים</div>
       <select value={inviteRole} onChange={e=>setInviteRole(e.target.value)}
        style={{...S.select,width:"auto",marginTop:6}}>
        {ROLES_SYSTEM.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)} </select> </div>
      {!invite ? (
       <button onClick={generateInvite} style={S.btnPrimary}>
        🔗 צור קישור הרשמה </button>
      ) : (
       <div style={{display:"flex",flexDirection:"column",gap:12}}>
        
        <div style={{display:"flex",alignItems:"center",gap:10}}>
         <div style={{width:10,height:10,borderRadius:"50%",
          background:invite.active?"#4ade80":"#f87171",
          boxShadow:`0 0 6px ${invite.active?"#4ade80":"#f87171"}`}}/>
         <span style={{fontSize:13,color:invite.active?"#4ade80":"#f87171",fontWeight:600}}>
          {invite.active?"קישור פעיל":"קישור נעול"} </span>
         <span style={{fontSize:11,color:"#64748b",marginRight:"auto"}}>
          נוצר: {new Date(invite.createdAt).toLocaleDateString("he-IL")} ·
          תפקיד: {ROLE_LABELS[invite.defaultRole]} </span> </div>
        
        <div style={{background:"#06090f",border:`1px solid ${invite.active?"#16a34a":"#dc2626"}`,
         borderRadius:8,padding:"10px 14px",
         opacity:invite.active?1:0.5,position:"relative"}}>
         <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>קישור הרשמה:</div>
         <div style={{fontFamily:"monospace",fontSize:12,color:"#cbd5e1",
          wordBreak:"break-all",paddingLeft:80}}>
          {inviteUrl} </div>
         <button onClick={copyInviteUrl}
          disabled={!invite.active}
          style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",
           ...S.btnPrimary,padding:"5px 14px",fontSize:12,
           background:copied?"#15803d":"linear-gradient(135deg,#16a34a,#15803d)"}}>
          {copied?"✓ הועתק!":"📋 העתק"} </button> </div>
        
        {invite.active && (
         <div style={{fontSize:11,color:"#64748b",background:"#080c14",
          borderRadius:6,padding:"6px 12px"}}>
          💡 שלח את הקישור בוואטסאפ, אימייל, או הפוך אותו ל-QR code </div> )}
        
        <div style={{display:"flex",gap:8,marginTop:4}}>
         <button onClick={toggleInviteActive}
          style={{...S.btnSmall,
           borderColor:invite.active?"#f87171":"#4ade80",
           color:invite.active?"#f87171":"#4ade80"}}>
          {invite.active?"🔒 נעל קישור":"🔓 הפעל קישור"} </button>
         <button
          onClick={async()=>{
           const updated={...invite,defaultRole:inviteRole};
           await sSet("tac:invite",updated,true);
           setInvite(updated);
           notify("תפקיד עודכן");
          }}
          style={{...S.btnSmall,borderColor:"#3b82f6",color:"#93c5fd"}}>
          💾 עדכן תפקיד </button>
         <button onClick={generateInvite}
          style={{...S.btnSmall}}>
          🔄 צור קישור חדש </button>
         <button onClick={revokeInvite}
          style={{...S.btnSmall,borderColor:"#dc2626",color:"#f87171"}}>
          🗑 מחק קישור </button> </div>
        
        {users.filter(u=>u.inviteRegistered).length > 0 && (
         <div style={{borderTop:"1px solid #1e293b",paddingTop:12,marginTop:4}}>
          <div style={{fontSize:12,color:"#64748b",marginBottom:8}}>
           נרשמו דרך קישור ({users.filter(u=>u.inviteRegistered).length}): </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
           {users.filter(u=>u.inviteRegistered).map(u=>(
            <span key={u.id} style={{background:"#080c14",border:"1px solid #1e293b",
             borderRadius:8,padding:"3px 10px",fontSize:12,color:"#cbd5e1"}}>
             {u.name}
             <span style={{color:"#64748b",marginRight:4}}>({ROLE_LABELS[u.role]})</span> </span>
           ))} </div> </div> )} </div> )} </div> </div> )} </div> ); }
/* ===========================================================
 REUSABLE COMPONENTS
=========================================================== */
function PanelHeader({ title, icon, count, countLabel, children }) {
 return (
  <div style={S.panelHead}>
   <div>
    <h2 style={S.panelTitle}>{icon} {title}</h2>
    {count!=null&&<span style={S.badge}>{count} {countLabel}</span>} </div>
   <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>{children}</div> </div> ); }
function FormCard({ title, onClose, children }) {
 return (
  <div style={S.formCard}>
   <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
    <h3 style={S.formTitle}>{title}</h3>
    {onClose&&<button onClick={onClose} style={{...S.iconBtn,fontSize:18,color:"#475569"}}>✕</button>} </div>
   {children} </div> ); }
function FormField({ label, children, wide }) {
 return (
  <div style={{...S.field,...(wide?{gridColumn:"span 2"}:{})}}>
   <label style={S.label}>{label}</label>
   {children} </div> ); }
function CertPicker({ value, onChange }) {
 function toggle(c) { onChange(value.includes(c)?value.filter(x=>x!==c):[...value,c]); }
 return (
  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
   {CERTS.map(c=>(
    <button key={c} onClick={()=>toggle(c)}
     style={{...S.chip,...(value.includes(c)?S.chipActive:{})}}>
     {CERT_LABELS[c]} </button>
   ))} </div> ); }
function CertList({ certs=[], max=10 }) {
 const show = certs.slice(0,max);
 return (
  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
   {show.map(c=><span key={c} style={S.certTag}>{CERT_LABELS[c]}</span>)}
   {certs.length>max&&<span style={S.certTag}>+{certs.length-max}</span>} </div> ); }
function RoleBadge({ role, suffix="", small }) {
 const map = {"קצין":{bg:"#2d1b69",c:"#c4b5fd"},"מפקד משימה":{bg:"#1e3a5f",c:"#93c5fd"},"מפקד":{bg:"#0f2a1e",c:"#86efac"},"סמל":{bg:"#292524",c:"#d6d3d1"},"חייל":{bg:"#1c1917",c:"#a8a29e"}};
 const col=map[role]||{bg:"#1c1917",c:"#a8a29e"};
 return <span style={{display:"inline-block",padding:small?"1px 6px":"2px 10px",borderRadius:10,background:col.bg,color:col.c,fontSize:small?10:12,fontWeight:600}}>{role}{suffix}</span>;
}
function ToggleBtn({ on, onChange, label }) {
 return <button onClick={()=>onChange(!on)} style={{...S.chip,...(on?S.chipActive:{})}}>{on?"✓":"✗"} {label}</button>;
}
/* ===========================================================
 DATA TABLE TAB — טבלת נתונים מרכזית
=========================================================== */
function DataTableTab({ dep }) {
 const [search, setSearch]       = useState("");
 const [filterRole, setFilterRole] = useState("");
 const [filterCert, setFilterCert] = useState("");
 const [sortCol, setSortCol]     = useState("name");
 const [sortDir, setSortDir]     = useState(1);
 const soldierStats = {};
 dep.soldiers.forEach(s => { soldierStats[s.id] = { shifts: 0, hours: 0, missions: {} }; });
 (dep.assignments||[]).forEach(a => {
  (a.data||[]).forEach(m => {
   (m.shifts||[]).forEach(sh => {
    const dur = (() => {
     const s2 = timeToMins(sh.start||"00:00"), e2 = timeToMins(sh.end||"00:00");
     return (e2 > s2 ? e2 - s2 : e2 + 1440 - s2);
    })();
    (sh.soldierIds||[]).forEach(sid => {
     if (!soldierStats[sid]) return;
     soldierStats[sid].shifts++;
     soldierStats[sid].hours += dur / 60;
     soldierStats[sid].missions[m.missionName] = (soldierStats[sid].missions[m.missionName]||0) + 1;
    });
   });
  });
 });
 const presenceDays = {};
 dep.soldiers.forEach(s => { presenceDays[s.id] = 0; });
 Object.values(dep.attendance||{}).forEach(dayRec => {
  dep.soldiers.forEach(s => {
   if (getAttStatus(dayRec[s.id]) === "present") presenceDays[s.id]++;
  });
 });
 function toggleSort(col) {
  if (sortCol === col) setSortDir(d => -d);
  else { setSortCol(col); setSortDir(1); } }
 const filtered = dep.soldiers
  .filter(s =>
   (!search    || s.name.includes(search) || s.role.includes(search)) &&
   (!filterRole|| s.role === filterRole) &&
   (!filterCert|| (s.certifications||[]).includes(filterCert))
  )
  .slice()
  .sort((a, b) => {
   let va, vb;
   if (sortCol === "name")    { va = a.name;  vb = b.name; }
   else if (sortCol === "role") { va = ROLE_RANK[a.role]||0; vb = ROLE_RANK[b.role]||0; }
   else if (sortCol === "shifts") { va = soldierStats[a.id]?.shifts||0; vb = soldierStats[b.id]?.shifts||0; }
   else if (sortCol === "hours")  { va = soldierStats[a.id]?.hours||0;  vb = soldierStats[b.id]?.hours||0; }
   else if (sortCol === "days")   { va = presenceDays[a.id]||0; vb = presenceDays[b.id]||0; }
   else { va = a.name; vb = b.name; }
   if (typeof va === "string") return va.localeCompare(vb, "he") * sortDir;
   return (va - vb) * sortDir;
  });
 const SortTh = ({ col, children }) => (
  <th onClick={() => toggleSort(col)} style={{
   ...S.th, cursor:"pointer", userSelect:"none", whiteSpace:"nowrap",
   background: sortCol===col ? "#1e4a2a" : "#0d1a0d",
  }}>
   {children} {sortCol===col ? (sortDir===1?"↑":"↓") : ""} </th> );
 const totalHours  = Object.values(soldierStats).reduce((s,x)=>s+x.hours,0);
 const avgHours    = dep.soldiers.length ? (totalHours / dep.soldiers.length).toFixed(1) : 0;
 const maxH = Math.max(...dep.soldiers.map(s=>soldierStats[s.id]?.hours||0), 1);
 return (
  <div>
   <PanelHeader title="טבלת נתונים" icon="📊">
    <StatChip icon="👤" count={dep.soldiers.length}    color="#93c5fd" bg="#0d1f3c" label="חיילים"/>
    <StatChip icon="⏱"  count={`${avgHours}ש'`}       color="#4ade80" bg="#0d3320" label="ממוצע שעות"/>
    <StatChip icon="📋" count={(dep.assignments||[]).length} color="#fbbf24" bg="#2a2a1a" label="שיבוצים"/>
   </PanelHeader>
   
   <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
    <input placeholder="🔍 חיפוש שם / תפקיד..." value={search} onChange={e=>setSearch(e.target.value)}
     style={{...S.input,minWidth:180,padding:"6px 12px",fontSize:13}}/>
    <select value={filterRole} onChange={e=>setFilterRole(e.target.value)} style={{...S.input,padding:"6px 10px",fontSize:13}}>
     <option value="">כל התפקידים</option>
     {SOLDIER_ROLES.map(r=><option key={r}>{r}</option>)} </select>
    <select value={filterCert} onChange={e=>setFilterCert(e.target.value)} style={{...S.input,padding:"6px 10px",fontSize:13}}>
     <option value="">כל ההסמכות</option>
     {CERTS.map(c=><option key={c} value={c}>{CERT_LABELS[c]||c}</option>)} </select>
    {(search||filterRole||filterCert) &&
     <button onClick={()=>{setSearch("");setFilterRole("");setFilterCert("");}} style={S.btnSmall}>↺ נקה</button>}
    <span style={{fontSize:12,color:"#475569",marginRight:"auto"}}>{filtered.length} / {dep.soldiers.length} חיילים</span>
   </div>
   {dep.soldiers.length === 0
    ? <EmptyMsg>אין חיילים בתעסוקה זו.</EmptyMsg>
    : (
     <div style={S.tableWrap}>
      <table style={S.table}>
       <thead>
        <tr>
         <SortTh col="name">שם</SortTh>
         <SortTh col="role">תפקיד</SortTh>
         <th style={S.th}>טלפון</th>
         <th style={S.th}>הסמכות</th>
         <SortTh col="days">ימי נוכחות</SortTh>
         <SortTh col="shifts">משמרות</SortTh>
         <SortTh col="hours">שעות עבודה</SortTh>
         <th style={S.th}>פילוח משימות</th>
         <th style={S.th}>הערות</th> </tr>
       </thead>
       <tbody>
        {filtered.map((s, i) => {
         const st   = soldierStats[s.id] || { shifts:0, hours:0, missions:{} };
         const days = presenceDays[s.id] || 0;
         const pct  = maxH > 0 ? Math.round((st.hours / maxH) * 100) : 0;
         const col  = pct > 75 ? "#f87171" : pct > 40 ? "#fbbf24" : "#4ade80";
         const mList = Object.entries(st.missions)
          .sort((a,b) => b[1]-a[1])
          .map(([m,c]) => `${m}×${c}`)
          .join("  ");
         return (
          <tr key={s.id} style={{...S.tr,...(i%2===0?S.trAlt:{})}}>
           <td style={S.td}>
            <strong style={{color:"#e2e8f0"}}>{s.name}</strong> </td>
           <td style={S.td}><RoleBadge role={s.role}/></td>
           <td style={S.td}>
            <span style={{fontSize:12,color:s.phone?"#94a3b8":"#334155",fontFamily:"monospace"}}>
             {s.phone||"—"} </span> </td>
           <td style={S.td}><CertList certs={s.certifications}/></td>
           <td style={{...S.td,textAlign:"center"}}>
            <span style={{color: days>0?"#4ade80":"#334155",fontWeight:days>0?600:400}}>
             {days > 0 ? `${days} ימים` : "—"} </span> </td>
           <td style={{...S.td,textAlign:"center"}}>
            <span style={{color: st.shifts>0?"#e2e8f0":"#334155",fontWeight:600}}>
             {st.shifts > 0 ? st.shifts : "—"} </span> </td>
           <td style={{...S.td,minWidth:130}}>
            {st.hours > 0 ? (
             <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{flex:1,height:8,background:"#0a0e18",borderRadius:4,overflow:"hidden",border:"1px solid #1e293b",minWidth:60}}>
               <div style={{height:"100%",width:`${pct}%`,background:col,borderRadius:4}}/> </div>
              <span style={{fontSize:12,color:col,fontWeight:600,whiteSpace:"nowrap"}}>{st.hours.toFixed(1)}ש'</span>
             </div>
            ) : <span style={{color:"#334155"}}>—</span>} </td>
           <td style={{...S.td,fontSize:11,color:"#64748b",maxWidth:200}}>
            {mList || <span style={{color:"#334155"}}>—</span>} </td>
           <td style={{...S.td,fontSize:12,color:"#94a3b8",maxWidth:160}}>
            {s.notes || <span style={{color:"#334155"}}>—</span>} </td> </tr> );
        })}
       </tbody>
      </table> </div>
    ) } </div> ); }
function StatChip({ icon, count, color, bg, label }) {
 return <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:12,background:bg,color,fontSize:13}}>{icon} {count} {label}</span>;
}
function Th({ children }) { return <th style={S.th}>{children}</th>; }
function EmptyMsg({ children }) { return <div style={S.emptyMsg}>{children}</div>; }
function QuickAddSoldier({ soldiers, present, existing, onAdd }) {
 const [v,setV]=useState("");
 const avail=soldiers.filter(s=>getAttStatus(present[s.id])==="present"&&!existing.includes(s.id));
 return (
  <div style={{display:"flex",gap:4,alignItems:"center"}}>
   <select value={v} onChange={e=>setV(e.target.value)} style={{...S.select,fontSize:11,padding:"3px 6px",width:130}}>
    <option value="">+ הוסף חייל</option>
    {avail.map(s=><option key={s.id} value={s.id}>{s.name}</option>)} </select>
   {v&&<button onClick={()=>{onAdd(v);setV("");}} style={{...S.btnPrimary,padding:"3px 8px",fontSize:11}}>הוסף</button>}
  </div> ); }
/* ===========================================================
 STYLES
=========================================================== */
const S = {
 app: { minHeight:"100vh", background:"#06090f", color:"#e2e8f0", fontFamily:"'Segoe UI', Tahoma, sans-serif", direction:"rtl" }, loadWrap: { minHeight:"100vh", background:"#06090f", display:"flex", alignItems:"center", justifyContent:"center" },
 loadContent: { textAlign:"center" }, loadGlyph: { fontSize:56, color:"#4ade80", filter:"drop-shadow(0 0 20px #4ade80)", marginBottom:20, animation:"pulse 1.5s ease-in-out infinite" },
 loadBar: { width:200, height:3, background:"#1e293b", borderRadius:2, margin:"0 auto 12px", overflow:"hidden" }, loadProgress: { height:"100%", background:"linear-gradient(90deg,#4ade80,#22d3ee)", animation:"scan 1.5s ease-in-out infinite" },
 loadText: { color:"#4ade80", fontSize:12, letterSpacing:4, fontFamily:"monospace" }, loginWrap: { minHeight:"100vh", background:"#06090f", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", overflow:"hidden", position:"relative" },
 gridBg: { position:"fixed", inset:0, backgroundImage:"linear-gradient(#0d1a0d 1px,transparent 1px),linear-gradient(90deg,#0d1a0d 1px,transparent 1px)", backgroundSize:"40px 40px", opacity:0.6, pointerEvents:"none" }, scanLine: { position:"fixed", left:0, right:0, height:2, background:"linear-gradient(90deg,transparent,#4ade8033,transparent)", pointerEvents:"none", transition:"top 0.04s linear" },
 loginCard: { position:"relative", background:"rgba(10,15,25,0.95)", border:"1px solid #1e3a2e", borderRadius:16, padding:"48px 40px", width:380, textAlign:"center", boxShadow:"0 0 60px #4ade8011, 0 0 120px #4ade8008" }, loginGlyph: { fontSize:48, color:"#4ade80", filter:"drop-shadow(0 0 16px #4ade80)", marginBottom:12 },
 loginTitle: { fontSize:28, fontWeight:800, color:"#e2e8f0", letterSpacing:6, fontFamily:"monospace" }, loginSubtitle: { color:"#4ade80", fontSize:13, letterSpacing:2, marginTop:4, marginBottom:28 },
 firstUserNote: { background:"#0d2a1a", border:"1px solid #16a34a", borderRadius:8, padding:"8px 14px", color:"#4ade80", fontSize:12, marginBottom:20 }, loginForm: { display:"flex", flexDirection:"column", gap:14, textAlign:"right" },
 inputGroup: { display:"flex", flexDirection:"column", gap:6 }, loginLabel: { color:"#94a3b8", fontSize:12, letterSpacing:1, textTransform:"uppercase" },
 loginInput: { background:"#0d1117", border:"1px solid #1e3a2e", borderRadius:8, padding:"10px 14px", color:"#e2e8f0", fontSize:14, outline:"none", width:"100%", boxSizing:"border-box" }, loginBtn: { marginTop:8, padding:"13px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#16a34a,#15803d)", color:"white", fontSize:15, fontWeight:700, cursor:"pointer", letterSpacing:1, boxShadow:"0 0 20px #4ade8033" },
 pendingBox: { padding:"20px 0" }, loginFooter: { position:"absolute", bottom:16, color:"#1e3a2e", fontSize:10, letterSpacing:3, fontFamily:"monospace" },
 header: { background:"rgba(6,9,15,0.98)", borderBottom:"1px solid #0d2a1a", padding:"0 24px", position:"sticky", top:0, zIndex:200, backdropFilter:"blur(10px)" }, headerInner: { maxWidth:1280, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", height:64, gap:16 },
 logo: { display:"flex", alignItems:"center", gap:12, flexShrink:0 }, logoGlyph: { fontSize:26, color:"#4ade80", filter:"drop-shadow(0 0 8px #4ade80)" },
 logoTitle: { fontSize:16, fontWeight:800, color:"#e2e8f0", letterSpacing:3, fontFamily:"monospace" }, logoSub: { fontSize:10, color:"#4ade80", letterSpacing:2 },
 depArea: { display:"flex", gap:6, alignItems:"center", flexWrap:"wrap", flex:1, justifyContent:"center" }, depPill: { padding:"5px 14px", borderRadius:20, border:"1px solid #1e293b", background:"transparent", color:"#64748b", cursor:"pointer", fontSize:13 },
 depPillActive: { background:"#0d3320", color:"#4ade80", borderColor:"#16a34a" }, depAddBtn: { padding:"5px 12px", borderRadius:20, border:"1px dashed #0d2a1a", background:"transparent", color:"#475569", cursor:"pointer", fontSize:12 },
 userArea: { display:"flex", alignItems:"center", gap:10, flexShrink:0 }, rolePill: { padding:"3px 10px", borderRadius:12, fontSize:11, fontWeight:600 },
 userName: { color:"#cbd5e1", fontSize:13 }, logoutBtn: { padding:"5px 12px", borderRadius:6, border:"1px solid #0d2a1a", background:"transparent", color:"#475569", cursor:"pointer", fontSize:12 },
 notif: { position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", background:"#0d3320", color:"#4ade80", border:"1px solid #16a34a", borderRadius:8, padding:"10px 20px", zIndex:999, fontSize:14, boxShadow:"0 4px 20px #0004" }, notifWarn: { background:"#2a1f0a", color:"#fbbf24", borderColor:"#d97706" },
 notifErr: { background:"#1f0a0a", color:"#f87171", borderColor:"#dc2626" }, workspace: { maxWidth:1280, margin:"0 auto", padding:"0 24px 40px" },
 emptyWrap: { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"60vh", gap:16 }, emptyGlyph: { fontSize:64, color:"#1e293b", filter:"drop-shadow(0 0 16px #4ade8022)" },
 emptyTitle: { fontSize:22, fontWeight:700, color:"#475569", margin:0 }, tabBar: { display:"flex", borderBottom:"1px solid #0d2a1a", marginBottom:24, paddingTop:12, gap:0 },
 tab: { display:"flex", alignItems:"center", gap:8, padding:"10px 20px", border:"none", background:"transparent", color:"#475569", cursor:"pointer", fontSize:13, fontWeight:500, position:"relative", transition:"color 0.2s" }, tabActive: { color:"#4ade80" },
 tabUnderline: { position:"absolute", bottom:-1, left:0, right:0, height:2, background:"linear-gradient(90deg,#4ade80,#22d3ee)", borderRadius:2 }, tabContent: {},
 panelHead: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }, panelTitle: { fontSize:20, fontWeight:700, color:"#e2e8f0", margin:"0 0 6px" },
 formCard: { background:"#0a0f1a", border:"1px solid #1e293b", borderRadius:12, padding:"20px 24px", marginBottom:20 }, formTitle: { color:"#4ade80", fontSize:14, fontWeight:700, margin:0, letterSpacing:1, textTransform:"uppercase" },
 formGrid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }, field: { display:"flex", flexDirection:"column", gap:5 },
 formActions: { display:"flex", gap:8, paddingTop:16, borderTop:"1px solid #080c14", marginTop:16 }, label: { color:"#64748b", fontSize:12, fontWeight:500, letterSpacing:0.5 },
 input: { background:"#06090f", border:"1px solid #1e293b", borderRadius:6, padding:"8px 12px", color:"#e2e8f0", fontSize:13, outline:"none", width:"100%", boxSizing:"border-box" }, select: { background:"#06090f", border:"1px solid #1e293b", borderRadius:6, padding:"8px 12px", color:"#e2e8f0", fontSize:13, width:"100%" },
 chip: { padding:"5px 12px", borderRadius:14, border:"1px solid #1e293b", background:"transparent", color:"#475569", cursor:"pointer", fontSize:12, transition:"all 0.15s" }, chipActive: { background:"#0d3320", color:"#4ade80", borderColor:"#16a34a" },
 certTag: { display:"inline-block", padding:"2px 8px", borderRadius:6, background:"#080c14", border:"1px solid #1e293b", color:"#64748b", fontSize:11 }, tableWrap: { background:"#0a0f1a", border:"1px solid #0d2a1a", borderRadius:12, overflow:"auto" },
 table: { width:"100%", borderCollapse:"collapse" }, th: { padding:"11px 14px", background:"#06090f", color:"#4ade80", fontSize:12, fontWeight:600, borderBottom:"1px solid #0d2a1a", textAlign:"right", letterSpacing:1, textTransform:"uppercase" },
 tr: { transition:"background 0.1s" }, trAlt: { background:"#080c14" },
 td: { padding:"11px 14px", color:"#cbd5e1", fontSize:13, borderBottom:"1px solid #0a0f1a" }, emptyCell: { padding:32, textAlign:"center", color:"#334155", fontSize:14 },
 btnPrimary: { padding:"8px 18px", borderRadius:6, border:"none", background:"linear-gradient(135deg,#16a34a,#15803d)", color:"white", cursor:"pointer", fontSize:13, fontWeight:600, letterSpacing:0.5, whiteSpace:"nowrap" }, btnGhost: { padding:"8px 18px", borderRadius:6, border:"1px solid #1e293b", background:"transparent", color:"#64748b", cursor:"pointer", fontSize:13 },
 btnSmall: { padding:"4px 10px", borderRadius:5, border:"1px solid #1e293b", background:"transparent", color:"#475569", cursor:"pointer", fontSize:12 }, iconBtn: { padding:"4px 8px", borderRadius:4, border:"none", background:"transparent", color:"#475569", cursor:"pointer", fontSize:15 },
 statusBtn: { padding:"4px 12px", borderRadius:6, border:"1px solid #1e293b", background:"transparent", color:"#475569", cursor:"pointer", fontSize:12 }, statusPresent: { background:"#071510", color:"#4ade80", borderColor:"#16a34a" },
 statusAbsent: { background:"#150707", color:"#f87171", borderColor:"#dc2626" }, datePill: { padding:"5px 12px", borderRadius:6, border:"1px solid #1e293b", background:"transparent", color:"#475569", cursor:"pointer", fontSize:12 },
 datePillActive: { background:"#071510", color:"#4ade80", borderColor:"#16a34a" }, mCard: { background:"#0a0f1a", border:"1px solid #1e293b", borderRight:"3px solid #1e293b", borderRadius:8, padding:"12px 16px" },
 mCardTop: { display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap" }, assignCard: { background:"#0a0f1a", border:"1px solid #1e293b", borderRadius:12, padding:"16px 20px", marginBottom:12 },
 assignHead: { display:"flex", justifyContent:"space-between", alignItems:"center", paddingBottom:10, borderBottom:"1px solid #06090f" }, shiftRow: { background:"#06090f", border:"1px solid #0d2a1a", borderRadius:8, padding:"10px 12px" },
 shiftWarn: { borderColor:"#7f1d1d", background:"#0f0606" }, assignedChip: { display:"flex", alignItems:"center", gap:6, padding:"4px 10px", background:"#080c14", borderRadius:6, border:"1px solid #1e293b" },
 shiftPreview: { padding:"3px 10px", borderRadius:5, background:"#06090f", border:"1px solid #1e293b", color:"#64748b", fontSize:12 }, mSelectRow: { display:"flex", alignItems:"center", gap:8, padding:"9px 12px", borderRadius:7, border:"1px solid #1e293b", cursor:"pointer", flexWrap:"wrap" },
 mSelectActive: { background:"#071510", borderColor:"#16a34a" }, myShiftHero: { display:"flex", alignItems:"center", gap:20, padding:"20px 24px", background:"#0a0f1a", borderRadius:12, border:"1px solid #1e293b", marginBottom:24 },
 myShiftAvatar: { width:56, height:56, borderRadius:"50%", background:"linear-gradient(135deg,#16a34a,#0d9488)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, fontWeight:700, color:"white", flexShrink:0 }, myShiftCard: { background:"#0a0f1a", border:"1px solid #1e293b", borderRadius:10, padding:"14px 18px" },
 sectionTitle: { fontSize:14, fontWeight:600, color:"#4ade80", letterSpacing:1, textTransform:"uppercase", marginBottom:10, marginTop:20 }, badge: { display:"inline-block", padding:"2px 10px", borderRadius:10, background:"#080c14", color:"#64748b", fontSize:12, border:"1px solid #1e293b" },
 alert: { padding:"12px 16px", borderRadius:8, border:"1px solid", background:"#0a0f1a", marginBottom:16, fontSize:13 }, emptyMsg: { padding:"32px", textAlign:"center", color:"#334155", background:"#0a0f1a", border:"1px solid #1e293b", borderRadius:10, fontSize:14 },
};
const globalCSS = `
*{box-sizing:border-box}
 body{margin:0;background:#06090f}
 input:focus,select:focus{border-color:#16a34a!important;box-shadow:0 0 0 2px #4ade8018!important;outline:none}
 button{transition:opacity 0.15s,transform 0.1s}
 button:hover{opacity:0.85}
 button:active{transform:scale(0.97)}
 ::-webkit-scrollbar{width:5px;height:5px}
 ::-webkit-scrollbar-track{background:#06090f}
 ::-webkit-scrollbar-thumb{background:#1e293b;border-radius:3px}
 .loginCard{animation:fadeUp 0.5s ease}
 .spin{display:inline-block;animation:spin 1s linear infinite}
 @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
 @keyframes spin{to{transform:rotate(360deg)}}
 @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
 @keyframes scan{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
 select option{background:#080c14;color:#e2e8f0}
`;