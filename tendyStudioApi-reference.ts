// Tendy Studio API
// Orquestación persistente para proyectos creados por conversación.
// Nota: la interfaz actual usa sesiones anónimas. Para producción multiusuario
// debe añadirse autenticación Base44 antes de exponer datos sensibles.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
};
const SKILLS = [
  ["requirements", "Analizador de requisitos", "Convierte la petición en una especificación clara y verificable."],
  ["architecture", "Arquitecto de software", "Define componentes, datos, permisos y flujos."],
  ["uiux", "Diseñador UI/UX", "Crea el sistema visual y la adaptación responsiva."],
  ["frontend", "Desarrollador frontend", "Implementa interfaces y componentes interactivos."],
  ["backend", "Desarrollador backend Deno", "Implementa API, validaciones y lógica de negocio."],
  ["data", "Gestor de datos", "Diseña entidades, relaciones y operaciones seguras."],
  ["integrations", "Integrador de servicios", "Conecta APIs y servicios autorizados."],
  ["github", "Gestor de GitHub", "Administra repositorios, commits, ramas y versiones."],
  ["qa", "QA y pruebas", "Ejecuta verificaciones reproducibles y documenta resultados."],
  ["debugging", "Depurador", "Encuentra causas y verifica correcciones."],
  ["deployment", "Despliegue y publicación", "Publica y comprueba disponibilidad."],
  ["maintenance", "Mantenimiento y actualización", "Modifica proyectos sin perder requisitos."],
  ["visuals", "Generador visual", "Produce diagramas y componentes visuales."],
  ["security", "Seguridad y permisos", "Revisa accesos, secretos y operaciones sensibles."],
  ["docs", "Documentación", "Genera documentación de uso y técnica."],
];

function out(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors });
}
function asArray(value: any): any[] {
  return Array.isArray(value) ? value : (value?.items ?? value?.data ?? []);
}
function id() { return crypto.randomUUID(); }
function safeClient(body: any) { return String(body.client_id ?? "").slice(0, 120); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  let body: any = {};
  try { body = await req.json(); } catch { return out({ error: "JSON inválido" }, 400); }
  const action = String(body.action ?? "");
  const clientId = safeClient(body);
  if (!clientId && action !== "skills") return out({ error: "client_id requerido" }, 400);

  try {
    const base44 = createClientFromRequest(req);
    const entities: any = (base44.asServiceRole as any).entities;
    const projects = entities.TendyProject;
    const tasks = entities.TendyTask;
    const artifacts = entities.TendyArtifact;

    if (action === "skills") {
      return out({ skills: SKILLS.map(([slug, name, description]) => ({ slug, name, description, version: "1.0.0", active: true })) });
    }
    if (action === "listProjects") {
      const rows = asArray(await projects.list({})).filter((p: any) => p.client_id === clientId);
      return out({ projects: rows.sort((a: any, b: any) => String(b.updated_date).localeCompare(String(a.updated_date))) });
    }
    if (action === "getProject") {
      const project = await projects.get(String(body.project_id));
      if (!project || project.client_id !== clientId) return out({ error: "Proyecto no encontrado" }, 404);
      const allTasks = asArray(await tasks.list({})).filter((t: any) => t.client_id === clientId && t.project_id === project.id).sort((a: any,b: any) => (a.order ?? 0) - (b.order ?? 0));
      const allArtifacts = asArray(await artifacts.list({})).filter((a: any) => a.client_id === clientId && a.project_id === project.id);
      return out({ project, tasks: allTasks, artifacts: allArtifacts });
    }
    if (action === "createProject") {
      const name = String(body.name ?? "Nueva aplicación").slice(0, 120);
      const description = String(body.description ?? "").slice(0, 4000);
      const project = await projects.create({ client_id: clientId, name, description, status: "draft", version: 0, requirements: body.requirements ?? {}, created_by_client: true });
      return out({ project });
    }
    if (action === "planProject") {
      const project = await projects.get(String(body.project_id));
      if (!project || project.client_id !== clientId) return out({ error: "Proyecto no encontrado" }, 404);
      const plan = Array.isArray(body.tasks) ? body.tasks : [];
      await projects.update(project.id, { status: "planning", requirements: body.requirements ?? project.requirements, version: Number(project.version ?? 0) + 1 });
      const created = [];
      for (let i = 0; i < plan.length; i++) {
        const p = plan[i] ?? {};
        created.push(await tasks.create({ client_id: clientId, project_id: project.id, title: String(p.title ?? `Tarea ${i + 1}`), description: String(p.description ?? ""), skill: String(p.skill ?? "requirements"), status: i === 0 ? "in_progress" : "pending", order: i, result: {} }));
      }
      return out({ ok: true, project: await projects.get(project.id), tasks: created });
    }
    if (action === "updateProjectStatus") {
      const project = await projects.get(String(body.project_id));
      if (!project || project.client_id !== clientId) return out({ error: "Proyecto no encontrado" }, 404);
      const allowed = ["draft","planning","developing","testing","awaiting_approval","publishing","completed","failed"];
      const status = String(body.status);
      if (!allowed.includes(status)) return out({ error: "Estado inválido" }, 400);
      const updated = await projects.update(project.id, { status, version: Number(project.version ?? 0) + (status === "completed" ? 1 : 0), production_url: body.production_url ?? project.production_url, repository_url: body.repository_url ?? project.repository_url, preview_url: body.preview_url ?? project.preview_url });
      return out({ ok: true, project: updated });
    }
    if (action === "updateTask") {
      const task = await tasks.get(String(body.task_id));
      if (!task || task.client_id !== clientId) return out({ error: "Tarea no encontrada" }, 404);
      const status = String(body.status ?? task.status);
      const updated = await tasks.update(task.id, { status, result: body.result ?? task.result, error: body.error ?? task.error });
      return out({ ok: true, task: updated });
    }
    if (action === "addArtifact") {
      const project = await projects.get(String(body.project_id));
      if (!project || project.client_id !== clientId) return out({ error: "Proyecto no encontrado" }, 404);
      const artifact = await artifacts.create({ client_id: clientId, project_id: project.id, type: String(body.type ?? "file"), name: String(body.name ?? "Artefacto"), url: String(body.url ?? ""), metadata: body.metadata ?? {} });
      return out({ artifact });
    }
    return out({ error: "Acción no soportada" }, 400);
  } catch (error) {
    return out({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
