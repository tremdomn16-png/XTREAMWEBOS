'use client';

import { useT } from '@/app/context/I18nContext';
import { QrCode, Keyboard, CheckCircle2 } from 'lucide-react';

/**
 * Numbered pairing walkthrough shown above the approve form (phone-first).
 * Desktop keeps the same steps in a single row; phone stacks them.
 */
export default function PairingSteps() {
    const t = useT();

    const steps = [
        {
            icon: QrCode,
            title: t('devices.steps.step1Title'),
            desc: t('devices.steps.step1Desc'),
        },
        {
            icon: Keyboard,
            title: t('devices.steps.step2Title'),
            desc: t('devices.steps.step2Desc'),
        },
        {
            icon: CheckCircle2,
            title: t('devices.steps.step3Title'),
            desc: t('devices.steps.step3Desc'),
        },
    ];

    return (
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                    <li
                        key={step.title}
                        className="flex md:flex-col items-start bg-surface border border-line rounded-xl p-4"
                    >
                        <span
                            className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-soft text-brand text-sm font-bold flex items-center justify-center mr-3 md:mr-0 md:mb-3"
                            aria-hidden="true"
                        >
                            {index + 1}
                        </span>
                        <div className="min-w-0 md:flex md:flex-col md:items-start">
                            <div className="flex items-center md:mb-1">
                                <Icon size={16} className="text-ink-2 mr-2 flex-shrink-0" />
                                <span className="text-sm font-semibold text-ink">{step.title}</span>
                            </div>
                            <p className="text-xs text-ink-2 leading-relaxed">{step.desc}</p>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}
