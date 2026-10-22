// Tendy — tu agente personal. Interfaz de chat con avatar interactivo.
(() => {
"use strict";

const API = window.TENDY_API_BASE ?? "";
const STUDIO_API = window.TENDY_STUDIO_API_BASE ?? "https://superagent-573efe2c.base44.app/functions/tendyStudioApi";
const app = document.getElementById("app");
const toastEl = document.getElementById("toast");
let uidCounter = 0;
let config = { display_name: "Domingo", tone: "cercano", instructions: "" };
let messages = [];       // {id, role, content, created_date, local?}
let waiting = false;
let pollTimer = null;
let toastTimer = null;

const clientId = (() => {
  let id = localStorage.getItem("tendy_client");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("tendy_client", id); }
  return id;
})();
const getToken = () => sessionStorage.getItem("tendy_token") ?? "";

// ── utilidades ────────────────────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const withLinks = (s) => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
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

async function studioApi(action, extra = {}) {
  const res = await fetch(STUDIO_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, client_id: clientId, ...extra }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ("Error " + res.status));
  return data;
}

async function api(action, extra = {}) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, token: getToken(), client_id: clientId, ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ("Error " + res.status));
  return data;
}

// ── avatar ───────────────────────────────────────────
function avatarSVG(size, cls = "") {
  const g = "tg" + (++uidCounter);
  return `<span class="avatar ${cls}" data-avatar>
<svg class="avatar-svg" viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">
<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#8B5CF6"/><stop offset="1" stop-color="#22D3EE"/></linearGradient></defs>
<circle class="av-ring" cx="60" cy="60" r="56" fill="none" stroke="url(#${g})" stroke-width="2.5"/>
<line x1="60" y1="19" x2="60" y2="8" stroke="url(#${g})" stroke-width="4.5" stroke-linecap="round"/>
<circle class="av-ant" cx="60" cy="7" r="5" fill="#22D3EE"/>
<path class="av-head" d="M60 21c25 0 41 17 41 43s-16 43-41 43S19 90 19 64s16-43 41-43Z" fill="url(#${g})"/>
<ellipse class="av-eye" cx="45" cy="60" rx="6.5" ry="9.5" fill="#070B16"/>
<ellipse class="av-eye" cx="75" cy="60" rx="6.5" ry="9.5" fill="#070B16"/>
<path class="av-smile" d="M48 80q12 9 24 0" stroke="#070B16" stroke-width="4" fill="none" stroke-linecap="round"/>
<rect class="av-wave" x="50" y="77.5" width="20" height="7" rx="3.5" fill="#070B16"/>
</svg></span>`;
}
const REACTIONS = ["¡Hola! ¿En qué te ayudo?", "¡Aquí estoy, al pendiente!", "¿Qué plan tenemos hoy?", "¡Pregúntame lo que sea!", "Listo para lo que necesites."];
function wireAvatar(root) {
  const av = $("[data-avatar]", root || document);
  if (!av) return;
  av.addEventListener("click", () => {
    av.classList.remove("avatar-bounce");
    void av.offsetWidth;
    av.classList.add("avatar-bounce");
    toast(REACTIONS[Math.floor(Math.random() * REACTIONS.length)]);
  });
}
function setStatus(state) { // "idle" | "thinking" | "speaking"
  const av = $("[data-avatar]"), st = $("#status");
  if (av) { av.classList.toggle("is-thinking", state === "thinking"); av.classList.toggle("is-speaking", state === "speaking"); }
  if (st) {
    st.classList.toggle("thinking", state !== "idle");
    st.lastElementChild.textContent = state === "thinking" ? "pensando…" : state === "speaking" ? "escribiendo…" : "en línea";
  }
}

