import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

export function loadDevelopmentEnv(): void {
  if (process.defaultApp !== true && process.env.NODE_ENV === 'production') {
    return;
  }

  const envPath = join(process.cwd(), '.env');

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const entry = parseEnvLine(line);

    if (!entry || process.env[entry.key] !== undefined) {
      continue;
    }

    process.env[entry.key] = entry.value;
  }
}

export function configureDevelopmentAppPaths(): void {
  if (app.isPackaged) {
    return;
  }

  const userDataPath = process.env.ASTERIA_DEV_USER_DATA_PATH?.trim();

  if (!userDataPath) {
    return;
  }

  app.setPath('userData', userDataPath);
  mkdirSync(userDataPath, { recursive: true });
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const separatorIndex = trimmed.indexOf('=');

  if (separatorIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  const value = trimEnvValue(trimmed.slice(separatorIndex + 1).trim());

  return key ? { key, value } : null;
}

function trimEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
