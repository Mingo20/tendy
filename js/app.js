// Tendy — agente personal y constructor de aplicaciones por conversación.
(() => {
"use strict";

const API = window.TENDY_API_BASE ?? "";
const STUDIO_API = window.TENDY_STUDIO_API_BASE ?? "https://superagent-573efe2c.base44.app/functions/tendyStudioApi";
const app = document.getElementById("app");
const toastEl = document.getElementById("toast");
let uidCounter = 0;
let config = { display_name: "Domingo", tone: "cercano", instructions: "" };
let messages = [];
let waiting = false;
let pollTimer = null;
let toastTimer = null;
let turnController = null;
let turnProgress = 0;
let turnPhase = "";
let attachments = [];
let dbPromise = null;
const DB_NAME = "tendy-local-v1";

const clientId = (() => {
  let id = localStorage.getItem("tendy_client");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("tendy_client", id); }
  return id;
})();

// ── utilidades ────────────────────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtTime = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" }); };
const fmtDay = (iso) => {
  const d = new Date(iso), now = new Date(), yst = new Date(Date.now() - 864e5);
  if (d.toDateString() === now.toDateString()) return "Hoy";
  if (d.toDateString() === yst.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-DO", { day: "numeric", month: "long" });
};
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
}
async function postJson(url, action, extra) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, client_id: clientId, ...extra }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ("Error " + res.status));
  return data;
}
const api = (action, extra = {}) => postJson(API, action, extra);
const studioApi = (action, extra = {}) => postJson(STUDIO_API, action, extra);


function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) return resolve(null);
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { const db=r.result; if(!db.objectStoreNames.contains("records")) db.createObjectStore("records", {keyPath:"key"}); };
    r.onsuccess=()=>resolve(r.result); r.onerror=()=>resolve(null);
  }); return dbPromise;
}
async function idbPut(value) { const db=await openDB(); if(!db) return; return new Promise(res=>{const tx=db.transaction("records","readwrite");tx.objectStore("records").put(value);tx.oncomplete=()=>res();tx.onerror=()=>res();}); }
async function idbAll() { const db=await openDB(); if(!db) return []; return new Promise(res=>{const tx=db.transaction("records");const r=tx.objectStore("records").getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>res([]);}); }
async function idbDelete(key) { const db=await openDB(); if(!db) return; return new Promise(res=>{const tx=db.transaction("records","readwrite");tx.objectStore("records").delete(key);tx.oncomplete=()=>res();tx.onerror=()=>res();}); }
async function flushOutbox() { if(!navigator.onLine) return; const rows=await idbAll(); for(const row of rows.filter(x=>x.type==="outbox")){ try{await api("send", {content:row.content,attachments:row.attachments||[]}); await idbDelete(row.key);}catch{break;} } }
async function idbGet(key) { const db=await openDB(); if(!db) return null; return new Promise(res=>{const tx=db.transaction("records");const r=tx.objectStore("records").get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>res(null);}); }
async function cacheConversation() { await idbPut({key:`history-${clientId}`,type:"history",messages}); await idbPut({key:"sync-state",type:"meta",online:navigator.onLine,at:new Date().toISOString()}); }
async function loadCachedConversation() { const c=await idbGet(`history-${clientId}`); if(c?.messages?.length && !messages.length){messages=c.messages.map(m=>({...m,offline:true}));renderMessages();} }

// ── iconos minimalistas (trazo, sin emojis) ───────────
const ICONS = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  pen: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="m13.5 6.5 3 3"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  download: '<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  github: '<path d="M9 19c-4 1.5-4-2-6-2m12 4v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  store: '<path d="M4 9 5.5 4h13L20 9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9"/><path d="M5 12v8h14v-8"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.5A6 6 0 0 1 21 20"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5V21.5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  chat: '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
  paperclip: '<path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 6"/>',
  pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 4.2 1.8c-1 .8-1.8 1.2-1.8 2.7M12 17h.01"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 3 3 2-2 6 5"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
};
const icon = (n, extra = "") => `<svg class="i ${extra}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ICONS.spark}</svg>`;

// ── avatar (único elemento de color junto a los botones) ──
function avatarSVG(size, cls = "") {
  const g = "tg" + (++uidCounter);
  return `<span class="avatar ${cls}" data-avatar>
<svg class="avatar-svg" viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">
<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#60A5FA"/><stop offset="1" stop-color="#1D4ED8"/></linearGradient></defs>
<circle class="av-ring" cx="60" cy="60" r="56" fill="none" stroke="url(#${g})" stroke-width="2.5"/>
<line x1="60" y1="19" x2="60" y2="8" stroke="url(#${g})" stroke-width="4.5" stroke-linecap="round"/>
<circle class="av-ant" cx="60" cy="7" r="5" fill="#2563EB"/>
<path class="av-head" d="M60 21c25 0 41 17 41 43s-16 43-41 43S19 90 19 64s16-43 41-43Z" fill="url(#${g})"/>
<ellipse class="av-eye" cx="45" cy="60" rx="6.5" ry="9.5" fill="#fff"/>
<ellipse class="av-eye" cx="75" cy="60" rx="6.5" ry="9.5" fill="#fff"/>
<path class="av-smile" d="M48 80q12 9 24 0" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>
<rect class="av-wave" x="50" y="77.5" width="20" height="7" rx="3.5" fill="#fff"/>
</svg></span>`;
}
const REACTIONS = ["¡Hola! ¿En qué te ayudo?", "¡Aquí estoy, al pendiente!", "¿Qué plan tenemos hoy?", "¡Pregúntame lo que sea!", "Listo para lo que necesites."];
function wireAvatar(root) {
  const av = $("[data-avatar]", root || document);
  if (!av) return;
  av.addEventListener("click", () => {
    av.classList.remove("avatar-bounce"); void av.offsetWidth; av.classList.add("avatar-bounce");
    toast(REACTIONS[Math.floor(Math.random() * REACTIONS.length)]);
  });
}
function setStatus(state) {
  const av = $("[data-avatar]"), st = $("#status");
  if (av) { av.classList.toggle("is-thinking", state === "thinking"); av.classList.toggle("is-speaking", state === "speaking"); }
  if (st) {
    st.classList.toggle("thinking", state !== "idle");
    st.lastElementChild.textContent = state === "thinking" ? "pensando…" : state === "speaking" ? "escribiendo…" : "en línea";
  }
}

