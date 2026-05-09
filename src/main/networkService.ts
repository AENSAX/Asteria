import { session } from "electron";
import type { NetworkSettings } from "../shared/ipc.js";

export async function applyNetworkSettings(
  settings: NetworkSettings,
): Promise<void> {
  const proxyRules = createProxyRules(settings);

  await session.defaultSession.setProxy({
    proxyRules,
  });
}

function createProxyRules(settings: NetworkSettings): string {
  const host = normalizeProxyHost(settings.proxyHost);

  if (!settings.proxyEnabled || !host || !settings.proxyPort) {
    return "direct://";
  }

  return `http=${host}:${settings.proxyPort};https=${host}:${settings.proxyPort}`;
}

function normalizeProxyHost(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/g, "");
}
