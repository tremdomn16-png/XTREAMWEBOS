/**
 * Content filter shared by kid mode and the adult PIN lock.
 *
 * Applied server-side so every device (TV / phone / desktop) sees the same
 * restricted catalog — not a client-side decoration.
 *
 * Heuristic: drop categories/streams whose name, genre or category label looks
 * adult. No rating table is assumed (Xtream providers rate inconsistently).
 */

const ADULT_LABEL =
    /adult|xxx|porn|erotic|porno|nsfw|(?:\+|18\s*\+)|sex(?:y|ual)?\s*(?:movie|scene|tv)|nude|nudity|playboy|hustler|brazzers|red\s*tube|you\s*porn|adult(?:s)?\s*(?:only|channel)/i;

/** True when a free-text label looks adult (used by the PIN lock and kid mode). */
export function isAdultLabel(label: string | null | undefined): boolean {
    if (!label) return false;
    return ADULT_LABEL.test(label);
}

/** True when a free-text label is safe to show on a kid profile. */
export function isKidSafeLabel(label: string | null | undefined): boolean {
    return !isAdultLabel(label);
}

export interface KidCategory {
    category_id?: string | number;
    category_name?: string;
}

export function filterKidCategories<T extends KidCategory>(categories: T[]): T[] {
    return categories.filter(c => isKidSafeLabel(c.category_name));
}

/** Alias used by the adult-lock path (same label rules as kid mode). */
export const filterAdultCategories = filterKidCategories;

export interface KidStream {
    name?: string;
    genre?: string | null;
    category_id?: string | number | null;
}

/**
 * Filters streams by their own name/genre and by the category name
 * (when `categoryNames` provides a lookup for `category_id`).
 */
export function filterKidStreams<T extends KidStream>(
    streams: T[],
    categoryNames?: Map<string, string>
): T[] {
    return streams.filter(s => {
        if (!isKidSafeLabel(s.name)) return false;
        if (!isKidSafeLabel(s.genre ?? undefined)) return false;
        if (categoryNames && s.category_id != null) {
            const cat = categoryNames.get(String(s.category_id));
            if (cat && !isKidSafeLabel(cat)) return false;
        }
        return true;
    });
}

/** Alias used by the adult-lock path (same label rules as kid mode). */
export const filterAdultStreams = filterKidStreams;
