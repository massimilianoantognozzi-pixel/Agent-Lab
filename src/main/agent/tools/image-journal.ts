import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { ImageProviderUsage } from './image-provider';
import type { StagedImageIdentity } from './image-files';

export type ImageReceipt = {
  jobId: string;
  output: string;
  state: 'prepared' | 'running' | 'completed' | 'failed';
  model: string;
  size: string;
  quality: string;
  estimatedOutputUsd: number;
  requestId?: string;
  usage?: ImageProviderUsage;
  billing?: 'not_sent' | 'unconfirmed' | 'usage_reported';
  sha256?: string;
  fileStatus?: 'verified' | 'changed' | 'missing' | 'unverified';
  error?: string;
};

export type ImageJournalEntry = { phase: 'prepared' | 'dispatching' | 'publishing' | 'finished'; receipt: ImageReceipt; staged?: StagedImageIdentity };
type Row = { phase: ImageJournalEntry['phase']; receipt: string };
const read = (row: unknown): ImageJournalEntry | undefined => {
  if (!row) {
    return undefined;
  }
  const { phase, receipt } = row as Row;
  const { staged, ...observed } = JSON.parse(receipt) as ImageReceipt & { staged?: StagedImageIdentity };
  return { phase, receipt: observed, staged };
};

// A task's fingerprint, receipt and dispatch state share one crash-atomic private journal.
export class ImageJournal {
  private readonly file: string;
  constructor(directory: string) {
    this.file = path.join(directory, 'requests.sqlite');
  }

  private withDatabase<T>(fn: (db: DatabaseSync) => T): T {
    const db = new DatabaseSync(this.file);
    try {
      db.exec('PRAGMA busy_timeout=2000; PRAGMA synchronous=FULL');
      return fn(db);
    } finally {
      db.close();
    }
  }

  find(by: 'fingerprint' | 'jobId', value: string): ImageJournalEntry | undefined {
    if (!existsSync(this.file)) {
      return undefined;
    }
    return this.withDatabase((db) => {
      // Another process can die between opening a new database and committing its schema.
      if (!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='jobs'").get()) {
        return undefined;
      }
      const sql = by === 'fingerprint' ? 'SELECT phase, receipt FROM jobs WHERE fingerprint = ?' : 'SELECT phase, receipt FROM jobs WHERE jobId = ?';
      return read(db.prepare(sql).get(value));
    });
  }

  prepare(fingerprint: string, receipt: ImageReceipt): ImageJournalEntry {
    mkdirSync(path.dirname(this.file), { recursive: true });
    return this.withDatabase((db) => {
      db.exec('CREATE TABLE IF NOT EXISTS jobs (fingerprint TEXT PRIMARY KEY, jobId TEXT UNIQUE NOT NULL, phase TEXT NOT NULL, receipt TEXT NOT NULL)');
      db.prepare("INSERT INTO jobs VALUES (?, ?, 'prepared', ?) ON CONFLICT(fingerprint) DO NOTHING").run(fingerprint, receipt.jobId, JSON.stringify(receipt));
      return read(db.prepare('SELECT phase, receipt FROM jobs WHERE fingerprint = ?').get(fingerprint))!;
    });
  }

  // Keep the critical section synchronous and short. No confirmation, network or image processing while it holds the writer lock.
  dispatch(receipt: ImageReceipt, reserve: (otherPrepared: string[]) => void): boolean {
    return this.withDatabase((db) => {
      db.exec('BEGIN IMMEDIATE');
      const changed = db
        .prepare("UPDATE jobs SET phase = 'dispatching', receipt = ? WHERE jobId = ? AND phase = 'prepared'")
        .run(JSON.stringify({ ...receipt, billing: 'unconfirmed' }), receipt.jobId).changes;
      if (changed) {
        const rows = db.prepare("SELECT jobId, json_extract(receipt,'$.output') AS output FROM jobs WHERE phase='prepared'").all();
        // path.relative uses the host's path semantics, including non-ASCII casing on Windows.
        reserve(rows.filter((row) => typeof row.output === 'string' && path.relative(row.output, receipt.output) === '').map((row) => String(row.jobId)));
      }
      db.exec('COMMIT');
      return Boolean(changed);
    });
  }

  publishing(receipt: ImageReceipt, staged: StagedImageIdentity): void {
    const changed = this.withDatabase(
      (db) =>
        db
          .prepare("UPDATE jobs SET phase='publishing', receipt=? WHERE jobId=? AND phase='dispatching'")
          .run(JSON.stringify({ ...receipt, staged }), receipt.jobId).changes,
    );
    if (!changed) {
      throw new Error('Ricevuta di invio assente: pubblicazione del PNG sospesa.');
    }
  }

  publications(): ImageJournalEntry[] {
    if (!existsSync(this.file)) {
      return [];
    }
    return this.withDatabase((db) => {
      if (!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='jobs'").get()) {
        return [];
      }
      return db
        .prepare("SELECT phase, receipt FROM jobs WHERE phase='publishing'")
        .all()
        .map((row) => read(row)!);
    });
  }

  finish(receipt: ImageReceipt, cleanup: () => void, recovering = false): ImageReceipt {
    return this.withDatabase((db) => {
      db.exec('BEGIN IMMEDIATE');
      if (recovering) {
        const current = read(db.prepare('SELECT phase, receipt FROM jobs WHERE jobId=?').get(receipt.jobId));
        if (!current) {
          throw new Error('Ricevuta assente durante il recupero del PNG.');
        }
        if (current.phase !== 'publishing') {
          db.exec('COMMIT');
          return current.receipt;
        }
      }
      try {
        cleanup();
      } catch {
        receipt.error = [receipt.error, 'Pulizia della prenotazione da verificare.'].filter(Boolean).join(' ');
      }
      const phase = receipt.billing === 'not_sent' ? 'prepared' : 'finished';
      db.prepare('UPDATE jobs SET phase = ?, receipt = ? WHERE jobId = ?').run(phase, JSON.stringify(receipt), receipt.jobId);
      db.exec('COMMIT');
      return receipt;
    });
  }
}
