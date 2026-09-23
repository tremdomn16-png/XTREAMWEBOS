import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNavigationContext } from '@/app/context/NavigationContext';
import { getDirectionKey, isBackKey, isOkKey } from '@/app/lib/platform/keys';

export const useTvNavigation = () => {
    const router = useRouter();
    const { getActiveBackHandler } = useNavigationContext();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const activeElement = document.activeElement;
            const isFormControl = activeElement instanceof HTMLInputElement ||
                activeElement instanceof HTMLTextAreaElement ||
                activeElement instanceof HTMLSelectElement;

            const isBack = isBackKey(e);
            const direction = getDirectionKey(e);
            const isOk = isOkKey(e);

            // Only handle navigation keys (direction via key *or* keyCode —
            // old webOS remotes often leave event.key as Unidentified).
            if (!isBack && !direction && !isOk) {
                return;
            }

            // A focused field keeps only the keys that still do something inside
            // it. The vertical arrows never belong to it: a remote has no Tab key
            // and no pointer, so a field that swallows them is a dead end. The
            // horizontal arrows belong to a text field only while the caret has
            // somewhere left to go; at the edge they pass to the navigation,
            // which is what lets a remote cross a row of fields such as the
            // pairing form's code, name, profile and confirm button.
            if (isFormControl && direction !== 'ArrowUp' && direction !== 'ArrowDown') {
                // Enter belongs to the field: it submits, or opens a select.
                if (isOk) return;
                // A range is adjusted with the horizontal arrows and is never a
                // trap, since the vertical ones still move focus out of it.
                if (activeElement instanceof HTMLInputElement && activeElement.type === 'range') return;
                if (isTextEntry(activeElement) && direction && !isCaretAtEdge(activeElement, direction)) return;
            }

            // Back Navigation
            if (isBack) {
                e.preventDefault();
                if (document.fullscreenElement) {
                    return;
                }

                // Check if there's a custom back handler registered
                const customHandler = getActiveBackHandler();
                if (customHandler) {
                    console.log('TVNavigation::Using custom back handler');
                    customHandler();
                } else {
                    console.log('TVNavigation::Using default router.back()');
                    router.back();
                }
                return;
            }

            // Directional Navigation
            if (direction) {
                // If the focused element is a carousel, let ArrowLeft/ArrowRight be
                // handled by the component itself (it will preventDefault internally)
                const isCarousel = activeElement?.getAttribute('data-carousel') === 'true';
                if (isCarousel && (direction === 'ArrowLeft' || direction === 'ArrowRight')) {
                    return;
                }
                e.preventDefault();
                handleDirectionalNav(direction, e.repeat);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [router, getActiveBackHandler]);
};

const TEXT_ENTRY_INPUT_TYPES = ['text', 'search', 'password', 'email', 'url', 'tel', 'number'];

/** A field where the horizontal arrows drive a caret, unlike a range or a select. */
function isTextEntry(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
    if (el instanceof HTMLTextAreaElement) return true;
    return el instanceof HTMLInputElement && TEXT_ENTRY_INPUT_TYPES.indexOf(el.type) !== -1;
}

/**
 * True when the caret has nowhere left to go, so the key press belongs to the
 * navigation. Types that expose no selection (number, email) report null or
 * throw; treating those as "at the edge" keeps the field crossable instead of
 * trapping the cursor inside it.
 */
function isCaretAtEdge(el: HTMLInputElement | HTMLTextAreaElement, key: string): boolean {
    let start: number | null;
    let end: number | null;
    try {
        start = el.selectionStart;
        end = el.selectionEnd;
    } catch {
        return true;
    }

    if (start === null || end === null) return true;
    // A range selection still has somewhere to collapse to.
    if (start !== end) return false;

    return key === 'ArrowLeft' ? start === 0 : start === el.value.length;
}

// Holding a directional key on a TV remote fires a burst of auto-repeat
// keydown events, and each one triggers a full querySelectorAll +
// getBoundingClientRect scan over every focusable element (160+ on the home
// screen), which stutters on weak TV CPUs. Auto-repeat is rate limited to one
// scan per NAV_REPEAT_MIN_INTERVAL_MS; deliberate presses always run, since
// dropping one of those would lose input the user meant to give us.
const NAV_REPEAT_MIN_INTERVAL_MS = 100;
let navLastExecTime = 0;

function handleDirectionalNav(direction: string, isAutoRepeat: boolean) {
    const now = performance.now();

    if (isAutoRepeat && now - navLastExecTime < NAV_REPEAT_MIN_INTERVAL_MS) {
        return;
    }

    navLastExecTime = now;
    runDirectionalNav(direction);
}

/**
 * Topmost open overlay that opted into a focus scope (modals, profile gate).
 * Last match in tree order is the innermost / most recently rendered dialog.
 * When one is open, the D-pad only moves among its focusables — otherwise
 * arrows escape to the nav rail / page behind the overlay.
 */
