import { useEffect, useRef } from "react";
import type { Project } from "@nebula/shared";
import { deriveDNA } from "../visuals/dna";
import { PixelEngine } from "../pixel/engine";
import { generateSpriteSheet } from "../pixel/sprites";

/**
 * Un único planeta pixel-art (hero de proyecto, avatares del grid).
 * El canvas interno mide un frame del sprite y se escala por CSS con
 * `image-rendering: pixelated`; con `animate` gira con su propio bucle.
 */
export function PixelPlanet({
  project,
  size = 160,
  live = false,
  animate = true,
  className = "",
}: {
  project: Project;
  /** lado en px CSS del canvas mostrado */
  size?: number;
  live?: boolean;
  animate?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dna = deriveDNA(project);
    const sheet = generateSpriteSheet(dna, animate ? 16 : 8);
    const cell = sheet.frameSize;
    canvas.width = cell;
    canvas.height = cell;
    ctx.imageSmoothingEnabled = false;

    let frameAcc = dna.phase * 2;
    let time = 0;
    const draw = (): void => {
      ctx.clearRect(0, 0, cell, cell);
      const frame = Math.floor(frameAcc) % sheet.frames;
      ctx.drawImage(sheet.canvas, frame * cell, 0, cell, cell, 0, 0, cell, cell);
      if (liveRef.current) {
        const beat = 0.5 + 0.5 * Math.sin(time * 5 + dna.phase);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.2 + 0.35 * beat;
        ctx.drawImage(sheet.canvas, frame * cell, 0, cell, cell, 0, 0, cell, cell);
        ctx.restore();
      }
    };

    if (!animate) {
      draw();
      return;
    }
    const engine = new PixelEngine({
      update: (dt) => {
        frameAcc += dt * (1.5 + dna.speed * 5);
        time += dt;
      },
      render: draw,
    });
    engine.start();
    return () => engine.stop();
  }, [project, animate]);

  return (
    <canvas
      ref={canvasRef}
      className={`pixelated ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
