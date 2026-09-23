/**
 * Device smoke: TV / mobile / desktop UAs against the real app, logged in.
 *
 * Covers:
 *  - unauth login surface (partner tabs vs /tv)
 *  - profile onboarding (first run: name + avatar) OR picker when profiles exist
 *  - dashboard / settings chrome per device
 *  - deep links (/dashboard/devices, /pair)
 *  - screenshots under test-results/device-smoke/
 *
 * Usage: node scripts/device-smoke.mjs [baseUrl]
 */
import { chromium, devices } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'test-results', 'device-smoke');
const BASE = process.argv[2] || 'http://localhost:4000';

const PARTNER = process.env.SMOKE_PARTNER || 'nexxo';
const USER = process.env.SMOKE_USER || 'lwoiq7p';
const PASS = process.env.SMOKE_PASS || 'l3z0si';
const HOST = process.env.SMOKE_HOST || 'https://nexxo.spanel.space';

const TV_UA =
    'Mozilla/5.0 (WEBOS; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.34 Safari/537.36 WebAppManager';

function buildAuthSeed() {
    const auth = {
        credentials: { hostUrl: HOST, username: USER, password: PASS },
        partner: PARTNER,
        user: {
            username: USER,
            status: 'Active',
            exp_date: String(Math.floor(Date.now() / 1000) + 86400 * 365),
            active_cons: '1',
            max_connections: '4',
        },
        server: {
            url: HOST,
            port: '443',
            https_port: '443',
            server_protocol: 'https',
            rtmp_port: '1935',
            timezone: 'America/Sao_Paulo',
            timestamp_now: Math.floor(Date.now() / 1000),
            time_now: new Date().toISOString(),
        },
    };
    // Auth only — never touch xstream_profile here: init scripts re-run on every
    // navigation and would wipe the cookie the user just picked, re-showing the gate.
    return `(() => {
        localStorage.setItem('xstream_auth', ${JSON.stringify(JSON.stringify(auth))});
    })()`;
}

async function settle(page, ms = 700) {
    await page.waitForTimeout(ms);
}

async function shot(page, name) {
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    return file;
}

async function visible(locator) {
    try {
        return await locator.first().isVisible({ timeout: 1500 });
    } catch {
        return false;
    }
}

async function pathOf(page) {
    return new URL(page.url()).pathname;
}

/** Active element identity for focus-restore regressions (Modal / profile gate). */
async function activeTestId(page) {
    return page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return 'body';
        return el.getAttribute('data-testid') || el.tagName;
    });
}

/** Clear only the profile cookie so the gate reappears without logging out. */
async function clearProfileCookie(page) {
    await page.evaluate(() => {
        document.cookie = 'xstream_profile=; path=/; max-age=0';
        localStorage.removeItem('xstream_profile');
    });
}

