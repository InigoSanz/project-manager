/**
 * Concordancia de número: «1 tarea» / «2 tareas».
 * El plural irregular se pasa explícito cuando no basta con añadir una «s».
 */
export function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

/** Solo la palabra, sin el número delante. */
export function pluralWord(n: number, singular: string, pluralForm?: string): string {
  return n === 1 ? singular : (pluralForm ?? `${singular}s`);
}
