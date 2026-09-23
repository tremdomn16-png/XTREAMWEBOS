/**
 * Temporary visual pass: hero + key screens at TV / desktop / mobile.
 * Usage: node scripts/visual-hero.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'test-results', 'visual-hero');
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
    return `(() => {
        localStorage.setItem('xstream_auth', ${JSON.stringify(JSON.stringify(auth))});
    })()`;
}

const DEVICES = [
    { name: 'tv', viewport: { width: 1920, height: 1080 }, userAgent: TV_UA },
    {
        name: 'desktop',
        viewport: { width: 1366, height: 768 },
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    {
        name: 'mobile',
        viewport: { width: 390, height: 844 },
        userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
    },
];

const SCREENS = [
    { name: 'home', path: '/dashboard' },
    { name: 'movies', path: '/dashboard/movies' },
    { name: 'series', path: '/dashboard/series' },
    { name: 'live', path: '/dashboard/live' },
    { name: 'favorites', path: '/dashboard/favorites' },
    { name: 'settings', path: '/dashboard/settings' },
    { name: 'search', path: '/dashboard/search' },
];

async function settle(page, ms = 800) {
    await page.waitForTimeout(ms);
}

async function shot(page, name) {
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    return file;
}

async function visible(locator, timeout = 1500) {
    try {
        return await locator.first().isVisible({ timeout });
    } catch {
        return false;
    }
}

async function ensureProfile(page) {
    if (await visible(page.getByTestId('profile-setup'), 800)) {
        await page.getByTestId('profile-setup-name').fill('Visual');
        await page.getByTestId('profile-setup-submit').click();
        await settle(page, 1200);
        return;
    }
    if (await visible(page.getByTestId('profile-selector'), 800)) {
        const mainTile = page
            .locator('[data-testid="profile-selector"] button.focus-card')
            .first();
        await mainTile.click();
        await settle(page, 1000);
    }
}

async function runDevice(browser, device) {
    const context = await browser.newContext({
        baseURL: BASE,
        viewport: device.viewport,
        userAgent: device.userAgent,
        isMobile: device.isMobile,
        hasTouch: device.hasTouch,
        deviceScaleFactor: device.deviceScaleFactor,
    });
    await context.addInitScript(buildAuthSeed());
    const page = await context.newPage();
    const label = device.name;
    const shots = [];

    try {
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
        await settle(page, 1600);
        await ensureProfile(page);

        // Profile gate can reappear after setup
        if (await visible(page.getByTestId('profile-selector'), 600)) {
            await ensureProfile(page);
        }

        for (const screen of SCREENS) {
            await page.goto(screen.path, { waitUntil: 'domcontentloaded' });
            await settle(page, 1200);
            // Re-enter profile if gate shows mid-run
            if (await visible(page.getByTestId('profile-selector'), 500)) {
                await ensureProfile(page);
                await page.goto(screen.path, { waitUntil: 'domcontentloaded' });
                await settle(page, 1000);
            }

            await page.evaluate(() => window.scrollTo(0, 0));
            await settle(page, 300);
            shots.push(await shot(page, `${label}-${screen.name}-top`));

            // Focus hero CTA if present (scrolls full banner into view)
            const watch = page.getByRole('button', { name: /Assistir/i }).first();
            if (await visible(watch, 800)) {
                await watch.evaluate((el) => {
                    el.focus();
                    el.scrollIntoView(true);
                });
                await settle(page, 400);
                shots.push(await shot(page, `${label}-${screen.name}-assistir`));
            }

            // Bottom of page (content rails / footer chrome)
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await settle(page, 400);
            shots.push(await shot(page, `${label}-${screen.name}-bottom`));
        }

        console.log(`OK ${label}: ${shots.length} screenshots`);
        return { label, shots, ok: true };
    } catch (err) {
        console.error(`FAIL ${label}: ${err.message}`);
        await page.screenshot({ path: path.join(OUT, `${label}-fail.png`) }).catch(() => {});
        return { label, error: err.message, ok: false };
    } finally {
        await context.close();
    }
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const results = [];
    // Sequential: one device at a time (no piled-up tabs).
    for (const device of DEVICES) {
        results.push(await runDevice(browser, device));
    }
    await browser.close();
    const failed = results.filter((r) => !r.ok);
    console.log(JSON.stringify({ results: results.map(({ shots, ...r }) => ({ ...r, shotCount: shots?.length || 0 })), out: OUT }, null, 2));
    process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
