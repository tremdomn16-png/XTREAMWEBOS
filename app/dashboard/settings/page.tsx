'use client';

import { useT } from '@/app/context/I18nContext';
import { getDeviceFeatures } from '@/app/lib/device';
import AccountSection from '@/components/settings/AccountSection';
import CatalogSection from '@/components/settings/CatalogSection';
import LanguageSection from '@/components/settings/LanguageSection';
import ProfilesSection from '@/components/settings/ProfilesSection';
import ParentalSection from '@/components/settings/ParentalSection';
import SubtitlesSection from '@/components/settings/SubtitlesSection';
import TmdbSection from '@/components/settings/TmdbSection';
import TvModeSection from '@/components/settings/TvModeSection';
import DiagnosticsSection from '@/components/settings/DiagnosticsSection';
import SettingsQuickNav from '@/components/settings/SettingsQuickNav';

/** Everything that used to live in the sidebar and the home header pills. */
export default function SettingsPage() {
    const t = useT();
    // Admin blocks (sync, API keys, diagnostics) stay on phone/web/PC only.
    const features = typeof window !== 'undefined' ? getDeviceFeatures() : null;
    const showAdmin = features?.showAdminSettings !== false;

    return (
        <div className="px-6 md:px-10 lg:px-14 py-8 max-w-3xl">
            <h1 className="text-2xl md:text-3xl font-semibold text-ink mb-8">{t('settings.title')}</h1>

            <SettingsQuickNav />

            <div className="space-y-8">
                <div id="conta">
                    <AccountSection />
                </div>
                <div id="idioma" className="border-t border-line pt-8">
                    <LanguageSection />
                </div>
                {showAdmin && (
                    <div id="catalogo" className="border-t border-line pt-8">
                        <CatalogSection />
                    </div>
                )}
                <div id="perfis" className="border-t border-line pt-8">
                    <ProfilesSection />
                </div>
                <div id="adulto" className="border-t border-line pt-8">
                    <ParentalSection />
                </div>
                <div id="legendas" className="border-t border-line pt-8">
                    <SubtitlesSection />
                </div>
                {showAdmin && (
                    <div id="tmdb" className="border-t border-line pt-8">
                        <TmdbSection />
                    </div>
                )}
                <div id="modotv" className="border-t border-line pt-8">
                    <TvModeSection />
                </div>
                {showAdmin && (
                    <div id="diagnostico" className="border-t border-line pt-8 pb-4">
                        <DiagnosticsSection />
                    </div>
                )}
            </div>
        </div>
    );
}
