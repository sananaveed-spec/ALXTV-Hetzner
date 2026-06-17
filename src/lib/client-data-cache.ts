const CLOCKIFY_STORAGE_KEY = "alx-tv-clockify-snapshot";
const GOOGLE_SHEET_STORAGE_KEY = "alx-tv-google-sheet";

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage failures (private mode / quota)
  }
}

export function readStoredClockifySnapshot<T>(): T | null {
  return readJson<T>(CLOCKIFY_STORAGE_KEY);
}

export function writeStoredClockifySnapshot<T>(value: T): void {
  writeJson(CLOCKIFY_STORAGE_KEY, value);
}

export function readStoredGoogleSheet<T>(): T | null {
  return readJson<T>(GOOGLE_SHEET_STORAGE_KEY);
}

export function writeStoredGoogleSheet<T>(value: T): void {
  writeJson(GOOGLE_SHEET_STORAGE_KEY, value);
}
