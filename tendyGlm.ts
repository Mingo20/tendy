// Tendy — API con motor GLM 5.3 Flash vía NVIDIA NIM
// Reemplaza tendyApi: chat directo con GLM + historial y config en TendyRecord.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

const GLM_KEY = "nvapi-TU-CLAVE-AQUI (la clave real vive solo en la función desplegada en Base44)";
const GLM_BASES = ["https://integrate.api.nvidia.com/v1"];
const GLM_MODEL = "z-ai/glm-5.3-flash";
const TONES = ["cercano", "profesional", "creativo", "directo"];
const DEFAULT_CONFIG = { display_name: "Domingo", tone: "cercano", instructions: "" };

function normRec(raw: any) {
  const d = raw?.data ?? raw ?? {};
  return {
    pid: raw?.id ?? d?.id,
    kind: d?.kind ?? raw?.kind ?? "",
    client_id: d?.client_id ?? raw?.client_id ?? "",
    conversation_id: d?.conversation_id ?? raw?.conversation_id ?? "",
    payload: d?.payload ?? raw?.payload ?? {},
    created_date: d?.created_date ?? raw?.created_date ?? "",
  };
}

async function glmChat(messages: any[]) {
  let lastErr = "";
  for (const base of GLM_BASES) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 170000);
      const res = await fetch(base + "/chat/completions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + GLM_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ model: GLM_MODEL, messages, max_tokens: 4096, temperature: 0.7, stream: false }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) { lastErr = "GLM " + res.status + ": " + (data?.error?.message ?? data?.detail ?? ""); continue; }
      const msg = data?.choices?.[0]?.message ?? {};
      const content = msg?.content ?? msg?.reasoning_content ?? "";
      if (content) return { ok: true, content: String(content).trim() };
      lastErr = "GLM sin contenido";
    } catch (e: any) { lastErr = e?.message ?? "fallo de red GLM"; }
  }
  return { ok: false, error: lastErr };
}

Deno.serve(async (req) => {
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405, headers: cors });
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const action = String(body.action ?? "");
  const clientId = String(body.client_id ?? "").trim();
  const conversationId = String(body.conversation_id ?? "main").trim() || "main";
  const out = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });
  if (action !== "login" && !clientId) return out({ error: "client_id requerido" }, 400);

  try {
    const base44 = createClientFromRequest(req);
    const e = (base44.asServiceRole.entities as any).TendyRecord;
    const list: any = await e.list({});
    const arr: any[] = Array.isArray(list) ? list : (list?.items ?? list?.data ?? []);
    const recs = arr.map(normRec);

    if (action === "login") return out({ ok: true, token: "open-access" });

    if (action === "send" || action === "chat") {
      const content = String(body.content ?? "").trim();
      if (!content) return out({ error: "Mensaje vacío" }, 400);
      if (content.length > 4000) return out({ error: "El mensaje es demasiado largo (máx. 4000)" }, 400);
      await e.create({ kind: "msg_user", client_id: clientId, conversation_id: conversationId, payload: { content } });
      if (action === "send") return out({ ok: true });

      const cfgRec = recs.find((r) => r.client_id === clientId && r.kind === "config");
      const cfg = { ...DEFAULT_CONFIG, ...(cfgRec?.payload ?? {}) };
      const hist = recs
        .filter((r) => r.client_id === clientId && r.conversation_id === conversationId &&
          (r.kind === "msg_user" || r.kind === "msg_tendy"))
        .sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)))
        .slice(-16)
        .map((r) => ({ role: r.kind === "msg_user" ? "user" : "assistant", content: String(r.payload?.content ?? "") }));
      const messages: any[] = [{
        role: "system",
        content: `Eres Tendy, el agente personal de IA de ${cfg.display_name}. Tu tono es ${cfg.tone}. ` +
          (cfg.instructions ? "Instrucciones del dueño: " + cfg.instructions + " " : "") +
          "Responde en español, claro, cálido y útil, en formato de chat, sin saludos largos.",
      }, ...hist];
      const reply = await glmChat(messages);
      if (!reply.ok) return out({ ok: false, glm: false, error: reply.error, hint: "Verifica la clave GLM" }, 200);
      await e.create({ kind: "msg_tendy", client_id: clientId, conversation_id: conversationId, payload: { content: reply.content } });
      return out({ ok: true, glm: true, reply: reply.content });
    }

    if (action === "history") {
      const msgs = recs
        .filter((r) => r.client_id === clientId && r.conversation_id === conversationId &&
          (r.kind === "msg_user" || r.kind === "msg_tendy"))
        .map((r) => ({ id: r.pid, role: r.kind === "msg_user" ? "user" : "tendy", content: r.payload?.content ?? "", created_date: r.created_date }))
        .sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)));
      const after = String(body.after ?? "");
      return out({ messages: after ? msgs.filter((m) => String(m.created_date) > after) : msgs.slice(-100) });
    }

    if (action === "getConfig") {
      const cfg = recs.find((r) => r.client_id === clientId && r.kind === "config");
      return out({ config: { ...DEFAULT_CONFIG, ...(cfg?.payload ?? {}) } });
    }

    if (action === "setConfig") {
      const cfg = recs.find((r) => r.client_id === clientId && r.kind === "config");
      const current = { ...DEFAULT_CONFIG, ...(cfg?.payload ?? {}) };
      const patch = {
        display_name: String(body.display_name ?? current.display_name).slice(0, 60) || current.display_name,
        tone: TONES.includes(body.tone) ? body.tone : current.tone,
        instructions: String(body.instructions ?? current.instructions).slice(0, 2000),
      };
      if (cfg) await e.update(cfg.pid, { payload: patch });
      else await e.create({ kind: "config", client_id: clientId, conversation_id: conversationId, payload: patch });
      return out({ config: patch });
    }

    return out({ error: "Acción desconocida" }, 400);
  } catch (err) {
    return out({ error: err instanceof Error ? err.message : "Error interno" }, 500);
  }
});
