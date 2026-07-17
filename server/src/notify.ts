import notifier from "node-notifier";
import type { NotificationEvents } from "@nebula/shared";
import { loadConfig } from "./config.js";
import type { DB } from "./db/index.js";

export type NotifyEvent = keyof NotificationEvents;

/**
 * Notificaciones nativas de Windows (toasts vía node-notifier/SnoreToast).
 * Deduplicadas en la tabla `notified`; nunca rompen el daemon.
 */
export class Notifier {
  constructor(
    private db: DB,
    private port: number,
  ) {}

  private enabled(event: NotifyEvent): boolean {
    const cfg = loadConfig();
    if (cfg.notifications === false) return false;
    return cfg.notificationEvents?.[event] !== false;
  }

  /** true si es la primera vez que se notifica este id (y lo registra). */
  private firstTime(id: string): boolean {
    const changes = this.db
      .prepare(`INSERT OR IGNORE INTO notified (id, at) VALUES (?, ?)`)
      .run(id, new Date().toISOString()).changes;
    return changes > 0;
  }

  /** Marca ids como ya conocidos SIN notificar (línea base del primer sync). */
  baseline(ids: string[]): void {
    const ins = this.db.prepare(`INSERT OR IGNORE INTO notified (id, at) VALUES (?, ?)`);
    const now = new Date().toISOString();
    for (const id of ids) ins.run(id, now);
  }

  hasBaseline(prefix: string): boolean {
    return Boolean(this.db.prepare(`SELECT 1 FROM notified WHERE id LIKE ? LIMIT 1`).get(`${prefix}%`));
  }

  send(event: NotifyEvent, dedupId: string, title: string, message: string): void {
    if (!this.enabled(event) || !this.firstTime(dedupId)) return;
    try {
      // appID es específico de WindowsToaster y no está en los tipos genéricos
      const options = {
        title,
        message: message.slice(0, 200),
        appID: "Nebula",
        open: `http://localhost:${this.port}`,
      } as notifier.Notification;
      notifier.notify(options, (err) => {
        if (err) console.warn("[notify]", (err as Error).message ?? err);
      });
    } catch (err) {
      console.warn("[notify] no disponible:", (err as Error).message);
    }
  }

  /** Aviso diario de vencimientos (dedup por día). */
  dueTodayDigest(count: number): void {
    if (count <= 0) return;
    const today = new Date().toISOString().slice(0, 10);
    this.send("dueDigest", `digest:${today}`, "⏱ Vencimientos de hoy", `Te vence${count === 1 ? "" : "n"} ${count} tarea${count === 1 ? "" : "s"} hoy. Pulsa para verlas.`);
  }
}
