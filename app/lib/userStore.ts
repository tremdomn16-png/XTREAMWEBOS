import 'server-only';

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { getCookieValue } from './remoteAccess';
import { getRequestDeviceProfileId } from './apiAuth';

/**
 * User-owned data: profiles, favorites and watch progress.
 *
 * Deliberately a separate database from xstream-player.sqlite. That one is a
 * disposable catalog cache — deleting it to force a re-sync is a normal thing to
 * do — and user data must not be collateral damage of that habit.
 */

export const PROFILE_COOKIE_NAME = 'xstream_profile';
/** How the TV client states its profile: it has no cookie on its own origin. */
export const PROFILE_HEADER_NAME = 'X-Xstream-Profile';
/**
 * Which IPTV account (Xtream `username`) owns the profiles in this request.
 * Web sends it from localStorage auth; the TV pair-session may omit it and
 * fall back to the device's pinned account via cookie/device profile.
 */
export const ACCOUNT_HEADER_NAME = 'X-Xstream-Account';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'user-data.sqlite');

const DEFAULT_SUBTITLE_LANGUAGE = 'pt-BR';
const DEFAULT_SUBTITLE_FONT_SIZE = 1.5;

let sqlite: Database.Database | null = null;

export interface ProfilePrefs {
    subtitleLanguage: string;
    /** Player subtitle size, in rem — the scale the player clamps to (0.8–2.5). */
    subtitleFontSize: number;
}

export interface Profile {
    id: string;
    name: string;
    /** Avatar catalog id (`app/lib/avatars.ts`), not an emoji. */
    avatar: string;
    /** Kid profile: server-side catalog filtering + green badge in UI. */
    isKid: boolean;
    /** IPTV account (Xtream username) this profile belongs to. */
    account: string;
    prefs: ProfilePrefs;
}

export interface FavoriteItem {
    id: string | number;
    type: 'live' | 'movie' | 'series';
    name: string;
    image?: string;
    rating?: string;
}

export interface WatchProgress {
    streamId: string | number;
    type: 'movie' | 'series';
    progress: number;
    duration: number;
    timestamp: number;
    name: string;
    image?: string;
    episodeId?: string | number;
    seriesId?: string | number;
    seasonNum?: number;
    episodeNum?: number;
}

interface ProfileRow {
    id: string;
    name: string;
    avatar: string;
    is_kid: number;
    account: string;
    subtitle_language: string;
    subtitle_font_size: number;
}

interface FavoriteRow {
    item_id: string;
    type: 'live' | 'movie' | 'series';
    name: string;
    image: string | null;
    rating: string | null;
}

interface ProgressRow {
    content_id: string;
    stream_id: string;
    type: 'movie' | 'series';
    episode_id: string | null;
    series_id: string | null;
    progress: number;
    duration: number;
    timestamp: number;
    name: string;
    image: string | null;
    season_num: number | null;
    episode_num: number | null;
}

