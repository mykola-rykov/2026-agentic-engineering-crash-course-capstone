export class BoundedCache<T> {
  private readonly values = new Map<string, { value: T; bytes: number }>();
  private bytes = 0;
  constructor(readonly maxBytes: number) { if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('Invalid cache budget.'); }
  get(key: string) { const entry = this.values.get(key); if (!entry) return undefined; this.values.delete(key); this.values.set(key, entry); return entry.value; }
  set(key: string, value: T, bytes: number) {
    const accounted = bytes + key.length * 2 + 128;
    if (!Number.isSafeInteger(accounted) || accounted < 0 || accounted > this.maxBytes) return;
    const previous = this.values.get(key); if (previous) { this.bytes -= previous.bytes; this.values.delete(key); }
    while (this.bytes + accounted > this.maxBytes) { const oldest = this.values.keys().next().value; if (oldest === undefined) break; this.bytes -= this.values.get(oldest)!.bytes; this.values.delete(oldest); }
    this.values.set(key, { value, bytes: accounted }); this.bytes += accounted;
  }
  stats() { return { bytes: this.bytes, entries: this.values.size, maxBytes: this.maxBytes }; }
  clear() { this.values.clear(); this.bytes = 0; }
}
