/**
 * Temporary: diagnose hero backdrop/text opacity across devices.
 * Usage: node scripts/visual-hero-diag.mjs [baseUrl]
 */
import { chromium } from 'playwright';
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
    { name: 'desktop', viewport: { width: 1366, height: 768 } },
    { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
];

async function main() {
    const browser = await chromium.launch({ headless: true });

    for (const device of DEVICES) {
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

        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        if (await page.getByTestId('profile-selector').first().isVisible({ timeout: 1500 }).catch(() => false)) {
            await page.locator('[data-testid="profile-selector"] button.focus-card').first().click();
            await page.waitForTimeout(1500);
        }

        await page.goto('/dashboard/movies', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);

        const diag = await page.evaluate(() => {
            const root = document.querySelector('[aria-roledescription="carousel"]');
            if (!root) return { error: 'no hero' };
            const h1 = root.querySelector('h1');
            const p = root.querySelector('p');
            const buttons = Array.from(root.querySelectorAll('button')).map((b) => ({
                text: b.textContent?.trim(),
                focusable: b.getAttribute('data-focusable'),
            }));
            const bgs = Array.from(root.querySelectorAll('[style*="background"]')).map((el) => {
                const bg = getComputedStyle(el).backgroundImage;
                const op = getComputedStyle(el).opacity;
                const r = el.getBoundingClientRect();
                return { bg: bg.slice(0, 120), op, w: r.width, h: r.height };
            });
            const content = root.querySelector('.justify-end');
            const contentStyle = content ? getComputedStyle(content.parentElement?.parentElement || content) : null;
            const anim = root.querySelector('.duration-700');
            const animStyle = anim ? getComputedStyle(anim) : null;
            return {
                heroH: root.getBoundingClientRect().height,
                h1: h1 ? { text: h1.textContent, color: getComputedStyle(h1).color, opacity: getComputedStyle(h1).opacity } : null,
                p: p ? { opacity: getComputedStyle(p).opacity } : null,
                buttons,
                bgs,
                anim: animStyle ? { opacity: animStyle.opacity, transform: animStyle.transform, cls: anim.className } : null,
                vh: window.innerHeight,
                scrollY: window.scrollY,
            };
        });
        console.log(`\n=== ${device.name} ===`);
        console.log(JSON.stringify(diag, null, 2));

        // Focus Watch only — the app's focusin handler must scroll the hero.
        const watch = page.locator('button:has-text("Watch"), button:has-text("Assistir")').first();
        if (await watch.isVisible({ timeout: 1000 }).catch(() => false)) {
            await watch.evaluate((el) => {
                el.focus();
            });
            await page.waitForTimeout(700);
            await page.screenshot({ path: path.join(OUT, `${device.name}-movies-watch.png`) });
            const after = await page.evaluate(() => {
                const root = document.querySelector('[aria-roledescription="carousel"]');
                const h1 = root?.querySelector('h1');
                return {
                    scrollY: window.scrollY,
                    heroTop: root?.getBoundingClientRect().top,
                    h1Top: h1?.getBoundingClientRect().top,
                    h1Opacity: h1 ? getComputedStyle(h1).opacity : null,
                };
            });
            console.log('after watch focus:', after);
        }

        await context.close();
    }

    await browser.close();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
