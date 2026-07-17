import { useEffect, useState } from "react";

/** Suscripción reactiva a una media query. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent): void => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Dispositivo táctil (dedo como puntero principal). */
export function useIsTouch(): boolean {
  return useMediaQuery("(pointer: coarse)");
}

/** Pantalla de móvil (mismo umbral que el breakpoint sm de Tailwind). */
export function useIsSmallScreen(): boolean {
  return useMediaQuery("(max-width: 639px)");
}
