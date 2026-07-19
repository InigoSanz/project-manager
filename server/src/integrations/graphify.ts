import fs from "node:fs";
import path from "node:path";
import type { KnowledgeGraph } from "@nebula/shared";

const MAX_NODES = 600;

/**
 * Graphify (github.com/safishamsi/graphify) escribe su salida en
 * <repo>/graphify-out/graph.json — nodos (con degree/community) y aristas
 * (calls, imports, ... con confianza EXTRACTED/INFERRED).
 */
export function readGraph(repoPath: string): KnowledgeGraph | null {
  const file = path.join(repoPath, "graphify-out", "graph.json");
  let raw: string;
  let mtime: Date;
  try {
    raw = fs.readFileSync(file, "utf8");
    mtime = fs.statSync(file).mtime;
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(raw);
    const rawNodes: any[] = data.nodes ?? [];
    const rawEdges: any[] = data.edges ?? data.links ?? [];

    // grado real sobre TODAS las aristas: así el recorte a los más conectados
    // es significativo aunque el fichero no traiga un campo `degree`
    const rawDegree = new Map<string, number>();
    for (const e of rawEdges) {
      const s = String(e.source ?? e.from ?? "");
      const t = String(e.target ?? e.to ?? "");
      rawDegree.set(s, (rawDegree.get(s) ?? 0) + 1);
      rawDegree.set(t, (rawDegree.get(t) ?? 0) + 1);
    }
    const degreeOf = (n: any): number => n.degree ?? rawDegree.get(nodeId(n)) ?? 0;

    // limitar por grado para que el render siga fluido en grafos enormes
    const sorted = [...rawNodes].sort((a, b) => degreeOf(b) - degreeOf(a)).slice(0, MAX_NODES);
    const keep = new Set(sorted.map((n) => nodeId(n)));

    const links = rawEdges
      .map((e) => ({
        source: String(e.source ?? e.from ?? ""),
        target: String(e.target ?? e.to ?? ""),
        type: String(e.type ?? e.relation ?? "rel"),
      }))
      .filter((e) => keep.has(e.source) && keep.has(e.target));

    // grado dentro del grafo ya recortado: es lo que dimensiona cada estrella,
    // así se cuenta solo sobre las aristas que de verdad se van a dibujar
    const degrees = new Map<string, number>();
    for (const e of links) {
      degrees.set(e.source, (degrees.get(e.source) ?? 0) + 1);
      degrees.set(e.target, (degrees.get(e.target) ?? 0) + 1);
    }

    const nodes = sorted.map((n) => {
      const id = nodeId(n);
      return {
        id,
        label: String(n.label ?? n.name ?? n.id ?? "?"),
        // Graphify no marca un "kind" de símbolo; su `file_type`
        // (code/concept/document) es lo más cercano a una categoría útil
        type: String(n.type ?? n.kind ?? n.file_type ?? "node"),
        group: n.community !== undefined ? String(n.community) : undefined,
        degree: degrees.get(id) ?? 0,
      };
    });

    return { nodes, links, generatedAt: mtime.toISOString() };
  } catch {
    return null;
  }
}

function nodeId(n: any): string {
  return String(n.id ?? n.name ?? n.label ?? "");
}
