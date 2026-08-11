import { isTauri } from "./env"

let _tauriFetch: typeof fetch | null = null

export async function getTauriFetch(): Promise<typeof fetch | undefined> {
  if (!isTauri()) return undefined
  if (_tauriFetch) return _tauriFetch
  const { fetch: tFetch } = await import("@tauri-apps/plugin-http")
  _tauriFetch = tFetch as unknown as typeof fetch
  return _tauriFetch
}
