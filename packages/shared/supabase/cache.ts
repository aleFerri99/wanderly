// ============================================================
// cache.ts — Cache in memoria generica (TTL-based)
// OpenTripMap permette esplicitamente il caching dei risultati.
// Ogni modulo crea la propria istanza con il TTL appropriato.
// Si azzera al riavvio del processo server (ok per dev e Vercel functions).
// ============================================================

interface CacheEntry<T> {
  data:      T
  timestamp: number
}

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

  /** Genera una chiave normalizzata da più parti */
  static key(...parts: string[]): string {
    return parts.join(':').toLowerCase().replace(/\s+/g, '_')
  }
}
