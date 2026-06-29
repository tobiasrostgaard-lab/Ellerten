import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Download, RefreshCw, AlertCircle, CheckCircle, Settings, Cable, Layers, BookOpen, BarChart3, FileDown, Database, X, ChevronRight, Zap, GitBranch, Calculator, Upload, FileText, Save, ZoomIn, ZoomOut, Pencil, Move, Link2, MousePointer2, Grid3x3 } from 'lucide-react';
import * as XLSX from 'xlsx';

// =========================
// STORAGE ABSTRACTION
// Single place to swap window.storage (Claude artifact) for localStorage (Vercel).
// =========================
const appStorage = {
  async get(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  },
  async set(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  },
  async delete(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  },
};


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
const DEFAULT_TRAY_TYPES = {
  '100x60':  { width_mm:100, height_mm:60,  gross_area_mm2:6000,  max_fill_percent:40 },
  '200x60':  { width_mm:200, height_mm:60,  gross_area_mm2:12000, max_fill_percent:40 },
  '300x100': { width_mm:300, height_mm:100, gross_area_mm2:30000, max_fill_percent:40 },
  '400x100': { width_mm:400, height_mm:100, gross_area_mm2:40000, max_fill_percent:40 },
  '600x100': { width_mm:600, height_mm:100, gross_area_mm2:60000, max_fill_percent:40 },
};
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
  300: '#f9a825',  // amber
  400: '#1565C0',  // blue
  450: '#6a1b9a',  // purple
  500: '#2e7d32',  // green
  600: '#c62828',  // red
  800: '#37474F',  // dark slate
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
function nextNodeIdByKind(nodes, kind) {
  const prefix = kind === 'board' ? 'Q' : kind === 'load' ? 'X' : 'N';
  const used = new Set(Object.keys(nodes));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}
