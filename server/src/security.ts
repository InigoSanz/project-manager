import type { FastifyReply, FastifyRequest } from "fastify";
import type { NebulaConfig } from "@nebula/shared";
import { lanUrls } from "./lan.js";

/**
 * Nebula no tiene autenticación: su modelo de confianza es "solo escucha en
 * localhost". Eso deja dos agujeros que este módulo cierra:
 *
 * 1. Cualquier web que visites en el navegador puede llamar a
 *    http://localhost:4816 (el navegador la deja salir; sin comprobar `Origin`
 *    el servidor la atiende). Sin esto, añadir ejecución de procesos
 *    convertiría navegar por internet en ejecución de código en tu máquina.
 * 2. Con `lanAccess` cualquier dispositivo de la wifi tiene la API entera.
 *    Las acciones que ejecutan algo quedan restringidas a loopback.
 */

/** Orígenes admitidos: el propio servidor y, si se habilita, las URLs LAN. */
export function allowedOrigins(cfg: NebulaConfig): string[] {
  const origins = [
    `http://localhost:${cfg.port}`,
    `http://127.0.0.1:${cfg.port}`,
    `http://[::1]:${cfg.port}`,
  ];
  // en desarrollo la UI vive en el puerto de Vite y llama al API por proxy,
  // pero el WebSocket sí sale con ese origen
  origins.push("http://localhost:5173", "http://127.0.0.1:5173");
  if (cfg.lanAccess) origins.push(...lanUrls(cfg.port));
  return origins;
}

/** ¿La petición llega por la interfaz de loopback? */
export function isLoopback(req: FastifyRequest): boolean {
  const addr = req.socket.remoteAddress ?? "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

/**
 * Rechaza peticiones con un `Origin` que no sea el nuestro. Las peticiones sin
 * `Origin` (curl, la propia app en navegación normal) se dejan pasar: el
 * ataque que nos preocupa es el de una página web, y el navegador **siempre**
 * envía `Origin` en las peticiones cross-origin.
 */
export function checkOrigin(req: FastifyRequest, cfg: NebulaConfig): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  return allowedOrigins(cfg).includes(origin);
}

/** 403 si la acción no viene de esta misma máquina. */
export function requireLoopback(req: FastifyRequest, reply: FastifyReply): boolean {
  if (isLoopback(req)) return true;
  void reply.code(403).send({
    error: "Esta acción solo puede lanzarse desde el propio equipo, no desde la red local.",
  });
  return false;
}

/** Marcador que el cliente reenvía cuando no ha tocado un token. */
export const MASKED_TOKEN = "••••••••";

// ---------- Validación de la configuración ----------

const STRING_ARRAY = (v: unknown): boolean => Array.isArray(v) && v.every((x) => typeof x === "string");
const isInt = (v: unknown, min: number, max: number): boolean =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

/**
 * Lista blanca de claves con su validador. `PUT /api/config` volcaba
 * `req.body` tal cual, así que cualquiera podía inyectar campos o activar
 * `lanAccess`. Lo que no esté aquí se descarta en silencio.
 */
const VALIDATORS: Record<string, (v: unknown) => boolean> = {
  roots: STRING_ARRAY,
  excludes: STRING_ARRAY,
  scanDepth: (v) => isInt(v, 1, 5),
  autoFetchMinutes: (v) => isInt(v, 0, 720),
  syncMinutes: (v) => isInt(v, 1, 120),
  port: (v) => isInt(v, 1024, 65535),
  lanAccess: (v) => typeof v === "boolean",
  notifications: (v) => typeof v === "boolean",
  editorCommand: (v) => typeof v === "string" && v.length <= 200,
  browserCommand: (v) => typeof v === "string" && v.length <= 200,
  notificationEvents: (v) =>
    typeof v === "object" && v !== null && Object.values(v).every((x) => typeof x === "boolean"),
  integrations: (v) => typeof v === "object" && v !== null,
};

/** Devuelve solo los campos válidos, o un error si alguno viene mal formado. */
export function sanitizeConfigPatch(body: unknown): { ok: true; value: Partial<NebulaConfig> } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "cuerpo inválido" };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    const validate = VALIDATORS[key];
    if (!validate) continue; // clave desconocida: se ignora
    if (!validate(value)) return { ok: false, error: `valor inválido para «${key}»` };
    out[key] = value;
  }
  return { ok: true, value: out as Partial<NebulaConfig> };
}

/** Config para enviar al cliente: ningún secreto viaja en claro. */
export function redactConfig(
  cfg: NebulaConfig,
): NebulaConfig & { hasJiraToken: boolean; hasGithubToken: boolean } {
  const jira = cfg.integrations?.jira;
  const github = cfg.integrations?.github;
  const integrations = { ...cfg.integrations };
  if (jira) integrations.jira = { ...jira, token: jira.token ? MASKED_TOKEN : "" };
  if (github) integrations.github = { ...github, token: github.token ? MASKED_TOKEN : "" };
  return {
    ...cfg,
    integrations,
    hasJiraToken: Boolean(jira?.token),
    hasGithubToken: Boolean(github?.token),
  };
}
