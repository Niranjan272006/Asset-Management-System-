import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import axios from "axios";

const API = "http://127.0.0.1:8000/api";

const USER_STATUS_OPTIONS = [
  { value: "yet_to_join", label: "Yet to Join" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "not_joined", label: "Not Joined" },
  { value: "discontinued", label: "Discontinued" },
  { value: "on_hold", label: "On Hold" },
];

const TIME_OPTIONS = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    const val = `${hh}:${mm}`;
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const label = `${String(hour12).padStart(2, "0")}:${mm} ${h < 12 ? "AM" : "PM"}`;
    TIME_OPTIONS.push({ value: val, label });
  }
}

function formatTime12(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const hr12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(hr12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
function formatDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
function isPastEndTime(ed, et) {
  const now = new Date();
  const [h, m] = et.split(":").map(Number);
  const end = new Date(ed + "T00:00:00"); end.setHours(h, m, 0, 0);
  return now > end;
}

function BarChart({ data, valueKey, labelKey, color, dark }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d[valueKey]));
  const W = 100, H = 60, barW = Math.min(20, (W / data.length) - 4);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 80 }}>
      {data.map((d, i) => {
        const barH = max > 0 ? (d[valueKey] / max) * (H - 16) : 0;
        const x = (i / data.length) * W + (W / data.length - barW) / 2;
        const y = H - 12 - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={3} fill={color} opacity={0.85} />
            <text x={x + barW / 2} y={H - 2} textAnchor="middle" fontSize={5} fill={dark ? "#6b7280" : "#9ca3af"}>
              {String(d[labelKey]).split(" ")[0].slice(0, 6)}
            </text>
            <text x={x + barW / 2} y={y - 2} textAnchor="middle" fontSize={5} fill={color} fontWeight="bold">{d[valueKey]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function DonutChart({ segments, size = 80 }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return null;
  let cumulative = 0;
  const r = 30, cx = size / 2, cy = size / 2;
  const slices = segments.map(seg => {
    const pct = seg.value / total;
    const start = cumulative; cumulative += pct;
    const sa = start * 2 * Math.PI - Math.PI / 2;
    const ea = cumulative * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
    const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
    return { ...seg, d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${pct > 0.5 ? 1 : 0} 1 ${x2} ${y2} Z` };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} opacity={0.9} />)}
      <circle cx={cx} cy={cy} r={r * 0.55} fill="var(--card-bg)" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10} fontWeight="bold" fill="var(--text-primary)">{total}</text>
    </svg>
  );
}

function StatusBadge({ status }) {
  const map = {
    available:   { bg: "var(--green-bg)",  color: "var(--green)",  label: "Available" },
    in_use:      { bg: "var(--red-bg)",    color: "var(--red)",    label: "In Use" },
    maintenance: { bg: "var(--amber-bg)",  color: "var(--amber)",  label: "Maintenance" },
    with_us:     { bg: "var(--blue-bg)",   color: "var(--blue)",   label: "With Us" },
    active:      { bg: "var(--red-bg)",    color: "var(--red)",    label: "Active" },
    completed:   { bg: "var(--green-bg)",  color: "var(--green)",  label: "Returned" },
  };
  const s = map[status] || map.available;
  return <span style={{ background: s.bg, color: s.color, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>{s.label}</span>;
}

function DatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef();
  const popRef = useRef();

  function parse(v) {
    if (v && v.length === 10) {
      const [d, m, y] = v.split("/").map(Number);
      if (d && m && y) return { d, m, y };
    }
    const n = new Date();
    return { d: n.getDate(), m: n.getMonth() + 1, y: n.getFullYear() };
  }

  const parsed = parse(value);
  const [viewY, setViewY] = useState(parsed.y);
  const [viewM, setViewM] = useState(parsed.m);

  function openCal() {
    const p = parse(value); setViewY(p.y); setViewM(p.m);
    const r = btnRef.current.getBoundingClientRect();
    const calW = 210;
    const calH = 230;
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow >= calH ? r.bottom + 4 : r.top - calH - 4;
    const left = r.right + calW > window.innerWidth ? window.innerWidth - calW - 8 : r.right - calW;
    setPos({ top, left });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (popRef.current && !popRef.current.contains(e.target) && e.target !== btnRef.current)
        setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const firstDay = new Date(viewY, viewM - 1, 1).getDay();
  const daysInMonth = new Date(viewY, viewM, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function select(d) {
    onChange(`${String(d).padStart(2,"0")}/${String(viewM).padStart(2,"0")}/${viewY}`);
    setOpen(false);
  }

  const selD = value && value.length === 10 ? Number(value.split("/")[0]) : null;
  const selM = value && value.length === 10 ? Number(value.split("/")[1]) : null;
  const selY = value && value.length === 10 ? Number(value.split("/")[2]) : null;
  const isSel = d => d === selD && viewM === selM && viewY === selY;

  const popup = open && ReactDOM.createPortal(
    <div ref={popRef} style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 99999,
      background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 10,
      boxShadow: "0 8px 32px rgba(0,0,0,0.35)", padding: 10, width: 210 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button type="button" onMouseDown={e => { e.preventDefault(); e.stopPropagation(); if (viewM===1){setViewM(12);setViewY(y=>y-1);}else setViewM(m=>m-1); }}
          style={{ background:"none",border:"none",cursor:"pointer",color:"var(--accent)",fontSize:16,padding:"0 6px",lineHeight:1 }}>‹</button>
        <span style={{ fontSize:12,fontWeight:700,color:"var(--text-primary)" }}>{MONTHS[viewM-1]} {viewY}</span>
        <button type="button" onMouseDown={e => { e.preventDefault(); e.stopPropagation(); if (viewM===12){setViewM(1);setViewY(y=>y+1);}else setViewM(m=>m+1); }}
          style={{ background:"none",border:"none",cursor:"pointer",color:"var(--accent)",fontSize:16,padding:"0 6px",lineHeight:1 }}>›</button>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1,marginBottom:4 }}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d=><div key={d} style={{textAlign:"center",fontSize:9,fontWeight:700,color:"var(--text-muted)",padding:"2px 0"}}>{d}</div>)}
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2 }}>
        {cells.map((d,i) => d===null ? <div key={i}/> :
          <button key={i} type="button"
            onMouseDown={e=>{e.preventDefault();e.stopPropagation();select(d);}}
            style={{ textAlign:"center",fontSize:11,padding:"5px 2px",borderRadius:5,border:"none",cursor:"pointer",
              background:isSel(d)?"var(--accent)":"transparent",
              color:isSel(d)?"#fff":"var(--text-primary)",fontWeight:isSel(d)?700:400 }}
            onMouseEnter={e=>{if(!isSel(d))e.currentTarget.style.background="var(--hover-bg)";}}
            onMouseLeave={e=>{if(!isSel(d))e.currentTarget.style.background="transparent";}}>{d}</button>
        )}
      </div>
    </div>,
    document.body
  );

  return (
    <div style={{ display:"flex",alignItems:"center",border:"1px solid var(--accent)",borderRadius:6,overflow:"hidden",background:"var(--input-bg)",width:"100%" }}>
      <input type="text" placeholder="dd/mm/yyyy" maxLength={10} value={value} onChange={e=>onChange(e.target.value)}
        style={{ flex:1,padding:"9px 12px",fontSize:14,background:"transparent",color:"var(--text-primary)",border:"none",outline:"none",fontFamily:"inherit",minWidth:0 }}
      />
      <button ref={btnRef} type="button" onClick={openCal}
        style={{ background:"var(--accent-bg)",border:"none",padding:"4px 7px",cursor:"pointer",color:"var(--accent)",fontSize:12,lineHeight:1,flexShrink:0 }}>📅</button>
      {popup}
    </div>
  );
}

function UserStatusBadge({ status }) {
  const map = {
    yet_to_join:  { bg: "var(--blue-bg)",   color: "var(--blue)",   label: "Yet to Join" },
    in_progress:  { bg: "var(--red-bg)",    color: "var(--red)",    label: "In Progress" },
    completed:    { bg: "var(--green-bg)",  color: "var(--green)",  label: "Completed" },
    not_joined:   { bg: "var(--amber-bg)",  color: "var(--amber)",  label: "Not Joined" },
    discontinued: { bg: "var(--red-bg)",    color: "var(--red)",    label: "Discontinued" },
    on_hold:      { bg: "var(--accent-bg)", color: "var(--accent)", label: "On Hold" },
  };
  const s = map[status] || map.yet_to_join;
  return <span style={{ background: s.bg, color: s.color, padding: "3px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: "0.02em", whiteSpace: "nowrap", display: "inline-block" }}>{s.label}</span>;
}

export default function App() {
  const today = new Date().toISOString().split("T")[0];
  const [dark, setDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [page, setPage]               = useState("availability");
  const [dashboard, setDashboard]     = useState(null);
  const [message, setMessage]         = useState("");
  const [msgType, setMsgType]         = useState("success");

  // ── Availability
  const [availData, setAvailData]     = useState(null);
  const [availLoaded, setAvailLoaded] = useState(false);
  const [checkSD, setCheckSD] = useState(today.split("-").reverse().join("/"));
  const [checkST, setCheckST] = useState("09:00");
  const [checkResult, setCheckResult] = useState(null);
  const [checkLoading, setCheckLoading] = useState(false);

  function toISO(dmy) { const [d,m,y] = dmy.split("/"); return `${y}-${m}-${d}`; }
  function checkAvailability() {
    const iso = toISO(checkSD);
    setCheckLoading(true);
    axios.get(`${API}/laptops/by-time/`, { params: { start_date: iso, start_time: checkST, end_date: iso, end_time: checkST } })
      .then(r => { setCheckResult(r.data.available || []); setCheckLoading(false); });
  }

  // ── Laptops
  const [laptops, setLaptops]         = useState([]);
  const [laptopSearch, setLaptopSearch] = useState("");
  const [laptopFilter, setLaptopFilter] = useState("all");
  const [openMenuId, setOpenMenuId] = useState(null);
  const [editId, setEditId]           = useState(null);
  const [editName, setEditName]       = useState(""); const [editSerial, setEditSerial] = useState("");
  const [editModel, setEditModel]     = useState(""); const [editRam, setEditRam]       = useState("");
  const [editLoc, setEditLoc]         = useState("");
  const [newName, setNewName]         = useState(""); const [newSerial, setNewSerial]   = useState("");
  const [newModel, setNewModel]       = useState(""); const [newRam, setNewRam]         = useState("");
  const [newLoc, setNewLoc]           = useState("");

  // ── Users
  const [users, setUsers]             = useState([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserName, setNewUserName] = useState(""); const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserDept, setNewUserDept] = useState(""); const [newUserId, setNewUserId]       = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");
  const [newUserStatus, setNewUserStatus] = useState("yet_to_join");
  const [newUserStartDate, setNewUserStartDate] = useState("");
  const [newUserStartTime, setNewUserStartTime] = useState("09:00");
  const [newUserEndDate, setNewUserEndDate] = useState("");
  const [newUserEndTime, setNewUserEndTime] = useState("17:00");
  const [editUserId, setEditUserId]   = useState(null);
  const [editUserName, setEditUserName] = useState(""); const [editUserEmail, setEditUserEmail] = useState("");
  const [editUserDept, setEditUserDept] = useState(""); const [editUserUid, setEditUserUid]     = useState("");
  const [editUserPhone, setEditUserPhone] = useState("");
  const [editUserStatus, setEditUserStatus] = useState("yet_to_join");
  const [editUserStartDate, setEditUserStartDate] = useState("");
  const [editUserStartTime, setEditUserStartTime] = useState("09:00");
  const [editUserEndDate, setEditUserEndDate] = useState("");
  const [editUserEndTime, setEditUserEndTime] = useState("17:00");
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [userMenuPos, setUserMenuPos] = useState({ top: 0, left: 0 });
  const [openUserMenuId, setOpenUserMenuId] = useState(null);
  const [userHistoryData, setUserHistoryData] = useState(null);
  const [userHistoryLoading, setUserHistoryLoading] = useState(false);
  // ── Assign from user page
  const [assigningUser, setAssigningUser] = useState(null);
  const [isReassign, setIsReassign] = useState(false);
  const [assignLaptopId, setAssignLaptopId] = useState("");
  const [assignStartDate, setAssignStartDate] = useState(today);
  const [assignStartTime, setAssignStartTime] = useState("09:00");
  const [assignEndDate, setAssignEndDate]     = useState(today);
  const [assignEndTime, setAssignEndTime]     = useState("17:00");
  const [availableLaptops, setAvailableLaptops] = useState([]);

  // ── Reports
  const [reports, setReports]         = useState(null);
  const [reportTab, setReportTab]     = useState("history");
  const [reportSearch, setReportSearch] = useState("");
  const [selectedLaptopId, setSelectedLaptopId] = useState("");
  const [laptopHistory, setLaptopHistory]       = useState(null);
  const [historyLoading, setHistoryLoading]     = useState(false);

  const themeVars = dark ? `
    :root {
      --bg:#0f1117;--sidebar-bg:#161b27;--card-bg:#1a2035;--border:#2a3045;
      --text-primary:#e8edf5;--text-secondary:#8892a4;--text-muted:#5a6478;
      --accent:#6366f1;--accent-light:#818cf8;--accent-bg:rgba(99,102,241,0.15);
      --green:#4ade80;--green-bg:rgba(74,222,128,0.15);
      --red:#f87171;--red-bg:rgba(248,113,113,0.15);
      --amber:#fbbf24;--amber-bg:rgba(251,191,36,0.15);
      --blue:#60a5fa;--blue-bg:rgba(96,165,250,0.15);
      --hover-bg:rgba(255,255,255,0.04);--input-bg:#1e2537;
      --shadow:0 4px 24px rgba(0,0,0,0.4);
    }` : `
    :root {
      --bg:#e8ecf4;--sidebar-bg:#f8f9fc;--card-bg:#ffffff;--border:#c2cad8;
      --text-primary:#0a0f1e;--text-secondary:#1e293b;--text-muted:#374151;
      --accent:#4338ca;--accent-light:#6366f1;--accent-bg:#e0e7ff;
      --green:#14532d;--green-bg:#bbf7d0;
      --red:#7f1d1d;--red-bg:#fecaca;
      --amber:#78350f;--amber-bg:#fde68a;
      --blue:#1e3a8a;--blue-bg:#bfdbfe;
      --hover-bg:#eef2f7;--input-bg:#ffffff;
      --shadow:0 2px 12px rgba(0,0,0,0.1);
    }`;

  function showMsg(t, type = "success") { setMessage(t); setMsgType(type); setTimeout(() => setMessage(""), 4000); }

  useEffect(() => {
    function handleClick() { setOpenMenuId(null); setOpenUserMenuId(null); }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    axios.get(`${API}/dashboard/`).then(r => setDashboard(r.data));
    const iv = setInterval(() => axios.get(`${API}/dashboard/`).then(r => setDashboard(r.data)), 30000);
    return () => clearInterval(iv);
  }, []);

  function loadAvailability() {
    axios.get(`${API}/availability/`).then(r => { setAvailData(r.data); setAvailLoaded(true); });
    setPage("availability"); setSidebarOpen(false);
  }
  function loadLaptops() {
    axios.get(`${API}/laptops/`).then(r => setLaptops(r.data.laptops));
    setPage("laptops"); setLaptopSearch(""); setSidebarOpen(false);
  }
  function loadUsers() {
    axios.get(`${API}/users/`).then(r => setUsers(r.data.users));
    setPage("users"); setUserSearch(""); setUserFilter("all"); setSidebarOpen(false);
  }
  function loadReports() {
    axios.get(`${API}/reports/`).then(r => setReports(r.data));
    setPage("reports"); setReportSearch(""); setSidebarOpen(false);
  }
  function releaseLaptops() {
    axios.post(`${API}/release/`).then(r => {
      showMsg(`Released ${r.data.released} overdue laptops`);
      axios.get(`${API}/dashboard/`).then(d => setDashboard(d.data));
      if (availLoaded) loadAvailability();
    });
  }

  // ── Laptop CRUD
  function addLaptop() {
    if (!newName || !newModel || !newRam) { showMsg("Name, model and RAM required", "error"); return; }
    axios.post(`${API}/laptops/add/`, { name: newName, serial_number: newSerial, model: newModel, ram_gb: parseInt(newRam), location: newLoc })
      .then(r => { if (r.data.success) { showMsg(r.data.message); setNewName(""); setNewSerial(""); setNewModel(""); setNewRam(""); setNewLoc(""); loadLaptops(); axios.get(`${API}/dashboard/`).then(d => setDashboard(d.data)); } else showMsg(r.data.reason, "error"); });
  }
  function startEdit(l) { setEditId(l.id); setEditName(l.name); setEditSerial(l.serial_number||""); setEditModel(l.model); setEditRam(l.ram_gb); setEditLoc(l.location||""); }
  function saveEdit() {
    axios.put(`${API}/laptops/${editId}/edit/`, { name: editName, serial_number: editSerial, model: editModel, ram_gb: parseInt(editRam), location: editLoc })
      .then(r => { if (r.data.success) { showMsg(r.data.message); setEditId(null); loadLaptops(); } else showMsg(r.data.reason, "error"); });
  }
  function updateLaptopStatus(id, status) {
    axios.patch(`${API}/laptops/${id}/status/`, { status })
      .then(r => { if (r.data.success) { showMsg(r.data.message); loadLaptops(); axios.get(`${API}/dashboard/`).then(d => setDashboard(d.data)); } else showMsg(r.data.reason, "error"); });
  }
  function deleteLaptop(id, name) {
    if (!window.confirm(`Delete ${name}?`)) return;
    axios.delete(`${API}/laptops/${id}/delete/`).then(r => { if (r.data.success) { showMsg(r.data.message); loadLaptops(); axios.get(`${API}/dashboard/`).then(d => setDashboard(d.data)); } else showMsg(r.data.reason, "error"); });
  }
  function returnLaptop(assignmentId, laptopName) {
    if (!window.confirm(`Return ${laptopName}?`)) return;
    axios.post(`${API}/assignments/${assignmentId}/return/`).then(r => {
      if (r.data.success) { showMsg(`${laptopName} returned`); loadLaptops(); axios.get(`${API}/dashboard/`).then(d => setDashboard(d.data)); }
      else showMsg(r.data.reason, "error");
    });
  }

  // ── User CRUD
  function addUser() {
    if (!newUserName || !newUserEmail || !newUserDept || !newUserId) { showMsg("Name, email, department and employee ID required", "error"); return; }
    axios.post(`${API}/users/add/`, { name: newUserName, email: newUserEmail, department: newUserDept, user_id: newUserId, phone: newUserPhone, status: newUserStatus, start_date: dmyToIso(newUserStartDate) || null, start_time: newUserStartTime || null, end_date: dmyToIso(newUserEndDate) || null, end_time: newUserEndTime || null })
      .then(r => { if (r.data.success) { showMsg(r.data.message); setNewUserName(""); setNewUserEmail(""); setNewUserDept(""); setNewUserId(""); setNewUserPhone(""); setNewUserStatus("yet_to_join"); setNewUserStartDate(""); setNewUserStartTime("09:00"); setNewUserEndDate(""); setNewUserEndTime("17:00"); setShowAddUser(false); loadUsers(); } else showMsg(r.data.reason, "error"); });
  }
  function isoToDmy(iso) { if (!iso) return ""; const [y,m,d] = iso.split("-"); return `${d}/${m}/${y}`; }
  function dmyToIso(dmy) { if (!dmy) return ""; const [d,m,y] = dmy.split("/"); return `${y}-${m}-${d}`; }
  function startEditUser(u) { setEditUserId(u.id); setEditUserName(u.name); setEditUserEmail(u.email); setEditUserDept(u.department); setEditUserUid(u.user_id||""); setEditUserPhone(u.phone||""); setEditUserStatus(u.status||"yet_to_join"); setEditUserStartDate(isoToDmy(u.preset_start_date)); setEditUserStartTime(u.preset_start_time||"09:00"); setEditUserEndDate(isoToDmy(u.preset_end_date)); setEditUserEndTime(u.preset_end_time||"17:00"); }
  function saveEditUser() {
    axios.put(`${API}/users/${editUserId}/edit/`, { name: editUserName, email: editUserEmail, department: editUserDept, user_id: editUserUid, phone: editUserPhone, status: editUserStatus, start_date: dmyToIso(editUserStartDate) || null, start_time: editUserStartTime || null, end_date: dmyToIso(editUserEndDate) || null, end_time: editUserEndTime || null })
      .then(r => { if (r.data.success) { showMsg(r.data.message); setEditUserId(null); loadUsers(); } else showMsg(r.data.reason, "error"); });
  }
  function deleteUser(id, name) {
    if (!window.confirm(`Delete ${name}?`)) return;
    axios.delete(`${API}/users/${id}/delete/`).then(r => { if (r.data.success) { showMsg(r.data.message); loadUsers(); } else showMsg(r.data.reason, "error"); });
  }

  // ── Assign from user page
  function fetchAvailableForRange(sd, st, ed, et, excludeUserId) {
    const params = { start_date: sd, start_time: st, end_date: ed, end_time: et };
    if (excludeUserId) params.exclude_user_id = excludeUserId;
    axios.get(`${API}/laptops/by-time/`, { params })
      .then(r => setAvailableLaptops(r.data.available || []));
  }
  function openAssignForUser(u, reassign = false) {
    setAssigningUser(u);
    setIsReassign(reassign);
    setAssignLaptopId("");
    const sd = u.preset_start_date || today;
    const st = u.preset_start_time || "09:00";
    const ed = u.preset_end_date || u.preset_start_date || today;
    const et = u.preset_end_time || "17:00";
    setAssignStartDate(sd); setAssignStartTime(st);
    setAssignEndDate(ed);   setAssignEndTime(et);
    fetchAvailableForRange(sd, st, ed, et, reassign ? u.id : null);
  }
  function confirmAssignToUser() {
    if (!assignLaptopId) { showMsg("Select a laptop", "error"); return; }
    const url = isReassign ? `${API}/users/${assigningUser.id}/reassign/` : `${API}/assign/`;
    const sd = assigningUser.preset_start_date || assignStartDate;
    const st = assigningUser.preset_start_time || assignStartTime;
    const ed = assigningUser.preset_end_date || assignEndDate;
    const et = assigningUser.preset_end_time || assignEndTime;
    const payload = isReassign
      ? { laptop_id: parseInt(assignLaptopId), start_date: sd, start_time: st, end_date: ed, end_time: et }
      : { laptop_id: parseInt(assignLaptopId), user_id: assigningUser.id, start_date: sd, start_time: st, end_date: ed, end_time: et };
    axios.post(url, payload).then(r => {
      if (r.data.success) { showMsg(r.data.message); setAssigningUser(null); loadUsers(); axios.get(`${API}/dashboard/`).then(d => setDashboard(d.data)); }
      else showMsg(r.data.reason, "error");
    });
  }
  function returnFromUser(assignmentId, laptopName, userName) {
    if (!window.confirm(`Return ${laptopName} from ${userName}?`)) return;
    axios.post(`${API}/assignments/${assignmentId}/return/`).then(r => {
      if (r.data.success) { showMsg(`${laptopName} returned`); loadUsers(); axios.get(`${API}/dashboard/`).then(d => setDashboard(d.data)); }
      else showMsg(r.data.reason, "error");
    });
  }

  function returnAllFromUser(u) {
    if (!window.confirm(`Return all laptops from ${u.name}?`)) return;
    axios.post(`${API}/users/${u.id}/return-all/`).then(r => {
      if (r.data.success) { showMsg(r.data.message); loadUsers(); axios.get(`${API}/dashboard/`).then(d => setDashboard(d.data)); }
      else showMsg(r.data.reason, "error");
    });
  }

  function loadUserHistory(u) {
    setUserHistoryLoading(true);
    setUserHistoryData(null);
    axios.get(`${API}/users/${u.id}/history/`).then(r => { setUserHistoryData(r.data); setUserHistoryLoading(false); });
  }

  // ── Laptop history for reports
  function loadLaptopHistory(lid) {
    if (!lid) { setLaptopHistory(null); return; }
    setHistoryLoading(true);
    axios.get(`${API}/laptops/${lid}/history/`).then(r => { setLaptopHistory(r.data); setHistoryLoading(false); });
  }

  const filteredUsers = users.filter(u => {
    const statusLabel = USER_STATUS_OPTIONS.find(s => s.value === u.status)?.label || "";
    const matchSearch = [u.name, u.email, u.department, u.user_id||"", u.phone||"", statusLabel].some(f => f.toLowerCase().includes(userSearch.toLowerCase()));
    const matchFilter = userFilter === "all" || u.status === userFilter;
    return matchSearch && matchFilter;
  });

  const filteredLaptops = laptops.filter(l => {
    const matchSearch = [l.name, l.model, l.serial_number||"", l.location||""].some(f => f.toLowerCase().includes(laptopSearch.toLowerCase()));
    const matchFilter = laptopFilter === "all" || l.status === laptopFilter;
    return matchSearch && matchFilter;
  });

  const navItems = [
    { id: "availability", label: "Availability", icon: "◎", action: loadAvailability },
    { id: "laptops",      label: "Laptops",      icon: "💻", action: loadLaptops },
    { id: "users",        label: "Users",         icon: "👤", action: loadUsers },
    { id: "reports",      label: "Reports",       icon: "📊", action: loadReports },
  ];

  const S = {
    card:      { background: "var(--card-bg)", borderRadius: 14, padding: 20, boxShadow: "var(--shadow)", border: "1px solid var(--border)", marginBottom: 16 },
    input:     { padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14, width: "100%", background: "var(--input-bg)", color: "var(--text-primary)", fontFamily: "inherit" },
    label:     { display: "block", marginBottom: 5, fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" },
    td:        { padding: "10px 10px", fontSize: 12, color: "var(--text-secondary)", verticalAlign: "middle", textAlign: "left", wordBreak: "break-word" },
    editInput: { padding: "4px 6px", borderRadius: 6, border: "1px solid var(--accent)", fontSize: 11, width: "100%", background: "var(--input-bg)", color: "var(--text-primary)", boxSizing: "border-box" },
    primaryBtn:{ background: "linear-gradient(135deg,var(--accent),var(--accent-light))", color: "#fff", border: "none", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" },
    smBtn:     (c) => ({ background: c, color: "#fff", border: "none", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 500 }),
    th:        { padding: "10px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        ${themeVars}
        *,*::before,*::after{box-sizing:border-box;}
        body{margin:0;background:var(--bg);color:var(--text-primary);font-family:'Plus Jakarta Sans','Segoe UI',sans-serif;}
        input,select,button{font-family:inherit;}
        input:focus,select:focus{outline:none;border-color:var(--accent)!important;box-shadow:0 0 0 3px rgba(99,102,241,0.15);}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}
        .nav-btn{transition:all 0.15s;}.nav-btn:hover{background:var(--hover-bg)!important;}
        .row-hover:hover{background:var(--hover-bg)!important;}
        .action-menu button:hover{background:var(--hover-bg);}
        .card-hover{transition:transform 0.15s,box-shadow 0.15s;}
        .card-hover:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,0,0,0.15)!important;}
        .table-scroll{overflow-x:visible;overflow-y:visible;max-width:100%;}
        .users-table{width:100%;table-layout:fixed;}
        .users-table th:nth-child(1){width:6%}
        .users-table th:nth-child(2){width:9%}
        .users-table th:nth-child(3){width:10%}
        .users-table th:nth-child(4){width:12%}
        .users-table th:nth-child(5){width:10%}
        .users-table th:nth-child(6){width:11%}
        .users-table th:nth-child(7){width:11%}
        .users-table th:nth-child(8){width:11%}
        .users-table th:nth-child(9){width:10%}
        .users-table th:nth-child(10){width:6%}
        .users-table td{word-break:break-word;}
        @keyframes slideIn{from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:translateY(0);}}
        @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
        .toast{animation:slideIn 0.3s ease;}.modal-backdrop{animation:fadeIn 0.2s ease;}
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%);transition:transform 0.3s ease;}
          .sidebar.open{transform:translateX(0);}
          .main-content{margin-left:0!important;}
          .rg{grid-template-columns:1fr!important;}
        }
        @media(min-width:769px){.mob-bar{display:none!important;}.sidebar{transform:none!important;}}
      `}</style>

      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex" }}>

        {sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }} className="modal-backdrop" />}

        {/* ── SIDEBAR ── */}
        <aside className={`sidebar${sidebarOpen ? " open" : ""}`}
          style={{ width: 200, background: "var(--sidebar-bg)", borderRight: "1px solid var(--border)", minHeight: "100vh", position: "fixed", left: 0, top: 0, display: "flex", flexDirection: "column", zIndex: 50 }}>
          <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, background: "linear-gradient(135deg,#6366f1,#818cf8)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 18 }}>💼</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text-primary)" }}>AssetTrack</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Laptop Manager</div>
                  </div>
                  <button onClick={() => setDark(!dark)} style={{ background: "var(--accent-bg)", border: "none", borderRadius: 8, padding: "6px 8px", cursor: "pointer", fontSize: 14, color: "var(--accent)", marginLeft: 4 }}>{dark ? "☀️" : "🌙"}</button>
                </div>
              </div>
            </div>
          </div>

          {dashboard && (
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <DonutChart size={72} segments={[
                  { value: dashboard.available,   color: "#4ade80" },
                  { value: dashboard.in_use,       color: "#f87171" },
                  { value: dashboard.maintenance,  color: "#fbbf24" },
                ]} />
                <div style={{ display: "grid", gap: 3, flex: 1, marginLeft: 10 }}>
                  {[
                    { label: "Total",       value: dashboard.total,         color: "var(--accent)" },
                    { label: "Available",   value: dashboard.available,     color: "var(--green)" },
                    { label: "In Use",      value: dashboard.in_use,        color: "var(--red)" },
                    { label: "Maintenance", value: dashboard.maintenance,   color: "var(--amber)" },
                  ].map(s => (
                    <div key={s.label} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>{s.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <nav style={{ padding: "10px", flex: 1 }}>
            {navItems.map(item => (
              <button key={item.id} onClick={item.action} className="nav-btn"
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9, border: "none", cursor: "pointer", marginBottom: 2, textAlign: "left", background: page === item.id ? "var(--accent-bg)" : "transparent", color: page === item.id ? "var(--accent)" : "var(--text-secondary)", fontSize: 14, fontWeight: page === item.id ? 700 : 500 }}>
                <span>{item.icon}</span>{item.label}
                {page === item.id && <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />}
              </button>
            ))}
          </nav>

          <div style={{ padding: "12px 10px", borderTop: "1px solid var(--border)" }}>
            <button onClick={releaseLaptops} className="nav-btn"
              style={{ width: "100%", background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)", padding: "8px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
              ↺ Release Overdue
            </button>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main className="main-content" style={{ marginLeft: 200, flex: 1, padding: "24px 8px", minWidth: 0 }}>

          <div className="mob-bar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 9, padding: "8px 12px", cursor: "pointer", fontSize: 18 }}>☰</button>
            <div style={{ fontWeight: 800, fontSize: 16, color: "var(--text-primary)" }}>AssetTrack</div>
            <button onClick={() => setDark(!dark)} style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 9, padding: "8px 12px", cursor: "pointer", fontSize: 14 }}>{dark ? "☀️" : "🌙"}</button>
          </div>

          {message && (
            <div className="toast" style={{ position: "fixed", top: 20, right: 20, zIndex: 999, background: msgType === "error" ? "#ef4444" : "#22c55e", color: "#fff", padding: "12px 18px", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, maxWidth: 360 }}>
              {msgType === "error" ? "⚠" : "✓"} {message}
              <button onClick={() => setMessage("")} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 20, lineHeight: 1, marginLeft: 6 }}>×</button>
            </div>
          )}

          {/* ── ASSIGN TO USER MODAL ── */}
          {assigningUser && (
            <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
              <div style={{ background: "var(--card-bg)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 500, boxShadow: "0 24px 80px rgba(0,0,0,0.3)", border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 800, fontSize: 18, color: "var(--text-primary)", marginBottom: 4 }}>{isReassign ? "Reassign Laptop" : "Assign Laptop"}</div>
                <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 18 }}>{isReassign ? "Change laptop for" : "To"} <strong style={{ color: "var(--accent)" }}>{assigningUser.name}</strong> ({assigningUser.department})</div>

                <div style={{ display: "grid", gap: 14 }}>
                  <div>
                    <label style={S.label}>Select Laptop</label>
                    <select style={S.input} value={assignLaptopId} onChange={e => setAssignLaptopId(e.target.value)}>
                      <option value="">-- Choose available laptop --</option>
                      {availableLaptops.filter(l => !isReassign || !assigningUser?.current_laptop || l.name !== assigningUser.current_laptop).map(l => <option key={l.id} value={l.id}>{l.name} — {l.model} ({l.ram_gb}GB)</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button onClick={confirmAssignToUser} style={{ ...S.primaryBtn, flex: 1, padding: 11 }}>{isReassign ? "Confirm Reassign" : "Confirm Assign"}</button>
                  <button onClick={() => setAssigningUser(null)} style={{ flex: 1, background: "var(--hover-bg)", color: "var(--text-secondary)", border: "1px solid var(--border)", padding: 11, borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* ── USER HISTORY MODAL ── */}
          {userHistoryData && (
            <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
              <div style={{ background: "var(--card-bg)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 680, boxShadow: "0 24px 80px rgba(0,0,0,0.3)", border: "1px solid var(--border)", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: "var(--text-primary)" }}>📋 Laptop History</div>
                    <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 2 }}><strong style={{ color: "var(--accent)" }}>{userHistoryData.user}</strong> · {userHistoryData.department} · {userHistoryData.total} assignment{userHistoryData.total !== 1 ? "s" : ""}</div>
                  </div>
                  <button onClick={() => setUserHistoryData(null)} style={{ background: "var(--hover-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 14, color: "var(--text-muted)" }}>✕ Close</button>
                </div>
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {userHistoryLoading ? (
                    <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>Loading...</div>
                  ) : userHistoryData.history.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>No assignment history</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--hover-bg)" }}>
                          {["Laptop", "Model", "Start", "End", "Status", "Returned"].map(h => <th key={h} style={S.th}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {userHistoryData.history.map(a => (
                          <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={S.td}><span style={{ fontWeight: 700, color: "var(--text-primary)" }}>💻 {a.laptop}</span></td>
                            <td style={S.td}><span style={{ fontSize: 12, color: "var(--text-muted)" }}>{a.model}</span></td>
                            <td style={S.td}><div style={{ fontSize: 12 }}>{formatDate(a.start_date)}</div><div style={{ fontSize: 12, color: "var(--accent)", fontFamily: "monospace" }}>{formatTime12(a.start_time)}</div></td>
                            <td style={S.td}><div style={{ fontSize: 12 }}>{formatDate(a.end_date)}</div><div style={{ fontSize: 12, color: "var(--red)", fontFamily: "monospace" }}>{formatTime12(a.end_time)}</div></td>
                            <td style={S.td}><StatusBadge status={a.status} /></td>
                            <td style={S.td}><span style={{ fontSize: 12, color: "var(--text-muted)" }}>{a.returned_at}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══════════ AVAILABILITY PAGE ══════════ */}
          {page === "availability" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.03em" }}>Availability</h1>
                  <p style={{ color: "var(--text-muted)", margin: "4px 0 0", fontSize: 14 }}>Current laptop status at a glance</p>
                </div>
                <button onClick={loadAvailability} style={S.primaryBtn}>↺ Refresh</button>
              </div>

              {/* Availability Check */}
              <div style={{ ...S.card, border: "1.5px solid var(--accent-bg)", marginBottom: 24 }}>
                <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14, marginBottom: 14 }}>🔍 Check Laptop Availability</div>
                <div className="rg" style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "flex-end" }}>
                  <div>
                    <label style={S.label}>Date (dd/mm/yyyy)</label>
                    <DatePicker value={checkSD} onChange={v => { setCheckSD(v); setCheckResult(null); }} />
                  </div>
                  <div>
                    <label style={S.label}>Time</label>
                    <select style={S.input} value={checkST} onChange={e => { setCheckST(e.target.value); setCheckResult(null); }}>
                      {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <button onClick={checkAvailability} style={{ ...S.primaryBtn, height: 40 }} disabled={checkLoading}>
                    {checkLoading ? "..." : "Check"}
                  </button>
                </div>
                {checkResult !== null && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 }}>
                      {checkResult.length === 0
                        ? <span style={{ color: "var(--red)" }}>No laptops available on {checkSD} at {formatTime12(checkST)}</span>
                        : <span style={{ color: "var(--green)" }}>{checkResult.length} laptop{checkResult.length !== 1 ? "s" : ""} available on {checkSD} at {formatTime12(checkST)}</span>}
                    </div>
                    {checkResult.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {checkResult.map(l => (
                          <div key={l.id} style={{ background: "var(--green-bg)", border: "1px solid var(--green)", borderRadius: 10, padding: "8px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 16 }}>💻</span>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>{l.name}</div>
                              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{l.model} · {l.ram_gb}GB{l.location && l.location !== "—" ? ` · 📍${l.location}` : ""}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!availLoaded ? (
                <div style={{ ...S.card, textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
                  <div style={{ fontWeight: 700, color: "var(--text-secondary)", fontSize: 16, marginBottom: 8 }}>Click Refresh to load current status</div>
                </div>
              ) : availData && (
                <>
                  {/* Summary cards */}
                  <div className="rg" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
                    {[
                      { label: "Available",   value: availData.counts.available,   color: "var(--green)",  bg: "var(--green-bg)",  icon: "✅" },
                      { label: "In Use",      value: availData.counts.in_use,      color: "var(--red)",    bg: "var(--red-bg)",    icon: "🔴" },
                      { label: "Maintenance", value: availData.counts.maintenance, color: "var(--amber)",  bg: "var(--amber-bg)",  icon: "🔧" },
                    ].map(c => (
                      <div key={c.label} className="card-hover" style={{ background: "var(--card-bg)", borderRadius: 14, padding: "18px 20px", border: `1.5px solid ${c.bg}`, boxShadow: "var(--shadow)", display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ fontSize: 28 }}>{c.icon}</div>
                        <div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, marginBottom: 2 }}>{c.label}</div>
                          <div style={{ fontSize: 32, fontWeight: 800, color: c.color, lineHeight: 1 }}>{c.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Laptop lists */}
                  <div className="rg" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                    {/* Available */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--green)" }} />
                        <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 15 }}>Available</span>
                        <span style={{ background: "var(--green-bg)", color: "var(--green)", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{availData.counts.available}</span>
                      </div>
                      {availData.available.length === 0
                        ? <div style={{ ...S.card, textAlign: "center", padding: 24, color: "var(--text-muted)", fontSize: 14 }}>No available laptops</div>
                        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {availData.available.map(l => (
                            <div key={l.id} style={{ background: "var(--card-bg)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--green-bg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>{l.name}</div>
                                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{l.model} · {l.ram_gb}GB{l.location !== "—" ? ` · 📍${l.location}` : ""}</div>
                              </div>
                              <StatusBadge status="available" />
                            </div>
                          ))}
                        </div>}
                    </div>

                    {/* In Use */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--red)" }} />
                        <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 15 }}>In Use</span>
                        <span style={{ background: "var(--red-bg)", color: "var(--red)", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{availData.counts.in_use}</span>
                      </div>
                      {availData.in_use.length === 0
                        ? <div style={{ ...S.card, textAlign: "center", padding: 24, color: "var(--text-muted)", fontSize: 14 }}>No laptops in use</div>
                        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {availData.in_use.map(l => (
                            <div key={l.id} style={{ background: "var(--card-bg)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--red-bg)" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <div>
                                  <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>{l.name}</div>
                                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{l.model} · {l.ram_gb}GB</div>
                                </div>
                                <StatusBadge status="in_use" />
                              </div>
                              {l.assigned_to && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>👤 <strong>{l.assigned_to}</strong></div>}
                              {l.due_back && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Due: {l.due_back}</div>}
                            </div>
                          ))}
                        </div>}
                    </div>

                    {/* Maintenance */}
                    {availData.maintenance.length > 0 && (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--amber)" }} />
                          <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 15 }}>Maintenance</span>
                          <span style={{ background: "var(--amber-bg)", color: "var(--amber)", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{availData.counts.maintenance}</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {availData.maintenance.map(l => (
                            <div key={l.id} style={{ background: "var(--card-bg)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--amber-bg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>{l.name}</div>
                                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{l.model} · {l.ram_gb}GB</div>
                              </div>
                              <StatusBadge status="maintenance" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══════════ LAPTOPS PAGE ══════════ */}
          {page === "laptops" && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.03em" }}>Laptops</h1>
                <p style={{ color: "var(--text-muted)", margin: "4px 0 0", fontSize: 14 }}>{filteredLaptops.length} devices</p>
              </div>

              <div style={S.card}>
                <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 14, fontSize: 14 }}>Add New Laptop</div>
                <div className="rg" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr auto", gap: 10 }}>
                  <input style={S.input} placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} />
                  <input style={S.input} placeholder="Serial No." value={newSerial} onChange={e => setNewSerial(e.target.value)} />
                  <input style={S.input} placeholder="Model" value={newModel} onChange={e => setNewModel(e.target.value)} />
                  <select style={S.input} value={newRam} onChange={e => setNewRam(e.target.value)}>
                    <option value="">RAM</option>
                    {["4","8","16","32","64"].map(r => <option key={r} value={r}>{r} GB</option>)}
                  </select>
                  <input style={S.input} placeholder="Location" value={newLoc} onChange={e => setNewLoc(e.target.value)} />
                  <button onClick={addLaptop} style={S.primaryBtn}>Add</button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                <input style={{ ...S.input, maxWidth: 280 }} placeholder="🔍 Search laptops..." value={laptopSearch} onChange={e => setLaptopSearch(e.target.value)} />
                <select style={{ ...S.input, maxWidth: 160 }} value={laptopFilter} onChange={e => setLaptopFilter(e.target.value)}>
                  <option value="all">All Status</option>
                  <option value="available">Available</option>
                  <option value="in_use">In Use</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>

              <div style={{ ...S.card, padding: 0, overflow: "visible" }}>
                <div className="table-scroll">
                  <table className="users-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--hover-bg)" }}>
                        {["Name", "Serial", "Model", "RAM", "Location", "Assigned To", "Status", "Actions"].map(h => (
                          <th key={h} style={S.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLaptops.length === 0 && <tr><td colSpan="8" style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No laptops found</td></tr>}
                      {filteredLaptops.map(l => (
                        <tr key={l.id} className="row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={S.td}>{editId === l.id ? <input style={S.editInput} value={editName} onChange={e => setEditName(e.target.value)} /> : <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{l.name}</span>}</td>
                          <td style={S.td}>{editId === l.id ? <input style={S.editInput} value={editSerial} onChange={e => setEditSerial(e.target.value)} /> : <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>{l.serial_number || "—"}</span>}</td>
                          <td style={S.td}>{editId === l.id ? <input style={S.editInput} value={editModel} onChange={e => setEditModel(e.target.value)} /> : l.model}</td>
                          <td style={S.td}>{editId === l.id
                            ? <select style={S.editInput} value={editRam} onChange={e => setEditRam(e.target.value)}>{["4","8","16","32","64"].map(r => <option key={r} value={r}>{r}GB</option>)}</select>
                            : <span style={{ background: "var(--accent-bg)", color: "var(--accent)", padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>{l.ram_gb}GB</span>}</td>
                          <td style={S.td}>{editId === l.id ? <input style={S.editInput} value={editLoc} onChange={e => setEditLoc(e.target.value)} /> : <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{l.location || "—"}</span>}</td>
                          <td style={S.td}>{l.assigned_to ? <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>👤 {l.assigned_to}</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                          <td style={S.td}><StatusBadge status={l.status} /></td>
                          <td style={{ ...S.td, position: "relative" }}>
                            {editId === l.id ? (
                              <div style={{ display: "flex", gap: 5 }}>
                                <button style={S.smBtn("#22c55e")} onClick={saveEdit}>Save</button>
                                <button style={S.smBtn("#9ca3af")} onClick={() => setEditId(null)}>Cancel</button>
                              </div>
                            ) : (
                              <div style={{ position: "relative" }}>
                                <button
                                  onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === l.id ? null : l.id); }}
                                  style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 6, color: "var(--text-muted)", fontSize: 20, lineHeight: 1, display: "flex", alignItems: "center" }}
                                >⋯</button>
                                {openMenuId === l.id && (
                                  <div style={{ position: "absolute", right: 0, top: "110%", background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow)", zIndex: 100, minWidth: 150, overflow: "hidden" }}>
                                    <button style={{ width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}
                                      onMouseEnter={e => e.currentTarget.style.background="var(--hover-bg)"} onMouseLeave={e => e.currentTarget.style.background="none"}
                                      onClick={() => { startEdit(l); setOpenMenuId(null); }}>✏️ Edit</button>
                                    {l.status === "available" && <button style={{ width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}
                                      onMouseEnter={e => e.currentTarget.style.background="var(--hover-bg)"} onMouseLeave={e => e.currentTarget.style.background="none"}
                                      onClick={() => { updateLaptopStatus(l.id, "maintenance"); setOpenMenuId(null); }}>🔧 Maintenance</button>}
                                                    {(l.status === "maintenance" || l.status === "with_us") && <button style={{ width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}
                                      onMouseEnter={e => e.currentTarget.style.background="var(--hover-bg)"} onMouseLeave={e => e.currentTarget.style.background="none"}
                                      onClick={() => { updateLaptopStatus(l.id, "available"); setOpenMenuId(null); }}>✅ Restore</button>}
                                    {l.status === "in_use" && l.assignment_id && <button style={{ width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}
                                      onMouseEnter={e => e.currentTarget.style.background="var(--hover-bg)"} onMouseLeave={e => e.currentTarget.style.background="none"}
                                      onClick={() => { returnLaptop(l.assignment_id, l.name); setOpenMenuId(null); }}>↩ Return</button>}
                                    <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
                                    <button style={{ width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--red)", display: "flex", alignItems: "center", gap: 8 }}
                                      onMouseEnter={e => e.currentTarget.style.background="var(--red-bg)"} onMouseLeave={e => e.currentTarget.style.background="none"}
                                      onClick={() => { deleteLaptop(l.id, l.name); setOpenMenuId(null); }}>🗑️ Delete</button>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════ USERS PAGE ══════════ */}
          {page === "users" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.03em" }}>Users</h1>
                  <p style={{ color: "var(--text-muted)", margin: "4px 0 0", fontSize: 14 }}>{filteredUsers.length} employees</p>
                </div>
                <button onClick={() => setShowAddUser(!showAddUser)} style={S.primaryBtn}>{showAddUser ? "× Cancel" : "+ Add User"}</button>
              </div>

              <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                <input style={{ ...S.input, maxWidth: 280 }} placeholder="🔍 Search users..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
                <select style={{ ...S.input, maxWidth: 190 }} value={userFilter} onChange={e => setUserFilter(e.target.value)}>
                  <option value="all">All Employees</option>
                  {USER_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              {showAddUser && (
                <div style={{ ...S.card, border: "2px solid var(--accent-bg)" }}>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 14, fontSize: 14 }}>New Employee</div>
                  <div className="rg" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div><label style={S.label}>Full Name *</label><input style={S.input} placeholder="Full Name" value={newUserName} onChange={e => setNewUserName(e.target.value)} /></div>
                    <div><label style={S.label}>Employee ID *</label><input style={S.input} placeholder="Employee ID" value={newUserId} onChange={e => setNewUserId(e.target.value)} /></div>
                    <div><label style={S.label}>Phone</label><input style={S.input} placeholder="Phone Number" value={newUserPhone} onChange={e => setNewUserPhone(e.target.value)} /></div>
                    <div><label style={S.label}>Email *</label><input style={S.input} placeholder="Email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} /></div>
                    <div><label style={S.label}>Department *</label><input style={S.input} placeholder="Department" value={newUserDept} onChange={e => setNewUserDept(e.target.value)} /></div>
                    <div><label style={S.label}>Status</label><input style={{ ...S.input, color: "var(--text-muted)", cursor: "not-allowed" }} value="Yet to Join" disabled /></div>
                    <div><label style={S.label}>Start Date</label><DatePicker value={newUserStartDate} onChange={setNewUserStartDate} /></div>
                    <div><label style={S.label}>Start Time</label><select style={S.input} value={newUserStartTime} onChange={e => setNewUserStartTime(e.target.value)}>{TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                    <div><label style={S.label}>End Date</label><DatePicker value={newUserEndDate} onChange={setNewUserEndDate} /></div>
                    <div><label style={S.label}>End Time</label><select style={S.input} value={newUserEndTime} onChange={e => setNewUserEndTime(e.target.value)}>{TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                    <div style={{ display: "flex", alignItems: "flex-end" }}><button onClick={addUser} style={{ ...S.primaryBtn, width: "100%" }}>Add Employee</button></div>
                  </div>
                </div>
              )}

              <div style={{ ...S.card, padding: 0, overflow: "visible" }}>
                <div className="table-scroll">
                  <table className="users-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--hover-bg)" }}>
                        {["Emp ID", "Name", "Phone", "Email", "Department", "Status", "Start", "End", "Laptop"].map(h => (
                          <th key={h} style={S.th}>{h}</th>
                        ))}
                        <th style={S.th}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.length === 0 && <tr><td colSpan="10" style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No employees found</td></tr>}
                      {filteredUsers.map(u => (
                        <tr key={u.id} className="row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={S.td}>{editUserId === u.id ? <input style={S.editInput} value={editUserUid} onChange={e => setEditUserUid(e.target.value)} /> : <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>{u.user_id || "—"}</span>}</td>
                          <td style={S.td}>{editUserId === u.id ? <input style={S.editInput} value={editUserName} onChange={e => setEditUserName(e.target.value)} /> : <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{u.name}</span>}</td>
                          <td style={S.td}>{editUserId === u.id ? <input style={S.editInput} value={editUserPhone} onChange={e => setEditUserPhone(e.target.value)} /> : <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{u.phone || "—"}</span>}</td>
                          <td style={S.td}>{editUserId === u.id ? <input style={S.editInput} value={editUserEmail} onChange={e => setEditUserEmail(e.target.value)} /> : <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{u.email}</span>}</td>
                          <td style={S.td}>{editUserId === u.id ? <input style={S.editInput} value={editUserDept} onChange={e => setEditUserDept(e.target.value)} /> : <span style={{ background: "var(--accent-bg)", color: "var(--accent)", padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>{u.department}</span>}</td>
                          <td style={S.td}>{editUserId === u.id ? <select style={{ ...S.editInput, minWidth: 0 }} value={editUserStatus} onChange={e => setEditUserStatus(e.target.value)}>{USER_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select> : <UserStatusBadge status={u.status} />}</td>
                          <td style={S.td}>
                            {editUserId === u.id
                              ? <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                  <DatePicker value={editUserStartDate} onChange={setEditUserStartDate} />
                                  <select style={{ ...S.editInput, width: "100%", fontSize: 11 }} value={editUserStartTime} onChange={e => setEditUserStartTime(e.target.value)}>{TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
                                </div>
                              : u.start_date
                                ? <div><div style={{ fontSize: 12, color: "var(--text-muted)" }}>{formatDate(u.start_date)}</div><div style={{ fontSize: 11, color: "var(--accent)", fontFamily: "monospace", fontWeight: 600 }}>{formatTime12(u.start_time)}</div></div>
                                : <span style={{ color: "var(--text-muted)" }}>—</span>}
                          </td>
                          <td style={S.td}>
                            {editUserId === u.id
                              ? <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                  <DatePicker value={editUserEndDate} onChange={setEditUserEndDate} />
                                  <select style={{ ...S.editInput, width: "100%", fontSize: 11 }} value={editUserEndTime} onChange={e => setEditUserEndTime(e.target.value)}>{TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
                                </div>
                              : u.end_date
                                ? <div><div style={{ fontSize: 12, color: "var(--text-muted)" }}>{formatDate(u.end_date)}</div><div style={{ fontSize: 11, color: "var(--red)", fontFamily: "monospace", fontWeight: 600 }}>{formatTime12(u.end_time)}</div></div>
                                : <span style={{ color: "var(--text-muted)" }}>—</span>}
                          </td>
                          <td style={S.td}>
                            {u.current_laptop
                              ? <span style={{ background: "var(--red-bg)", color: "var(--red)", padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>💻 {u.current_laptop}</span>
                              : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>None</span>}
                          </td>
                          <td style={{ ...S.td, position: "relative", overflow: "visible" }}>
                            {editUserId === u.id ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <button style={S.smBtn("#22c55e")} onClick={saveEditUser}>Save</button>
                                <button style={S.smBtn("#9ca3af")} onClick={() => setEditUserId(null)}>Cancel</button>
                              </div>
                            ) : (
                              <div style={{ position: "relative" }}>
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    setOpenUserMenuId(openUserMenuId === u.id ? null : u.id);
                                  }}
                                  style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 6, color: "var(--text-muted)", fontSize: 20, lineHeight: 1, display: "flex", alignItems: "center" }}
                                >⋯</button>
                                {openUserMenuId === u.id && (
                                  <div style={{ position: "absolute", right: 0, top: "100%", background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.35)", zIndex: 1000, minWidth: 160, overflow: "hidden" }}>
                                    <button style={{ width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}
                                      onMouseEnter={e => e.currentTarget.style.background="var(--hover-bg)"} onMouseLeave={e => e.currentTarget.style.background="none"}
                                      onClick={() => { startEditUser(u); setOpenUserMenuId(null); }}>✏️ Edit</button>
                                    {!u.current_laptop && <button style={{ width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}
                                      onMouseEnter={e => e.currentTarget.style.background="var(--hover-bg)"} onMouseLeave={e => e.currentTarget.style.background="none"}
                                      onClick={() => { openAssignForUser(u, false); setOpenUserMenuId(null); }}>💻 Assign</button>}
                                    {u.current_laptop && u.current_assignment_id && <>
                                      <button style={{ width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--blue)", display: "flex", alignItems: "center", gap: 8 }}
                                        onMouseEnter={e => e.currentTarget.style.background="var(--blue-bg)"} onMouseLeave={e => e.currentTarget.style.background="none"}
                                        onClick={() => { openAssignForUser(u, true); setOpenUserMenuId(null); }}>🔄 Reassign</button>
                                    </>}
                                    {u.has_history && <button style={{ width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}
                                      onMouseEnter={e => e.currentTarget.style.background="var(--hover-bg)"} onMouseLeave={e => e.currentTarget.style.background="none"}
                                      onClick={() => { loadUserHistory(u); setOpenUserMenuId(null); }}>📊 History</button>}
                                    <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
                                    <button style={{ width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--red)", display: "flex", alignItems: "center", gap: 8 }}
                                      onMouseEnter={e => e.currentTarget.style.background="var(--red-bg)"} onMouseLeave={e => e.currentTarget.style.background="none"}
                                      onClick={() => { deleteUser(u.id, u.name); setOpenUserMenuId(null); }}>🗑️ Delete</button>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════ REPORTS PAGE ══════════ */}
          {page === "reports" && reports && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.03em" }}>Reports</h1>
                <p style={{ color: "var(--text-muted)", margin: "4px 0 0", fontSize: 14 }}>Assignment history and analytics</p>
              </div>

              <input style={{ ...S.input, maxWidth: 320, marginBottom: 16 }} placeholder="🔍 Search reports..." value={reportSearch} onChange={e => { setReportSearch(e.target.value); }} />

              {/* Stats */}
              <div className="rg" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 24 }}>
                {[
                  { label: "Total Assignments", value: reports.total_assignments, color: "var(--accent)", icon: "📋" },
                  { label: "Active Now",         value: reports.active_now,        color: "var(--red)",   icon: "🔴" },
                  { label: "Completed",          value: reports.completed,         color: "var(--green)", icon: "✅" },
                ].map(c => (
                  <div key={c.label} className="card-hover" style={{ ...S.card, marginBottom: 0, display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ fontSize: 28 }}>{c.icon}</div>
                    <div>
                      <div style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 500, marginBottom: 4 }}>{c.label}</div>
                      <div style={{ fontSize: 34, fontWeight: 800, color: c.color, lineHeight: 1 }}>{c.value}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Charts */}
              {(reports.top_laptops.length > 0 || reports.by_user.length > 0) && (
                <div className="rg" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                  <div style={S.card}>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14, marginBottom: 12 }}>📊 Top Laptops by Usage</div>
                    <BarChart data={reports.top_laptops} valueKey="count" labelKey="laptop__name" color="#6366f1" dark={dark} />
                  </div>
                  <div style={S.card}>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14, marginBottom: 12 }}>👤 Top Users by Assignments</div>
                    <BarChart data={reports.by_user} valueKey="count" labelKey="user__name" color="#22c55e" dark={dark} />
                  </div>
                </div>
              )}

              {/* Laptop History Filter */}
              <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14, whiteSpace: "nowrap" }}>🔍 Laptop History</div>
                <select style={{ ...S.input, maxWidth: 280 }} value={selectedLaptopId} onChange={e => { setSelectedLaptopId(e.target.value); loadLaptopHistory(e.target.value); }}>
                  <option value="">-- Select a laptop --</option>
                  {reports.laptops_list.map(l => <option key={l.id} value={l.id}>{l.name} — {l.model}</option>)}
                </select>
                {laptopHistory && <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{laptopHistory.total} assignments found</span>}
              </div>

              {/* Laptop History Table */}
              {historyLoading && <div style={{ ...S.card, textAlign: "center", padding: 24, color: "var(--text-muted)" }}>Loading...</div>}
              {laptopHistory && !historyLoading && (
                <div style={{ ...S.card, padding: 0, overflow: "hidden", marginBottom: 20 }}>
                  <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 15 }}>💻 {laptopHistory.laptop}</span>
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{laptopHistory.model}</span>
                  </div>
                  <div className="table-scroll">
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--hover-bg)" }}>
                          {["User", "Emp ID", "Department", "Start", "End", "Status", "Returned"].map(h => <th key={h} style={S.th}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {laptopHistory.history.length === 0 && <tr><td colSpan="7" style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No history yet</td></tr>}
                        {laptopHistory.history.map(a => (
                          <tr key={a.id} className="row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={S.td}><span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{a.user}</span></td>
                            <td style={S.td}><span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>{a.user_id}</span></td>
                            <td style={S.td}><span style={{ background: "var(--accent-bg)", color: "var(--accent)", padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>{a.department}</span></td>
                            <td style={S.td}><div style={{ fontSize: 12 }}>{formatDate(a.start_date)}</div><div style={{ fontSize: 12, color: "var(--accent)", fontFamily: "monospace" }}>{formatTime12(a.start_time)}</div></td>
                            <td style={S.td}><div style={{ fontSize: 12 }}>{formatDate(a.end_date)}</div><div style={{ fontSize: 12, color: "var(--red)", fontFamily: "monospace" }}>{formatTime12(a.end_time)}</div></td>
                            <td style={S.td}><StatusBadge status={a.status} /></td>
                            <td style={S.td}><span style={{ fontSize: 12, color: "var(--text-muted)" }}>{a.returned_at}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Full History Tabs */}
              <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "var(--border)", padding: 4, borderRadius: 10, width: "fit-content" }}>
                {[{ id: "history", label: "All History" }, { id: "top_laptops", label: "Top Laptops" }, { id: "by_user", label: "By User" }].map(tab => (
                  <button key={tab.id} onClick={() => setReportTab(tab.id)}
                    style={{ border: "none", padding: "7px 16px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600, background: reportTab === tab.id ? "var(--card-bg)" : "transparent", color: reportTab === tab.id ? "var(--text-primary)" : "var(--text-muted)", boxShadow: reportTab === tab.id ? "var(--shadow)" : "none", transition: "all 0.15s" }}>
                    {tab.label}
                  </button>
                ))}
              </div>

              <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
                <div className="table-scroll">
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    {reportTab === "history" && (<>
                      <thead><tr style={{ borderBottom: "1px solid var(--border)", background: "var(--hover-bg)" }}>
                        {["Laptop", "User", "Dept", "Start", "End", "Status", "Returned"].map(h => <th key={h} style={S.th}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {(() => {
                          const q = reportSearch.toLowerCase();
                          const filtered = q ? reports.history.filter(a => [a.laptop, a.user, a.department, a.model].some(f => (f||"").toLowerCase().includes(q))) : reports.history;
                          return (<>
                            {filtered.length === 0 && <tr><td colSpan="7" style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No assignments found</td></tr>}
                            {filtered.map(a => (
                              <tr key={a.id} className="row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
                                <td style={S.td}><span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{a.laptop}</span><br /><span style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.model}</span></td>
                                <td style={S.td}>{a.user}</td>
                                <td style={S.td}><span style={{ background: "var(--accent-bg)", color: "var(--accent)", padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>{a.department}</span></td>
                                <td style={S.td}><div style={{ fontSize: 12 }}>{formatDate(a.start_date)}</div><div style={{ fontSize: 12, color: "var(--accent)", fontFamily: "monospace" }}>{formatTime12(a.start_time)}</div></td>
                                <td style={S.td}><div style={{ fontSize: 12 }}>{formatDate(a.end_date)}</div><div style={{ fontSize: 12, color: "var(--red)", fontFamily: "monospace" }}>{formatTime12(a.end_time)}</div></td>
                                <td style={S.td}><StatusBadge status={a.status} /></td>
                                <td style={S.td}><span style={{ fontSize: 12, color: "var(--text-muted)" }}>{a.returned_at}</span></td>
                              </tr>
                            ))}
                          </>);
                        })()}
                      </tbody>
                    </>)}
                    {reportTab === "top_laptops" && (<>
                      <thead><tr style={{ borderBottom: "1px solid var(--border)", background: "var(--hover-bg)" }}>
                        {["#", "Laptop", "Model", "Times Used"].map(h => <th key={h} style={S.th}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {(() => {
                          const q = reportSearch.toLowerCase();
                          const filtered = q ? reports.top_laptops.filter(l => [l.laptop__name, l.laptop__model].some(f => (f||"").toLowerCase().includes(q))) : reports.top_laptops;
                          return filtered.map((l, i) => (
                            <tr key={i} className="row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
                              <td style={S.td}><span style={{ fontWeight: 800, color: "var(--text-muted)", fontSize: 15 }}>#{i + 1}</span></td>
                              <td style={S.td}><span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{l.laptop__name}</span></td>
                              <td style={S.td}>{l.laptop__model}</td>
                              <td style={S.td}><span style={{ background: "var(--accent-bg)", color: "var(--accent)", padding: "3px 10px", borderRadius: 20, fontSize: 13, fontWeight: 700 }}>{l.count}×</span></td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </>)}
                    {reportTab === "by_user" && (<>
                      <thead><tr style={{ borderBottom: "1px solid var(--border)", background: "var(--hover-bg)" }}>
                        {["User", "Department", "Total"].map(h => <th key={h} style={S.th}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {(() => {
                          const q = reportSearch.toLowerCase();
                          const filtered = q ? reports.by_user.filter(u => [u.user__name, u.user__department].some(f => (f||"").toLowerCase().includes(q))) : reports.by_user;
                          return filtered.map((u, i) => (
                            <tr key={i} className="row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
                              <td style={S.td}><span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{u.user__name}</span></td>
                              <td style={S.td}><span style={{ background: "var(--accent-bg)", color: "var(--accent)", padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>{u.user__department}</span></td>
                              <td style={S.td}><span style={{ background: "var(--green-bg)", color: "var(--green)", padding: "3px 10px", borderRadius: 20, fontSize: 13, fontWeight: 700 }}>{u.count}×</span></td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </>)}
                  </table>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </>
  );
}
