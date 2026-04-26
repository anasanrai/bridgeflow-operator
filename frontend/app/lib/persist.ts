"use client";

/** localStorage helpers used by the pipeline page so a run survives
 *  navigation away from /pipeline. SSR-safe: every call no-ops on the
 *  server. Failures (quota / private-mode Safari) are swallowed — the
 *  feature is nice-to-have, not critical-path.
 */

export function loadPersisted<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function savePersisted<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function clearPersisted(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
