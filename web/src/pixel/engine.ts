export interface EngineOpts {
  /** paso de simulación a timestep fijo (dt en segundos, siempre 1/60) */
  update: (dt: number) => void;
  /** dibujo de un frame (alpha = fracción interpolable del paso pendiente) */
  render: (alpha: number) => void;
}

const STEP = 1 / 60;
const MAX_STEPS = 5; // evita la espiral de la muerte tras una pausa larga

/**
 * Bucle rAF con timestep fijo. `start`/`stop` son idempotentes: crítico para
 * el doble montaje de StrictMode. Se pausa solo con la pestaña oculta
 * (rAF deja de dispararse) y al volver descarta el tiempo acumulado.
 */
export class PixelEngine {
  private raf = 0;
  private running = false;
  private last = 0;
  private acc = 0;

  constructor(private opts: EngineOpts) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number): void => {
      if (!this.running) return;
      let elapsed = (now - this.last) / 1000;
      this.last = now;
      // tras una pausa (pestaña oculta), no intentes "recuperar" el tiempo
      if (elapsed > STEP * MAX_STEPS) elapsed = STEP * MAX_STEPS;
      this.acc += elapsed;
      let steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.opts.update(STEP);
        this.acc -= STEP;
        steps++;
      }
      this.opts.render(this.acc / STEP);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
