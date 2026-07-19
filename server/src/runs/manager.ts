import { spawn, execFile, type ChildProcess } from "node:child_process";
import type { RunInfo, RunOutputChunk } from "@nebula/shared";

/**
 * Lanza scripts de package.json y transmite su salida en vivo.
 *
 * Notas de Windows: `pnpm`/`npm` son ficheros `.cmd`, y desde Node 20.12 no se
 * pueden lanzar sin shell, así que hace falta `shell: true`. Para que eso sea
 * seguro, el nombre del script **nunca** llega como texto libre: quien llama
 * debe haberlo validado contra las claves reales del package.json.
 */

const MAX_LINES = 500; // búfer por ejecución, para reconectar sin perder el hilo
const FLUSH_MS = 80; // agrupado de salida: evita un mensaje WS por cada línea

interface Run {
  info: RunInfo;
  child: ChildProcess;
  buffer: string[];
  pending: RunOutputChunk[];
  flushTimer: NodeJS.Timeout | null;
}

export interface RunEvents {
  onStarted: (info: RunInfo) => void;
  onOutput: (runId: string, chunks: RunOutputChunk[]) => void;
  onExited: (info: RunInfo) => void;
}

/** Detecta la URL que imprime un servidor de desarrollo, para ofrecer el enlace. */
const URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?[^\s"']*/i;

export class RunManager {
  private runs = new Map<string, Run>();
  private seq = 0;

  constructor(private events: RunEvents) {}

  list(): RunInfo[] {
    return [...this.runs.values()].map((r) => r.info);
  }

  get(runId: string): { info: RunInfo; output: string[] } | null {
    const run = this.runs.get(runId);
    return run ? { info: run.info, output: [...run.buffer] } : null;
  }

  /** ¿Hay ya una ejecución viva de este script en este proyecto? */
  private findLive(projectId: string, script: string): Run | undefined {
    return [...this.runs.values()].find(
      (r) => r.info.projectId === projectId && r.info.script === script && r.info.status === "running",
    );
  }

  start(params: {
    projectId: string;
    projectName: string;
    cwd: string;
    script: string;
    packageManager: string;
  }): { ok: true; info: RunInfo } | { ok: false; error: string } {
    const existing = this.findLive(params.projectId, params.script);
    if (existing) return { ok: false, error: `«${params.script}» ya se está ejecutando en este proyecto.` };

    const runId = `run-${++this.seq}-${Date.now().toString(36)}`;
    const info: RunInfo = {
      id: runId,
      projectId: params.projectId,
      projectName: params.projectName,
      script: params.script,
      command: `${params.packageManager} run ${params.script}`,
      status: "running",
      startedAt: new Date().toISOString(),
      endedAt: null,
      exitCode: null,
      url: null,
    };

    // shell obligado por los .cmd; el script ya viene validado por el llamante
    const child = spawn(`${params.packageManager} run ${params.script}`, [], {
      cwd: params.cwd,
      shell: true,
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    const run: Run = { info, child, buffer: [], pending: [], flushTimer: null };
    this.runs.set(runId, run);

    const ingest = (stream: "stdout" | "stderr") => (data: Buffer) => {
      const text = data.toString();
      for (const line of text.split(/\r?\n/)) {
        if (!line) continue;
        run.buffer.push(line);
        if (run.buffer.length > MAX_LINES) run.buffer.shift();
        run.pending.push({ stream, line });
        // la primera URL local que aparezca es la del servidor de desarrollo
        if (!run.info.url) {
          const m = line.match(URL_RE);
          if (m) run.info.url = m[0];
        }
      }
      this.scheduleFlush(run);
    };
    child.stdout?.on("data", ingest("stdout"));
    child.stderr?.on("data", ingest("stderr"));

    child.on("error", (err) => {
      run.pending.push({ stream: "stderr", line: `No se pudo lanzar: ${err.message}` });
      this.finish(run, null);
    });
    child.on("exit", (code) => this.finish(run, code));

    this.events.onStarted(info);
    return { ok: true, info };
  }

  private scheduleFlush(run: Run): void {
    if (run.flushTimer) return;
    run.flushTimer = setTimeout(() => {
      run.flushTimer = null;
      if (run.pending.length === 0) return;
      const chunks = run.pending.splice(0, run.pending.length);
      this.events.onOutput(run.info.id, chunks);
    }, FLUSH_MS);
  }

  private finish(run: Run, code: number | null): void {
    if (run.info.status !== "running") return;
    if (run.flushTimer) {
      clearTimeout(run.flushTimer);
      run.flushTimer = null;
    }
    if (run.pending.length > 0) {
      this.events.onOutput(run.info.id, run.pending.splice(0, run.pending.length));
    }
    run.info.status = code === 0 ? "done" : "failed";
    run.info.exitCode = code;
    run.info.endedAt = new Date().toISOString();
    this.events.onExited(run.info);
  }

  /**
   * Mata el proceso y **toda su descendencia**: en Windows matar `pnpm` no
   * mata al `node`/`vite` que ha lanzado, así que hace falta taskkill /T.
   */
  stop(runId: string): boolean {
    const run = this.runs.get(runId);
    if (!run || run.info.status !== "running") return false;
    killTree(run.child);
    return true;
  }

  /** Cierra todo al apagar el daemon: sin esto quedarían procesos huérfanos. */
  stopAll(): void {
    for (const run of this.runs.values()) {
      if (run.info.status === "running") killTree(run.child);
    }
  }

  /** Descarta las ejecuciones terminadas (para no acumular búferes). */
  clearFinished(): void {
    for (const [id, run] of this.runs) {
      if (run.info.status !== "running") this.runs.delete(id);
    }
  }
}

function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  if (process.platform === "win32") {
    execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {
      /* si ya había muerto, da igual */
    });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}