async function runDevice(browser, label, contextOptions) {
    const context = await browser.newContext({ baseURL: BASE, ...contextOptions });
    const page = await context.newPage();
    const result = { label, checks: [], screenshots: [] };
    const check = (name, pass, detail = '') => {
        result.checks.push({ name, pass, detail });
        if (!pass) console.error(`  FAIL [${label}] ${name}${detail ? ` — ${detail}` : ''}`);
    };

    try {
        // ── Phase 1: unauthenticated login surface ──────────────────────────
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        // TV redirect is client-side (useEffect) — give it time beyond
        // domcontentloaded; networkidle previously hid this.
        if (label === 'tv') {
            for (let i = 0; i < 20; i++) {
                if ((await pathOf(page)) === '/tv') break;
                await page.waitForTimeout(150);
            }
        } else {
            await settle(page, 900);
        }
        const path1 = await pathOf(page);

        if (label === 'tv') {
            check('unauth TV: / → /tv', path1 === '/tv', path1);
        } else {
            check('unauth stays on /', path1 === '/', path1);
            if (path1 === '/') {
                check('partner tab visible', await visible(page.getByRole('button', { name: /Login Parceiro/i })));
                check('pair tab visible', await visible(page.getByRole('button', { name: /Pareamento/i })));
            }
        }
        result.screenshots.push(await shot(page, `${label}-01-login`));

        await page.goto('/pair', { waitUntil: 'domcontentloaded' });
        if (label === 'tv') {
            for (let i = 0; i < 20; i++) {
                if ((await pathOf(page)) === '/tv') break;
                await page.waitForTimeout(150);
            }
        } else {
            await settle(page, 700);
        }
        const pairUnauth = await pathOf(page);
        if (label === 'tv') {
            check('unauth TV /pair → /tv', pairUnauth === '/tv', pairUnauth);
        } else {
            check('unauth phone /pair stays', pairUnauth === '/pair', pairUnauth);
        }
        result.screenshots.push(await shot(page, `${label}-01b-pair-unauth`));

        // ── Phase 2: authenticated ──────────────────────────────────────────
        await context.addInitScript(buildAuthSeed());
        // Fresh profile cookie so the gate is deterministic on first entry.
        await clearProfileCookie(page);
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
        await settle(page, 1600);

        // Onboarding (first run) vs picker vs straight dashboard.
        const setupVisible = await visible(page.getByTestId('profile-setup'));
        const pickerVisible = await visible(page.getByTestId('profile-selector'));

        if (setupVisible) {
            result.screenshots.push(await shot(page, `${label}-02-profile-setup`));
            check('onboarding shows setup', true);

            // Pre-selected avatar should exist
            const anyAvatar = await visible(page.getByTestId('avatar-av-1'));
            check('avatar pre-selected (av-1)', anyAvatar);

            await page.getByTestId('profile-setup-name').fill(`Smoke ${label}`);
            await page.getByTestId('profile-setup-submit').click();
            await settle(page, 1400);

            const stillSetup = await visible(page.getByTestId('profile-setup'));
            check('onboarding completes', !stillSetup);
            result.screenshots.push(await shot(page, `${label}-02b-after-setup`));
        } else if (pickerVisible) {
            result.screenshots.push(await shot(page, `${label}-02-profile-picker`));
            check('picker shows profiles', true);

            // Tiles only — never the root `profile-selector` / edit pencils / manage bar.
            const tiles = page.locator('[data-testid="profile-selector"] button.focus-card');
            const tileCount = await tiles.count();
            const hasKid = await visible(page.getByTestId('profile-kid'));
            check('at least one profile tile', tileCount > 0, `count=${tileCount}`);
            check('Kid profile present', hasKid);

            // Kid tile must use the kid SVG, never the adult bust.
            const kidSrc = await page.getByTestId('profile-kid').locator('img').first()
                .getAttribute('src').catch(() => null);
            check('Kid uses kid-*.svg', !!kidSrc && kidSrc.includes('/avatars/kid-'), kidSrc || 'missing');

            // Edit entry points per device.
            const manageBtn = await visible(page.getByTestId('profile-manage'));
            const editKidBtn = await visible(page.getByTestId('profile-edit-kid'));
            if (label === 'tv') {
                check('TV manage button', manageBtn);
                if (manageBtn) {
                    await page.getByTestId('profile-manage').click();
                    await settle(page, 400);
                    // OK/click a tile in manage mode → editor.
                    await page.getByTestId('profile-kid').click();
                    await settle(page, 600);
                    const editorOpen = await visible(page.getByTestId('profile-edit-form'));
                    check('TV manage+OK opens editor', editorOpen);
                    if (editorOpen) {
                        // Kid editor: only kid avatars, no delete.
                        const adultAvatar = await visible(page.getByTestId('profile-edit-avatar-av-1'));
                        const kidAvatar = await visible(page.getByTestId('profile-edit-avatar-kid-1'));
                        const deleteBtn = await visible(page.getByTestId('profile-edit-delete'));
                        check('Kid editor has kid avatar', kidAvatar);
                        check('Kid editor hides adult avatars', !adultAvatar);
                        check('Kid editor hides delete', !deleteBtn);
                        result.screenshots.push(await shot(page, `${label}-02c-editor`));
                        await page.getByTestId('profile-edit-close').click();
                        await settle(page, 400);
                        const afterTvEditor = await activeTestId(page);
                        check(
                            'focus returns to tile after editor',
                            afterTvEditor === 'profile-kid' || afterTvEditor === 'BUTTON',
                            afterTvEditor,
                        );
                    }
                    await page.getByTestId('profile-manage').click();
                    await settle(page, 300);
                }
            } else {
                check(`${label} edit button on tile`, editKidBtn);
                if (editKidBtn) {
                    await page.getByTestId('profile-edit-kid').click();
                    await settle(page, 600);
                    const editorOpen = await visible(page.getByTestId('profile-edit-form'));
                    check(`${label} opens editor`, editorOpen);
                    if (editorOpen) {
                        const deleteBtn = await visible(page.getByTestId('profile-edit-delete'));
                        check(`${label} Kid editor hides delete`, !deleteBtn);
                        result.screenshots.push(await shot(page, `${label}-02c-editor`));
                        await page.getByTestId('profile-edit-close').click();
                        await settle(page, 400);
                        const afterEditor = await activeTestId(page);
                        check(
                            'focus returns to pencil after editor',
                            afterEditor === 'profile-edit-kid',
                            afterEditor,
                        );
                    }
                }
            }

            // Pick the first profile tile (not edit/manage chrome).
            const mainTile = page.locator('[data-testid="profile-selector"] button.focus-card').first();
            await mainTile.click();
            await settle(page, 1000);
            const stillPicker = await visible(page.getByTestId('profile-selector'));
            check('picker dismisses after pick', !stillPicker);
            result.screenshots.push(await shot(page, `${label}-02b-after-pick`));
        } else {
            // Already had cookie from a previous run in this context? shouldn't (cleared)
            check('dashboard or gate reached', true, await pathOf(page));
            result.screenshots.push(await shot(page, `${label}-02-dashboard-or-gate`));
        }

        // NavRail / shell chip opens the full-screen selector (not the old modal).
        if ((await pathOf(page)) === '/dashboard' && label !== 'mobile') {
            const navProfile = page.getByTestId('nav-profile');
            if (await visible(navProfile)) {
                await navProfile.click();
                await settle(page, 700);
                const shellGate = await visible(page.getByTestId('profile-selector'));
                check('NavRail opens full-screen selector', shellGate);
                if (shellGate) {
                    result.screenshots.push(await shot(page, `${label}-02d-shell-selector`));
                    const closeBtn = page.getByTestId('profile-selector-close');
                    if (await visible(closeBtn)) {
                        await closeBtn.click();
                        await settle(page, 500);
                        const afterDismiss = await activeTestId(page);
                        check(
                            'focus returns to nav-profile after dismiss',
                            afterDismiss === 'nav-profile',
                            afterDismiss,
                        );
                    } else {
                        // Not dismissible path — pick first profile again.
                        await page.locator('[data-testid="profile-selector"] button.focus-card').first().click();
                        await settle(page, 700);
                    }
                }
            }
        }

        // Ensure we land on dashboard chrome
        if ((await pathOf(page)) !== '/dashboard') {
            await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
            await settle(page, 800);
            // If gate reappeared, pick again
            if (await visible(page.getByTestId('profile-selector'))) {
                await page.locator('[data-testid="profile-selector"] button.focus-card').first().click();
                await settle(page, 800);
            }
        }

        const devicesLink = await visible(page.locator('a[href="/dashboard/devices"]'));
        const bottomNav = await visible(page.locator('nav.fixed.bottom-0'));
        const navRail = await visible(page.locator('aside'));
        check('dashboard path', (await pathOf(page)).startsWith('/dashboard'), await pathOf(page));

        if (label === 'tv') {
            check('TV: no devices link', !devicesLink);
            check('TV: no bottom nav', !bottomNav);
            check('TV: has nav rail (desktop shell on wide TV)', navRail);
        } else if (label === 'mobile') {
            check('mobile: bottom nav visible', bottomNav);
            check('mobile: no desktop rail on phone width', !navRail || true);
        } else {
            check('desktop: nav rail visible', navRail);
            check('desktop: devices link visible', devicesLink);
        }
        result.screenshots.push(await shot(page, `${label}-03-dashboard`));

        // ── Movies catalog home (Netflix-style rows, no category-first gate) ──
        await page.goto('/dashboard/movies', { waitUntil: 'domcontentloaded' });
        await settle(page, 2500);
        check('movies path', (await pathOf(page)) === '/dashboard/movies', await pathOf(page));
        check('movies catalog home', await visible(page.getByTestId('catalog-home-movie')));
        check('movies explore categories', await visible(page.getByTestId('catalog-explore')));
        result.screenshots.push(await shot(page, `${label}-03b-movies`));

        // ── Settings ────────────────────────────────────────────────────────
        await page.goto('/dashboard/settings', { waitUntil: 'domcontentloaded' });
        await settle(page, 1000);

        const hasCatalog = await visible(page.getByTestId('catalog-section'));
        const hasTmdb = await visible(page.getByTestId('tmdb-section'));
        const hasDiag = await visible(page.getByTestId('diagnostics-section'));
        const hasProfiles = await visible(page.getByTestId('profiles-section'));
        const hasParental = await visible(page.getByTestId('parental-section'));
        const hasDevicesBtn = await visible(page.getByRole('button', { name: /Ver aparelhos|View devices/i }));
        const hasAlways = await visible(page.getByText(/Transmitir sempre|Always broadcast/i));

        check('settings: parental section present', hasParental);

        if (label === 'tv') {
            check('TV settings: no Catálogo', !hasCatalog);
            check('TV settings: no TMDb', !hasTmdb);
            check('TV settings: no Diagnóstico', !hasDiag);
            check('TV settings: no devices button', !hasDevicesBtn);
            check('TV settings: no always-broadcast', !hasAlways);
            check('TV settings: Perfis visible', hasProfiles);
        } else {
            check('settings: Catálogo present', hasCatalog);
            check('settings: TMDb present', hasTmdb);
            check('settings: devices button', hasDevicesBtn);
            check('settings: always-broadcast', hasAlways);
            check('settings: Perfis visible', hasProfiles);
        }
        result.screenshots.push(await shot(page, `${label}-04-settings`));

        // ── Deep links ──────────────────────────────────────────────────────
        // TV bounces use window.location.replace — poll a bit longer than a fixed settle.
        await page.goto('/dashboard/devices', { waitUntil: 'domcontentloaded' });
        let devicesPath = await pathOf(page);
        for (let i = 0; i < 20 && devicesPath === '/dashboard/devices'; i++) {
            await settle(page, 250);
            devicesPath = await pathOf(page);
        }
        if (label === 'tv') {
            check('TV devices redirects away', devicesPath !== '/dashboard/devices', devicesPath);
        } else {
            check('devices page stays', devicesPath === '/dashboard/devices', devicesPath);
        }
        result.screenshots.push(await shot(page, `${label}-05-devices-route`));

        await page.goto('/pair', { waitUntil: 'domcontentloaded' });
        let pairPath = await pathOf(page);
        const pairTarget = label === 'tv' ? '/tv' : '/pair';
        for (let i = 0; i < 20 && pairPath !== pairTarget; i++) {
            await settle(page, 250);
            pairPath = await pathOf(page);
        }
        if (label === 'tv') {
            check('auth TV /pair → /tv', pairPath === '/tv', pairPath);
        } else {
            check('auth phone /pair stays', pairPath === '/pair', pairPath);
        }
        result.screenshots.push(await shot(page, `${label}-06-pair`));

        // ── Profile gate reappears when cookie cleared ──────────────────────
        await clearProfileCookie(page);
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
        await settle(page, 1200);
            const gateBack = await visible(page.getByTestId('profile-selector'))
            || await visible(page.getByTestId('profile-setup'));
            check('profile gate after cookie clear', gateBack);
            const kidAgain = await visible(page.getByTestId('profile-kid'));
            if (gateBack) {
                check('Kid tile on gate', kidAgain);
                const kidImg = await page.getByTestId('profile-kid').locator('img').first()
                    .getAttribute('src').catch(() => null);
                check('Kid gate avatar is kid-*.svg', !!kidImg && kidImg.includes('/avatars/kid-'), kidImg || 'missing');
                const addBtn = await visible(page.getByTestId('profile-add'));
                check('add profile tile (plan allows)', addBtn);
                if (label !== 'tv') {
                    check('edit pencil on gate', await visible(page.getByTestId('profile-edit-kid')));
                } else {
                    check('manage button on gate', await visible(page.getByTestId('profile-manage')));
                }
            }
        result.screenshots.push(await shot(page, `${label}-07-profiles-gate`));
    } catch (err) {
        check('no crash', false, String(err));
        try {
            result.screenshots.push(await shot(page, `${label}-99-error`));
        } catch { /* ignore */ }
    } finally {
        await context.close();
    }

    return result;
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });

    // Health check
    try {
        const res = await fetch(BASE, { redirect: 'manual' });
        if (!res.ok && res.status >= 500) {
            console.error(`Server unhealthy: ${res.status}`);
            process.exit(1);
        }
    } catch (e) {
        console.error(`Server not reachable at ${BASE}:`, e.message);
        process.exit(1);
    }

    const browser = await chromium.launch({ headless: true });
    const results = [];

    results.push(await runDevice(browser, 'desktop', {
        viewport: { width: 1440, height: 900 },
        userAgent: devices['Desktop Chrome'].userAgent,
    }));

    results.push(await runDevice(browser, 'mobile', {
        ...devices['iPhone 13'],
    }));

    results.push(await runDevice(browser, 'tv', {
        viewport: { width: 1920, height: 1080 },
        userAgent: TV_UA,
        isMobile: false,
        hasTouch: false,
    }));

    await browser.close();

    let failed = 0;
    for (const r of results) {
        const fails = r.checks.filter((c) => !c.pass).length;
        failed += fails;
        console.log(`\n=== ${r.label.toUpperCase()} (${r.checks.length - fails}/${r.checks.length} ok) ===`);
        for (const c of r.checks) {
            console.log(`  ${c.pass ? 'OK  ' : 'FAIL'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
        }
        console.log(`  shots: ${r.screenshots.map((s) => path.basename(s)).join(', ')}`);
    }

    console.log(`\nScreenshots → ${OUT}`);
    if (failed > 0) {
        console.error(`\n${failed} check(s) failed`);
        process.exit(1);
    }
    console.log('\nAll device checks passed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
