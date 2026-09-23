/**
 * Cleans a provider-supplied category/row title for on-screen display.
 *
 * IPTV playlists often prefix names with emoji (`🐈‍⬛ Filmes | Romance`). On
 * TVs (and some desktop fonts) those sequences render as tofu boxes or leave
 * orphan separators next to the real text. We never mutate the cache — this
 * runs at the display edge so sort order and stored data stay as the provider
 * sent them.
 *
 * Code points are matched with explicit ranges, not Unicode property escapes
 * (`\p{Emoji}`): the client target is Chromium 53 (webOS 4) and must not
 * receive syntax it cannot parse.
 */
export function cleanDisplayTitle(raw: string | null | undefined): string {
    if (!raw) return '';

    let out = '';
    // Iterates by code point, so surrogate pairs (emoji) drop as one unit.
    for (const ch of raw) {
        const cp = ch.codePointAt(0);
        if (cp === undefined || shouldDropDisplayChar(cp)) continue;
        out += ch;
    }

    return out
        .replace(/\s+/g, ' ')
        // Orphaned separators left after stripping pictographs / joiners.
        .replace(/^[\s|•·▪▫■□\-–—]+/, '')
        .replace(/[\s|•·▪▫■□\-–—]+$/, '')
        .trim();
}

function shouldDropDisplayChar(cp: number): boolean {
    // C0/C1 controls and DEL.
    if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) return true;
    // Zero-width and format characters (ZWSP, ZWJ, bidi marks, word joiner…).
    if (cp >= 0x200b && cp <= 0x200f) return true;
    if (cp >= 0x202a && cp <= 0x202e) return true;
    if (cp >= 0x2060 && cp <= 0x206f) return true;
    // Combining marks used only with emoji (keycap, enclosed marks).
    if (cp >= 0x20d0 && cp <= 0x20ff) return true;
    // Variation selectors (including emoji presentation U+FE0F).
    if (cp >= 0xfe00 && cp <= 0xfe0f) return true;
    if (cp >= 0xfe20 && cp <= 0xfe2f) return true;
    // Replacement / specials — a missing glyph often lands here.
    if (cp >= 0xfff0 && cp <= 0xffff) return true;
    // Private use area (TV fonts park custom icons here; often blank/tofu).
    if (cp >= 0xe000 && cp <= 0xf8ff) return true;
    // BMP symbol blocks commonly used as emoji or decorative separators.
    if (cp >= 0x2600 && cp <= 0x27bf) return true; // misc symbols + dingbats
    if (cp >= 0x2b00 && cp <= 0x2bff) return true; // arrows / ⬛⬜ shapes
    if (cp >= 0x2300 && cp <= 0x23ff) return true; // misc technical (⌚⌛⏰…)
    // Plane-1 pictographs (emoji proper, flags, skin tones, cards…).
    if (cp >= 0x1f000 && cp <= 0x1faff) return true;
    // Emoji tag sequences (flag tag characters on plane 14).
    if (cp >= 0xe0000 && cp <= 0xe007f) return true;
    return false;
}