// ══════════════════════════════════════════════════════
//  RESPUESTAS ENRIQUECIDAS (esquema validado y seguro)
//  El agente envía "TENDY_UI:" + JSON. Solo se dibujan componentes
//  autorizados; todo texto se escapa; los enlaces solo salen como botón.
// ══════════════════════════════════════════════════════
const MARK = "TENDY_UI:";
const MAX_BLOCKS = 12;
const safeUrl = (u) => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
const str = (v, n = 600) => (typeof v === "string" || typeof v === "number") ? String(v).slice(0, n) : "";
const arr = (v, n = 30) => Array.isArray(v) ? v.slice(0, n) : [];

// Convierte texto plano a bloques: los enlaces sueltos pasan a botones.
function plainToBlocks(text) {
  const blocks = [], links = [];
  const body = String(text).replace(/(https?:\/\/[^\s<>()]+[^\s<>().,;:!?])/g, (u) => { links.push(u); return ""; })
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  if (body) blocks.push({ type: "text", text: body });
  if (links.length) blocks.push({ type: "links", items: [...new Set(links)].map((u) => ({ label: labelForUrl(u), url: u })) });
  return blocks;
}
function labelForUrl(u) {
  try {
    const h = new URL(u).hostname.replace(/^www\./, "");
    if (/github\.com$/.test(h)) return "Abrir repositorio";
    if (/github\.io$/.test(h)) return "Abrir aplicación";
    if (/base44\.app$/.test(h)) return "Abrir aplicación";
    if (/docs\.google|drive\.google/.test(h)) return "Abrir documento";
    return "Abrir enlace · " + h;
  } catch { return "Abrir enlace"; }
}
function parseContent(raw) {
  const s = String(raw ?? "");
  const i = s.indexOf(MARK);
  if (i === -1) return plainToBlocks(s);
  const lead = s.slice(0, i).trim();
  let json = s.slice(i + MARK.length).trim();
  try {
    const data = JSON.parse(json);
    const blocks = arr(data.blocks, MAX_BLOCKS);
    const out = [];
    if (lead) out.push(...plainToBlocks(lead));
    for (const b of blocks) { const v = validateBlock(b); if (v) out.push(v); }
    return out.length ? out : plainToBlocks(s);
  } catch { return plainToBlocks(s.replace(MARK, "")); }
}
function validateBlock(b) {
  if (!b || typeof b !== "object") return null;
  switch (b.type) {
    case "text": { const t = str(b.text, 4000); return t ? { type: "text", text: t } : null; }
    case "heading": { const t = str(b.text, 140); return t ? { type: "heading", text: t, sub: str(b.sub, 200) } : null; }
    case "options": {
      const items = arr(b.items, 12).map((o, i) => ({ id: str(o?.id ?? i, 40) || String(i), label: str(o?.label, 120), desc: str(o?.desc, 200) })).filter((o) => o.label);
      if (!items.length) return null;
      return { type: "options", id: str(b.id, 40) || "q" + Math.random().toString(36).slice(2, 7), title: str(b.title, 200), multi: !!b.multi, submit: str(b.submit, 40) || "Enviar", items };
    }
    case "checklist": {
      const items = arr(b.items, 30).map((o) => ({ label: str(o?.label ?? o, 200), done: !!o?.done })).filter((o) => o.label);
      return items.length ? { type: "checklist", title: str(b.title, 200), items } : null;
    }
    case "progress": {
      const value = Math.max(0, Math.min(100, Number(b.value) || 0));
      return { type: "progress", title: str(b.title, 160), value, label: str(b.label, 120) };
    }
    case "chart": {
      const data = arr(b.data, 14).map((d) => ({ label: str(d?.label, 60), value: Number(d?.value) })).filter((d) => d.label && isFinite(d.value));
      return data.length ? { type: "chart", title: str(b.title, 160), unit: str(b.unit, 30), data } : null;
    }
    case "table": {
      const cols = arr(b.columns, 8).map((c) => str(c, 60));
      const rows = arr(b.rows, 40).map((r) => arr(r, 8).map((c) => str(c, 160)));
      return cols.length && rows.length ? { type: "table", title: str(b.title, 160), columns: cols, rows } : null;
    }
    case "links": {
      const items = arr(b.items, 8).map((l) => ({ label: str(l?.label, 60) || "Abrir enlace", url: safeUrl(l?.url), kind: l?.kind === "secondary" ? "secondary" : "primary", icon: ["github", "external", "folder", "code", "download"].includes(l?.icon) ? l.icon : "external" })).filter((l) => l.url);
      return items.length ? { type: "links", items } : null;
    }
    case "app_card": {
      const links = arr(b.links, 4).map((l) => ({ label: str(l?.label, 50) || "Abrir", url: safeUrl(l?.url), kind: l?.kind === "secondary" ? "secondary" : "primary", icon: ["github", "external", "folder", "code"].includes(l?.icon) ? l.icon : "external" })).filter((l) => l.url);
      return { type: "app_card", name: str(b.name, 80) || "Aplicación", description: str(b.description, 300), status: ["ok", "warn", "err", "info"].includes(b.status) ? b.status : "info", status_label: str(b.status_label, 40), version: str(b.version, 20), features: arr(b.features, 8).map((f) => str(f, 120)).filter(Boolean), tests: str(b.tests, 240), links };
    }
    case "form": {
      const fields = arr(b.fields, 6).map((f, i) => ({ id: str(f?.id ?? "f" + i, 30), label: str(f?.label, 100), placeholder: str(f?.placeholder, 120), long: !!f?.long })).filter((f) => f.label);
      return fields.length ? { type: "form", id: str(b.id, 40) || "form", title: str(b.title, 160), submit: str(b.submit, 40) || "Enviar", fields } : null;
    }
    case "steps": {
      const step = Math.max(1, Math.min(8, Number(b.step) || 1)), total = Math.max(step, Math.min(8, Number(b.total) || step));
      return { type: "steps", step, total };
    }
    case "actions": {
      const items = arr(b.items, 6).map((a) => ({ label: str(a?.label, 60), send: str(a?.send, 500), kind: a?.kind === "secondary" ? "secondary" : "primary" })).filter((a) => a.label && a.send);
      return items.length ? { type: "actions", items } : null;
    }
    default: return null;
  }
}

