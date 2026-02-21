export function safeParseJson<T>(value: string, fallback: T): T {
  try {
    const parsed = JSON.parse(value) as T;
    return parsed;
  } catch {
    return fallback;
  }
}

export function toJsonString(value: unknown): string {
  return JSON.stringify(value);
}
