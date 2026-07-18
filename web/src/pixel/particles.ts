import type { SceneNode } from "./scene";
import { shade } from "./palette";

interface Spark {
  nodeId: string;
  angle: number;
  /** distancia orbital relativa al radio del cuerpo */
  orbit: number;
  speed: number;
  size: number;
  color: string;
  phase: number;
  /** 0..1, sube al nacer y baja cuando el nodo deja de estar vivo */
  life: number;
}

const PER_NODE = 7;

/**
 * Chispas orbitando los planetas con un agente trabajando ahora mismo.
 * Nacen y mueren suavemente con el pulso del nodo; cap global de seguridad.
 */
export class ParticleSystem {
  private sparks: Spark[] = [];

  constructor(private cap: number) {}

  update(dt: number, nodes: SceneNode[]): void {
    const liveIds = new Set(nodes.filter((n) => n.live).map((n) => n.project.id));

    // nacer: hasta PER_NODE por nodo vivo, respetando el cap global
    for (const node of nodes) {
      if (!node.live) continue;
      const mine = this.sparks.filter((s) => s.nodeId === node.project.id).length;
      if (mine >= PER_NODE || this.sparks.length >= this.cap) continue;
      this.sparks.push({
        nodeId: node.project.id,
        angle: Math.random() * Math.PI * 2,
        orbit: 1.35 + Math.random() * 0.9,
        speed: (0.8 + Math.random() * 1.4) * (Math.random() < 0.5 ? 1 : -1),
        size: Math.random() < 0.75 ? 1 : 2,
        color: Math.random() < 0.4 ? "#f0f4ff" : shade(node.dna.colors[0], 1),
        phase: Math.random() * Math.PI * 2,
        life: 0,
      });
    }

    for (const s of this.sparks) {
      s.angle += s.speed * dt;
      const target = liveIds.has(s.nodeId) ? 1 : 0;
      s.life += (target - s.life) * Math.min(1, dt * 2.5);
    }
    this.sparks = this.sparks.filter((s) => s.life > 0.02 || liveIds.has(s.nodeId));
  }

  /** `ctx` con la transform de cámara (mundo). */
  render(ctx: CanvasRenderingContext2D, nodes: SceneNode[], time: number): void {
    if (this.sparks.length === 0) return;
    const byId = new Map(nodes.map((n) => [n.project.id, n]));
    for (const s of this.sparks) {
      const node = byId.get(s.nodeId);
      if (!node) continue;
      const r = node.sheet.bodyRadius * s.orbit;
      const x = node.x + Math.cos(s.angle) * r;
      // misma elipse que las lunas: chispas y satélites comparten plano orbital
      const y = node.y + Math.sin(s.angle) * r * 0.42;
      const blink = 0.55 + 0.45 * Math.sin(time * 6 + s.phase);
      ctx.globalAlpha = s.life * blink;
      ctx.fillStyle = s.color;
      ctx.fillRect(Math.round(x), Math.round(y), s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }
}
