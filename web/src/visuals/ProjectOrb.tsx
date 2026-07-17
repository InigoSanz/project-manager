import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { VisualDNA } from "./dna";
import { rng } from "./dna";
import "./NebulaMaterial";
import type { NebulaMaterialImpl } from "./NebulaMaterial";

export type Quality = "high" | "lite";

interface Props {
  dna: VisualDNA;
  /** multiplicador de escala (hover, hero...) */
  scale?: number;
  /** pulso extra 0..1 (actividad de agente en vivo) */
  livePulse?: number;
  /** lite = móvil/táctil: menos geometría y partículas, mismo look */
  quality?: Quality;
}

function geometryFor(dna: VisualDNA, quality: Quality): THREE.BufferGeometry {
  const lite = quality === "lite";
  switch (dna.shape) {
    case "torus":
      return new THREE.TorusKnotGeometry(dna.radius * 0.72, dna.radius * 0.26, lite ? 120 : 220, lite ? 20 : 36);
    case "crystal":
      return new THREE.IcosahedronGeometry(dna.radius, 1);
    case "cloud":
      return new THREE.SphereGeometry(dna.radius, lite ? 48 : 96, lite ? 48 : 96);
    case "rings":
    case "sphere":
    default:
      return new THREE.SphereGeometry(dna.radius, lite ? 64 : 128, lite ? 64 : 128);
  }
}

/** Anillo de partículas orbitando (energía del proyecto). */
function OrbitingParticles({ dna, quality }: { dna: VisualDNA; quality: Quality }) {
  const points = useRef<THREE.Points>(null);
  const count = quality === "lite" ? Math.ceil(dna.particleCount / 2) : dna.particleCount;
  const { positions, sizes } = useMemo(() => {
    const r = rng(dna.seed ^ 0x51ed270b);
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const angle = r() * Math.PI * 2;
      const rad = dna.radius * (1.5 + r() * 1.6);
      const y = (r() - 0.5) * dna.radius * 0.9;
      positions[i * 3] = Math.cos(angle) * rad;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(angle) * rad;
      sizes[i] = 0.5 + r();
    }
    return { positions, sizes };
  }, [dna, count]);

  useFrame((_, delta) => {
    if (points.current) points.current.rotation.y += delta * dna.speed * 0.35;
  });

  const color = useMemo(() => new THREE.Color(dna.colors[0]).lerp(new THREE.Color("#ffffff"), 0.35), [dna]);

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={0.035}
        transparent
        opacity={0.85}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

export function ProjectOrb({ dna, scale = 1, livePulse = 0, quality = "high" }: Props) {
  const material = useRef<NebulaMaterialImpl>(null);
  const group = useRef<THREE.Group>(null);
  const geometry = useMemo(() => geometryFor(dna, quality), [dna, quality]);
  const colors = useMemo(
    () => dna.colors.map((c) => new THREE.Color(c)) as [THREE.Color, THREE.Color, THREE.Color, THREE.Color],
    [dna],
  );

  useFrame((state, delta) => {
    if (material.current) {
      material.current.uTime = state.clock.elapsedTime + dna.phase * 10;
      const targetGlow = Math.min(dna.glow + livePulse * 0.45, 1.25);
      material.current.uGlow = THREE.MathUtils.lerp(material.current.uGlow, targetGlow, 0.08);
    }
    if (group.current) {
      group.current.rotation.y += delta * dna.speed * 0.12;
      const breathe = 1 + Math.sin(performance.now() / 1400 + dna.phase) * 0.015 * (1 + dna.speed);
      group.current.scale.setScalar(scale * breathe);
    }
  });

  return (
    <group ref={group}>
      <mesh geometry={geometry}>
        <nebulaMaterial
          ref={material}
          uSeed={(dna.seed % 1000) / 37}
          uSpeed={dna.speed}
          uNoiseScale={dna.noiseScale}
          uDistortion={dna.distortion}
          uGlow={dna.glow}
          uColorCount={dna.colorCount}
          uColorA={colors[0]}
          uColorB={colors[1]}
          uColorC={colors[2]}
          uColorD={colors[3]}
          uFlat={dna.shape === "crystal" ? 1 : 0}
        />
      </mesh>
      {dna.shape === "rings" && (
        <mesh rotation={[Math.PI / 2.4, 0, 0]}>
          <torusGeometry args={[dna.radius * 1.7, 0.015, 8, 128]} />
          <meshBasicMaterial color={dna.colors[1]} transparent opacity={0.6} />
        </mesh>
      )}
      <OrbitingParticles dna={dna} quality={quality} />
    </group>
  );
}
