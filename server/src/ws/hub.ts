import type { WsEvent } from "@nebula/shared";

/** Tipo estructural mínimo para no depender de los tipos de `ws` (dep transitiva). */
export interface SocketLike {
  readonly OPEN: number;
  readyState: number;
  send(data: string): void;
  on(event: "close" | "error", cb: () => void): void;
}

/** Difusión de eventos a todos los clientes conectados. */
export class WsHub {
  private clients = new Set<SocketLike>();

  add(socket: SocketLike): void {
    this.clients.add(socket);
    socket.on("close", () => this.clients.delete(socket));
    socket.on("error", () => this.clients.delete(socket));
  }

  broadcast(event: WsEvent): void {
    const msg = JSON.stringify(event);
    for (const c of this.clients) {
      if (c.readyState === c.OPEN) c.send(msg);
    }
  }

  get size(): number {
    return this.clients.size;
  }
}
