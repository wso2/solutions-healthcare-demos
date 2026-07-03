export function log(message: string): void {
  console.log(`[sync] ${message}`);
}

export async function waitForHealthy(url: string, label: string, timeoutMs = 120_000): Promise<void> {
  const start = performance.now();
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        log(`${label} is up.`);
        return;
      }
    } catch {}
    if (performance.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for ${label} at ${url}`);
    }
    await Bun.sleep(2000);
  }
}
