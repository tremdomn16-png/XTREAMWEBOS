'use client';

import { useRouter } from 'next/navigation';
import {
    User,
    MonitorSmartphone,
    Languages,
    Shield,
    Subtitles,
    RefreshCw,
    Image as ImageIcon,
    Radio,
    Stethoscope,
    Clapperboard,
    LucideIcon,
} from 'lucide-react';
import { useT } from '@/app/context/I18nContext';
import { getDeviceFeatures } from '@/app/lib/device';

interface QuickLink {
    id: string;
    labelKey: string;
    icon: LucideIcon;
    /** External route when set; otherwise scroll to `#id`. */
    href?: string;
    adminOnly?: boolean;
    hideOnTv?: boolean;
}

const LINKS: QuickLink[] = [
    { id: 'conta', labelKey: 'settings.quick.account', icon: User },
    { id: 'perfis', labelKey: 'settings.quick.profiles', icon: Clapperboard },
    { id: 'pareamento', labelKey: 'settings.quick.pairing', icon: MonitorSmartphone, href: '/dashboard/devices', hideOnTv: true },
    { id: 'idioma', labelKey: 'settings.quick.language', icon: Languages },
    { id: 'adulto', labelKey: 'settings.quick.parental', icon: Shield },
    { id: 'legendas', labelKey: 'settings.quick.subtitles', icon: Subtitles },
    { id: 'modotv', labelKey: 'settings.quick.tvMode', icon: Radio },
    { id: 'catalogo', labelKey: 'settings.quick.catalog', icon: RefreshCw, adminOnly: true },
    { id: 'tmdb', labelKey: 'settings.quick.tmdb', icon: ImageIcon, adminOnly: true },
    { id: 'diagnostico', labelKey: 'settings.quick.diagnostics', icon: Stethoscope, adminOnly: true },
];

/**
 * Phone-only settings hub (Netflix "My Netflix" style): a grid of destinations.
 * The full sections stay below for desktop and for smoke tests.
 */
export default function SettingsQuickNav() {
    const t = useT();
    const router = useRouter();
    const features = typeof window !== 'undefined' ? getDeviceFeatures() : null;
    const showAdmin = features?.showAdminSettings !== false;
    const showDevices = features?.showDevices !== false;

    const items = LINKS.filter((link) => {
        if (link.adminOnly && !showAdmin) return false;
        if (link.hideOnTv && !showDevices) return false;
        return true;
    });

    const go = (link: QuickLink) => {
        if (link.href) {
            router.push(link.href);
            return;
        }
        const el = document.getElementById(link.id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="md:hidden mb-8">
            <div className="grid grid-cols-3 gap-3">
                {items.map((link) => {
                    const Icon = link.icon;
                    return (
                        <button
                            key={link.id}
                            type="button"
                            data-focusable="true"
                            tabIndex={0}
                            onClick={() => go(link)}
                            className="flex flex-col items-center justify-center bg-surface border border-line rounded-xl py-4 px-2 text-ink-2 active:bg-surface-2"
                        >
                            <Icon size={22} className="text-ink mb-2" />
                            <span className="text-xs font-medium text-center leading-tight text-ink">
                                {t(link.labelKey)}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
