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

    // limitar por grado para que el render siga fluido en grafos enormes
    const sorted = [...rawNodes].sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0)).slice(0, MAX_NODES);
    const keep = new Set(sorted.map((n) => nodeId(n)));

    const nodes = sorted.map((n) => ({
      id: nodeId(n),
      label: String(n.label ?? n.name ?? n.id ?? "?"),
      type: String(n.type ?? n.kind ?? "node"),
      group: n.community !== undefined ? String(n.community) : undefined,
    }));
    const links = rawEdges
      .map((e) => ({
        source: String(e.source ?? e.from ?? ""),
        target: String(e.target ?? e.to ?? ""),
        type: String(e.type ?? e.relation ?? "rel"),
      }))
      .filter((e) => keep.has(e.source) && keep.has(e.target));

    return { nodes, links, generatedAt: mtime.toISOString() };
  } catch {
    return null;
  }
}

function nodeId(n: any): string {
  return String(n.id ?? n.name ?? n.label ?? "");
}