function nextSegId(segments) {
  const used = new Set(Object.keys(segments));
  let n = 1;
  while (used.has(`WC${String(n).padStart(3,'0')}`)) n++;
  return `WC${String(n).padStart(3,'0')}`;
}
function nextNodeId(nodes) {
  const used = new Set(Object.keys(nodes));
  let n = 1;
  while (used.has(`N${n}`)) n++;
  return `N${n}`;
}
function nextCableId(cables) {
  const used = new Set(cables.map(c => c.id));
  let n = 1;
  while (used.has(`W${String(n).padStart(3,'0')}`)) n++;
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
  const [editing, setEditing] = useState(null);
  const [sizingOpen, setSizingOpen] = useState(false);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Project library: list of { id, name } + the currently active project id
  const [projectList, setProjectList] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const fileInputRef = useRef(null);
  const csvInputRef = useRef(null);

  const STORAGE_INDEX = 'cable_app_index';        // { projects: [{id, name}], activeId }
  const projKey = (id) => `cable_app_project_${id}`;
  const genId = () => `p_${Date.now()}_${Math.floor(Math.random()*1e4)}`;

  // Apply a loaded project bundle into state
  const applyBundle = (s) => {
    setProject(s.project ?? DEFAULT_PROJECT);
    setCableTypes(s.cableTypes ?? DEFAULT_CABLE_TYPES);
    setTrayTypes(s.trayTypes ?? DEFAULT_TRAY_TYPES);
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
        const idxRaw = await appStorage.get(STORAGE_INDEX);
        if (idxRaw) {
          const idx = JSON.parse(idxRaw);
          const list = idx.projects ?? [];
          setProjectList(list);
          const activeId = idx.activeId ?? (list[0]?.id ?? null);
          setActiveProjectId(activeId);
          if (activeId) {
            const pRaw = await appStorage.get(projKey(activeId));
            if (pRaw) applyBundle(JSON.parse(pRaw));
          }
        } else {
          // Migration: check for legacy single-project state
          const legacy = await appStorage.get('cable_app_state');
          const id = genId();
          let name = 'Mit projekt';
          if (legacy) {
            const s = JSON.parse(legacy);
            applyBundle(s);
            name = (s.project?.site ? `=${s.project.site}+${s.project.location||''}` : 'Mit projekt');
            await appStorage.set(projKey(id), legacy);
          } else {
            await appStorage.set(projKey(id), JSON.stringify(emptyBundle()));
          }
          const list = [{ id, name }];
          setProjectList(list);
          setActiveProjectId(id);
          await appStorage.set(STORAGE_INDEX, JSON.stringify({ projects: list, activeId: id }));
        }
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  // Persist active project bundle
  useEffect(() => {
    if (!loaded || !activeProjectId) return;
    const t = setTimeout(() => {
      appStorage.set(projKey(activeProjectId), JSON.stringify({ project, cableTypes, trayTypes, transformerTypes, segments, nodes, cables, bgImage })).catch(()=>{});
    }, 500);
    return () => clearTimeout(t);
  }, [project, cableTypes, trayTypes, transformerTypes, segments, nodes, cables, bgImage, loaded, activeProjectId]);

  // Persist the index whenever the list or active id changes
  useEffect(() => {
    if (!loaded) return;
    appStorage.set(STORAGE_INDEX, JSON.stringify({ projects: projectList, activeId: activeProjectId })).catch(()=>{});
  }, [projectList, activeProjectId, loaded]);

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
    try { await appStorage.set(projKey(activeProjectId), JSON.stringify(currentBundle())); } catch (e) {}
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
    try { await appStorage.set(projKey(id), JSON.stringify(bundle)); } catch (e) {}
    const list = [...projectList, { id, name: name || 'Nyt projekt' }];
    setProjectList(list);
    setActiveProjectId(id);
    applyBundle(bundle);
    setNewProjectOpen(false);
    setTab('project');
  };

  const switchProject = async (id) => {
    if (id === activeProjectId) return;
    await flushCurrent();
    try {
      const pRaw = await appStorage.get(projKey(id));
      if (pRaw) applyBundle(JSON.parse(pRaw));
      else applyBundle(emptyBundle());
    } catch (e) { applyBundle(emptyBundle()); }
    setActiveProjectId(id);
    setTab('project');
  };

  const deleteProject = async (id) => {
    const proj = projectList.find(p => p.id === id);
    if (!safeConfirm(`Slet projektet "${proj?.name ?? id}" permanent?`)) return;
    try { await appStorage.delete(projKey(id)); } catch (e) {}
    const remaining = projectList.filter(p => p.id !== id);
    if (remaining.length === 0) {
      // Always keep at least one project — create a fresh empty one
      const newId = genId();
      const bundle = emptyBundle();
      try { await appStorage.set(projKey(newId), JSON.stringify(bundle)); } catch (e) {}
      setProjectList([{ id: newId, name: 'Mit projekt' }]);
      setActiveProjectId(newId);
      applyBundle(bundle);
      return;
    }
    setProjectList(remaining);
    if (id === activeProjectId) {
      // switch to the first remaining project
      const next = remaining[0];
      try {
        const pRaw = await appStorage.get(projKey(next.id));
        applyBundle(pRaw ? JSON.parse(pRaw) : emptyBundle());
      } catch (e) { applyBundle(emptyBundle()); }
      setActiveProjectId(next.id);
    }
  };

  const renameProject = (id, name) => {
    setProjectList(projectList.map(p => p.id === id ? { ...p, name } : p));
  };

  // JSON Import/Export
  const exportProjectJSON = () => {
    const data = JSON.stringify({ project, cableTypes, trayTypes, transformerTypes, segments, nodes, cables, _meta:{ exported:new Date().toISOString(), app:'CableSystemDesigner', version:'1.2' } }, null, 2);
    downloadBlob(`${project.site}_${project.location}_project.json`, data);
  };
  const handleJSONImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const text = await file.text();
      const d = JSON.parse(text);
      if (!d.cables || !d.segments) throw new Error('Missing required fields');
      setProject(d.project ?? DEFAULT_PROJECT);
      setCableTypes(d.cableTypes ?? DEFAULT_CABLE_TYPES);
      setTrayTypes(d.trayTypes ?? DEFAULT_TRAY_TYPES);
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
    <div className="min-h-screen bg-stone-50 pb-20" style={{ fontFamily:'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <header className="bg-gradient-to-r from-blue-900 to-blue-700 text-white p-4 sticky top-0 z-10 shadow-md">
        <div className="flex items-center justify-between lg:max-w-6xl lg:mx-auto">
          <div>
            <h1 className="text-lg lg:text-xl font-bold flex items-center gap-2"><Cable size={20}/> Cable System Designer</h1>
            <p className="text-xs lg:text-sm opacity-80">={project.site}+{project.location} · {cables.length} cables · {Object.keys(segments).length} segments</p>
          </div>
          <button onClick={() => exportXlsx({project, cables, segments, cableTypes, trayTypes}, A)} className="bg-white text-blue-900 px-3 lg:px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-1 shadow active:scale-95 transition">
            <FileDown size={16}/> Excel
          </button>
        </div>
      </header>

      <main className="p-3 lg:p-6 lg:max-w-6xl lg:mx-auto space-y-3 lg:pb-24">
        {tab === 'project' && <ProjectTab project={project} setProject={setProject} counts={counts} critical={critical} tight={tight} loadTemplate={loadTemplate} clearAll={clearAll} transformerTypes={transformerTypes} exportProjectJSON={exportProjectJSON} fileInputRef={fileInputRef} projectList={projectList} activeProjectId={activeProjectId} switchProject={switchProject} deleteProject={deleteProject} renameProject={renameProject} openNewProject={()=>setNewProjectOpen(true)} />}
        {tab === 'cables' && <CablesTab cables={cables} setCables={setCables} cableTypes={cableTypes} segments={segments} A={A} setEditing={setEditing} setSizingOpen={setSizingOpen} exportCablesCSV={exportCablesCSV} csvInputRef={csvInputRef} />}
        {tab === 'trays' && <TraysTab segments={segments} setSegments={setSegments} trayTypes={trayTypes} A={A} setEditing={setEditing} setDrawingOpen={setDrawingOpen} />}
        {tab === 'diagram' && <DiagramTab cables={cables} A={A} project={project} />}
        {tab === 'catalog' && <CatalogTab cableTypes={cableTypes} setCableTypes={setCableTypes} trayTypes={trayTypes} setTrayTypes={setTrayTypes} transformerTypes={transformerTypes} setTransformerTypes={setTransformerTypes} setEditing={setEditing} />}
        {tab === 'analysis' && <AnalysisTab cables={cables} A={A} cableTypes={cableTypes} segments={segments} />}
      </main>

      {/* hidden file inputs */}
      <input ref={fileInputRef} type="file" accept=".json,application/json" style={{ display:'none' }} onChange={handleJSONImport} />
      <input ref={csvInputRef} type="file" accept=".csv,text/csv" style={{ display:'none' }} onChange={handleCSVImport} />

      {/* Bottom tabs */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-10">
        <div className="grid grid-cols-6 text-center lg:max-w-6xl lg:mx-auto">
          {[
            { k:'project',  label:'Project', icon:Settings },
            { k:'cables',   label:'Cables',  icon:Cable },
            { k:'trays',    label:'Trays',   icon:Layers },
            { k:'diagram',  label:'Diagram', icon:GitBranch },
            { k:'catalog',  label:'Catalog', icon:BookOpen },
            { k:'analysis', label:'Analysis',icon:BarChart3 },
          ].map(({k,label,icon:Icon}) => (
            <button key={k} onClick={() => setTab(k)} className={`py-2 px-0.5 lg:py-3 flex flex-col items-center gap-0.5 lg:flex-row lg:justify-center lg:gap-2 ${tab===k?'text-blue-900 bg-blue-50 font-bold':'text-stone-600'}`}>
              <Icon size={18} />
              <span className="text-[10px] lg:text-sm">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {editing && <EditModal editing={editing} setEditing={setEditing} cableTypes={cableTypes} trayTypes={trayTypes} transformerTypes={transformerTypes} segments={segments} setCables={setCables} setSegments={setSegments} setCableTypes={setCableTypes} setTrayTypes={setTrayTypes} setTransformerTypes={setTransformerTypes} cables={cables} />}
      {sizingOpen && <SizingModal close={() => setSizingOpen(false)} project={project} cableTypes={cableTypes} segments={segments} cables={cables} setCables={setCables} />}
      {drawingOpen && <DrawingModal close={() => setDrawingOpen(false)} segments={segments} setSegments={setSegments} nodes={nodes} setNodes={setNodes} trayTypes={trayTypes} cables={cables} setCables={setCables} cableTypes={cableTypes} bgImage={bgImage} setBgImage={setBgImage} />}
      {newProjectOpen && <NewProjectModal close={() => setNewProjectOpen(false)} createProject={createProject} />}
    </div>
  );
}

// =========================
// TAB: PROJECT
// =========================
function NewProjectModal({ close, createProject }) {
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('empty');
  return (
    <div className="fixed inset-0 bg-black/50 z-30 flex items-end lg:items-center justify-center p-4" onClick={close}>
      <div className="bg-white p-4 rounded-2xl w-full lg:max-w-md" onClick={e=>e.stopPropagation()}>
        <h3 className="font-bold mb-3 text-blue-900 flex items-center gap-2"><Plus size={18}/> Nyt projekt</h3>
        <FormField label="Projektnavn" value={name} onChange={setName} hint="fx Kontorbygning Vest, Datacenter Nord" />
        <label className="block text-xs font-semibold text-stone-600 mt-3 mb-1">Start fra</label>
        <div className="space-y-2">
          {[
            ['empty', 'Tomt projekt', 'Start helt forfra'],
            ['office', 'Kontor-skabelon', '11 kabler, 2 tavler — lille eksempel'],
            ['dc', 'Datacenter-skabelon', 'Tier III, 2N redundans — stort eksempel'],
          ].map(([k, title, desc]) => (
            <button key={k} onClick={()=>setTemplate(k)}
              className={`w-full text-left p-2.5 rounded-lg border-2 ${template===k ? 'border-blue-500 bg-blue-50' : 'border-stone-200'}`}>
              <div className="font-semibold text-sm text-stone-800">{title}</div>
              <div className="text-xs text-stone-500">{desc}</div>
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={close} className="flex-1 py-3 border border-stone-300 rounded-lg font-semibold">Annuller</button>
          <button onClick={()=>createProject(name.trim() || 'Nyt projekt', template)} className="flex-[2] py-3 bg-blue-900 text-white rounded-lg font-semibold">Opret projekt</button>
        </div>
      </div>
    </div>
  );
}

function ProjectTab({ project, setProject, counts, critical, tight, loadTemplate, clearAll, transformerTypes, exportProjectJSON, fileInputRef, projectList, activeProjectId, switchProject, deleteProject, renameProject, openNewProject }) {
  const update = (k, v) => setProject({ ...project, [k]: v });
  const linkedT = project.transformer ? transformerTypes[project.transformer] : null;
  const activeName = projectList?.find(p => p.id === activeProjectId)?.name ?? '';
  return (
    <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
      {/* Project library */}
      <div className="bg-white p-3 rounded-xl shadow-sm lg:col-span-2">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-blue-900 flex items-center gap-1"><FileText size={16}/> Projekter</h2>
          <button onClick={openNewProject} className="bg-blue-900 text-white px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1 active:scale-95"><Plus size={14}/> Nyt projekt</button>
        </div>
        <div className="space-y-1">
          {(projectList || []).map(p => (
            <div key={p.id} className={`flex items-center gap-2 p-2 rounded-lg border ${p.id===activeProjectId ? 'bg-blue-50 border-blue-300' : 'border-stone-200'}`}>
              <button onClick={()=>switchProject(p.id)} className="flex-1 text-left flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${p.id===activeProjectId ? 'bg-blue-600' : 'bg-stone-300'}`}/>
                <input
                  value={p.name}
                  onChange={(e)=>renameProject(p.id, e.target.value)}
                  onClick={(e)=>e.stopPropagation()}
                  className="bg-transparent font-medium text-stone-800 text-sm outline-none focus:bg-white focus:border focus:border-blue-300 rounded px-1 py-0.5 min-w-0 flex-1"
                />
                {p.id===activeProjectId && <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-semibold">aktiv</span>}
              </button>
              <button onClick={()=>deleteProject(p.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Slet projekt"><Trash2 size={15}/></button>
            </div>
          ))}
          {(projectList || []).length === 0 && (
            <div className="text-sm text-stone-500 text-center py-3">Ingen projekter endnu.</div>
          )}
        </div>
        <p className="text-xs text-stone-400 mt-2">Tap et projektnavn for at redigere det · tap rækken for at skifte projekt</p>
      </div>

      <div className="bg-white p-3 rounded-xl shadow-sm lg:col-span-2">
        <h2 className="font-bold text-blue-900 mb-2">System status</h2>
        <div className="grid grid-cols-3 lg:grid-cols-5 gap-2 text-center">
          <Stat label="LS1" value={counts.LS1} bg={LS_COLOR.LS1} color={LS_BORDER.LS1} />
          <Stat label="LS2" value={counts.LS2} bg={LS_COLOR.LS2} color={LS_BORDER.LS2} />
          <Stat label="LS3" value={counts.LS3} bg={LS_COLOR.LS3} color={LS_BORDER.LS3} />
          <Stat label="Critical" value={critical} bg={critical>0?'#FFC7CE':'#C6EFCE'} color={critical>0?'#9C0006':'#006100'} />
          <Stat label="Tight" value={tight} bg={tight>0?'#FFEB9C':'#C6EFCE'} color={tight>0?'#9C5700':'#006100'} />
        </div>
      </div>

      <div className="bg-white p-3 rounded-xl shadow-sm">
        <h2 className="font-bold text-blue-900 mb-3">Project parameters</h2>
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
        <h2 className="font-bold text-blue-900 mb-3 flex items-center gap-1"><Zap size={16}/> MV-side (transformer)</h2>
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
        <h2 className="font-bold text-blue-900 mb-2 flex items-center gap-1"><Save size={16}/> Import / Export</h2>
        <p className="text-xs text-stone-600 mb-3">Flyt projektet mellem enheder via JSON-fil, eller del med kolleger.</p>
        <button onClick={exportProjectJSON} className="w-full bg-blue-50 hover:bg-blue-100 text-blue-900 p-3 rounded-lg mb-2 flex items-center justify-center gap-2 font-semibold active:scale-98 transition">
          <Download size={16}/> Eksportér projekt (JSON)
        </button>
        <button onClick={() => fileInputRef.current?.click()} className="w-full bg-green-50 hover:bg-green-100 text-green-900 p-3 rounded-lg flex items-center justify-center gap-2 font-semibold active:scale-98 transition">
          <Upload size={16}/> Importér projekt (JSON)
        </button>
      </div>

      <div className="bg-white p-3 rounded-xl shadow-sm">
        <h2 className="font-bold text-blue-900 mb-2">Templates</h2>
        <p className="text-xs text-stone-600 mb-3">Erstat det nuværende projekt med en færdig opsætning.</p>
        <button onClick={() => loadTemplate('office')} className="w-full bg-blue-50 border-2 border-blue-200 hover:bg-blue-100 text-blue-900 p-3 rounded-lg mb-2 flex items-center justify-between active:scale-98 transition">
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

      <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-xs text-blue-900">
        <p className="font-semibold mb-1">📱 Tip</p>
        <p>Tilføj denne side til din hjemmeskærm via Safari/Chrome's del-menu, så fungerer den som en app. Data gemmes automatisk på din enhed.</p>
      </div>
    </div>
  );
}

function Stat({ label, value, bg, color }) {
  return (
    <div className="p-2 rounded-lg" style={{ background:bg }}>
      <div className="text-xs" style={{ color }}>{label}</div>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
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
          <button onClick={() => setEditing({ kind:'cable', item: { id:`W${String(cables.length+1).padStart(3,'0')}`, from:'', to:'', function:'Socket circuit', V:230, phases:1, cable_type:Object.keys(cableTypes)[0], Ib:0, In:0, cos_phi:0.9, route:[] }, isNew:true })} className="bg-blue-900 text-white px-3 py-2 rounded-lg active:scale-95"><Plus size={18}/></button>
        </div>
        <div className="flex gap-1 text-xs items-center">
          {['all','LS1','LS2','LS3'].map(l => (
            <button key={l} onClick={()=>setLsFilter(l)} className={`px-2 py-1 rounded ${lsFilter===l?'bg-blue-900 text-white':'bg-stone-100 text-stone-700'}`}>{l}</button>
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
                  <span className="font-bold text-blue-900">{c.id}</span>
                  <LSBadge ls={d?.ls} />
                  <StatusBadge status={d?.status} />
                </div>
                <div className="text-sm text-stone-700">{c.from} → {c.to}</div>
                <div className="text-xs text-stone-500">{c.function} · {c.cable_type} · {c.V}V {c.phases}P</div>
              </div>
              <div className="flex gap-1">
                <button onClick={()=>setEditing({ kind:'cable', item:c, isNew:false })} className="p-2 text-blue-700"><Edit2 size={16}/></button>
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
      <div className="bg-white p-3 rounded-xl shadow-sm sticky top-16 z-5 flex justify-between items-center gap-2">
        <div className="text-sm text-stone-700">{segs.length} tray segments</div>
        <div className="flex gap-1">
          <button onClick={() => setDrawingOpen(true)} className="bg-amber-500 text-white px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1 active:scale-95"><Pencil size={14}/> Tegn</button>
          <button onClick={()=>setEditing({ kind:'segment', item:{ id:`WC${String(segs.length+1).padStart(3,'0')}`, from:'', to:'', length_m:5, tray_type:Object.keys(trayTypes)[0] }, isNew:true })} className="bg-blue-900 text-white px-3 py-2 rounded-lg active:scale-95"><Plus size={18}/></button>
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
                  <span className="font-bold text-blue-900">{id}</span>
                  <StatusBadge status={f?.status}/>
                </div>
                <div className="text-sm text-stone-700">{s.from} → {s.to}</div>
                <div className="text-xs text-stone-500">{s.length_m}m · {s.tray_type}</div>
              </div>
              <div className="flex gap-1">
                <button onClick={()=>setEditing({ kind:'segment', item:{id, ...s}, isNew:false })} className="p-2 text-blue-700"><Edit2 size={16}/></button>
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
        <button onClick={()=>setSub('cables')} className={`py-2 rounded ${sub==='cables'?'bg-blue-900 text-white':'text-stone-700'}`}>Cables</button>
        <button onClick={()=>setSub('trays')} className={`py-2 rounded ${sub==='trays'?'bg-blue-900 text-white':'text-stone-700'}`}>Trays</button>
        <button onClick={()=>setSub('xfmr')} className={`py-2 rounded ${sub==='xfmr'?'bg-blue-900 text-white':'text-stone-700'}`}>Transformers</button>
      </div>

      {sub === 'cables' && (
        <>
          <div className="flex justify-end">
            <button onClick={()=>setEditing({ kind:'cable_type', item:{ name:'New cable', conductors:5, cross_section:'5G6', S_mm2:6, od_mm:13, iz_a:38, is_parallel:1 }, isNew:true })} className="bg-blue-900 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1"><Plus size={16}/> Tilføj</button>
          </div>
          {Object.entries(cableTypes).map(([n, t]) => (
            <div key={n} className="bg-white p-3 rounded-xl shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-blue-900">{n}</div>
                  <div className="text-xs text-stone-500">{t.cross_section} · {t.conductors} cond · {t.is_parallel}× parallel</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={()=>setEditing({ kind:'cable_type', item:{name:n, ...t}, isNew:false })} className="p-2 text-blue-700"><Edit2 size={16}/></button>
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
            <button onClick={()=>setEditing({ kind:'tray_type', item:{ name:'New tray', width_mm:200, height_mm:60, gross_area_mm2:12000, max_fill_percent:40 }, isNew:true })} className="bg-blue-900 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1"><Plus size={16}/> Tilføj</button>
          </div>
          {Object.entries(trayTypes).map(([n, t]) => (
            <div key={n} className="bg-white p-3 rounded-xl shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-blue-900">{n}</div>
                  <div className="text-xs text-stone-500">{t.width_mm} × {t.height_mm} mm · max {t.max_fill_percent}%</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={()=>setEditing({ kind:'tray_type', item:{name:n, ...t}, isNew:false })} className="p-2 text-blue-700"><Edit2 size={16}/></button>
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
            <button onClick={()=>setEditing({ kind:'transformer_type', item:{ name:'New TR', S_kVA:1000, U_pri_kV:10, U_sec_V:400, uk_pct:6 }, isNew:true })} className="bg-blue-900 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1"><Plus size={16}/> Tilføj</button>
          </div>
          {Object.entries(transformerTypes).map(([n, t]) => {
            const z = calcZsource(t, 1);
            return (
              <div key={n} className="bg-white p-3 rounded-xl shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-blue-900">{n}</div>
                    <div className="text-xs text-stone-500">{t.S_kVA} kVA · {t.U_pri_kV} kV / {t.U_sec_V} V · uk={t.uk_pct}%</div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={()=>setEditing({ kind:'transformer_type', item:{name:n, ...t}, isNew:false })} className="p-2 text-blue-700"><Edit2 size={16}/></button>
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
            <button key={d} onClick={() => setMaxDepth(d===99?Infinity:d)} className={`px-2 py-1 text-xs rounded ${maxDepth===(d===99?Infinity:d)?'bg-blue-900 text-white':'bg-stone-100 text-stone-700'}`}>{d===99?'∞':d}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setZoom(z=>Math.max(0.3, z-0.2))} className="px-2 py-1 text-xs bg-stone-100 rounded flex items-center gap-1"><ZoomOut size={12}/></button>
          <span className="text-xs text-stone-600">{Math.round(zoom*100)}%</span>
          <button onClick={()=>setZoom(z=>Math.min(3, z+0.2))} className="px-2 py-1 text-xs bg-stone-100 rounded flex items-center gap-1"><ZoomIn size={12}/></button>
          <button onClick={()=>setZoom(1)} className="px-2 py-1 text-xs bg-stone-100 rounded">Fit</button>
          <button onClick={downloadSVG} className="ml-auto px-2 py-1 text-xs bg-blue-900 text-white rounded flex items-center gap-1"><Download size={12}/> SVG</button>
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
          <h2 className="font-bold text-blue-900 flex items-center gap-1"><Calculator size={18}/> Cable sizing helper</h2>
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
                  <button onClick={()=>applyCandidate(c)} className="px-3 py-1 bg-blue-900 text-white text-xs rounded">Brug</button>
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
          <button key={k} onClick={()=>setView(k)} className={`py-2 rounded ${view===k?'bg-blue-900 text-white':'text-stone-700'}`}>{l}</button>
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
              <div className="text-xs text-blue-800 mt-1">→ {o.rec}</div>
            </div>
          ))}
        </>
      )}

      {view === 'vd' && (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-blue-900 text-white"><tr><th className="p-2 text-left">Cable</th><th className="p-2">L</th><th className="p-2">ΔU local</th><th className="p-2">ΔU total</th><th className="p-2">Limit</th><th className="p-2"></th></tr></thead>
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
            <thead className="bg-blue-900 text-white"><tr><th className="p-2 text-left">Cable</th><th className="p-2">MCB</th><th className="p-2">Z [mΩ]</th><th className="p-2">Ik</th><th className="p-2">Ia</th><th className="p-2"></th></tr></thead>
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
            <thead className="bg-blue-900 text-white"><tr><th className="p-2 text-left">Upstream</th><th className="p-2">→</th><th className="p-2 text-left">Down</th><th className="p-2">In ratio</th><th className="p-2">Status</th></tr></thead>
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
function DrawingModal({ close, segments, setSegments, nodes, setNodes, trayTypes, cables, setCables, cableTypes, bgImage, setBgImage }) {
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
  // Undo history — snapshots of {nodes, segs, cables}. lBg excluded (large data URLs).
  const undoStackRef = useRef([]);
  const isUndoingRef = useRef(false);
  const lastSnapRef = useRef('');
  const [canUndo, setCanUndo] = useState(false);
  const [bgBusy, setBgBusy] = useState(false);            // PDF rendering in progress
  const [bgPanel, setBgPanel] = useState(false);          // show background adjust panel
  const [bgStatus, setBgStatus] = useState(null);         // visible status/error message
  const [hideChrome, setHideChrome] = useState(false);    // hide panels for more drawing space
  const [junctionShape, setJunctionShape] = useState('dot');  // dot|tee|corner — chosen before placing
  const [junctionSize, setJunctionSize] = useState(14);       // default size for new junctions
  const [bgLocked, setBgLocked] = useState(() => bgImage?.locked || false);  // lock background scale/position
  const [calibrating, setCalibrating] = useState(false);  // two-point scale calibration in progress
  const [calibPoints, setCalibPoints] = useState([]);     // world points clicked during calibration
  const [calibDialog, setCalibDialog] = useState(null);   // { pixelDist } awaiting real distance input
  const [mode, setMode] = useState('junction'); // 'junction'|'board'|'load'|'connect'|'cable'|'edit'|'bg'
  const [connectFrom, setConnectFrom] = useState(null);
  const [cableFrom, setCableFrom] = useState(null);  // start node for cable routing
  const [cableMsg, setCableMsg] = useState(null);    // guidance/error in cable mode
  const [pendingCable, setPendingCable] = useState(null);  // { from, to, route }
  const [editCable, setEditCable] = useState(null);  // cable id being edited
  const [pending, setPending] = useState(null);     // pending new segment+cable
  const [editNode, setEditNode] = useState(null);
  const [selectedNodes, setSelectedNodes] = useState([]);   // multi-select (same kind only)
  const [multiEdit, setMultiEdit] = useState(null);         // { kind } when editing multiple
  const [editSeg, setEditSeg] = useState(null);       // segment being edited (dialog open)
  const [selectedSeg, setSelectedSeg] = useState(null);  // segment selected (shows bend handles)
  const [dragging, setDragging] = useState(null);   // node id being dragged
  const [moved, setMoved] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const svgRef = useRef(null);
  const lastTapRef = useRef(0);
  const nodeTapRef = useRef({ id: null, t: 0 });   // double-tap detection on nodes
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
    // Fallback: proportional mapping
    const r = svg.getBoundingClientRect();
    const vbW = bounds.w, vbH = bounds.h;
    const sx = r.width > 0 ? (clientX - r.left) / r.width : 0;
    const sy = r.height > 0 ? (clientY - r.top) / r.height : 0;
    return { x: bounds.x + sx * vbW, y: bounds.y + sy * vbH };
  };
  const getPoint = (e) => {
    const t = e.touches?.[0] || e.changedTouches?.[0];
    return toSvg(t ? t.clientX : e.clientX, t ? t.clientY : e.clientY);
  };
  const distM = (a, b) => Math.max(0.5, Math.round(Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2) / PX_PER_M * 2) / 2);

  // Canvas pointer down — track pointers, start pan (1 finger) or gesture (2 fingers)
  const onCanvasPointerDown = (e) => {
    // Track every pointer for multi-touch
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Two fingers down → start pinch/pan gesture, cancel any single-finger action
    if (pointersRef.current.size === 2) {
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

    // Single finger in pan mode → start a pan
    if (mode !== 'pan') return;
    if (e.target.tagName === 'circle' || e.target.tagName === 'rect' || e.target.tagName === 'polygon') return;
    const svg = svgRef.current;
    try { svg?.setPointerCapture?.(e.pointerId); } catch (err) {}
    const r = svg.getBoundingClientRect();
    const worldPerPxX = r.width > 0 ? bounds.w / r.width : 1;
    const worldPerPxY = r.height > 0 ? bounds.h / r.height : 1;
    panInfoRef.current = {
      startClientX: e.clientX, startClientY: e.clientY,
      startView: { ...bounds },
      worldPerPxX, worldPerPxY,
      pointerId: e.pointerId,
    };
    movedRef.current = false;
  };

  // Switch tool mode and clear any in-progress selections
  const switchMode = (m) => {
    setMode(m);
    setConnectFrom(null);
    setCableFrom(null);
    setCableMsg(null);
    if (m !== 'edit') { setSelectedNodes([]); setSelectedSeg(null); }
  };

  // Multi-select: add/remove a node, but only within one category (kind)
  const toggleSelectNode = (id) => {
    setSelectedNodes(prev => {
      const node = lNodes[id];
      const kind = node?.kind || 'junction';
      if (prev.includes(id)) return prev.filter(x => x !== id);
      // If current selection is a different kind, start a fresh selection
      if (prev.length > 0) {
        const firstKind = lNodes[prev[0]]?.kind || 'junction';
        if (firstKind !== kind) return [id];
      }
      return [...prev, id];
    });
  };
  const clearSelection = () => { setSelectedNodes([]); setSelectedSeg(null); };

  // Canvas tap — place node of the active kind
  const onCanvasTap = (e) => {
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
      const id = nextNodeIdByKind(lNodes, mode);
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
    // Edit mode is handled in pointer-up (click events are unreliable with pointer capture)
    if (mode === 'edit') return;
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
        // When the destination is a load, the cable adopts the load's electrical data
        const isLoad = kind === 'load';
        setPendingCable({
          from: cableFrom, to: id, route: route || [], noPath: route === null,
          toKind: kind,
          cable_type: Object.keys(cableTypes)[0],
          cable_function: isLoad ? (node.function || 'Socket circuit') : 'Sub-board feeder',
          Ib: isLoad ? (node.Ib || 0) : 0,
          In: isLoad ? (node.In || 0) : 0,
          V: isLoad ? (node.V || 230) : 400,
          phases: isLoad ? (node.phases || 1) : 3,
          cos_phi: isLoad ? (node.cos_phi || 0.9) : 0.9,
          adoptedFromLoad: isLoad,
        });
        setCableFrom(null);
      }
    }
  };

  // Double-click opens the editor — only in edit mode (mouse)
  const onNodeDouble = (e, id) => {
    e.stopPropagation();
    if (mode === 'edit') setEditNode(id);
  };
  const onSegDouble = (e, id) => {
    e.stopPropagation();
    if (mode === 'edit') setEditSeg(id);
  };

  const onSegTap = (e, id) => {
    e.stopPropagation();
    if (movedRef.current) { movedRef.current = false; return; }
    if (mode !== 'edit') return;
    // Double-tap/double-click opens the edit dialog
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
  // Runs in every mode so double-tap/edit works everywhere; only actually moves
  // the node when in edit mode (canMove).
  const startDrag = (e, id) => {
    // In connect/cable mode, let the tap handler pick nodes instead
    if (mode === 'connect' || mode === 'cable') return;
    e.stopPropagation();
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // If a second finger is already down, let the gesture handler take over
    if (pointersRef.current.size >= 2) return;
    const svg = svgRef.current;
    try { svg?.setPointerCapture?.(e.pointerId); } catch (err) {}
    const p = getPoint(e);
    dragInfoRef.current = { id, offsetX: p.x - lNodes[id].x, offsetY: p.y - lNodes[id].y, startX: p.x, startY: p.y, pointerId: e.pointerId, canMove: mode === 'edit' };
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

    // Two-finger gesture: pinch-zoom + pan (highest priority)
    const g = gestureRef.current;
    if (g && pointersRef.current.size >= 2) {
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
      // Ignore sub-threshold jitter so a click isn't mistaken for a drag
      if (!movedRef.current && di.startX !== undefined) {
        const moveDist = Math.hypot(p.x - di.startX, p.y - di.startY);
        if (moveDist < 3) return;
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
    // Remove this pointer from tracking
    pointersRef.current.delete(e.pointerId);
    // End gesture when fewer than 2 fingers remain
    if (gestureRef.current && pointersRef.current.size < 2) {
      gestureRef.current = null;
      // If one finger remains, re-seed it as a fresh pan start so it doesn't jump
      if (pointersRef.current.size === 1 && mode === 'pan') {
        const [remaining] = Array.from(pointersRef.current.values());
        const r = svg.getBoundingClientRect();
        panInfoRef.current = {
          startClientX: remaining.x, startClientY: remaining.y,
          startView: { ...bounds },
          worldPerPxX: r.width > 0 ? bounds.w / r.width : 1,
          worldPerPxY: r.height > 0 ? bounds.h / r.height : 1,
          pointerId: null,
        };
      }
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
        // A tap (no drag) on a node — detect double-tap to open editor (any mode)
        const now = Date.now();
        if (nodeTapRef.current.id === di.id && now - nodeTapRef.current.t < 400) {
          nodeTapRef.current = { id: null, t: 0 };
          // If this node is part of a multi-selection, edit all of them together
          if (selectedNodes.length > 1 && selectedNodes.includes(di.id)) {
            setMultiEdit({ kind: lNodes[selectedNodes[0]]?.kind || 'junction' });
          } else {
            setEditNode(di.id);
          }
        } else {
          nodeTapRef.current = { id: di.id, t: now };
          // Single tap in edit mode also toggles multi-select membership
          if (mode === 'edit') toggleSelectNode(di.id);
        }
      }
      dragInfoRef.current = null;
      setDragging(null);
      if (movedRef.current) lastTapRef.current = Date.now();
      return;
    }
    if (pi) {
      try { svg?.releasePointerCapture?.(e.pointerId); } catch (err) {}
      panInfoRef.current = null;
      if (movedRef.current) lastTapRef.current = Date.now();
      return;
    }
  };

  const confirmPending = () => {
    const segId = nextSegId(lSegs);
    setLSegs({ ...lSegs, [segId]: { from: pending.from, to: pending.to, length_m: Number(pending.length_m), tray_type: pending.tray_type } });
    setPending(null);
  };

  const confirmPendingCable = () => {
    const id = nextCableId(lCables);
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

  const save = () => {
    setNodes(lNodes); setSegments(lSegs); setCables(lCables);
    setBgImage(lBg ? { ...lBg, locked: bgLocked } : null);
    close();
  };

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
      if (isPdf) {
        setBgStatus('Indlæser PDF-bibliotek …');
        const pdfjsLib = await loadPdfJs();
        setBgStatus('Læser PDF …');
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      } else if (isImg) {
        setBgStatus('Læser billede …');
        dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = () => rej(new Error('FileReader fejl'));
          r.readAsDataURL(file);
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
  const bounds = vbox || contentBounds;

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

  // Set scale by typed drawing ratio (e.g. 1:100). We need the print resolution to
  // convert; we assume the rendered bg is at a known px-per-metre. Simpler model:
  // at 1:R, one metre on paper = R metres real. We map so that the displayed bg matches
  // grid using the image's pixel dimensions and an assumed source DPI of the original.
  // Practical approach: ratio scales the bg so its pixels map to grid via a metre factor.
  const applyRatio = (ratioR) => {
    if (!lBg || !ratioR || ratioR <= 0) return;
    // The PDF was rendered at scale 2. A4/A1 etc. unknown, so we use a sensible assumption:
    // many CAD PDFs are exported so that 1 drawing unit ≈ defined by ratio. We store the
    // ratio for display and let the user fine-tune with the scale slider / wheel.
    setLBg({ ...lBg, scaleRatio: ratioR });
    setBgStatus(`Målestoksforhold 1:${ratioR} gemt (vises som reference).`);
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
  const updateSeg = (id, data) => { setLSegs({ ...lSegs, [id]: { ...lSegs[id], ...data } }); setEditSeg(null); };
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
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-900 to-blue-700 text-white p-3 flex items-center justify-between shadow">
        <button onClick={cancel} className="px-3 py-1 rounded active:bg-blue-800"><X size={20}/></button>
        <h2 className="font-bold flex items-center gap-2"><Pencil size={18}/> Tegn anlæg</h2>
        <div className="flex items-center gap-1">
          <button onClick={undo} disabled={!canUndo}
                  className={`px-2 py-1.5 rounded text-xs flex items-center gap-1 ${canUndo ? 'bg-blue-800/60 active:bg-blue-800' : 'bg-blue-800/20 text-blue-300'}`}
                  title="Fortryd sidste ændring">
            <RefreshCw size={14} style={{ transform:'scaleX(-1)' }}/> Fortryd
          </button>
          <button onClick={()=>setHideChrome(h=>!h)} className="px-2 py-1.5 rounded text-xs bg-blue-800/60 active:bg-blue-800 flex items-center gap-1" title="Skjul/vis paneler for mere plads">
            {hideChrome ? <ChevronRight size={14}/> : <X size={14}/>} {hideChrome ? 'Vis' : 'Skjul'}
          </button>
          <button onClick={save} className="bg-white text-blue-900 px-3 py-1.5 rounded-lg font-semibold text-sm flex items-center gap-1"><Save size={14}/> Gem</button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="bg-stone-100 p-2 flex gap-1 overflow-x-auto border-b">
        <ToolBtn active={mode==='junction'} onClick={()=>switchMode('junction')} icon={Plus} label="Knude"/>
        <ToolBtn active={mode==='board'} onClick={()=>switchMode('board')} icon={Database} label="Tavle"/>
        <ToolBtn active={mode==='load'} onClick={()=>switchMode('load')} icon={Zap} label="Last"/>
        <ToolBtn active={mode==='connect'} onClick={()=>switchMode('connect')} icon={Link2} label="Forbind"/>
        <ToolBtn active={mode==='cable'} onClick={()=>switchMode('cable')} icon={Cable} label="Kabel"/>
        <ToolBtn active={mode==='edit'} onClick={()=>switchMode('edit')} icon={Edit2} label="Rediger"/>
        <ToolBtn active={mode==='pan'} onClick={()=>switchMode('pan')} icon={Move} label="Flyt"/>
        <div className="border-l mx-1"></div>
        <button onClick={()=>setShowGrid(g=>!g)} className={`px-2 py-1.5 rounded text-xs flex items-center gap-1 ${showGrid?'bg-blue-100 text-blue-900':'text-stone-600'}`}><Grid3x3 size={14}/> Grid</button>
        <button onClick={()=>zoomBy(1/1.25)} className="px-2 py-1.5 rounded text-xs bg-stone-200"><ZoomOut size={14}/></button>
        <button onClick={()=>zoomBy(1.25)} className="px-2 py-1.5 rounded text-xs bg-stone-200"><ZoomIn size={14}/></button>
        <button onClick={fitView} className="px-2 py-1.5 rounded text-xs bg-stone-200">Fit</button>
        <div className="ml-auto">
          <button onClick={renumber} className="px-2 py-1.5 rounded text-xs bg-purple-100 text-purple-900 flex items-center gap-1" title="Renumber all segments"><RefreshCw size={12}/> WC###</button>
        </div>
      </div>

      {/* Junction shape picker — appears when Knude mode is active */}
      {mode === 'junction' && !hideChrome && (
        <div className="bg-blue-100/70 border-b border-blue-200 px-3 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-blue-900 shrink-0">Vælg form:</span>
          {[
            ['dot', 'Punkt', <svg key="d" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="6" fill="#fff" stroke="#1565C0" strokeWidth="2"/></svg>],
            ['tee', 'T-stykke', <svg key="t" width="22" height="22" viewBox="0 0 22 22"><line x1="3" y1="8" x2="19" y2="8" stroke="#1565C0" strokeWidth="2.5" strokeLinecap="round"/><line x1="11" y1="8" x2="11" y2="19" stroke="#1565C0" strokeWidth="2.5" strokeLinecap="round"/><circle cx="3" cy="8" r="2" fill="#1565C0"/><circle cx="19" cy="8" r="2" fill="#1565C0"/><circle cx="11" cy="19" r="2" fill="#1565C0"/></svg>],
            ['corner', 'Hjørne', <svg key="c" width="22" height="22" viewBox="0 0 22 22"><polyline points="5,4 5,15 16,15" fill="none" stroke="#1565C0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="5" cy="4" r="2" fill="#1565C0"/><circle cx="16" cy="15" r="2" fill="#1565C0"/></svg>],
          ].map(([k, label, icon]) => (
            <button key={k} onClick={()=>setJunctionShape(k)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border-2 ${junctionShape===k ? 'border-blue-600 bg-white' : 'border-transparent bg-white/60'}`}>
              {icon} {label}
            </button>
          ))}
          <label className="text-xs text-blue-900 flex items-center gap-1 ml-auto shrink-0">
            Størrelse
            <input type="range" min="6" max="40" value={junctionSize} onChange={e=>setJunctionSize(Number(e.target.value))} className="w-20"/>
            <span className="w-7">{junctionSize}</span>
          </label>
        </div>
      )}

      {/* Dedicated background (tegningsgrundlag) bar — compact when active */}
      {!hideChrome && (
      <div className="bg-emerald-50 border-b border-emerald-100 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-emerald-700 shrink-0"/>
          {lBg ? (
            <>
              <span className="text-xs text-emerald-900 truncate flex-1">{lBg.name || 'Tegningsgrundlag aktivt'}</span>
              <button onClick={()=>setBgPanel(p=>!p)} className="text-xs px-3 py-1 bg-emerald-600 text-white rounded-lg font-semibold shrink-0">{bgPanel ? 'Skjul' : 'Juster'}</button>
              <button onClick={removeBg} className="text-xs px-2 py-1 bg-white text-red-600 border border-red-200 rounded-lg shrink-0 flex items-center gap-1"><Trash2 size={12}/></button>
            </>
          ) : (
            <>
              <span className="text-xs text-emerald-900 flex-1">Tilføj plantegning som baggrund (PDF eller billede)</span>
              <label className="text-xs px-3 py-1 bg-emerald-600 text-white rounded-lg font-semibold shrink-0 cursor-pointer inline-flex items-center gap-1">
                <Upload size={13}/> Vælg fil
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*" onChange={onBgFile} style={{ position:'absolute', left:'-9999px', width:1, height:1 }}/>
              </label>
            </>
          )}
        </div>
        {!lBg && (
          <p className="text-[11px] text-emerald-700/80 mt-1">
            Virker ikke i preview? Fil-upload kræver den installerede (Vercel) version — preview-vinduet blokerer filadgang.
          </p>
        )}
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

          {/* Lock toggle */}
          <button onClick={()=>setBgLocked(l=>!l)}
                  className={`w-full text-xs py-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 ${bgLocked ? 'bg-blue-900 text-white' : 'bg-stone-100 text-stone-700 border border-stone-300'}`}>
            {bgLocked ? '🔒 Tegning låst — knuder følger tegningen' : '🔓 Lås tegning (så knuder ikke forskydes)'}
          </button>

          {/* Calibration */}
          <div className="border border-blue-100 rounded-lg p-2 bg-blue-50/40 space-y-1.5">
            <div className="text-xs font-semibold text-blue-900">Målestok</div>
            <button onClick={()=>{ setCalibrating(true); setCalibPoints([]); setBgPanel(false); setBgStatus('Tap to punkter på tegningen med kendt afstand …'); }}
                    disabled={bgLocked}
                    className={`w-full text-xs py-2 rounded-lg font-semibold flex items-center justify-center gap-1 ${bgLocked ? 'bg-stone-100 text-stone-400' : 'bg-blue-600 text-white'}`}>
              <MousePointer2 size={13}/> Kalibrér: klik to punkter med kendt afstand
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-600 shrink-0">eller 1:</span>
              <input type="number" placeholder="100" defaultValue={lBg.scaleRatio || ''}
                     onBlur={e=> e.target.value && applyRatio(Number(e.target.value))}
                     disabled={bgLocked}
                     className="flex-1 border border-stone-300 rounded px-2 py-1 text-sm disabled:bg-stone-100"/>
              <span className="text-xs text-stone-500 shrink-0">{lBg.scaleRatio ? `(1:${lBg.scaleRatio})` : ''}</span>
            </div>
          </div>

          <label className={`block text-xs ${bgLocked ? 'text-stone-300' : 'text-stone-600'}`}>Skalering: {Math.round((lBg.scale||1)*100)}%
            <input type="range" min="10" max="400" value={(lBg.scale||1)*100}
                   onChange={e=>updateBg({ scale: Number(e.target.value)/100 })}
                   disabled={bgLocked}
                   className="w-full"/>
          </label>
          <label className="block text-xs text-stone-600">Gennemsigtighed: {Math.round((lBg.opacity ?? 0.5)*100)}%
            <input type="range" min="10" max="100" value={(lBg.opacity ?? 0.5)*100}
                   onChange={e=>updateBg({ opacity: Number(e.target.value)/100 })}
                   className="w-full"/>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={`text-xs ${bgLocked ? 'text-stone-300' : 'text-stone-600'}`}>X-position
              <input type="number" value={Math.round(lBg.x)} onChange={e=>updateBg({ x: Number(e.target.value) })}
                     disabled={bgLocked}
                     className="w-full border border-stone-300 rounded px-2 py-1 text-sm disabled:bg-stone-100"/>
            </label>
            <label className={`text-xs ${bgLocked ? 'text-stone-300' : 'text-stone-600'}`}>Y-position
              <input type="number" value={Math.round(lBg.y)} onChange={e=>updateBg({ y: Number(e.target.value) })}
                     disabled={bgLocked}
                     className="w-full border border-stone-300 rounded px-2 py-1 text-sm disabled:bg-stone-100"/>
            </label>
          </div>
          <p className="text-[11px] text-stone-400">Tip: Brug musens scrollhjul til at zoome hele tegningen. Kalibrér målestok ved at klikke to punkter med kendt afstand — så bliver længderne på dine føringsveje korrekte.</p>
        </div>
      )}

      {/* Help bar */}
      {!hideChrome && (
      <div className="bg-blue-50 text-blue-900 text-xs text-center py-1.5 px-2">
        {mode === 'junction' && `→ Tap for at placere ${junctionShape==='tee'?'et T-stykke':junctionShape==='corner'?'et hjørne':'et punkt'} · dobbeltklik for at redigere`}
        {mode === 'board' && '→ Tap for at placere en tavle (Q1, Q2, …) · dobbeltklik for at redigere'}
        {mode === 'load' && '→ Tap for at placere en belastning (X1, X2, …) · dobbeltklik for at redigere'}
        {mode === 'connect' && (connectFrom ? `→ Tap en anden knude for at forbinde til ${connectFrom}` : '→ Tap første knude/tavle/last')}
        {mode === 'cable' && (cableMsg
          ? `⚠ ${cableMsg}`
          : (cableFrom
              ? `→ Tap mål-tavle eller last · ruten findes automatisk fra ${cableFrom}`
              : '→ Tap kablets start-tavle (kabler går fra tavle til last/tavle)'))}
        {mode === 'pan' && '→ Træk i baggrunden for at flytte hele lærredet · Fit nulstiller'}
        <span className="block text-blue-700 opacity-75 mt-0.5">✌️ Dobbeltklik for at redigere · træk for at flytte · to fingre for at zoome/panne</span>
      </div>
      )}

      {/* Multi-select action bar (edit mode) */}
      {mode === 'edit' && selectedNodes.length > 0 && (
        <div className="bg-blue-900 text-white px-3 py-2 flex items-center gap-2 text-sm">
          <span className="font-semibold">{selectedNodes.length} valgt</span>
          <span className="text-blue-200 text-xs">
            ({(lNodes[selectedNodes[0]]?.kind || 'junction') === 'board' ? 'tavler' : (lNodes[selectedNodes[0]]?.kind || 'junction') === 'load' ? 'laster' : 'punkter'})
          </span>
          <button onClick={()=>setMultiEdit({ kind: lNodes[selectedNodes[0]]?.kind || 'junction' })}
                  className="ml-auto bg-white text-blue-900 px-3 py-1.5 rounded-lg font-semibold text-xs">Rediger alle</button>
          <button onClick={clearSelection} className="bg-blue-800 px-2 py-1.5 rounded-lg text-xs">Ryd</button>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 overflow-hidden bg-stone-50 relative">
        <svg ref={svgRef}
             viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
             className="w-full h-full"
             style={{ cursor: mode==='pan' ? 'grab' : 'crosshair', touchAction:'none' }}
             onClick={onCanvasTap}
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
            // Tray width drives both the line thickness and its colour
            const trayW = trayTypes[s.tray_type]?.width_mm;
            const autoColor = trayWidthColor(trayW);
            const autoStroke = trayWidthStroke(trayW);
            // A manually chosen colour overrides the width-based colour
            const segStroke = isSel ? '#a04500' : (s.color || autoColor);
            const segWidth = isSel ? autoStroke + 2 : autoStroke;
            const dash = s.lineStyle === 'dashed' ? '10,6' : s.lineStyle === 'dotted' ? '2,5' : undefined;
            return (
              <g key={id} onClick={(e)=>onSegTap(e, id)} onDoubleClick={(e)=>onSegDouble(e, id)} style={{ cursor:'pointer' }}>
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
                      fontSize="11" fontWeight="bold" fill="#0B3D91"
                      style={{ pointerEvents:'none' }}>{id}</text>
                <text x={mid.x} y={mid.y + 12} textAnchor="middle"
                      fontSize="10" fill="#666" style={{ pointerEvents:'none' }}>
                  {wps.length > 0 ? `${chainM}m` : `${s.length_m}m`} · {s.tray_type}
                </text>
              </g>
            );
          })}

          {/* Cables are registered in the data model but not drawn on the canvas —
              they run inside the tray segments. Edit them via the Cables tab. */}

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
            // For junctions (point/T/corner): colour follows tray width (like segments),
            // unless a manual colour is set. Boards/loads keep their default colour.
            let defStroke;
            if (kind === 'junction') {
              const jw = trayTypes[p.tray_type]?.width_mm;
              defStroke = jw ? trayWidthColor(jw) : '#1565C0';
            } else {
              defStroke = kind==='board' ? '#0B3D91' : '#37474F';
            }
            const stroke = isFrom ? '#a04500' : (isSel ? '#9C5700' : (p.color || defStroke));
            const fill = isFrom ? '#FFE0B2' : (isSel ? '#FFF3CD' : (p.color ? lightenColor(p.color) : (kind==='board' ? '#E3F2FD' : kind==='load' ? '#ECEFF1' : (kind==='junction' && p.tray_type ? lightenColor(defStroke) : '#fff'))));
            const common = {
              onClick:(e)=>onNodeTap(e, id),
              onDoubleClick:(e)=>onNodeDouble(e, id),
              onPointerDown:(e)=>startDrag(e, id),
              style:{ cursor: mode==='edit' ? 'move' : 'pointer', touchAction:'none', opacity: dim ? 0.35 : 1 },
            };
            if (kind === 'board') {
              const bw = (p.size || 14) * 1.85, bh = (p.size || 14) * 1.07;
              return (
                <g key={id} {...common}>
                  <rect x={p.x-bw} y={p.y-bh} width={bw*2} height={bh*2} rx="3" fill={fill} stroke={stroke} strokeWidth="2.5"/>
                  <text x={p.x} y={p.y+1} textAnchor="middle" fontSize="11" fontWeight="bold" fill={stroke} style={{ pointerEvents:'none', userSelect:'none' }}>{id}</text>
                  {p.In_main ? <text x={p.x} y={p.y+bh*0.7} textAnchor="middle" fontSize="7" fill="#666" style={{ pointerEvents:'none' }}>{p.In_main}A</text> : null}
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
            // Junction: dot (circle), T-piece, or corner — unified design language
            const jShape = p.shape || 'dot';
            const jSize = p.size || 14;
            const rot = p.rotation || 0;
            const sw = Math.max(3, Math.round(jSize / 3.2));   // line thickness
            const endR = Math.max(3, jSize / 3.2);             // end-cap radius
            const isJSel = editNode === id || selectedNodes.includes(id);
            // shared end-cap: white fill, coloured ring — matches the dot junction
            const endCap = (cx, cy, key) => (
              <circle key={key} cx={cx} cy={cy} r={endR} fill="#fff" stroke={stroke} strokeWidth="2"/>
            );
            if (jShape === 'tee') {
              const arm = jSize;
              const showRot = mode === 'edit' && isJSel;
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
              const showRot = mode === 'edit' && isJSel;
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
            return (
              <g key={id} {...common}>
                {isJSel && <circle cx={p.x} cy={p.y} r={jSize+4} fill="none" stroke="#9C5700" strokeWidth="1.5" strokeDasharray="3,2"/>}
                <circle cx={p.x} cy={p.y} r={jSize} fill={fill} stroke={stroke} strokeWidth="2.5"/>
                <text x={p.x} y={p.y+4} textAnchor="middle" fontSize={Math.max(8, Math.min(jSize-4, 11))} fontWeight="bold" fill={stroke} style={{ pointerEvents:'none', userSelect:'none' }}>{id}</text>
              </g>
            );
          })}
        </svg>

        {/* Empty state */}
        {Object.keys(lNodes).length === 0 && (
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

        {/* Tray-width colour legend — shows the widths actually in use */}
        {(() => {
          const widthsUsed = Array.from(new Set(
            Object.values(lSegs).map(s => trayTypes[s.tray_type]?.width_mm).filter(Boolean)
          )).sort((a,b)=>a-b);
          if (widthsUsed.length === 0) return null;
          return (
            <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur rounded-lg shadow px-2 py-1.5 text-xs space-y-1 pointer-events-none">
              <div className="font-semibold text-stone-600 mb-0.5">Bakkebredde</div>
              {widthsUsed.map(w => (
                <div key={w} className="flex items-center gap-1.5">
                  <svg width="26" height="10"><line x1="2" y1="5" x2="24" y2="5" stroke={trayWidthColor(w)} strokeWidth={Math.min(8, trayWidthStroke(w))} strokeLinecap="round"/></svg>
                  <span>{w} mm</span>
                </div>
              ))}
            </div>
          );
        })()}
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
            <h3 className="font-bold mb-3 text-blue-900">Ny føringsvej: {pending.from} → {pending.to}</h3>
            <p className="text-xs text-stone-500 mb-3">Auto-beregnet længde fra skærm-distance. Tilret hvis nødvendigt. Kabler tilføjes separat i Kabel-mode.</p>
            <FormField label="Længde [m]" type="number" step="0.5" value={pending.length_m} onChange={v=>setPending({...pending, length_m: v})}/>
            <Selector label="Tray type" value={pending.tray_type} onChange={v=>setPending({...pending, tray_type: v})} options={Object.keys(trayTypes)}/>
            <div className="flex gap-2 mt-3">
              <button onClick={()=>setPending(null)} className="flex-1 py-3 border border-stone-300 rounded-lg font-semibold">Annuller</button>
              <button onClick={confirmPending} className="flex-1 py-3 bg-blue-900 text-white rounded-lg font-semibold">Opret</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit node dialog */}
      {editNode && <NodeEditDialog id={editNode} setId={setEditNode} lNodes={lNodes} renameNode={renameNode} deleteNode={deleteNode} updateNode={updateNode} nodeConnCount={nodeConnCount} cableConnCount={cableConnCount} trayTypes={trayTypes}/>}
      {multiEdit && <MultiEditModal kind={multiEdit.kind} ids={selectedNodes} close={()=>setMultiEdit(null)}
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
          setSelectedNodes([]); setMultiEdit(null);
        }}
      />}

      {/* Edit segment dialog */}
      {editSeg && <SegEditDialog id={editSeg} setId={setEditSeg} lSegs={lSegs} trayTypes={trayTypes} updateSeg={updateSeg} deleteSeg={deleteSeg} addWaypoint={addWaypoint} removeWaypoint={removeWaypoint}/>}

      {/* Calibration in-progress banner */}
      {calibrating && (
        <div className="absolute top-0 left-0 right-0 bg-blue-600 text-white text-xs text-center py-2 px-3 z-20 flex items-center justify-center gap-2">
          <MousePointer2 size={14}/>
          {calibPoints.length === 0 ? 'Tap punkt 1 på tegningen' : 'Tap punkt 2 (kendt afstand fra punkt 1)'}
          <button onClick={()=>{ setCalibrating(false); setCalibPoints([]); setBgStatus(null); }} className="ml-2 underline">Annuller</button>
        </div>
      )}

      {/* Calibration distance dialog */}
      {calibDialog && (
        <div className="absolute inset-0 bg-black/50 z-20 flex items-end lg:items-center justify-center p-4">
          <div className="bg-white p-4 rounded-2xl w-full lg:max-w-sm">
            <h3 className="font-bold mb-2 text-blue-900 flex items-center gap-2"><MousePointer2 size={18}/> Kalibrér målestok</h3>
            <p className="text-xs text-stone-500 mb-3">Hvor lang er afstanden mellem de to punkter i virkeligheden?</p>
            <div className="flex items-center gap-2">
              <input id="calib-input" type="number" step="0.1" autoFocus placeholder="fx 5"
                     className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-lg"
                     onKeyDown={e=>{ if(e.key==='Enter'){ applyCalibration(Number(e.target.value)); } }}/>
              <span className="text-stone-600 font-semibold">meter</span>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={()=>{ setCalibDialog(null); setCalibPoints([]); }} className="flex-1 py-3 border border-stone-300 rounded-lg font-semibold">Annuller</button>
              <button onClick={()=>{ const el=document.getElementById('calib-input'); applyCalibration(Number(el?.value)); }} className="flex-[2] py-3 bg-blue-600 text-white rounded-lg font-semibold">Sæt målestok</button>
            </div>
          </div>
        </div>
      )}

      {/* Pending cable dialog */}
      {pendingCable && (
        <div className="absolute inset-0 bg-black/50 z-10 flex items-end lg:items-center justify-center p-4">
          <div className="bg-white p-4 rounded-2xl w-full lg:max-w-md max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold mb-1 text-blue-900 flex items-center gap-2"><Cable size={18}/> Nyt kabel: {pendingCable.from} → {pendingCable.to}</h3>
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
              <div className="text-xs bg-blue-50 border border-blue-200 rounded p-2 mb-3 text-blue-900">
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
              <button onClick={confirmPendingCable} className="flex-1 py-3 bg-blue-900 text-white rounded-lg font-semibold">Opret kabel</button>
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
              <h3 className="font-bold mb-1 text-blue-900 flex items-center gap-2"><Cable size={18}/> {c.id}: {c.from} → {c.to}</h3>
              <div className="text-xs text-stone-500 mb-3">Rute: {(c.route||[]).join(' → ') || '(ingen)'}</div>
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
                <button onClick={()=>setEditCable(null)} className="flex-[2] py-3 bg-blue-900 text-white rounded-lg font-semibold">Luk</button>
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
    <button onClick={onClick} className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1 ${active?'bg-blue-900 text-white':'bg-white text-stone-700 border border-stone-300'}`}>
      <Icon size={14}/> {label}
    </button>
  );
}

function NodeEditDialog({ id, setId, lNodes, renameNode, deleteNode, updateNode, nodeConnCount, cableConnCount, trayTypes }) {
  const node = lNodes[id];
  const [name, setName] = useState(id);
  const [kind, setKind] = useState(node.kind || 'junction');
  const [nameErr, setNameErr] = useState('');
  const [meta, setMeta] = useState({
    board_type: node.board_type || 'Sub-board',
    In_main: node.In_main || 0,
    function: node.function || 'Socket circuit',
    V: node.V ?? 230, phases: node.phases ?? 1,
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
    if (kind === 'board') { update.board_type = meta.board_type; update.In_main = Number(meta.In_main); }
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
        <h3 className="font-bold mb-3 text-blue-900">Rediger: {id}</h3>

        <div className="flex gap-1 mb-3">
          {[['junction','Knude'],['board','Tavle'],['load','Last']].map(([k,l]) => (
            <button key={k} onClick={()=>setKind(k)} className={`flex-1 py-2 rounded text-sm font-semibold ${kind===k?'bg-blue-900 text-white':'bg-stone-100 text-stone-700'}`}>{l}</button>
          ))}
        </div>

        <FormField label="Navn / ID" value={name} onChange={(v)=>{ setName(v); setNameErr(''); }} hint={nameErr || (kind==='board'?'fx Q1, HT1, UT-IT-A':kind==='load'?'fx X1, Rack-01, CRAH-01':'fx N1, N2')}/>
        {nameErr && <p className="text-xs text-red-600 -mt-2 mb-2">{nameErr}</p>}

        {kind === 'board' && (
          <div className="border border-blue-100 rounded-lg p-2 mb-2 space-y-1 bg-blue-50/40">
            <Selector label="Tavle-type" value={meta.board_type} onChange={v=>setM('board_type', v)} options={['Main board','Sub-board','UPS','Distribution','PDU']}/>
            <FormField label="Hovedbryder In [A]" type="number" value={meta.In_main} onChange={v=>setM('In_main', v)} hint="0 = ikke angivet"/>
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
          <div className="border border-blue-100 rounded-lg p-2 mb-2 space-y-2 bg-blue-50/40">
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Form</label>
              <div className="flex gap-1">
                {[['dot','Punkt'],['tee','T-stykke'],['corner','Hjørne']].map(([k,l]) => (
                  <button key={k} onClick={()=>setM('shape', k)}
                          className={`flex-1 py-2 rounded text-sm font-semibold ${meta.shape===k?'bg-blue-900 text-white':'bg-white border border-stone-300 text-stone-700'}`}>{l}</button>
                ))}
              </div>
            </div>

            {/* Tray size — determines the colour (like segments) */}
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Bakkestørrelse (bestemmer farve)</label>
              <select value={meta.tray_type} onChange={e=>setM('tray_type', e.target.value)}
                      className="w-full border border-stone-300 rounded-lg px-2 py-2 text-sm">
                <option value="">— ingen (standard blå) —</option>
                {trayTypes && Object.keys(trayTypes).map(t => (
                  <option key={t} value={t}>{t} ({trayTypes[t].width_mm} mm)</option>
                ))}
              </select>
              {meta.tray_type && trayTypes[meta.tray_type] && (
                <div className="flex items-center gap-2 mt-1 text-xs text-stone-600">
                  <span>Bredde {trayTypes[meta.tray_type].width_mm} mm →</span>
                  <span className="inline-block w-5 h-5 rounded-full border border-stone-300" style={{ background: trayWidthColor(trayTypes[meta.tray_type].width_mm) }}/>
                  <span>auto-farve</span>
                </div>
              )}
            </div>

            {(meta.shape === 'tee' || meta.shape === 'corner') && (
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
                              className={`py-2 rounded text-xs font-semibold ${meta.rotation===deg ? 'bg-blue-900 text-white' : 'bg-white border border-stone-300 text-stone-700'}`}>
                        {deg}°
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={()=>setM('rotation', (meta.rotation + 90) % 360)}
                        className="w-full mt-1.5 py-1.5 bg-blue-100 text-blue-900 rounded text-xs font-semibold flex items-center justify-center gap-1">
                  <RefreshCw size={12}/> Drej 90°
                </button>
              </div>
            )}
          </div>
        )}

        {/* Size — applies to all node kinds */}
        <label className="block text-xs text-stone-600 mb-2">Størrelse: {meta.size}px
          <input type="range" min="6" max="40" value={meta.size} onChange={e=>setM('size', Number(e.target.value))} className="w-full"/>
        </label>

        {/* Colour picker — applies to all node kinds */}
        <div className="border border-stone-200 rounded-lg p-2 mb-2">
          <label className="block text-xs font-semibold text-stone-600 mb-1">Farve</label>
          <div className="flex items-center gap-2 flex-wrap">
            {['', '#1565C0', '#2e7d32', '#c62828', '#f57c00', '#6a1b9a', '#00838f', '#37474F'].map(c => (
              <button key={c||'def'} onClick={()=>setM('color', c)}
                      title={c || 'Standard'}
                      className={`w-7 h-7 rounded-full border-2 ${meta.color===c ? 'border-blue-900 ring-2 ring-blue-300' : 'border-stone-300'}`}
                      style={{ background: c || 'repeating-linear-gradient(45deg,#fff,#fff 4px,#ddd 4px,#ddd 8px)' }}/>
            ))}
            <input type="color" value={meta.color || '#1565C0'} onChange={e=>setM('color', e.target.value)}
                   className="w-7 h-7 rounded cursor-pointer border border-stone-300" title="Vælg egen farve"/>
          </div>
        </div>

        <p className="text-xs text-stone-500 mb-3">Forbundet til {connCount} føringsvej(e){cabCount>0?` og ${cabCount} kabel/kabler`:''}{(connCount>0||cabCount>0)?' — slettes med':''}.</p>
        <div className="flex gap-2">
          <button onClick={()=>deleteNode(id)} className="flex-1 py-3 bg-red-600 text-white rounded-lg font-semibold flex items-center justify-center gap-1 active:scale-95"><Trash2 size={14}/> Slet</button>
          <button onClick={saveAll} className="flex-[2] py-3 bg-blue-900 text-white rounded-lg font-semibold active:scale-95">Gem</button>
        </div>
      </div>
    </div>
  );
}

function MultiEditModal({ kind, ids, close, applyToAll, deleteAll }) {
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [shape, setShape] = useState('');
  const [rotation, setRotation] = useState('');
  const [func, setFunc] = useState('');
  const label = kind === 'board' ? 'tavler' : kind === 'load' ? 'laster' : 'punkter';
  const palette = ['', '#1565C0', '#2e7d32', '#c62828', '#f9a825', '#6a1b9a', '#00838f', '#37474F'];
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
      <div className="bg-white p-4 rounded-2xl w-full lg:max-w-md max-h-[85vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <h3 className="font-bold mb-1 text-blue-900">Rediger {ids.length} {label}</h3>
        <p className="text-xs text-stone-500 mb-3">Kun udfyldte felter ændres på alle valgte. Tomme felter lades urørt.</p>

        {kind === 'junction' && (
          <div className="mb-2">
            <label className="block text-xs font-semibold text-stone-600 mb-1">Form (valgfri)</label>
            <div className="flex gap-1">
              {[['','—'],['dot','Punkt'],['tee','T-stykke'],['corner','Hjørne']].map(([k,l]) => (
                <button key={k||'none'} onClick={()=>setShape(k)}
                        className={`flex-1 py-2 rounded text-xs font-semibold ${shape===k?'bg-blue-900 text-white':'bg-white border border-stone-300 text-stone-700'}`}>{l}</button>
              ))}
            </div>
          </div>
        )}

        {kind === 'load' && (
          <div className="mb-2">
            <label className="block text-xs font-semibold text-stone-600 mb-1">Funktion (valgfri)</label>
            <select value={func} onChange={e=>setFunc(e.target.value)} className="w-full border border-stone-300 rounded-lg px-2 py-2 text-sm">
              <option value="">— uændret —</option>
              {FUNCTIONS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        )}

        <label className="block text-xs font-semibold text-stone-600 mb-1">Størrelse (valgfri)</label>
        <div className="flex items-center gap-2 mb-3">
          <input type="range" min="6" max="40" value={size || 14} onChange={e=>setSize(e.target.value)} className="flex-1"/>
          <span className="text-sm w-16">{size === '' ? 'uændret' : `${size}px`}</span>
          {size !== '' && <button onClick={()=>setSize('')} className="text-xs text-stone-400 underline">nulstil</button>}
        </div>

        {kind === 'junction' && (
          <div className="mb-3">
            <label className="block text-xs font-semibold text-stone-600 mb-1">Rotation (valgfri)</label>
            <div className="grid grid-cols-5 gap-1">
              <button onClick={()=>setRotation('')} className={`py-2 rounded text-xs font-semibold ${rotation===''?'bg-blue-900 text-white':'bg-white border border-stone-300'}`}>—</button>
              {[0,90,180,270].map(d => (
                <button key={d} onClick={()=>setRotation(String(d))} className={`py-2 rounded text-xs font-semibold ${rotation===String(d)?'bg-blue-900 text-white':'bg-white border border-stone-300'}`}>{d}°</button>
              ))}
            </div>
          </div>
        )}

        <label className="block text-xs font-semibold text-stone-600 mb-1">Farve (valgfri)</label>
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {palette.map(c => (
            <button key={c||'def'} onClick={()=>setColor(c)} title={c || 'Standard'}
                    className={`w-7 h-7 rounded-full border-2 ${color===c ? 'border-blue-900 ring-2 ring-blue-300' : 'border-stone-300'}`}
                    style={{ background: c || 'repeating-linear-gradient(45deg,#fff,#fff 4px,#ddd 4px,#ddd 8px)' }}/>
          ))}
          <input type="color" value={color || '#1565C0'} onChange={e=>setColor(e.target.value)}
                 className="w-7 h-7 rounded cursor-pointer border border-stone-300" title="Vælg egen farve"/>
        </div>

        <div className="flex gap-2">
          <button onClick={deleteAll} className="flex-1 py-3 bg-red-600 text-white rounded-lg font-semibold flex items-center justify-center gap-1"><Trash2 size={14}/> Slet alle</button>
          <button onClick={close} className="flex-1 py-3 border border-stone-300 rounded-lg font-semibold">Annuller</button>
          <button onClick={apply} className="flex-[2] py-3 bg-blue-900 text-white rounded-lg font-semibold">Anvend på alle</button>
        </div>
      </div>
    </div>
  );
}

function SegEditDialog({ id, setId, lSegs, trayTypes, updateSeg, deleteSeg, addWaypoint, removeWaypoint }) {
  const s = lSegs[id];
  const [length_m, setL] = useState(s.length_m);
  const [tray_type, setTT] = useState(s.tray_type);
  const [color, setColor] = useState(s.color || '');
  const [lineStyle, setLineStyle] = useState(s.lineStyle || 'solid');
  const nWps = (s.waypoints || []).length;
  return (
    <div className="absolute inset-0 bg-black/50 z-10 flex items-end lg:items-center justify-center p-4" onClick={()=>setId(null)}>
      <div className="bg-white p-4 rounded-2xl w-full lg:max-w-md max-h-[85vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <h3 className="font-bold mb-3 text-blue-900">Segment {id}</h3>
        <p className="text-xs text-stone-500 mb-3">{s.from} → {s.to}</p>
        <FormField label="Længde [m]" type="number" step="0.5" value={length_m} onChange={setL}/>
        <Selector label="Tray type (bredde bestemmer farve & tykkelse)" value={tray_type} onChange={setTT} options={Object.keys(trayTypes)}/>

        {/* Auto preview from tray width */}
        {(() => {
          const w = trayTypes[tray_type]?.width_mm;
          const c = trayWidthColor(w);
          const t = trayWidthStroke(w);
          return (
            <div className="flex items-center gap-2 mt-1 mb-1 text-xs text-stone-600">
              <span>Bredde {w} mm →</span>
              <svg width="60" height="16"><line x1="4" y1="8" x2="56" y2="8" stroke={color || c} strokeWidth={t} strokeLinecap="round"/></svg>
              <span>{color ? 'egen farve' : 'auto-farve'}</span>
            </div>
          );
        })()}

        {/* Line style */}
        <div className="mt-2">
          <label className="block text-xs font-semibold text-stone-600 mb-1">Linjestil</label>
          <div className="flex gap-1">
            {[['solid','Fuld'],['dashed','Stiplet'],['dotted','Prikket']].map(([k,l]) => (
              <button key={k} onClick={()=>setLineStyle(k)}
                      className={`flex-1 py-2 rounded text-sm font-semibold ${lineStyle===k?'bg-blue-900 text-white':'bg-white border border-stone-300 text-stone-700'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Colour — optional override of the width-based auto colour */}
        <div className="mt-2">
          <label className="block text-xs font-semibold text-stone-600 mb-1">Farve <span className="font-normal text-stone-400">(valgfri — overstyrer auto-farve)</span></label>
          <div className="flex items-center gap-2 flex-wrap">
            {['', '#1565C0', '#2e7d32', '#c62828', '#f9a825', '#6a1b9a', '#00838f', '#37474F'].map(c => (
              <button key={c||'def'} onClick={()=>setColor(c)} title={c || 'Auto (fra bredde)'}
                      className={`w-7 h-7 rounded-full border-2 ${color===c ? 'border-blue-900 ring-2 ring-blue-300' : 'border-stone-300'}`}
                      style={{ background: c || 'repeating-linear-gradient(45deg,#fff,#fff 4px,#ddd 4px,#ddd 8px)' }}/>
            ))}
            <input type="color" value={color || '#1f6feb'} onChange={e=>setColor(e.target.value)}
                   className="w-7 h-7 rounded cursor-pointer border border-stone-300" title="Vælg egen farve"/>
          </div>
        </div>

        {/* Bend (knæk) controls */}
        <div className="border border-amber-100 rounded-lg p-2 mt-2 bg-amber-50/40">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-amber-900">Knæk på føringsvejen</span>
            <span className="text-xs text-stone-500">{nWps} knæk</span>
          </div>
          <div className="flex gap-2">
            <button onClick={()=>{ addWaypoint(id); setId(null); }}
                    className="flex-1 text-xs py-2 bg-amber-500 text-white rounded-lg font-semibold flex items-center justify-center gap-1">
              <Plus size={13}/> Tilføj knæk
            </button>
            {nWps > 0 && (
              <button onClick={()=>removeWaypoint(id)}
                      className="flex-1 text-xs py-2 bg-white border border-amber-300 text-amber-700 rounded-lg font-semibold">
                Fjern sidste knæk
              </button>
            )}
          </div>
          <p className="text-[11px] text-stone-400 mt-1">Efter tilføjelse: træk det hvide punkt på føringsvejen for at placere knækket.</p>
        </div>

        <div className="flex gap-2 mt-3">
          <button onClick={()=>setId(null)} className="flex-1 py-3 border rounded-lg font-semibold">Annuller</button>
          <button onClick={()=>deleteSeg(id)} className="flex-1 py-3 bg-red-600 text-white rounded-lg font-semibold flex items-center justify-center gap-1"><Trash2 size={14}/> Slet</button>
          <button onClick={()=>updateSeg(id, { length_m: Number(length_m), tray_type, color: color || undefined, lineStyle })} className="flex-1 py-3 bg-blue-900 text-white rounded-lg font-semibold">Gem</button>
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
          <h2 className="font-bold text-blue-900">{editing.isNew ? 'Add' : 'Edit'} {editing.kind.replace('_',' ')}</h2>
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
          <button onClick={save} className="flex-1 py-3 bg-blue-900 text-white rounded-lg font-semibold">Gem</button>
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
