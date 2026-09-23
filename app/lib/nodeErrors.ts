/** True when `error` is a Node.js system error with the given `code` (e.g. ENOENT). */
export function isErrnoCode(error: unknown, code: string): boolean {
    if (typeof error !== 'object' || error === null) return false;
    return 'code' in error && (error as { code?: unknown }).code === code;
}

/** Message from an unknown throw value without depending on Error being present. */
export function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return String(error);
}
