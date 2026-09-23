import 'server-only';

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { getCookieValue } from './remoteAccess';
import { getProfile, resolveProfileId } from './userStore';

const CONFIG_DIR = path.join(process.cwd(), 'data');
const CONFIG_PATH = path.join(CONFIG_DIR, 'adult-lock.json');

const HASH_ALGORITHM = 'scrypt';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

export const ADULT_LOCK_COOKIE_NAME = 'xstream_adult_unlock';
/** Unlock window: long enough for a session, short enough that a borrowed remote forgets. */
export const ADULT_UNLOCK_SECONDS = 3 * 60 * 60;
export const ADULT_PIN_PATTERN = /^\d{4}$/;
export const DEFAULT_ADULT_PIN = '0000';

interface AdultLockConfig {
    pinHash?: string;
}

function hasErrorCode(error: unknown, code: string) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

/** Numeric 4-digit PIN (unlike the remote-access rule, which rejects `0000`). */
export function isValidAdultPin(pin: unknown): pin is string {
    return typeof pin === 'string' && ADULT_PIN_PATTERN.test(pin);
}

async function readConfig(): Promise<AdultLockConfig> {
    try {
        const data = await fs.readFile(CONFIG_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error: unknown) {
        if (hasErrorCode(error, 'ENOENT')) {
            return {};
        }
        throw error;
    }
}

async function writeConfig(config: AdultLockConfig) {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Hash of the adult PIN. Seeded to `0000` on first use so the lock is on by
 * default until the user picks their own code.
 */
export async function getAdultPinHash(): Promise<string> {
    const config = await readConfig();
    if (config.pinHash) return config.pinHash;

    const pinHash = hashPin(DEFAULT_ADULT_PIN);
    await writeConfig({ pinHash });
    return pinHash;
}

export async function verifyAdultPin(pin: string): Promise<boolean> {
    if (!isValidAdultPin(pin)) return false;
    const pinHash = await getAdultPinHash();
    return verifyPin(pin, pinHash);
}

export async function changeAdultPin(currentPin: string, newPin: string): Promise<boolean> {
    if (!isValidAdultPin(newPin)) return false;
    if (!(await verifyAdultPin(currentPin))) return false;
    await writeConfig({ pinHash: hashPin(newPin) });
    return true;
}

function hashPin(pin: string) {
    const salt = crypto.randomBytes(16).toString('base64url');
    const key = crypto
        .scryptSync(pin, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
        .toString('base64url');

    return [HASH_ALGORITHM, SCRYPT_N, SCRYPT_R, SCRYPT_P, salt, key].join('$');
}

function verifyPin(pin: string, storedHash: string) {
    const [algorithm, n, r, p, salt, storedKey] = storedHash.split('$');

    if (algorithm !== HASH_ALGORITHM || !n || !r || !p || !salt || !storedKey) {
        return false;
    }

    const nValue = Number(n);
    const rValue = Number(r);
    const pValue = Number(p);

    if (!Number.isFinite(nValue) || !Number.isFinite(rValue) || !Number.isFinite(pValue)) {
        return false;
    }

    try {
        const derivedKey = crypto.scryptSync(pin, salt, KEY_LENGTH, {
            N: nValue,
            r: rValue,
            p: pValue,
        });
        const storedKeyBuffer = Buffer.from(storedKey, 'base64url');

        return storedKeyBuffer.length === derivedKey.length && crypto.timingSafeEqual(storedKeyBuffer, derivedKey);
    } catch {
        return false;
    }
}

export function createAdultUnlockCookieValue(pinHash: string, ttlSeconds: number = ADULT_UNLOCK_SECONDS) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const nonce = crypto.randomBytes(16).toString('base64url');
    const payload = `${expiresAt}.${nonce}`;
    const signature = signSessionPayload(payload, pinHash);

    return `${payload}.${signature}`;
}

function verifyAdultUnlockCookie(cookieValue: string | undefined, pinHash: string) {
    if (!cookieValue) return false;

    const [expiresAtValue, nonce, signature] = cookieValue.split('.');
    const expiresAt = Number(expiresAtValue);

    if (!expiresAtValue || !nonce || !signature || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        return false;
    }

    const expectedSignature = signSessionPayload(`${expiresAtValue}.${nonce}`, pinHash);
    const expectedBuffer = Buffer.from(expectedSignature);
    const receivedBuffer = Buffer.from(signature);

    return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function signSessionPayload(payload: string, pinHash: string) {
    return crypto.createHmac('sha256', pinHash).update(payload).digest('base64url');
}

/** True when this request carries a valid adult-unlock session. */
export async function isAdultUnlocked(request: Request): Promise<boolean> {
    const cookieValue = getCookieValue(request.headers.get('cookie'), ADULT_LOCK_COOKIE_NAME);
    if (!cookieValue) return false;
    const pinHash = await getAdultPinHash();
    return verifyAdultUnlockCookie(cookieValue, pinHash);
}

/**
 * Single policy for every read path: kid profiles never see adult content (unlock
 * ignored); other profiles see it only while the unlock cookie is valid.
 */
export async function shouldHideAdult(request: Request): Promise<boolean> {
    const profileId = resolveProfileId(request);
    const profile = profileId ? getProfile(profileId) : null;
    if (profile?.isKid) return true;
    return !(await isAdultUnlocked(request));
}

export function isSecureRequest(request: Request) {
    return request.headers.get('x-forwarded-proto') === 'https' || request.url.startsWith('https://');
}
