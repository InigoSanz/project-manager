import os from "node:os";

/** URLs de la app en las IPs IPv4 locales no internas (wifi/ethernet). */
export function lanUrls(port: number): string[] {
  const urls: string[] = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      if (iface.address.startsWith("169.254.")) continue; // link-local: inservible
      urls.push(`http://${iface.address}:${port}`);
    }
  }
  // primero las redes domésticas típicas (la wifi suele ser 192.168.x)
  return urls.sort((a, b) => Number(b.includes("//192.168.")) - Number(a.includes("//192.168.")));
}