function renderBlock(b, interactive, key) {
  switch (b.type) {
    case "text": return `<div class="txt">${esc(b.text)}</div>`;
    case "heading": return `<div><h4>${esc(b.text)}</h4>${b.sub ? `<div class="sub">${esc(b.sub)}</div>` : ""}</div>`;
    case "steps": return `<div class="onb-bar" aria-label="Paso ${b.step} de ${b.total}">${Array.from({ length: b.total }, (_, i) => `<i class="${i < b.step ? "on" : ""}"></i>`).join("")}</div>`;
    case "options": return `<div class="blk" data-opts="${esc(b.id)}" data-multi="${b.multi ? 1 : 0}" data-key="${esc(key)}">
      ${b.title ? `<div class="blk-title">${esc(b.title)}${b.multi ? "<small>Puedes elegir varias opciones</small>" : ""}</div>` : ""}
      <div class="opts">${b.items.map((o) => `<button class="opt ${b.multi ? "multi" : ""}" data-oid="${esc(o.id)}" data-label="${esc(o.label)}" ${interactive ? "" : "disabled"}><span class="mark">${icon("check")}</span><span class="ot">${esc(o.label)}${o.desc ? `<small>${esc(o.desc)}</small>` : ""}</span></button>`).join("")}</div>
      ${interactive ? `<button class="btn-primary send-sel" data-send-opts disabled>${icon("send")}<span>${esc(b.submit)}</span></button>` : ""}
    </div>`;
    case "checklist": return `<div class="blk">${b.title ? `<div class="blk-title">${esc(b.title)}</div>` : ""}<div class="checklist">${b.items.map((it) => `<button class="chk ${it.done ? "on" : ""}" data-chk><span class="box">${icon("check")}</span><span class="lbl">${esc(it.label)}</span></button>`).join("")}</div></div>`;
    case "progress": return `<div class="blk">${b.title ? `<div class="blk-title">${esc(b.title)}</div>` : ""}<div class="pg-row"><span>${esc(b.label)}</span><span>${b.value}%</span></div><div class="progress" role="progressbar" aria-valuenow="${b.value}" aria-valuemin="0" aria-valuemax="100"><i style="width:${b.value}%"></i></div></div>`;
    case "chart": { const max = Math.max(...b.data.map((d) => Math.abs(d.value)), 1);
      return `<div class="blk">${b.title ? `<div class="blk-title">${esc(b.title)}${b.unit ? `<small>Unidad: ${esc(b.unit)}</small>` : ""}</div>` : ""}<div class="chart" role="img" aria-label="${esc(b.title)}">${b.data.map((d) => `<div class="chart-row"><span class="lb" title="${esc(d.label)}">${esc(d.label)}</span><span class="bar"><i style="width:${Math.max(2, Math.abs(d.value) / max * 100)}%"></i></span><span class="vl">${esc(d.value.toLocaleString("es-DO"))}${b.unit && b.unit.length <= 3 ? " " + esc(b.unit) : ""}</span></div>`).join("")}</div></div>`; }
    case "table": return `<div>${b.title ? `<div class="blk-title">${esc(b.title)}</div>` : ""}<div class="tbl-wrap"><table class="tbl"><thead><tr>${b.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${b.columns.map((_, i) => `<td>${esc(r[i] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
    case "links": return `<div class="actions">${b.items.map(linkBtn).join("")}</div>`;
    case "app_card": return `<div class="card-app"><div class="hd"><span class="ic">${icon("layers")}</span><div style="flex:1;min-width:0"><h4>${esc(b.name)}</h4><div class="meta">${b.version ? "Versión " + esc(b.version) : ""}</div></div>${b.status_label ? `<span class="badge ${b.status === "info" ? "" : esc(b.status)}">${esc(b.status_label)}</span>` : ""}</div>
      ${b.description ? `<div class="txt" style="font-size:14px">${esc(b.description)}</div>` : ""}
      ${b.features.length ? `<ul class="feat">${b.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
      ${b.tests ? `<div class="meta">Pruebas: ${esc(b.tests)}</div>` : ""}
      ${b.links.length ? `<div class="actions">${b.links.map(linkBtn).join("")}</div>` : ""}</div>`;
    case "form": return `<div class="blk" data-form="${esc(b.id)}">${b.title ? `<div class="blk-title">${esc(b.title)}</div>` : ""}<div class="form-short">${b.fields.map((f) => `<div><label>${esc(f.label)}</label>${f.long ? `<textarea rows="3" data-fid="${esc(f.id)}" data-flabel="${esc(f.label)}" placeholder="${esc(f.placeholder)}"></textarea>` : `<input type="text" data-fid="${esc(f.id)}" data-flabel="${esc(f.label)}" placeholder="${esc(f.placeholder)}">`}</div>`).join("")}${interactive ? `<button class="btn-primary send-sel" style="margin-top:2px" data-send-form>${icon("send")}<span>${esc(b.submit)}</span></button>` : ""}</div></div>`;
    case "actions": return `<div class="actions">${b.items.map((a) => `<button class="link-btn ${a.kind === "secondary" ? "secondary" : ""}" data-act="${esc(a.send)}" ${interactive ? "" : "disabled"}>${esc(a.label)}</button>`).join("")}</div>`;
    default: return "";
  }
}
function linkBtn(l) { return `<a class="link-btn ${l.kind === "secondary" ? "secondary" : ""}" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${icon(l.icon || "external")}<span>${esc(l.label)}</span></a>`; }

function renderRich(content, interactive, key) {
  return `<div class="rich">${parseContent(content).map((b) => renderBlock(b, interactive, key)).join("")}</div>`;
}

// ── vistas ────────────────────────────────────────────
function renderWelcome() {
  app.innerHTML = `
<div class="login-wrap">
  <div class="login-card">
    ${avatarSVG(120)}
    <div class="brand-name">Tendy</div>
    <p class="login-tag">Tu agente personal. Navega, busca, redacta y crea aplicaciones conversando, desde cualquier dispositivo.</p>
    <button class="login-btn" id="enter-btn">Acceder</button>
    <div class="login-hint">Acceso directo</div>
  </div>
</div>`;
  wireAvatar();
  $("#enter-btn").addEventListener("click", () => renderChat());
}

function renderChat() {
  app.innerHTML = `
<div class="chat">
  <header class="chat-head">
    ${avatarSVG(42)}
    <div class="chat-title">
      <h1>Tendy <span class="grad">AI</span></h1>
      <div class="status" id="status"><span class="dot"></span><span>en línea</span></div>
    </div>
    <button class="menu-btn" id="menu-btn" title="Menú" aria-label="Abrir menú">${icon("menu")}</button>
  </header>
  <div class="activity-card" id="activity" hidden><div class="activity-top"><span class="activity-dot"></span><strong id="activity-label">Preparando</strong><span id="activity-percent">0%</span></div><div class="progress-track"><span id="progress-fill"></span></div><small id="activity-note">Estimación por fases del turno</small></div>
  <div id="install-slot"></div>
  <main class="msgs" id="msgs"></main>
  <div class="chips" id="chips"></div>
  <footer class="composer">
    <div class="composer-box">
      <button class="attach-btn" id="attach-btn" title="Adjuntar imagen o archivo" aria-label="Adjuntar">${icon("plus")}</button><input id="file-input" type="file" accept="image/*,.pdf,.txt,.csv,.json,.md,.doc,.docx" multiple hidden>
      <textarea id="input" rows="1" placeholder="Escríbele algo a Tendy…" aria-label="Mensaje"></textarea>
      <button class="send-btn" id="send" title="Enviar" aria-label="Enviar">${icon("send")}</button>
    </div>
  </footer>
</div>`;
  wireAvatar();
  $("#menu-btn").addEventListener("click", openNavigation);
  $("#attach-btn").addEventListener("click", () => $("#file-input").click());
  $("#file-input").addEventListener("change", (e) => prepareAttachments([...e.target.files]));
  const input = $("#input");
  input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input.value); } });
  $("#send").addEventListener("click", () => waiting ? cancelTurn() : sendMessage(input.value));
  $("#msgs").addEventListener("click", onMsgClick);
  renderChips();
  loadHistory();
  setupInstallCard();
}

// ── tarjeta de instalación PWA ────────────────────────
function isStandalone() { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; }
function setupInstallCard() {
  if (isStandalone() || sessionStorage.getItem("tendy_install_dismissed")) return;
  const slot = $("#install-slot");
  if (!slot) return;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const show = () => {
    if (slot.firstChild) return;
    const canPrompt = !!window.__tendyInstall;
    slot.innerHTML = `<div class="install-card" id="install-card">
      <span class="ic">${icon("download")}</span>
      <div class="tx"><strong>Instala Tendy en tu dispositivo</strong><span>${canPrompt ? "Ábrela como una app, sin navegador." : isIOS ? "Pulsa Compartir y luego «Añadir a pantalla de inicio»." : "Usa el menú del navegador y elige «Instalar aplicación»."}</span></div>
      ${canPrompt ? `<button class="btn-primary" id="install-go">Instalar</button>` : ""}
      <button class="x" id="install-x" aria-label="Cerrar">${icon("close")}</button></div>`;
    const card = $("#install-card");
    const hide = () => { card.classList.add("out"); setTimeout(() => card.remove(), 300); sessionStorage.setItem("tendy_install_dismissed", "1"); };
    $("#install-x").onclick = hide;
    const go = $("#install-go");
    if (go) go.onclick = async () => { const ev = window.__tendyInstall; if (!ev) return; ev.prompt(); try { await ev.userChoice; } catch {} window.__tendyInstall = null; hide(); };
  };
  if (window.__tendyInstall || isIOS) show();
  window.addEventListener("tendy-installable", show, { once: true });
  setTimeout(() => { if (!slot.firstChild && !isStandalone()) show(); }, 2500);
  window.addEventListener("appinstalled", () => { const c = $("#install-card"); if (c) c.remove(); });
}

// ── modal animado reutilizable ────────────────────────
function openModal(innerHtml, label) {
  const o = document.createElement("div");
  o.className = "overlay";
  o.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}"><div class="sheet-grab"></div>${innerHtml}</div>`;
  document.body.appendChild(o);
  requestAnimationFrame(() => requestAnimationFrame(() => o.classList.add("open")));
  let closing = false;
  const close = () => {
    if (closing) return; closing = true;
    o.classList.remove("open");
    const sheet = $(".sheet", o);
    const done = () => o.remove();
    sheet.addEventListener("transitionend", done, { once: true });
    setTimeout(done, 520);
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  o.addEventListener("click", (e) => { if (e.target === o || e.target.closest("[data-close]")) close(); });
  return { o, close };
}

// ── proyectos ─────────────────────────────────────────
const STATUS_LABELS = { draft: "Borrador", planning: "Planificando", developing: "Construyendo", testing: "Probando", awaiting_approval: "Esperando decisión", publishing: "Publicando", completed: "Publicado", failed: "Con error" };
async function openProjects() {
  const { o, close } = openModal(`
    <div class="sheet-head"><div><span class="eyebrow">ESPACIO DE TRABAJO</span><h3>Mis proyectos</h3></div>
    <button class="icon-btn" data-close aria-label="Cerrar">${icon("close")}</button></div>
    <div class="proj-list" id="proj-list"><div class="drawer-empty">Cargando proyectos…</div></div>
    <button class="btn-primary send-sel" id="new-project">${icon("plus")}<span>Crear una aplicación</span></button>`, "Mis proyectos");
  $("#new-project", o).onclick = () => { close(); startOnboarding(); };
  try {
    const d = await studioApi("listProjects");
    const list = $("#proj-list", o);
    if (!d.projects.length) list.innerHTML = `<div class="drawer-empty">Aún no hay proyectos.<small>Cuéntale a Tendy qué aplicación necesitas y la convertirá en un plan real.</small></div>`;
    else {
      list.innerHTML = d.projects.map((p) => `<button class="proj-item" data-project="${esc(p.id)}"><span class="ic">${icon("layers")}</span><span class="mn"><strong>${esc(p.name)}</strong><small>${esc(STATUS_LABELS[p.status] || p.status)} · v${p.version || 0}</small></span></button>`).join("");
      list.querySelectorAll("[data-project]").forEach((btn) => btn.onclick = async () => {
        try { const p = await studioApi("getProject", { project_id: btn.dataset.project }); close(); showProjectContext(p); } catch (e) { toast("No pude abrir el proyecto"); }
      });
    }
  } catch { $("#proj-list", o).innerHTML = `<div class="drawer-empty">No pude cargar tus proyectos.</div>`; }
}
function showProjectContext(d) {
  const p = d.project, done = (d.tasks || []).filter((t) => t.status === "completed").length, total = (d.tasks || []).length;
  sendMessage(`Muéstrame el estado del proyecto «${p.name}» (${STATUS_LABELS[p.status] || p.status}, ${done}/${total} tareas${p.production_url ? ", publicado" : ", aún sin publicar"}).`);
}

// ── onboarding local de un proyecto (opciones con un clic) ──
const ONB = [
  { id: "type", title: "¿Qué tipo de aplicación quieres crear?", multi: false, items: [
    { id: "tienda", label: "Tienda en línea", desc: "Catálogo, carrito y pedidos" },
    { id: "gestion", label: "Gestión de negocio", desc: "Inventario, ventas y reportes" },
    { id: "clientes", label: "Administración de clientes", desc: "Fichas, seguimiento y citas" },
    { id: "educativa", label: "Plataforma educativa", desc: "Cursos, tareas y progreso" },
    { id: "otra", label: "Otra idea", desc: "Cuéntamela con tus palabras" } ] },
  { id: "users", title: "¿Quién la va a usar?", multi: false, items: [
    { id: "yo", label: "Solo yo" }, { id: "equipo", label: "Mi equipo", desc: "Varias personas con acceso" }, { id: "publico", label: "El público", desc: "Cualquiera con el enlace" } ] },
  { id: "feat", title: "¿Qué funciones necesitas?", multi: true, items: [
    { id: "login", label: "Cuentas e inicio de sesión" }, { id: "pagos", label: "Pagos o cobros" }, { id: "reportes", label: "Reportes y gráficos" }, { id: "avisos", label: "Avisos y notificaciones" }, { id: "archivos", label: "Subir archivos o fotos" } ] },
  { id: "style", title: "¿Qué estilo visual prefieres?", multi: false, items: [
    { id: "claro", label: "Claro y minimalista" }, { id: "oscuro", label: "Oscuro y moderno" }, { id: "color", label: "Colorido y alegre" } ] },
];
let onbAnswers = [];
function startOnboarding() {
  onbAnswers = [];
  pushLocalTendy(onbBlocks(0));
}
function onbBlocks(i) {
  const q = ONB[i];
  return "TENDY_UI:" + JSON.stringify({ blocks: [
    ...(i === 0 ? [{ type: "text", text: "¡Vamos a crear tu aplicación! Responde con un toque y yo me encargo del resto." }] : []),
    { type: "steps", step: i + 1, total: ONB.length },
    { type: "options", id: "onb_" + q.id, title: q.title, multi: q.multi, submit: i === ONB.length - 1 ? "Crear mi plan" : "Continuar", items: q.items } ] });
}
function pushLocalTendy(content) {
  messages.push({ id: "local-" + Date.now() + Math.random(), role: "tendy", content, created_date: new Date().toISOString(), local: true, onb: true });
  renderMessages();
  const box = $("#msgs"); if (box) requestAnimationFrame(() => box.scrollTo({ top: box.scrollHeight, behavior: "smooth" }));
}

// ── sugerencias (iconos minimalistas) ─────────────────
const SUGGESTIONS = [
  { icon: "compass", label: "¿Qué puedes hacer por mí?" },
  { icon: "layers", label: "Quiero crear una aplicación", onboarding: true },
  { icon: "search", label: "Busca noticias de RD de hoy" },
  { icon: "mail", label: "Resume mis correos" },
  { icon: "pen", label: "Ayúdame a redactar algo" },
  { icon: "calendar", label: "¿Qué tengo en el calendario?" },
];
function renderChips() {
  const box = $("#chips");
  if (!box) return;
  box.innerHTML = SUGGESTIONS.map((s, i) => `<button class="chip" data-i="${i}">${icon(s.icon)}<span>${esc(s.label)}</span></button>`).join("");
  box.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    const s = SUGGESTIONS[+btn.dataset.i];
    if (s.onboarding) { startOnboarding(); return; }
    const input = $("#input");
    input.value = s.label; input.focus(); input.dispatchEvent(new Event("input"));
  });
}

// ── interacción con bloques ───────────────────────────
function onMsgClick(e) {
  const opt = e.target.closest(".opt");
  if (opt && !opt.disabled) {
    const blk = opt.closest("[data-opts]");
    const multi = blk.dataset.multi === "1";
    if (!multi) blk.querySelectorAll(".opt").forEach((x) => x.classList.toggle("sel", x === opt));
    else opt.classList.toggle("sel");
    const any = blk.querySelector(".opt.sel");
    const go = blk.querySelector("[data-send-opts]");
    if (go) go.disabled = !any;
    return;
  }
  const go = e.target.closest("[data-send-opts]");
  if (go) {
    const blk = go.closest("[data-opts]");
    const chosen = [...blk.querySelectorAll(".opt.sel")].map((x) => x.dataset.label);
    if (!chosen.length) return;
    const title = blk.querySelector(".blk-title")?.childNodes[0]?.textContent?.trim() || "Mi elección";
    const msgEl = blk.closest(".msg");
    const mid = msgEl?.dataset.mid;
    const m = messages.find((x) => String(x.id) === mid);
    if (m && m.onb) { handleOnboardingAnswer(blk.dataset.opts, title, chosen); return; }
    sendMessage(`${title}: ${chosen.join(", ")}`);
    return;
  }
  const chk = e.target.closest("[data-chk]");
  if (chk) { chk.classList.toggle("on"); return; }
  const act = e.target.closest("[data-act]");
  if (act && !act.disabled) { sendMessage(act.dataset.act); return; }
  const sf = e.target.closest("[data-send-form]");
  if (sf) {
    const form = sf.closest("[data-form]");
    const parts = [...form.querySelectorAll("[data-fid]")].map((f) => f.value.trim() ? `${f.dataset.flabel}: ${f.value.trim()}` : "").filter(Boolean);
    if (!parts.length) { toast("Completa al menos un campo"); return; }
    sendMessage(parts.join("\n"));
  }
}
function handleOnboardingAnswer(optsId, title, chosen) {
  const idx = ONB.findIndex((q) => "onb_" + q.id === optsId);
  onbAnswers[idx] = { q: ONB[idx].title, a: chosen };
  messages.push({ id: "local-u-" + Date.now(), role: "user", content: chosen.join(", "), created_date: new Date().toISOString(), local: true, onbUser: true });
  if (idx < ONB.length - 1) { pushLocalTendy(onbBlocks(idx + 1)); }
  else {
    const summary = onbAnswers.map((x) => `${x.q} ${x.a.join(", ")}`).join("\n");
    renderMessages();
    sendMessage(`Quiero crear una nueva aplicación. Estas son mis respuestas:\n${summary}\n\nCrea el proyecto, resume lo que entendiste y pregúntame solo lo que falte antes de construir.`, true);
  }
}

// ── mensajes ──────────────────────────────────────────
function renderMessages() {
  const box = $("#msgs");
  if (!box) return;
  if (!messages.length) {
    box.innerHTML = `<div class="empty">${avatarSVG(130)}
      <h2>¡Hola, soy Tendy!</h2>
      <p>Pídeme lo que necesites: buscar en internet, resumir tus correos, redactar, organizar tu día o crear una aplicación completa conversando.</p></div>`;
    wireAvatar(box);
    return;
  }
  const lastTendyIdx = messages.map((m) => m.role).lastIndexOf("tendy");
  let html = "", lastDay = "";
  messages.forEach((m, idx) => {
    const day = fmtDay(m.created_date);
    if (day !== lastDay) { html += `<div class="day-sep">${day}</div>`; lastDay = day; }
    const interactive = m.role === "tendy" && (idx === lastTendyIdx) && !waiting;
    const body = m.role === "user" ? `<div class="txt">${esc(m.content)}</div>` : renderRich(m.content, interactive, m.id);
    html += `<div class="msg ${m.role}" data-mid="${esc(m.id)}">
      <div class="bubble">${body}</div>
      <div class="msg-meta">${fmtTime(m.created_date)}</div></div>`;
  });
  if (waiting) html += `<div class="msg tendy"><div class="bubble typing"><i></i><i></i><i></i></div></div>`;
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;
}

function appendMessage(m) {
  if (m.role === "user") {
    const local = messages.find((x) => x.local && x.role === "user" && x.content === m.content && !x.onbUser);
    if (local) { Object.assign(local, m, { local: false }); renderMessages(); return; }
  }
  if (messages.some((x) => x.id && x.id === m.id)) return;
  messages.push(m);
  renderMessages();
  cacheConversation();
}

async function loadHistory() {
  try {
    await loadCachedConversation();
    const d = await api("history");
    const localKeep = messages.filter((m) => m.local && (m.onb || m.onbUser));
    messages = [...(d.messages || []), ...localKeep];
    renderMessages();
    cacheConversation();
    const persisted = messages.filter((m) => !m.local);
    const last = persisted[persisted.length - 1];
    if (last && last.role === "user") { setWaiting(true); startPolling(); }
    api("getConfig").then((d2) => { config = d2.config || config; }).catch(() => {});
  } catch (ex) { toast("No pude cargar el historial: " + ex.message); }
}
function setActivity(phase, pct, note = "Fase real del turno") {
  turnPhase = phase; turnProgress = Math.max(0, Math.min(100, pct));
  const box = $("#activity"); if (!box) return;
  box.hidden = !waiting;
  $("#activity-label", box).textContent = phase;
  $("#activity-percent", box).textContent = `${turnProgress}%`;
  $("#progress-fill", box).style.width = `${turnProgress}%`;
  $("#activity-note", box).textContent = note;
}
function setWaiting(v) {
  waiting = v;
  setStatus(v ? "thinking" : "idle");
  const send = $("#send");
  if (send) { send.disabled = false; send.innerHTML = v ? icon("close") : icon("send"); send.title = v ? "Cancelar seguimiento" : "Enviar"; send.setAttribute("aria-label", v ? "Cancelar" : "Enviar"); send.classList.toggle("cancel", v); }
  if (v) setActivity("Analizando tu solicitud", 15, "Estimación por fases: recepción y análisis");
  else { setActivity("Completado", 100, "Turno finalizado"); setTimeout(() => { const a=$("#activity"); if(a) a.hidden=true; }, 900); }
  renderMessages();
}
function stopPolling() { clearTimeout(pollTimer); pollTimer = null; if (turnController) turnController.abort(); turnController = null; }
function cancelTurn() {
  if (!waiting) return;
  stopPolling(); setWaiting(false); toast("Seguimiento cancelado. La ejecución que ya empezó en el servidor puede terminar, pero puedes enviar una nueva solicitud.");
}
function startPolling() {
  stopPolling(); turnController = new AbortController();
  const phases = [["Analizando tu solicitud",15],["Planificando la respuesta",35],["Trabajando con tus herramientas",60],["Verificando el resultado",82]]; let phase=0;
  const tick = async () => {
    try {
      if (phase < phases.length) { setActivity(phases[phase][0], phases[phase][1], "Estimación basada en el estado observable del turno"); phase++; }
      const persisted = messages.filter((m) => !m.local);
      const after = persisted.length ? persisted[persisted.length - 1].created_date : "";
      const d = await api("history", after ? { after } : {});
      let gotReply = false;
      for (const m of d.messages || []) { appendMessage(m); if (m.role === "tendy") gotReply = true; }
      if (gotReply) { setActivity("Respuesta lista",100,"Turno finalizado"); setWaiting(false); setStatus("speaking"); setTimeout(() => setStatus("idle"),2600); return; }
    } catch (e) { if (e.name !== "AbortError") setActivity("Reconectando", turnProgress, "No se perdió tu solicitud"); }
    if (waiting) pollTimer = setTimeout(tick, 2800);
  };
  pollTimer = setTimeout(tick, 1200);
}
function openNavigation() {
  const {o,close}=openModal(`<div class="sheet-head"><div><span class="eyebrow">CENTRO DE TENDY</span><h3>Navegación</h3></div><button class="icon-btn" data-close aria-label="Cerrar">${icon("close")}</button></div><div class="nav-grid">
    <button data-nav="projects">${icon("layers")}<span>Proyectos y aplicaciones</span></button><button data-nav="history">${icon("chat")}<span>Conversaciones e historial</span></button><button data-nav="new">${icon("plus")}<span>Nueva conversación</span></button><button data-nav="settings">${icon("gear")}<span>Configuración</span></button><button data-nav="files">${icon("paperclip")}<span>Archivos y recursos</span></button><button data-nav="activity">${icon("pulse")}<span>Actividad y tareas</span></button><button data-nav="help">${icon("help")}<span>Ayuda y soporte</span></button></div>`,`Navegación`);
  o.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>{const n=b.dataset.nav;close();if(n==="projects")openProjects();else if(n==="settings")openSettings();else if(n==="new"){messages=[];renderMessages();toast("Nueva conversación lista");}else if(n==="files")toast(attachments.length?`${attachments.length} archivo(s) pendiente(s)`:"Aún no hay archivos adjuntos");else if(n==="activity")toast(waiting?turnPhase:"No hay un turno activo");else if(n==="help")toast("Describe la aplicación o tarea que quieres resolver y Tendy te guiará paso a paso");else toast("El historial se conserva en este chat y en tu dispositivo");});
}
async function sendMessage(text, skipEcho) {
  const content = (text || "").trim(); const input = $("#input");
  if ((!content && !attachments.length) || waiting) return;
  const localContent = content || `Adjuntos: ${attachments.map(a=>a.name).join(", ")}`;
  const outboxKey = `outbox-${Date.now()}-${Math.random()}`;
  if (!skipEcho) appendMessage({ role:"user", content:localContent, created_date:new Date().toISOString(), local:true, attachments:attachments.map(a=>({name:a.name,type:a.type,size:a.size})) });
  else messages.push({id:"local-s-"+Date.now(),role:"user",content:content.split("\n")[0]+" …",created_date:new Date().toISOString(),local:true,onbUser:true});
  await idbPut({key:outboxKey,type:"outbox",content,attachments:attachments.map(a=>({name:a.name,type:a.type,size:a.size,data:a.data}))});
  if (input) { input.value=""; input.style.height="auto"; }
  const outgoing = { content, attachments: attachments.map(a=>({name:a.name,type:a.type,size:a.size,data:a.data})) }; attachments=[]; renderAttachmentTray(); setWaiting(true);
  try { if(!navigator.onLine) throw new Error("offline"); await api("send", outgoing); await idbDelete(outboxKey); await idbPut({key:"last-sync",type:"meta",value:new Date().toISOString()}); startPolling(); } catch(ex) { setWaiting(false); if(ex.message === "offline") toast("Guardado localmente. Se enviará al recuperar la conexión."); else toast("No se pudo enviar: "+ex.message); }
}
function prepareAttachments(files) {
  const reads=files.slice(0,5).map(f=>new Promise(resolve=>{if(f.size>2_000_000){toast(`${f.name} supera 2 MB`);return resolve(null);}const r=new FileReader();r.onload=()=>resolve({name:f.name,type:f.type||"application/octet-stream",size:f.size,data:String(r.result).slice(0,2_500_000)});r.readAsDataURL(f);}));
  Promise.all(reads).then(xs=>{attachments=[...attachments,...xs.filter(Boolean)];renderAttachmentTray();});
}
function renderAttachmentTray(){const old=$("#attachment-tray");if(old)old.remove();if(!attachments.length)return;const c=document.createElement("div");c.id="attachment-tray";c.className="attachment-tray";c.innerHTML=attachments.map((a,i)=>`<span>${icon(a.type.startsWith("image/")?"image":"file")} ${esc(a.name)} <button data-rm="${i}" aria-label="Quitar">×</button></span>`).join("");$(".composer").prepend(c);c.onclick=e=>{const b=e.target.closest("[data-rm]");if(b){attachments.splice(+b.dataset.rm,1);renderAttachmentTray();}};}

// ── configuración ─────────────────────────────────────
const TONES = ["cercano", "profesional", "creativo", "directo"];
function openSettings() {
  const { o, close } = openModal(`
  <div class="sheet-head"><h3>Configurar a Tendy</h3>
    <button class="icon-btn" data-close aria-label="Cerrar">${icon("close")}</button></div>
  <div class="field"><label for="f-name">¿Cómo quieres que te llame?</label>
    <input type="text" id="f-name" value="${esc(config.display_name)}" maxlength="60"></div>
  <div class="field"><label>Tono de Tendy</label>
    <div class="tone-row" id="tones">${TONES.map((t) => `<button class="tone ${t === config.tone ? "active" : ""}" data-tone="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div></div>
  <div class="field"><label for="f-instr">Instrucciones personalizadas (opcional)</label>
    <textarea id="f-instr" maxlength="2000" placeholder="Ej.: Respóndeme breve y directo, avísame antes de enviar correos…">${esc(config.instructions)}</textarea></div>
  <div class="sheet-actions"><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="save">Guardar</button></div>`, "Configurar a Tendy");
  let tone = config.tone;
  $("#tones", o).addEventListener("click", (e) => {
    const b = e.target.closest(".tone"); if (!b) return;
    tone = b.dataset.tone;
    o.querySelectorAll(".tone").forEach((x) => x.classList.toggle("active", x === b));
  });
  $("#save", o).addEventListener("click", async () => {
    try {
      const d = await api("setConfig", { display_name: $("#f-name", o).value.trim() || "Domingo", tone, instructions: $("#f-instr", o).value.trim() });
      config = d.config; close(); toast("Configuración guardada");
    } catch (ex) { toast(ex.message); }
  });
}

// ── arranque ──────────────────────────────────────────
window.addEventListener("online", () => { toast("Conexión recuperada. Sincronizando…"); flushOutbox(); loadHistory(); });
window.addEventListener("offline", () => toast("Sin conexión. Puedes seguir escribiendo; se guardará localmente."));
renderWelcome();
})();
