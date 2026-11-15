import { useEffect, useMemo, useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { useI18n } from '../i18n';
import { cn } from '../utils/cn';
import {
  backgroundLabel,
  backgroundStyle,
  INSTANCE_BACKGROUNDS,
  INSTANCE_SYMBOLS,
  instanceIconAsset,
  randomInstanceIcon,
  resolveInstanceIcon,
  symbolLabel,
  type InstanceIconConfig,
  type InstanceSymbolCategory,
} from '../utils/instanceIcons';
import { InstanceIcon } from './InstanceIcon';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

interface InstanceIconEditorModalProps {
  open: boolean;
  config: Partial<InstanceIconConfig> | null;
  /** Ключ для оформления по умолчанию, если config пустой. */
  seed?: string;
  onClose: () => void;
  onApply: (config: InstanceIconConfig) => void;
}

const GROUPS: Array<{ id: InstanceSymbolCategory; label: string }> = [
  { id: 'loader', label: 'Модлоадеры' },
  { id: 'modded', label: 'Предметы из модов' },
  { id: 'vanilla', label: 'Базовый мир' },
];

export function InstanceIconEditorModal({
  open,
  config,
  seed,
  onClose,
  onApply,
}: InstanceIconEditorModalProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<InstanceIconConfig>(() =>
    resolveInstanceIcon(config, seed ?? ''),
  );

  useEffect(() => {
    if (open) setDraft(resolveInstanceIcon(config, seed ?? ''));
  }, [open, config, seed]);

  const grouped = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        items: INSTANCE_SYMBOLS.filter((symbol) => symbol.category === group.id),
      })),
    [],
  );

  return (
    <Modal
      open={open}
      stacked
      title={t('Оформление сборки')}
      subtitle={t('Фон и предмет для карточки, дока и окна сборки')}
      onClose={onClose}
      className="max-w-[720px]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Отмена')}
          </Button>
          <Button
            variant="accent"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            {t('Применить')}
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-4 rounded-[12px] border border-line bg-bg-well/55 p-3">
        <InstanceIcon
          icon={draft.icon}
          background={draft.background}
          className="h-[88px] w-[88px] shrink-0 rounded-[14px] shadow-[0_14px_28px_-16px_rgba(0,0,0,0.8)]"
        />
        <div className="flex min-w-0 flex-1 gap-2">
          <InstanceIcon
            icon={draft.icon}
            background={draft.background}
            className="h-10 w-10 shrink-0 rounded-[9px]"
          />
          <InstanceIcon
            icon={draft.icon}
            background={draft.background}
            className="h-7 w-7 shrink-0 rounded-[7px]"
          />
          <InstanceIcon
            icon={draft.icon}
            background={draft.background}
            className="h-5 w-5 shrink-0 rounded-[5px]"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setDraft(randomInstanceIcon(draft))}
        >
          <RefreshCw size={13} />
          {t('Случайно')}
        </Button>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <span className="hl-field-label mb-0">{t('Фон')}</span>
          <span className="text-[11.5px] text-faint">{t(backgroundLabel(draft.background))}</span>
        </div>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
          {INSTANCE_BACKGROUNDS.map((option) => {
            const selected = option.id === draft.background;
            return (
              <button
                key={option.id}
                type="button"
                title={t(option.label)}
                aria-pressed={selected}
                onClick={() => setDraft((prev) => ({ ...prev, background: option.id }))}
                style={backgroundStyle(option.id)}
                className={cn(
                  'relative aspect-square rounded-[10px] border transition-transform duration-150 hover:scale-[1.05]',
                  selected
                    ? 'border-white/70 ring-2 ring-accent/45'
                    : 'border-black/25 hover:border-white/40',
                )}
              >
                {selected && (
                  <Check
                    size={13}
                    strokeWidth={3}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <span className="hl-field-label mb-0">{t('Предмет')}</span>
          <span className="text-[11.5px] text-faint">{t(symbolLabel(draft.icon))}</span>
        </div>

        <div className="space-y-2.5">
          {grouped.map((group) => (
            <div key={group.id}>
              <p className="mb-1 text-[10.5px] font-medium tracking-[0.08em] text-faint uppercase">
                {t(group.label)}
              </p>
              <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
                {group.items.map((symbol) => {
                  const selected = symbol.id === draft.icon;
                  return (
                    <button
                      key={symbol.id}
                      type="button"
                      title={t(symbol.label)}
                      aria-pressed={selected}
                      onClick={() => setDraft((prev) => ({ ...prev, icon: symbol.id }))}
                      className={cn(
                        'relative aspect-square rounded-[10px] border p-0.5 transition-transform duration-150 hover:scale-[1.06]',
                        selected
                          ? 'border-accent/70 bg-accent/12 ring-1 ring-accent/25'
                          : 'border-transparent bg-white/[0.035] hover:border-line-strong hover:bg-white/[0.07]',
                      )}
                    >
                      <img
                        src={instanceIconAsset(symbol.id)}
                        alt=""
                        draggable={false}
                        className="h-full w-full object-contain select-none"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
