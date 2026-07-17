import { Suspense, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import { Float, Html, OrbitControls, Stars } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import type { Project } from "@nebula/shared";
import { constellationPosition, deriveDNA } from "../visuals/dna";
import { ProjectOrb } from "../visuals/ProjectOrb";

function OrbNode({ project, index, live }: { project: Project; index: number; live: boolean }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const dna = useMemo(() => deriveDNA(project), [project]);
  const position = useMemo(() => constellationPosition(index, dna.seed), [index, dna.seed]);
  const git = project.git;

  return (
    <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.6} position={position}>
      <group
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/project/${project.id}`);
        }}
      >
        <ProjectOrb dna={dna} scale={hovered ? 1.18 : 1} livePulse={live ? 1 : 0} />
        <Html center distanceFactor={12} position={[0, -dna.radius * 1.9, 0]} style={{ pointerEvents: "none" }}>
          <div
            className={`transition-all duration-300 text-center select-none ${
              hovered ? "opacity-100 scale-100" : "opacity-70 scale-90"
            }`}
          >
            <div className="font-semibold text-white text-sm tracking-wide whitespace-nowrap drop-shadow-[0_0_8px_rgba(0,0,0,0.9)]">
              {project.name}
            </div>
            {hovered && (
              <div className="text-[10px] text-slate-300 whitespace-nowrap mt-0.5">
                {git && (
                  <>
                    {git.branch ?? "detached"}
                    {git.ahead > 0 && ` ↑${git.ahead}`}
                    {git.behind > 0 && ` ↓${git.behind}`}
                    {!git.clean && " ● cambios"}
                  </>
                )}
                {project.tasks.open + project.tasks.suggested > 0 && (
                  <span className="ml-1.5 text-sky-300">☰ {project.tasks.open + project.tasks.suggested} tareas</span>
                )}
              </div>
            )}
          </div>
        </Html>
      </group>
    </Float>
  );
}

export function Galaxy({ projects, liveActivity }: { projects: Project[]; liveActivity: Record<string, number> }) {
  const now = Date.now();
  return (
    <Canvas camera={{ position: [0, 4, 16], fov: 50 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={["#05060f"]} />
      <fog attach="fog" args={["#05060f", 22, 46]} />
      <ambientLight intensity={0.4} />
      <Suspense fallback={null}>
        <Stars radius={90} depth={50} count={4500} factor={4} saturation={0.4} fade speed={0.6} />
        {projects.map((p, i) => (
          <OrbNode key={p.id} project={p} index={i} live={now - (liveActivity[p.id] ?? 0) < 60_000} />
        ))}
        <EffectComposer>
          <Bloom intensity={1.25} luminanceThreshold={0.18} luminanceSmoothing={0.85} mipmapBlur />
          <Vignette eskil={false} offset={0.15} darkness={0.9} />
        </EffectComposer>
      </Suspense>
      <OrbitControls
        enablePan={false}
        minDistance={6}
        maxDistance={34}
        autoRotate
        autoRotateSpeed={0.35}
        enableDamping
        dampingFactor={0.06}
      />
    </Canvas>
  );
}
