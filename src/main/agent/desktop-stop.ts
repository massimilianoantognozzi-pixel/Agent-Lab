import path from 'node:path';
import { realpathSync } from 'node:fs';

const closingCheckouts = new Set<string>();
export const desktopCheckoutKey = (dir: string) => {
  let canonical = path.resolve(dir);
  try {
    canonical = realpathSync.native(canonical);
  } catch {
    /* The checkout may have disappeared. */
  }
  return process.platform === 'win32' ? canonical.toLowerCase() : canonical;
};
export const checkoutIsClosing = (dir: string) => closingCheckouts.size > 0 && closingCheckouts.has(desktopCheckoutKey(dir));
export const holdDesktopCheckout = (dir: string) => {
  const key = desktopCheckoutKey(dir);
  closingCheckouts.add(key);
  return () => closingCheckouts.delete(key);
};

// One instance per Task/Agent. New work cannot enter once the desktop has
// requested quiescence. In-flight opaque tools retain their original signal.
export class DesktopStopBoundary {
  private controller = new AbortController();
  private operations = new Set<Promise<unknown>>();
  private unconfirmedProcesses = new Set<string>();

  get requested() {
    return this.controller.signal.aborted;
  }

  get signal() {
    return this.controller.signal;
  }

  request() {
    this.controller.abort();
  }

  reopen() {
    if (this.requested) {
      this.controller = new AbortController();
    }
  }

  uncertainProcess(id: string) {
    this.unconfirmedProcesses.add(id);
  }

  assertQuiescent() {
    if (this.unconfirmedProcesses.size) {
      throw new Error('Arresto di un processo non confermato. Pubblicazione sospesa.');
    }
  }

  async run<T>(operation: () => Promise<T>, protect: boolean): Promise<T> {
    if (this.requested) {
      throw new Error('Sessione in chiusura: nessun nuovo strumento avviato.');
    }
    if (!protect) {
      return operation();
    }
    const done = Promise.withResolvers<void>();
    this.operations.add(done.promise);
    try {
      return await operation();
    } finally {
      this.operations.delete(done.promise);
      done.resolve();
    }
  }

  async drain() {
    await Promise.all(this.operations);
  }
}
