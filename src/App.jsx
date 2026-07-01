import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Download, RefreshCw, AlertCircle, CheckCircle, Settings, Cable, Layers, BookOpen, BarChart3, FileDown, Database, X, ChevronRight, Zap, GitBranch, Calculator, Upload, FileText, Save, ZoomIn, ZoomOut, Pencil, Move, Link2, MousePointer2, Grid3x3, HelpCircle, Globe, Home } from 'lucide-react';
import * as XLSX from 'xlsx';

// =========================
// STORAGE ABSTRACTION
// Single place to swap window.storage (Claude artifact) for localStorage (Vercel).
// =========================
const appStorage = (() => {
  const DB_NAME = 'cable_designer_db', STORE = 'kv';
  let _dbp = null;
  const openDB = () => {
    if (_dbp) return _dbp;
    _dbp = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => { try { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); } catch (e) {} };
      req.onblocked = () => reject(new Error('blocked'));
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        if (db.objectStoreNames.contains(STORE)) { resolve(db); return; }
        const nextV = (db.version || 1) + 1;
        try { db.close(); } catch (e) {}
        let req2;
        try { req2 = indexedDB.open(DB_NAME, nextV); } catch (e) { reject(e); return; }
        req2.onupgradeneeded = () => { try { const db2 = req2.result; if (!db2.objectStoreNames.contains(STORE)) db2.createObjectStore(STORE); } catch (e) {} };
        req2.onblocked = () => reject(new Error('blocked'));
        req2.onsuccess = () => resolve(req2.result);
        req2.onerror = () => reject(req2.error);
      };
    });
    _dbp.catch(() => { _dbp = null; });
    return _dbp;
  };
  const putVal = async (key, value) => {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(value, key);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  };
  const getVal = async (key) => {
    const db = await openDB();
    return await new Promise((resolve) => {
      const t = db.transaction(STORE, 'readonly');
      const r = t.objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result != null ? r.result : null);
      r.onerror = () => resolve(null);
    });
  };
  const dataUrlToBlob = (dataUrl) => {
    const i = dataUrl.indexOf(',');
    const head = dataUrl.slice(0, i), b64 = dataUrl.slice(i + 1);
    const mime = (head.match(/:(.*?);/) || [])[1] || 'image/jpeg';
    const bin = atob(b64); const len = bin.length; const arr = new Uint8Array(len);
    for (let j = 0; j < len; j++) arr[j] = bin.charCodeAt(j);
    return new Blob([arr], { type: mime });
  };
  return {
    async get(key) {
      try {
        const v = await getVal(key);
        if (v != null) return typeof v === 'string' ? v : v;
        try { const ls = localStorage.getItem(key); if (ls != null) return ls; } catch (e) {}
        return null;
      } catch (e) {
        try { return localStorage.getItem(key); } catch (e2) { return null; }
      }
    },
    async set(key, value) {
      try { await putVal(key, value); return true; }
      catch (e) { try { localStorage.setItem(key, value); return true; } catch (e2) { return false; } }
    },
    async delete(key) {
      try { const db = await openDB(); await new Promise((resolve) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(key); t.oncomplete = () => resolve(); t.onerror = () => resolve(); }); } catch (e) {}
      try { localStorage.removeItem(key); } catch (e) {}
    },
    async keys(prefix) {
      try {
        const db = await openDB();
        const all = await new Promise((resolve) => { const t = db.transaction(STORE, 'readonly'); const r = t.objectStore(STORE).getAllKeys(); r.onsuccess = () => resolve(r.result || []); r.onerror = () => resolve([]); });
        let ks = all.map(String);
        try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && ks.indexOf(k) === -1) ks.push(k); } } catch (e) {}
        return prefix ? ks.filter(k => k.indexOf(prefix) === 0) : ks;
      } catch (e) {
        try { const ks = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) ks.push(k); } return prefix ? ks.filter(k => k.indexOf(prefix) === 0) : ks; } catch (e2) { return []; }
      }
    },
    async setImage(key, dataUrl) {
      try { await putVal(key, dataUrlToBlob(dataUrl)); return true; }
      catch (e) { try { return await this.set(key, dataUrl); } catch (e2) { return false; } }
    },
    async getImage(key) {
      try {
        const v = await getVal(key);
        if (v == null) { try { const ls = localStorage.getItem(key); return ls || null; } catch (e) { return null; } }
        if (typeof v === 'string') return v;
        return await new Promise((resolve) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => resolve(null); fr.readAsDataURL(v); });
      } catch (e) { try { return localStorage.getItem(key); } catch (e2) { return null; } }
    },
    async backend() {
      try { await putVal('__probe__', '1'); const v = await getVal('__probe__'); return v === '1' ? 'indexeddb' : 'localstorage'; }
      catch (e) { return 'localstorage'; }
    },
    async migrate() {
      try {
        await openDB();
        const lsKeys = [];
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('cable_') === 0) lsKeys.push(k); }
        for (const k of lsKeys) {
          try {
            const existing = await getVal(k);
            if (existing == null) { const val = localStorage.getItem(k); if (val != null) await putVal(k, val); }
            const check = await getVal(k);
            if (check != null) { try { localStorage.removeItem(k); } catch (e) {} }
          } catch (e) {}
        }
      } catch (e) {}
    },
  };
})();


// =========================
// CONSTANTS
// =========================
const REDUCTION_FACTORS = [[1,1.00],[2,0.88],[3,0.82],[4,0.77],[5,0.75],[6,0.73],[7,0.73],[8,0.72],[9,0.72],[10,0.72]];
const AMBIENT_FACTORS = [[10,1.22],[15,1.17],[20,1.12],[25,1.06],[30,1.00],[35,0.94],[40,0.87],[45,0.79],[50,0.71],[55,0.61],[60,0.50]];
const MCB_MULT = { B:5, C:10, D:20, MCCB:10, ACB:8 };
const LS_COLOR = { LS1:'#D1C4E9', LS2:'#FFE0B2', LS3:'#C8E6C9' };
const LS_BORDER = { LS1:'#4527A0', LS2:'#a04500', LS3:'#2d662d' };
const LS_MAIN = new Set(['Main feeder','Tie cable','Sub-board feeder','UPS input','UPS output']);
const REGENERATIVE = new Set(['UPS-A','UPS-B']);
const FUNCTIONS = ['Main feeder','Tie cable','Sub-board feeder','UPS input','UPS output','PDU feeder','Motor circuit','Socket circuit','Lighting circuit','Rack feeder'];
const RHO_70 = 0.0225;
const SQRT3 = Math.sqrt(3);

// =========================
// HELPERS
// =========================
const kGrouping = n => REDUCTION_FACTORS.find(([c])=>n<=c)?.[1] ?? 0.72;
const kAmbient = t => AMBIENT_FACTORS.find(([temp])=>temp===t)?.[1] ?? 1.0;
const area = od => Math.round(Math.PI/4*od*od*10)/10;
const round = (v,d=2) => Math.round(v*Math.pow(10,d))/Math.pow(10,d);

// Safe confirm — in sandboxed iframes window.confirm can be blocked and
// silently returns false. Fall back to proceeding so delete buttons still work.
function safeConfirm(msg) {
  try {
    const r = window.confirm(msg);
    return r;
  } catch (e) {
    return true;
  }
}

// =========================
// DEFAULT DATA
// =========================
const mkCT = (conductors, cs, S, od, iz, par=1) => ({conductors, cross_section:cs, S_mm2:S, od_mm:od, iz_a:iz, is_parallel:par, area_mm2:area(od)});

const DEFAULT_CABLE_TYPES = {
  'NYM-J 5G16':  mkCT(5,'5G16',16,21,73),
  'NYM-J 5G2.5': mkCT(5,'5G2.5',2.5,14,23),
  'NYM-J 3G2.5': mkCT(3,'3G2.5',2.5,11,26),
  'NYM-J 3G1.5': mkCT(3,'3G1.5',1.5,8.5,19),
  'Cu 8x240':    mkCT(5,'5G240×8',240,115,3320,8),
  'Cu 6x240':    mkCT(5,'5G240×6',240,100,2490,6),
  'Cu 6x185':    mkCT(5,'5G185×6',185,95,2100,6),
  'Cu 4x240':    mkCT(5,'5G240×4',240,80,1660,4),
  'Cu 4x185':    mkCT(5,'5G185×4',185,70,1400,4),
  'Cu 5G240':    mkCT(5,'5G240',240,45,415),
  'Cu 5G120':    mkCT(5,'5G120',120,33,280),
  'Cu 5G95':     mkCT(5,'5G95',95,30,230),
  'Cu 5G70':     mkCT(5,'5G70',70,26,185),
  'Cu 5G35':     mkCT(5,'5G35',35,20,115),
  'Cu 5G16':     mkCT(5,'5G16',16,15,73),
  'Cu 5G6':      mkCT(5,'5G6',6,13,38),
  'Cu 3G2.5':    mkCT(3,'3G2.5',2.5,11,26),
};
// Cable-tray catalogue. Trays come in 100 mm and 150 mm heights, in widths from
// 100 mm to 900 mm in 50 mm steps. Key is `width x height`.
const DEFAULT_TRAY_TYPES = (() => {
  const t = {};
  const heights = [100, 150];
  for (let w = 100; w <= 900; w += 50) {
    for (const h of heights) {
      t[`${w}x${h}`] = { width_mm: w, height_mm: h, gross_area_mm2: w * h, max_fill_percent: 40 };
    }
  }
  return t;
})();
const DEFAULT_TRANSFORMER_TYPES = {
  'TR 2500 kVA': { S_kVA:2500, U_pri_kV:10, U_sec_V:400, uk_pct:6.0 },
  'TR 1600 kVA': { S_kVA:1600, U_pri_kV:10, U_sec_V:400, uk_pct:6.0 },
  'TR 1000 kVA': { S_kVA:1000, U_pri_kV:10, U_sec_V:400, uk_pct:6.0 },
  'TR 630 kVA':  { S_kVA:630,  U_pri_kV:10, U_sec_V:400, uk_pct:4.0 },
  'TR 400 kVA':  { S_kVA:400,  U_pri_kV:10, U_sec_V:400, uk_pct:4.0 },
};
const STANDARD_BREAKERS = [10,13,16,20,25,32,40,50,63,80,100,125,160,200,250,315,400,500,630,800,1000,1250,1600,2000,2500,3200,4000];

// Each standard tray width reserves a specific colour, so the width can be read
// off the drawing at a glance. Widths not listed fall back to the nearest band.
const TRAY_WIDTH_COLORS = {
  50:  '#9e9e9e',  // grey
  100: '#1565C0',  // blue
  150: '#00838f',  // teal
  200: '#2e7d32',  // green
  250: '#827717',  // olive
  300: '#f9a825',  // amber
  350: '#ef6c00',  // orange
  400: '#d84315',  // deep orange
  450: '#6a1b9a',  // purple
  500: '#283593',  // indigo
  550: '#0097a7',  // cyan
  600: '#c62828',  // red
  650: '#ad1457',  // pink
  700: '#5d4037',  // brown
  750: '#455a64',  // blue grey
  800: '#37474F',  // dark slate
  850: '#4527a0',  // deep purple
  900: '#263238',  // near-black slate
};
// Colour for a given tray width (mm) — nearest defined band if not exact.
function trayWidthColor(width_mm) {
  if (!width_mm) return '#1f6feb';
  if (TRAY_WIDTH_COLORS[width_mm]) return TRAY_WIDTH_COLORS[width_mm];
  const widths = Object.keys(TRAY_WIDTH_COLORS).map(Number);
  let nearest = widths[0], best = Infinity;
  for (const w of widths) { const d = Math.abs(w - width_mm); if (d < best) { best = d; nearest = w; } }
  return TRAY_WIDTH_COLORS[nearest];
}
// Line thickness (SVG px) scaled from tray width (mm). Clamped to a sensible range.
function trayWidthStroke(width_mm) {
  if (!width_mm) return 5;
  // 100 mm → ~3 px, 600 mm → ~12 px (roughly linear)
  return Math.max(2.5, Math.min(16, 2 + width_mm / 55));
}
const DEFAULT_PROJECT = {
  site:'NewProj', location:'01', description:'New project',
  ambient_c:35, z_source_mohm:40, ls_threshold:0.30,
  transformer:null, n_transformers_parallel:1,
  vd_limits:{ 'Lighting circuit':3.0, 'Rack feeder':2.0, _default:5.0 },
};

// A fresh, empty project bundle
function emptyBundle() {
  return {
    project: { ...DEFAULT_PROJECT },
    cableTypes: DEFAULT_CABLE_TYPES,
    trayTypes: DEFAULT_TRAY_TYPES,
    transformerTypes: DEFAULT_TRANSFORMER_TYPES,
    segments: {},
    nodes: {},
    cables: [],
    bgImage: null,
  };
}

// Z from transformer: Z = uk% × U² / (100 × S) in mΩ (U in V, S in kVA)
function calcZsource(t, n=1) {
  if (!t) return null;
  return round(t.uk_pct * t.U_sec_V * t.U_sec_V / (100 * t.S_kVA * n), 2);
}

// File I/O
function downloadBlob(filename, content, mime='application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
function parseCSVLine(line) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
    else if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
function cablesToCSV(cables) {
  const headers = ['id','from','to','function','V','phases','cable_type','Ib','In','cos_phi','route'];
  const esc = v => {
    if (Array.isArray(v)) v = v.join('|');
    const s = String(v ?? '');
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const rows = cables.map(c => headers.map(h => esc(c[h])).join(','));
  return [headers.join(','), ...rows].join('\n');
}
function csvToCables(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const o = {};
    headers.forEach((h, i) => {
      let v = vals[i] ?? '';
      if (['V','phases','Ib','In'].includes(h)) v = Number(v) || 0;
      else if (h === 'cos_phi') v = Number(v) || 0.9;
      else if (h === 'route') v = v ? v.split('|').map(s=>s.trim()).filter(Boolean) : [];
      o[h] = v;
    });
    return o;
  });
}

// =========================
// TEMPLATES
// =========================
function smallOfficeTemplate() {
  const segments = {
    WC001:{from:'Q1',to:'N1',length_m:10,tray_type:'200x60'},
    WC002:{from:'N1',to:'N2',length_m:8,tray_type:'200x60'},
    WC003:{from:'N1',to:'N5',length_m:6,tray_type:'200x60'},
    WC004:{from:'N5',to:'X1',length_m:4,tray_type:'100x60'},
    WC005:{from:'N5',to:'X2',length_m:4,tray_type:'100x60'},
    WC006:{from:'N2',to:'Q2',length_m:5,tray_type:'200x60'},
    WC007:{from:'N2',to:'N3',length_m:8,tray_type:'200x60'},
    WC008:{from:'N3',to:'X3',length_m:4,tray_type:'100x60'},
    WC009:{from:'N3',to:'X4',length_m:4,tray_type:'100x60'},
    WC010:{from:'Q2',to:'N6',length_m:6,tray_type:'200x60'},
    WC011:{from:'N6',to:'N7',length_m:6,tray_type:'200x60'},
    WC012:{from:'N7',to:'X5',length_m:6,tray_type:'100x60'},
    WC013:{from:'N7',to:'X6',length_m:6,tray_type:'100x60'},
    WC014:{from:'N6',to:'N8',length_m:8,tray_type:'200x60'},
    WC015:{from:'N6',to:'N9',length_m:6,tray_type:'200x60'},
    WC016:{from:'N9',to:'X7',length_m:14,tray_type:'100x60'},
    WC017:{from:'N9',to:'X8',length_m:14,tray_type:'100x60'},
    WC018:{from:'N8',to:'N10',length_m:8,tray_type:'200x60'},
    WC019:{from:'N10',to:'X9',length_m:16,tray_type:'100x60'},
    WC020:{from:'N10',to:'X10',length_m:16,tray_type:'100x60'},
  };
  const cables = [
    {id:'W001',from:'Q1',to:'Q2',function:'Sub-board feeder',V:400,phases:3,cable_type:'NYM-J 5G16',Ib:32,In:40,cos_phi:0.90,route:['WC001','WC002','WC006']},
    {id:'W002',from:'Q1',to:'X1',function:'Socket circuit',V:230,phases:1,cable_type:'NYM-J 3G2.5',Ib:13,In:16,cos_phi:0.90,route:['WC001','WC003','WC004']},
    {id:'W003',from:'Q1',to:'X2',function:'Socket circuit',V:230,phases:1,cable_type:'NYM-J 3G2.5',Ib:13,In:16,cos_phi:0.90,route:['WC001','WC003','WC005']},
    {id:'W004',from:'Q1',to:'X3',function:'Lighting circuit',V:230,phases:1,cable_type:'NYM-J 3G1.5',Ib:3,In:10,cos_phi:1.0,route:['WC001','WC002','WC007','WC008']},
    {id:'W005',from:'Q1',to:'X4',function:'Lighting circuit',V:230,phases:1,cable_type:'NYM-J 3G1.5',Ib:3,In:10,cos_phi:1.0,route:['WC001','WC002','WC007','WC009']},
    {id:'W006',from:'Q2',to:'X5',function:'Motor circuit',V:400,phases:3,cable_type:'NYM-J 5G2.5',Ib:15,In:16,cos_phi:0.85,route:['WC011','WC012']},
    {id:'W007',from:'Q2',to:'X6',function:'Motor circuit',V:400,phases:3,cable_type:'NYM-J 5G2.5',Ib:15,In:16,cos_phi:0.85,route:['WC011','WC013']},
    {id:'W008',from:'Q2',to:'X7',function:'Socket circuit',V:230,phases:1,cable_type:'NYM-J 3G2.5',Ib:13,In:16,cos_phi:0.90,route:['WC010','WC015','WC016']},
    {id:'W009',from:'Q2',to:'X8',function:'Socket circuit',V:230,phases:1,cable_type:'NYM-J 3G2.5',Ib:13,In:16,cos_phi:0.90,route:['WC010','WC015','WC017']},
    {id:'W010',from:'Q2',to:'X9',function:'Lighting circuit',V:230,phases:1,cable_type:'NYM-J 3G1.5',Ib:6,In:10,cos_phi:1.0,route:['WC010','WC014','WC018','WC019']},
    {id:'W011',from:'Q2',to:'X10',function:'Lighting circuit',V:230,phases:1,cable_type:'NYM-J 3G1.5',Ib:6,In:10,cos_phi:1.0,route:['WC010','WC014','WC018','WC020']},
  ];
  return {
    project:{...DEFAULT_PROJECT, site:'B1', location:'02', description:'Small office building'},
    segments, cables,
  };
}

function datacenterTemplate() {
  const segments = {
    'WC-T1-HT1':['T1','HT1',6,'600x100'], 'WC-T2-HT2':['T2','HT2',6,'600x100'], 'WC-TIE':['HT1','HT2',8,'600x100'],
    'WC-HT1-UA':['HT1','UPS-A',10,'600x100'], 'WC-HT2-UB':['HT2','UPS-B',10,'600x100'],
    'WC-UA-UTIA':['UPS-A','UT-IT-A',8,'600x100'], 'WC-UB-UTIB':['UPS-B','UT-IT-B',8,'600x100'],
    'WC-HT1-UTMA':['HT1','UT-MECH-A',12,'400x100'], 'WC-HT2-UTMB':['HT2','UT-MECH-B',12,'400x100'],
    'WC-HT1-UTSVC':['HT1','UT-SVC',15,'200x60'],
    'WC-RISER-A-H01':['UT-IT-A','N-IT-A-H01',20,'400x100'], 'WC-RISER-A-H02':['UT-IT-A','N-IT-A-H02',28,'400x100'],
    'WC-RISER-B-H01':['UT-IT-B','N-IT-B-H01',20,'400x100'], 'WC-RISER-B-H02':['UT-IT-B','N-IT-B-H02',28,'400x100'],
    'WC-RMECH-A-H01':['UT-MECH-A','N-MECH-A-H01',22,'300x100'], 'WC-RMECH-A-H02':['UT-MECH-A','N-MECH-A-H02',30,'300x100'],
    'WC-RMECH-B-H01':['UT-MECH-B','N-MECH-B-H01',22,'300x100'], 'WC-RMECH-B-H02':['UT-MECH-B','N-MECH-B-H02',30,'300x100'],
    'WC-SVC-H01':['UT-SVC','N-SVC-H01',24,'100x60'], 'WC-SVC-H02':['UT-SVC','N-SVC-H02',32,'100x60'],
    'WC-H01-ITA':['N-IT-A-H01','N-H01-A-end',25,'300x100'], 'WC-H01-ITB':['N-IT-B-H01','N-H01-B-end',25,'300x100'],
    'WC-H02-ITA':['N-IT-A-H02','N-H02-A-end',25,'300x100'], 'WC-H02-ITB':['N-IT-B-H02','N-H02-B-end',25,'300x100'],
    'WC-H01-MECHA':['N-MECH-A-H01','N-H01-MA-end',30,'200x60'], 'WC-H01-MECHB':['N-MECH-B-H01','N-H01-MB-end',30,'200x60'],
    'WC-H02-MECHA':['N-MECH-A-H02','N-H02-MA-end',30,'200x60'], 'WC-H02-MECHB':['N-MECH-B-H02','N-H02-MB-end',30,'200x60'],
    'WC-H01R01-A':['PDU-H01R01-A','end',12,'200x60'], 'WC-H01R01-B':['PDU-H01R01-B','end',12,'200x60'],
    'WC-H01R02-A':['PDU-H01R02-A','end',12,'200x60'], 'WC-H01R02-B':['PDU-H01R02-B','end',12,'200x60'],
    'WC-H02R01-A':['PDU-H02R01-A','end',12,'200x60'], 'WC-H02R01-B':['PDU-H02R01-B','end',12,'200x60'],
    'WC-H02R02-A':['PDU-H02R02-A','end',12,'200x60'], 'WC-H02R02-B':['PDU-H02R02-B','end',12,'200x60'],
    'WC-CHILL-A':['UT-MECH-A','Chiller-1',35,'300x100'], 'WC-CHILL-B':['UT-MECH-B','Chiller-2',35,'300x100'],
  };
  const segs = {};
  Object.entries(segments).forEach(([k, [f,t,l,tt]]) => segs[k] = {from:f, to:t, length_m:l, tray_type:tt});
  const cables = [];
  let idx = 1; const W = () => `W${String(idx++).padStart(3,'0')}`;
  const add = (from,to,fn,V,ph,ct,Ib,In,cp,rt) => cables.push({id:W(),from,to,function:fn,V,phases:ph,cable_type:ct,Ib,In,cos_phi:cp,route:rt});
  add('T1','HT1','Main feeder',400,3,'Cu 8x240',2200,2500,0.90,['WC-T1-HT1']);
  add('T2','HT2','Main feeder',400,3,'Cu 8x240',2200,2500,0.90,['WC-T2-HT2']);
  add('HT1','HT2','Tie cable',400,3,'Cu 8x240',0,2500,0.90,['WC-TIE']);
  add('HT1','UPS-A','UPS input',400,3,'Cu 6x240',1700,2000,0.90,['WC-HT1-UA']);
  add('UPS-A','UT-IT-A','UPS output',400,3,'Cu 6x240',1700,2000,0.90,['WC-UA-UTIA']);
  add('HT2','UPS-B','UPS input',400,3,'Cu 6x240',1700,2000,0.90,['WC-HT2-UB']);
  add('UPS-B','UT-IT-B','UPS output',400,3,'Cu 6x240',1700,2000,0.90,['WC-UB-UTIB']);
  add('HT1','UT-MECH-A','Sub-board feeder',400,3,'Cu 4x185',800,1000,0.85,['WC-HT1-UTMA']);
  add('HT2','UT-MECH-B','Sub-board feeder',400,3,'Cu 4x185',800,1000,0.85,['WC-HT2-UTMB']);
  add('HT1','UT-SVC','Sub-board feeder',400,3,'Cu 5G35',80,100,0.90,['WC-HT1-UTSVC']);
  ['H01','H02'].forEach(h => [1,2].forEach(r => ['A','B'].forEach(s => add(`UT-IT-${s}`,`PDU-${h}R0${r}-${s}`,'PDU feeder',400,3,'Cu 5G95',144,160,0.90,[`WC-RISER-${s}-${h}`,`WC-${h}-IT${s}`]))));
  let ci = 0;
  ['H01','H02'].forEach(h => [1,2,3,4].forEach(n => { ci++; const s = n%2===1?'A':'B'; add(`UT-MECH-${s}`,`CRAH-${String(ci).padStart(2,'0')}`,'Motor circuit',400,3,'Cu 5G35',55,63,0.85,[`WC-RMECH-${s}-${h}`,`WC-${h}-MECH${s}`]); }));
  add('UT-MECH-A','Chiller-1','Motor circuit',400,3,'Cu 5G120',175,200,0.85,['WC-CHILL-A']);
  add('UT-MECH-B','Chiller-2','Motor circuit',400,3,'Cu 5G120',175,200,0.85,['WC-CHILL-B']);
  [['Light-H01',2,10,'H01'],['Light-H02',2,10,'H02'],['BMS-H01',1,6,'H01'],['BMS-H02',1,6,'H02'],['SEC-H01',1,6,'H01'],['SEC-H02',1,6,'H02'],['FIRE',2,10,'H01'],['CCTV',1,6,'H01']].forEach(([n,ib,inn,h]) => add('UT-SVC',n,'Lighting circuit',230,1,'Cu 3G2.5',ib,inn,1.0,[`WC-SVC-${h}`]));
  ['H01','H02'].forEach(h => [1,2].forEach(r => ['A','B'].forEach(s => { for (let k=1; k<=8; k++) add(`PDU-${h}R0${r}-${s}`,`Rack-${h}R0${r}.${String(k).padStart(2,'0')}${s}`,'Rack feeder',400,3,'Cu 5G6',16,16,0.90,[`WC-${h}R0${r}-${s}`]); })));
  return {
    project:{...DEFAULT_PROJECT, site:'DC1', location:'G01', description:'Tier III · 2.5 MW IT · 2N redundancy', z_source_mohm:8},
    segments:segs, cables,
  };
}

// =========================
// ANALYSIS ENGINE
// =========================
function analyze(state) {
  const { cables, segments, cableTypes, trayTypes, project } = state;
  const kT = kAmbient(project.ambient_c);
  const classify = (c) => {
    if (LS_MAIN.has(c.function)) return 'LS1';
    const iz = cableTypes[c.cable_type]?.iz_a ?? 1;
    return (c.Ib / iz) > project.ls_threshold ? 'LS2' : 'LS3';
  };
  const lsOf = {}, lsUtil = {};
  cables.forEach(c => { lsOf[c.id] = classify(c); lsUtil[c.id] = c.Ib > 0 ? round(c.Ib/(cableTypes[c.cable_type]?.iz_a ?? 1)*100, 1) : 0; });

  // occupancy
  const occByLS = {}, occ = {};
  Object.keys(segments).forEach(s => { occ[s] = []; occByLS[s] = {LS1:[],LS2:[],LS3:[]}; });
  cables.forEach(c => {
    const a = cableTypes[c.cable_type]?.area_mm2 ?? 0;
    const ls = lsOf[c.id];
    (c.route || []).forEach(s => { if (occ[s]) { occ[s].push({id:c.id, area:a}); occByLS[s][ls].push(c.id); } });
  });
  const lsCounts = {};
  Object.keys(segments).forEach(s => { lsCounts[s] = {LS1:occByLS[s].LS1.length, LS2:occByLS[s].LS2.length, LS3:occByLS[s].LS3.length}; });

  // tray fill
  const trayFill = {};
  Object.entries(segments).forEach(([s, seg]) => {
    const tt = trayTypes[seg.tray_type];
    if (!tt) return;
    const totalArea = occ[s].reduce((a,c)=>a+c.area, 0);
    const fillPct = round(totalArea/tt.gross_area_mm2*100, 1);
    trayFill[s] = { total_area:round(totalArea,1), fill_pct:fillPct, max:tt.max_fill_percent, status:fillPct<=tt.max_fill_percent?'OK':'OVERFILL', count:occ[s].length };
  });

  // derating
  const derating = {};
  cables.forEach(c => {
    const ls = lsOf[c.id];
    const iz = cableTypes[c.cable_type]?.iz_a ?? 0;
    let kg, worstSeg, worstN;
    if (ls === 'LS3') {
      worstSeg = c.route?.[0] || ''; worstN = lsCounts[worstSeg]?.LS3 ?? 0; kg = 1.00;
    } else {
      let mx = -1; worstSeg = c.route?.[0] || ''; worstN = 0;
      (c.route || []).forEach(s => { const n = lsCounts[s]?.[ls] ?? 0; if (n > mx) { mx = n; worstSeg = s; worstN = n; } });
      kg = kGrouping(worstN);
    }
    const kTot = kg * kT;
    const izFinal = round(iz * kTot, 1);
    const margin = round(izFinal - c.In, 1);
    derating[c.id] = { ls, worst_seg:worstSeg, worst_n:worstN, kg, kt:kT, k_total:round(kTot,3), iz_base:iz, iz_final:izFinal, margin, status: (c.Ib <= c.In && c.In <= izFinal) ? 'OK' : 'FAIL' };
  });

  // upstream chain (UPS resets)
  const upstream = {};
  cables.forEach(c => {
    if (REGENERATIVE.has(c.from)) { upstream[c.id] = null; return; }
    upstream[c.id] = cables.find(c2 => c2.to === c.from)?.id ?? null;
  });

  // voltage drop
  const vd = {};
  cables.forEach(c => {
    const ct = cableTypes[c.cable_type];
    if (!ct) { vd[c.id] = null; return; }
    const L = (c.route || []).reduce((a,s)=>a+(segments[s]?.length_m ?? 0), 0) + (c.to.match(/^(HT|UT|UPS|PDU|N-)/) ? 0 : 1.5);
    const K = c.phases === 3 ? SQRT3 : 2.0;
    const duV = K * RHO_70 * L * c.Ib * c.cos_phi / (ct.S_mm2 * ct.is_parallel);
    const duLocal = duV / c.V * 100;
    const parent = upstream[c.id];
    const duUp = parent && vd[parent] ? vd[parent].du_total : 0;
    const duTot = duLocal + duUp;
    const limit = project.vd_limits[c.function] ?? project.vd_limits._default;
    vd[c.id] = { length:L, du_v:round(duV,2), du_local:round(duLocal,3), du_upstream:round(duUp,3), du_total:round(duTot,3), limit, parent, status: duTot <= limit ? 'OK' : 'FAIL' };
  });

  // short-circuit
  const mcbType = {};
  cables.forEach(c => {
    if (c.In >= 800) mcbType[c.id] = 'ACB';
    else if (c.In >= 100) mcbType[c.id] = 'MCCB';
    else if (c.function === 'Motor circuit') mcbType[c.id] = 'C';
    else mcbType[c.id] = 'B';
  });
  const sc = {};
  cables.forEach(c => {
    const chain = []; let cur = c.id;
    while (cur) { chain.unshift(cur); cur = upstream[cur]; }
    let z = project.z_source_mohm;
    chain.forEach(cid => {
      const cb = cables.find(x => x.id === cid);
      const ct = cableTypes[cb.cable_type];
      if (!ct) return;
      const L = (cb.route || []).reduce((a,s)=>a+(segments[s]?.length_m ?? 0), 0) + (cb.to.match(/^(HT|UT|UPS|PDU|N-)/) ? 0 : 1.5);
      const rPerM = RHO_70 / (ct.S_mm2 * ct.is_parallel) * 1000;
      z += 2 * rPerM * L;
    });
    const iK = 230 / (z/1000);
    const mt = mcbType[c.id];
    const iA = c.In * (MCB_MULT[mt] ?? 5);
    sc[c.id] = { mcb_type:mt, z_loop:round(z,2), ik_min:Math.round(iK), ia:iA, ratio:iA>0?round(iK/iA,2):0, margin:Math.round(iK-iA), status: iK >= iA ? 'OK' : 'FAIL' };
  });

  // selectivity
  const sel = [];
  Object.entries(upstream).forEach(([ch, pr]) => {
    if (!pr) return;
    const cc = cables.find(x=>x.id===ch); const cp = cables.find(x=>x.id===pr);
    if (!cc || !cp || cc.In === 0 || cp.In === 0) return;
    const ratio = cp.In / cc.In;
    sel.push({ upstream:pr, downstream:ch, in_up:cp.In, in_down:cc.In, ratio:round(ratio,2), status: ratio >= 1.6 ? 'Selective (current)' : 'Check mfr. table' });
  });

  // optimization
  const opt = [];
  cables.forEach(c => {
    const d = derating[c.id], v = vd[c.id], s = sc[c.id];
    const izUsed = d.iz_final > 0 ? c.In/d.iz_final*100 : 0;
    const vdUsed = v && v.limit > 0 ? v.du_total/v.limit*100 : 0;
    if (d.status === 'FAIL') opt.push({ cable:c.id, severity:'CRITICAL', issue:'Current capacity insufficient', detail:`In=${c.In}A > Iz·k=${d.iz_final}A`, rec:'Upgrade cross-section or reduce cables in worst segment' });
    else if (izUsed >= 90) opt.push({ cable:c.id, severity:'TIGHT', issue:'Current capacity margin tight', detail:`In=${c.In}A vs Iz·k=${d.iz_final}A (${Math.round(izUsed)}% used)`, rec:`Split worst segment ${d.worst_seg} (${d.worst_n} cables) to reduce k_g` });
    if (v && v.status === 'FAIL') opt.push({ cable:c.id, severity:'CRITICAL', issue:'Voltage drop exceeds limit', detail:`ΔU=${v.du_total}% > ${v.limit}%`, rec:'Upgrade cross-section or shorten run' });
    else if (v && vdUsed >= 90) opt.push({ cable:c.id, severity:'TIGHT', issue:'Voltage drop near limit', detail:`ΔU=${v.du_total}% (${Math.round(vdUsed)}% of ${v.limit}%)`, rec:'Consider larger cross-section' });
    if (s && s.status === 'FAIL') opt.push({ cable:c.id, severity:'CRITICAL', issue:'Insufficient fault current', detail:`Ik=${s.ik_min}A < Ia=${s.ia}A`, rec:'Shorten cable, increase cross-section, or change MCB type' });
  });

  return { lsOf, lsUtil, lsCounts, occByLS, trayFill, derating, upstream, vd, mcbType, sc, sel, opt };
}

// =========================
// EXCEL EXPORT
// =========================
function exportXlsx(state, A, filename) {
  const wb = XLSX.utils.book_new();
  const { project, cables, segments, cableTypes, trayTypes } = state;
  const aoa2sheet = (rows) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    return ws;
  };
  // Project
  XLSX.utils.book_append_sheet(wb, aoa2sheet([
    ['Parameter','Value','Notes'],
    ['Site', project.site, 'IEC 81346'],
    ['Location', project.location, ''],
    ['Description', project.description, ''],
    ['Ambient temperature [°C]', project.ambient_c, 'Drives k_temp'],
    ['k_temp', kAmbient(project.ambient_c), 'Auto from IEC 60364-5-52 Table B.52.14'],
    ['Z_source loop [mΩ]', project.z_source_mohm, 'Source + busbar impedance'],
    ['ρ (Cu @ 70°C)', RHO_70, 'Used in ΔU and SC'],
    ['LS threshold', project.ls_threshold, 'Ib/Iz boundary LS2 vs LS3'],
  ]), 'Project parameters');
  // Cable list
  const cl = [['Cable ID','From','To','Function','LS','V','Ph','Cable type','X-section','Iz base [A]','Ib [A]','In [A]','Route','Worst seg','Max cables','k_g','k_t','k_total','Iz final [A]','Margin [A]','Status']];
  cables.forEach(c => {
    const ct = cableTypes[c.cable_type]; const d = A.derating[c.id];
    cl.push([c.id, c.from, c.to, c.function, d.ls, c.V, c.phases, c.cable_type, ct?.cross_section ?? '', ct?.iz_a ?? '', c.Ib, c.In, (c.route||[]).join(' → '), d.worst_seg, d.worst_n, d.kg, d.kt, d.k_total, d.iz_final, d.margin, d.status]);
  });
  XLSX.utils.book_append_sheet(wb, aoa2sheet(cl), 'Cable list');
  // Tray occupancy
  const tr = [['Segment','From','To','Length [m]','Tray type','Cables','Total','LS1','LS2','LS3','Cable area','Fill [%]','Max [%]','Status']];
  Object.entries(segments).forEach(([sid, s]) => {
    const f = A.trayFill[sid]; const c = A.lsCounts[sid];
    const cables_in = (A.occByLS[sid]?.LS1.concat(A.occByLS[sid].LS2, A.occByLS[sid].LS3)) || [];
    tr.push([sid, s.from, s.to, s.length_m, s.tray_type, cables_in.join(', '), f?.count ?? 0, c.LS1, c.LS2, c.LS3, f?.total_area ?? 0, f?.fill_pct ?? 0, f?.max ?? 0, f?.status ?? '']);
  });
  XLSX.utils.book_append_sheet(wb, aoa2sheet(tr), 'Tray occupancy');
  // Track division
  const td = [
    ['LS','Description'],
    ['LS1','Main cables: feeders, UPS in/out. Own dedicated track.'],
    ['LS2','Loaded cables (Ib > 30% Iz). Bundled max 9, separator if cross-section ratio > 3×.'],
    ['LS3','Lightly loaded (Ib ≤ 30% Iz). Thermally invisible, k_g = 1.00.'],
    [], ['Per-segment distribution'],
    ['Segment','LS1','LS2','LS3','k_g (LS1)','k_g (LS2)']
  ];
  Object.entries(segments).forEach(([sid]) => {
    const c = A.lsCounts[sid];
    td.push([sid, c.LS1, c.LS2, c.LS3, c.LS1?kGrouping(c.LS1):'—', c.LS2?kGrouping(c.LS2):'—']);
  });
  XLSX.utils.book_append_sheet(wb, aoa2sheet(td), 'Track division (LS)');
  // Cable types
  const ct_sh = [['Cable type','Conductors','Cross-section','Parallel','S [mm²]','OD [mm]','Area [mm²]','Iz base [A]']];
  Object.entries(cableTypes).forEach(([n,t]) => ct_sh.push([n, t.conductors, t.cross_section, t.is_parallel, t.S_mm2, t.od_mm, t.area_mm2, t.iz_a]));
  XLSX.utils.book_append_sheet(wb, aoa2sheet(ct_sh), 'Cable types');
  // Tray types
  const tt_sh = [['Tray type','Width [mm]','Height [mm]','Gross area [mm²]','Max fill [%]']];
  Object.entries(trayTypes).forEach(([n,t]) => tt_sh.push([n, t.width_mm, t.height_mm, t.gross_area_mm2, t.max_fill_percent]));
  XLSX.utils.book_append_sheet(wb, aoa2sheet(tt_sh), 'Tray types');
  // Ambient factors
  XLSX.utils.book_append_sheet(wb, aoa2sheet([['Temperature [°C]','k_temp'], ...AMBIENT_FACTORS]), 'Ambient factors');
  // Reduction factors
  XLSX.utils.book_append_sheet(wb, aoa2sheet([['No. cables','k_g'], ...REDUCTION_FACTORS]), 'Reduction factors');
  // Voltage drop
  const vdt = [['Cable','From','To','Function','LS','Length [m]','Ib [A]','S [mm²]','Parallel','ΔU [V]','ΔU local [%]','Upstream','ΔU up [%]','ΔU total [%]','Limit [%]','Status']];
  cables.forEach(c => { const v = A.vd[c.id]; if (!v) return; vdt.push([c.id, c.from, c.to, c.function, A.derating[c.id].ls, v.length, c.Ib, cableTypes[c.cable_type]?.S_mm2 ?? '', cableTypes[c.cable_type]?.is_parallel ?? '', v.du_v, v.du_local, v.parent ?? '—', v.du_upstream, v.du_total, v.limit, v.status]); });
  XLSX.utils.book_append_sheet(wb, aoa2sheet(vdt), 'Voltage drop');
  // Short circuit
  const sct = [['Cable','Function','LS','In [A]','MCB','Multiplier','Ia [A]','Z_loop [mΩ]','Ik_min [A]','Ratio','Margin [A]','Status']];
  cables.forEach(c => { const s = A.sc[c.id]; sct.push([c.id, c.function, A.derating[c.id].ls, c.In, s.mcb_type, MCB_MULT[s.mcb_type], s.ia, s.z_loop, s.ik_min, s.ratio, s.margin, s.status]); });
  XLSX.utils.book_append_sheet(wb, aoa2sheet(sct), 'Short-circuit');
  // Selectivity
  const slt = [['Upstream','Downstream','In up','In down','Ratio','Status']];
  A.sel.forEach(s => slt.push([s.upstream, s.downstream, s.in_up, s.in_down, s.ratio, s.status]));
  XLSX.utils.book_append_sheet(wb, aoa2sheet(slt), 'Selectivity');
  // Optimization
  const opt = [['Cable','Severity','Issue','Detail','Recommendation']];
  A.opt.forEach(o => opt.push([o.cable, o.severity, o.issue, o.detail, o.rec]));
  if (A.opt.length === 0) opt.push(['—','✓ All cables pass','—','—','—']);
  XLSX.utils.book_append_sheet(wb, aoa2sheet(opt), 'Optimization');

  XLSX.writeFile(wb, filename || `cable_system_${project.site}.xlsx`);
}

// Compute categories across ALL drawings. Segments join a category when they meet
// at a junction; boards/loads are terminals. Junctions linked across drawings
// (off-page connectors) are treated as the SAME point, so their categories merge.
function computeProjectCategories(drawings) {
  const gnode = (did, nid) => `${did}::${nid}`;
  const gseg = (did, sid) => `${did}::${sid}`;
  // node union-find (merges cross-drawing links)
  const np = {};
  const nfind = (x) => { while (np[x] !== undefined && np[x] !== x) { np[x] = np[np[x]] ?? np[x]; x = np[x]; } return x; };
  const nunion = (a, b) => { if (np[a] === undefined) np[a] = a; if (np[b] === undefined) np[b] = b; const ra = nfind(a), rb = nfind(b); if (ra !== rb) np[ra] = rb; };
  drawings.forEach(d => {
    Object.entries(d.nodes || {}).forEach(([nid, n]) => {
      const g = gnode(d.id, nid);
      if (np[g] === undefined) np[g] = g;
      if (n && n.link && n.link.pid && n.link.nid) nunion(g, gnode(n.link.pid, n.link.nid));
    });
  });
  const kindOf = (d, nid) => (d.nodes && d.nodes[nid] && d.nodes[nid].kind) || 'junction';
  // segment union-find via canonical junction nodes
  const sp = {};
  const sfind = (x) => { while (sp[x] !== undefined && sp[x] !== x) { sp[x] = sp[sp[x]] ?? sp[x]; x = sp[x]; } return x; };
  const sunion = (a, b) => { if (sp[a] === undefined) sp[a] = a; if (sp[b] === undefined) sp[b] = b; const ra = sfind(a), rb = sfind(b); if (ra !== rb) sp[ra] = rb; };
  drawings.forEach(d => { Object.keys(d.segments || {}).forEach(sid => { const g = gseg(d.id, sid); if (sp[g] === undefined) sp[g] = g; }); });
  const segsByJunction = {};
  drawings.forEach(d => {
    Object.entries(d.segments || {}).forEach(([sid, s]) => {
      [s.from, s.to].forEach(nid => {
        if (nid && kindOf(d, nid) === 'junction') {
          const canon = nfind(gnode(d.id, nid));
          (segsByJunction[canon] = segsByJunction[canon] || []).push(gseg(d.id, sid));
        }
      });
    });
  });
  Object.values(segsByJunction).forEach(list => { for (let i = 1; i < list.length; i++) sunion(list[0], list[i]); });
  const groups = {};
  drawings.forEach(d => {
    Object.entries(d.segments || {}).forEach(([sid, s]) => {
      const root = sfind(gseg(d.id, sid));
      if (!groups[root]) groups[root] = { segs: [], drawings: new Set(), widths: new Set() };
      groups[root].segs.push({ drawingName: d.name, segId: sid, seg: s, width: d.trayTypes && d.trayTypes[s.tray_type] ? d.trayTypes[s.tray_type].width_mm : '' });
      groups[root].drawings.add(d.name);
      const w = d.trayTypes && d.trayTypes[s.tray_type] ? d.trayTypes[s.tray_type].width_mm : null;
      if (w) groups[root].widths.add(w);
    });
  });
  const cats = Object.values(groups).sort((a, b) => b.segs.length - a.segs.length);
  // map global segment id -> category number
  const catOf = {};
  cats.forEach((c, i) => c.segs.forEach(x => { catOf[`${x.drawingName}::${x.segId}`] = i + 1; }));
  return { cats, catOf };
}

// Whole-project Excel export, in Danish. `drawings` = [{ id, name, project, nodes,
// segments, cables, cableTypes, trayTypes }].
function exportProjectXlsx(drawings, project, filename) {
  const wb = XLSX.utils.book_new();
  const sheet = (rows, name) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));
  const num = (v) => (v === undefined || v === null || v === '') ? '' : v;

  // Projekt
  sheet([
    ['Parameter', 'Værdi', 'Note'],
    ['Anlæg (site)', project.site, 'IEC 81346'],
    ['Placering', project.location, ''],
    ['Beskrivelse', project.description, ''],
    ['Omgivelsestemperatur [°C]', project.ambient_c, 'Bestemmer k_temp'],
    ['k_temp', kAmbient(project.ambient_c), 'IEC 60364-5-52 tabel B.52.14'],
    ['Z_kilde sløjfe [mΩ]', project.z_source_mohm, 'Kilde + skinne-impedans'],
    ['ρ (Cu @ 70°C)', RHO_70, 'Bruges i ΔU og kortslutning'],
    ['LS-grænse', project.ls_threshold, 'Ib/Iz grænse LS2 vs LS3'],
    ['Antal tegninger', drawings.length, ''],
  ], 'Projekt');

  // Tegninger
  const dl = [['Tegning', 'Tavler', 'Laster', 'Knuder', 'Føringsvejssegmenter', 'Kabler']];
  drawings.forEach(d => {
    const nodes = Object.values(d.nodes || {});
    dl.push([
      d.name,
      nodes.filter(n => n.kind === 'board').length,
      nodes.filter(n => n.kind === 'load').length,
      nodes.filter(n => (n.kind || 'junction') === 'junction').length,
      Object.keys(d.segments || {}).length,
      (d.cables || []).length,
    ]);
  });
  sheet(dl, 'Tegninger');

  // Categories across the whole project
  const { cats, catOf } = computeProjectCategories(drawings);

  // Kabler (all drawings)
  const cl = [['Tegning', 'Kabel-ID', 'Fra', 'Til', 'Funktion', 'LS', 'Spænding [V]', 'Faser', 'Kabeltype', 'Tværsnit', 'Ib [A]', 'In [A]', 'Iz endelig [A]', 'Margin [A]', 'Status', 'Rute', 'ΔU total [%]', 'ΔU grænse [%]', 'ΔU status', 'Ik_min [A]', 'Kortslutn. status']];
  drawings.forEach(d => {
    let A; try { A = analyze({ cables: d.cables || [], segments: d.segments || {}, cableTypes: d.cableTypes, trayTypes: d.trayTypes, project: d.project || project }); } catch (e) { A = null; }
    (d.cables || []).forEach(c => {
      const ct = d.cableTypes[c.cable_type];
      const der = A && A.derating[c.id] ? A.derating[c.id] : {};
      const v = A && A.vd[c.id] ? A.vd[c.id] : {};
      const s = A && A.sc[c.id] ? A.sc[c.id] : {};
      cl.push([
        d.name, c.id, c.from, c.to, c.function, num(der.ls), c.V, c.phases, c.cable_type, num(ct?.cross_section),
        c.Ib, c.In, num(der.iz_final), num(der.margin), num(der.status), (c.route || []).join(' → '),
        num(v.du_total), num(v.limit), num(v.status), num(s.ik_min), num(s.status),
      ]);
    });
  });
  sheet(cl, 'Kabler');

  // Føringsveje (all drawings) with category + drawing
  const tr = [['Tegning', 'Segment', 'Kategori', 'Fra', 'Til', 'Længde [m]', 'Bakketype', 'Bredde [mm]', 'Højde [mm]', 'Antal kabler', 'Kabler', 'Fyldning [%]', 'Maks [%]', 'Status']];
  drawings.forEach(d => {
    let A; try { A = analyze({ cables: d.cables || [], segments: d.segments || {}, cableTypes: d.cableTypes, trayTypes: d.trayTypes, project: d.project || project }); } catch (e) { A = null; }
    Object.entries(d.segments || {}).forEach(([sid, s]) => {
      const tt = d.trayTypes[s.tray_type];
      const f = A && A.trayFill[sid] ? A.trayFill[sid] : {};
      const occ = A && A.occByLS[sid] ? A.occByLS[sid] : null;
      const cables_in = occ ? occ.LS1.concat(occ.LS2, occ.LS3) : [];
      tr.push([
        d.name, sid, catOf[`${d.name}::${sid}`] ?? '', s.from, s.to, s.length_m, s.tray_type,
        num(tt?.width_mm), num(tt?.height_mm), num(f.count), cables_in.join(', '), num(f.fill_pct), num(f.max), num(f.status),
      ]);
    });
  });
  sheet(tr, 'Føringsveje');

  // Kategorier — each category, which drawings it spans, and its segments
  const cat = [['Kategori', 'Tegninger', 'Bredder [mm]', 'Antal segmenter', 'Segmenter (tegning: segment)']];
  cats.forEach((c, i) => {
    const segList = c.segs.map(x => `${x.drawingName}: ${x.segId}`).join(', ');
    cat.push([i + 1, Array.from(c.drawings).join(', '), Array.from(c.widths).sort((a, b) => a - b).join(', '), c.segs.length, segList]);
  });
  if (cats.length === 0) cat.push(['—', 'Ingen føringsvejssegmenter', '', 0, '']);
  sheet(cat, 'Kategorier');

  // Kabelbakke-katalog (union across drawings)
  const allTray = {}; drawings.forEach(d => Object.entries(d.trayTypes || {}).forEach(([n, t]) => { allTray[n] = t; }));
  const tt_sh = [['Bakketype', 'Bredde [mm]', 'Højde [mm]', 'Bruttoareal [mm²]', 'Maks fyldning [%]']];
  Object.entries(allTray).forEach(([n, t]) => tt_sh.push([n, t.width_mm, t.height_mm, t.gross_area_mm2, t.max_fill_percent]));
  sheet(tt_sh, 'Kabelbakke-katalog');

  // Kabeltyper (union across drawings)
  const allCab = {}; drawings.forEach(d => Object.entries(d.cableTypes || {}).forEach(([n, t]) => { allCab[n] = t; }));
  const ct_sh = [['Kabeltype', 'Ledere', 'Tværsnit', 'Parallel', 'S [mm²]', 'Yderdiameter [mm]', 'Areal [mm²]', 'Iz grund [A]']];
  Object.entries(allCab).forEach(([n, t]) => ct_sh.push([n, t.conductors, t.cross_section, t.is_parallel, t.S_mm2, t.od_mm, t.area_mm2, t.iz_a]));
  sheet(ct_sh, 'Kabeltyper');

  XLSX.writeFile(wb, filename || `projekt_${project.site || 'kabelsystem'}.xlsx`);
}

// =========================
// SIZING HELPER — find smallest cable that meets all constraints
// =========================
function findCableCandidates({ Ib, V, phases, cos_phi, fn, length_m, n_bundle, ls, project, cableTypes }) {
  const kT = kAmbient(project.ambient_c);
  const In = STANDARD_BREAKERS.find(b => b >= Ib);
  if (!In) return { error: 'Ib too high for available breakers' };
  const kG = (ls === 'LS3') ? 1.0 : kGrouping(n_bundle);
  const kTot = kG * kT;
  const limit = project.vd_limits[fn] ?? project.vd_limits._default;
  const K = phases === 3 ? SQRT3 : 2.0;
  const sorted = Object.entries(cableTypes).sort(([,a],[,b]) => a.iz_a - b.iz_a);
  const out = [];
  for (const [name, t] of sorted) {
    const izFinal = t.iz_a * kTot;
    if (izFinal < In) continue;
    const duV = K * RHO_70 * length_m * Ib * cos_phi / (t.S_mm2 * t.is_parallel);
    const duPct = duV / V * 100;
    if (duPct > limit) continue;
    out.push({ name, type:t, In, iz_final:round(izFinal,1), du_pct:round(duPct,2), margin:round(izFinal-In,1), kG, kT, kTot:round(kTot,3), limit });
    if (out.length >= 3) break;
  }
  return { candidates: out, In, kG, kT, kTot:round(kTot,3), limit };
}

// =========================
// DRAWING HELPERS
// =========================
function inferKind(id) {
  if (/^(Q|HT|UT|UPS|PDU|T\d)/.test(id)) return 'board';
  if (/^(X|Rack|CRAH|Chiller|Light|BMS|SEC|FIRE|CCTV|M\d)/.test(id)) return 'load';
  return 'junction';
}
// Lighten a hex colour toward white for use as a fill behind a coloured stroke
function lightenColor(hex) {
  if (!hex || hex[0] !== '#') return '#fff';
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c=>c+c).join('') : h;
  const r = parseInt(full.slice(0,2),16), g = parseInt(full.slice(2,4),16), b = parseInt(full.slice(4,6),16);
  const mix = (c) => Math.round(c + (255 - c) * 0.82);
  return `#${[mix(r),mix(g),mix(b)].map(v=>v.toString(16).padStart(2,'0')).join('')}`;
}
function nextNodeIdByKind(nodes, kind, reserved) {
  const prefix = kind === 'board' ? 'Q' : kind === 'load' ? 'X' : 'N';
  const used = new Set(Object.keys(nodes));
  let n = 1;
  while (used.has(`${prefix}${n}`) || (reserved && reserved.has(`${prefix}${n}`))) n++;
  return `${prefix}${n}`;
}
function nextSegId(segments, reserved) {
  const used = new Set(Object.keys(segments));
  let n = 1;
  while (used.has(`WC${String(n).padStart(3,'0')}`) || (reserved && reserved.has(`WC${String(n).padStart(3,'0')}`))) n++;
  return `WC${String(n).padStart(3,'0')}`;
}
function nextNodeId(nodes, reserved) {
  const used = new Set(Object.keys(nodes));
  let n = 1;
  while (used.has(`N${n}`) || (reserved && reserved.has(`N${n}`))) n++;
  return `N${n}`;
}
function nextCableId(cables, reserved) {
  const used = new Set(cables.map(c => c.id));
  let n = 1;
  while (used.has(`W${String(n).padStart(3,'0')}`) || (reserved && reserved.has(`W${String(n).padStart(3,'0')}`))) n++;
  return `W${String(n).padStart(3,'0')}`;
}
// Shortest physical path between two nodes through the tray segments,
// weighted by segment length (Dijkstra). Returns array of segment IDs, or null.
function findRoute(segments, fromNode, toNode) {
  if (fromNode === toNode) return [];
  // adjacency: node -> [{ node, segId, len }]
  const adj = {};
  Object.entries(segments).forEach(([segId, s]) => {
    const len = Number(s.length_m) || 1;
    (adj[s.from] = adj[s.from] || []).push({ node: s.to, segId, len });
    (adj[s.to] = adj[s.to] || []).push({ node: s.from, segId, len });
  });
  // Dijkstra with a simple array-based priority selection (graphs here are small)
  const dist = { [fromNode]: 0 };
  const prev = {};        // node -> { segId, fromNode }
  const visited = new Set();
  const pending = new Set([fromNode]);
  while (pending.size) {
    // pick the unvisited node with smallest distance
    let cur = null, best = Infinity;
    for (const n of pending) {
      if (dist[n] < best) { best = dist[n]; cur = n; }
    }
    if (cur === null) break;
    pending.delete(cur);
    visited.add(cur);
    if (cur === toNode) break;
    for (const edge of (adj[cur] || [])) {
      if (visited.has(edge.node)) continue;
      const nd = dist[cur] + edge.len;
      if (nd < (dist[edge.node] ?? Infinity)) {
        dist[edge.node] = nd;
        prev[edge.node] = { segId: edge.segId, fromNode: cur };
        pending.add(edge.node);
      }
    }
  }
  if (!(toNode in dist)) return null;
  // reconstruct segment path
  const route = [];
  let n = toNode;
  while (n !== fromNode) {
    const step = prev[n];
    if (!step) return null;
    route.unshift(step.segId);
    n = step.fromNode;
  }
  return route;
}
function autoLayoutFromSegments(segments) {
  const arr = Object.entries(segments).map(([id, s]) => ({ id, ...s }));
  const all = new Set();
  arr.forEach(s => { all.add(s.from); all.add(s.to); });
  const sources = new Set(all);
  arr.forEach(s => sources.delete(s.to));
  if (sources.size === 0 && all.size > 0) sources.add(Array.from(all)[0]);
  const level = new Map();
  sources.forEach(s => level.set(s, 0));
  for (let i = 0; i < 100; i++) {
    let ch = false;
    arr.forEach(s => {
      if (level.has(s.from)) {
        const nl = level.get(s.from) + 1;
        if (!level.has(s.to) || level.get(s.to) < nl) { level.set(s.to, nl); ch = true; }
      }
    });
    if (!ch) break;
  }
  all.forEach(n => { if (!level.has(n)) level.set(n, 0); });
  const byLevel = new Map();
  for (const [n, l] of level) {
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l).push(n);
  }
  byLevel.forEach(a => a.sort());
  const pos = {};
  const lvls = Array.from(byLevel.keys()).sort((a,b)=>a-b);
  lvls.forEach(l => {
    byLevel.get(l).forEach((n, i) => {
      pos[n] = { x: l * 200 + 100, y: i * 90 + 80 };
    });
  });
  return pos;
}

// =========================
// SLD LAYOUT
// =========================
function nodeType(id) {
  if (/^T\d+/.test(id)) return 'transformer';
  if (id.startsWith('HT')) return 'main';
  if (id.startsWith('UPS')) return 'ups';
  if (id.startsWith('UT-')) return 'sub';
  if (id.startsWith('PDU')) return 'pdu';
  if (id.startsWith('Rack')) return 'rack';
  if (id.startsWith('CRAH') || id.startsWith('Chiller')) return 'mech';
  if (/^X\d+/.test(id)) return 'load';
  if (/^Q\d+/.test(id)) return 'sub';
  if (id.startsWith('N')) return 'node';
  return 'load';
}
const TYPE_COLORS = {
  transformer:'#4527A0', main:'#0B3D91', ups:'#a04500', sub:'#1565C0',
  pdu:'#FF8F00', rack:'#37474F', mech:'#00695C', load:'#37474F', node:'#9E9E9E'
};
function buildSLD(cables, maxDepth) {
  const allNodes = new Set();
  cables.forEach(c => { allNodes.add(c.from); allNodes.add(c.to); });
  const sources = new Set(allNodes);
  cables.forEach(c => sources.delete(c.to));
  if (sources.size === 0 && allNodes.size > 0) sources.add(Array.from(allNodes)[0]);
  const level = new Map();
  sources.forEach(s => level.set(s, 0));
  for (let iter = 0; iter < 100; iter++) {
    let changed = false;
    cables.forEach(c => {
      if (level.has(c.from)) {
        const nl = level.get(c.from) + 1;
        if (!level.has(c.to) || level.get(c.to) < nl) { level.set(c.to, nl); changed = true; }
      }
    });
    if (!changed) break;
  }
  allNodes.forEach(n => { if (!level.has(n)) level.set(n, 0); });
  const visible = new Set();
  allNodes.forEach(n => { if (level.get(n) <= maxDepth) visible.add(n); });
  const byLevel = new Map();
  visible.forEach(n => {
    const l = level.get(n);
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l).push(n);
  });
  byLevel.forEach(arr => arr.sort());
  const NW = 140, NH = 36, XG = 50, YG = 8;
  const positions = new Map();
  let maxX = 0, maxY = 0;
  const sortedLevels = Array.from(byLevel.keys()).sort((a,b) => a-b);
  sortedLevels.forEach(l => {
    const arr = byLevel.get(l);
    const x = l * (NW + XG) + 20;
    arr.forEach((n, i) => {
      const y = i * (NH + YG) + 40;
      positions.set(n, { x, y, w:NW, h:NH, level:l, type:nodeType(n) });
      maxX = Math.max(maxX, x + NW);
      maxY = Math.max(maxY, y + NH);
    });
  });
  // count hidden children
  const hidden = new Map();
  cables.forEach(c => {
    if (visible.has(c.from) && !visible.has(c.to)) {
      hidden.set(c.from, (hidden.get(c.from) || 0) + 1);
    }
  });
  return { positions, visible, hidden, width: maxX + 20, height: Math.max(maxY + 20, 400) };
}

// =========================
// SMALL UI HELPERS
// =========================
const Pill = ({ children, color='#0B3D91', bg='#E7EBF0' }) => (
  <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold" style={{ color, background:bg }}>{children}</span>
);
const LSBadge = ({ ls }) => <Pill color={LS_BORDER[ls]} bg={LS_COLOR[ls]}>{ls}</Pill>;
const StatusBadge = ({ status }) => {
  if (status === 'OK') return <Pill color="#006100" bg="#C6EFCE">OK</Pill>;
  if (status === 'FAIL' || status === 'OVERFILL') return <Pill color="#9C0006" bg="#FFC7CE">{status}</Pill>;
  return <Pill>{status}</Pill>;
};

// =========================
// I18N — language list + translations for the shell/navigation.
// The framework is ready to extend; deeper technical strings are localised
// progressively. Technical terms (e.g. "cable tray") should ideally be
// reviewed by a native engineer per regional standard.
// =========================
const LANGS = [
  { code:'da',      name:'Dansk' },
  { code:'en',      name:'English' },
  { code:'de',      name:'Deutsch' },
  { code:'fr',      name:'Français' },
  { code:'es',      name:'Español' },
  { code:'it',      name:'Italiano' },
  { code:'pt',      name:'Português' },
  { code:'nl',      name:'Nederlands' },
  { code:'sv',      name:'Svenska' },
  { code:'no',      name:'Norsk' },
  { code:'pl',      name:'Polski' },
  { code:'tr',      name:'Türkçe' },
  { code:'ru',      name:'Русский' },
  { code:'zh',      name:'中文（简体）' },
  { code:'zh-Hant', name:'中文（繁體）' },
  { code:'ja',      name:'日本語' },
  { code:'ko',      name:'한국어' },
  { code:'vi',      name:'Tiếng Việt' },
  { code:'id',      name:'Bahasa Indonesia' },
  { code:'th',      name:'ไทย' },
  { code:'hi',      name:'हिन्दी' },
  { code:'bn',      name:'বাংলা' },
  { code:'ar',      name:'العربية', rtl:true },
  { code:'fa',      name:'فارسی (Persisk/Farsi)', rtl:true },
  { code:'he',      name:'עברית', rtl:true },
  { code:'ur',      name:'اردو', rtl:true },
];

const I18N = {
  da:      { trays:'Føringsveje', project:'Projekt', cables:'Kabler', diagram:'Diagram', catalog:'Katalog', analysis:'Analyse', language:'Sprog', exportExcel:'Eksportér Excel', unitCables:'kabler', unitTrays:'føringsveje' },
  en:      { trays:'Cable trays', project:'Project', cables:'Cables', diagram:'Diagram', catalog:'Catalog', analysis:'Analysis', language:'Language', exportExcel:'Export Excel', unitCables:'cables', unitTrays:'cable trays' },
  de:      { trays:'Kabeltrassen', project:'Projekt', cables:'Kabel', diagram:'Diagramm', catalog:'Katalog', analysis:'Analyse', language:'Sprache', exportExcel:'Excel exportieren', unitCables:'Kabel', unitTrays:'Kabeltrassen' },
  fr:      { trays:'Chemins de câbles', project:'Projet', cables:'Câbles', diagram:'Schéma', catalog:'Catalogue', analysis:'Analyse', language:'Langue', exportExcel:'Exporter Excel', unitCables:'câbles', unitTrays:'chemins de câbles' },
  es:      { trays:'Bandejas de cables', project:'Proyecto', cables:'Cables', diagram:'Diagrama', catalog:'Catálogo', analysis:'Análisis', language:'Idioma', exportExcel:'Exportar Excel', unitCables:'cables', unitTrays:'bandejas de cables' },
  it:      { trays:'Passerelle portacavi', project:'Progetto', cables:'Cavi', diagram:'Schema', catalog:'Catalogo', analysis:'Analisi', language:'Lingua', exportExcel:'Esporta Excel', unitCables:'cavi', unitTrays:'passerelle' },
  pt:      { trays:'Esteiras de cabos', project:'Projeto', cables:'Cabos', diagram:'Diagrama', catalog:'Catálogo', analysis:'Análise', language:'Idioma', exportExcel:'Exportar Excel', unitCables:'cabos', unitTrays:'esteiras de cabos' },
  nl:      { trays:'Kabelgoten', project:'Project', cables:'Kabels', diagram:'Schema', catalog:'Catalogus', analysis:'Analyse', language:'Taal', exportExcel:'Excel exporteren', unitCables:'kabels', unitTrays:'kabelgoten' },
  sv:      { trays:'Kabelstegar', project:'Projekt', cables:'Kablar', diagram:'Diagram', catalog:'Katalog', analysis:'Analys', language:'Språk', exportExcel:'Exportera Excel', unitCables:'kablar', unitTrays:'kabelstegar' },
  no:      { trays:'Kabelbroer', project:'Prosjekt', cables:'Kabler', diagram:'Diagram', catalog:'Katalog', analysis:'Analyse', language:'Språk', exportExcel:'Eksporter Excel', unitCables:'kabler', unitTrays:'kabelbroer' },
  pl:      { trays:'Korytka kablowe', project:'Projekt', cables:'Kable', diagram:'Schemat', catalog:'Katalog', analysis:'Analiza', language:'Język', exportExcel:'Eksportuj Excel', unitCables:'kable', unitTrays:'korytka kablowe' },
  tr:      { trays:'Kablo kanalları', project:'Proje', cables:'Kablolar', diagram:'Şema', catalog:'Katalog', analysis:'Analiz', language:'Dil', exportExcel:"Excel'e aktar", unitCables:'kablo', unitTrays:'kablo kanalları' },
  ru:      { trays:'Кабельные лотки', project:'Проект', cables:'Кабели', diagram:'Схема', catalog:'Каталог', analysis:'Анализ', language:'Язык', exportExcel:'Экспорт в Excel', unitCables:'кабели', unitTrays:'кабельные лотки' },
  zh:      { trays:'电缆桥架', project:'项目', cables:'电缆', diagram:'图表', catalog:'目录', analysis:'分析', language:'语言', exportExcel:'导出 Excel', unitCables:'电缆', unitTrays:'电缆桥架' },
  'zh-Hant':{ trays:'電纜橋架', project:'專案', cables:'電纜', diagram:'圖表', catalog:'目錄', analysis:'分析', language:'語言', exportExcel:'匯出 Excel', unitCables:'電纜', unitTrays:'電纜橋架' },
  ja:      { trays:'ケーブルラック', project:'プロジェクト', cables:'ケーブル', diagram:'図表', catalog:'カタログ', analysis:'分析', language:'言語', exportExcel:'Excelエクスポート', unitCables:'ケーブル', unitTrays:'ケーブルラック' },
  ko:      { trays:'케이블 트레이', project:'프로젝트', cables:'케이블', diagram:'다이어그램', catalog:'카탈로그', analysis:'분석', language:'언어', exportExcel:'Excel 내보내기', unitCables:'케이블', unitTrays:'케이블 트레이' },
  vi:      { trays:'Khay cáp', project:'Dự án', cables:'Cáp', diagram:'Sơ đồ', catalog:'Danh mục', analysis:'Phân tích', language:'Ngôn ngữ', exportExcel:'Xuất Excel', unitCables:'cáp', unitTrays:'khay cáp' },
  id:      { trays:'Rak kabel', project:'Proyek', cables:'Kabel', diagram:'Diagram', catalog:'Katalog', analysis:'Analisis', language:'Bahasa', exportExcel:'Ekspor Excel', unitCables:'kabel', unitTrays:'rak kabel' },
  th:      { trays:'รางเคเบิล', project:'โครงการ', cables:'สายเคเบิล', diagram:'แผนภาพ', catalog:'แค็ตตาล็อก', analysis:'การวิเคราะห์', language:'ภาษา', exportExcel:'ส่งออก Excel', unitCables:'สายเคเบิล', unitTrays:'รางเคเบิล' },
  hi:      { trays:'केबल ट्रे', project:'परियोजना', cables:'केबल', diagram:'आरेख', catalog:'सूची', analysis:'विश्लेषण', language:'भाषा', exportExcel:'Excel निर्यात', unitCables:'केबल', unitTrays:'केबल ट्रे' },
  bn:      { trays:'কেবল ট্রে', project:'প্রকল্প', cables:'কেবল', diagram:'চিত্র', catalog:'ক্যাটালগ', analysis:'বিশ্লেষণ', language:'ভাষা', exportExcel:'Excel রপ্তানি', unitCables:'কেবল', unitTrays:'কেবল ট্রে' },
  ar:      { trays:'مسارات الكابلات', project:'مشروع', cables:'كابلات', diagram:'مخطط', catalog:'كتالوج', analysis:'تحليل', language:'اللغة', exportExcel:'تصدير Excel', unitCables:'كابلات', unitTrays:'مسارات الكابلات' },
  fa:      { trays:'سینی کابل', project:'پروژه', cables:'کابل‌ها', diagram:'نمودار', catalog:'کاتالوگ', analysis:'تحلیل', language:'زبان', exportExcel:'خروجی Excel', unitCables:'کابل‌ها', unitTrays:'سینی کابل' },
  he:      { trays:'תעלות כבלים', project:'פרויקט', cables:'כבלים', diagram:'תרשים', catalog:'קטלוג', analysis:'ניתוח', language:'שפה', exportExcel:'ייצוא Excel', unitCables:'כבלים', unitTrays:'תעלות כבלים' },
  ur:      { trays:'کیبل ٹرے', project:'پروجیکٹ', cables:'کیبلز', diagram:'خاکہ', catalog:'کیٹلاگ', analysis:'تجزیہ', language:'زبان', exportExcel:'Excel برآمد', unitCables:'کیبلز', unitTrays:'کیبل ٹرے' },
};

// =========================
// MAIN APP
// =========================
export default function App() {
  const [project, setProject] = useState(DEFAULT_PROJECT);
  const [cableTypes, setCableTypes] = useState(DEFAULT_CABLE_TYPES);
  const [trayTypes, setTrayTypes] = useState(DEFAULT_TRAY_TYPES);
  const [transformerTypes, setTransformerTypes] = useState(DEFAULT_TRANSFORMER_TYPES);
  const [segments, setSegments] = useState({});
  const [nodes, setNodes] = useState({});
  const [cables, setCables] = useState([]);
  const [bgImage, setBgImage] = useState(null);   // { dataUrl, x, y, scale, opacity, name }
  const [tab, setTab] = useState('project');
  const [lang, setLang] = useState('da');
  const t = (k) => (I18N[lang] && I18N[lang][k]) || I18N.en[k] || I18N.da[k] || k;
  const isRTL = !!(LANGS.find(l => l.code === lang)?.rtl);
  const [editing, setEditing] = useState(null);
  const [sizingOpen, setSizingOpen] = useState(false);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Project library: list of { id, name } + the currently active project id
  const [projectList, setProjectList] = useState([]);
  const [openTabs, setOpenTabs] = useState([]);   // project ids currently open as drawing tabs
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [autoSave, setAutoSave] = useState(() => {
    try { return globalThis?.localStorage?.getItem?.('cable_app_autosave') !== 'off'; } catch (e) { return true; }
  });
  const toggleAutoSave = () => setAutoSave(v => {
    const nv = !v;
    try { globalThis?.localStorage?.setItem?.('cable_app_autosave', nv ? 'on' : 'off'); } catch (e) {}
    return nv;
  });
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const fileInputRef = useRef(null);
  const csvInputRef = useRef(null);
  const bgWarnedRef = useRef(false);   // only warn once per session about un-persistable backgrounds

  // Ask the browser for persistent storage so IndexedDB gets a larger, non-evictable
  // quota — lets many drawings with high-res backgrounds be stored.
  useEffect(() => {
    try {
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persisted().then(p => { if (!p) navigator.storage.persist().catch(()=>{}); }).catch(()=>{});
      }
    } catch (e) {}
  }, []);

  const STORAGE_INDEX = 'cable_app_index';        // { projects: [{id, name}], activeId }
  const projKey = (id) => `cable_app_project_${id}`;
  const bgKey = (id) => `cable_app_bg_${id}`;     // background image stored separately from the bundle
  const genId = () => `p_${Date.now()}_${Math.floor(Math.random()*1e4)}`;

  // Save a drawing. The (potentially large) background is stored under its own key,
  // so the drawing data (nodes/segments/cables) ALWAYS persists even if the
  // background is too big for the browser's storage. Returns { okData, okBg }.
  const saveBundle = async (id, bundle) => {
    const bg = bundle.bgImage || null;
    const meta = bg ? { ...bg, dataUrl: undefined } : null;   // bundle keeps position/scale, not the image
    const nm = (projectList.find(p => p.id === id) || {}).name;   // store name so the drawing can be recovered if the index is lost
    let okData = false;
    try { okData = await appStorage.set(projKey(id), JSON.stringify({ ...bundle, bgImage: meta, _name: nm })); } catch (e) { okData = false; }
    let okBg = true;
    if (bg && bg.dataUrl) {
      try { okBg = await appStorage.setImage(bgKey(id), bg.dataUrl); } catch (e) { okBg = false; }
    } else if (!bg) {
      // Only remove the stored image when the drawing genuinely has NO background.
      // If bg is metadata-only (image just not in memory right now), leave it untouched
      // — deleting here was destroying backgrounds on tab switch.
      try { await appStorage.delete(bgKey(id)); } catch (e) {}
    }
    return { okData, okBg };
  };
  // Load a drawing and re-attach its separately-stored background.
  const loadBundle = async (id) => {
    let raw = null;
    try { raw = await appStorage.get(projKey(id)); } catch (e) { raw = null; }
    if (!raw) return null;
    let b;
    try { b = JSON.parse(raw); } catch (e) { return null; }
    if (b && b.bgImage) {
      // Newer drawings store the image separately; older ones embed dataUrl in the bundle.
      if (!b.bgImage.dataUrl) {
        try { const bg = await appStorage.getImage(bgKey(id)); if (bg) b.bgImage = { ...b.bgImage, dataUrl: bg }; } catch (e) {}
      }
    }
    return b;
  };

  // Apply a loaded project bundle into state
  const applyBundle = (s) => {
    setProject(s.project ?? DEFAULT_PROJECT);
    setCableTypes(s.cableTypes ?? DEFAULT_CABLE_TYPES);
    setTrayTypes({ ...DEFAULT_TRAY_TYPES, ...(s.trayTypes || {}) });
    setTransformerTypes(s.transformerTypes ?? DEFAULT_TRANSFORMER_TYPES);
    setSegments(s.segments ?? {});
    setNodes(s.nodes ?? {});
    setCables(s.cables ?? []);
    setBgImage(s.bgImage ?? null);
  };

  // Load — read the index, migrate old single-project state if needed
  useEffect(() => {
    (async () => {
      try {
        try { if (appStorage.migrate) await appStorage.migrate(); } catch (e) {}
        const idxRaw = await appStorage.get(STORAGE_INDEX);
        let idx = null;
        try { idx = idxRaw ? JSON.parse(idxRaw) : null; } catch (e) { idx = null; }

        // Build the project list from the index, then RECOVER any drawing whose bundle
        // exists in storage but is missing from the index — so a lost/empty index can
        // never make saved drawings disappear.
        let list = (idx && Array.isArray(idx.projects)) ? idx.projects.slice() : [];
        try {
          const allKeys = await appStorage.keys(projKey(''));
          const known = new Set(list.map(p => p.id));
          const orphans = [];
          for (const k of allKeys) {
            const pid = String(k).slice(projKey('').length);
            if (!pid || known.has(pid)) continue;
            known.add(pid);
            let nm = null;
            try { const raw = await appStorage.get(projKey(pid)); if (raw) { const b = JSON.parse(raw); nm = b && b._name; } } catch (e) {}
            orphans.push({ id: pid, name: nm || `Tegning ${list.length + orphans.length + 1}` });
          }
          if (orphans.length) list = [...list, ...orphans];
        } catch (e) {}

        if (list.length > 0) {
          setProjectList(list);
          const validIds = new Set(list.map(p => p.id));
          // Free space: drop backgrounds for drawings that no longer exist, plus probe/legacy keys.
          try {
            const bgKeys = await appStorage.keys(bgKey(''));
            for (const k of bgKeys) {
              const pid = String(k).slice(bgKey('').length);
              if (pid && !validIds.has(pid)) { try { await appStorage.delete(bgKey(pid)); } catch (e) {} }
            }
            try { await appStorage.delete('__probe__'); } catch (e) {}
          } catch (e) {}
          const activeId = (idx && idx.activeId && validIds.has(idx.activeId)) ? idx.activeId : list[0].id;
          setActiveProjectId(activeId);
          let tabs = ((idx && idx.openTabs) ?? []).filter(t => validIds.has(t));
          if (activeId && !tabs.includes(activeId)) tabs = [activeId, ...tabs];
          if (tabs.length === 0 && activeId) tabs = [activeId];
          setOpenTabs(tabs);
          if (activeId) {
            const b = await loadBundle(activeId);
            if (b) applyBundle(b);
          }
          // Re-persist a healthy index (recovers names/order after any earlier loss).
          try { await appStorage.set(STORAGE_INDEX, JSON.stringify({ projects: list, activeId, openTabs: tabs })); } catch (e) {}
        } else {
          // No usable index → migrate legacy single-project state or create a fresh drawing.
          const legacy = await appStorage.get('cable_app_state');
          const id = genId();
          let name = 'Tegning 1';
          if (legacy) {
            try {
              const s = JSON.parse(legacy);
              applyBundle(s);
              name = (s.project?.site ? `=${s.project.site}+${s.project.location||''}` : 'Tegning 1');
              await saveBundle(id, s);
            } catch (e) { await saveBundle(id, emptyBundle()); }
          } else {
            await saveBundle(id, emptyBundle());
          }
          const list = [{ id, name }];
          setProjectList(list);
          setActiveProjectId(id);
          setOpenTabs([id]);
          await appStorage.set(STORAGE_INDEX, JSON.stringify({ projects: list, activeId: id, openTabs: [id] }));
        }
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  // When the drawing editor is open, make sure there is an active project and it is an open tab.
  useEffect(() => {
    if (!drawingOpen) return;
    if (!activeProjectId && projectList.length > 0) {
      setActiveProjectId(projectList[0].id);
      return;
    }
    if (activeProjectId) {
      setOpenTabs(t => t.includes(activeProjectId) ? t : [...t, activeProjectId]);
    }
  }, [drawingOpen, activeProjectId, projectList]);

  // Persist active project bundle (only when auto-save is on)
  useEffect(() => {
    if (!loaded || !activeProjectId || !autoSave) return;
    const t = setTimeout(() => {
      saveBundle(activeProjectId, { project, cableTypes, trayTypes, transformerTypes, segments, nodes, cables, bgImage }).catch(()=>{});
    }, 500);
    return () => clearTimeout(t);
  }, [project, cableTypes, trayTypes, transformerTypes, segments, nodes, cables, bgImage, loaded, activeProjectId, autoSave]);

  // Persist the index whenever the list, active id or open tabs change
  useEffect(() => {
    if (!loaded) return;
    appStorage.set(STORAGE_INDEX, JSON.stringify({ projects: projectList, activeId: activeProjectId, openTabs })).catch(()=>{});
  }, [projectList, activeProjectId, openTabs, loaded]);

  // Auto-Z_source from transformer
  useEffect(() => {
    if (!loaded || !project.transformer) return;
    const t = transformerTypes[project.transformer];
    if (!t) return;
    const z = calcZsource(t, project.n_transformers_parallel || 1);
    if (z !== null && Math.abs(z - project.z_source_mohm) > 0.01) {
      setProject(p => ({ ...p, z_source_mohm: z }));
    }
  }, [project.transformer, project.n_transformers_parallel, transformerTypes, loaded]);

  const A = useMemo(() => analyze({ cables, segments, cableTypes, trayTypes, project }), [cables, segments, cableTypes, trayTypes, project]);

  const loadTemplate = (which) => {
    const t = which === 'office' ? smallOfficeTemplate() : datacenterTemplate();
    setProject(t.project); setSegments(t.segments); setCables(t.cables);
    setNodes(autoLayoutFromSegments(t.segments));
    setCableTypes(DEFAULT_CABLE_TYPES); setTrayTypes(DEFAULT_TRAY_TYPES);
    setTransformerTypes(DEFAULT_TRANSFORMER_TYPES);
    setTab('cables');
  };
  const clearAll = () => {
    if (!safeConfirm('Slet alt indhold i dette projekt og start forfra?')) return;
    setProject(DEFAULT_PROJECT); setSegments({}); setCables([]); setNodes({});
    setCableTypes(DEFAULT_CABLE_TYPES); setTrayTypes(DEFAULT_TRAY_TYPES);
    setTransformerTypes(DEFAULT_TRANSFORMER_TYPES);
  };

  // ---- Project library management ----
  // Save current state into a bundle object
  const currentBundle = () => ({ project, cableTypes, trayTypes, transformerTypes, segments, nodes, cables, bgImage });

  // Flush current state to storage immediately (used before switching away)
  const flushCurrent = async () => {
    if (!activeProjectId) return;
    await saveBundle(activeProjectId, currentBundle());
  };

  const createProject = async (name, template) => {
    await flushCurrent();
    const id = genId();
    let bundle = emptyBundle();
    if (template === 'office') {
      const t = smallOfficeTemplate();
      bundle = { ...emptyBundle(), project: t.project, segments: t.segments, cables: t.cables, nodes: autoLayoutFromSegments(t.segments) };
    } else if (template === 'dc') {
      const t = datacenterTemplate();
      bundle = { ...emptyBundle(), project: t.project, segments: t.segments, cables: t.cables, nodes: autoLayoutFromSegments(t.segments) };
    }
    await saveBundle(id, bundle);
    const list = [...projectList, { id, name: name || `Tegning ${projectList.length + 1}` }];
    setProjectList(list);
    setOpenTabs(t => t.includes(id) ? t : [...t, id]);
    setActiveProjectId(id);
    applyBundle(bundle);
    setNewProjectOpen(false);
    setTab('project');
  };

  const switchProject = async (id) => {
    if (id === activeProjectId) return;
    await flushCurrent();
    try {
      const b = await loadBundle(id);
      applyBundle(b || emptyBundle());
    } catch (e) { applyBundle(emptyBundle()); }
    setOpenTabs(t => t.includes(id) ? t : [...t, id]);
    setActiveProjectId(id);
    setTab('project');
  };

  // Save a draft from the drawing editor (nodes/segs/cables/bg) into the active
  // project's storage, then switch to another project. Used by the drawing tabs so
  // unsaved edits aren't lost when switching between open drawings.
  const commitDraftAndSwitch = async (draft, id) => {
    if (activeProjectId) {
      const bundle = { ...currentBundle(), nodes: draft.nodes, segments: draft.segments, cables: draft.cables, bgImage: draft.bgImage };
      const { okData, okBg } = await saveBundle(activeProjectId, bundle);
      // Drawing data is saved separately from the background, so it is never lost.
      // Only warn (once) if the background image itself couldn't be stored.
      if (okData && okBg === false && !bgWarnedRef.current) {
        bgWarnedRef.current = true;
        try { globalThis.alert('Tegningsgrundlaget (baggrunds-PDF) er for stort til at gemmes permanent og bevares kun i denne session. Selve tegningen — føringsveje, kabler og knuder — er gemt. Prøv evt. en mindre/komprimeret PDF.'); } catch (e) {}
      }
      applyBundle(bundle);
    }
    if (id && id !== activeProjectId) {
      try {
        const b = await loadBundle(id);
        applyBundle(b || emptyBundle());
      } catch (e) { applyBundle(emptyBundle()); }
      setOpenTabs(t => t.includes(id) ? t : [...t, id]);
      setActiveProjectId(id);
    }
  };

  // Create a new drawing and switch to it, preserving the current draft first.
  const commitDraftAndCreate = async (draft, name) => {
    if (activeProjectId) {
      const bundle = { ...currentBundle(), nodes: draft.nodes, segments: draft.segments, cables: draft.cables, bgImage: draft.bgImage };
      await saveBundle(activeProjectId, bundle);
    }
    const id = genId();
    const fresh = emptyBundle();
    await saveBundle(id, fresh);
    setProjectList([...projectList, { id, name: name || `Tegning ${projectList.length + 1}` }]);
    setOpenTabs(t => [...t, id]);
    setActiveProjectId(id);
    applyBundle(fresh);
  };

  // Save every drawing: commit the active draft into its project, plus re-persist
  // the index. The other drawings are already saved (they're flushed on tab switch),
  // so this guarantees the whole set is on disk after pressing Gem.
  const saveAllDrawings = async (draft) => {
    if (activeProjectId) {
      const bundle = { ...currentBundle(), nodes: draft.nodes, segments: draft.segments, cables: draft.cables, bgImage: draft.bgImage };
      await saveBundle(activeProjectId, bundle);
      applyBundle(bundle);
    }
    try { await appStorage.set(STORAGE_INDEX, JSON.stringify({ projects: projectList, activeId: activeProjectId, openTabs })); } catch (e) {}
  };

  const deleteProject = async (id, skipConfirm) => {
    const proj = projectList.find(p => p.id === id);
    if (!skipConfirm && !safeConfirm(`Slet projektet "${proj?.name ?? id}" permanent?`)) return;
    try { await appStorage.delete(projKey(id)); } catch (e) {}
    try { await appStorage.delete(bgKey(id)); } catch (e) {}
    const remaining = projectList.filter(p => p.id !== id);
    setOpenTabs(t => t.filter(x => x !== id));
    if (remaining.length === 0) {
      // Always keep at least one project — create a fresh empty one
      const newId = genId();
      const bundle = emptyBundle();
      try { await appStorage.set(projKey(newId), JSON.stringify(bundle)); } catch (e) {}
      setProjectList([{ id: newId, name: 'Tegning 1' }]);
      setOpenTabs([newId]);
      setActiveProjectId(newId);
      applyBundle(bundle);
      return;
    }
    setProjectList(remaining);
    if (id === activeProjectId) {
      // switch to the first remaining project
      const next = remaining[0];
      try {
        const b = await loadBundle(next.id);
        applyBundle(b || emptyBundle());
      } catch (e) { applyBundle(emptyBundle()); }
      setOpenTabs(t => t.includes(next.id) ? t : [...t, next.id]);
      setActiveProjectId(next.id);
    }
  };

  // Close a drawing tab WITHOUT deleting the project. The drawing stays in
  // storage and can be reopened from the Project menu. If the closed tab was
  // active, switch to another open tab.
  const closeTab = async (id) => {
    const remainingTabs = openTabs.filter(t => t !== id);
    if (remainingTabs.length === 0) return;   // never close the last open tab
    setOpenTabs(remainingTabs);
    if (id === activeProjectId) {
      const nextId = remainingTabs[remainingTabs.length - 1];
      await commitDraftAndSwitch(
        { nodes, segments, cables, bgImage },
        nextId
      );
    }
  };

  // Drag-to-reorder: move drawing tab `fromId` to the position of `toId`.
  const reorderTabs = (fromId, toId) => {
    setOpenTabs(tabs => {
      const arr = [...tabs];
      const from = arr.indexOf(fromId);
      const to = arr.indexOf(toId);
      if (from === -1 || to === -1 || from === to) return tabs;
      arr.splice(from, 1);
      arr.splice(to, 0, fromId);
      return arr;
    });
  };

  // --- Cross-drawing links ---
  // Read another (stored) drawing's nodes so the user can pick a point to link to.
  const loadDrawingNodes = async (projectId) => {
    try {
      const raw = await appStorage.get(projKey(projectId));
      if (!raw) return {};
      const b = JSON.parse(raw);
      const ns = (b.nodes && Object.keys(b.nodes).length) ? b.nodes : autoLayoutFromSegments(b.segments || {});
      return ns || {};
    } catch (e) { return {}; }
  };
  // Apply a patch to one node inside another drawing's stored bundle (used to
  // write the reciprocal end of a link). Active drawing is patched in-editor.
  const patchDrawingNode = async (projectId, nodeId, patch) => {
    try {
      const raw = await appStorage.get(projKey(projectId));
      const b = raw ? JSON.parse(raw) : null;
      if (!b) return;
      b.nodes = b.nodes || {};
      if (!b.nodes[nodeId]) {
        const auto = autoLayoutFromSegments(b.segments || {});
        b.nodes[nodeId] = auto[nodeId] || { x: 100, y: 100 };
      }
      b.nodes[nodeId] = { ...b.nodes[nodeId], ...patch };
      await appStorage.set(projKey(projectId), JSON.stringify(b));
    } catch (e) {}
  };

  // Gather every element ID (nodes, segments, cables) used by all OTHER drawings,
  // so new IDs in the current drawing can be made unique across the whole project.
  const collectUsedIds = async (exceptId) => {
    const set = new Set();
    for (const p of (projectList || [])) {
      if (p.id === exceptId) continue;
      try {
        const raw = await appStorage.get(projKey(p.id));
        if (!raw) continue;
        const b = JSON.parse(raw);
        Object.keys(b.nodes || {}).forEach(id => set.add(id));
        Object.keys(b.segments || {}).forEach(id => set.add(id));
        (b.cables || []).forEach(c => { if (c && c.id) set.add(c.id); });
      } catch (e) {}
    }
    return set;
  };

  const renameProject = (id, name) => {
    setProjectList(projectList.map(p => p.id === id ? { ...p, name } : p));
  };

  // JSON Import/Export
  const exportProjectJSON = () => {
    const data = JSON.stringify({ project, cableTypes, trayTypes, transformerTypes, segments, nodes, cables, _meta:{ exported:new Date().toISOString(), app:'CableSystemDesigner', version:'1.2' } }, null, 2);
    downloadBlob(`${project.site}_${project.location}_project.json`, data);
  };

  // Gather ALL drawings and export the whole project to one Danish Excel workbook.
  const exportProject = async () => {
    // Make sure the current drawing's latest edits are persisted before reading others.
    try { await flushCurrent(); } catch (e) {}
    const drawings = [];
    for (const p of (projectList || [])) {
      let b;
      if (p.id === activeProjectId) {
        b = { project, nodes, segments, cables, cableTypes, trayTypes };
      } else {
        b = (await loadBundle(p.id)) || {};
      }
      drawings.push({
        id: p.id, name: p.name,
        project: b.project || project,
        nodes: b.nodes || {},
        segments: b.segments || {},
        cables: b.cables || [],
        cableTypes: { ...DEFAULT_CABLE_TYPES, ...(b.cableTypes || {}) },
        trayTypes: { ...DEFAULT_TRAY_TYPES, ...(b.trayTypes || {}) },
      });
    }
    try { exportProjectXlsx(drawings, project); }
    catch (e) { try { exportXlsx({ project, cables, segments, cableTypes, trayTypes }, A); } catch (e2) {} }
  };
  const handleJSONImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const text = await file.text();
      const d = JSON.parse(text);
      if (!d.cables || !d.segments) throw new Error('Missing required fields');
      setProject(d.project ?? DEFAULT_PROJECT);
      setCableTypes(d.cableTypes ?? DEFAULT_CABLE_TYPES);
      setTrayTypes({ ...DEFAULT_TRAY_TYPES, ...(d.trayTypes || {}) });
      setTransformerTypes(d.transformerTypes ?? DEFAULT_TRANSFORMER_TYPES);
      setSegments(d.segments ?? {});
      setNodes(d.nodes ?? autoLayoutFromSegments(d.segments ?? {}));
      setCables(d.cables ?? []);
      alert(`Importeret: ${d.cables?.length ?? 0} kabler, ${Object.keys(d.segments ?? {}).length} segments`);
    } catch (err) {
      alert(`Fejl ved import: ${err.message}`);
    }
    e.target.value = '';
  };
  const exportCablesCSV = () => {
    downloadBlob(`${project.site}_cables.csv`, cablesToCSV(cables), 'text/csv');
  };
  const handleCSVImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const text = await file.text();
      const parsed = csvToCables(text);
      if (!safeConfirm(`Importér ${parsed.length} kabler? Eksisterende kabler slettes.`)) { e.target.value=''; return; }
      setCables(parsed);
    } catch (err) {
      alert(`Fejl: ${err.message}`);
    }
    e.target.value = '';
  };

  const counts = useMemo(() => {
    const ls = { LS1:0, LS2:0, LS3:0 };
    cables.forEach(c => { ls[A.lsOf[c.id]] = (ls[A.lsOf[c.id]] || 0) + 1; });
    return ls;
  }, [cables, A.lsOf]);

  const critical = A.opt.filter(o => o.severity === 'CRITICAL').length;
  const tight = A.opt.filter(o => o.severity === 'TIGHT').length;

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="min-h-screen bg-stone-50" style={{ fontFamily:'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Sticky top chrome — section tabs + header, ivory engineering style (mirrors the trays editor) */}
      <div className="sticky top-0 z-20">
        {/* Section tabs — the program is organised around Føringsveje (trays) as its core */}
        <nav className="flex items-stretch overflow-x-auto border-b border-stone-200 select-none" style={{ backgroundColor:'#E9E5D9', scrollbarWidth:'thin' }}>
          {[
            { k:'trays',    tkey:'trays',    icon:Layers },
            { k:'project',  tkey:'project',  icon:Settings },
            { k:'cables',   tkey:'cables',   icon:Cable },
            { k:'diagram',  tkey:'diagram',  icon:GitBranch },
            { k:'catalog',  tkey:'catalog',  icon:BookOpen },
            { k:'analysis', tkey:'analysis', icon:BarChart3 },
          ].map(({k,tkey,icon:Icon}) => (
            <button key={k} onClick={() => setTab(k)}
                    className={`px-4 py-1.5 text-xs whitespace-nowrap border-r border-stone-300/50 flex items-center gap-1.5 rounded-t-lg ${tab===k ? 'font-semibold' : 'text-stone-600 hover:bg-white/40'}`}
                    style={tab===k ? { backgroundColor:'#D7D0BC', color:'#44403c' } : undefined}>
              <Icon size={14}/> {t(tkey)}
            </button>
          ))}
        </nav>
        {/* Header — project identity (IEC 81346) + actions */}
        <header className="flex items-center gap-2 flex-wrap px-4 py-1.5 border-b border-stone-200/70 shadow-sm"
                style={{ background:'linear-gradient(to right, #F4F2EC, #FBFAF6)', color:'#44403c' }}>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold flex items-center gap-2 text-stone-800 truncate">
              <Cable size={16} className="text-stone-600 shrink-0"/> ={project.site}+{project.location}
            </h1>
            <p className="text-[11px] text-stone-500 truncate">{cables.length} {t('unitCables')} · {Object.keys(segments).length} {t('unitTrays')}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
            {/* Language selector */}
            <label className="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors hover:brightness-95"
                   style={{ backgroundColor:'#E7E2D4', color:'#44403c' }} title="Vælg sprog / Language">
              <Globe size={15}/> {t('language')}
              <select value={lang} onChange={e=>setLang(e.target.value)}
                      className="bg-transparent outline-none cursor-pointer text-xs font-semibold max-w-[5.5rem] truncate" style={{ color:'#44403c' }}>
                {LANGS.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </label>
            <button onClick={() => exportProject()}
                    title="Download hele projektet som Excel (dansk)"
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors hover:brightness-95"
                    style={{ backgroundColor:'#E7E2D4', color:'#44403c' }}>
              <FileDown size={15}/> Excel
            </button>
            {/* Back to start page — always available */}
            <button onClick={()=>setTab('project')} title="Tilbage til forsiden"
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors hover:brightness-95 ${tab==='project' ? 'opacity-50' : ''}`}
                    style={{ backgroundColor:'#D7D0BC', color:'#44403c' }}>
              <Home size={15}/> Forside
            </button>
          </div>
        </header>
      </div>

      <main className="p-3 lg:p-6 lg:max-w-6xl lg:mx-auto space-y-3">
        {tab === 'project' && <ProjectTab project={project} setProject={setProject} counts={counts} critical={critical} tight={tight} loadTemplate={loadTemplate} clearAll={clearAll} transformerTypes={transformerTypes} exportProjectJSON={exportProjectJSON} fileInputRef={fileInputRef} projectList={projectList} activeProjectId={activeProjectId} switchProject={switchProject} deleteProject={deleteProject} renameProject={renameProject} openNewProject={()=>setNewProjectOpen(true)} setTab={setTab} setDrawingOpen={setDrawingOpen} t={t} />}
        {tab === 'cables' && <CablesTab cables={cables} setCables={setCables} cableTypes={cableTypes} segments={segments} A={A} setEditing={setEditing} setSizingOpen={setSizingOpen} exportCablesCSV={exportCablesCSV} csvInputRef={csvInputRef} />}
        {tab === 'trays' && <TraysTab segments={segments} setSegments={setSegments} trayTypes={trayTypes} A={A} setEditing={setEditing} setDrawingOpen={setDrawingOpen} />}
        {tab === 'diagram' && <DiagramTab cables={cables} A={A} project={project} />}
        {tab === 'catalog' && <CatalogTab cableTypes={cableTypes} setCableTypes={setCableTypes} trayTypes={trayTypes} setTrayTypes={setTrayTypes} transformerTypes={transformerTypes} setTransformerTypes={setTransformerTypes} setEditing={setEditing} />}
        {tab === 'analysis' && <AnalysisTab cables={cables} A={A} cableTypes={cableTypes} segments={segments} />}
      </main>

      {/* hidden file inputs */}
      <input ref={fileInputRef} type="file" accept=".json,application/json" style={{ display:'none' }} onChange={handleJSONImport} />
      <input ref={csvInputRef} type="file" accept=".csv,text/csv" style={{ display:'none' }} onChange={handleCSVImport} />

      {editing && <EditModal editing={editing} setEditing={setEditing} cableTypes={cableTypes} trayTypes={trayTypes} transformerTypes={transformerTypes} segments={segments} setCables={setCables} setSegments={setSegments} setCableTypes={setCableTypes} setTrayTypes={setTrayTypes} setTransformerTypes={setTransformerTypes} cables={cables} />}
      {sizingOpen && <SizingModal close={() => setSizingOpen(false)} project={project} cableTypes={cableTypes} segments={segments} cables={cables} setCables={setCables} />}
      {drawingOpen && <DrawingModal key={activeProjectId} close={() => setDrawingOpen(false)} goHome={() => { setDrawingOpen(false); setTab('project'); }} segments={segments} setSegments={setSegments} nodes={nodes} setNodes={setNodes} trayTypes={trayTypes} cables={cables} setCables={setCables} cableTypes={cableTypes} bgImage={bgImage} setBgImage={setBgImage} project={project}
        projectList={projectList} openTabs={openTabs} activeProjectId={activeProjectId} commitDraftAndSwitch={commitDraftAndSwitch} commitDraftAndCreate={commitDraftAndCreate} closeTab={closeTab} reorderTabs={reorderTabs} renameProject={renameProject} loadDrawingNodes={loadDrawingNodes} patchDrawingNode={patchDrawingNode} collectUsedIds={collectUsedIds} saveAllDrawings={saveAllDrawings} autoSave={autoSave} toggleAutoSave={toggleAutoSave} />}
      {newProjectOpen && <NewProjectModal close={() => setNewProjectOpen(false)} createProject={createProject} />}
    </div>
  );
}

// =========================
// TAB: PROJECT
// =========================
function LinkDialog({ fromNodeId, projects, loadDrawingNodes, onConfirm, onClose }) {
  const [pid, setPid] = useState(projects[0]?.id || '');
  const [nodesMap, setNodesMap] = useState({});
  const [nid, setNid] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!pid) { setNodesMap({}); setNid(''); return; }
    setLoading(true);
    loadDrawingNodes(pid).then(ns => {
      if (!alive) return;
      setNodesMap(ns || {});
      setNid(Object.keys(ns || {})[0] || '');
      setLoading(false);
    });
    return () => { alive = false; };
  }, [pid]);
  const nodeIds = Object.keys(nodesMap);
  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-end lg:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white p-4 rounded-2xl w-full lg:max-w-md" onClick={e=>e.stopPropagation()}>
        <h3 className="font-bold mb-1 text-stone-800 flex items-center gap-2"><Link2 size={18}/> Forbind til anden tegning</h3>
        <p className="text-xs text-stone-500 mb-3">Forbind punktet <b className="text-stone-700">{fromNodeId}</b> til et punkt på en anden tegning.</p>
        {projects.length === 0 ? (
          <div className="text-sm text-stone-500 py-3">Der er ingen andre tegninger at forbinde til endnu. Opret en ekstra tegning først.</div>
        ) : (
          <>
            <label className="block text-xs font-semibold text-stone-600 mb-1">Tegning</label>
            <select value={pid} onChange={e=>setPid(e.target.value)} className="w-full border border-stone-300 rounded-lg px-2 py-2 text-sm mb-3 bg-white">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <label className="block text-xs font-semibold text-stone-600 mb-1">Punkt på tegningen</label>
            {loading ? (
              <div className="text-sm text-stone-400 py-2 mb-3">Indlæser punkter…</div>
            ) : nodeIds.length ? (
              <select value={nid} onChange={e=>setNid(e.target.value)} className="w-full border border-stone-300 rounded-lg px-2 py-2 text-sm mb-3 bg-white">
                {nodeIds.map(id => <option key={id} value={id}>{id}{nodesMap[id]?.kind ? ` (${nodesMap[id].kind})` : ''}</option>)}
              </select>
            ) : (
              <div className="text-sm text-stone-400 py-2 mb-3">Ingen punkter på den valgte tegning.</div>
            )}
          </>
        )}
        <div className="flex gap-2 mt-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-stone-300 rounded-lg font-semibold text-sm">Annuller</button>
          <button disabled={!pid || !nid} onClick={()=>onConfirm(pid, nid)}
                  className="flex-[2] py-2.5 rounded-lg font-semibold text-sm text-white disabled:opacity-40" style={{ backgroundColor:'#44403c' }}>Forbind</button>
        </div>
      </div>
    </div>
  );
}
function NewProjectModal({ close, createProject }) {
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('empty');
  return (
    <div className="fixed inset-0 bg-black/50 z-30 flex items-end lg:items-center justify-center p-4" onClick={close}>
      <div className="bg-white p-4 rounded-2xl w-full lg:max-w-md" onClick={e=>e.stopPropagation()}>
        <h3 className="font-bold mb-3 text-stone-800 flex items-center gap-2"><Plus size={18}/> Nyt projekt</h3>
        <FormField label="Projektnavn" value={name} onChange={setName} hint="fx Kontorbygning Vest, Datacenter Nord" />
        <label className="block text-xs font-semibold text-stone-600 mt-3 mb-1">Start fra</label>
        <div className="space-y-2">
          {[
            ['empty', 'Tomt projekt', 'Start helt forfra'],
            ['office', 'Kontor-skabelon', '11 kabler, 2 tavler — lille eksempel'],
            ['dc', 'Datacenter-skabelon', 'Tier III, 2N redundans — stort eksempel'],
          ].map(([k, title, desc]) => (
            <button key={k} onClick={()=>setTemplate(k)}
              className={`w-full text-left p-2.5 rounded-lg border-2 ${template===k ? 'border-stone-500 bg-stone-100' : 'border-stone-200'}`}>
              <div className="font-semibold text-sm text-stone-800">{title}</div>
              <div className="text-xs text-stone-500">{desc}</div>
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={close} className="flex-1 py-3 border border-stone-300 rounded-lg font-semibold">Annuller</button>
          <button onClick={()=>createProject(name.trim(), template)} className="flex-[2] py-3 bg-stone-800 text-white rounded-lg font-semibold">Opret tegning</button>
        </div>
      </div>
    </div>
  );
}

function ProjectTab({ project, setProject, counts, critical, tight, loadTemplate, clearAll, transformerTypes, exportProjectJSON, fileInputRef, projectList, activeProjectId, switchProject, deleteProject, renameProject, openNewProject, setTab, setDrawingOpen, t }) {
  const update = (k, v) => setProject({ ...project, [k]: v });
  const [confirmDel, setConfirmDel] = useState(null);   // project id pending delete-confirmation
  const linkedT = project.transformer ? transformerTypes[project.transformer] : null;
  const activeName = projectList?.find(p => p.id === activeProjectId)?.name ?? '';
  return (
    <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
      {/* Project library */}
      <div className="bg-white p-3 rounded-xl shadow-sm lg:col-span-2">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-stone-800 flex items-center gap-1"><FileText size={16}/> Projekter</h2>
          <button onClick={openNewProject} className="bg-stone-800 text-white px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1 active:scale-95"><Plus size={14}/> Nyt projekt</button>
        </div>
        <div className="space-y-1">
          {(projectList || []).map(p => (
            <div key={p.id} className={`flex items-center gap-2 p-2 rounded-lg border ${p.id===activeProjectId ? 'bg-stone-100 border-stone-300' : 'border-stone-200'}`}>
              <button onClick={()=>switchProject(p.id)} className="flex-1 text-left flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${p.id===activeProjectId ? 'bg-stone-700' : 'bg-stone-300'}`}/>
                <input
                  value={p.name}
                  onChange={(e)=>renameProject(p.id, e.target.value)}
                  onClick={(e)=>e.stopPropagation()}
                  className="bg-transparent font-medium text-stone-800 text-sm outline-none focus:bg-white focus:border focus:border-stone-300 rounded px-1 py-0.5 min-w-0 flex-1"
                />
                {p.id===activeProjectId && <span className="text-[10px] bg-stone-700 text-white px-1.5 py-0.5 rounded font-semibold">aktiv</span>}
              </button>
              {confirmDel === p.id ? (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[11px] text-stone-500 mr-1">Slet?</span>
                  <button onClick={()=>{ deleteProject(p.id, true); setConfirmDel(null); }}
                          className="px-2 py-1 rounded-md text-xs font-semibold bg-red-600 text-white hover:bg-red-700"
                          title="Bekræft sletning">Ja</button>
                  <button onClick={()=>setConfirmDel(null)}
                          className="px-2 py-1 rounded-md text-xs font-semibold bg-stone-200 text-stone-700 hover:bg-stone-300"
                          title="Annullér">Nej</button>
                </div>
              ) : (
                <button onClick={()=>setConfirmDel(p.id)} className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded transition-colors shrink-0" title="Slet projekt"><Trash2 size={15}/></button>
              )}
            </div>
          ))}
          {(projectList || []).length === 0 && (
            <div className="text-sm text-stone-500 text-center py-3">Ingen projekter endnu.</div>
          )}
        </div>
        <p className="text-xs text-stone-400 mt-2">Tap et projektnavn for at redigere det · tap rækken for at skifte projekt</p>
      </div>

      {/* Workspace launcher — open the program's sections from the start page */}
      <div className="bg-white p-3 rounded-xl shadow-sm lg:col-span-2">
        <h2 className="font-bold text-stone-800 mb-2">Åbn arbejdsområde</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {/* Føringsveje — the core of the program */}
          <button onClick={()=> setDrawingOpen ? setDrawingOpen(true) : setTab('trays')}
                  className="col-span-2 sm:col-span-1 flex flex-col items-start gap-1.5 p-3 rounded-lg text-left transition-transform active:scale-95 hover:brightness-110"
                  style={{ backgroundColor:'#44403c', color:'#fff' }}>
            <Layers size={20}/>
            <span className="text-sm font-semibold">{t ? t('trays') : 'Føringsveje'}</span>
            <span className="text-[11px] opacity-70">Åbn tegning</span>
          </button>
          {[
            { k:'cables',   label: t ? t('cables') : 'Kabler',     icon:Cable,  hint:'Kabel-liste' },
            { k:'diagram',  label: t ? t('diagram') : 'Diagram',   icon:GitBranch, hint:'Enstregsskema' },
            { k:'catalog',  label: t ? t('catalog') : 'Katalog',   icon:BookOpen, hint:'Typer & data' },
            { k:'analysis', label: t ? t('analysis') : 'Analyse',  icon:BarChart3, hint:'Beregninger' },
          ].map(({k,label,icon:Icon,hint}) => (
            <button key={k} onClick={()=>setTab(k)}
                    className="flex flex-col items-start gap-1.5 p-3 rounded-lg text-left bg-white border border-stone-200 hover:bg-stone-50 hover:border-stone-300 transition-colors active:scale-95">
              <Icon size={18} className="text-stone-600"/>
              <span className="text-sm font-semibold text-stone-800">{label}</span>
              <span className="text-[11px] text-stone-400">{hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white p-3 rounded-xl shadow-sm lg:col-span-2">
        <h2 className="font-bold text-stone-800 mb-2">System status</h2>
        <div className="grid grid-cols-3 lg:grid-cols-5 gap-2 text-center">
          <Stat label="LS1" value={counts.LS1} dot={LS_BORDER.LS1} />
          <Stat label="LS2" value={counts.LS2} dot={LS_BORDER.LS2} />
          <Stat label="LS3" value={counts.LS3} dot={LS_BORDER.LS3} />
          <Stat label="Critical" value={critical} dot={critical>0?'#dc2626':'#16a34a'} alert={critical>0} />
          <Stat label="Tight" value={tight} dot={tight>0?'#d97706':'#16a34a'} alert={tight>0} />
        </div>
      </div>

      <div className="bg-white p-3 rounded-xl shadow-sm">
        <h2 className="font-bold text-stone-800 mb-3">Project parameters</h2>
        <FormField label="Site (IEC 81346 =)" value={project.site} onChange={v=>update('site', v)} />
        <FormField label="Location (+)" value={project.location} onChange={v=>update('location', v)} />
        <FormField label="Description" value={project.description} onChange={v=>update('description', v)} />
        <FormField label="Ambient temperature [°C]" type="number" value={project.ambient_c} onChange={v=>update('ambient_c', parseInt(v)||30)} hint={`k_temp = ${kAmbient(project.ambient_c)}`} />
        <FormField label="LS threshold (Ib/Iz)" type="number" step="0.01" value={project.ls_threshold} onChange={v=>update('ls_threshold', parseFloat(v)||0.30)} />
        <div className="text-xs text-stone-600 mt-2">
          ΔU limits: Lighting {project.vd_limits['Lighting circuit']}%, Rack {project.vd_limits['Rack feeder']}%, default {project.vd_limits._default}%
        </div>
      </div>

      <div className="bg-white p-3 rounded-xl shadow-sm">
        <h2 className="font-bold text-stone-800 mb-3 flex items-center gap-1"><Zap size={16}/> MV-side (transformer)</h2>
        <Selector label="Linked transformer (MV→LV)" value={project.transformer || ''} onChange={v=>update('transformer', v || null)} options={['', ...Object.keys(transformerTypes)]} />
        {linkedT && (
          <div className="bg-stone-50 p-2 rounded text-xs mb-2 space-y-0.5">
            <div><span className="text-stone-500">S:</span> <b>{linkedT.S_kVA} kVA</b> · <span className="text-stone-500">U_pri:</span> {linkedT.U_pri_kV} kV · <span className="text-stone-500">U_sec:</span> {linkedT.U_sec_V} V</div>
            <div><span className="text-stone-500">uk:</span> {linkedT.uk_pct} %</div>
          </div>
        )}
        <FormField label="Number in parallel" type="number" value={project.n_transformers_parallel || 1} onChange={v=>update('n_transformers_parallel', parseInt(v)||1)} />
        <FormField label={`Z_source loop [mΩ] ${linkedT ? '(auto from transformer)' : ''}`} type="number" step="0.01" value={project.z_source_mohm} onChange={v=>linkedT ? null : update('z_source_mohm', parseFloat(v)||40)} hint={linkedT ? `Auto: Z = uk×U²/(100×S×n) = ${calcZsource(linkedT, project.n_transformers_parallel || 1)} mΩ` : 'Manual entry'} />
      </div>

      <div className="bg-white p-3 rounded-xl shadow-sm">
        <h2 className="font-bold text-stone-800 mb-2 flex items-center gap-1"><Save size={16}/> Import / Export</h2>
        <p className="text-xs text-stone-600 mb-3">Flyt projektet mellem enheder via JSON-fil, eller del med kolleger.</p>
        <button onClick={exportProjectJSON} className="w-full bg-stone-100 hover:bg-stone-200 text-stone-800 p-3 rounded-lg mb-2 flex items-center justify-center gap-2 font-semibold active:scale-98 transition">
          <Download size={16}/> Eksportér projekt (JSON)
        </button>
        <button onClick={() => fileInputRef.current?.click()} className="w-full bg-green-50 hover:bg-green-100 text-green-900 p-3 rounded-lg flex items-center justify-center gap-2 font-semibold active:scale-98 transition">
          <Upload size={16}/> Importér projekt (JSON)
        </button>
      </div>

      <div className="bg-white p-3 rounded-xl shadow-sm">
        <h2 className="font-bold text-stone-800 mb-2">Templates</h2>
        <p className="text-xs text-stone-600 mb-3">Erstat det nuværende projekt med en færdig opsætning.</p>
        <button onClick={() => loadTemplate('office')} className="w-full bg-stone-100 border-2 border-stone-300 hover:bg-stone-200 text-stone-800 p-3 rounded-lg mb-2 flex items-center justify-between active:scale-98 transition">
          <span className="font-semibold">Small office (B1+02)</span>
          <ChevronRight size={18} />
        </button>
        <button onClick={() => loadTemplate('dc')} className="w-full bg-purple-50 border-2 border-purple-200 hover:bg-purple-100 text-purple-900 p-3 rounded-lg flex items-center justify-between active:scale-98 transition">
          <span className="font-semibold">Datacenter (DC1, 2N, 2.5 MW)</span>
          <ChevronRight size={18} />
        </button>
        <button onClick={clearAll} className="w-full mt-3 bg-stone-100 hover:bg-stone-200 text-stone-700 p-2 rounded-lg text-sm flex items-center justify-center gap-1">
          <RefreshCw size={14}/> Reset alt
        </button>
      </div>

      <div className="bg-stone-100 border border-stone-300 p-3 rounded-xl text-xs text-stone-800">
        <p className="font-semibold mb-1">📱 Tip</p>
        <p>Tilføj denne side til din hjemmeskærm via Safari/Chrome's del-menu, så fungerer den som en app. Data gemmes automatisk på din enhed.</p>
      </div>
    </div>
  );
}

function Stat({ label, value, dot, alert }) {
  return (
    <div className="px-3 py-2.5 rounded-lg bg-white border border-stone-200 flex flex-col items-center justify-center gap-1">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-stone-500">
        {dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} />}
        {label}
      </div>
      <div className="text-xl font-bold" style={{ color: alert ? dot : '#44403c' }}>{value}</div>
    </div>
  );
}
function FormField({ label, value, onChange, type='text', step, hint }) {
  return (
    <label className="block mb-3">
      <span className="text-xs font-semibold text-stone-700">{label}</span>
      <input type={type} step={step} value={value} onChange={e=>onChange(e.target.value)} className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-base" />
      {hint && <span className="text-xs text-stone-500 mt-0.5 block">{hint}</span>}
    </label>
  );
}

// =========================
// TAB: CABLES
// =========================
function CablesTab({ cables, setCables, cableTypes, segments, A, setEditing, setSizingOpen, exportCablesCSV, csvInputRef }) {
  const [filter, setFilter] = useState('');
  const [lsFilter, setLsFilter] = useState('all');
  const filtered = useMemo(() => cables.filter(c => {
    if (lsFilter !== 'all' && A.lsOf[c.id] !== lsFilter) return false;
    if (!filter) return true;
    const f = filter.toLowerCase();
    return c.id.toLowerCase().includes(f) || c.from.toLowerCase().includes(f) || c.to.toLowerCase().includes(f) || c.function.toLowerCase().includes(f);
  }), [cables, filter, lsFilter, A.lsOf]);

  const delCable = (id) => { if (safeConfirm(`Slet ${id}?`)) setCables(cables.filter(c => c.id !== id)); };

  return (
    <div className="space-y-2">
      <div className="bg-white p-3 rounded-xl shadow-sm sticky top-16 z-5">
        <div className="flex gap-2 mb-2">
          <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Søg cable ID, from, to..." className="flex-1 px-3 py-2 border rounded-lg text-sm" />
          <button onClick={() => setEditing({ kind:'cable', item: { id:`W${String(cables.length+1).padStart(3,'0')}`, from:'', to:'', function:'Socket circuit', V:230, phases:1, cable_type:Object.keys(cableTypes)[0], Ib:0, In:0, cos_phi:0.9, route:[] }, isNew:true })} className="bg-stone-800 text-white px-3 py-2 rounded-lg active:scale-95"><Plus size={18}/></button>
        </div>
        <div className="flex gap-1 text-xs items-center">
          {['all','LS1','LS2','LS3'].map(l => (
            <button key={l} onClick={()=>setLsFilter(l)} className={`px-2 py-1 rounded ${lsFilter===l?'bg-stone-800 text-white':'bg-stone-100 text-stone-700'}`}>{l}</button>
          ))}
          <div className="ml-auto flex gap-1">
            <button onClick={() => setSizingOpen(true)} className="px-2 py-1 rounded bg-amber-100 text-amber-900 flex items-center gap-1 active:scale-95"><Calculator size={12}/> Sizing</button>
            <button onClick={exportCablesCSV} className="px-2 py-1 rounded bg-stone-100 text-stone-700 flex items-center gap-1 active:scale-95"><Download size={12}/> CSV</button>
            <button onClick={() => csvInputRef.current?.click()} className="px-2 py-1 rounded bg-stone-100 text-stone-700 flex items-center gap-1 active:scale-95"><Upload size={12}/></button>
          </div>
        </div>
        <div className="text-xs text-stone-500 mt-1">{filtered.length} af {cables.length}</div>
      </div>

      {filtered.length === 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm text-center text-stone-500">
          Ingen kabler. Tryk + for at tilføje, eller indlæs en template fra Project-fanen.
        </div>
      )}

      <div className="space-y-2 md:space-y-0 md:grid md:grid-cols-2 xl:grid-cols-3 md:gap-3">
      {filtered.map(c => {
        const d = A.derating[c.id]; const v = A.vd[c.id]; const ct = cableTypes[c.cable_type];
        return (
          <div key={c.id} className="bg-white p-3 rounded-xl shadow-sm">
            <div className="flex items-start justify-between mb-1">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-bold text-stone-800">{c.id}</span>
                  <LSBadge ls={d?.ls} />
                  <StatusBadge status={d?.status} />
                </div>
                <div className="text-sm text-stone-700">{c.from} → {c.to}</div>
                <div className="text-xs text-stone-500">{c.function} · {c.cable_type} · {c.V}V {c.phases}P</div>
              </div>
              <div className="flex gap-1">
                <button onClick={()=>setEditing({ kind:'cable', item:c, isNew:false })} className="p-2 text-stone-700"><Edit2 size={16}/></button>
                <button onClick={()=>delCable(c.id)} className="p-2 text-red-600"><Trash2 size={16}/></button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1 mt-2 text-xs">
              <Mini label="Ib" v={`${c.Ib}A`}/>
              <Mini label="In" v={`${c.In}A`}/>
              <Mini label="Iz·k" v={`${d?.iz_final}A`} ok={d?.status==='OK'}/>
              <Mini label="ΔU" v={`${v?.du_total}%`} ok={v?.status==='OK'}/>
            </div>
            {(c.route?.length ?? 0) > 0 && (
              <div className="text-xs text-stone-500 mt-2 truncate">Route: {(c.route||[]).join(' → ')}</div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
function Mini({ label, v, ok }) {
  return (
    <div className={`p-1.5 rounded text-center ${ok===undefined?'bg-stone-50':ok?'bg-green-50':'bg-red-50'}`}>
      <div className="text-stone-500">{label}</div>
      <div className={`font-semibold ${ok===undefined?'text-stone-700':ok?'text-green-700':'text-red-700'}`}>{v}</div>
    </div>
  );
}

// =========================
// TAB: TRAYS
// =========================
function TraysTab({ segments, setSegments, trayTypes, A, setEditing, setDrawingOpen }) {
  const segs = Object.entries(segments);
  const delSeg = (id) => { if (safeConfirm(`Slet ${id}?`)) { const s = {...segments}; delete s[id]; setSegments(s); } };
  return (
    <div className="space-y-2">
      <div className="bg-white p-3 rounded-xl shadow-sm sticky top-[88px] z-5 flex justify-between items-center gap-2 border border-stone-200/70">
        <div className="text-sm text-stone-700">{segs.length} føringsvejssegmenter</div>
        <div className="flex gap-1.5">
          <button onClick={() => setDrawingOpen(true)}
                  className="px-3.5 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 active:scale-95 transition-colors hover:brightness-110"
                  style={{ backgroundColor:'#44403c', color:'#fff' }}><Pencil size={14}/> Åbn tegning</button>
          <button onClick={()=>setEditing({ kind:'segment', item:{ id:`WC${String(segs.length+1).padStart(3,'0')}`, from:'', to:'', length_m:5, tray_type:Object.keys(trayTypes)[0] }, isNew:true })}
                  className="px-3 py-2 rounded-lg active:scale-95 transition-colors hover:brightness-95"
                  style={{ backgroundColor:'#E7E2D4', color:'#44403c' }}><Plus size={18}/></button>
        </div>
      </div>
      {segs.length === 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm text-center text-stone-500">
          Ingen tray segments. Tryk + for at tilføje.
        </div>
      )}
      <div className="space-y-2 md:space-y-0 md:grid md:grid-cols-2 xl:grid-cols-3 md:gap-3">
      {segs.map(([id, s]) => {
        const f = A.trayFill[id]; const ls = A.lsCounts[id];
        return (
          <div key={id} className="bg-white p-3 rounded-xl shadow-sm">
            <div className="flex justify-between items-start mb-1">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-stone-800">{id}</span>
                  <StatusBadge status={f?.status}/>
                </div>
                <div className="text-sm text-stone-700">{s.from} → {s.to}</div>
                <div className="text-xs text-stone-500">{s.length_m}m · {s.tray_type}</div>
              </div>
              <div className="flex gap-1">
                <button onClick={()=>setEditing({ kind:'segment', item:{id, ...s}, isNew:false })} className="p-2 text-stone-700"><Edit2 size={16}/></button>
                <button onClick={()=>delSeg(id)} className="p-2 text-red-600"><Trash2 size={16}/></button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1 text-xs mt-2">
              <Mini label="Cables" v={f?.count ?? 0}/>
              <Mini label="LS1" v={ls?.LS1 ?? 0}/>
              <Mini label="LS2" v={ls?.LS2 ?? 0}/>
              <Mini label="LS3" v={ls?.LS3 ?? 0}/>
            </div>
            <div className="mt-2 text-xs text-stone-600">
              Fill: <span className="font-semibold">{f?.fill_pct ?? 0}%</span> / {f?.max ?? 0}%
              <div className="h-2 bg-stone-100 rounded mt-1 overflow-hidden">
                <div className="h-full" style={{ width:`${Math.min(100, (f?.fill_pct ?? 0) / (f?.max ?? 40) * 100)}%`, background: (f?.fill_pct ?? 0) > (f?.max ?? 40) ? '#dc2626' : '#10b981' }}/>
              </div>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

// =========================
// TAB: CATALOG (with transformers)
// =========================
function CatalogTab({ cableTypes, setCableTypes, trayTypes, setTrayTypes, transformerTypes, setTransformerTypes, setEditing }) {
  const [sub, setSub] = useState('cables');
  return (
    <div className="space-y-2">
      <div className="bg-white p-2 rounded-xl shadow-sm grid grid-cols-3 gap-1 text-xs">
        <button onClick={()=>setSub('cables')} className={`py-2 rounded ${sub==='cables'?'bg-stone-800 text-white':'text-stone-700'}`}>Cables</button>
        <button onClick={()=>setSub('trays')} className={`py-2 rounded ${sub==='trays'?'bg-stone-800 text-white':'text-stone-700'}`}>Trays</button>
        <button onClick={()=>setSub('xfmr')} className={`py-2 rounded ${sub==='xfmr'?'bg-stone-800 text-white':'text-stone-700'}`}>Transformers</button>
      </div>

      {sub === 'cables' && (
        <>
          <div className="flex justify-end">
            <button onClick={()=>setEditing({ kind:'cable_type', item:{ name:'New cable', conductors:5, cross_section:'5G6', S_mm2:6, od_mm:13, iz_a:38, is_parallel:1 }, isNew:true })} className="bg-stone-800 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1"><Plus size={16}/> Tilføj</button>
          </div>
          {Object.entries(cableTypes).map(([n, t]) => (
            <div key={n} className="bg-white p-3 rounded-xl shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-stone-800">{n}</div>
                  <div className="text-xs text-stone-500">{t.cross_section} · {t.conductors} cond · {t.is_parallel}× parallel</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={()=>setEditing({ kind:'cable_type', item:{name:n, ...t}, isNew:false })} className="p-2 text-stone-700"><Edit2 size={16}/></button>
                  <button onClick={()=>{ if(safeConfirm(`Slet ${n}?`)){ const c={...cableTypes}; delete c[n]; setCableTypes(c); } }} className="p-2 text-red-600"><Trash2 size={16}/></button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1 text-xs mt-1">
                <Mini label="S [mm²]" v={t.S_mm2}/>
                <Mini label="OD" v={`${t.od_mm}mm`}/>
                <Mini label="Area" v={`${t.area_mm2}`}/>
                <Mini label="Iz" v={`${t.iz_a}A`}/>
              </div>
            </div>
          ))}
        </>
      )}

      {sub === 'trays' && (
        <>
          <div className="flex justify-end">
            <button onClick={()=>setEditing({ kind:'tray_type', item:{ name:'New tray', width_mm:200, height_mm:60, gross_area_mm2:12000, max_fill_percent:40 }, isNew:true })} className="bg-stone-800 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1"><Plus size={16}/> Tilføj</button>
          </div>
          {Object.entries(trayTypes).map(([n, t]) => (
            <div key={n} className="bg-white p-3 rounded-xl shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-stone-800">{n}</div>
                  <div className="text-xs text-stone-500">{t.width_mm} × {t.height_mm} mm · max {t.max_fill_percent}%</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={()=>setEditing({ kind:'tray_type', item:{name:n, ...t}, isNew:false })} className="p-2 text-stone-700"><Edit2 size={16}/></button>
                  <button onClick={()=>{ if(safeConfirm(`Slet ${n}?`)){ const c={...trayTypes}; delete c[n]; setTrayTypes(c); } }} className="p-2 text-red-600"><Trash2 size={16}/></button>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {sub === 'xfmr' && (
        <>
          <div className="bg-amber-50 border border-amber-200 p-2 rounded-xl text-xs text-amber-900">
            MV-side transformere. Vælg én i <b>Project</b>-fanen for automatisk Z_source-beregning.
          </div>
          <div className="flex justify-end">
            <button onClick={()=>setEditing({ kind:'transformer_type', item:{ name:'New TR', S_kVA:1000, U_pri_kV:10, U_sec_V:400, uk_pct:6 }, isNew:true })} className="bg-stone-800 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1"><Plus size={16}/> Tilføj</button>
          </div>
          {Object.entries(transformerTypes).map(([n, t]) => {
            const z = calcZsource(t, 1);
            return (
              <div key={n} className="bg-white p-3 rounded-xl shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-stone-800">{n}</div>
                    <div className="text-xs text-stone-500">{t.S_kVA} kVA · {t.U_pri_kV} kV / {t.U_sec_V} V · uk={t.uk_pct}%</div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={()=>setEditing({ kind:'transformer_type', item:{name:n, ...t}, isNew:false })} className="p-2 text-stone-700"><Edit2 size={16}/></button>
                    <button onClick={()=>{ if(safeConfirm(`Slet ${n}?`)){ const c={...transformerTypes}; delete c[n]; setTransformerTypes(c); } }} className="p-2 text-red-600"><Trash2 size={16}/></button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1 text-xs mt-1">
                  <Mini label="S" v={`${t.S_kVA} kVA`}/>
                  <Mini label="I_nom LV" v={`${Math.round(t.S_kVA*1000/(SQRT3*t.U_sec_V))} A`}/>
                  <Mini label="Z (1×)" v={`${z} mΩ`}/>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// =========================
// TAB: DIAGRAM (SLD)
// =========================
function DiagramTab({ cables, A, project }) {
  const [maxDepth, setMaxDepth] = useState(3);
  const [zoom, setZoom] = useState(1);
  const layout = useMemo(() => buildSLD(cables, maxDepth), [cables, maxDepth]);

  if (cables.length === 0) {
    return <div className="bg-white p-6 rounded-xl shadow-sm text-center text-stone-500">
      Tilføj kabler først, så genereres single-line diagrammet automatisk.
    </div>;
  }

  const downloadSVG = () => {
    const svg = document.getElementById('sld-svg');
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type:'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${project.site}_SLD.svg`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  return (
    <div className="space-y-2">
      <div className="bg-white p-3 rounded-xl shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-stone-600 font-semibold">Max depth:</span>
          {[1,2,3,4,5,99].map(d => (
            <button key={d} onClick={() => setMaxDepth(d===99?Infinity:d)} className={`px-2 py-1 text-xs rounded ${maxDepth===(d===99?Infinity:d)?'bg-stone-800 text-white':'bg-stone-100 text-stone-700'}`}>{d===99?'∞':d}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setZoom(z=>Math.max(0.3, z-0.2))} className="px-2 py-1 text-xs bg-stone-100 rounded flex items-center gap-1"><ZoomOut size={12}/></button>
          <span className="text-xs text-stone-600">{Math.round(zoom*100)}%</span>
          <button onClick={()=>setZoom(z=>Math.min(3, z+0.2))} className="px-2 py-1 text-xs bg-stone-100 rounded flex items-center gap-1"><ZoomIn size={12}/></button>
          <button onClick={()=>setZoom(1)} className="px-2 py-1 text-xs bg-stone-100 rounded">Fit</button>
          <button onClick={downloadSVG} className="ml-auto px-2 py-1 text-xs bg-stone-800 text-white rounded flex items-center gap-1"><Download size={12}/> SVG</button>
        </div>
      </div>

      <div className="bg-white p-2 rounded-xl shadow-sm overflow-auto" style={{ maxHeight:'70vh' }}>
        <svg id="sld-svg" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ width: `${layout.width * zoom}px`, height: `${layout.height * zoom}px` }} fontFamily="Helvetica, Arial, sans-serif">
          <rect width="100%" height="100%" fill="#fafaf7"/>
          {/* cables */}
          {cables.map(c => {
            if (!layout.visible.has(c.from) || !layout.visible.has(c.to)) return null;
            const fp = layout.positions.get(c.from);
            const tp = layout.positions.get(c.to);
            if (!fp || !tp) return null;
            const ls = A.lsOf[c.id];
            const x1 = fp.x + fp.w, y1 = fp.y + fp.h/2;
            const x2 = tp.x, y2 = tp.y + tp.h/2;
            const mid = (x1 + x2) / 2;
            return (
              <g key={c.id}>
                <path d={`M${x1},${y1} L${mid},${y1} L${mid},${y2} L${x2},${y2}`}
                      stroke={LS_BORDER[ls]} strokeWidth="1.5" fill="none" />
              </g>
            );
          })}
          {/* nodes */}
          {Array.from(layout.visible).map(n => {
            const p = layout.positions.get(n);
            if (!p) return null;
            const h = layout.hidden.get(n) || 0;
            return (
              <g key={n}>
                <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="4"
                      fill="#fff" stroke={TYPE_COLORS[p.type]} strokeWidth="2"/>
                <text x={p.x + p.w/2} y={p.y + p.h/2 + 1} textAnchor="middle"
                      fontSize="11" fontWeight="bold" fill={TYPE_COLORS[p.type]}
                      style={{ dominantBaseline:'middle' }}>
                  {n.length > 18 ? n.substring(0, 16) + '…' : n}
                </text>
                {h > 0 && (
                  <g>
                    <rect x={p.x + p.w - 30} y={p.y - 8} width="34" height="14" rx="2" fill="#FFF3CD" stroke="#9C5700"/>
                    <text x={p.x + p.w - 13} y={p.y + 2} textAnchor="middle" fontSize="9" fill="#9C5700" style={{ dominantBaseline:'middle' }}>+{h}</text>
                  </g>
                )}
              </g>
            );
          })}
          {/* legend */}
          <g transform={`translate(${layout.width - 200}, 10)`}>
            <rect width="180" height="100" fill="#fff" stroke="#ddd"/>
            <text x="90" y="15" textAnchor="middle" fontSize="10" fontWeight="bold">Legend</text>
            {[['transformer','Transformer'],['main','Main board'],['ups','UPS'],['sub','Sub-board / PDU'],['rack','Load / Rack']].map(([t, l], i) => (
              <g key={t} transform={`translate(8, ${25 + i*14})`}>
                <rect width="14" height="10" stroke={TYPE_COLORS[t]} strokeWidth="1.5" fill="#fff"/>
                <text x="20" y="9" fontSize="9" fill="#333">{l}</text>
              </g>
            ))}
          </g>
        </svg>
      </div>

      <div className="bg-stone-50 p-2 rounded-xl text-xs text-stone-600">
        Cable-streger er farvet efter LS-spor (lilla=LS1, orange=LS2, grøn=LS3). Gule badges (+n) viser skjulte child-noder. Tryk på en højere depth for at se dybere.
      </div>
    </div>
  );
}

// =========================
// SIZING MODAL — find smallest cable
// =========================
function SizingModal({ close, project, cableTypes, segments, cables, setCables }) {
  const [form, setForm] = useState({
    Ib: 16, V: 230, phases: 1, cos_phi: 0.9, function: 'Socket circuit',
    length_m: 20, n_bundle: 4, ls: 'LS2'
  });
  const set = (k, v) => setForm({ ...form, [k]: v });
  const [res, setRes] = useState(null);

  const calc = () => {
    const r = findCableCandidates({
      Ib: Number(form.Ib), V: Number(form.V), phases: Number(form.phases),
      cos_phi: Number(form.cos_phi), fn: form.function, length_m: Number(form.length_m),
      n_bundle: Number(form.n_bundle), ls: form.ls, project, cableTypes,
    });
    setRes(r);
  };

  const applyCandidate = (c) => {
    const newCable = {
      id: `W${String(cables.length+1).padStart(3,'0')}`,
      from: '', to: '', function: form.function,
      V: Number(form.V), phases: Number(form.phases),
      cable_type: c.name, Ib: Number(form.Ib), In: c.In,
      cos_phi: Number(form.cos_phi), route: [],
    };
    setCables([...cables, newCable]);
    alert(`Tilføjet: ${newCable.id} med ${c.name}. Tilret 'From', 'To' og route i Cables-fanen.`);
    close();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-20 flex items-end lg:items-center lg:justify-center lg:p-4" onClick={close}>
      <div className="bg-white w-full lg:max-w-2xl lg:rounded-2xl max-h-[90vh] overflow-y-auto rounded-t-2xl p-4 lg:p-6" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold text-stone-800 flex items-center gap-1"><Calculator size={18}/> Cable sizing helper</h2>
          <button onClick={close} className="p-2"><X size={20}/></button>
        </div>
        <p className="text-xs text-stone-600 mb-3">Indtast belastning og routing-data — finder mindste kabel der passerer derating og ΔU.</p>

        <div className="grid grid-cols-2 gap-2">
          <FormField label="Ib [A]" type="number" value={form.Ib} onChange={v=>set('Ib',v)}/>
          <Selector label="Function" value={form.function} onChange={v=>set('function',v)} options={FUNCTIONS}/>
          <FormField label="V" type="number" value={form.V} onChange={v=>set('V',v)}/>
          <FormField label="Phases" type="number" value={form.phases} onChange={v=>set('phases',v)}/>
          <FormField label="cos φ" type="number" step="0.01" value={form.cos_phi} onChange={v=>set('cos_phi',v)}/>
          <FormField label="Length [m]" type="number" value={form.length_m} onChange={v=>set('length_m',v)}/>
          <FormField label="Cables in worst bundle" type="number" value={form.n_bundle} onChange={v=>set('n_bundle',v)} hint="LS2/LS1 count in worst-case segment"/>
          <Selector label="LS classification" value={form.ls} onChange={v=>set('ls',v)} options={['LS1','LS2','LS3']}/>
        </div>

        <button onClick={calc} className="w-full mt-3 bg-amber-500 hover:bg-amber-600 text-white p-3 rounded-lg font-semibold flex items-center justify-center gap-2 active:scale-98">
          <Calculator size={16}/> Find mindste kabel
        </button>

        {res && res.error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-900">{res.error}</div>
        )}
        {res && res.candidates && (
          <div className="mt-3">
            <div className="text-xs text-stone-500 mb-2">
              Breaker In = <b>{res.In} A</b> · k_g = <b>{res.kG}</b> · k_t = <b>{res.kT}</b> · k_total = <b>{res.kTot}</b> · ΔU-grænse = <b>{res.limit}%</b>
            </div>
            {res.candidates.length === 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-900">
                Ingen kabel i kataloget kan opfylde kravene. Overvej større tværsnit, kortere route, eller flere parallel-runs.
              </div>
            )}
            {res.candidates.map((c, i) => (
              <div key={c.name} className={`p-3 rounded-lg mb-2 ${i===0?'bg-green-50 border-2 border-green-300':'bg-stone-50 border border-stone-200'}`}>
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <div className="font-bold">{c.name} {i===0 && <span className="text-xs text-green-700">← anbefalet</span>}</div>
                    <div className="text-xs text-stone-600">{c.type.cross_section} · {c.type.iz_a} A base</div>
                  </div>
                  <button onClick={()=>applyCandidate(c)} className="px-3 py-1 bg-stone-800 text-white text-xs rounded">Brug</button>
                </div>
                <div className="grid grid-cols-4 gap-1 text-xs">
                  <Mini label="In" v={`${c.In}A`}/>
                  <Mini label="Iz·k" v={`${c.iz_final}A`} ok={true}/>
                  <Mini label="Margin" v={`+${c.margin}A`} ok={true}/>
                  <Mini label="ΔU" v={`${c.du_pct}%`} ok={c.du_pct <= res.limit}/>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =========================
// TAB: ANALYSIS
// =========================
function AnalysisTab({ cables, A, cableTypes, segments }) {
  const [view, setView] = useState('opt');
  return (
    <div className="space-y-2">
      <div className="bg-white p-2 rounded-xl shadow-sm grid grid-cols-4 gap-1 text-xs">
        {[['opt','Optimization'],['vd','ΔU'],['sc','Short-circuit'],['sel','Selectivity']].map(([k,l]) => (
          <button key={k} onClick={()=>setView(k)} className={`py-2 rounded ${view===k?'bg-stone-800 text-white':'text-stone-700'}`}>{l}</button>
        ))}
      </div>

      {view === 'opt' && (
        <>
          {A.opt.length === 0 ? (
            <div className="bg-green-50 p-4 rounded-xl shadow-sm text-center">
              <CheckCircle className="mx-auto text-green-700 mb-1" size={32}/>
              <div className="font-bold text-green-800">No issues</div>
              <div className="text-sm text-green-700">Alle kabler passerer dimensionering, ΔU og short-circuit.</div>
            </div>
          ) : A.opt.map((o, i) => (
            <div key={i} className={`p-3 rounded-xl shadow-sm ${o.severity==='CRITICAL'?'bg-red-50 border border-red-200':'bg-yellow-50 border border-yellow-200'}`}>
              <div className="flex items-center gap-2 mb-1">
                {o.severity==='CRITICAL' ? <AlertCircle className="text-red-600" size={18}/> : <AlertCircle className="text-yellow-600" size={18}/>}
                <span className="font-bold text-stone-800">{o.cable}</span>
                <Pill color={o.severity==='CRITICAL'?'#9C0006':'#9C5700'} bg={o.severity==='CRITICAL'?'#FFC7CE':'#FFEB9C'}>{o.severity}</Pill>
              </div>
              <div className="text-sm font-semibold text-stone-700">{o.issue}</div>
              <div className="text-xs text-stone-600 mt-1">{o.detail}</div>
              <div className="text-xs text-stone-700 mt-1">→ {o.rec}</div>
            </div>
          ))}
        </>
      )}

      {view === 'vd' && (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-stone-800 text-white"><tr><th className="p-2 text-left">Cable</th><th className="p-2">L</th><th className="p-2">ΔU local</th><th className="p-2">ΔU total</th><th className="p-2">Limit</th><th className="p-2"></th></tr></thead>
            <tbody>
              {cables.map(c => { const v = A.vd[c.id]; if (!v) return null; return (
                <tr key={c.id} className="border-b">
                  <td className="p-2 font-mono">{c.id}</td>
                  <td className="p-2 text-center">{v.length}m</td>
                  <td className="p-2 text-center">{v.du_local}%</td>
                  <td className="p-2 text-center font-semibold">{v.du_total}%</td>
                  <td className="p-2 text-center text-stone-500">{v.limit}%</td>
                  <td className="p-2"><StatusBadge status={v.status}/></td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      )}

      {view === 'sc' && (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-stone-800 text-white"><tr><th className="p-2 text-left">Cable</th><th className="p-2">MCB</th><th className="p-2">Z [mΩ]</th><th className="p-2">Ik</th><th className="p-2">Ia</th><th className="p-2"></th></tr></thead>
            <tbody>
              {cables.map(c => { const s = A.sc[c.id]; return (
                <tr key={c.id} className="border-b">
                  <td className="p-2 font-mono">{c.id}</td>
                  <td className="p-2 text-center">{s.mcb_type}</td>
                  <td className="p-2 text-center">{s.z_loop}</td>
                  <td className="p-2 text-center font-semibold">{s.ik_min}A</td>
                  <td className="p-2 text-center text-stone-500">{s.ia}A</td>
                  <td className="p-2"><StatusBadge status={s.status}/></td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      )}

      {view === 'sel' && (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-stone-800 text-white"><tr><th className="p-2 text-left">Upstream</th><th className="p-2">→</th><th className="p-2 text-left">Down</th><th className="p-2">In ratio</th><th className="p-2">Status</th></tr></thead>
            <tbody>
              {A.sel.map((s, i) => (
                <tr key={i} className="border-b">
                  <td className="p-2 font-mono">{s.upstream}</td>
                  <td className="p-2 text-center text-stone-400">→</td>
                  <td className="p-2 font-mono">{s.downstream}</td>
                  <td className="p-2 text-center font-semibold">{s.ratio}</td>
                  <td className="p-2 text-xs">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =========================
// DRAWING MODAL — interactive cable tray layout editor
// =========================
function DrawingModal({ close, goHome, segments, setSegments, nodes, setNodes, trayTypes, cables, setCables, cableTypes, bgImage, setBgImage, project, projectList, openTabs, activeProjectId, commitDraftAndSwitch, commitDraftAndCreate, closeTab, reorderTabs, renameProject, loadDrawingNodes, patchDrawingNode, collectUsedIds, saveAllDrawings, autoSave, toggleAutoSave }) {
  // local working state
  // Node shape: { x, y, kind: 'junction'|'board'|'load', ...meta }
  //   board meta: { board_type, In_main }
  //   load meta:  { function, V, phases, Ib, In, cos_phi }
  const [lNodes, setLNodes] = useState(() => {
    const auto = autoLayoutFromSegments(segments);
    const merged = {};
    Object.keys({ ...auto, ...nodes }).forEach(id => {
      const existing = nodes[id] || {};
      merged[id] = { x: (nodes[id]?.x ?? auto[id]?.x ?? 100), y: (nodes[id]?.y ?? auto[id]?.y ?? 100), kind: existing.kind || inferKind(id), ...existing };
    });
    return merged;
  });
  const [lSegs, setLSegs] = useState(() => ({ ...segments }));
  const [lCables, setLCables] = useState(() => [...(cables || [])]);
  const [lBg, setLBg] = useState(() => bgImage || null);  // { dataUrl, x, y, scale, opacity, name }
  // Keep the app-level background in sync with the editor, so every save path
  // (auto-save, project switch, create) uses the current background, never a stale one.
  useEffect(() => { if (setBgImage) setBgImage(lBg ? { ...lBg } : null); }, [lBg]);
  // Undo history — snapshots of {nodes, segs, cables}. lBg excluded (large data URLs).
  const undoStackRef = useRef([]);
  const isUndoingRef = useRef(false);
  const lastSnapRef = useRef('');
  const [canUndo, setCanUndo] = useState(false);
  const [bgBusy, setBgBusy] = useState(false);            // PDF rendering in progress
  const [bgPanel, setBgPanel] = useState(false);          // show background adjust panel
  const [storageInfo, setStorageInfo] = useState(null);   // { usedMB, quotaMB, persisted }
  useEffect(() => {
    if (!bgPanel) return;
    let alive = true;
    (async () => {
      try {
        let usedMB = null, quotaMB = null, persisted = null, backend = null;
        if (navigator.storage && navigator.storage.estimate) {
          const est = await navigator.storage.estimate();
          usedMB = est.usage != null ? est.usage / (1024*1024) : null;
          quotaMB = est.quota != null ? est.quota / (1024*1024) : null;
        }
        if (navigator.storage && navigator.storage.persisted) { persisted = await navigator.storage.persisted(); }
        try { backend = appStorage.backend ? await appStorage.backend() : null; } catch (e) {}
        if (alive) setStorageInfo({ usedMB, quotaMB, persisted, backend });
      } catch (e) { if (alive) setStorageInfo(null); }
    })();
    return () => { alive = false; };
  }, [bgPanel, lBg]);
  const [bgStatus, setBgStatus] = useState(null);         // visible status/error message
  const [hideChrome, setHideChrome] = useState(false);    // hide panels for more drawing space
  const [junctionShape, setJunctionShape] = useState('dot');  // dot|tee|corner|cross — chosen before placing
  const [junctionSize, setJunctionSize] = useState(14);       // arm length for new junctions (fixed-ish)
  // Global circle (end-cap) size — one value for ALL circles in ALL networks.
  const [circleSize, setCircleSize] = useState(() => {
    const v = Number(globalThis?.localStorage?.getItem?.('cable_app_circle_size'));
    return v >= 3 && v <= 20 ? v : 5;
  });
  const updateCircleSize = (v) => {
    setCircleSize(v);
    try { globalThis?.localStorage?.setItem?.('cable_app_circle_size', String(v)); } catch (e) {}
  };
  // Opacity per colour category (hex → 0..1) — mirrors per-segment opacity for the slider UI.
  const [catPanel, setCatPanel] = useState(false);            // show network-category panel
  const [showLegends, setShowLegends] = useState(false);      // show per-segment info legends
  const [addPanel, setAddPanel] = useState(false);            // "Tilføj nyt objekt" category bar open
  const [addCategory, setAddCategory] = useState(null);       // 'trays'|'boards'|'loads'|'cables'
  const [showTools, setShowTools] = useState(true);           // show/hide the view/navigation toolbar
  const [showTips, setShowTips] = useState(false);            // show/hide the edit-mode hint text below the toolbar
  const [collapsedBars, setCollapsedBars] = useState({});     // per-bar collapse: { header, category, nav, options }
  const [ctxMenu, setCtxMenu] = useState(null);               // right-click context menu {x,y} in screen px
  const [ctxSub, setCtxSub] = useState(null);                 // which submenu is hovered open
  const [ctxSub2, setCtxSub2] = useState(null);               // second-level submenu (e.g. tray shapes under Føringsveje)
  const [catEdit, setCatEdit] = useState(null);               // network id whose objects are being edited
  // Background images keep no lock flag — placed objects always stay fixed at
  // their world position regardless of how the background is scaled or moved.
  const [calibrating, setCalibrating] = useState(false);  // two-point scale calibration in progress
  const [calibPoints, setCalibPoints] = useState([]);     // world points clicked during calibration
  const [measuring, setMeasuring] = useState(false);      // measurement (press-drag) active
  const [measureResult, setMeasureResult] = useState(null); // {m, points:[p0,p1]}
  const measureDragRef = useRef(null);                       // active measure drag {x0,y0,pointerId}
  const measuringRef = useRef(false);                        // mirror of `measuring` for stable closures
  useEffect(() => { measuringRef.current = measuring; }, [measuring]);

  // Measurement uses window-level listeners while dragging, so the live line and
  // final result are captured no matter what the cursor passes over or which way
  // it is dragged — fully independent of SVG pointer-capture quirks. We call the
  // latest toSvg via a ref so the second (and later) measurements never use a
  // stale coordinate transform.
  const toSvgRef = useRef(null);
  useEffect(() => {
    if (!measuring) return;
    const onMove = (e) => {
      const md = measureDragRef.current;
      if (!md || !toSvgRef.current) return;
      // Stop the browser from selecting text/labels while dragging a measurement.
      if (e.cancelable) e.preventDefault();
      try { window.getSelection?.()?.removeAllRanges?.(); } catch (err) {}
      const p = toSvgRef.current(e.clientX, e.clientY);
      const px = Math.hypot(p.x - md.x0, p.y - md.y0);
      setMeasureResult({ m: px / PX_PER_M, points: [{ x: md.x0, y: md.y0 }, { x: p.x, y: p.y }] });
    };
    const onUp = (e) => {
      const md = measureDragRef.current;
      if (!md || !toSvgRef.current) return;
      measureDragRef.current = null;
      const p = toSvgRef.current(e.clientX, e.clientY);
      const px = Math.hypot(p.x - md.x0, p.y - md.y0);
      const meters = px / PX_PER_M;
      if (px < 3) { setMeasureResult(null); setBgStatus('Måling: træk fra punkt A til punkt B.'); return; }
      setMeasureResult({ m: meters, points: [{ x: md.x0, y: md.y0 }, { x: p.x, y: p.y }] });
      setBgStatus(`Målt afstand: ${meters.toFixed(2)} m`);
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [measuring]);
  const [calibDialog, setCalibDialog] = useState(null);   // { pixelDist } awaiting real distance input
  const [mode, setMode] = useState('edit'); // 'edit'(neutral)|'junction'|'board'|'load'|'connect'|'cable'
  const [connectFrom, setConnectFrom] = useState(null);
  const [cableFrom, setCableFrom] = useState(null);  // start node for cable routing
  const [cableMsg, setCableMsg] = useState(null);    // guidance/error in cable mode
  const [pendingCable, setPendingCable] = useState(null);  // { from, to, route }
  const [editCable, setEditCable] = useState(null);  // cable id being edited
  const [pending, setPending] = useState(null);     // pending new segment+cable
  const [editNode, setEditNode] = useState(null);
  const [selectedNodes, setSelectedNodes] = useState([]);   // multi-select (same kind only)
  const selectedNodesRef = useRef([]);                       // synchronous mirror for pointer handlers
  const [marquee, setMarquee] = useState(null);              // {x0,y0,x1,y1} in world coords while dragging
  const marqueeRef = useRef(null);                           // synchronous marquee state
  const dragTabRef = useRef(null);                           // id of the drawing tab being dragged
  const reservedIdsRef = useRef(new Set());                  // element IDs used by OTHER drawings (keep new IDs unique)
  const [dragOverTab, setDragOverTab] = useState(null);      // id of tab currently hovered during a drag
  const [renamingTab, setRenamingTab] = useState(null);      // { id, value } while renaming a tab inline
  const [linkDialog, setLinkDialog] = useState(null);        // { nodeId } when linking a node to another drawing
  const [multiEdit, setMultiEdit] = useState(null);         // { kind } when editing multiple
  const [editSeg, setEditSeg] = useState(null);       // segment being edited (dialog open)
  const [selectedSeg, setSelectedSeg] = useState(null);  // segment selected (shows bend handles)
  const [dragging, setDragging] = useState(null);   // node id being dragged
  const [moved, setMoved] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const svgRef = useRef(null);
  const lastTapRef = useRef(0);
  const nodeTapRef = useRef({ id: null, t: 0 });   // double-tap detection on nodes
  const nodeJustTappedRef = useRef(false);          // set on node tap so canvas-tap skips placing
  const segTapRef = useRef({ id: null, t: 0 });    // double-tap detection on segments
  const movedRef = useRef(false);
  const dragInfoRef = useRef(null);  // { id, offsetX, offsetY, pointerId }
  const panInfoRef = useRef(null);   // { startClientX, startClientY, startView, ... }
  // Multi-touch gesture (two-finger pan + pinch zoom)
  const pointersRef = useRef(new Map());  // pointerId -> { x, y } in client coords
  const gestureRef = useRef(null);        // { startDist, startMidX, startMidY, startView }

  // 1 m = 20 px at zoom 1
  const PX_PER_M = 20;
  const GRID_M = 1; // grid spacing in meters

  // Undo: capture a snapshot whenever nodes/segments/cables change (debounced via JSON compare)
  useEffect(() => {
    if (isUndoingRef.current) { isUndoingRef.current = false; return; }
    const snap = JSON.stringify({ n: lNodes, s: lSegs, c: lCables });
    if (snap === lastSnapRef.current) return;
    if (lastSnapRef.current) {
      undoStackRef.current.push(lastSnapRef.current);
      if (undoStackRef.current.length > 50) undoStackRef.current.shift();
      setCanUndo(true);
    }
    lastSnapRef.current = snap;
  }, [lNodes, lSegs, lCables]);

  const undo = () => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    isUndoingRef.current = true;
    const state = JSON.parse(prev);
    lastSnapRef.current = prev;
    setLNodes(state.n || {});
    setLSegs(state.s || {});
    setLCables(state.c || []);
    selectedNodesRef.current = [];
    setSelectedNodes([]);
    setSelectedSeg(null);
    setCanUndo(undoStackRef.current.length > 0);
  };

  // Map screen coords to SVG world coords using the SVG's own coordinate
  // transform matrix — exact regardless of viewBox aspect ratio / letterboxing.
  const toSvg = (clientX, clientY) => {
    const svg = svgRef.current; if (!svg) return { x:0, y:0 };
    try {
      const pt = svg.createSVGPoint();
      pt.x = clientX; pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const sp = pt.matrixTransform(ctm.inverse());
        return { x: sp.x, y: sp.y };
      }
    } catch (err) {}
    // Fallback: meet scaling with centering (letterbox-aware), matching pan math
    const r = svg.getBoundingClientRect();
    const scale = Math.min(r.width / bounds.w, r.height / bounds.h) || 1;
    const drawnW = bounds.w * scale, drawnH = bounds.h * scale;
    const offX = (r.width - drawnW) / 2, offY = (r.height - drawnH) / 2;
    return {
      x: bounds.x + (clientX - r.left - offX) / scale,
      y: bounds.y + (clientY - r.top - offY) / scale,
    };
  };
  const getPoint = (e) => {
    const t = e.touches?.[0] || e.changedTouches?.[0];
    return toSvg(t ? t.clientX : e.clientX, t ? t.clientY : e.clientY);
  };
  toSvgRef.current = toSvg;   // window measure listeners always call the latest transform
  const distM = (a, b) => Math.max(0.5, Math.round(Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2) / PX_PER_M * 2) / 2);

  // Canvas pointer down — track pointers, start pan (1 finger) or gesture (2 fingers)
  const onCanvasPointerDown = (e) => {
    // Right mouse button → pan the drawing in any mode (held-down drag)
    if (e.button === 2) {
      e.preventDefault();
      const svg = svgRef.current;
      try { svg?.setPointerCapture?.(e.pointerId); } catch (err) {}
      const r = svg.getBoundingClientRect();
      const scale = Math.min(r.width / bounds.w, r.height / bounds.h) || 1;
      const worldPerPx = scale > 0 ? 1 / scale : 1;
      panInfoRef.current = {
        startClientX: e.clientX, startClientY: e.clientY,
        startView: { ...bounds },
        worldPerPxX: worldPerPx, worldPerPxY: worldPerPx,
        pointerId: e.pointerId, rightClick: true,
      };
      // cancel any other in-progress interaction
      dragInfoRef.current = null;
      marqueeRef.current = null; setMarquee(null);
      movedRef.current = false;
      return;
    }

    // Track every pointer for multi-touch
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Measurement has top priority: a press starts/replaces a measure drag.
    // Window-level listeners (see effect above) handle move/up, so this is
    // direction- and element-proof. Reset every other interaction first.
    if (measuring && (e.button === 0 || e.pointerType !== 'mouse')) {
      gestureRef.current = null;
      panInfoRef.current = null;
      dragInfoRef.current = null;
      marqueeRef.current = null; setMarquee(null);
      setDragging(null);
      pointersRef.current.clear();
      const p = getPoint(e);
      measureDragRef.current = { x0: p.x, y0: p.y, pointerId: e.pointerId };
      setMeasureResult({ m: 0, points: [{ x: p.x, y: p.y }, { x: p.x, y: p.y }] });
      movedRef.current = true;   // suppress the click that follows the drag
      return;
    }

    // Two fingers down → start pinch/pan gesture, cancel any single-finger action
    // (never while measuring — measuring is strictly single-pointer)
    if (pointersRef.current.size === 2 && !measuring && !measureDragRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy) || 1;
      gestureRef.current = {
        startDist: dist,
        startMidX: (pts[0].x + pts[1].x) / 2,
        startMidY: (pts[0].y + pts[1].y) / 2,
        startView: { ...bounds },
      };
      // cancel single-finger drag/pan that may have started
      dragInfoRef.current = null;
      panInfoRef.current = null;
      setDragging(null);
      movedRef.current = true;
      return;
    }
    if (pointersRef.current.size > 2) return;

    // Left-button drag on empty canvas → rubber-band marquee.
    // Never start one on top of a shape, and not while wiring (connect/cable),
    // where taps pick nodes.
    const onShape = ['circle','rect','polygon','line','text','polyline','image'].includes(e.target?.tagName);
    if (!onShape && mode !== 'connect' && mode !== 'cable' && (e.button === 0 || e.pointerType !== 'mouse')) {
      const svg = svgRef.current;
      try { svg?.setPointerCapture?.(e.pointerId); } catch (err) {}
      const p = getPoint(e);
      marqueeRef.current = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, pointerId: e.pointerId, additive: e.shiftKey };
      setMarquee({ ...marqueeRef.current });
      movedRef.current = false;
      return;
    }
  };

  // Switch tool mode and clear any in-progress selections
  const switchMode = (m) => {
    // Toggle: clicking the already-active tool turns it off and returns to the
    // neutral 'edit' mode (select / move / edit, no placement).
    // "Tilføj nyt objekt" covers both junction placement and connect, so clicking
    // it while in either of those turns the whole tool off.
    const inAddTool = (mode === 'junction' || mode === 'connect');
    const next = (m === mode || (m === 'junction' && inAddTool)) ? 'edit' : m;
    setMode(next);
    setConnectFrom(null);
    setCableFrom(null);
    setCableMsg(null);
    marqueeRef.current = null; setMarquee(null);
    // Clear selection when entering a placement/wiring tool; keep it in edit mode
    if (next !== 'edit') { selectedNodesRef.current = []; setSelectedNodes([]); setSelectedSeg(null); }
  };

  // "Tilføj nyt objekt" (header button): open/close the category bar. Closing it
  // returns to the neutral edit mode.
  const toggleAddPanel = () => {
    if (addPanel) {
      setAddPanel(false);
      setAddCategory(null);
      switchMode('edit');
    } else {
      setAddPanel(true);
    }
  };
  // --- Per-bar collapse: double-click a bar to shrink it to a thin strip,
  // double-click the strip to bring the bar back. ---
  const toggleBar = (id) => setCollapsedBars(c => ({ ...c, [id]: !c[id] }));
  // Only collapse when double-clicking the bar's empty area, not a button/input.
  const onBarDbl = (e, id) => {
    if (e.target.closest && e.target.closest('button, label, input, select, a')) return;
    toggleBar(id);
  };
  // Thin collapsed-bar strip with a small grip; double-click to expand.
  const thinBar = (id, bg) => (
    <div key={'thin-' + id} onDoubleClick={() => toggleBar(id)}
         title="Dobbeltklik for at folde bjælken ud igen"
         className="border-b border-stone-200 flex items-center justify-center cursor-pointer"
         style={{ backgroundColor: bg, height: 7 }}>
      <div style={{ width: 32, height: 2, borderRadius: 2, backgroundColor: '#c4bba6' }} />
    </div>
  );
  // Pick a category in the add bar and activate the matching tool/mode.
  const selectAddCategory = (cat) => {
    setAddCategory(cat);
    if (cat === 'trays') setMode('junction');        // shapes + føringsvejssegment
    else if (cat === 'boards') setMode('board');
    else if (cat === 'loads') setMode('load');
    else if (cat === 'cables') setMode('cable');
    setConnectFrom(null); setCableFrom(null); setCableMsg(null);
    marqueeRef.current = null; setMarquee(null);
    selectedNodesRef.current = []; setSelectedNodes([]); setSelectedSeg(null);
  };

  // Multi-select: add/remove a node, but only within one category (kind).
  // Uses the ref as the source of truth so rapid taps in pointer handlers never
  // see a stale value (no upper limit on how many can be selected).
  const toggleSelectNode = (id) => {
    const prev = selectedNodesRef.current;
    const kind = lNodes[id]?.kind || 'junction';
    let next;
    if (prev.includes(id)) {
      next = prev.filter(x => x !== id);
    } else if (prev.length > 0 && (lNodes[prev[0]]?.kind || 'junction') !== kind) {
      // different category → start fresh
      next = [id];
    } else {
      next = [...prev, id];
    }
    selectedNodesRef.current = next;
    setSelectedNodes(next);
  };
  const clearSelection = () => { selectedNodesRef.current = []; setSelectedNodes([]); setSelectedSeg(null); };

  // Effective colour of a segment (manual override or auto from tray width)
  // Connected-network categories: tray segments form ONE category only when they meet
  // at a junction (knude). Boards (tavler) and loads are terminals — they do NOT merge
  // separate runs, even if several runs connect to the same board.
  // Returns: { networks: [{ id, segIds:[], nodeIds:Set, color, widths:Set, count }],
  //            segNet: { segId -> networkId } }
  const networkInfo = useMemo(() => {
    const kindOf = (nid) => lNodes[nid]?.kind || 'junction';
    // Union-Find over SEGMENT ids.
    const parent = {};
    const find = (x) => { while (parent[x] !== undefined && parent[x] !== x) { parent[x] = parent[parent[x]] ?? parent[x]; x = parent[x]; } return x; };
    const union = (a, b) => {
      if (parent[a] === undefined) parent[a] = a;
      if (parent[b] === undefined) parent[b] = b;
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };
    Object.keys(lSegs).forEach(id => { if (parent[id] === undefined) parent[id] = id; });
    // Segments that share the SAME junction node belong to the same category.
    const segsByJunction = {};
    Object.entries(lSegs).forEach(([id, s]) => {
      [s.from, s.to].forEach(nid => {
        if (nid && kindOf(nid) === 'junction') (segsByJunction[nid] = segsByJunction[nid] || []).push(id);
      });
    });
    Object.values(segsByJunction).forEach(list => { for (let i = 1; i < list.length; i++) union(list[0], list[i]); });
    // group segments by their root segment
    const groups = {};
    Object.entries(lSegs).forEach(([id, s]) => {
      const root = find(id);
      if (!groups[root]) groups[root] = { id: root, segIds: [], nodeIds: new Set(), widths: new Set(), explicitColors: [] };
      groups[root].segIds.push(id);
      groups[root].nodeIds.add(s.from); groups[root].nodeIds.add(s.to);
      const w = trayTypes[s.tray_type]?.width_mm;
      if (w) groups[root].widths.add(w);
      if (s.color) groups[root].explicitColors.push(s.color);
    });
    // determine each network's colour: explicit colour wins, else widest tray's width-colour
    const segNet = {};
    // Distinct default colour per network so unconnected runs are visually separable.
    // A stable hash of the network's root id picks from a palette. Explicit colour wins.
    const palette = ['#1565C0', '#2e7d32', '#c62828', '#f9a825', '#6a1b9a', '#00838f', '#37474F', '#e91e63', '#5d4037', '#0097a7', '#7b1fa2', '#ef6c00'];
    const hashIdx = (str) => { let h = 0; for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) >>> 0; } return h % palette.length; };
    const networks = Object.values(groups).map(g => {
      let color;
      if (g.explicitColors.length) color = g.explicitColors[g.explicitColors.length - 1];
      else color = palette[hashIdx(String(g.id))];
      g.segIds.forEach(sid => { segNet[sid] = g.id; });
      return { id: g.id, segIds: g.segIds, nodeIds: g.nodeIds, color, widths: g.widths, count: g.segIds.length };
    }).sort((a,b)=>b.count-a.count);
    return { networks, segNet, byId: Object.fromEntries(networks.map(n=>[n.id,n])) };
  }, [lSegs, trayTypes, lNodes]);

  // Colour shown for a segment = its network's colour (so connected = same colour)
  const segColor = (s, id) => {
    const netId = id ? networkInfo.segNet[id] : null;
    if (netId && networkInfo.byId[netId]) return networkInfo.byId[netId].color;
    return s.color || '#1565C0';
  };

  // Network categories for the panel (connected networks, each one colour)
  const colorCategories = useMemo(() => networkInfo.networks.map(n => ({
    id: n.id, color: n.color, count: n.count, widths: n.widths, segIds: n.segIds,
  })), [networkInfo]);

  // LS tracks present on each segment, derived from the cables routed through it.
  // LS1 = main feeders/ties/UPS; LS2 = loaded (Ib/Iz > threshold); LS3 = lightly loaded.
  const segLS = useMemo(() => {
    const lsThreshold = project?.ls_threshold ?? 0.30;
    const classify = (c) => {
      if (LS_MAIN.has(c.cable_function || c.function)) return 'LS1';
      const iz = cableTypes[c.cable_type]?.iz_a ?? 1;
      return ((c.Ib || 0) / iz) > lsThreshold ? 'LS2' : 'LS3';
    };
    const map = {};
    Object.keys(lSegs).forEach(sid => { map[sid] = new Set(); });
    (lCables || []).forEach(c => {
      const ls = classify(c);
      (c.route || []).forEach(sid => { if (map[sid]) map[sid].add(ls); });
    });
    return map;
  }, [lSegs, lCables, cableTypes, project]);

  // Orthogonalise: snap segments to horizontal/vertical based on their dominant axis.
  // We move node positions so connected segments become axis-aligned. Works on a set
  // of segment IDs. Uses a simple pass: for each segment, if it's closer to horizontal,
  // average the Y of its two endpoints; if vertical, average the X.
  const straightenSegments = (segIds) => {
    const ids = (segIds || []).filter(id => lSegs[id]);
    if (ids.length === 0) return;
    setLNodes(prevNodes => {
      const nodes = { ...prevNodes };
      // Several passes let shared nodes settle into consistent axis-aligned
      // positions across a connected network instead of locking too early.
      const PASSES = 4;
      for (let pass = 0; pass < PASSES; pass++) {
        ids.forEach(id => {
          const s = lSegs[id];
          if (!s) return;
          const a = nodes[s.from], b = nodes[s.to];
          if (!a || !b) return;
          const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
          if (dx >= dy) {
            // make horizontal → share a common Y (midpoint)
            const y = Math.round((a.y + b.y) / 2);
            nodes[s.from] = { ...nodes[s.from], y };
            nodes[s.to] = { ...nodes[s.to], y };
          } else {
            // make vertical → share a common X (midpoint)
            const x = Math.round((a.x + b.x) / 2);
            nodes[s.from] = { ...nodes[s.from], x };
            nodes[s.to] = { ...nodes[s.to], x };
          }
        });
      }
      return nodes;
    });
  };

  // Straighten one segment
  const straightenOne = (id) => straightenSegments([id]);
  // Straighten all segments of a connected network
  const straightenNetwork = (netId) => {
    const net = networkInfo.byId[netId];
    if (net) straightenSegments(net.segIds);
  };
  // Straighten everything
  const straightenAll = () => straightenSegments(Object.keys(lSegs));

  // Set opacity for a whole network — written onto each segment in the network
  const setNetworkOpacity = (netId, op) => {
    const net = networkInfo.byId[netId];
    if (!net) return;
    setLSegs(prev => {
      const next = { ...prev };
      net.segIds.forEach(id => { if (next[id]) next[id] = { ...next[id], opacity: op }; });
      return next;
    });
    // Apply the same opacity to all nodes (junctions, boards, loads) in the network
    setLNodes(prev => {
      const next = { ...prev };
      net.nodeIds.forEach(nid => { if (next[nid]) next[nid] = { ...next[nid], opacity: op }; });
      return next;
    });
  };

  // Set colour for a whole network — propagates to every segment in it
  const setNetworkColor = (netId, color) => {
    const net = networkInfo.byId[netId];
    if (!net) return;
    setLSegs(prev => {
      const next = { ...prev };
      net.segIds.forEach(id => { if (next[id]) next[id] = { ...next[id], color: color || undefined }; });
      return next;
    });
  };

  // Set a common tray type (and thus width) on all segments in a network
  const setNetworkTrayType = (netId, tray_type) => {
    const net = networkInfo.byId[netId];
    if (!net) return;
    setLSegs(prev => {
      const next = { ...prev };
      net.segIds.forEach(id => { if (next[id]) next[id] = { ...next[id], tray_type }; });
      return next;
    });
  };

  // Set a common size on all junction nodes in a network
  const setNetworkNodeSize = (netId, size) => {
    const net = networkInfo.byId[netId];
    if (!net) return;
    setLNodes(prev => {
      const next = { ...prev };
      net.nodeIds.forEach(nid => {
        if (next[nid] && (next[nid].kind || 'junction') === 'junction') next[nid] = { ...next[nid], size };
      });
      return next;
    });
  };

  // Canvas tap — place node of the active kind
  const onCanvasTap = (e) => {
    // If the click landed on an existing node, it was handled as a selection;
    // never place a new object on top of it.
    if (nodeJustTappedRef.current) { nodeJustTappedRef.current = false; return; }
    // Debounce: ignore a second event within 300ms (touch fires touchend + click)
    const now = Date.now();
    if (now - lastTapRef.current < 300) return;
    lastTapRef.current = now;
    if (movedRef.current || dragging) { movedRef.current = false; setMoved(false); return; }
    if (e.target.tagName === 'circle' || e.target.tagName === 'rect' || e.target.tagName === 'line' || e.target.tagName === 'text' || e.target.tagName === 'polygon' || e.target.tagName === 'polyline') return;
    // Tapping empty canvas clears any segment selection
    if (selectedSeg) setSelectedSeg(null);
    const p = getPoint(e);
    // Scale calibration: collect two points, then ask for the real-world distance
    if (calibrating) {
      const pts = [...calibPoints, { x: p.x, y: p.y }];
      if (pts.length >= 2) {
        const pixelDist = Math.sqrt((pts[0].x-pts[1].x)**2 + (pts[0].y-pts[1].y)**2);
        setCalibPoints(pts);
        setCalibDialog({ pixelDist });
        setCalibrating(false);
      } else {
        setCalibPoints(pts);
      }
      return;
    }
    if (mode === 'junction' || mode === 'board' || mode === 'load') {
      const id = genNodeId(mode);
      const base = { x: Math.round(p.x), y: Math.round(p.y), kind: mode };
      if (mode === 'board') { base.board_type = 'Sub-board'; base.In_main = 0; base.size = 14; }
      if (mode === 'load') { base.function = 'Socket circuit'; base.V = 230; base.phases = 1; base.Ib = 0; base.In = 0; base.cos_phi = 0.9; base.size = 14; }
      if (mode === 'junction') { base.shape = junctionShape; base.size = junctionSize; base.rotation = 0; }  // dot|tee|corner
      setLNodes({ ...lNodes, [id]: base });
      // auto-open editor for boards/loads so user can fill in details
      if (mode === 'board' || mode === 'load') setEditNode(id);
    } else if (mode === 'connect') {
      setConnectFrom(null);
    } else if (mode === 'cable') {
      setCableFrom(null);
    }
  };

  const onNodeTap = (e, id) => {
    e.stopPropagation();
    if (movedRef.current) { movedRef.current = false; setMoved(false); return; }
    // Tap/double-tap (select, edit) is handled in pointer-up, which is reliable
    // with pointer capture. Only connect/cable wiring is handled here.
    if (mode !== 'connect' && mode !== 'cable') return;
    if (mode === 'connect') {
      if (!connectFrom) setConnectFrom(id);
      else if (connectFrom === id) setConnectFrom(null);
      else {
        const L = distM(lNodes[connectFrom], lNodes[id]);
        // Connect mode only creates tray segments (føringsveje).
        // Cables are created separately in Kabel mode with strict endpoint rules.
        setPending({
          from: connectFrom, to: id, length_m: L,
          tray_type: Object.keys(trayTypes)[0],
        });
        setConnectFrom(null);
      }
    } else if (mode === 'cable') {
      const node = lNodes[id];
      const kind = node.kind || 'junction';
      if (!cableFrom) {
        // Start must be a board (cables originate at a distribution board)
        if (kind !== 'board') {
          setCableMsg('Kablet skal starte ved en tavle. Tap en tavle (rektangel).');
          return;
        }
        setCableMsg(null);
        setCableFrom(id);
      } else if (cableFrom === id) {
        setCableFrom(null);
      } else {
        // End must be a board or a load — never a junction (junctions are
        // direction-change points in the tray, not electrical endpoints)
        if (kind === 'junction') {
          setCableMsg('Kabler kan ikke ende i et knudepunkt. Vælg en tavle eller en last.');
          return;
        }
        setCableMsg(null);
        const route = findRoute(lSegs, cableFrom, id);
        // When the destination is a load, the cable adopts the load's electrical data.
        // When it is a board WITH a specified consumption, adopt that so the feeding
        // main cable can be dimensioned without modelling individual loads.
        const isLoad = kind === 'load';
        const boardHasLoad = kind === 'board' && Number(node.Ib) > 0;
        setPendingCable({
          from: cableFrom, to: id, route: route || [], noPath: route === null,
          toKind: kind,
          cable_type: Object.keys(cableTypes)[0],
          cable_function: isLoad ? (node.function || 'Socket circuit') : 'Sub-board feeder',
          Ib: isLoad ? (node.Ib || 0) : (boardHasLoad ? Number(node.Ib) : 0),
          In: isLoad ? (node.In || 0) : (boardHasLoad ? Number(node.In_main || 0) : 0),
          V: isLoad ? (node.V || 230) : (boardHasLoad ? Number(node.V || 400) : 400),
          phases: isLoad ? (node.phases || 1) : (boardHasLoad ? Number(node.phases || 3) : 3),
          cos_phi: isLoad ? (node.cos_phi || 0.9) : (boardHasLoad ? Number(node.cos_phi || 0.9) : 0.9),
          adoptedFromLoad: isLoad || boardHasLoad,
        });
        setCableFrom(null);
      }
    }
  };

  // Double-click opens the editor in any mode (mouse)
  const onNodeDouble = (e, id) => {
    e.stopPropagation();
    const sel = selectedNodesRef.current;
    if (sel.length > 1 && sel.includes(id)) setMultiEdit({ kind: lNodes[sel[0]]?.kind || 'junction' });
    else setEditNode(id);
  };
  const onSegDouble = (e, id) => {
    e.stopPropagation();
    setEditSeg(id);
  };

  const onSegTap = (e, id) => {
    e.stopPropagation();
    if (movedRef.current) { movedRef.current = false; return; }
    if (mode === 'connect' || mode === 'cable') return;
    // Double-tap/double-click opens the edit dialog (any mode)
    const now = Date.now();
    if (segTapRef.current.id === id && now - segTapRef.current.t < 350) {
      segTapRef.current = { id: null, t: 0 };
      setEditSeg(id);
      return;
    }
    segTapRef.current = { id, t: now };
    // A single tap selects the segment (shows bend handles)
    setSelectedSeg(id);
  };

  // Drag node — pointer capture on the SVG root, move/up handled at root level.
  // Runs in (almost) every mode so double-tap edit and dragging work everywhere.
  const startDrag = (e, id) => {
    // Right-click a node: make sure it's selected (so the context menu can act on
    // it), then let the event bubble so the canvas opens the menu.
    if (e.button === 2) {
      if (!selectedNodesRef.current.includes(id)) {
        const kind = lNodes[id]?.kind || 'junction';
        selectedNodesRef.current = [id];
        setSelectedNodes([id]);
        setSelectedSeg(null);
      }
      return;
    }
    // While measuring, never grab a node — let the canvas handle the measure drag.
    if (measuring) return;
    // In connect/cable mode a tap (onClick → onNodeTap) picks nodes. Stop the
    // pointer-down from bubbling so the canvas doesn't start a marquee/capture
    // the pointer (which would swallow the node's click).
    if (mode === 'connect' || mode === 'cable') { e.stopPropagation(); return; }
    e.stopPropagation();
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // If a second finger is already down, let the gesture handler take over
    if (pointersRef.current.size >= 2) return;
    const svg = svgRef.current;
    try { svg?.setPointerCapture?.(e.pointerId); } catch (err) {}
    const p = getPoint(e);
    dragInfoRef.current = { id, offsetX: p.x - lNodes[id].x, offsetY: p.y - lNodes[id].y, startX: p.x, startY: p.y, startClientX: e.clientX, startClientY: e.clientY, pointerId: e.pointerId, canMove: true };
    movedRef.current = false;
    setDragging(id);
  };

  // Drag a waypoint (bend point) on a segment
  const startWaypointDrag = (e, segId, wi) => {
    if (mode !== 'edit') return;
    e.stopPropagation();
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size >= 2) return;
    const svg = svgRef.current;
    try { svg?.setPointerCapture?.(e.pointerId); } catch (err) {}
    const p = getPoint(e);
    const wp = lSegs[segId]?.waypoints?.[wi];
    if (!wp) return;
    dragInfoRef.current = { kind: 'waypoint', segId, wi, offsetX: p.x - wp.x, offsetY: p.y - wp.y, startX: p.x, startY: p.y, pointerId: e.pointerId };
    movedRef.current = false;
    setDragging(`${segId}:wp${wi}`);
  };

  // Drag the rotation handle on a T-piece / corner to rotate freely 0–360°
  const startRotateDrag = (e, id) => {
    if (mode !== 'edit') return;
    e.stopPropagation();
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size >= 2) return;
    const svg = svgRef.current;
    try { svg?.setPointerCapture?.(e.pointerId); } catch (err) {}
    dragInfoRef.current = { kind: 'rotate', id, pointerId: e.pointerId };
    movedRef.current = false;
    setDragging(`${id}:rot`);
  };
  // These are attached to the SVG root, so they fire no matter where the pointer is
  const onCanvasPointerMove = (e) => {
    // Update tracked pointer position
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Rubber-band marquee selection
    if (marqueeRef.current && marqueeRef.current.pointerId === e.pointerId) {
      const p = getPoint(e);
      marqueeRef.current = { ...marqueeRef.current, x1: p.x, y1: p.y };
      setMarquee({ ...marqueeRef.current });
      movedRef.current = true;
      return;
    }

    // Two-finger gesture: pinch-zoom + pan (highest priority)
    const g = gestureRef.current;
    if (g && !measuring && !measureDragRef.current && pointersRef.current.size >= 2) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy) || 1;
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const svg = svgRef.current;
      const r = svg.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;

      // Scale: fingers spreading (dist > startDist) → zoom in → smaller viewBox
      const scale = g.startDist / dist;  // >1 means zoom out, <1 means zoom in
      const sv = g.startView;
      let nw = sv.w * scale;
      let nh = sv.h * scale;
      // clamp
      nw = Math.max(50, Math.min(40000, nw));
      nh = Math.max(50, Math.min(40000, nh));

      // World point under the gesture midpoint should stay put while zooming.
      // Convert start midpoint (screen) to world using the start view.
      const worldMidX = sv.x + ((g.startMidX - r.left) / r.width) * sv.w;
      const worldMidY = sv.y + ((g.startMidY - r.top) / r.height) * sv.h;
      // Pan: how far the midpoint moved in screen px, converted to world
      const panDxWorld = ((midX - g.startMidX) / r.width) * nw;
      const panDyWorld = ((midY - g.startMidY) / r.height) * nh;
      // New origin so worldMid stays under the (moved) finger midpoint
      const fracX = (g.startMidX - r.left) / r.width;
      const fracY = (g.startMidY - r.top) / r.height;
      const nx = worldMidX - fracX * nw - panDxWorld;
      const ny = worldMidY - fracY * nh - panDyWorld;
      setVbox({ x: nx, y: ny, w: nw, h: nh });
      movedRef.current = true;
      return;
    }

    // Node dragging
    const di = dragInfoRef.current;
    if (di) {
      const p = getPoint(e);
      if (di.kind === 'rotate') {
        const node = lNodes[di.id];
        if (!node) return;
        const ang = Math.atan2(p.y - node.y, p.x - node.x) * 180 / Math.PI;
        const deg = Math.round((ang + 90 + 360) % 360);
        setLNodes(prev => ({ ...prev, [di.id]: { ...prev[di.id], rotation: deg } }));
        movedRef.current = true;
        return;
      }
      // Ignore sub-threshold jitter so a tap isn't mistaken for a drag.
      // Measure in screen pixels (zoom-independent) using the tracked client coords.
      if (!movedRef.current && di.startClientX !== undefined) {
        const moveDistPx = Math.hypot(e.clientX - di.startClientX, e.clientY - di.startClientY);
        if (moveDistPx < 6) return;
      }
      if (di.kind === 'waypoint') {
        const nx = Math.round(p.x - di.offsetX);
        const ny = Math.round(p.y - di.offsetY);
        setLSegs(prev => {
          const seg = prev[di.segId];
          if (!seg || !seg.waypoints) return prev;
          const wps = seg.waypoints.map((w, i) => i === di.wi ? { x: nx, y: ny } : w);
          return { ...prev, [di.segId]: { ...seg, waypoints: wps } };
        });
        movedRef.current = true;
        return;
      }
      const nx = Math.round(p.x - di.offsetX);
      const ny = Math.round(p.y - di.offsetY);
      if (di.canMove) {
        setLNodes(prev => ({ ...prev, [di.id]: { ...prev[di.id], x: nx, y: ny } }));
      }
      movedRef.current = true;
      return;
    }
    // Single-finger pan
    const pi = panInfoRef.current;
    if (pi) {
      const dxPx = e.clientX - pi.startClientX;
      const dyPx = e.clientY - pi.startClientY;
      setVbox({
        x: pi.startView.x - dxPx * pi.worldPerPxX,
        y: pi.startView.y - dyPx * pi.worldPerPxY,
        w: pi.startView.w,
        h: pi.startView.h,
      });
      movedRef.current = true;
      return;
    }
  };
  const onCanvasPointerUp = (e) => {
    const svg = svgRef.current;
    // (Measurement up is handled by window-level listeners.)
    // Finish a rubber-band marquee: select all same-category nodes inside the box
    if (marqueeRef.current && marqueeRef.current.pointerId === e.pointerId) {
      const m = marqueeRef.current;
      marqueeRef.current = null;
      setMarquee(null);
      try { svg?.releasePointerCapture?.(e.pointerId); } catch (err) {}
      pointersRef.current.delete(e.pointerId);
      const xMin = Math.min(m.x0, m.x1), xMax = Math.max(m.x0, m.x1);
      const yMin = Math.min(m.y0, m.y1), yMax = Math.max(m.y0, m.y1);
      // tiny box = treat as a click that clears selection
      if (Math.abs(xMax - xMin) < 4 && Math.abs(yMax - yMin) < 4) {
        if (!m.additive) { selectedNodesRef.current = []; setSelectedNodes([]); }
        return;
      }
      // gather nodes inside the box
      const inside = Object.entries(lNodes)
        .filter(([id, n]) => n.x >= xMin && n.x <= xMax && n.y >= yMin && n.y <= yMax)
        .map(([id]) => id);
      // enforce single-category rule: pick the most common kind in the box
      const start = m.additive ? selectedNodesRef.current.slice() : [];
      const baseKind = start.length ? (lNodes[start[0]]?.kind || 'junction') : null;
      let result = start;
      const counts = {};
      inside.forEach(id => { const k = lNodes[id]?.kind || 'junction'; counts[k] = (counts[k]||0)+1; });
      const dominantKind = baseKind || Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0];
      if (dominantKind) {
        inside.forEach(id => {
          const k = lNodes[id]?.kind || 'junction';
          if (k === dominantKind && !result.includes(id)) result.push(id);
        });
      }
      selectedNodesRef.current = result;
      setSelectedNodes(result);
      return;
    }
    // Remove this pointer from tracking
    pointersRef.current.delete(e.pointerId);
    // End gesture when fewer than 2 fingers remain
    if (gestureRef.current && pointersRef.current.size < 2) {
      gestureRef.current = null;
      try { svg?.releasePointerCapture?.(e.pointerId); } catch (err) {}
      lastTapRef.current = Date.now();
      return;
    }

    const di = dragInfoRef.current;
    const pi = panInfoRef.current;
    if (di) {
      try { svg?.releasePointerCapture?.(e.pointerId); } catch (err) {}
      // If a waypoint was dragged, update the segment's stored length to the chain length
      if (di.kind === 'waypoint') {
        if (movedRef.current) {
          setLSegs(prev => {
            const seg = prev[di.segId];
            if (!seg) return prev;
            const a = lNodes[seg.from], b = lNodes[seg.to];
            if (!a || !b) return prev;
            const chain = [a, ...(seg.waypoints || []), b];
            let px = 0;
            for (let i = 0; i < chain.length - 1; i++) px += Math.hypot(chain[i+1].x - chain[i].x, chain[i+1].y - chain[i].y);
            return { ...prev, [di.segId]: { ...seg, length_m: Math.round(px / PX_PER_M * 10) / 10 } };
          });
        }
      } else if (!movedRef.current) {
        // A tap (no drag) on a node.
        const now = Date.now();
        const isDouble = nodeTapRef.current.id === di.id && now - nodeTapRef.current.t < 400;
        if (isDouble) {
          nodeTapRef.current = { id: null, t: 0 };
          // Double-tap opens the editor in ANY mode. If the node is part of a
          // multi-selection, edit all selected objects together.
          const sel = selectedNodesRef.current;
          if (sel.length > 1 && sel.includes(di.id)) {
            setMultiEdit({ kind: lNodes[sel[0]]?.kind || 'junction' });
          } else {
            setEditNode(di.id);
          }
        } else {
          nodeTapRef.current = { id: di.id, t: now };
          if (mode === 'edit') {
            // Neutral edit mode: clicking objects one by one builds up a
            // multi-selection (same-category rule applies). Clicking an already
            // selected object removes it again.
            toggleSelectNode(di.id);
          } else if (mode !== 'connect' && mode !== 'cable') {
            // Placement modes: a plain click selects just that object;
            // shift-click toggles membership.
            const prev = selectedNodesRef.current;
            if (e.shiftKey) {
              toggleSelectNode(di.id);
            } else if (prev.length === 1 && prev[0] === di.id) {
              selectedNodesRef.current = []; setSelectedNodes([]);
            } else {
              selectedNodesRef.current = [di.id]; setSelectedNodes([di.id]);
            }
          }
        }
      }
      dragInfoRef.current = null;
      setDragging(null);
      // Mark the time so the SVG's onClick (onCanvasTap) debounce skips placing a
      // new object — a click that lands on an existing node must only select it,
      // never drop a new object on top.
      lastTapRef.current = Date.now();
      nodeJustTappedRef.current = true;
      return;
    }
    if (pi) {
      try { svg?.releasePointerCapture?.(e.pointerId); } catch (err) {}
      panInfoRef.current = null;
      // (Right-click menu is opened reliably via the native onContextMenu event.)
      if (movedRef.current) lastTapRef.current = Date.now();
      return;
    }
  };

  const confirmPending = () => {
    const segId = genSegId();
    const newSegs = { ...lSegs, [segId]: { from: pending.from, to: pending.to, length_m: Number(pending.length_m), tray_type: pending.tray_type } };
    setLSegs(newSegs);
    // If this connects a board to a load (either direction), auto-create a cable
    // with the shortest route through existing trays and adopt the load's data.
    const a = lNodes[pending.from], b = lNodes[pending.to];
    const aKind = a?.kind || 'junction', bKind = b?.kind || 'junction';
    let boardId = null, loadId = null, loadNode = null;
    if (aKind === 'board' && bKind === 'load') { boardId = pending.from; loadId = pending.to; loadNode = b; }
    else if (bKind === 'board' && aKind === 'load') { boardId = pending.to; loadId = pending.from; loadNode = a; }
    if (boardId && loadId) {
      const route = findRoute(newSegs, boardId, loadId);
      const cid = genCableId();
      setLCables([...lCables, {
        id: cid, from: boardId, to: loadId,
        function: loadNode.function || 'Socket circuit',
        V: Number(loadNode.V ?? 230), phases: Number(loadNode.phases ?? 1),
        cable_type: Object.keys(cableTypes)[0],
        Ib: Number(loadNode.Ib ?? 0), In: Number(loadNode.In ?? 0),
        cos_phi: Number(loadNode.cos_phi ?? 0.9),
        route: route || [],
        autoCreated: true,
      }]);
    }
    setPending(null);
  };

  const confirmPendingCable = () => {
    const id = genCableId();
    setLCables([...lCables, {
      id, from: pendingCable.from, to: pendingCable.to,
      function: pendingCable.cable_function,
      V: Number(pendingCable.V), phases: Number(pendingCable.phases),
      cable_type: pendingCable.cable_type,
      Ib: Number(pendingCable.Ib), In: Number(pendingCable.In),
      cos_phi: Number(pendingCable.cos_phi),
      route: pendingCable.route || [],
    }]);
    setPendingCable(null);
  };
  const deleteCable = (cid) => { setLCables(lCables.filter(c => c.id !== cid)); setEditCable(null); };
  const updateCable = (cid, data) => { setLCables(lCables.map(c => c.id === cid ? { ...c, ...data } : c)); };

  // ---- Drawing tabs: switch between open drawings without losing edits ----
  const draftSnapshot = () => ({
    nodes: lNodes, segments: lSegs, cables: lCables,
    bgImage: lBg ? { ...lBg } : null,
  });

  const save = async () => {
    // Commit the current draft into live app state…
    setNodes(lNodes); setSegments(lSegs); setCables(lCables);
    setBgImage(lBg ? { ...lBg } : null);
    // …and persist every drawing (active draft + index) to storage.
    if (saveAllDrawings) { try { await saveAllDrawings(draftSnapshot()); } catch (e) {} }
    close();
  };

  const switchToTab = (id) => {
    if (id === activeProjectId) return;
    commitDraftAndSwitch?.(draftSnapshot(), id);
    // DrawingModal is keyed by activeProjectId at the app level, so it remounts
    // with the newly-loaded drawing's data automatically.
  };
  const newTab = () => {
    commitDraftAndCreate?.(draftSnapshot());
  };
  // Close (not delete) a drawing tab. Saves the active draft first so nothing is
  // lost, then hides the tab. The drawing stays available in the Project menu.
  const onCloseTab = (e, id) => {
    e.stopPropagation();
    if (id === activeProjectId) {
      try { saveAllDrawings && saveAllDrawings(draftSnapshot()); } catch (err) {}
    }
    closeTab?.(id);
  };

  // Auto-save: when enabled, push local edits to app state on every change
  // (debounced). The app-level effect then persists them to storage.
  useEffect(() => {
    if (!autoSave) return;
    const t = setTimeout(() => {
      setNodes(lNodes); setSegments(lSegs); setCables(lCables);
      setBgImage(lBg ? { ...lBg } : null);
    }, 600);
    return () => clearTimeout(t);
  }, [lNodes, lSegs, lCables, lBg, autoSave]);

  // ---- Background image (PDF / image) handling ----
  const loadPdfJs = () => new Promise((resolve, reject) => {
    if (window.pdfjsLib) return resolve(window.pdfjsLib);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      } catch (e) { reject(e); }
    };
    s.onerror = () => reject(new Error('Kunne ikke indlæse PDF-bibliotek'));
    document.body.appendChild(s);
  });

  const onBgFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) { setBgStatus('Ingen fil valgt.'); return; }
    setBgStatus(`Valgt: ${file.name} (${Math.round(file.size/1024)} KB)`);
    setBgBusy(true);
    try {
      let dataUrl;
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      const isImg = (file.type && file.type.startsWith('image/')) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name);
      let pdfFit = null;   // world-pixels per PDF-point — lets a 1:R ratio set a true scale
      if (isPdf) {
        setBgStatus('Indlæser PDF-bibliotek …');
        const pdfjsLib = await loadPdfJs();
        setBgStatus('Læser PDF …');
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        const page = await pdf.getPage(1);
        const base = page.getViewport({ scale: 1 });
        // Render at the highest resolution that still fits the storage budget, so the
        // plan stays sharp when zooming in. Step down only if the JPEG gets too large.
        const BUDGET = 0.95 * 1024 * 1024;                    // ~0.95 MB — keeps drawings small so ~5 fit in localStorage
        const targets = [2600, 2100, 1700, 1300];             // long-edge px, high → low
        for (let i = 0; i < targets.length; i++) {
          const fit = Math.min(2, targets[i] / Math.max(base.width, base.height));
          const viewport = page.getViewport({ scale: fit > 0 ? fit : 1 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';                          // white base (JPEG has no transparency)
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          setBgStatus(`Gengiver PDF i høj opløsning (${canvas.width}×${canvas.height}) …`);
          await page.render({ canvasContext: ctx, viewport }).promise;
          const url = canvas.toDataURL('image/jpeg', 0.8);
          pdfFit = fit;
          if (url.length * 0.75 <= BUDGET || i === targets.length - 1) { dataUrl = url; break; }
        }
      } else if (isImg) {
        setBgStatus('Læser billede …');
        const raw = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = () => rej(new Error('FileReader fejl'));
          r.readAsDataURL(file);
        });
        // Keep the original if it's already a reasonable size; otherwise re-encode at
        // the highest resolution that still fits the storage budget (sharper when zoomed).
        dataUrl = await new Promise((res) => {
          const im = new Image();
          im.onload = () => {
            const BUDGET = 0.95 * 1024 * 1024;
            const longest = Math.max(im.naturalWidth, im.naturalHeight);
            if (longest <= 2600 && raw.length * 0.75 <= BUDGET) { res(raw); return; }
            const targets = [2600, 2100, 1700, 1300];
            for (let i = 0; i < targets.length; i++) {
              const k = Math.min(1, targets[i] / longest);
              const cv = document.createElement('canvas');
              cv.width = Math.round(im.naturalWidth * k);
              cv.height = Math.round(im.naturalHeight * k);
              const cx = cv.getContext('2d');
              cx.fillStyle = '#ffffff';
              cx.fillRect(0, 0, cv.width, cv.height);
              cx.drawImage(im, 0, 0, cv.width, cv.height);
              const url = cv.toDataURL('image/jpeg', 0.8);
              if (url.length * 0.75 <= BUDGET || i === targets.length - 1) { res(url); return; }
            }
            res(raw);
          };
          im.onerror = () => res(raw);
          im.src = raw;
        });
      } else {
        setBgStatus(`Filtype ikke understøttet: "${file.type || file.name}". Vælg PDF, PNG eller JPG.`);
        setBgBusy(false);
        return;
      }
      // Determine natural size to set initial scale
      const img = new Image();
      img.onload = () => {
        const sizeMB = (dataUrl.length * 0.75) / (1024 * 1024);
        setLBg({
          dataUrl,
          x: 0, y: 0,
          w: img.naturalWidth, h: img.naturalHeight,
          scale: 1,
          opacity: 0.5,
          name: file.name,
          pdfFit: pdfFit || undefined,
        });
        setBgBusy(false);
        setBgPanel(true);
        setBgStatus(sizeMB > 4
          ? `Tilføjet (~${sizeMB.toFixed(1)} MB — stort, gemmes måske ikke på Vercel)`
          : `Tegningsgrundlag tilføjet (${img.naturalWidth}×${img.naturalHeight} px)`);
      };
      img.onerror = () => { setBgBusy(false); setBgStatus('Kunne ikke vise billedet (ugyldig data).'); };
      img.src = dataUrl;
    } catch (err) {
      setBgBusy(false);
      setBgStatus('Fejl: ' + (err && err.message ? err.message : String(err)));
    }
  };

  const removeBg = () => { setLBg(null); setBgPanel(false); };
  const updateBg = (patch) => setLBg(b => b ? { ...b, ...patch } : b);
  const cancel = () => {
    const changed = JSON.stringify(lNodes) !== JSON.stringify(nodes) ||
                    JSON.stringify(lSegs) !== JSON.stringify(segments) ||
                    JSON.stringify(lCables) !== JSON.stringify(cables) ||
                    JSON.stringify(lBg) !== JSON.stringify(bgImage);
    if (changed && !safeConfirm('Kasser ændringer?')) return;
    close();
  };

  // Compute content bounds (for initial fit and Fit button)
  // Connection anchor on a node: for T-pieces and corners, return the arm-end
  // facing `toward`; for dots/boards/loads, return the centre.
  const nodeAnchor = (node, toward) => {
    const kind = node.kind || 'junction';
    if (kind !== 'junction') return { x: node.x, y: node.y };
    const shape = node.shape || 'dot';
    if (shape === 'dot') return { x: node.x, y: node.y };
    const sz = node.size || 14;
    const rot = ((node.rotation || 0) * Math.PI) / 180;
    // arm-end unit directions in local (unrotated) space
    let arms;
    if (shape === 'tee') {
      arms = [ {x:-1,y:0}, {x:1,y:0}, {x:0,y:1} ];   // left, right, down
    } else if (shape === 'cross') {
      arms = [ {x:-1,y:0}, {x:1,y:0}, {x:0,y:-1}, {x:0,y:1} ];  // left, right, up, down
    } else { // corner
      arms = [ {x:-1,y:0}, {x:0,y:1} ];               // left, down
    }
    // rotate arms and turn into absolute points
    const pts = arms.map(d => {
      const rx = d.x * Math.cos(rot) - d.y * Math.sin(rot);
      const ry = d.x * Math.sin(rot) + d.y * Math.cos(rot);
      return { x: node.x + rx * sz, y: node.y + ry * sz };
    });
    // pick the arm-end nearest to the toward point
    let best = pts[0], bd = Infinity;
    for (const p of pts) {
      const d = (p.x - toward.x)**2 + (p.y - toward.y)**2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };

  const contentBounds = useMemo(() => {
    const ps = Object.values(lNodes);
    if (ps.length === 0) return { x:0, y:0, w:1000, h:700 };
    const xs = ps.map(p=>p.x), ys = ps.map(p=>p.y);
    const minX = Math.min(...xs) - 80, minY = Math.min(...ys) - 80;
    const maxX = Math.max(...xs) + 80, maxY = Math.max(...ys) + 80;
    return { x: minX, y: minY, w: Math.max(maxX - minX, 400), h: Math.max(maxY - minY, 300) };
  }, [lNodes]);

  // The actual viewBox is explicit state, initialised to content bounds.
  // vbox = { x, y, w, h } in world units. Zoom shrinks w/h, pan shifts x/y.
  const [vbox, setVbox] = useState(null);
  // Initialise once nodes exist
  useEffect(() => {
    if (vbox === null) setVbox({ ...contentBounds });
  }, [contentBounds, vbox]);
  const rawBounds = vbox || contentBounds;
  // Expand the viewBox to match the container's aspect ratio so the SVG renders
  // with no letterbox offset. This keeps screen↔world coordinate mapping exact
  // and identical for placing, marquee selection and measuring.
  const [svgAspect, setSvgAspect] = useState(null);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSvgAspect(r.width / r.height);
    };
    measure();
    const ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const bounds = (() => {
    if (!svgAspect) return rawBounds;
    const vbAspect = rawBounds.w / rawBounds.h;
    if (Math.abs(vbAspect - svgAspect) < 0.001) return rawBounds;
    if (vbAspect < svgAspect) {
      // container is wider → widen the viewBox, keep centre
      const newW = rawBounds.h * svgAspect;
      return { x: rawBounds.x - (newW - rawBounds.w) / 2, y: rawBounds.y, w: newW, h: rawBounds.h };
    } else {
      // container is taller → heighten the viewBox, keep centre
      const newH = rawBounds.w / svgAspect;
      return { x: rawBounds.x, y: rawBounds.y - (newH - rawBounds.h) / 2, w: rawBounds.w, h: newH };
    }
  })();

  const fitView = () => setVbox({ ...contentBounds });
  const zoomBy = (factor) => {
    setVbox(v => {
      const cur = v || contentBounds;
      const cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2;
      const nw = Math.max(50, Math.min(20000, cur.w / factor));
      const nh = Math.max(50, Math.min(20000, cur.h / factor));
      return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
    });
  };

  // Apply two-point calibration: user clicked two points (pixelDist world-units apart)
  // and tells us that distance is `meters` in reality. Rescale the background so the
  // grid (PX_PER_M world-units = 1 m) matches that real distance.
  const applyCalibration = (meters) => {
    if (!calibDialog || !meters || meters <= 0) { setCalibDialog(null); setCalibPoints([]); return; }
    const worldPerMeterNow = calibDialog.pixelDist / meters; // current world-units per real meter
    const factor = PX_PER_M / worldPerMeterNow;              // we want PX_PER_M units = 1 m
    if (lBg && calibPoints[0]) {
      const anchor = calibPoints[0];
      const newScale = (lBg.scale || 1) * factor;
      const nx = anchor.x - (anchor.x - lBg.x) * factor;
      const ny = anchor.y - (anchor.y - lBg.y) * factor;
      setLBg({ ...lBg, scale: newScale, x: nx, y: ny });
    }
    setCalibDialog(null);
    setCalibPoints([]);
    setBgStatus(`Målestok kalibreret: ${meters} m sat. Grid = virkelige meter.`);
  };

  // Apply a drawing ratio 1:R. For PDFs we know the render scale (pdfFit), so we
  // can rescale the background so that PX_PER_M world-units = 1 real metre at that
  // ratio — then measurements and tray lengths reflect the ratio automatically.
  const applyRatio = (ratioR) => {
    if (!lBg || !ratioR || ratioR <= 0) return;
    if (!lBg.pdfFit) {
      setBgStatus('Målestoksforhold kræver en PDF (kendt papirstørrelse). Brug to-punkts-kalibrering for billeder.');
      setLBg({ ...lBg, scaleRatio: ratioR });
      return;
    }
    // world-units the bg should span per real metre = PX_PER_M.
    // paper-metre per world-pixel (at scale 1) = 0.0254 / (72 * pdfFit).
    // At 1:R, real metre per base-world-pixel = 0.0254 * R / (72 * pdfFit).
    // We want that to equal 1/PX_PER_M, so the needed absolute bg scale is:
    const targetScale = (0.0254 * ratioR * PX_PER_M) / (72 * lBg.pdfFit);
    const factor = targetScale / (lBg.scale || 1);
    // anchor the rescale on the current viewport centre so it stays in view
    const cx = bounds.x + bounds.w / 2, cy = bounds.y + bounds.h / 2;
    const nx = cx - (cx - lBg.x) * factor;
    const ny = cy - (cy - lBg.y) * factor;
    setLBg({ ...lBg, scale: targetScale, x: nx, y: ny, scaleRatio: ratioR });
    setBgStatus(`Målestoksforhold 1:${ratioR} anvendt — målinger og længder er nu i virkelige meter.`);
  };

  // Mouse-wheel zoom toward the cursor position (whole drawing scales together)
  const onWheel = (e) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const cur = vboxRef.current || contentBounds;
    const fracX = (e.clientX - r.left) / r.width;
    const fracY = (e.clientY - r.top) / r.height;
    const worldX = cur.x + fracX * cur.w;
    const worldY = cur.y + fracY * cur.h;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    let nw = cur.w / factor;
    let nh = cur.h / factor;
    nw = Math.max(50, Math.min(40000, nw));
    nh = Math.max(50, Math.min(40000, nh));
    const nx = worldX - fracX * nw;
    const ny = worldY - fracY * nh;
    setVbox({ x: nx, y: ny, w: nw, h: nh });
  };
  // Keep a ref to vbox so the wheel handler always sees the latest value
  const vboxRef = useRef(null);
  useEffect(() => { vboxRef.current = vbox || contentBounds; }, [vbox, contentBounds]);
  // Bind wheel non-passively (React's onWheel is passive, so preventDefault is ignored)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e) => onWheel(e);
    svg.addEventListener('wheel', handler, { passive: false });
    return () => svg.removeEventListener('wheel', handler);
  }, []);

  // Grid lines
  const gridLines = useMemo(() => {
    if (!showGrid) return [];
    const lines = [];
    const step = GRID_M * PX_PER_M;
    const x0 = Math.floor(bounds.x / step) * step;
    const x1 = Math.ceil((bounds.x + bounds.w) / step) * step;
    const y0 = Math.floor(bounds.y / step) * step;
    const y1 = Math.ceil((bounds.y + bounds.h) / step) * step;
    for (let x = x0; x <= x1; x += step) lines.push({ x1:x, y1:y0, x2:x, y2:y1, key:`v${x}` });
    for (let y = y0; y <= y1; y += step) lines.push({ x1:x0, y1:y, x2:x1, y2:y, key:`h${y}` });
    return lines;
  }, [bounds, showGrid]);

  // Node connection counts (for delete warning)
  const nodeConnCount = (nid) => Object.values(lSegs).filter(s => s.from === nid || s.to === nid).length;
  const cableConnCount = (nid) => lCables.filter(c => c.from === nid || c.to === nid).length;

  const deleteNode = (nid) => {
    const conn = Object.entries(lSegs).filter(([_, s]) => s.from === nid || s.to === nid);
    const ns = {...lNodes}; delete ns[nid];
    const sg = {...lSegs};
    conn.forEach(([id]) => delete sg[id]);
    setLNodes(ns); setLSegs(sg);
    setLCables(lCables.filter(c => c.from !== nid && c.to !== nid));
    setEditNode(null);
  };
  // Delete every currently-selected object (one or many nodes, or a selected
  // segment) along with any segments/cables attached to deleted nodes.
  const deleteSelected = () => {
    const ids = selectedNodesRef.current.length ? selectedNodesRef.current : selectedNodes;
    if (ids.length) {
      const idSet = new Set(ids);
      const ns = { ...lNodes };
      ids.forEach(id => delete ns[id]);
      const sg = Object.fromEntries(Object.entries(lSegs).filter(([_, s]) => !idSet.has(s.from) && !idSet.has(s.to)));
      setLNodes(ns); setLSegs(sg);
      setLCables(lCables.filter(c => !idSet.has(c.from) && !idSet.has(c.to)));
      selectedNodesRef.current = []; setSelectedNodes([]); setEditNode(null);
      return;
    }
    if (selectedSeg && lSegs[selectedSeg]) {
      const sg = { ...lSegs }; delete sg[selectedSeg];
      setLSegs(sg);
      setLCables(lCables.map(c => ({ ...c, route: (c.route || []).filter(r => r !== selectedSeg) })));
      setSelectedSeg(null);
    }
  };
  const renameNode = (oldId, newId) => {
    if (newId === oldId) { setEditNode(null); return; }
    if (lNodes[newId]) { alert(`${newId} eksisterer allerede`); return; }
    const ns = {...lNodes}; ns[newId] = ns[oldId]; delete ns[oldId];
    const sg = Object.fromEntries(Object.entries(lSegs).map(([id, s]) => [id, { ...s, from: s.from===oldId?newId:s.from, to: s.to===oldId?newId:s.to }]));
    setLNodes(ns); setLSegs(sg);
    setLCables(lCables.map(c => ({ ...c, from: c.from===oldId?newId:c.from, to: c.to===oldId?newId:c.to })));
    setEditNode(null);
  };
  const updateNode = (id, data) => { setLNodes({ ...lNodes, [id]: { ...lNodes[id], ...data } }); };

  // --- Cross-drawing links ---
  // Link node `aId` (this drawing) to node `bId` on drawing `bPid`. Writes both ends.
  const createLink = async (aId, bPid, bId) => {
    const bName = (projectList || []).find(p => p.id === bPid)?.name || 'Tegning';
    const aName = (projectList || []).find(p => p.id === activeProjectId)?.name || 'Tegning';
    // This drawing's end (live state)
    setLNodes(prev => ({ ...prev, [aId]: { ...prev[aId], link: { pid: bPid, nid: bId, name: bName } } }));
    // Reciprocal end on the other drawing (in storage)
    if (patchDrawingNode) {
      try { await patchDrawingNode(bPid, bId, { link: { pid: activeProjectId, nid: aId, name: aName } }); } catch (e) {}
    }
    // Persist this drawing too so the link survives immediately
    try { saveAllDrawings && saveAllDrawings({ ...draftSnapshot(), nodes: { ...lNodes, [aId]: { ...lNodes[aId], link: { pid: bPid, nid: bId, name: bName } } } }); } catch (e) {}
    setLinkDialog(null);
  };
  // Remove a link from node `aId` and clear the reciprocal end.
  const removeLink = async (aId) => {
    const lk = lNodes[aId]?.link;
    setLNodes(prev => { const n = { ...prev[aId] }; delete n.link; return { ...prev, [aId]: n }; });
    if (lk && patchDrawingNode) {
      try { await patchDrawingNode(lk.pid, lk.nid, { link: undefined }); } catch (e) {}
    }
  };
  // Jump to a node's linked drawing (opens it as a tab and activates it).
  const goToLink = (lk) => { if (lk && lk.pid) switchToTab(lk.pid); };

  // Context-menu helper: start adding a specific føringsvej option (shape or segment)
  // WITHOUT opening the "Tilføj:" options bar — the mode is set so you can place/draw directly.
  const ctxPickTray = (opt) => {
    selectAddCategory('trays');
    if (opt === 'segment') { setMode('connect'); setConnectFrom(null); }
    else { setJunctionShape(opt); setMode('junction'); }
    setAddPanel(false); setHideChrome(false);
    setCtxMenu(null); setCtxSub(null); setCtxSub2(null);
  };

  // Collect IDs used by the other drawings so new elements here stay unique project-wide.
  useEffect(() => {
    let alive = true;
    if (collectUsedIds) {
      collectUsedIds(activeProjectId).then(s => { if (alive) reservedIdsRef.current = s || new Set(); });
    }
    return () => { alive = false; };
  }, [activeProjectId]);
  // ID generators that avoid both this drawing's IDs and those reserved by other drawings.
  const genNodeId = (kind) => nextNodeIdByKind(lNodes, kind, reservedIdsRef.current);
  const genSegId = () => nextSegId(lSegs, reservedIdsRef.current);
  const genCableId = () => nextCableId(lCables, reservedIdsRef.current);
  const updateSeg = (id, data) => {
    setLSegs(prev => {
      const next = { ...prev, [id]: { ...prev[id], ...data } };
      // If a colour was set, propagate it to the whole connected network
      if ('color' in data) {
        const netId = networkInfo.segNet[id];
        if (netId && networkInfo.byId[netId]) {
          networkInfo.byId[netId].segIds.forEach(sid => {
            if (next[sid]) next[sid] = { ...next[sid], color: data.color || undefined };
          });
        }
      }
      return next;
    });
    setEditSeg(null);
  };
  const deleteSeg = (id) => { const sg = {...lSegs}; delete sg[id]; setLSegs(sg); setEditSeg(null); };
  // Add a bend (waypoint) at the midpoint of the segment's current chain
  const addWaypoint = (id) => {
    const s = lSegs[id];
    if (!s) return;
    const a = lNodes[s.from], b = lNodes[s.to];
    if (!a || !b) return;
    const wps = s.waypoints || [];
    // insert at the midpoint of the longest leg of the current chain
    const chain = [a, ...wps, b];
    let bestLeg = 0, bestLen = -1;
    for (let i = 0; i < chain.length - 1; i++) {
      const dx = chain[i+1].x - chain[i].x, dy = chain[i+1].y - chain[i].y;
      const len = Math.hypot(dx, dy);
      if (len > bestLen) { bestLen = len; bestLeg = i; }
    }
    const mid = { x: Math.round((chain[bestLeg].x + chain[bestLeg+1].x)/2), y: Math.round((chain[bestLeg].y + chain[bestLeg+1].y)/2) };
    const newWps = [...wps];
    newWps.splice(bestLeg, 0, mid);  // insert in correct order along the chain
    setLSegs({ ...lSegs, [id]: { ...s, waypoints: newWps } });
    setEditSeg(id);  // keep selected so the handle shows
  };
  const removeWaypoint = (id) => {
    const s = lSegs[id];
    if (!s || !s.waypoints || s.waypoints.length === 0) return;
    setLSegs({ ...lSegs, [id]: { ...s, waypoints: s.waypoints.slice(0, -1) } });
  };

  // Renumber all segments WC001, WC002, ... in tray order
  const renumber = () => {
    const entries = Object.entries(lSegs);
    const remap = {};   // old seg id -> new seg id
    const renamed = {};
    entries.forEach(([oldId, s], i) => {
      const newId = `WC${String(i+1).padStart(3,'0')}`;
      remap[oldId] = newId;
      renamed[newId] = s;
    });
    setLSegs(renamed);
    // update cable routes to use renumbered segment ids
    setLCables(lCables.map(c => ({ ...c, route: (c.route || []).map(r => remap[r] || r) })));
  };

  return (
    <div className="fixed inset-0 bg-white z-30 flex flex-col" style={{ touchAction:'none' }}>
      {/* Drawing tabs — top bar; double-click empty area to collapse */}
      {(() => {
        // Always render the bar with at least the active drawing, even if openTabs
        // somehow got out of sync — so the tab bar (and Forside) never disappears.
        let tabIds = (openTabs || []).filter(tid => (projectList || []).some(x => x.id === tid));
        if (activeProjectId && !tabIds.includes(activeProjectId)) tabIds = [activeProjectId, ...tabIds];
        if (tabIds.length === 0 && activeProjectId) tabIds = [activeProjectId];
        // Always render the bar (even with no tabs) so "Ny" and "Forside" stay reachable.
        return collapsedBars.tabs ? thinBar('tabs', '#E9E5D9') : (
        <div onDoubleClick={(e)=>{ if (e.target === e.currentTarget) toggleBar('tabs'); }}
             title="Dobbeltklik på et tomt sted i fane-bjælken for at skjule den"
             className="flex items-stretch overflow-x-auto border-b border-stone-200 py-0.5 select-none" style={{ backgroundColor: '#E9E5D9', scrollbarWidth:'thin' }}>
          {tabIds.map(tid => {
            const p = (projectList || []).find(x => x.id === tid) || { id: tid, name: 'Tegning' };
            return (
              <div key={p.id} onClick={()=>{ if (!renamingTab || renamingTab.id !== p.id) switchToTab(p.id); }}
                   draggable={!(renamingTab && renamingTab.id === p.id)}
                   onContextMenu={(e)=>{ e.preventDefault(); e.stopPropagation(); setRenamingTab({ id: p.id, value: p.name }); }}
                   onDragStart={(e)=>{ dragTabRef.current = p.id; e.dataTransfer.effectAllowed='move'; try { e.dataTransfer.setData('text/plain', p.id); } catch(err){} }}
                   onDragOver={(e)=>{ if (dragTabRef.current && dragTabRef.current !== p.id) { e.preventDefault(); e.dataTransfer.dropEffect='move'; if (dragOverTab !== p.id) setDragOverTab(p.id); } }}
                   onDragLeave={()=>{ if (dragOverTab === p.id) setDragOverTab(null); }}
                   onDrop={(e)=>{ e.preventDefault(); const from = dragTabRef.current; if (from && from !== p.id) reorderTabs && reorderTabs(from, p.id); dragTabRef.current=null; setDragOverTab(null); }}
                   onDragEnd={()=>{ dragTabRef.current=null; setDragOverTab(null); }}
                   className={`group pl-3 pr-2 py-1 text-xs whitespace-nowrap border-r border-stone-300/50 flex items-center gap-1.5 ${(renamingTab && renamingTab.id === p.id) ? 'cursor-text' : 'cursor-grab active:cursor-grabbing'} rounded-t-lg ${dragOverTab===p.id ? 'ring-2 ring-stone-400' : ''} ${p.id===activeProjectId ? 'font-semibold' : 'text-stone-600 hover:bg-white/40'}`}
                   style={p.id===activeProjectId ? { backgroundColor: '#D7D0BC', color: '#44403c' } : undefined}
                   title="Klik for at åbne · højreklik for at omdøbe · træk for at flytte">
                <Pencil size={11}/>
                {(renamingTab && renamingTab.id === p.id) ? (
                  <input autoFocus value={renamingTab.value}
                         onChange={(e)=>setRenamingTab({ id: p.id, value: e.target.value })}
                         onClick={(e)=>e.stopPropagation()}
                         onBlur={()=>{ const nm = (renamingTab.value || '').trim(); if (nm) renameProject && renameProject(p.id, nm); setRenamingTab(null); }}
                         onKeyDown={(e)=>{ if (e.key === 'Enter') { const nm = (renamingTab.value || '').trim(); if (nm) renameProject && renameProject(p.id, nm); setRenamingTab(null); } else if (e.key === 'Escape') { setRenamingTab(null); } }}
                         className="bg-white/90 border border-stone-300 rounded px-1 text-xs outline-none focus:ring-1 focus:ring-stone-400"
                         style={{ width: `${Math.max(6, (renamingTab.value || '').length + 1)}ch`, color:'#44403c' }}/>
                ) : (
                  <span>{p.name}</span>
                )}
                {tabIds.length > 1 && !(renamingTab && renamingTab.id === p.id) && (
                  <button onClick={(e)=>onCloseTab(e, p.id)} title="Luk fane (sletter ikke tegningen)"
                          className="ml-3 rounded-md p-0.5 hover:bg-stone-300/70 text-stone-500">
                    <X size={12}/>
                  </button>
                )}
              </div>
            );
          })}
          <button onClick={newTab} title="Ny tegning"
                  className="px-3 py-1 text-xs text-stone-600 hover:bg-white/50 flex items-center gap-1 shrink-0">
            <Plus size={13}/> Ny
          </button>
          {/* Back to start page — saves, closes the editor, opens the home page */}
          <button onClick={()=>{ try { saveAllDrawings && saveAllDrawings(draftSnapshot()); } catch(e){} goHome ? goHome() : close(); }}
                  className="ml-auto my-0.5 mr-1 px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0 transition-colors hover:brightness-95"
                  style={{ backgroundColor:'#D7D0BC', color:'#44403c' }}
                  title="Gem og gå til forsiden">
            <Home size={13}/> Forside
          </button>
        </div>
        );
      })()}

      {/* Header — sits just below the tab bar, same thickness */}
      {/* Header — double-click to collapse to a thin strip */}
      {collapsedBars.header ? thinBar('header', '#F4F2EC') : (
      <header onDoubleClick={(e)=>onBarDbl(e,'header')} title="Dobbeltklik på et tomt sted i bjælken for at skjule den"
              className="flex items-center gap-1 flex-wrap px-3 py-0.5 shadow-sm border-b border-stone-200/70 select-none"
              style={{ background: 'linear-gradient(to right, #F4F2EC, #FBFAF6)', color: '#44403c' }}>
        <label className="px-2 py-1 rounded-lg text-xs flex items-center gap-1 cursor-pointer transition-colors hover:bg-stone-300/30"
               style={{ backgroundColor: 'transparent', color: '#44403c' }}
               title="Tilføj PDF eller billede direkte som tegningsgrundlag">
          <Upload size={14}/> Tilføj
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*" onChange={(e)=>{ setBgPanel(true); onBgFile(e); }} style={{ position:'absolute', left:'-9999px', width:1, height:1 }}/>
        </label>
        <button onClick={()=>{ setHideChrome(false); toggleAddPanel(); }}
                className="px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition-colors"
                style={{ backgroundColor: addPanel ? '#E7E2D4' : 'transparent', color: addPanel ? '#44403c' : '#ccc3b2' }}
                title="Tilføj nyt objekt (føringsveje, tavler, laster, kabler)">
          <Plus size={14}/> Tilføj nyt objekt
        </button>
        <button onClick={()=>{ setHideChrome(false); setBgPanel(p=>!p); }}
                className="px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition-colors"
                style={{ backgroundColor: bgPanel ? '#E7E2D4' : 'transparent', color: bgPanel ? '#44403c' : '#ccc3b2' }}
                title="Juster tegningsgrundlag (plantegning som baggrund)">
          <FileText size={14}/> Juster tegningsgrundlag
        </button>
        <button onClick={()=>setShowTools(v=>!v)}
                className="px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition-colors"
                style={{ backgroundColor: showTools ? '#E7E2D4' : 'transparent', color: showTools ? '#44403c' : '#ccc3b2' }}
                title="Vis/skjul værktøjer (grid, kategorier, legender, ret op …)">
          <Grid3x3 size={14}/> Værktøjer
        </button>
        <button onClick={toggleAutoSave}
                className="px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition-colors"
                style={{ backgroundColor: autoSave ? '#E7E2D4' : 'transparent', color: autoSave ? '#44403c' : '#ccc3b2' }}
                title={autoSave ? 'Auto-gem er slået til — alt gemmes automatisk' : 'Auto-gem er slået fra'}>
          <RefreshCw size={13} className={autoSave ? 'animate-pulse' : ''}/> Auto-gem: {autoSave ? 'TIL' : 'FRA'}
        </button>
        <button onClick={undo} disabled={!canUndo}
                className="px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition-colors"
                style={{ backgroundColor: canUndo ? '#E7E2D4' : 'transparent', color: canUndo ? '#44403c' : '#ccc3b2' }}
                title="Fortryd sidste ændring">
          <RefreshCw size={14} style={{ transform:'scaleX(-1)' }}/> Fortryd
        </button>
      </header>
      )}


      {/* Add-object category bar — only visible when "Tilføj nyt objekt" is active */}
      {addPanel && !hideChrome && (
        collapsedBars.category ? thinBar('category', '#F8F6F0') : (
        <div onDoubleClick={(e)=>onBarDbl(e,'category')} title="Dobbeltklik på et tomt sted i bjælken for at skjule den"
             className="px-3 py-1 flex gap-2 items-center overflow-x-auto border-b border-stone-200 select-none" style={{ backgroundColor: '#F8F6F0' }}>
          <span className="text-xs font-semibold text-stone-500 shrink-0">Tilføj:</span>
          <button onClick={()=>selectAddCategory('trays')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border-2 ${addCategory==='trays' ? 'border-stone-500 bg-white text-stone-800' : 'border-transparent bg-white/70 text-stone-600'}`}>
            <GitBranch size={14}/> Føringsveje
          </button>
          <button onClick={()=>selectAddCategory('boards')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border-2 ${addCategory==='boards' ? 'border-stone-500 bg-white text-stone-800' : 'border-transparent bg-white/70 text-stone-600'}`}>
            <Database size={14}/> Tavler
          </button>
          <button onClick={()=>selectAddCategory('loads')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border-2 ${addCategory==='loads' ? 'border-stone-500 bg-white text-stone-800' : 'border-transparent bg-white/70 text-stone-600'}`}>
            <Zap size={14}/> Laster
          </button>
          <button onClick={()=>selectAddCategory('cables')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border-2 ${addCategory==='cables' ? 'border-stone-500 bg-white text-stone-800' : 'border-transparent bg-white/70 text-stone-600'}`}>
            <Cable size={14}/> Kabler
          </button>
        </div>
        )
      )}

      {/* (Navigation & view tools moved to the bottom, just above the canvas) */}

      {/* Føringsvej options — shapes + segment — shown when "Føringsveje" is picked */}
      {addPanel && addCategory === 'trays' && (mode === 'junction' || mode === 'connect') && !hideChrome && (
        collapsedBars.options ? thinBar('options', '#FBFAF5') : (
        <div onDoubleClick={(e)=>onBarDbl(e,'options')} title="Dobbeltklik på et tomt sted i bjælken for at skjule den"
             className="border-b border-stone-200 px-3 py-1 flex items-center gap-2 flex-wrap select-none" style={{ backgroundColor: '#FBFAF5' }}>
          <span className="text-xs font-semibold text-stone-500 shrink-0">Tilføj:</span>
          {[
            ['dot', 'Punkt', <svg key="d" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="6" fill="#fff" stroke="#8a7f63" strokeWidth="2"/></svg>],
            ['tee', 'T-stykke', <svg key="t" width="22" height="22" viewBox="0 0 22 22"><line x1="3" y1="8" x2="19" y2="8" stroke="#8a7f63" strokeWidth="2.5" strokeLinecap="round"/><line x1="11" y1="8" x2="11" y2="19" stroke="#8a7f63" strokeWidth="2.5" strokeLinecap="round"/><circle cx="3" cy="8" r="2" fill="#8a7f63"/><circle cx="19" cy="8" r="2" fill="#8a7f63"/><circle cx="11" cy="19" r="2" fill="#8a7f63"/></svg>],
            ['corner', 'Hjørne', <svg key="c" width="22" height="22" viewBox="0 0 22 22"><polyline points="5,4 5,15 16,15" fill="none" stroke="#8a7f63" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="5" cy="4" r="2" fill="#8a7f63"/><circle cx="16" cy="15" r="2" fill="#8a7f63"/></svg>],
            ['cross', 'Kryds', <svg key="x" width="22" height="22" viewBox="0 0 22 22"><line x1="3" y1="11" x2="19" y2="11" stroke="#8a7f63" strokeWidth="2.5" strokeLinecap="round"/><line x1="11" y1="3" x2="11" y2="19" stroke="#8a7f63" strokeWidth="2.5" strokeLinecap="round"/><circle cx="3" cy="11" r="2" fill="#8a7f63"/><circle cx="19" cy="11" r="2" fill="#8a7f63"/><circle cx="11" cy="3" r="2" fill="#8a7f63"/><circle cx="11" cy="19" r="2" fill="#8a7f63"/></svg>],
          ].map(([k, label, icon]) => (
            <button key={k} onClick={()=>{ setJunctionShape(k); if (mode !== 'junction') setMode('junction'); }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border-2 ${mode==='junction' && junctionShape===k ? 'border-stone-500 bg-white text-stone-800' : 'border-transparent bg-white/60 text-stone-600'}`}>
              {icon} {label}
            </button>
          ))}
          <div className="border-l border-stone-300 h-6 mx-1"></div>
          <button onClick={()=>{ setMode('connect'); setConnectFrom(null); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border-2 ${mode==='connect' ? 'border-stone-500 bg-white text-stone-800' : 'border-transparent bg-white/60 text-stone-600'}`}>
            <Link2 size={15}/> Tilføj føringsvejssegment
          </button>
          {mode === 'junction' && (
            <label className="text-xs text-stone-600 flex items-center gap-1 ml-auto shrink-0" title="Størrelse på alle cirkler i hele tegningen">
              Cirkelstørrelse
              <input type="range" min="3" max="20" value={circleSize} onChange={e=>updateCircleSize(Number(e.target.value))} className="w-20"/>
              <span className="w-7">{circleSize}</span>
            </label>
          )}
        </div>
        )
      )}

      {/* Background adjust panel — opens from the "Juster tegningsgrundlag" header button */}
      {bgPanel && !lBg && (
        <div className="bg-white border-b shadow-sm px-3 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-emerald-900 flex items-center gap-1"><FileText size={14}/> Tegningsgrundlag</span>
            <button onClick={()=>setBgPanel(false)} className="text-xs px-2 py-1 bg-stone-100 rounded">Luk</button>
          </div>
          <p className="text-xs text-stone-600">Tilføj en plantegning (PDF eller billede) som baggrund at tegne ovenpå.</p>
          <label className="text-sm px-3 py-2 bg-emerald-600 text-white rounded-lg font-semibold cursor-pointer inline-flex items-center gap-1.5">
            <Upload size={15}/> Vælg fil
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*" onChange={onBgFile} style={{ position:'absolute', left:'-9999px', width:1, height:1 }}/>
          </label>
          <p className="text-[11px] text-emerald-700/80">
            Virker ikke i preview? Fil-upload kræver den installerede (Vercel) version — preview-vinduet blokerer filadgang.
          </p>
        </div>
      )}

      {bgBusy && (
        <div className="bg-emerald-50 text-emerald-900 text-xs text-center py-1.5 px-2 flex items-center justify-center gap-2">
          <RefreshCw size={12} className="animate-spin"/>
          <span>{bgStatus || 'Indlæser tegningsgrundlag …'}</span>
        </div>
      )}

      {/* Background adjust panel */}
      {bgPanel && lBg && (
        <div className="bg-white border-b shadow-sm px-3 py-2 space-y-2 max-h-[55vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-700 truncate flex items-center gap-1"><FileText size={12}/> {lBg.name || 'Tegningsgrundlag'}</span>
            <div className="flex gap-1">
              <label className="text-xs px-2 py-1 bg-stone-100 rounded cursor-pointer">
                Skift
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*" onChange={onBgFile} style={{ position:'absolute', left:'-9999px', width:1, height:1 }}/>
              </label>
              <button onClick={removeBg} className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded flex items-center gap-1"><Trash2 size={11}/> Fjern</button>
              <button onClick={()=>setBgPanel(false)} className="text-xs px-2 py-1 bg-stone-100 rounded">Luk</button>
            </div>
          </div>
          {storageInfo && (storageInfo.usedMB != null || storageInfo.backend) && (
            <div className="text-[11px] text-stone-500">
              {storageInfo.backend ? `Lager: ${storageInfo.backend === 'indexeddb' ? 'IndexedDB' : (storageInfo.backend === 'localStorage' || storageInfo.backend === 'localstorage') ? 'localStorage (~5 MB)' : storageInfo.backend} · ` : ''}
              {storageInfo.usedMB != null ? `${storageInfo.usedMB.toFixed(1)} MB${storageInfo.quotaMB ? ` af ~${Math.round(storageInfo.quotaMB)} MB` : ''}` : ''}
              {storageInfo.persisted === true ? ' · vedvarende' : storageInfo.persisted === false ? ' · ikke-vedvarende' : ''}
            </div>
          )}

          {/* Calibration / scale */}
          <div className="border border-stone-200 rounded-lg p-2 bg-stone-100/40 space-y-1.5">
            <div className="text-xs font-semibold text-stone-800">Målestok</div>
            <button onClick={()=>{ setCalibrating(true); setCalibPoints([]); setMeasuring(false); setMeasureResult(null); setBgPanel(false); setBgStatus('Klik to punkter på tegningen med kendt afstand …'); }}
                    className="w-full text-xs py-2 rounded-lg font-semibold flex items-center justify-center gap-1 bg-stone-700 text-white">
              <MousePointer2 size={13}/> Kalibrér: klik to punkter med kendt afstand
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-600 shrink-0">eller 1:</span>
              <input type="number" placeholder="100" defaultValue={lBg.scaleRatio || ''}
                     id="ratioInput"
                     className="flex-1 border border-stone-300 rounded px-2 py-1 text-sm"/>
              <button onClick={()=>{ const v = Number(document.getElementById('ratioInput')?.value); if (v > 0) applyRatio(v); }}
                      className="text-xs px-3 py-1.5 bg-stone-700 text-white rounded-lg font-semibold shrink-0">Anvend</button>
            </div>
            {lBg.scaleRatio ? <div className="text-[11px] text-stone-700">Aktivt forhold: 1:{lBg.scaleRatio}</div> : null}
          </div>

          {/* Measurement tool — press and drag to measure */}
          <button onClick={()=>{ setMeasuring(true); setMeasureResult(null); setCalibrating(false); setBgPanel(false); setBgStatus('Måling: træk fra punkt A til punkt B …'); }}
                  className="w-full text-xs py-2 rounded-lg font-semibold flex items-center justify-center gap-1 bg-emerald-600 text-white">
            <MousePointer2 size={13}/> Mål afstand i tegningen
          </button>

          <label className="block text-xs text-stone-600">Opacitet: {Math.round((lBg.opacity ?? 0.5)*100)}%
            <input type="range" min="10" max="100" value={(lBg.opacity ?? 0.5)*100}
                   onChange={e=>updateBg({ opacity: Number(e.target.value)/100 })}
                   className="w-full"/>
          </label>
          <p className="text-[11px] text-stone-400">Tip: Brug musens scrollhjul til at zoome hele tegningen. Placerede objekter bliver på deres plads. Kalibrér målestok ved at klikke to punkter med kendt afstand — så bliver målinger og føringsvejs-længder korrekte.</p>
        </div>
      )}

      {/* Network panel: each connected føringsvej-net is one category (one colour) */}
      {catPanel && (
        <div className="bg-white border-b shadow-sm px-3 py-2 max-h-[45vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-stone-800 flex items-center gap-1"><Layers size={15}/> Føringsvej-netværk</span>
            <button onClick={()=>setCatPanel(false)} className="text-xs px-2 py-1 bg-stone-100 rounded">Luk</button>
          </div>
          {colorCategories.length === 0 ? (
            <p className="text-xs text-stone-500">Ingen føringsveje endnu.</p>
          ) : (
            <div className="space-y-2">
              {colorCategories.map((cat, idx) => {
                const firstSeg = lSegs[cat.segIds[0]];
                const op = firstSeg?.opacity ?? 1;
                const widths = Array.from(cat.widths).sort((a,b)=>a-b);
                const palette = ['#1565C0', '#2e7d32', '#c62828', '#f9a825', '#6a1b9a', '#00838f', '#37474F', '#e91e63'];
                return (
                  <div key={cat.id} className="border border-stone-200 rounded-lg p-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="inline-block w-5 h-5 rounded-full border border-stone-300 shrink-0" style={{ background: cat.color }}/>
                      <span className="text-xs font-semibold text-stone-700">Net {idx+1}</span>
                      <span className="text-xs text-stone-400">({cat.count} segm.{widths.length ? ` · ${widths.join('/')} mm` : ''})</span>
                      <button onClick={()=>straightenNetwork(cat.id)}
                              className="ml-auto text-xs px-2 py-1 bg-amber-100 text-amber-900 rounded flex items-center gap-1">
                        <GitBranch size={11}/> Ret op
                      </button>
                    </div>
                    {/* Network colour swatches */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                      <span className="text-[11px] text-stone-500">Farve:</span>
                      {palette.map(c => (
                        <button key={c} onClick={()=>setNetworkColor(cat.id, c)}
                                className={`w-5 h-5 rounded-full border-2 ${cat.color===c ? 'border-stone-800 ring-1 ring-stone-300' : 'border-stone-300'}`}
                                style={{ background: c }}/>
                      ))}
                      <input type="color" value={/^#/.test(cat.color)?cat.color:'#1565C0'} onChange={e=>setNetworkColor(cat.id, e.target.value)}
                             className="w-5 h-5 rounded cursor-pointer border border-stone-300" title="Egen farve"/>
                      <button onClick={()=>setNetworkColor(cat.id, '')} className="text-[11px] text-stone-400 underline ml-1" title="Brug auto-farve fra bredde">auto</button>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-stone-600">
                      Opacitet
                      <input type="range" min="10" max="100" value={op*100}
                             onChange={e=>setNetworkOpacity(cat.id, Number(e.target.value)/100)}
                             className="flex-1"/>
                      <span className="w-9 text-right">{Math.round(op*100)}%</span>
                    </label>
                    <button onClick={()=>setCatEdit(cat.id)}
                            className="w-full mt-1.5 py-1.5 bg-stone-800 text-white rounded text-xs font-semibold flex items-center justify-center gap-1">
                      <Edit2 size={12}/> Rediger alle objekter i Net {idx+1}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-stone-400 mt-2">Forbundne føringsveje udgør ét netværk og deler én farve (men kan have forskellige bredder). "Ret op" gør netværket vinkelret.</p>
        </div>
      )}

      {/* Navigation & view tools — at the bottom, just above the canvas */}
      {showTools && !hideChrome && (
        collapsedBars.nav ? thinBar('nav', '#F8F6F0') : (
        <div onDoubleClick={(e)=>onBarDbl(e,'nav')} title="Dobbeltklik på et tomt sted i bjælken for at skjule den"
             className="px-2 py-0.5 flex gap-1 overflow-x-auto border-t border-b border-stone-200 select-none" style={{ backgroundColor: '#F8F6F0' }}>
        <button onClick={()=>setShowGrid(g=>!g)}
                className="px-2 py-1 rounded-lg text-xs flex items-center gap-1 text-stone-600 hover:bg-stone-200/40"
                style={showGrid ? { backgroundColor: '#D7D0BC', color: '#44403c' } : undefined}><Grid3x3 size={14}/> Grid</button>
        <button onClick={()=>setCatPanel(p=>!p)}
                className="px-2 py-1 rounded-lg text-xs flex items-center gap-1 text-stone-600 hover:bg-stone-200/40"
                style={catPanel ? { backgroundColor: '#D7D0BC', color: '#44403c' } : undefined}
                title="Farve-kategorier & opacitet"><Layers size={13}/> Kategorier</button>
        <button onClick={()=>setShowLegends(v=>!v)}
                className="px-2 py-1 rounded-lg text-xs flex items-center gap-1 text-stone-600 hover:bg-stone-200/40"
                style={showLegends ? { backgroundColor: '#D7D0BC', color: '#44403c' } : undefined}
                title="Vis/skjul info-bokse på alle føringsveje"><FileText size={13}/> Legender</button>
        <button onClick={straightenAll} className="px-2 py-1 rounded-lg text-xs flex items-center gap-1 text-stone-600 hover:bg-stone-200/40" title="Ret alle føringsveje op (vinkelret)"><GitBranch size={13}/> Ret alt op</button>
        <button onClick={()=>setShowTips(v=>!v)}
                className="px-2 py-1 rounded-lg text-xs flex items-center gap-1 text-stone-600 hover:bg-stone-200/40"
                style={showTips ? { backgroundColor: '#D7D0BC', color: '#44403c' } : undefined}
                title="Vis/skjul hjælpetekst under bjælken"><HelpCircle size={13}/> Tips</button>
        </div>
        )
      )}

      {/* Neutral edit-mode hint — only shown when "Tips" is active */}
      {showTips && !hideChrome && mode === 'edit' && selectedNodes.length === 0 && (
        <div className="bg-stone-50 text-stone-500 text-[11px] text-center py-1 px-2">
          Rediger-tilstand: klik på objekter for at markere flere · træk for at flytte · dobbeltklik for at redigere · træk på tom flade for at markere et område
        </div>
      )}

      {/* Help bar — only shows active connect/cable status (warnings, current step) */}
      {!hideChrome && (mode === 'connect' || mode === 'cable') && (
      <div className="bg-stone-100 text-stone-800 text-xs text-center py-1.5 px-2">
        {mode === 'connect' && (connectFrom ? `→ Tap en anden knude for at forbinde til ${connectFrom}` : '→ Tap første knude/tavle/last')}
        {mode === 'cable' && (cableMsg
          ? `⚠ ${cableMsg}`
          : (cableFrom
              ? `→ Tap mål-tavle eller last · ruten findes automatisk fra ${cableFrom}`
              : '→ Tap kablets start-tavle (kabler går fra tavle til last/tavle)'))}
      </div>
      )}

      {/* Multi-select action bar (edit mode) */}
      {selectedNodes.length > 0 && (mode !== 'connect' && mode !== 'cable') && (
        <div className="bg-stone-800 text-white px-3 py-2 flex items-center gap-2 text-sm">
          <span className="font-semibold">{selectedNodes.length} valgt</span>
          <span className="text-stone-300 text-xs">
            ({(lNodes[selectedNodes[0]]?.kind || 'junction') === 'board' ? 'tavler' : (lNodes[selectedNodes[0]]?.kind || 'junction') === 'load' ? 'laster' : 'punkter'})
          </span>
          <button onClick={()=>setMultiEdit({ kind: lNodes[selectedNodes[0]]?.kind || 'junction' })}
                  className="ml-auto bg-white text-stone-800 px-3 py-1.5 rounded-lg font-semibold text-xs">Rediger alle</button>
          <button onClick={clearSelection} className="bg-stone-700 px-2 py-1.5 rounded-lg text-xs">Ryd</button>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 overflow-hidden bg-stone-50 relative">
        <svg ref={svgRef}
             viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
             className="w-full h-full"
             style={{ cursor: 'crosshair', touchAction:'none', userSelect:'none', WebkitUserSelect:'none', MozUserSelect:'none' }}
             onClick={onCanvasTap}
             onContextMenu={(e)=>{ e.preventDefault(); if (!movedRef.current) { setCtxSub(null); setCtxSub2(null); setCtxMenu({ x: e.clientX, y: e.clientY }); } }}
             onPointerDown={onCanvasPointerDown}
             onPointerMove={onCanvasPointerMove}
             onPointerUp={onCanvasPointerUp}
             onPointerCancel={onCanvasPointerUp}>
          {/* Background drawing (PDF/image) — rendered first so everything sits on top */}
          {lBg && lBg.dataUrl && (
            <image href={lBg.dataUrl} xlinkHref={lBg.dataUrl}
                   x={lBg.x} y={lBg.y}
                   width={lBg.w * lBg.scale} height={lBg.h * lBg.scale}
                   opacity={lBg.opacity ?? 0.5}
                   preserveAspectRatio="none"
                   style={{ pointerEvents:'none' }}/>
          )}
          {/* Grid */}
          {gridLines.map(l => (
            <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                  stroke="#e5e7eb" strokeWidth="0.5"
                  strokeDasharray={(l.key.startsWith('v') ? (l.x1 % (5*PX_PER_M*GRID_M) === 0) : (l.y1 % (5*PX_PER_M*GRID_M) === 0)) ? '0' : '2,2'}/>
          ))}

          {/* Segments — drawn as polylines through optional waypoints (bends) */}
          {Object.entries(lSegs).map(([id, s]) => {
            const aN = lNodes[s.from], bN = lNodes[s.to];
            if (!aN || !bN) return null;
            const isSel = selectedSeg === id || editSeg === id;
            const wps = s.waypoints || [];
            // Anchor connection to the nearest arm-end of T/corner nodes (not centre)
            const aTarget = wps[0] || bN;
            const bTarget = wps.length ? wps[wps.length-1] : aN;
            const a = nodeAnchor(aN, aTarget);
            const b = nodeAnchor(bN, bTarget);
            // full point chain: from → waypoints → to
            const chain = [a, ...wps, b];
            const ptsStr = chain.map(p => `${p.x},${p.y}`).join(' ');
            // geometric length along the chain, in metres
            let chainPx = 0;
            for (let i = 0; i < chain.length - 1; i++) {
              chainPx += Math.hypot(chain[i+1].x - chain[i].x, chain[i+1].y - chain[i].y);
            }
            const chainM = Math.round(chainPx / PX_PER_M * 10) / 10;
            // midpoint of the whole chain for the label (use middle vertex area)
            const midIdx = Math.floor(chain.length / 2);
            const mid = chain.length % 2 === 0
              ? { x: (chain[midIdx-1].x + chain[midIdx].x)/2, y: (chain[midIdx-1].y + chain[midIdx].y)/2 }
              : chain[midIdx];
            // Tray width drives the line thickness; colour comes from the network
            // (all connected segments share one colour).
            const trayW = trayTypes[s.tray_type]?.width_mm;
            const autoStroke = trayWidthStroke(trayW);
            const effColor = segColor(s, id);
            const segStroke = isSel ? '#a04500' : effColor;
            const segWidth = isSel ? autoStroke + 2 : autoStroke;
            const segOpacity = s.opacity ?? 1;
            const dash = s.lineStyle === 'dashed' ? '10,6' : s.lineStyle === 'dotted' ? '2,5' : undefined;
            return (
              <g key={id} onClick={(e)=>onSegTap(e, id)} onDoubleClick={(e)=>onSegDouble(e, id)}
                 onContextMenu={(e)=>{ selectedNodesRef.current = []; setSelectedNodes([]); setSelectedSeg(id); }}
                 style={{ cursor:'pointer', opacity: isSel ? 1 : segOpacity }}>
                <polyline points={ptsStr} fill="none"
                          stroke={segStroke} strokeWidth={segWidth} strokeLinecap="round" strokeLinejoin="round"
                          strokeDasharray={dash}/>
                <polyline points={ptsStr} fill="none"
                          stroke="transparent" strokeWidth={Math.max(20, segWidth + 12)}/>
                {/* Waypoint handles — draggable when the segment is selected */}
                {isSel && wps.map((wp, wi) => (
                  <circle key={`wp${wi}`} cx={wp.x} cy={wp.y} r="7"
                          fill="#fff" stroke="#a04500" strokeWidth="2.5"
                          style={{ cursor:'move', touchAction:'none' }}
                          onPointerDown={(e)=>startWaypointDrag(e, id, wi)}
                          onClick={(e)=>e.stopPropagation()}/>
                ))}
                <text x={mid.x} y={mid.y - 8} textAnchor="middle"
                      fontSize="11" fontWeight="bold" fill="#111827"
                      style={{ pointerEvents:'none', paintOrder:'stroke' }} stroke="#fff" strokeWidth="3" strokeLinejoin="round">{id}</text>
                <text x={mid.x} y={mid.y + 12} textAnchor="middle"
                      fontSize="10" fill="#444" style={{ pointerEvents:'none', paintOrder:'stroke' }} stroke="#fff" strokeWidth="3" strokeLinejoin="round">
                  {wps.length > 0 ? `${chainM}m` : `${s.length_m}m`} · {s.tray_type}
                </text>
                {/* Info legend (toggle): BxH, LS tracks, elevation — free text with an arrow, no box.
                    Placed clear of the ID/length labels and offset to the side to avoid overlap. */}
                {showLegends && (() => {
                  const tt = trayTypes[s.tray_type];
                  const bxh = tt ? `${tt.width_mm}×${tt.height_mm} mm` : s.tray_type;
                  const tracks = Array.from(segLS[id] || []).sort();
                  const elev = s.elevation_mm != null ? `Kote ${s.elevation_mm} mm` : null;
                  const lines = [bxh, tracks.length ? `Spor: ${tracks.join(', ')}` : 'Spor: —'];
                  if (elev) lines.push(elev);
                  const lineH = 13;
                  // Figure out whether the segment runs more horizontally or vertically,
                  // then push the legend to the side that's clear of the ID/length labels.
                  const dxSeg = Math.abs(b.x - a.x), dySeg = Math.abs(b.y - a.y);
                  const horizontal = dxSeg >= dySeg;
                  // anchor point on the segment the arrow points to
                  const anchorX = mid.x, anchorY = mid.y;
                  // legend block position
                  let blockTopY, textX, anchorTextX, arrowFromY, arrowToY;
                  const gap = 34;                       // distance from segment to legend
                  if (horizontal) {
                    // horizontal segment → place legend well above, clear of the centred labels
                    blockTopY = anchorY - gap - lines.length * lineH;
                    textX = anchorX + 8;
                    arrowFromY = blockTopY + lines.length * lineH + 2;
                    arrowToY = anchorY - 16;            // stop above the length label
                  } else {
                    // vertical segment → labels sit centred; lift legend higher to clear them
                    blockTopY = anchorY - gap - 18 - lines.length * lineH;
                    textX = anchorX + 10;
                    arrowFromY = blockTopY + lines.length * lineH + 2;
                    arrowToY = anchorY - 22;
                  }
                  return (
                    <g style={{ pointerEvents:'none' }}>
                      {/* arrow from the text down toward the segment, stopping short of the labels */}
                      <line x1={anchorX} y1={arrowFromY} x2={anchorX} y2={arrowToY}
                            stroke={effColor} strokeWidth="1.5"/>
                      <polygon points={`${anchorX-3.5},${arrowToY-2} ${anchorX+3.5},${arrowToY-2} ${anchorX},${arrowToY+5}`} fill={effColor}/>
                      {/* free text lines in the segment colour */}
                      {lines.map((ln, i) => (
                        <text key={i} x={textX} y={blockTopY + lineH*(i+1)}
                              fontSize="11" fontWeight={i===0?'bold':'normal'} fill={effColor}
                              style={{ paintOrder:'stroke' }} stroke="#fff" strokeWidth="3" strokeLinejoin="round">{ln}</text>
                      ))}
                    </g>
                  );
                })()}
              </g>
            );
          })}

          {/* Cables are registered in the data model but not drawn on the canvas —
              they run inside the tray segments. Edit them via the Cables tab. */}

          {/* Rubber-band marquee selection box */}
          {marquee && (
            <rect
              x={Math.min(marquee.x0, marquee.x1)}
              y={Math.min(marquee.y0, marquee.y1)}
              width={Math.abs(marquee.x1 - marquee.x0)}
              height={Math.abs(marquee.y1 - marquee.y0)}
              fill="#2563eb" fillOpacity="0.12"
              stroke="#2563eb" strokeWidth="1.5" strokeDasharray="5,3"
              style={{ pointerEvents:'none' }}/>
          )}

          {/* Calibration points and line */}
          {calibPoints.map((pt, i) => (
            <g key={`calib${i}`}>
              <circle cx={pt.x} cy={pt.y} r="6" fill="#2563eb" stroke="#fff" strokeWidth="2" style={{ pointerEvents:'none' }}/>
              <text x={pt.x} y={pt.y - 10} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#2563eb" style={{ pointerEvents:'none' }}>{i+1}</text>
            </g>
          ))}
          {calibPoints.length === 2 && (
            <line x1={calibPoints[0].x} y1={calibPoints[0].y} x2={calibPoints[1].x} y2={calibPoints[1].y}
                  stroke="#2563eb" strokeWidth="2" strokeDasharray="4,3" style={{ pointerEvents:'none' }}/>
          )}

          {/* Measurement line + result label (press-drag) */}
          {measureResult && measureResult.points.length === 2 && (() => {
            const [a, b] = measureResult.points;
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            return (
              <g style={{ pointerEvents:'none', userSelect:'none', WebkitUserSelect:'none' }}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#059669" strokeWidth="2.5"/>
                <circle cx={a.x} cy={a.y} r="5" fill="#059669" stroke="#fff" strokeWidth="2"/>
                <circle cx={b.x} cy={b.y} r="5" fill="#059669" stroke="#fff" strokeWidth="2"/>
                <text x={mx} y={my - 8} textAnchor="middle" fontSize="13" fontWeight="bold" fill="#047857"
                      style={{ paintOrder:'stroke', userSelect:'none', WebkitUserSelect:'none' }} stroke="#fff" strokeWidth="4" strokeLinejoin="round">
                  {measureResult.m.toFixed(2)} m
                </text>
              </g>
            );
          })()}

          {/* Preview line during connect */}
          {connectFrom && lNodes[connectFrom] && (
            <line x1={lNodes[connectFrom].x} y1={lNodes[connectFrom].y}
                  x2={lNodes[connectFrom].x} y2={lNodes[connectFrom].y}
                  stroke="#a04500" strokeWidth="2" strokeDasharray="5,5"/>
          )}

          {/* Nodes */}
          {Object.entries(lNodes).map(([id, p]) => {
            const isFrom = connectFrom === id || cableFrom === id;
            const isMultiSel = selectedNodes.includes(id);
            const isSel = editNode === id || isMultiSel;
            const kind = p.kind || 'junction';
            // In cable mode, dim nodes that aren't valid targets
            let dim = false;
            if (mode === 'cable') {
              if (!cableFrom) dim = kind !== 'board';            // start: only boards
              else dim = kind === 'junction';                    // end: boards or loads, not junctions
            }
            // For junctions (point/T/corner): colour follows the connected network,
            // so a junction matches the føringsveje it sits on. Manual colour wins.
            let defStroke;
            if (kind === 'junction') {
              // find a segment touching this node and use its network colour
              const touchingSeg = Object.entries(lSegs).find(([sid, s]) => s.from === id || s.to === id);
              if (touchingSeg) {
                const netId = networkInfo.segNet[touchingSeg[0]];
                defStroke = (netId && networkInfo.byId[netId]) ? networkInfo.byId[netId].color : '#1565C0';
              } else {
                defStroke = '#1565C0';
              }
            } else {
              defStroke = kind==='board' ? '#0B3D91' : '#37474F';
            }
            const stroke = isFrom ? '#a04500' : (isSel ? '#9C5700' : (p.color || defStroke));
            const fill = isFrom ? '#FFE0B2' : (isSel ? '#FFF3CD' : (p.color ? lightenColor(p.color) : (kind==='board' ? '#E3F2FD' : kind==='load' ? '#ECEFF1' : (kind==='junction' ? lightenColor(defStroke) : '#fff'))));
            const nodeOpacity = dim ? 0.35 : (isSel || isFrom ? 1 : (p.opacity ?? 1));
            const common = {
              onClick:(e)=>onNodeTap(e, id),
              onDoubleClick:(e)=>onNodeDouble(e, id),
              onPointerDown:(e)=>startDrag(e, id),
              style:{ cursor: (mode==='connect'||mode==='cable') ? 'pointer' : 'move', touchAction:'none', opacity: nodeOpacity },
            };
            if (kind === 'board') {
              const bw = (p.size || 14) * 1.85, bh = (p.size || 14) * 1.07;
              return (
                <g key={id} {...common}>
                  <rect x={p.x-bw} y={p.y-bh} width={bw*2} height={bh*2} rx="3" fill={fill} stroke={stroke} strokeWidth="2.5"/>
                  <text x={p.x} y={p.y+1} textAnchor="middle" fontSize="11" fontWeight="bold" fill={stroke} style={{ pointerEvents:'none', userSelect:'none' }}>{id}</text>
                  {p.In_main ? <text x={p.x} y={p.y+bh*0.7} textAnchor="middle" fontSize="7" fill="#666" style={{ pointerEvents:'none' }}>{p.In_main}A</text> : null}
                  {Number(p.Ib) > 0 ? <text x={p.x} y={p.y-bh-3} textAnchor="middle" fontSize="8" fontWeight="bold" fill="#b45309" style={{ pointerEvents:'none', userSelect:'none' }}>⚡{p.Ib} A</text> : null}
                </g>
              );
            }
            if (kind === 'load') {
              const ls = (p.size || 14) * 1.14;
              return (
                <g key={id} {...common}>
                  <polygon points={`${p.x},${p.y-ls} ${p.x+ls},${p.y+ls*0.75} ${p.x-ls},${p.y+ls*0.75}`} fill={fill} stroke={stroke} strokeWidth="2.5" strokeLinejoin="round"/>
                  <text x={p.x} y={p.y+ls*0.5} textAnchor="middle" fontSize="10" fontWeight="bold" fill={stroke} style={{ pointerEvents:'none', userSelect:'none' }}>{id}</text>
                </g>
              );
            }
            // Junction: dot (circle), T-piece, corner, or cross — unified design.
            // Arm length and line thickness are FIXED; only the circle (end-cap)
            // size is adjustable, and it's a single global value for every junction.
            const jShape = p.shape || 'dot';
            const rot = p.rotation || 0;
            const jSize = 14;                                   // fixed arm length
            const sw = 4;                                       // fixed line thickness
            const endR = circleSize;                            // global circle radius
            const isJSel = editNode === id || selectedNodes.includes(id);
            // shared end-cap: white fill, coloured ring — matches the dot junction
            const endCap = (cx, cy, key) => (
              <circle key={key} cx={cx} cy={cy} r={endR} fill="#fff" stroke={stroke} strokeWidth="2"/>
            );
            if (jShape === 'tee') {
              const arm = jSize;
              const showRot = isJSel;
              return (
                <g key={id}>
                  <g {...common} transform={`rotate(${rot} ${p.x} ${p.y})`}>
                    <circle cx={p.x} cy={p.y} r={jSize+8} fill="transparent"/>
                    {isJSel && <circle cx={p.x} cy={p.y} r={jSize+5} fill="none" stroke="#9C5700" strokeWidth="1.5" strokeDasharray="3,2"/>}
                    <line x1={p.x-arm} y1={p.y} x2={p.x+arm} y2={p.y} stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
                    <line x1={p.x} y1={p.y} x2={p.x} y2={p.y+arm} stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
                    {endCap(p.x-arm, p.y, 'l')}
                    {endCap(p.x+arm, p.y, 'r')}
                    {endCap(p.x, p.y+arm, 'b')}
                    <text x={p.x} y={p.y-jSize*0.55} textAnchor="middle" fontSize="9" fontWeight="bold" fill={stroke} style={{ pointerEvents:'none', userSelect:'none' }} transform={`rotate(${-rot} ${p.x} ${p.y-jSize*0.55})`}>{id}</text>
                  </g>
                  {showRot && (
                    <g style={{ cursor:'grab', touchAction:'none' }} onPointerDown={(e)=>startRotateDrag(e, id)}>
                      <line x1={p.x} y1={p.y} x2={p.x} y2={p.y-jSize-18} stroke="#9C5700" strokeWidth="1.5" strokeDasharray="2,2"/>
                      <circle cx={p.x} cy={p.y-jSize-18} r="6" fill="#9C5700" stroke="#fff" strokeWidth="2"/>
                    </g>
                  )}
                </g>
              );
            }
            if (jShape === 'corner') {
              const arm = jSize;
              const showRot = isJSel;
              return (
                <g key={id}>
                  <g {...common} transform={`rotate(${rot} ${p.x} ${p.y})`}>
                    <circle cx={p.x} cy={p.y} r={jSize+8} fill="transparent"/>
                    {isJSel && <circle cx={p.x} cy={p.y} r={jSize+5} fill="none" stroke="#9C5700" strokeWidth="1.5" strokeDasharray="3,2"/>}
                    <polyline points={`${p.x-arm},${p.y} ${p.x},${p.y} ${p.x},${p.y+arm}`}
                              fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
                    {endCap(p.x-arm, p.y, 'l')}
                    {endCap(p.x, p.y+arm, 'b')}
                    <text x={p.x+jSize*0.4} y={p.y-jSize*0.4} textAnchor="start" fontSize="9" fontWeight="bold" fill={stroke} style={{ pointerEvents:'none', userSelect:'none' }} transform={`rotate(${-rot} ${p.x+jSize*0.4} ${p.y-jSize*0.4})`}>{id}</text>
                  </g>
                  {showRot && (
                    <g style={{ cursor:'grab', touchAction:'none' }} onPointerDown={(e)=>startRotateDrag(e, id)}>
                      <line x1={p.x} y1={p.y} x2={p.x} y2={p.y-jSize-18} stroke="#9C5700" strokeWidth="1.5" strokeDasharray="2,2"/>
                      <circle cx={p.x} cy={p.y-jSize-18} r="6" fill="#9C5700" stroke="#fff" strokeWidth="2"/>
                    </g>
                  )}
                </g>
              );
            }
            if (jShape === 'cross') {
              const arm = jSize;
              const showRot = isJSel;
              return (
                <g key={id}>
                  <g {...common} transform={`rotate(${rot} ${p.x} ${p.y})`}>
                    <circle cx={p.x} cy={p.y} r={jSize+8} fill="transparent"/>
                    {isJSel && <circle cx={p.x} cy={p.y} r={jSize+5} fill="none" stroke="#9C5700" strokeWidth="1.5" strokeDasharray="3,2"/>}
                    <line x1={p.x-arm} y1={p.y} x2={p.x+arm} y2={p.y} stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
                    <line x1={p.x} y1={p.y-arm} x2={p.x} y2={p.y+arm} stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
                    {endCap(p.x-arm, p.y, 'l')}
                    {endCap(p.x+arm, p.y, 'r')}
                    {endCap(p.x, p.y-arm, 't')}
                    {endCap(p.x, p.y+arm, 'b')}
                    <text x={p.x+jSize*0.55} y={p.y-jSize*0.55} textAnchor="start" fontSize="9" fontWeight="bold" fill={stroke} style={{ pointerEvents:'none', userSelect:'none' }} transform={`rotate(${-rot} ${p.x+jSize*0.55} ${p.y-jSize*0.55})`}>{id}</text>
                  </g>
                  {showRot && (
                    <g style={{ cursor:'grab', touchAction:'none' }} onPointerDown={(e)=>startRotateDrag(e, id)}>
                      <line x1={p.x} y1={p.y} x2={p.x} y2={p.y-jSize-18} stroke="#9C5700" strokeWidth="1.5" strokeDasharray="2,2"/>
                      <circle cx={p.x} cy={p.y-jSize-18} r="6" fill="#9C5700" stroke="#fff" strokeWidth="2"/>
                    </g>
                  )}
                </g>
              );
            }
            return (
              <g key={id} {...common}>
                {isJSel && <circle cx={p.x} cy={p.y} r={endR+4} fill="none" stroke="#9C5700" strokeWidth="1.5" strokeDasharray="3,2"/>}
                <circle cx={p.x} cy={p.y} r={jSize+8} fill="transparent"/>
                <circle cx={p.x} cy={p.y} r={endR} fill="#fff" stroke={stroke} strokeWidth="2"/>
                <text x={p.x} y={p.y-endR-3} textAnchor="middle" fontSize="9" fontWeight="bold" fill={stroke} style={{ pointerEvents:'none', userSelect:'none' }}>{id}</text>
              </g>
            );
          })}

          {/* Cross-drawing link badges — click to jump to the linked drawing */}
          {Object.entries(lNodes).filter(([id, p]) => p && p.link).map(([id, p]) => {
            const lk = p.link;
            const label = `⛓ ${lk.name}`;
            const w = 12 + label.length * 6;
            const bx = p.x + 12, by = p.y - 30;
            return (
              <g key={'link-'+id} style={{ cursor:'pointer' }}
                 onPointerDown={(e)=>e.stopPropagation()}
                 onClick={(e)=>{ e.stopPropagation(); goToLink(lk); }}>
                <line x1={p.x} y1={p.y} x2={bx+6} y2={by+16} stroke="#44403c" strokeWidth="1" strokeDasharray="2,2" opacity="0.5"/>
                <rect x={bx} y={by} width={w} height={16} rx={5} fill="#44403c" opacity="0.95"/>
                <text x={bx+6} y={by+11} fontSize="9" fontWeight="bold" fill="#fff" style={{ userSelect:'none' }}>{label}</text>
              </g>
            );
          })}
        </svg>

        {/* Empty state — hidden as soon as any object is placed */}
        {Object.keys(lNodes).length === 0 && Object.keys(lSegs).length === 0 && lCables.length === 0 && !lBg && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-stone-400 px-6">
              <Pencil size={48} className="mx-auto mb-2 opacity-50"/>
              <p className="text-sm">Placér tavler, laster og knudepunkter</p>
              <p className="text-xs mt-1">Skift til <b>Forbind</b> for at tegne føringsveje og kabler imellem</p>
            </div>
          </div>
        )}

        {/* Legend overlay */}
        {Object.keys(lNodes).length > 0 && (
          <div className="absolute top-2 left-2 bg-white/90 backdrop-blur rounded-lg shadow px-2 py-1.5 text-xs space-y-1 pointer-events-none">
            <div className="flex items-center gap-1.5">
              <svg width="20" height="14"><rect x="2" y="1" width="16" height="11" rx="2" fill="#E3F2FD" stroke="#0B3D91" strokeWidth="1.5"/></svg>
              <span>Tavle</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="20" height="14"><polygon points="10,1 18,13 2,13" fill="#ECEFF1" stroke="#37474F" strokeWidth="1.5" strokeLinejoin="round"/></svg>
              <span>Last</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="20" height="14"><circle cx="10" cy="7" r="6" fill="#fff" stroke="#1565C0" strokeWidth="1.5"/></svg>
              <span>Punkt</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="20" height="14"><line x1="3" y1="5" x2="17" y2="5" stroke="#1565C0" strokeWidth="2" strokeLinecap="round"/><line x1="10" y1="5" x2="10" y2="12" stroke="#1565C0" strokeWidth="2" strokeLinecap="round"/></svg>
              <span>T-stykke</span>
            </div>
          </div>
        )}

        {/* Tray-width legend — width is shown by line thickness (colour = network) */}
        {(() => {
          const widthsUsed = Array.from(new Set(
            Object.values(lSegs).map(s => trayTypes[s.tray_type]?.width_mm).filter(Boolean)
          )).sort((a,b)=>a-b);
          if (widthsUsed.length === 0) return null;
          return (
            <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur rounded-lg shadow px-2 py-1.5 text-xs space-y-1 pointer-events-none">
              <div className="font-semibold text-stone-600 mb-0.5">Bredde = tykkelse</div>
              {widthsUsed.map(w => (
                <div key={w} className="flex items-center gap-1.5">
                  <svg width="26" height="12"><line x1="2" y1="6" x2="24" y2="6" stroke="#78716c" strokeWidth={Math.min(9, trayWidthStroke(w))} strokeLinecap="round"/></svg>
                  <span>{w} mm</span>
                </div>
              ))}
              <div className="text-[10px] text-stone-400 pt-0.5 border-t border-stone-200 mt-0.5">Farve = netværk</div>
            </div>
          );
        })()}

        {/* Calibration status bar — sits at the top of the canvas (below the toolbar) */}
        {calibrating && (
          <div className="absolute top-0 left-0 right-0 bg-stone-700 text-white text-xs text-center py-2 px-3 z-20 flex items-center justify-center gap-2">
            <MousePointer2 size={14}/>
            {calibPoints.length === 0 ? 'Tap punkt 1 på tegningen' : 'Tap punkt 2 (kendt afstand fra punkt 1)'}
            <button onClick={()=>{ setCalibrating(false); setCalibPoints([]); setBgStatus(null); }} className="ml-2 underline">Annuller</button>
          </div>
        )}

        {/* Measurement status bar — sits at the top of the canvas (below the toolbar) */}
        {measuring && (
          <div className="absolute top-0 left-0 right-0 bg-emerald-600 text-white text-xs text-center py-2 px-3 z-20 flex items-center justify-center gap-2">
            <MousePointer2 size={14}/>
            {measureResult && measureResult.m > 0
              ? <span className="font-semibold">Målt afstand: {measureResult.m.toFixed(2)} m — træk igen for ny måling</span>
              : 'Træk fra punkt A til punkt B for at måle'}
            <button onClick={()=>{ setMeasuring(false); setMeasureResult(null); measureDragRef.current = null; setBgStatus(null); }} className="ml-2 underline">Luk</button>
          </div>
        )}
      </div>

      {/* Status footer */}
      <div className="bg-stone-100 px-3 py-1.5 text-xs text-stone-600 flex justify-between border-t">
        <span>
          {Object.values(lNodes).filter(n=>(n.kind||'junction')==='junction').length} knuder ·{' '}
          {Object.values(lNodes).filter(n=>n.kind==='board').length} tavler ·{' '}
          {Object.values(lNodes).filter(n=>n.kind==='load').length} laster ·{' '}
          {Object.keys(lSegs).length} segm. · {lCables.length} kabler
        </span>
        <span className="hidden sm:inline">1 m = {PX_PER_M} px</span>
      </div>

      {/* Pending segment dialog */}
      {pending && (
        <div className="absolute inset-0 bg-black/50 z-10 flex items-end lg:items-center justify-center p-4">
          <div className="bg-white p-4 rounded-2xl w-full lg:max-w-md max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold mb-3 text-stone-800">Ny føringsvej: {pending.from} → {pending.to}</h3>
            {(() => {
              const a = lNodes[pending.from], b = lNodes[pending.to];
              const isBoardLoad = (a?.kind==='board' && b?.kind==='load') || (b?.kind==='board' && a?.kind==='load');
              return isBoardLoad ? (
                <p className="text-xs text-green-700 bg-green-50 rounded-lg p-2 mb-3">⚡ Tavle → last: der oprettes automatisk et kabel med korteste rute. Du kan ændre kablets rute i Kabler-fanen.</p>
              ) : (
                <p className="text-xs text-stone-500 mb-3">Auto-beregnet længde fra skærm-distance. Tilret hvis nødvendigt. Kabler tilføjes separat i Kabel-mode.</p>
              );
            })()}
            <FormField label="Længde [m]" type="number" step="0.5" value={pending.length_m} onChange={v=>setPending({...pending, length_m: v})}/>
            <Selector label="Tray type" value={pending.tray_type} onChange={v=>setPending({...pending, tray_type: v})} options={Object.keys(trayTypes)}/>
            <div className="flex gap-2 mt-3">
              <button onClick={()=>setPending(null)} className="flex-1 py-3 border border-stone-300 rounded-lg font-semibold">Annuller</button>
              <button onClick={confirmPending} className="flex-1 py-3 bg-stone-800 text-white rounded-lg font-semibold">Opret</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit node dialog */}
      {editNode && <NodeEditDialog id={editNode} setId={setEditNode} lNodes={lNodes} renameNode={renameNode} deleteNode={deleteNode} updateNode={updateNode} nodeConnCount={nodeConnCount} cableConnCount={cableConnCount} trayTypes={trayTypes} circleSize={circleSize} updateCircleSize={updateCircleSize}/>}
      {multiEdit && <MultiEditModal kind={multiEdit.kind} ids={selectedNodes} close={()=>setMultiEdit(null)}
        lNodes={lNodes} trayTypes={trayTypes} circleSize={circleSize} updateCircleSize={updateCircleSize}
        openNode={(id)=>{ setMultiEdit(null); setEditNode(id); }}
        applyToAll={(patch)=>{
          setLNodes(prev => {
            const next = { ...prev };
            selectedNodes.forEach(nid => { if (next[nid]) next[nid] = { ...next[nid], ...patch }; });
            return next;
          });
          setMultiEdit(null);
        }}
        deleteAll={()=>{
          setLNodes(prev => {
            const next = { ...prev };
            selectedNodes.forEach(nid => delete next[nid]);
            return next;
          });
          // also remove segments/cables touching deleted nodes
          setLSegs(prev => {
            const next = {};
            Object.entries(prev).forEach(([sid, s]) => { if (!selectedNodes.includes(s.from) && !selectedNodes.includes(s.to)) next[sid] = s; });
            return next;
          });
          selectedNodesRef.current = []; setSelectedNodes([]); setMultiEdit(null);
        }}
      />}

      {/* Edit segment dialog */}
      {editSeg && <SegEditDialog id={editSeg} setId={setEditSeg} lSegs={lSegs} trayTypes={trayTypes} updateSeg={updateSeg} deleteSeg={deleteSeg} addWaypoint={addWaypoint} removeWaypoint={removeWaypoint} straightenOne={straightenOne}/>}
      {linkDialog && <LinkDialog fromNodeId={linkDialog.nodeId}
                                 projects={(projectList||[]).filter(p => p.id !== activeProjectId)}
                                 loadDrawingNodes={loadDrawingNodes}
                                 onConfirm={(pid, nid)=>createLink(linkDialog.nodeId, pid, nid)}
                                 onClose={()=>setLinkDialog(null)}/>}
      {catEdit && networkInfo.byId[catEdit] && (
        <CategoryEditModal
          net={networkInfo.byId[catEdit]}
          netIndex={colorCategories.findIndex(c => c.id === catEdit)}
          lSegs={lSegs} lNodes={lNodes} trayTypes={trayTypes}
          circleSize={circleSize} updateCircleSize={updateCircleSize}
          close={()=>setCatEdit(null)}
          openSeg={(id)=>{ setCatEdit(null); setEditSeg(id); }}
          openNode={(id)=>{ setCatEdit(null); setEditNode(id); }}
          setCommonTrayType={(tt)=>setNetworkTrayType(catEdit, tt)}
          setNetworkColor={(c)=>setNetworkColor(catEdit, c)}
        />
      )}

      {/* Calibration in-progress banner */}
      {/* Right-click context menu — Windows-style popup with the program's tools,
          custom design, submenus on hover */}
      {ctxMenu && (() => {
        const W = (typeof window!=='undefined'?window.innerWidth:1000);
        const H = (typeof window!=='undefined'?window.innerHeight:800);
        const menuW = 248;
        const left = Math.min(ctxMenu.x, W - menuW - 8);
        const top = Math.min(ctxMenu.y, H - 430);
        const subLeft = (left + menuW + 210 > W);  // open submenus to the left if tight
        const subCls = `absolute ${subLeft ? 'right-full mr-1' : 'left-full ml-1'} top-0 bg-white rounded-xl shadow-2xl ring-1 ring-black/5 border border-stone-100 py-1.5 w-52 overflow-hidden`;
        const subClsOpen = `absolute ${subLeft ? 'right-full mr-1' : 'left-full ml-1'} top-0 bg-white rounded-xl shadow-2xl ring-1 ring-black/5 border border-stone-100 py-1.5 w-52 overflow-visible`;
        const item = "w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-stone-100 active:bg-stone-200 transition-colors";
        return (
        <>
          <div className="fixed inset-0 z-30" onClick={()=>{ setCtxMenu(null); setCtxSub(null); setCtxSub2(null); }} onContextMenu={(e)=>{ e.preventDefault(); setCtxMenu(null); setCtxSub(null); setCtxSub2(null); }}/>
          <div className="fixed z-40 bg-white rounded-xl shadow-2xl ring-1 ring-black/5 border border-stone-100 py-1.5 text-sm w-62 overflow-visible"
               style={{ left, top, width: menuW }}
               onClick={e=>e.stopPropagation()} onContextMenu={e=>{ e.preventDefault(); e.stopPropagation(); }}>

            <div className="px-3 pb-1.5 pt-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-400">Værktøjer</div>

            {/* Delete selected — only when something is selected */}
            {(selectedNodes.length > 0 || selectedSeg) && (
              <>
                <button onClick={()=>{ deleteSelected(); setCtxMenu(null); }} onMouseEnter={()=>setCtxSub(null)}
                        className={`${item} text-red-600 font-semibold`}>
                  <Trash2 size={15} className="text-red-600"/>
                  {selectedNodes.length > 1 ? `Slet ${selectedNodes.length} markerede` : 'Slet markeret'}
                </button>
                <div className="border-t border-stone-100 my-1.5 mx-2"></div>
              </>
            )}

            {/* Link a single node to a point on another drawing */}
            {selectedNodes.length === 1 && (
              <>
                <button onClick={()=>{ setLinkDialog({ nodeId: selectedNodes[0] }); setCtxMenu(null); }} onMouseEnter={()=>setCtxSub(null)}
                        className={item}><Link2 size={15} className="text-stone-700"/> Forbind til anden tegning</button>
                {lNodes[selectedNodes[0]]?.link && (
                  <button onClick={()=>{ removeLink(selectedNodes[0]); setCtxMenu(null); }} onMouseEnter={()=>setCtxSub(null)}
                          className={item}><X size={15} className="text-stone-500"/> Fjern link ({lNodes[selectedNodes[0]].link.name})</button>
                )}
                <div className="border-t border-stone-100 my-1.5 mx-2"></div>
              </>
            )}

            {/* Tilføj nyt objekt → submenu of categories */}
            <div className="relative" onMouseEnter={()=>{ setCtxSub('add'); setCtxSub2(null); }}>
              <button className={`${item} justify-between ${ctxSub==='add'?'bg-stone-100':''}`}>
                <span className="flex items-center gap-2.5"><Plus size={15} className="text-stone-700"/> Tilføj nyt objekt</span>
                <ChevronRight size={14} className="text-stone-400"/>
              </button>
              {ctxSub==='add' && (
                <div className={subClsOpen}>
                  {/* Føringsveje → nested submenu of segment options */}
                  <div className="relative" onMouseEnter={()=>setCtxSub2('trays')}>
                    <button className={`${item} justify-between ${ctxSub2==='trays'?'bg-stone-100':''}`}>
                      <span className="flex items-center gap-2.5"><GitBranch size={15} className="text-stone-700"/> Føringsveje</span>
                      <ChevronRight size={14} className="text-stone-400"/>
                    </button>
                    {ctxSub2==='trays' && (
                      <div className={subCls}>
                        <button onClick={()=>ctxPickTray('dot')} className={item}>
                          <svg width="16" height="16" viewBox="0 0 22 22"><circle cx="11" cy="11" r="6" fill="#fff" stroke="#8a7f63" strokeWidth="2"/></svg> Punkt
                        </button>
                        <button onClick={()=>ctxPickTray('tee')} className={item}>
                          <svg width="16" height="16" viewBox="0 0 22 22"><line x1="3" y1="8" x2="19" y2="8" stroke="#8a7f63" strokeWidth="2.5" strokeLinecap="round"/><line x1="11" y1="8" x2="11" y2="19" stroke="#8a7f63" strokeWidth="2.5" strokeLinecap="round"/></svg> T-stykke
                        </button>
                        <button onClick={()=>ctxPickTray('corner')} className={item}>
                          <svg width="16" height="16" viewBox="0 0 22 22"><polyline points="5,4 5,15 16,15" fill="none" stroke="#8a7f63" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Hjørne
                        </button>
                        <button onClick={()=>ctxPickTray('cross')} className={item}>
                          <svg width="16" height="16" viewBox="0 0 22 22"><line x1="3" y1="11" x2="19" y2="11" stroke="#8a7f63" strokeWidth="2.5" strokeLinecap="round"/><line x1="11" y1="3" x2="11" y2="19" stroke="#8a7f63" strokeWidth="2.5" strokeLinecap="round"/></svg> Kryds
                        </button>
                        <div className="border-t border-stone-100 my-1 mx-2"></div>
                        <button onClick={()=>ctxPickTray('segment')} className={item}>
                          <Link2 size={15} className="text-stone-700"/> Tilføj føringsvejssegment
                        </button>
                      </div>
                    )}
                  </div>
                  <button onClick={()=>{ setAddPanel(true); selectAddCategory('boards'); setHideChrome(false); setCtxMenu(null); }} onMouseEnter={()=>setCtxSub2(null)} className={item}><Database size={15} className="text-stone-700"/> Tavler</button>
                  <button onClick={()=>{ setAddPanel(true); selectAddCategory('loads'); setHideChrome(false); setCtxMenu(null); }} onMouseEnter={()=>setCtxSub2(null)} className={item}><Zap size={15} className="text-stone-700"/> Laster</button>
                  <button onClick={()=>{ setAddPanel(true); selectAddCategory('cables'); setHideChrome(false); setCtxMenu(null); }} onMouseEnter={()=>setCtxSub2(null)} className={item}><Cable size={15} className="text-stone-700"/> Kabler</button>
                </div>
              )}
            </div>

            {/* Visning → submenu of view toggles */}
            <div className="relative" onMouseEnter={()=>setCtxSub('view')}>
              <button className={`${item} justify-between ${ctxSub==='view'?'bg-stone-100':''}`}>
                <span className="flex items-center gap-2.5"><Grid3x3 size={15} className="text-stone-600"/> Visning</span>
                <ChevronRight size={14} className="text-stone-400"/>
              </button>
              {ctxSub==='view' && (
                <div className={subCls}>
                  <button onClick={()=>{ setShowGrid(g=>!g); }} className={item}><Grid3x3 size={15} className="text-stone-600"/> Grid <span className="ml-auto text-xs text-stone-400">{showGrid?'til':'fra'}</span></button>
                  <button onClick={()=>{ zoomBy(1.25); }} className={item}><ZoomIn size={15} className="text-stone-600"/> Zoom ind</button>
                  <button onClick={()=>{ zoomBy(1/1.25); }} className={item}><ZoomOut size={15} className="text-stone-600"/> Zoom ud</button>
                  <button onClick={()=>{ fitView(); setCtxMenu(null); }} className={item}><MousePointer2 size={15} className="text-stone-600"/> Tilpas (Fit)</button>
                  <button onClick={()=>{ setShowLegends(v=>!v); }} className={item}><FileText size={15} className="text-stone-600"/> Legender <span className="ml-auto text-xs text-stone-400">{showLegends?'til':'fra'}</span></button>
                  <button onClick={()=>{ setCatPanel(p=>!p); setCtxMenu(null); }} className={item}><Layers size={15} className="text-stone-600"/> Kategorier</button>
                  <button onClick={()=>{ setShowTools(v=>!v); }} className={item}><Grid3x3 size={15} className="text-stone-600"/> Værktøjslinje <span className="ml-auto text-xs text-stone-400">{showTools?'skjul':'vis'}</span></button>
                </div>
              )}
            </div>

            {/* Tegningsgrundlag + måling */}
            <button onClick={()=>{ setHideChrome(false); setBgPanel(true); setCtxMenu(null); }} onMouseEnter={()=>setCtxSub(null)}
                    className={item}><FileText size={15} className="text-emerald-700"/> Juster tegningsgrundlag</button>
            <button onClick={()=>{ setMeasuring(true); setMeasureResult(null); setCalibrating(false); setBgPanel(false); setCtxMenu(null); }} onMouseEnter={()=>setCtxSub(null)}
                    className={item}><MousePointer2 size={15} className="text-emerald-700"/> Mål afstand</button>

            <div className="border-t border-stone-100 my-1.5 mx-2"></div>

            {/* Direct actions */}
            <button onClick={()=>{ straightenAll(); setCtxMenu(null); }} onMouseEnter={()=>setCtxSub(null)}
                    className={item}><GitBranch size={15} className="text-amber-600"/> Ret alt op</button>
            <button onClick={()=>{ renumber(); setCtxMenu(null); }} onMouseEnter={()=>setCtxSub(null)}
                    className={item}><RefreshCw size={15} className="text-purple-600"/> Nummerér føringsveje</button>
            <button onClick={()=>{ undo(); setCtxMenu(null); }} disabled={!canUndo} onMouseEnter={()=>setCtxSub(null)}
                    className={`${item} ${canUndo?'':'opacity-40 cursor-not-allowed'}`}><RefreshCw size={15} className="text-stone-600" style={{ transform:'scaleX(-1)' }}/> Fortryd</button>

            <div className="border-t border-stone-100 my-1.5 mx-2"></div>

            <button onClick={()=>{ toggleAutoSave(); }} onMouseEnter={()=>setCtxSub(null)}
                    className={item}><RefreshCw size={15} className={autoSave?'text-emerald-600':'text-stone-500'}/> Auto-gem <span className="ml-auto text-xs text-stone-400">{autoSave?'TIL':'FRA'}</span></button>
            <button onClick={()=>{ save(); }} onMouseEnter={()=>setCtxSub(null)}
                    className={`${item} text-stone-800 font-semibold`}><Save size={15} className="text-stone-700"/> Gem &amp; luk</button>
          </div>
        </>
        );
      })()}

      {/* Calibration distance dialog */}
      {calibDialog && (
        <div className="absolute inset-0 bg-black/50 z-20 flex items-end lg:items-center justify-center p-4">
          <div className="bg-white p-4 rounded-2xl w-full lg:max-w-sm">
            <h3 className="font-bold mb-2 text-stone-800 flex items-center gap-2"><MousePointer2 size={18}/> Kalibrér målestok</h3>
            <p className="text-xs text-stone-500 mb-3">Hvor lang er afstanden mellem de to punkter i virkeligheden?</p>
            <div className="flex items-center gap-2">
              <input id="calib-input" type="number" step="0.1" autoFocus placeholder="fx 5"
                     className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-lg"
                     onKeyDown={e=>{ if(e.key==='Enter'){ applyCalibration(Number(e.target.value)); } }}/>
              <span className="text-stone-600 font-semibold">meter</span>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={()=>{ setCalibDialog(null); setCalibPoints([]); }} className="flex-1 py-3 border border-stone-300 rounded-lg font-semibold">Annuller</button>
              <button onClick={()=>{ const el=document.getElementById('calib-input'); applyCalibration(Number(el?.value)); }} className="flex-[2] py-3 bg-stone-700 text-white rounded-lg font-semibold">Sæt målestok</button>
            </div>
          </div>
        </div>
      )}

      {/* Pending cable dialog */}
      {pendingCable && (
        <div className="absolute inset-0 bg-black/50 z-10 flex items-end lg:items-center justify-center p-4">
          <div className="bg-white p-4 rounded-2xl w-full lg:max-w-md max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold mb-1 text-stone-800 flex items-center gap-2"><Cable size={18}/> Nyt kabel: {pendingCable.from} → {pendingCable.to}</h3>
            {pendingCable.noPath ? (
              <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2 mb-2 text-amber-900">
                Ingen føringsvej fundet. Kablet oprettes uden rute — tegn føringsvejene mellem tavlen og lasten først, eller tilføj segmenter til ruten i Cables-fanen.
              </div>
            ) : (
              <div className="text-xs bg-green-50 border border-green-200 rounded p-2 mb-2 text-green-900">
                Rute fundet automatisk: {pendingCable.route.length} segment(er) → {pendingCable.route.join(' → ')}
              </div>
            )}
            {pendingCable.adoptedFromLoad && (
              <div className="text-xs bg-stone-100 border border-stone-300 rounded p-2 mb-3 text-stone-800">
                Kabeldata er automatisk overtaget fra lasten {pendingCable.to} (Ib, In, V, faser, funktion). Tilret om nødvendigt.
              </div>
            )}
            <Selector label="Funktion" value={pendingCable.cable_function} onChange={v=>setPendingCable({...pendingCable, cable_function: v})} options={FUNCTIONS}/>
            <Selector label="Kabeltype" value={pendingCable.cable_type} onChange={v=>setPendingCable({...pendingCable, cable_type: v})} options={Object.keys(cableTypes)}/>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="Ib [A]" type="number" value={pendingCable.Ib} onChange={v=>setPendingCable({...pendingCable, Ib: v})}/>
              <FormField label="In [A]" type="number" value={pendingCable.In} onChange={v=>setPendingCable({...pendingCable, In: v})}/>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <FormField label="V" type="number" value={pendingCable.V} onChange={v=>setPendingCable({...pendingCable, V: v})}/>
              <FormField label="Faser" type="number" value={pendingCable.phases} onChange={v=>setPendingCable({...pendingCable, phases: v})}/>
              <FormField label="cos φ" type="number" step="0.01" value={pendingCable.cos_phi} onChange={v=>setPendingCable({...pendingCable, cos_phi: v})}/>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={()=>setPendingCable(null)} className="flex-1 py-3 border border-stone-300 rounded-lg font-semibold">Annuller</button>
              <button onClick={confirmPendingCable} className="flex-1 py-3 bg-stone-800 text-white rounded-lg font-semibold">Opret kabel</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit cable dialog */}
      {editCable && (() => {
        const c = lCables.find(x => x.id === editCable);
        if (!c) return null;
        return (
          <div className="absolute inset-0 bg-black/50 z-10 flex items-end lg:items-center justify-center p-4" onClick={()=>setEditCable(null)}>
            <div className="bg-white p-4 rounded-2xl w-full lg:max-w-md max-h-[85vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
              <h3 className="font-bold mb-1 text-stone-800 flex items-center gap-2"><Cable size={18}/> {c.id}: {c.from} → {c.to}</h3>
              <div className="text-xs text-stone-500 mb-2">Rute: {(c.route||[]).join(' → ') || '(ingen)'}</div>

              {/* Route editing — auto shortest path or manual entry */}
              <div className="border border-stone-200 bg-stone-100/40 rounded-lg p-2 mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-stone-800">Føringsvej for kablet</span>
                  <button onClick={()=>{ const r = findRoute(lSegs, c.from, c.to); updateCable(c.id, { route: r || [] }); }}
                          className="text-xs px-2 py-1 bg-stone-800 text-white rounded flex items-center gap-1">
                    <RefreshCw size={11}/> Korteste rute
                  </button>
                </div>
                <label className="block text-[11px] text-stone-600 mb-1">Manuel rute (segment-ID'er adskilt med komma)</label>
                <input type="text" defaultValue={(c.route||[]).join(', ')}
                       onBlur={e=>{
                         const ids = e.target.value.split(',').map(x=>x.trim()).filter(Boolean);
                         const valid = ids.filter(x => lSegs[x]);
                         updateCable(c.id, { route: valid });
                       }}
                       placeholder="fx WC001, WC003, WC005"
                       className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm"/>
                <p className="text-[11px] text-stone-400 mt-1">Ukendte segment-ID'er ignoreres. Forlad feltet for at gemme ruten.</p>
              </div>

              <Selector label="Funktion" value={c.function} onChange={v=>updateCable(c.id, { function: v })} options={FUNCTIONS}/>
              <Selector label="Kabeltype" value={c.cable_type} onChange={v=>updateCable(c.id, { cable_type: v })} options={Object.keys(cableTypes)}/>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="Ib [A]" type="number" value={c.Ib} onChange={v=>updateCable(c.id, { Ib: Number(v) })}/>
                <FormField label="In [A]" type="number" value={c.In} onChange={v=>updateCable(c.id, { In: Number(v) })}/>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <FormField label="V" type="number" value={c.V} onChange={v=>updateCable(c.id, { V: Number(v) })}/>
                <FormField label="Faser" type="number" value={c.phases} onChange={v=>updateCable(c.id, { phases: Number(v) })}/>
                <FormField label="cos φ" type="number" step="0.01" value={c.cos_phi} onChange={v=>updateCable(c.id, { cos_phi: Number(v) })}/>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={()=>deleteCable(c.id)} className="flex-1 py-3 bg-red-600 text-white rounded-lg font-semibold flex items-center justify-center gap-1"><Trash2 size={14}/> Slet</button>
                <button onClick={()=>setEditCable(null)} className="flex-[2] py-3 bg-stone-800 text-white rounded-lg font-semibold">Luk</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function ToolBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1 ${active?'bg-stone-800 text-white':'bg-white text-stone-700 border border-stone-300'}`}>
      <Icon size={14}/> {label}
    </button>
  );
}

function NodeEditDialog({ id, setId, lNodes, renameNode, deleteNode, updateNode, nodeConnCount, cableConnCount, trayTypes, circleSize, updateCircleSize }) {
  const node = lNodes[id];
  const [name, setName] = useState(id);
  const [kind, setKind] = useState(node.kind || 'junction');
  const [nameErr, setNameErr] = useState('');
  const [meta, setMeta] = useState({
    board_type: node.board_type || 'Sub-board',
    In_main: node.In_main || 0,
    function: node.function || 'Socket circuit',
    V: node.V ?? (node.kind === 'board' ? 400 : 230), phases: node.phases ?? (node.kind === 'board' ? 3 : 1),
    Ib: node.Ib ?? 0, In: node.In ?? 0, cos_phi: node.cos_phi ?? 0.9,
    shape: node.shape || 'dot', size: node.size || 14, rotation: node.rotation || 0,
    tray_type: node.tray_type || '',
    color: node.color || '',
  });
  const setM = (k, v) => setMeta({ ...meta, [k]: v });
  const connCount = nodeConnCount(id);
  const cabCount = cableConnCount ? cableConnCount(id) : 0;

  const saveAll = () => {
    if (name !== id && lNodes[name]) { setNameErr(`${name} eksisterer allerede`); return; }
    const update = { kind, color: meta.color || undefined, size: Number(meta.size) };
    if (kind === 'board') {
      update.board_type = meta.board_type; update.In_main = Number(meta.In_main);
      // Consumption on the board (for dimensioning the feeding main cable)
      update.Ib = Number(meta.Ib) || 0; update.V = Number(meta.V) || 400;
      update.phases = Number(meta.phases) || 3; update.cos_phi = Number(meta.cos_phi) || 0.9;
    }
    else if (kind === 'load') {
      update.function = meta.function; update.V = Number(meta.V); update.phases = Number(meta.phases);
      update.Ib = Number(meta.Ib); update.In = Number(meta.In); update.cos_phi = Number(meta.cos_phi);
    }
    else if (kind === 'junction') {
      update.shape = meta.shape; update.size = Number(meta.size); update.rotation = Number(meta.rotation);
      update.tray_type = meta.tray_type || undefined;
    }
    updateNode(id, update);
    if (name !== id) renameNode(id, name);
    else setId(null);
  };

  return (
    <div className="absolute inset-0 bg-black/50 z-10 flex items-end lg:items-center justify-center p-4" onClick={()=>setId(null)}>
      <div className="bg-white p-4 rounded-2xl w-full lg:max-w-md max-h-[85vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <h3 className="font-bold mb-3 text-stone-800">Rediger: {id}</h3>

        <div className="flex gap-1 mb-3">
          {[['junction','Knude'],['board','Tavle'],['load','Last']].map(([k,l]) => (
            <button key={k} onClick={()=>setKind(k)} className={`flex-1 py-2 rounded text-sm font-semibold ${kind===k?'bg-stone-800 text-white':'bg-stone-100 text-stone-700'}`}>{l}</button>
          ))}
        </div>

        <FormField label="Navn / ID" value={name} onChange={(v)=>{ setName(v); setNameErr(''); }} hint={nameErr || (kind==='board'?'fx Q1, HT1, UT-IT-A':kind==='load'?'fx X1, Rack-01, CRAH-01':'fx N1, N2')}/>
        {nameErr && <p className="text-xs text-red-600 -mt-2 mb-2">{nameErr}</p>}

        {kind === 'board' && (
          <div className="border border-stone-200 rounded-lg p-2 mb-2 space-y-1 bg-stone-100/40">
            <Selector label="Tavle-type" value={meta.board_type} onChange={v=>setM('board_type', v)} options={['Main board','Sub-board','UPS','Distribution','PDU']}/>
            <FormField label="Hovedbryder In [A]" type="number" value={meta.In_main} onChange={v=>setM('In_main', v)} hint="0 = ikke angivet"/>
            <div className="pt-1 mt-1 border-t border-stone-200/70">
              <p className="text-[11px] text-stone-500 mb-1">Forbrug på tavlen (bruges til at dimensionere hovedkablet — uden at tilføje en last)</p>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="Forbrug Ib [A]" type="number" value={meta.Ib} onChange={v=>setM('Ib', v)} hint="0 = intet forbrug"/>
                <FormField label="cos φ" type="number" step="0.01" value={meta.cos_phi} onChange={v=>setM('cos_phi', v)}/>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="V" type="number" value={meta.V} onChange={v=>setM('V', v)}/>
                <FormField label="Faser" type="number" value={meta.phases} onChange={v=>setM('phases', v)}/>
              </div>
            </div>
          </div>
        )}

        {kind === 'load' && (
          <div className="border border-stone-200 rounded-lg p-2 mb-2 space-y-1 bg-stone-50">
            <Selector label="Funktion" value={meta.function} onChange={v=>setM('function', v)} options={FUNCTIONS}/>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="Ib [A]" type="number" value={meta.Ib} onChange={v=>setM('Ib', v)}/>
              <FormField label="In [A]" type="number" value={meta.In} onChange={v=>setM('In', v)}/>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <FormField label="V" type="number" value={meta.V} onChange={v=>setM('V', v)}/>
              <FormField label="Faser" type="number" value={meta.phases} onChange={v=>setM('phases', v)}/>
              <FormField label="cos φ" type="number" step="0.01" value={meta.cos_phi} onChange={v=>setM('cos_phi', v)}/>
            </div>
          </div>
        )}

        {kind === 'junction' && (
          <div className="border border-stone-200 rounded-lg p-2 mb-2 space-y-2 bg-stone-100/40">
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Form</label>
              <div className="flex gap-1">
                {[['dot','Punkt'],['tee','T-stykke'],['corner','Hjørne'],['cross','Kryds']].map(([k,l]) => (
                  <button key={k} onClick={()=>setM('shape', k)}
                          className={`flex-1 py-2 rounded text-sm font-semibold ${meta.shape===k?'bg-stone-800 text-white':'bg-white border border-stone-300 text-stone-700'}`}>{l}</button>
                ))}
              </div>
            </div>

            {/* Tray size for the junction (informational; colour follows the network) */}
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Bakkestørrelse</label>
              <select value={meta.tray_type} onChange={e=>setM('tray_type', e.target.value)}
                      className="w-full border border-stone-300 rounded-lg px-2 py-2 text-sm">
                <option value="">— ingen —</option>
                {trayTypes && Object.keys(trayTypes).map(t => (
                  <option key={t} value={t}>{t} ({trayTypes[t].width_mm} mm)</option>
                ))}
              </select>
              <p className="text-[11px] text-stone-400 mt-1">Farven følger automatisk det netværk knuden er forbundet til.</p>
            </div>

            {(meta.shape === 'tee' || meta.shape === 'corner' || meta.shape === 'cross') && (
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Orientering</label>
                <div className="flex items-center gap-3">
                  {/* Live preview */}
                  <svg width="56" height="56" viewBox="0 0 56 56" className="bg-white rounded border border-stone-200 shrink-0">
                    <g transform={`rotate(${meta.rotation} 28 28)`}>
                      {meta.shape === 'tee' ? (
                        <>
                          <line x1="10" y1="28" x2="46" y2="28" stroke="#1565C0" strokeWidth="4" strokeLinecap="round"/>
                          <line x1="28" y1="28" x2="28" y2="46" stroke="#1565C0" strokeWidth="4" strokeLinecap="round"/>
                          <circle cx="10" cy="28" r="4" fill="#fff" stroke="#1565C0" strokeWidth="2"/>
                          <circle cx="46" cy="28" r="4" fill="#fff" stroke="#1565C0" strokeWidth="2"/>
                          <circle cx="28" cy="46" r="4" fill="#fff" stroke="#1565C0" strokeWidth="2"/>
                        </>
                      ) : meta.shape === 'cross' ? (
                        <>
                          <line x1="10" y1="28" x2="46" y2="28" stroke="#1565C0" strokeWidth="4" strokeLinecap="round"/>
                          <line x1="28" y1="10" x2="28" y2="46" stroke="#1565C0" strokeWidth="4" strokeLinecap="round"/>
                          <circle cx="10" cy="28" r="4" fill="#fff" stroke="#1565C0" strokeWidth="2"/>
                          <circle cx="46" cy="28" r="4" fill="#fff" stroke="#1565C0" strokeWidth="2"/>
                          <circle cx="28" cy="10" r="4" fill="#fff" stroke="#1565C0" strokeWidth="2"/>
                          <circle cx="28" cy="46" r="4" fill="#fff" stroke="#1565C0" strokeWidth="2"/>
                        </>
                      ) : (
                        <>
                          <polyline points="10,28 28,28 28,46" fill="none" stroke="#1565C0" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                          <circle cx="10" cy="28" r="4" fill="#fff" stroke="#1565C0" strokeWidth="2"/>
                          <circle cx="28" cy="46" r="4" fill="#fff" stroke="#1565C0" strokeWidth="2"/>
                        </>
                      )}
                    </g>
                  </svg>
                  {/* Rotation buttons */}
                  <div className="flex-1 grid grid-cols-4 gap-1">
                    {[0, 90, 180, 270].map(deg => (
                      <button key={deg} onClick={()=>setM('rotation', deg)}
                              className={`py-2 rounded text-xs font-semibold ${meta.rotation===deg ? 'bg-stone-800 text-white' : 'bg-white border border-stone-300 text-stone-700'}`}>
                        {deg}°
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={()=>setM('rotation', (meta.rotation + 90) % 360)}
                        className="w-full mt-1.5 py-1.5 bg-stone-200 text-stone-800 rounded text-xs font-semibold flex items-center justify-center gap-1">
                  <RefreshCw size={12}/> Drej 90°
                </button>
              </div>
            )}
          </div>
        )}

        {/* Size: junctions use the global circle size; boards/loads use own size */}
        {kind === 'junction' ? (
          <label className="block text-xs text-stone-600 mb-2">Cirkelstørrelse: {circleSize}px <span className="text-stone-400">(gælder alle cirkler i hele tegningen)</span>
            <input type="range" min="3" max="20" value={circleSize} onChange={e=>updateCircleSize(Number(e.target.value))} className="w-full"/>
          </label>
        ) : (
          <label className="block text-xs text-stone-600 mb-2">Størrelse: {meta.size}px
            <input type="range" min="6" max="40" value={meta.size} onChange={e=>setM('size', Number(e.target.value))} className="w-full"/>
          </label>
        )}

        {/* Colour picker — applies to all node kinds */}
        <div className="border border-stone-200 rounded-lg p-2 mb-2">
          <label className="block text-xs font-semibold text-stone-600 mb-1">Farve</label>
          <div className="flex items-center gap-2 flex-wrap">
            {['', '#1565C0', '#2e7d32', '#c62828', '#f57c00', '#6a1b9a', '#00838f', '#37474F'].map(c => (
              <button key={c||'def'} onClick={()=>setM('color', c)}
                      title={c || 'Standard'}
                      className={`w-7 h-7 rounded-full border-2 ${meta.color===c ? 'border-stone-800 ring-2 ring-stone-300' : 'border-stone-300'}`}
                      style={{ background: c || 'repeating-linear-gradient(45deg,#fff,#fff 4px,#ddd 4px,#ddd 8px)' }}/>
            ))}
            <input type="color" value={meta.color || '#1565C0'} onChange={e=>setM('color', e.target.value)}
                   className="w-7 h-7 rounded cursor-pointer border border-stone-300" title="Vælg egen farve"/>
          </div>
        </div>

        <p className="text-xs text-stone-500 mb-3">Forbundet til {connCount} føringsvej(e){cabCount>0?` og ${cabCount} kabel/kabler`:''}{(connCount>0||cabCount>0)?' — slettes med':''}.</p>
        <div className="flex gap-2">
          <button onClick={()=>deleteNode(id)} className="flex-1 py-3 bg-red-600 text-white rounded-lg font-semibold flex items-center justify-center gap-1 active:scale-95"><Trash2 size={14}/> Slet</button>
          <button onClick={saveAll} className="flex-[2] py-3 bg-stone-800 text-white rounded-lg font-semibold active:scale-95">Gem</button>
        </div>
      </div>
    </div>
  );
}

function MultiEditModal({ kind, ids, close, applyToAll, deleteAll, lNodes, trayTypes, openNode, circleSize, updateCircleSize }) {
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [shape, setShape] = useState('');
  const [rotation, setRotation] = useState('');
  const [func, setFunc] = useState('');
  const label = kind === 'board' ? 'tavler' : kind === 'load' ? 'laster' : 'punkter';
  const palette = ['', '#1565C0', '#2e7d32', '#c62828', '#f9a825', '#6a1b9a', '#00838f', '#37474F'];
  const shapeName = (s) => s==='tee'?'T-stykke':s==='corner'?'Hjørne':s==='cross'?'Kryds':'Punkt';
  const apply = () => {
    const patch = {};
    if (color !== '') patch.color = color || undefined;
    if (size !== '') patch.size = Number(size);
    if (kind === 'junction' && shape !== '') patch.shape = shape;
    if (kind === 'junction' && rotation !== '') patch.rotation = Number(rotation);
    if (kind === 'load' && func !== '') patch.function = func;
    if (Object.keys(patch).length === 0) { close(); return; }
    applyToAll(patch);
  };
  return (
    <div className="absolute inset-0 bg-black/50 z-20 flex items-end lg:items-center justify-center p-4" onClick={close}>
      <div className="bg-white p-4 rounded-2xl w-full lg:max-w-lg max-h-[88vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <h3 className="font-bold mb-1 text-stone-800">Rediger {ids.length} {label}</h3>
        <p className="text-xs text-stone-500 mb-3">Klik et objekt for at redigere det individuelt, eller sæt fælles værdier nedenfor (kun udfyldte felter ændres).</p>

        {/* Common settings for the whole selection */}
        <div className="border border-stone-200 bg-stone-100/40 rounded-lg p-2 mb-3 space-y-2">
          <div className="text-xs font-semibold text-stone-800">Fælles for alle valgte</div>

          {kind === 'junction' && (
            <div>
              <label className="block text-[11px] text-stone-600 mb-1">Form</label>
              <div className="flex gap-1">
                {[['','—'],['dot','Punkt'],['tee','T-stykke'],['corner','Hjørne'],['cross','Kryds']].map(([k,l]) => (
                  <button key={k||'none'} onClick={()=>setShape(k)}
                          className={`flex-1 py-1.5 rounded text-xs font-semibold ${shape===k?'bg-stone-800 text-white':'bg-white border border-stone-300 text-stone-700'}`}>{l}</button>
                ))}
              </div>
            </div>
          )}

          {kind === 'load' && (
            <div>
              <label className="block text-[11px] text-stone-600 mb-1">Funktion</label>
              <select value={func} onChange={e=>setFunc(e.target.value)} className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm">
                <option value="">— uændret —</option>
                {FUNCTIONS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          )}

          {kind === 'junction' ? (
            <div>
              <label className="block text-[11px] text-stone-600 mb-1">Cirkelstørrelse: {circleSize}px <span className="text-stone-400">(alle cirkler i hele tegningen)</span></label>
              <input type="range" min="3" max="20" value={circleSize} onChange={e=>updateCircleSize(Number(e.target.value))} className="w-full"/>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] text-stone-600 mb-1">Fælles størrelse {size !== '' ? `(${size}px)` : ''}</label>
              <div className="flex items-center gap-2">
                <input type="range" min="6" max="40" value={size || 14} onChange={e=>setSize(e.target.value)} className="flex-1"/>
                <span className="text-xs w-16">{size === '' ? 'uændret' : `${size}px`}</span>
                {size !== '' && <button onClick={()=>setSize('')} className="text-[11px] text-stone-400 underline">nulstil</button>}
              </div>
            </div>
          )}

          {kind === 'junction' && (
            <div>
              <label className="block text-[11px] text-stone-600 mb-1">Rotation</label>
              <div className="grid grid-cols-5 gap-1">
                <button onClick={()=>setRotation('')} className={`py-1.5 rounded text-xs font-semibold ${rotation===''?'bg-stone-800 text-white':'bg-white border border-stone-300'}`}>—</button>
                {[0,90,180,270].map(d => (
                  <button key={d} onClick={()=>setRotation(String(d))} className={`py-1.5 rounded text-xs font-semibold ${rotation===String(d)?'bg-stone-800 text-white':'bg-white border border-stone-300'}`}>{d}°</button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] text-stone-600 mb-1">Farve</label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {palette.map(c => (
                <button key={c||'def'} onClick={()=>setColor(c)} title={c || 'Standard'}
                        className={`w-6 h-6 rounded-full border-2 ${color===c ? 'border-stone-800 ring-1 ring-stone-300' : 'border-stone-300'}`}
                        style={{ background: c || 'repeating-linear-gradient(45deg,#fff,#fff 4px,#ddd 4px,#ddd 8px)' }}/>
              ))}
              <input type="color" value={color || '#1565C0'} onChange={e=>setColor(e.target.value)}
                     className="w-6 h-6 rounded cursor-pointer border border-stone-300" title="Vælg egen farve"/>
            </div>
          </div>

          <button onClick={apply} className="w-full py-2 bg-stone-800 text-white rounded-lg text-sm font-semibold">Anvend på alle valgte</button>
        </div>

        {/* Individual objects in the selection */}
        <div className="mb-3">
          <div className="text-xs font-semibold text-stone-700 mb-1">Valgte objekter ({ids.length})</div>
          <div className="space-y-1">
            {ids.map(id => {
              const n = lNodes[id];
              if (!n) return null;
              const detail = kind === 'junction'
                ? shapeName(n.shape) + (n.tray_type ? ` · ${trayTypes[n.tray_type]?.width_mm} mm` : '')
                : kind === 'load' ? (n.function || '') : (n.board_type || '');
              return (
                <button key={id} onClick={()=>openNode(id)}
                        className="w-full flex items-center gap-2 px-2 py-2 bg-stone-50 hover:bg-stone-100 rounded-lg text-left text-sm">
                  <span className="font-semibold text-stone-700">{id}</span>
                  <span className="text-xs text-stone-500">{detail}</span>
                  <Edit2 size={13} className="text-stone-700 ml-auto"/>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={deleteAll} className="flex-1 py-3 bg-red-600 text-white rounded-lg font-semibold flex items-center justify-center gap-1"><Trash2 size={14}/> Slet alle</button>
          <button onClick={close} className="flex-[2] py-3 bg-stone-800 text-white rounded-lg font-semibold">Færdig</button>
        </div>
      </div>
    </div>
  );
}

function CategoryEditModal({ net, netIndex, lSegs, lNodes, trayTypes, close, openSeg, openNode, setCommonTrayType, setNetworkColor, circleSize, updateCircleSize }) {
  const [commonTT, setCommonTT] = useState('');
  const segIds = net.segIds;
  const nodeIds = Array.from(net.nodeIds);
  const junctionIds = nodeIds.filter(id => (lNodes[id]?.kind || 'junction') === 'junction');
  const endpointIds = nodeIds.filter(id => { const k = lNodes[id]?.kind || 'junction'; return k === 'board' || k === 'load'; });
  return (
    <div className="absolute inset-0 bg-black/50 z-20 flex items-end lg:items-center justify-center p-4" onClick={close}>
      <div className="bg-white p-4 rounded-2xl w-full lg:max-w-lg max-h-[88vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-block w-5 h-5 rounded-full border border-stone-300" style={{ background: net.color }}/>
          <h3 className="font-bold text-stone-800">Net {netIndex+1} — {segIds.length} føringsveje</h3>
        </div>
        <p className="text-xs text-stone-500 mb-3">Redigér hvert objekt individuelt, eller sæt en fælles størrelse for hele netværket.</p>

        {/* Common settings for the whole network */}
        <div className="border border-stone-200 bg-stone-100/40 rounded-lg p-2 mb-3 space-y-2">
          <div className="text-xs font-semibold text-stone-800">Fælles for hele netværket</div>
          <div>
            <label className="block text-[11px] text-stone-600 mb-1">Fælles bakkestørrelse (bredde)</label>
            <div className="flex gap-2">
              <select value={commonTT} onChange={e=>setCommonTT(e.target.value)}
                      className="flex-1 border border-stone-300 rounded-lg px-2 py-1.5 text-sm">
                <option value="">— vælg —</option>
                {Object.keys(trayTypes).map(t => <option key={t} value={t}>{t} ({trayTypes[t].width_mm} mm)</option>)}
              </select>
              <button onClick={()=>{ if (commonTT) setCommonTrayType(commonTT); }}
                      disabled={!commonTT}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${commonTT?'bg-stone-800 text-white':'bg-stone-200 text-stone-400'}`}>Anvend</button>
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-stone-600 mb-1">Cirkelstørrelse: {circleSize}px <span className="text-stone-400">(alle cirkler i hele tegningen)</span></label>
            <input type="range" min="3" max="20" value={circleSize} onChange={e=>updateCircleSize(Number(e.target.value))} className="w-full"/>
          </div>
        </div>

        {/* Individual segments */}
        <div className="mb-3">
          <div className="text-xs font-semibold text-stone-700 mb-1">Føringsveje ({segIds.length})</div>
          <div className="space-y-1">
            {segIds.map(id => {
              const s = lSegs[id];
              if (!s) return null;
              const w = trayTypes[s.tray_type]?.width_mm;
              return (
                <button key={id} onClick={()=>openSeg(id)}
                        className="w-full flex items-center gap-2 px-2 py-2 bg-stone-50 hover:bg-stone-100 rounded-lg text-left text-sm">
                  <span className="font-semibold text-stone-700">{id}</span>
                  <span className="text-xs text-stone-500">{s.from} → {s.to}</span>
                  <span className="text-xs text-stone-400 ml-auto">{w ? `${w} mm` : ''} · {s.length_m} m</span>
                  <Edit2 size={13} className="text-stone-700"/>
                </button>
              );
            })}
          </div>
        </div>

        {/* Junctions in the network */}
        {junctionIds.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-semibold text-stone-700 mb-1">Knuder ({junctionIds.length})</div>
            <div className="flex flex-wrap gap-1">
              {junctionIds.map(id => (
                <button key={id} onClick={()=>openNode(id)}
                        className="px-2.5 py-1.5 bg-stone-50 hover:bg-stone-100 rounded-lg text-xs font-semibold text-stone-700 flex items-center gap-1">
                  {id} <Edit2 size={11} className="text-stone-700"/>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Boards/loads at the ends */}
        {endpointIds.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-semibold text-stone-700 mb-1">Tavler / laster ({endpointIds.length})</div>
            <div className="flex flex-wrap gap-1">
              {endpointIds.map(id => (
                <button key={id} onClick={()=>openNode(id)}
                        className="px-2.5 py-1.5 bg-stone-50 hover:bg-stone-100 rounded-lg text-xs font-semibold text-stone-700 flex items-center gap-1">
                  {id} <Edit2 size={11} className="text-stone-700"/>
                </button>
              ))}
            </div>
          </div>
        )}

        <button onClick={close} className="w-full py-3 bg-stone-800 text-white rounded-lg font-semibold">Færdig</button>
      </div>
    </div>
  );
}

function SegEditDialog({ id, setId, lSegs, trayTypes, updateSeg, deleteSeg, addWaypoint, removeWaypoint, straightenOne }) {
  const s = lSegs[id];
  const [length_m, setL] = useState(s.length_m);
  const [tray_type, setTT] = useState(s.tray_type);
  const [color, setColor] = useState(s.color || '');
  const [lineStyle, setLineStyle] = useState(s.lineStyle || 'solid');
  const [elevation_mm, setElev] = useState(s.elevation_mm ?? '');
  return (
    <div className="absolute inset-0 bg-black/50 z-10 flex items-end lg:items-center justify-center p-4" onClick={()=>setId(null)}>
      <div className="bg-white p-4 rounded-2xl w-full lg:max-w-md max-h-[85vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <h3 className="font-bold mb-3 text-stone-800">Segment {id}</h3>
        <p className="text-xs text-stone-500 mb-3">{s.from} → {s.to}</p>
        <FormField label="Længde [m]" type="number" step="0.5" value={length_m} onChange={setL}/>
        <FormField label="Højde / montagekote [mm]" type="number" value={elevation_mm} onChange={setElev} hint="fx 3000 = 3 m over gulv (valgfri)"/>
        <Selector label="Tray type (bredden bestemmer tykkelsen)" value={tray_type} onChange={setTT} options={Object.keys(trayTypes)}/>

        {/* Preview: thickness from width; colour shown is the current/own colour */}
        {(() => {
          const w = trayTypes[tray_type]?.width_mm;
          const t = trayWidthStroke(w);
          return (
            <div className="flex items-center gap-2 mt-1 mb-1 text-xs text-stone-600">
              <span>Bredde {w} mm →</span>
              <svg width="60" height="16"><line x1="4" y1="8" x2="56" y2="8" stroke={color || '#78716c'} strokeWidth={t} strokeLinecap="round"/></svg>
              <span>{color ? 'egen farve' : 'tykkelse'}</span>
            </div>
          );
        })()}

        {/* Line style */}
        <div className="mt-2">
          <label className="block text-xs font-semibold text-stone-600 mb-1">Linjestil</label>
          <div className="flex gap-1">
            {[['solid','Fuld'],['dashed','Stiplet'],['dotted','Prikket']].map(([k,l]) => (
              <button key={k} onClick={()=>setLineStyle(k)}
                      className={`flex-1 py-2 rounded text-sm font-semibold ${lineStyle===k?'bg-stone-800 text-white':'bg-white border border-stone-300 text-stone-700'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Colour — optional override of the width-based auto colour */}
        <div className="mt-2">
          <label className="block text-xs font-semibold text-stone-600 mb-1">Farve <span className="font-normal text-stone-400">(gælder hele netværket)</span></label>
          <div className="flex items-center gap-2 flex-wrap">
            {['', '#1565C0', '#2e7d32', '#c62828', '#f9a825', '#6a1b9a', '#00838f', '#37474F'].map(c => (
              <button key={c||'def'} onClick={()=>setColor(c)} title={c || 'Auto (fra bredde)'}
                      className={`w-7 h-7 rounded-full border-2 ${color===c ? 'border-stone-800 ring-2 ring-stone-300' : 'border-stone-300'}`}
                      style={{ background: c || 'repeating-linear-gradient(45deg,#fff,#fff 4px,#ddd 4px,#ddd 8px)' }}/>
            ))}
            <input type="color" value={color || '#1f6feb'} onChange={e=>setColor(e.target.value)}
                   className="w-7 h-7 rounded cursor-pointer border border-stone-300" title="Vælg egen farve"/>
          </div>
        </div>

        {/* Straighten this segment */}
        <button onClick={()=>{ straightenOne(id); setId(null); }}
                className="w-full mt-2 text-xs py-2 bg-amber-100 text-amber-900 rounded-lg font-semibold flex items-center justify-center gap-1">
          <GitBranch size={13}/> Ret denne føringsvej op (vinkelret)
        </button>

        <div className="flex gap-2 mt-3">
          <button onClick={()=>setId(null)} className="flex-1 py-3 border rounded-lg font-semibold">Annuller</button>
          <button onClick={()=>deleteSeg(id)} className="flex-1 py-3 bg-red-600 text-white rounded-lg font-semibold flex items-center justify-center gap-1"><Trash2 size={14}/> Slet</button>
          <button onClick={()=>updateSeg(id, { length_m: Number(length_m), tray_type, color: color || undefined, lineStyle, elevation_mm: elevation_mm === '' ? undefined : Number(elevation_mm) })} className="flex-1 py-3 bg-stone-800 text-white rounded-lg font-semibold">Gem</button>
        </div>
      </div>
    </div>
  );
}

// =========================
// EDIT MODAL
// =========================
function EditModal({ editing, setEditing, cableTypes, trayTypes, transformerTypes, segments, setCables, setSegments, setCableTypes, setTrayTypes, setTransformerTypes, cables }) {
  const [form, setForm] = useState({...editing.item});
  const set = (k,v) => setForm({...form, [k]:v});
  const close = () => setEditing(null);

  const save = () => {
    if (editing.kind === 'cable') {
      const cleaned = {...form, V:Number(form.V), phases:Number(form.phases), Ib:Number(form.Ib), In:Number(form.In), cos_phi:Number(form.cos_phi), route: typeof form.route === 'string' ? form.route.split(',').map(s=>s.trim()).filter(Boolean) : form.route};
      if (editing.isNew) setCables([...cables, cleaned]);
      else setCables(cables.map(c => c.id === editing.item.id ? cleaned : c));
    } else if (editing.kind === 'segment') {
      const { id, ...rest } = form;
      rest.length_m = Number(rest.length_m);
      if (editing.isNew || editing.item.id !== id) {
        const newSegs = {...segments};
        if (!editing.isNew) delete newSegs[editing.item.id];
        newSegs[id] = rest;
        setSegments(newSegs);
      } else setSegments({...segments, [id]: rest});
    } else if (editing.kind === 'cable_type') {
      const { name, ...rest } = form;
      const cleaned = {...rest, conductors:Number(rest.conductors), S_mm2:Number(rest.S_mm2), od_mm:Number(rest.od_mm), iz_a:Number(rest.iz_a), is_parallel:Number(rest.is_parallel), area_mm2: area(Number(rest.od_mm))};
      const newCT = {...cableTypes};
      if (!editing.isNew && editing.item.name !== name) delete newCT[editing.item.name];
      newCT[name] = cleaned;
      setCableTypes(newCT);
    } else if (editing.kind === 'tray_type') {
      const { name, ...rest } = form;
      const cleaned = {...rest, width_mm:Number(rest.width_mm), height_mm:Number(rest.height_mm), gross_area_mm2:Number(rest.width_mm)*Number(rest.height_mm), max_fill_percent:Number(rest.max_fill_percent)};
      const newTT = {...trayTypes};
      if (!editing.isNew && editing.item.name !== name) delete newTT[editing.item.name];
      newTT[name] = cleaned;
      setTrayTypes(newTT);
    } else if (editing.kind === 'transformer_type') {
      const { name, ...rest } = form;
      const cleaned = { S_kVA:Number(rest.S_kVA), U_pri_kV:Number(rest.U_pri_kV), U_sec_V:Number(rest.U_sec_V), uk_pct:Number(rest.uk_pct) };
      const newTT = {...transformerTypes};
      if (!editing.isNew && editing.item.name !== name) delete newTT[editing.item.name];
      newTT[name] = cleaned;
      setTransformerTypes(newTT);
    }
    close();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-20 flex items-end lg:items-center lg:justify-center lg:p-4" onClick={close}>
      <div className="bg-white w-full lg:max-w-2xl lg:rounded-2xl max-h-[85vh] lg:max-h-[90vh] overflow-y-auto rounded-t-2xl p-4 lg:p-6" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold text-stone-800">{editing.isNew ? 'Add' : 'Edit'} {editing.kind.replace('_',' ')}</h2>
          <button onClick={close} className="p-2"><X size={20}/></button>
        </div>

        {editing.kind === 'cable' && (
          <>
            <FormField label="Cable ID" value={form.id} onChange={v=>set('id',v)}/>
            <FormField label="From" value={form.from} onChange={v=>set('from',v)}/>
            <FormField label="To" value={form.to} onChange={v=>set('to',v)}/>
            <Selector label="Function" value={form.function} onChange={v=>set('function',v)} options={FUNCTIONS}/>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="V" type="number" value={form.V} onChange={v=>set('V',v)}/>
              <FormField label="Phases" type="number" value={form.phases} onChange={v=>set('phases',v)}/>
            </div>
            <Selector label="Cable type" value={form.cable_type} onChange={v=>set('cable_type',v)} options={Object.keys(cableTypes)}/>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="Ib [A]" type="number" value={form.Ib} onChange={v=>set('Ib',v)}/>
              <FormField label="In [A]" type="number" value={form.In} onChange={v=>set('In',v)}/>
            </div>
            <FormField label="cos φ" type="number" step="0.01" value={form.cos_phi} onChange={v=>set('cos_phi',v)}/>
            <FormField label="Route (segment IDs, comma-separated)" value={Array.isArray(form.route) ? form.route.join(', ') : form.route} onChange={v=>set('route',v)} hint={`Available: ${Object.keys(segments).slice(0,5).join(', ')}${Object.keys(segments).length>5?'...':''}`}/>
          </>
        )}

        {editing.kind === 'segment' && (
          <>
            <FormField label="Segment ID" value={form.id} onChange={v=>set('id',v)}/>
            <FormField label="From" value={form.from} onChange={v=>set('from',v)}/>
            <FormField label="To" value={form.to} onChange={v=>set('to',v)}/>
            <FormField label="Length [m]" type="number" step="0.1" value={form.length_m} onChange={v=>set('length_m',v)}/>
            <Selector label="Tray type" value={form.tray_type} onChange={v=>set('tray_type',v)} options={Object.keys(trayTypes)}/>
          </>
        )}

        {editing.kind === 'cable_type' && (
          <>
            <FormField label="Name" value={form.name} onChange={v=>set('name',v)}/>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="Conductors" type="number" value={form.conductors} onChange={v=>set('conductors',v)}/>
              <FormField label="Parallel runs" type="number" value={form.is_parallel} onChange={v=>set('is_parallel',v)}/>
            </div>
            <FormField label="Cross-section text" value={form.cross_section} onChange={v=>set('cross_section',v)}/>
            <div className="grid grid-cols-3 gap-2">
              <FormField label="S [mm²]" type="number" value={form.S_mm2} onChange={v=>set('S_mm2',v)}/>
              <FormField label="OD [mm]" type="number" step="0.1" value={form.od_mm} onChange={v=>set('od_mm',v)}/>
              <FormField label="Iz [A]" type="number" value={form.iz_a} onChange={v=>set('iz_a',v)}/>
            </div>
          </>
        )}

        {editing.kind === 'tray_type' && (
          <>
            <FormField label="Name" value={form.name} onChange={v=>set('name',v)}/>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="Width [mm]" type="number" value={form.width_mm} onChange={v=>set('width_mm',v)}/>
              <FormField label="Height [mm]" type="number" value={form.height_mm} onChange={v=>set('height_mm',v)}/>
            </div>
            <FormField label="Max fill [%]" type="number" value={form.max_fill_percent} onChange={v=>set('max_fill_percent',v)}/>
          </>
        )}

        {editing.kind === 'transformer_type' && (
          <>
            <FormField label="Name" value={form.name} onChange={v=>set('name',v)}/>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="S [kVA]" type="number" value={form.S_kVA} onChange={v=>set('S_kVA',v)}/>
              <FormField label="uk [%]" type="number" step="0.1" value={form.uk_pct} onChange={v=>set('uk_pct',v)}/>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="U primary [kV]" type="number" step="0.1" value={form.U_pri_kV} onChange={v=>set('U_pri_kV',v)}/>
              <FormField label="U secondary [V]" type="number" value={form.U_sec_V} onChange={v=>set('U_sec_V',v)}/>
            </div>
            <div className="text-xs text-stone-500 mt-1">
              Z (mΩ) = uk × U² / (100 × S × n) ≈ <b>{calcZsource({S_kVA:Number(form.S_kVA), U_sec_V:Number(form.U_sec_V), uk_pct:Number(form.uk_pct)}, 1)} mΩ</b> for 1 stk.
            </div>
          </>
        )}

        <div className="flex gap-2 mt-4 sticky bottom-0 bg-white pt-2">
          <button onClick={close} className="flex-1 py-3 border border-stone-300 rounded-lg font-semibold">Annuller</button>
          <button onClick={save} className="flex-1 py-3 bg-stone-800 text-white rounded-lg font-semibold">Gem</button>
        </div>
      </div>
    </div>
  );
}

function Selector({ label, value, onChange, options }) {
  return (
    <label className="block mb-3">
      <span className="text-xs font-semibold text-stone-700">{label}</span>
      <select value={value} onChange={e=>onChange(e.target.value)} className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-lg text-base bg-white">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
