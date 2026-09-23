import 'server-only';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'remote-login.sqlite');
const CODE_TTL_MS = 5 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const CODE_ATTEMPTS = 20;

let sqlite: Database.Database | null = null;

interface Row {
    code: string;
    pairing_id: string;
    payload: string | null;
    expires_at: number;
}

export type RemoteLoginPayload =
    | { mode: 'xtream'; hostUrl: string; username: string; password: string }
    | { mode: 'm3u'; m3uUrl: string };

export type PollResult =
    | { status: 'pending' }
    | { status: 'expired' }
    | { status: 'ok'; payload: RemoteLoginPayload };

function columnNames(db: Database.Database, table: string): Set<string> {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return new Set(rows.map(r => r.name));
}

function ensureSchema(db: Database.Database): void {
    const info = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='remote_login_codes'`).get() as
        | { name: string }
        | undefined;

    const ddl = `
        CREATE TABLE IF NOT EXISTS remote_login_codes (
            code TEXT PRIMARY KEY,
            pairing_id TEXT NOT NULL UNIQUE,
            payload TEXT,
            expires_at INTEGER NOT NULL
        );
    `;

    if (!info) {
        db.exec(ddl);
        return;
    }

    const cols = columnNames(db, 'remote_login_codes');
    if (!cols.has('pairing_id') || !cols.has('payload') || !cols.has('expires_at')) {
        db.exec('DROP TABLE remote_login_codes');
        db.exec(ddl);
    }
}

function getDB(): Database.Database {
    if (sqlite) return sqlite;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    sqlite = new Database(DB_PATH);
    sqlite.pragma('journal_mode = WAL');
    ensureSchema(sqlite);
    return sqlite;
}

function genCode(): string {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let s = '';
    for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return s;
}

function prune(db: Database.Database): void {
    db.prepare('DELETE FROM remote_login_codes WHERE expires_at < ?').run(Date.now());
}

/** TV calls this on open: creates a fresh 6-char code + pairing id. */
export function startPairing(): { code: string; pairingId: string; expiresAt: number } {
    const db = getDB();
    prune(db);
    const expiresAt = Date.now() + CODE_TTL_MS;
    const pairingId = crypto.randomUUID();

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
        const code = genCode();
        try {
            db.prepare('INSERT INTO remote_login_codes (code, pairing_id, payload, expires_at) VALUES (?, ?, NULL, ?)')
                .run(code, pairingId, expiresAt);
            return { code, pairingId, expiresAt };
        } catch {
            // collision — draw another
        }
    }
    throw new Error('Could not allocate pairing code');
}

/**
 * Phone step 1: does this TV code exist and is still waiting?
 * Read-only — attach/poll own the lifecycle.
 */
export function checkCode(rawCode: string): { ok: boolean; error?: string } {
    const db = getDB();
    prune(db);
    const normalized = (rawCode || '').trim().toUpperCase();
    if (normalized.length !== CODE_LENGTH) {
        return { ok: false, error: `O código tem ${CODE_LENGTH} caracteres` };
    }
    const row = db
        .prepare('SELECT code, payload, expires_at FROM remote_login_codes WHERE code = ?')
        .get(normalized) as Pick<Row, 'code' | 'payload' | 'expires_at'> | undefined;

    if (!row) return { ok: false, error: 'Código não encontrado. Gere um novo na TV.' };
    if (row.expires_at < Date.now()) return { ok: false, error: 'Código expirado. Gere um novo na TV.' };
    if (row.payload) return { ok: false, error: 'Código já usado. Gere um novo na TV.' };
    return { ok: true };
}

/** Phone (already logged in) sends IPTV credentials to the code the TV is showing. */
export function attachToCode(code: string, payload: RemoteLoginPayload): boolean {
    const db = getDB();
    prune(db);
    const normalized = code.trim().toUpperCase();
    const result = db
        .prepare('UPDATE remote_login_codes SET payload = ? WHERE code = ? AND payload IS NULL AND expires_at > ?')
        .run(JSON.stringify(payload), normalized, Date.now());
    return result.changes > 0;
}

/** TV polls with its pairingId until the phone attaches (one-shot delivery). */
export function pollPairing(pairingId: string): PollResult {
    const db = getDB();
    const row = db.prepare('SELECT * FROM remote_login_codes WHERE pairing_id = ?').get(pairingId) as Row | undefined;

    if (!row) return { status: 'expired' };
    if (row.expires_at < Date.now()) {
        db.prepare('DELETE FROM remote_login_codes WHERE pairing_id = ?').run(pairingId);
        return { status: 'expired' };
    }
    if (!row.payload) return { status: 'pending' };

    db.prepare('DELETE FROM remote_login_codes WHERE pairing_id = ?').run(pairingId);
    try {
        return { status: 'ok', payload: JSON.parse(row.payload) as RemoteLoginPayload };
    } catch {
        return { status: 'expired' };
    }
}
