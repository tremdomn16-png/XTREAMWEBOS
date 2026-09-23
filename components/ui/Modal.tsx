'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useNavigationOverride } from '@/app/context/NavigationContext';
import { useT } from '@/app/context/I18nContext';
import IconButton from './IconButton';

export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSNAME: Record<'sm' | 'md' | 'lg', string> = {
    sm: 'max-w-[28rem]',
    md: 'max-w-[34rem]',
    lg: 'max-w-[48rem]',
};

export default function Modal({
    isOpen,
    onClose,
    title,
    description,
    children,
    footer,
    size = 'md',
}: ModalProps) {
    const t = useT();
    const cardRef = useRef<HTMLDivElement>(null);
    // Whatever opened the modal (a poster, an icon button…) — restored on
    // close so the D-pad cursor doesn't fall back to `body` and jump to the
    // first focusable element on the entire page (app/hooks/useTvNavigation.ts).
    const triggerRef = useRef<HTMLElement | null>(null);
    // True while we are putting focus back on the trigger — the focusin trap
    // must not yank it back into a card that is about to unmount.
    const releasingRef = useRef(false);

    // A single z-index for every modal in the app (spec 00 fixes the stacking
    // mess where ad hoc modals fought over z-index).
    // The TV remote's Back key is handled through NavigationContext, not a
    // native browser back — this is what lets Back close the modal instead
    // of leaving the page.
    useNavigationOverride(isOpen ? onClose : null);

    useEffect(() => {
        if (!isOpen) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Keep Tab / programmatic focus inside the dialog. Defined before the
    // save/restore effect so on unmount this listener is removed first and
    // the restore is not pulled back into the dying card.
    useEffect(() => {
        if (!isOpen) return;
        const card = cardRef.current;
        if (!card) return;

        const pullBack = (e: FocusEvent) => {
            if (releasingRef.current) return;
            if (e.target instanceof Node && !card.contains(e.target)) {
                const first = card.querySelector<HTMLElement>('[data-focusable="true"]');
                first?.focus();
            }
        };

        document.addEventListener('focusin', pullBack);
        return () => document.removeEventListener('focusin', pullBack);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            releasingRef.current = true;
            triggerRef.current?.focus();
            triggerRef.current = null;
            releasingRef.current = false;
            return;
        }

        triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const firstFocusable = cardRef.current?.querySelector<HTMLElement>('[data-focusable="true"]');
        firstFocusable?.focus();

        // Parent may unmount us while isOpen is still true (`{editing && <Modal/>}`).
        // Cleanup restores the trigger so the D-pad doesn't fall back to <body>.
        return () => {
            const trigger = triggerRef.current;
            triggerRef.current = null;
            releasingRef.current = true;
            trigger?.focus();
            releasingRef.current = false;
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                ref={cardRef}
                role="dialog"
                aria-modal="true"
                data-focus-scope="true"
                className={[
                    'w-full bg-surface-2 border border-line rounded-xl p-6 max-h-[90vh] overflow-y-auto',
                    SIZE_CLASSNAME[size],
                ].join(' ')}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h2 className="text-lg md:text-xl font-semibold text-ink">{title}</h2>
                        {description && <p className="text-xs md:text-sm text-ink-2 mt-1">{description}</p>}
                    </div>
                    <IconButton icon={X} label={t('modal.close')} onClick={onClose} className="focus-flat" />
                </div>

                {children}

                {footer && <div className="mt-6">{footer}</div>}
            </div>
        </div>
    );
}