function getActiveFocusScope(): HTMLElement | null {
    const scopes = document.querySelectorAll<HTMLElement>('[data-focus-scope="true"]');
    return scopes.length > 0 ? scopes[scopes.length - 1] : null;
}

/**
 * Shell chrome vs page content. Vertical arrows never cross this boundary:
 * the expanded rail overlaps the hero horizontally, so ↑ from "Assistir"
 * treated rail items as "aligned above" and yanked focus into the sidebar.
 * Horizontal arrows may cross (←/→ enter and leave the rail). BottomNav is
 * intentionally part of "content" so ↑/↓ can still reach the mobile tab bar.
 */
function getVerticalBand(el: HTMLElement): string {
    return el.closest('aside') ? 'rail' : 'content';
}

function runDirectionalNav(direction: string) {
    const scope = getActiveFocusScope();
    const root: ParentNode = scope ?? document;
    const focusableElements = Array.from(root.querySelectorAll('[data-focusable="true"]')) as HTMLElement[];
    const activeElement = document.activeElement as HTMLElement | null;

    // The origin only has to be *somewhere on screen*, not a registered target.
    // A field that never got `data-focusable` is still a real position to move
    // away from, and jumping to the first element of the page instead would
    // throw the cursor across the screen when the user simply pressed up.
    // Origin outside an open scope (focus on body, or on the page behind a
    // dialog) counts as "nothing focused" so the first press lands inside.
    const hasOrigin = activeElement instanceof HTMLElement
        && activeElement !== document.body
        && (!scope || scope.contains(activeElement));

    if (!hasOrigin) {
        // Nothing focused yet — start at the first focusable element.
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        }
        return;
    }

    const currentRect = activeElement.getBoundingClientRect();
    const isVertical = direction === 'ArrowUp' || direction === 'ArrowDown';
    const currentBand = getVerticalBand(activeElement);

    // Candidates that share the current element's span on the cross axis are in
    // the same column (going up/down) or the same row (going left/right), and
    // always win over one that merely happens to be close. Weighted distance
    // alone is not enough: from a button in the settings column, a nav rail item
    // slightly below but far to the left could beat the next setting further
    // down the same column, so the cursor jumped back into the menu.
    let bestAligned: HTMLElement | null = null;
    let bestAlignedDistance = Infinity;
    let bestLoose: HTMLElement | null = null;
    let bestLooseDistance = Infinity;

    focusableElements.forEach((el) => {
        if (el === activeElement) return;
        if (isVertical && getVerticalBand(el) !== currentBand) return;

        const rect = el.getBoundingClientRect();

        // A hidden element reports a zero rect at the origin, which would make it
        // the nearest thing above and to the left of everything.
        if (rect.width === 0 && rect.height === 0) return;

        const threshold = 5; // 5px threshold for overlap/alignment

        // Filter based on direction relative to current element
        let isValid = false;
        switch (direction) {
            case 'ArrowUp':
                isValid = rect.bottom <= currentRect.top + threshold;
                break;
            case 'ArrowDown':
                isValid = rect.top >= currentRect.bottom - threshold;
                break;
            case 'ArrowLeft':
                isValid = rect.right <= currentRect.left + threshold;
                break;
            case 'ArrowRight':
                isValid = rect.left >= currentRect.right - threshold;
                break;
        }

        if (!isValid) return;

        const currentCenter = { x: currentRect.left + currentRect.width / 2, y: currentRect.top + currentRect.height / 2 };
        const candidateCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

        const dx = Math.abs(candidateCenter.x - currentCenter.x);
        const dy = Math.abs(candidateCenter.y - currentCenter.y);

        // Primary axis first, cross-axis deviation as a penalty.
        const distance = isVertical ? dy + (dx * 2) : dx + (dy * 2);

        const isAligned = isVertical
            ? rect.left < currentRect.right && rect.right > currentRect.left
            : rect.top < currentRect.bottom && rect.bottom > currentRect.top;

        if (isAligned) {
            if (distance < bestAlignedDistance) {
                bestAlignedDistance = distance;
                bestAligned = el;
            }
        } else if (distance < bestLooseDistance) {
            bestLooseDistance = distance;
            bestLoose = el;
        }
    });

    // Only leave the current column/row when nothing in it lies ahead.
    // The cast mirrors the original code: TypeScript narrows both to `never`
    // because it cannot see the assignments made inside the forEach closure.
    const target = (bestAligned ?? bestLoose) as HTMLElement | null;
    if (target) {
        target.focus();
    } else if (direction === 'ArrowUp' && activeElement.closest('[aria-roledescription="carousel"]')) {
        // Top of the hero: ↑ has nowhere to go (focus tops out on
        // Assistir / Minha lista) but the banner may still be cut off
        // if the user arrived via pointer or manual scroll. Ensure the
        // whole backdrop is visible even when focus stays put.
        activeElement.closest('[aria-roledescription="carousel"]')?.scrollIntoView(true);
    }
}
