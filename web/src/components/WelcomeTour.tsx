import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const TOUR_KEY = "nebula:tour-v2";

const STEPS = [
  {
    icon: "🪐",
    title: "Un mapa espacial, un planeta por repo",
    body: "Cada carpeta raíz que configures es una zona del mapa, y cada planeta uno de tus repositorios: su superficie viene de tus lenguajes y suelta partículas cuando un agente de IA trabaja dentro. Click para entrar, doble click para encuadrar una zona.",
  },
  {
    icon: "◔",
    title: "«Hoy»: todo lo accionable en un sitio",
    body: "Pulsa la tecla T (o el botón ◔ Hoy): tus tareas de todos los proyectos, issues de Jira/Planner, avisos de git y agentes activos. Completa con un click.",
  },
  {
    icon: "⌨",
    title: "Ctrl+K para todo lo demás",
    body: "Busca proyectos y tareas, o crea una al vuelo: «preparar demo @portfolio !alta ^vie». La ayuda completa siempre está en la tecla ?",
  },
];

/** Se muestra solo la primera vez; Saltar, Esc o click fuera lo cierran para siempre. */
export function WelcomeTour() {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    if (!localStorage.getItem(TOUR_KEY)) setStep(0);
    const onReopen = (): void => setStep(0);
    window.addEventListener("nebula:open-tour", onReopen);
    return () => window.removeEventListener("nebula:open-tour", onReopen);
  }, []);

  const dismiss = (): void => {
    localStorage.setItem(TOUR_KEY, "1");
    setStep(null);
  };

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  return (
    <AnimatePresence>
      {step !== null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={dismiss}
        >
          <motion.div
            key={step}
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            className="glass-raised w-full max-w-md rounded-2xl p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-4xl">{STEPS[step].icon}</p>
            <h2 className="mt-3 font-display text-lg font-bold text-white">{STEPS[step].title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{STEPS[step].body}</p>

            <div className="mt-5 flex items-center justify-center gap-1.5">
              {STEPS.map((_, i) => (
                <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-indigo-400" : "bg-white/15"}`} />
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <button onClick={dismiss} className="px-2 py-2 text-xs text-slate-500 hover:text-white">
                Saltar
              </button>
              <button
                onClick={() => (step < STEPS.length - 1 ? setStep(step + 1) : dismiss())}
                className="rounded-lg bg-indigo-500/30 px-5 py-2 text-sm text-white hover:bg-indigo-500/45"
              >
                {step < STEPS.length - 1 ? "Siguiente" : "¡Al mapa!"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
