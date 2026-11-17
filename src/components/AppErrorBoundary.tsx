import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Copy, RotateCcw } from 'lucide-react';
import { translate } from '../i18n';
import { Button } from './ui/Button';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
  copied: boolean;
}

/**
 * Страховка на случай ошибки рендера: вместо пустого окна пользователь
 * видит понятное сообщение, может перезапустить интерфейс или скопировать
 * текст ошибки для отчёта. Данные сборок при этом не затрагиваются.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null, copied: false };

  private resetCopiedTimer: number | null = null;

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error, copied: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[HydroLauncher] Ошибка интерфейса', error, info.componentStack);
  }

  componentWillUnmount() {
    if (this.resetCopiedTimer !== null) {
      window.clearTimeout(this.resetCopiedTimer);
    }
  }

  private copyDetails = async () => {
    const { error } = this.state;
    if (!error) return;
    try {
      await navigator.clipboard.writeText(error.stack || `${error.name}: ${error.message}`);
      this.setState({ copied: true });
      this.resetCopiedTimer = window.setTimeout(() => {
        this.setState({ copied: false });
        this.resetCopiedTimer = null;
      }, 1600);
    } catch {
      // Буфер обмена может быть недоступен — текст ошибки всё равно на экране.
    }
  };

  render() {
    const { error, copied } = this.state;
    if (!error) return this.props.children;

    const details = error.stack || `${error.name}: ${error.message}`;

    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-6 py-10 text-ink">
        <div className="w-full max-w-[560px] rounded-[14px] border border-line-strong bg-bg-well/95 p-6 shadow-[var(--deck-shadow)]">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-danger" />
            <div className="min-w-0">
              <h1 className="text-[15px] font-medium">
                {translate('Интерфейс столкнулся с ошибкой')}
              </h1>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                {translate(
                  'Сборки и настройки не пострадали. Перезапустите интерфейс, а если ошибка повторится — приложите текст ниже к отчёту.',
                )}
              </p>
            </div>
          </div>

          <pre className="mt-4 max-h-[240px] overflow-auto rounded-[8px] border border-line bg-surface/70 p-3 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-muted select-text cursor-text">
            {details}
          </pre>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => window.location.reload()}>
              <RotateCcw size={13} />
              {translate('Перезагрузить')}
            </Button>
            <Button variant="secondary" onClick={() => void this.copyDetails()}>
              <Copy size={13} />
              {copied ? translate('Скопировано') : translate('Скопировать текст ошибки')}
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
