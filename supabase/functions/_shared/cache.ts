// Edge port di packages/shared/supabase/cache.ts — cache in memoria TTL.
// Si azzera tra invocazioni a freddo della Edge Function (ok: best-effort).
interface CacheEntry<T> { data: T; timestamp: number }

export class SimpleCache<T> {
  private store = new Map<string, CacheEntry<T>>()
  private ttlMs: number

  constructor(ttlMinutes = 60) {
    this.ttlMs = ttlMinutes * 60 * 1000
  }

  get(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.store.delete(key)
      return null
    }
    return entry.data
  }

  set(key: string, data: T): void {
    this.store.set(key, { data, timestamp: Date.now() })
  }

  static key(...parts: string[]): string {
    return parts.join(':').toLowerCase().replace(/\s+/g, '_')
  }
}