function getConnection(): Database.Database {
    if (sqlite) return sqlite;

    fs.mkdirSync(DATA_DIR, { recursive: true });

    sqlite = new Database(DB_PATH);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = NORMAL');
    sqlite.pragma('busy_timeout = 5000');
    sqlite.pragma('foreign_keys = ON');

    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            avatar TEXT NOT NULL DEFAULT 'av-1',
            is_kid INTEGER NOT NULL DEFAULT 0,
            account TEXT NOT NULL DEFAULT '',
            subtitle_language TEXT NOT NULL DEFAULT '${DEFAULT_SUBTITLE_LANGUAGE}',
            subtitle_font_size REAL NOT NULL DEFAULT ${DEFAULT_SUBTITLE_FONT_SIZE},
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS favorites (
            profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            item_id TEXT NOT NULL,
            type TEXT NOT NULL,
            name TEXT NOT NULL,
            image TEXT,
            rating TEXT,
            PRIMARY KEY (profile_id, type, item_id)
        );

        CREATE TABLE IF NOT EXISTS watch_progress (
            profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            content_id TEXT NOT NULL,
            stream_id TEXT NOT NULL,
            type TEXT NOT NULL,
            episode_id TEXT,
            series_id TEXT,
            progress REAL NOT NULL,
            duration REAL NOT NULL DEFAULT 0,
            timestamp INTEGER NOT NULL,
            name TEXT NOT NULL,
            image TEXT,
            season_num INTEGER,
            episode_num INTEGER,
            PRIMARY KEY (profile_id, content_id, stream_id)
        );

        CREATE INDEX IF NOT EXISTS idx_progress_profile_timestamp
            ON watch_progress(profile_id, timestamp DESC);
    `);

    migrateFromJson(sqlite);
    ensureProfileColumns(sqlite);

    return sqlite;
}

/** Idempotent ALTERs for DBs created before avatar / is_kid / account existed. */
function ensureProfileColumns(db: Database.Database): void {
    const cols = db.prepare('PRAGMA table_info(profiles)').all() as Array<{ name: string }>;
    const names = new Set(cols.map(c => c.name));
    if (!names.has('avatar')) {
        db.exec(`ALTER TABLE profiles ADD COLUMN avatar TEXT NOT NULL DEFAULT 'av-1'`);
    }
    if (!names.has('is_kid')) {
        db.exec(`ALTER TABLE profiles ADD COLUMN is_kid INTEGER NOT NULL DEFAULT 0`);
    }
    if (!names.has('account')) {
        db.exec(`ALTER TABLE profiles ADD COLUMN account TEXT NOT NULL DEFAULT ''`);
    }
    // Legacy single-install rows: flag the old Kid profile and leave account empty
    // (claimed by the first logged-in IPTV account on listProfiles).
    db.exec(`UPDATE profiles SET is_kid = 1 WHERE name = 'Kid' AND is_kid = 0`);
    // Kid rows must never keep an adult avatar (pre-migration default was av-1).
    db.exec(`UPDATE profiles SET avatar = 'kid-1' WHERE is_kid = 1 AND avatar NOT LIKE 'kid-%'`);
    db.exec(`UPDATE profiles SET avatar = 'av-1' WHERE is_kid = 0 AND avatar LIKE 'kid-%'`);
}

/** Kid rows resolve to `kid-*` only; adult rows never do (UI + API share this rule). */
function coerceAvatar(avatar: string | null | undefined, isKid: boolean): string {
    const id = avatar || '';
    if (isKid) {
        return id.indexOf('kid-') === 0 ? id : 'kid-1';
    }
    if (id.indexOf('kid-') === 0 || !id) return 'av-1';
    return id;
}

function rowToProfile(row: ProfileRow): Profile {
    const isKid = row.is_kid === 1;
    return {
        id: row.id,
        name: row.name,
        avatar: coerceAvatar(row.avatar, isKid),
        isKid,
        account: row.account ?? '',
        prefs: {
            subtitleLanguage: row.subtitle_language,
            subtitleFontSize: row.subtitle_font_size
        }
    };
}

function rowToProgress(row: ProgressRow): WatchProgress {
    const progress: WatchProgress = {
        streamId: row.stream_id,
        type: row.type,
        progress: row.progress,
        duration: row.duration,
        timestamp: row.timestamp,
        name: row.name
    };

    if (row.image !== null) progress.image = row.image;
    if (row.episode_id !== null) progress.episodeId = row.episode_id;
    if (row.series_id !== null) progress.seriesId = row.series_id;
    if (row.season_num !== null) progress.seasonNum = row.season_num;
    if (row.episode_num !== null) progress.episodeNum = row.episode_num;

    return progress;
}

// --- Profiles ---

/** Hard cap regardless of plan — keeps runaway creates from filling the DB. */
export const MAX_PROFILES = 10;

/** Kid profile name (i18n key `profiles.kid` on the client; stored as `Kid`). */
export const KID_PROFILE_NAME = 'Kid';
/** Catalog id for the auto-created Kid avatar (`public/avatars/kid-1.svg`). */
const DEFAULT_KID_AVATAR_ID = 'kid-1';

/**
 * Lists profiles for one IPTV account.
 *
 * - `account` given → only that account's rows; empty-account rows (legacy
 *   install) are claimed by the first account that asks, preserving favorites.
 * - No / null `account` → every row (device routes that only need "does this id exist").
 *
 * There is deliberately **no** Adulto+Kid seed here: the first profile for an
 * account is created by the onboarding screen; Kid is appended right after.
 */
export function listProfiles(account?: string | null): Profile[] {
    const db = getConnection();
    const all = db.prepare('SELECT * FROM profiles ORDER BY created_at').all() as ProfileRow[];

    if (account == null || account === '') {
        return all.map(rowToProfile);
    }

    let forAccount = all.filter(r => r.account === account);
    if (forAccount.length === 0) {
        const unclaimed = all.filter(r => !r.account);
        if (unclaimed.length > 0) {
            const claim = db.transaction(() => {
                for (const row of unclaimed) {
                    db.prepare('UPDATE profiles SET account = ? WHERE id = ?').run(account, row.id);
                }
            });
            claim();
            forAccount = (db.prepare('SELECT * FROM profiles ORDER BY created_at').all() as ProfileRow[])
                .filter(r => r.account === account);
        }
    }

    return forAccount.map(rowToProfile);
}

export interface CreateProfileInput {
    name: string;
    avatar?: string;
    isKid?: boolean;
    account?: string;
}

export function createProfile(input: CreateProfileInput | string): Profile {
    // Accept the old `createProfile('Name')` shape from legacy call sites.
    const opts: CreateProfileInput = typeof input === 'string' ? { name: input } : input;
    const isKid = opts.isKid === true;
    const profile: Profile = {
        id: randomUUID(),
        name: opts.name,
        avatar: coerceAvatar(opts.avatar, isKid),
        isKid,
        account: opts.account ?? '',
        prefs: {
            subtitleLanguage: DEFAULT_SUBTITLE_LANGUAGE,
            subtitleFontSize: DEFAULT_SUBTITLE_FONT_SIZE
        }
    };

    getConnection()
        .prepare(`
            INSERT INTO profiles (id, name, avatar, is_kid, account, subtitle_language, subtitle_font_size, created_at)
            VALUES (@id, @name, @avatar, @isKid, @account, @language, @fontSize, @createdAt)
        `)
        .run({
            id: profile.id,
            name: profile.name,
            avatar: profile.avatar,
            isKid: profile.isKid ? 1 : 0,
            account: profile.account,
            language: profile.prefs.subtitleLanguage,
            fontSize: profile.prefs.subtitleFontSize,
            createdAt: Date.now()
        });

    return profile;
}

/**
 * Ensures the account has its Kid profile — called only after the first
 * (normal) profile exists, so Kid never ships before the main profile.
 * Returns the existing Kid when one is already there.
 */
export function ensureKidProfile(account: string): Profile {
    const profiles = listProfiles(account || null);
    const existing = profiles.find(p => p.isKid);
    if (existing) return existing;
    return createProfile({ name: KID_PROFILE_NAME, avatar: DEFAULT_KID_AVATAR_ID, isKid: true, account });
}

export function getProfile(id: string): Profile | null {
    if (!id) return null;
    const row = getConnection().prepare('SELECT * FROM profiles WHERE id = ?').get(id) as ProfileRow | undefined;
    return row ? rowToProfile(row) : null;
}

export function updateProfile(
    id: string,
    changes: {
        name?: string;
        avatar?: string;
        isKid?: boolean;
        prefs?: Partial<ProfilePrefs>;
    }
): Profile | null {
    const db = getConnection();
    const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as ProfileRow | undefined;
    if (!row) return null;

    const nextIsKid = changes.isKid === undefined ? row.is_kid === 1 : changes.isKid;
    const updated: ProfileRow = {
        ...row,
        name: changes.name ?? row.name,
        avatar: coerceAvatar(changes.avatar ?? row.avatar, nextIsKid),
        is_kid: nextIsKid ? 1 : 0,
        subtitle_language: changes.prefs?.subtitleLanguage ?? row.subtitle_language,
        subtitle_font_size: changes.prefs?.subtitleFontSize ?? row.subtitle_font_size
    };

    db.prepare(`
        UPDATE profiles
           SET name = @name,
               avatar = @avatar,
               is_kid = @is_kid,
               subtitle_language = @subtitle_language,
               subtitle_font_size = @subtitle_font_size
         WHERE id = @id
    `).run(updated);

    return rowToProfile(updated);
}

export function deleteProfile(id: string): boolean {
    const db = getConnection();
    const row = db.prepare('SELECT is_kid FROM profiles WHERE id = ?').get(id) as { is_kid: number } | undefined;
    if (!row) return false;

    // The Kid profile is permanent: it is the only child-safe entry point.
    if (row.is_kid === 1) return false;

    // The last profile has to stay: every request resolves to some profile.
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM profiles').get() as { count: number };
    if (count <= 1) return false;

    // Favorites and progress go with it (ON DELETE CASCADE).
    const result = db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
    return result.changes > 0;
}

/** IPTV account for this request: `X-Xstream-Account` header, or null when absent. */
export function getRequestAccount(request: Request): string | null {
    const raw = request.headers.get(ACCOUNT_HEADER_NAME)?.trim();
    return raw ? raw : null;
}

/**
 * Resolves the profile a request belongs to, falling back to the first profile of
 * the requesting account when nothing points at a profile that still exists.
 *
 * The header comes first because the TV client has no usable cookie on its foreign
 * origin; the device's own default profile follows, so a paired TV lands on the right
 * profile without sending anything. The cookie — the web app's only signal — is
 * untouched by both, so its behaviour does not change.
 */
export function resolveProfileId(request: Request): string {
    const account = getRequestAccount(request);
    const profiles = listProfiles(account);
    if (profiles.length === 0) {
        // No profiles yet (pre-onboarding): favorites/progress routes see ''.
        return '';
    }
    const headerId = request.headers.get(PROFILE_HEADER_NAME);
    const deviceId = headerId ? null : getRequestDeviceProfileId(request);
    const cookieId = getCookieValue(request.headers.get('cookie'), PROFILE_COOKIE_NAME);

    return (
        profiles.find(p => p.id === headerId)?.id ??
        profiles.find(p => p.id === deviceId)?.id ??
        profiles.find(p => p.id === cookieId)?.id ??
        profiles[0].id
    );
}

// --- Favorites ---

export function listFavorites(profileId: string): FavoriteItem[] {
    if (!profileId) return [];
    const rows = getConnection()
        .prepare('SELECT item_id, type, name, image, rating FROM favorites WHERE profile_id = ?')
        .all(profileId) as FavoriteRow[];

    return rows.map(row => {
        const item: FavoriteItem = { id: row.item_id, type: row.type, name: row.name };
        if (row.image !== null) item.image = row.image;
        if (row.rating !== null) item.rating = row.rating;
        return item;
    });
}

/** The client owns the whole list, so a save is a replace — inside one transaction. */
export function replaceFavorites(profileId: string, items: FavoriteItem[]): void {
    if (!profileId) return;
    const db = getConnection();

    const replace = db.transaction((list: FavoriteItem[]) => {
        db.prepare('DELETE FROM favorites WHERE profile_id = ?').run(profileId);

        const insert = db.prepare(`
            INSERT OR REPLACE INTO favorites (profile_id, item_id, type, name, image, rating)
            VALUES (@profileId, @itemId, @type, @name, @image, @rating)
        `);

        for (const item of list) {
            insert.run({
                profileId,
                itemId: String(item.id),
                type: item.type,
                name: item.name ?? '',
                image: item.image ?? null,
                rating: item.rating ?? null
            });
        }
    });

    replace(items);
}

// --- Watch progress ---

/** For series every episode is a row; a movie is a single row keyed by its stream. */
function contentIdOf(progress: WatchProgress): string {
    return progress.type === 'series' && progress.seriesId
        ? String(progress.seriesId)
        : String(progress.streamId);
}

export function saveProgress(profileId: string, progress: WatchProgress): void {
    if (!profileId) return;
    const contentId = contentIdOf(progress);
    const streamId = String(progress.streamId);

    const db = getConnection();

    // One statement, so a concurrent save can't lose the other's update: the
    // guards that used to need a read-modify-write cycle are now in the WHERE.
    db.prepare(`
        INSERT INTO watch_progress (
            profile_id, content_id, stream_id, type, episode_id, series_id,
            progress, duration, timestamp, name, image, season_num, episode_num
        ) VALUES (
            @profileId, @contentId, @streamId, @type, @episodeId, @seriesId,
            @progress, @duration, @timestamp, @name, @image, @seasonNum, @episodeNum
        )
        ON CONFLICT (profile_id, content_id, stream_id) DO UPDATE SET
            progress   = excluded.progress,
            -- A duration of 0 means the player had not read the metadata yet;
            -- never let it erase a duration we already know.
            duration   = CASE WHEN excluded.duration > 0 THEN excluded.duration ELSE watch_progress.duration END,
            timestamp  = excluded.timestamp,
            name       = excluded.name,
            image      = excluded.image,
            season_num = excluded.season_num,
            episode_num = excluded.episode_num
        WHERE excluded.timestamp >= watch_progress.timestamp
          -- Same reason the JSON version guarded this: a 0-progress update is
          -- the player reporting a fresh <video> element, not a rewind.
          AND NOT (excluded.progress = 0 AND watch_progress.progress > 0)
    `).run({
        profileId,
        contentId,
        streamId,
        type: progress.type,
        episodeId: progress.episodeId !== undefined ? String(progress.episodeId) : null,
        seriesId: progress.seriesId !== undefined ? String(progress.seriesId) : null,
        progress: progress.progress,
        duration: progress.duration || 0,
        timestamp: progress.timestamp,
        name: progress.name ?? '',
        image: progress.image ?? null,
        seasonNum: progress.seasonNum ?? null,
        episodeNum: progress.episodeNum ?? null
    });
}

/**
 * The "continue watching" map: the latest episode per series, plus every movie.
 * This used to be a second file kept in sync by hand — which is exactly what
 * corrupted it. Here it is derived, so it cannot disagree with the episodes.
 */
export function getProgressSummary(profileId: string): Record<string, WatchProgress> {
    if (!profileId) return {};
    const rows = getConnection()
        .prepare(`
            SELECT p.* FROM watch_progress p
            JOIN (
                SELECT content_id, MAX(timestamp) AS timestamp
                  FROM watch_progress
                 WHERE profile_id = ?
                 GROUP BY content_id
            ) latest
              ON latest.content_id = p.content_id
             AND latest.timestamp = p.timestamp
            WHERE p.profile_id = ?
        `)
        .all(profileId, profileId) as ProgressRow[];

    const summary: Record<string, WatchProgress> = {};
    for (const row of rows) {
        summary[row.content_id] = rowToProgress(row);
    }
    return summary;
}

/** Every episode of a series, keyed by episode id — or the single movie entry. */
export function getProgressDetail(
    profileId: string,
    type: string,
    contentId: string
): Record<string, WatchProgress> | WatchProgress | null {
    if (!profileId) return null;
    const rows = getConnection()
        .prepare('SELECT * FROM watch_progress WHERE profile_id = ? AND type = ? AND content_id = ?')
        .all(profileId, type, contentId) as ProgressRow[];

    if (type === 'movie') {
        return rows[0] ? rowToProgress(rows[0]) : null;
    }

    const detail: Record<string, WatchProgress> = {};
    for (const row of rows) {
        detail[row.episode_id ?? row.stream_id] = rowToProgress(row);
    }
    return detail;
}

// --- One-shot import of the JSON layout ---

function readJsonFile<T>(filePath: string): T | null {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    } catch {
        // Missing is normal; corrupt is not, but a corrupt file must not block
        // the import of everything else — the granular files hold the same data.
        return null;
    }
}

/** Imports one profile's directory (or the flat data/ root) into the database. */
function importProfileData(profileId: string, dir: string): void {
    const favorites = readJsonFile<FavoriteItem[]>(path.join(dir, 'favorites.json'));
    if (Array.isArray(favorites)) {
        replaceFavorites(profileId, favorites.filter(item => item && item.id !== undefined));
    }

    // Progress comes only from the granular files, never from watch-progress.json:
    // the summary was written by two routes at once and could be torn, while the
    // per-content files hold the same entries intact. The summary is derived now.
    let entries: fs.Dirent[] = [];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }

    for (const entry of entries) {
        if (!entry.isFile()) continue;

        const isMovie = entry.name.startsWith('movie-') && entry.name.endsWith('.json');
        const isSeries = entry.name.startsWith('series-') && entry.name.endsWith('.json');
        if (!isMovie && !isSeries) continue;

        const parsed = readJsonFile<Record<string, WatchProgress> | WatchProgress>(
            path.join(dir, entry.name)
        );
        if (!parsed) continue;

        // A movie file is one progress object; a series file is a map of episodes.
        const items = isMovie
            ? [parsed as WatchProgress]
            : Object.values(parsed as Record<string, WatchProgress>);

        for (const item of items) {
            if (!item || typeof item.timestamp !== 'number' || item.streamId === undefined) continue;
            saveProgress(profileId, item);
        }
    }
}

function importJsonProfiles(db: Database.Database): void {
    const profilesJson = path.join(DATA_DIR, 'profiles.json');
    const profilesDir = path.join(DATA_DIR, 'profiles');

    const stored = readJsonFile<Array<{
        id: string;
        name: string;
        avatar?: string;
        isKid?: boolean;
        account?: string;
        prefs?: Partial<ProfilePrefs>;
    }>>(profilesJson);

    if (Array.isArray(stored) && stored.length > 0) {
        for (const profile of stored) {
            db.prepare(`
                INSERT OR IGNORE INTO profiles (id, name, avatar, is_kid, account, subtitle_language, subtitle_font_size, created_at)
                VALUES (@id, @name, @avatar, @isKid, @account, @language, @fontSize, @createdAt)
            `).run({
                id: profile.id,
                name: profile.name,
                avatar: coerceAvatar(profile.avatar, profile.isKid === true),
                isKid: profile.isKid ? 1 : 0,
                account: profile.account || '',
                language: profile.prefs?.subtitleLanguage ?? DEFAULT_SUBTITLE_LANGUAGE,
                fontSize: profile.prefs?.subtitleFontSize ?? DEFAULT_SUBTITLE_FONT_SIZE,
                createdAt: Date.now()
            });

            importProfileData(profile.id, path.join(profilesDir, profile.id));
        }
        return;
    }

    // No profiles.json: the pre-profiles layout, with everything flat in data/.
    const flatFavorites = path.join(DATA_DIR, 'favorites.json');
    const hasFlatData = fs.existsSync(flatFavorites)
        || fs.readdirSync(DATA_DIR).some(f => /^(movie|series)-.+\.json$/.test(f));
    if (!hasFlatData) return;

    const profile = createProfile({ name: 'Padrão', account: '' });
    importProfileData(profile.id, DATA_DIR);
}

/**
 * Imports the JSON files once, on the first connection to an empty database.
 * The files are left on disk untouched — if this goes wrong, the old data is
 * still there to retry from.
 */
function migrateFromJson(db: Database.Database): void {
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM profiles').get() as { count: number };
    if (count > 0) return;

    try {
        const run = db.transaction(() => importJsonProfiles(db));
        run();

        const imported = db.prepare('SELECT COUNT(*) AS count FROM watch_progress').get() as { count: number };
        const favorites = db.prepare('SELECT COUNT(*) AS count FROM favorites').get() as { count: number };
        if (imported.count > 0 || favorites.count > 0) {
            console.log(
                `[UserStore] Imported ${favorites.count} favorite(s) and ${imported.count} progress entrie(s) from JSON`
            );
        }
    } catch (error) {
        console.error('[UserStore] JSON import failed; the JSON files were left untouched', error);
    }
}