// ── vistas ────────────────────────────────────────────
function renderWelcome() {
  app.innerHTML = `
<div class="login-wrap">
  <div class="login-card">
    ${avatarSVG(120)}
    <div class="brand-name">Tendy</div>
    <p class="login-tag">Tu agente personal. Navega, busca, redacta y gestiona — todo por ti, desde cualquier dispositivo.</p>
    <button class="login-btn" id="enter-btn">Acceder</button>
    <div class="login-hint">Acceso directo</div>
  </div>
</div>`;
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
    <button class="project-btn" id="projects-btn" title="Mis proyectos"><span class="project-dot"></span><span class="project-label">Proyectos</span></button>
    <button class="icon-btn" id="settings-btn" title="Configurar a Tendy" aria-label="Configurar a Tendy">
      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>
    </button>
  </header>
  <main class="msgs" id="msgs"></main>
  <div class="chips" id="chips"></div>
  <footer class="composer">
    <div class="composer-box">
      <textarea id="input" rows="1" placeholder="Escríbele algo a Tendy…" aria-label="Mensaje"></textarea>
      <button class="send-btn" id="send" title="Enviar" aria-label="Enviar">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
      </button>
    </div>
  </footer>
</div>`;
  wireAvatar();
  $("#settings-btn").addEventListener("click", openSettings);
  $("#projects-btn").addEventListener("click", openProjects);
  const input = $("#input");
  input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input.value); }
  });
  $("#send").addEventListener("click", () => sendMessage(input.value));
  renderChips();
  loadHistory();
}


async function openProjects() {
  const old = document.querySelector(".project-drawer"); if (old) { old.remove(); return; }
  const wrap = document.createElement("div"); wrap.className = "project-drawer";
  wrap.innerHTML = `<div class="drawer-head"><div><span class="eyebrow">ESPACIO DE TRABAJO</span><h2>Mis proyectos</h2></div><button class="icon-btn" data-close aria-label="Cerrar">×</button></div><div class="project-list"><div class="drawer-loading">Cargando proyectos…</div></div><button class="new-project" id="new-project">＋ Crear una aplicación</button>`;
  document.body.appendChild(wrap);
  wrap.querySelector("[data-close]").onclick = () => wrap.remove();
  try {
    const d = await studioApi("listProjects");
    const list = wrap.querySelector(".project-list");
    if (!d.projects.length) list.innerHTML = `<div class="drawer-empty">Aún no hay proyectos.<br><small>Describe una aplicación en el chat y Tendy convertirá la idea en un plan real.</small></div>`;
    else list.innerHTML = d.projects.map(projectCard).join("");
    list.querySelectorAll("[data-project]").forEach(btn => btn.onclick = async () => { const p = await studioApi("getProject", { project_id: btn.dataset.project }); wrap.remove(); showProjectContext(p); });
  } catch (e) { wrap.querySelector(".project-list").innerHTML = `<div class="drawer-empty">No pude cargar tus proyectos.</div>`; }
  wrap.querySelector("#new-project").onclick = () => { wrap.remove(); const input=$("#input"); input.value="Quiero crear una nueva aplicación: "; input.focus(); };
}
function projectCard(p) {
  const labels={draft:"Borrador",planning:"Planificando",developing:"Construyendo",testing:"Probando",awaiting_approval:"Esperando decisión",publishing:"Publicando",completed:"Publicado",failed:"Con error"};
  return `<button class="project-card" data-project="${esc(p.id)}"><span class="project-mark">✦</span><span class="project-card-main"><strong>${esc(p.name)}</strong><small>${esc(labels[p.status]||p.status)} · v${p.version||0}</small></span><span class="chevron">›</span></button>`;
}


function showProjectContext(d) {
  const p=d.project, done=(d.tasks||[]).filter(t=>t.status==='completed').length, total=(d.tasks||[]).length;
  const text = `Proyecto seleccionado: ${p.name}. Estado: ${p.status}. Progreso: ${done}/${total} tareas. ${p.production_url ? `Enlace: ${p.production_url}` : "Todavía no está publicado."}`;
  const input=$("#input"); input.value=text; input.focus(); toast("Proyecto cargado en el chat");
}

const SUGGESTIONS = [
  { icon: "🧭", label: "¿Qué puedes hacer por mí?" },
  { icon: "🔎", label: "Busca noticias de RD de hoy" },
  { icon: "📧", label: "Resume mis correos" },
  { icon: "✍️", label: "Ayúdame a redactar algo" },
  { icon: "🗓️", label: "¿Qué tengo en el calendario?" },
];
function renderChips() {
  const box = $("#chips");
  if (!box) return;
  box.innerHTML = SUGGESTIONS.map((s) => `<button class="chip" data-s="${esc(s.label)}">${s.icon} ${esc(s.label)}</button>`).join("");
  box.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    const input = $("#input");
    input.value = btn.dataset.s;
    input.focus();
    input.dispatchEvent(new Event("input"));
  });
}

// ── mensajes ──────────────────────────────────────────
function renderMessages() {
  const box = $("#msgs");
  if (!box) return;
  if (!messages.length) {
    box.innerHTML = `<div class="empty">${avatarSVG(130)}
      <h2>¡Hola, soy Tendy!</h2>
      <p>Pídeme lo que necesites: buscar en internet, resumir tus correos, redactar, organizar tu día o casi cualquier cosa. Estoy aquí para ti.</p></div>`;
    wireAvatar(box);
    return;
  }
  let html = "", lastDay = "";
  for (const m of messages) {
    const day = fmtDay(m.created_date);
    if (day !== lastDay) { html += `<div class="day-sep">${day}</div>`; lastDay = day; }
    html += `<div class="msg ${m.role}">
      <div class="bubble">${withLinks(m.content)}</div>
      <div class="msg-meta">${fmtTime(m.created_date)}</div>
    </div>`;
  }
  if (waiting) html += `<div class="msg tendy"><div class="bubble typing"><i></i><i></i><i></i></div></div>`;
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;
}

function appendMessage(m) {
  if (m.role === "user") {
    const local = messages.find((x) => x.local && x.content === m.content);
    if (local) { Object.assign(local, m, { local: false }); renderMessages(); return; }
  }
  if (messages.some((x) => x.id && x.id === m.id)) return;
  messages.push(m);
  renderMessages();
}

async function loadHistory() {
  try {
    const d = await api("history");
    messages = d.messages || [];
    renderMessages();
    const last = messages[messages.length - 1];
    if (last && last.role === "user") { setWaiting(true); startPolling(); }
    api("getConfig").then((d2) => { config = d2.config || config; }).catch(() => {});
  } catch (ex) {
    toast("No pude cargar el historial: " + ex.message);
  }
}

function setWaiting(v) {
  waiting = v;
  setStatus(v ? "thinking" : "idle");
  const send = $("#send");
  if (send) send.disabled = v;
  renderMessages();
}

function stopPolling() { clearTimeout(pollTimer); pollTimer = null; }

function startPolling() {
  stopPolling();
  const tick = async () => {
    try {
      const after = messages.length ? messages[messages.length - 1].created_date : "";
      const d = await api("history", after ? { after } : {});
      const news = d.messages || [];
      let gotReply = false;
      for (const m of news) {
        appendMessage(m);
        if (m.role === "tendy") gotReply = true;
      }
      if (gotReply) {
        setWaiting(false);
        setStatus("speaking");
        setTimeout(() => setStatus("idle"), 2600);
        return;
      }
    } catch { /* reintenta en el próximo ciclo */ }
    if (waiting) pollTimer = setTimeout(tick, 4000);
  };
  pollTimer = setTimeout(tick, 3500);
}

async function sendMessage(text) {
  const content = (text || "").trim();
  const input = $("#input");
  if (!content || waiting) return;
  appendMessage({ role: "user", content, created_date: new Date().toISOString(), local: true });
  if (input) { input.value = ""; input.style.height = "auto"; }
  setWaiting(true);
  try {
    await api("send", { content });
    startPolling();
  } catch (ex) {
    setWaiting(false);
    toast("No se pudo enviar: " + ex.message);
  }
}

// ── configuración ─────────────────────────────────────
const TONES = ["cercano", "profesional", "creativo", "directo"];
function openSettings() {
  const o = document.createElement("div");
  o.className = "overlay";
  o.innerHTML = `
<div class="sheet" role="dialog" aria-label="Configurar a Tendy">
  <div class="sheet-head">
    <h3>Configurar a Tendy</h3>
    <button class="icon-btn" data-close aria-label="Cerrar">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
    </button>
  </div>
  <div class="field">
    <label for="f-name">¿Cómo quieres que te llame?</label>
    <input type="text" id="f-name" value="${esc(config.display_name)}" maxlength="60">
  </div>
  <div class="field">
    <label>Tono de Tendy</label>
    <div class="tone-row" id="tones">
      ${TONES.map((t) => `<button class="tone ${t === config.tone ? "active" : ""}" data-tone="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}
    </div>
  </div>
  <div class="field">
    <label for="f-instr">Instrucciones personalizadas (opcional)</label>
    <textarea id="f-instr" maxlength="2000" placeholder="Ej.: Respóndeme breve y directo, usa emojis con moderación, avísame antes de enviar correos…">${esc(config.instructions)}</textarea>
  </div>
  <div class="sheet-actions">
    <button class="btn ghost" id="logout">Cerrar sesión</button>
    <button class="btn primary" id="save">Guardar</button>
  </div>
  <div class="sheet-note">Tendy usa tu PIN para proteger el acceso (tendy2026 por defecto).</div>
</div>`;
  document.body.appendChild(o);
  let tone = config.tone;
  $("#tones", o).addEventListener("click", (e) => {
    const b = e.target.closest(".tone");
    if (!b) return;
    tone = b.dataset.tone;
    o.querySelectorAll(".tone").forEach((x) => x.classList.toggle("active", x === b));
  });
  o.addEventListener("click", (e) => { if (e.target === o || e.target.closest("[data-close]")) o.remove(); });
  $("#logout", o).addEventListener("click", () => {
    sessionStorage.removeItem("tendy_token");
    stopPolling();
    o.remove();
    renderWelcome();
  });
  $("#save", o).addEventListener("click", async () => {
    try {
      const d = await api("setConfig", {
        display_name: $("#f-name", o).value.trim() || "Domingo",
        tone,
        instructions: $("#f-instr", o).value.trim(),
      });
      config = d.config;
      o.remove();
      toast("¡Listo! Configuración guardada");
    } catch (ex) { toast(ex.message); }
  });
}

// ── arranque ──────────────────────────────────────────
renderWelcome();
})();
