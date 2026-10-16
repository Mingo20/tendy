// Tendy — API del agente personal de Domingo
// Autenticación por PIN + historial y configuración en la entidad TendyRecord.
// El envío de un mensaje (kind "msg_user") dispara el workflow que despierta
// al agente para responder como Tendy (kind "msg_tendy").

import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

const PIN = Deno.env.get("TENDY_PIN") ?? "tendy2026";
const TONES = ["cercano", "profesional", "creativo", "directo"];

const DEFAULT_CONFIG = {
  display_name: "Domingo",
  tone: "cercano",
  instructions: "",
};

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normRec(raw: any) {
  const d = raw?.data ?? raw;
  return {
    pid: raw?.id ?? raw?.id ?? d?.id,
    id: raw?.id ?? raw?.id ?? d?.id,
    kind: d?.kind ?? raw?.kind ?? "",
    client_id: d?.client_id ?? raw?.client_id ?? "",
    payload: d?.payload ?? raw?.payload ?? {},
    created_date: d?.created_date ?? raw?.created_date ?? "",
  };
}

Deno.serve(async (req) => {
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405, headers: cors });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action = String(body.action ?? "");
  const TOKEN = await sha256(PIN + ":tendy");
  const out = (data: any, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: cors });

  try {
    if (action !== "login" && String(body.token ?? "") !== TOKEN) {
      return out({ error: "No autorizado" }, 401);
    }

    const base44 = createClientFromRequest(req);
    const list = await base44.asServiceRole.entities.TendyRecord.list({});
    const arr: any[] = Array.isArray(list) ? list : (list?.items ?? list?.data ?? []);
    const recs = arr.map(normRec);

    // ── acciones ──────────────────────────────────────────────
    if (action === "login") {
      if (String(body.pin ?? "") !== PIN) return out({ error: "PIN incorrecto" }, 401);
      return out({ token: TOKEN });
    }

    if (action === "send") {
      const clientId = String(body.client_id ?? "");
      const content = String(body.content ?? "").trim();
      if (!clientId || !content) return out({ error: "Mensaje vacío" }, 400);
      if (content.length > 4000) return out({ error: "El mensaje es demasiado largo (máx. 4000)" }, 400);
      const rec = await base44.asServiceRole.entities.TendyRecord.create({
        kind: "msg_user",
        client_id: clientId,
        payload: { content },
      });
      const n = normRec(rec?.item ?? rec?.data?.item ?? rec ?? {});
      return out({ ok: true, id: n.id ?? null, created_date: n.created_date ?? new Date().toISOString() });
    }

    if (action === "history") {
      const clientId = String(body.client_id ?? "");
      const msgs = recs
        .filter((r) => r.client_id === clientId && (r.kind === "msg_user" || r.kind === "msg_tendy"))
        .map((r) => ({
          id: r.id,
          role: r.kind === "msg_user" ? "user" : "tendy",
          content: r.payload?.content ?? "",
          created_date: r.created_date,
        }))
        .sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)));
      const after = String(body.after ?? "");
      const filtered = after ? msgs.filter((m) => String(m.created_date) > after) : msgs.slice(-100);
      return out({ messages: filtered });
    }

    if (action === "getConfig") {
      const clientId = String(body.client_id ?? "");
      const cfg = recs.find((r) => r.client_id === clientId && r.kind === "config");
      return out({ config: { ...DEFAULT_CONFIG, ...(cfg?.payload ?? {}) } });
    }

    if (action === "setConfig") {
      const clientId = String(body.client_id ?? "");
      if (!clientId) return out({ error: "Falta cliente" }, 400);
      const cfg = recs.find((r) => r.client_id === clientId && r.kind === "config");
      const current = { ...DEFAULT_CONFIG, ...(cfg?.payload ?? {}) };
      const patch = {
        display_name: String(body.display_name ?? current.display_name).slice(0, 60) || current.display_name,
        tone: TONES.includes(body.tone) ? body.tone : current.tone,
        instructions: String(body.instructions ?? current.instructions).slice(0, 2000),
      };
      if (cfg) {
        await base44.asServiceRole.entities.TendyRecord.update(cfg.pid, { payload: patch });
      } else {
        await base44.asServiceRole.entities.TendyRecord.create({
          kind: "config",
          client_id: clientId,
          payload: patch,
        });
      }
      return out({ config: patch });
    }

    return out({ error: "Acción desconocida" }, 400);
  } catch (err) {
    return out({ error: err instanceof Error ? err.message : "Error interno" }, 500);
  }
});
