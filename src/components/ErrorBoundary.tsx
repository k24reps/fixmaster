import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Icon } from '@/components/ui';
import { reportError } from '@/lib/report';
import styles from './ErrorBoundary.module.css';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * When this value changes, the boundary resets and re-renders its children.
   * Pass the current route path so navigating away from a crashed page clears
   * the error automatically.
   */
  resetKey?: string;
  /**
   * Root-level boundary (last resort). Renders a full-screen fallback and a
   * "reload app" action instead of the in-layout "try again" action.
   */
  root?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render/lifecycle errors in its subtree and shows a recoverable
 * fallback instead of a blank white screen. Used at two levels:
 *   1. Root (App) — last-resort full-screen catch.
 *   2. Route (AppLayout) — catches a single page crash while keeping the
 *      sidebar/topbar usable; resets automatically on navigation.
 *
 * Note: error boundaries only catch errors during React rendering, not in
 * event handlers or async code (those surface via toasts/promise rejections).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    // Auto-recover when the reset key changes (e.g. route navigation).
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Route through the pluggable error reporter (console-only by default;
    // a real tracker like Sentry can be wired via setErrorReporter at startup).
    reportError(error, {
      source: this.props.root ? 'root' : 'route',
      componentStack: info.componentStack ?? undefined,
    });
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <ErrorFallback error={error} root={this.props.root} onRetry={this.reset} />;
  }
}

interface ErrorFallbackProps {
  error: Error;
  /** Full-screen last-resort variant with a "reload app" action. */
  root?: boolean;
  /** Omitted by the router variant: there is nothing to reset without a boundary. */
  onRetry?: () => void;
}

/**
 * Tampilan galat bersama. Dipakai oleh ErrorBoundary (galat render React)
 * DAN oleh errorElement React Router (galat pemuatan rute) — router menangkap
 * galatnya sendiri sebelum sampai ke error boundary React, jadi tanpa ini
 * pengguna produksi melihat layar bawaan React Router yang berbunyi
 * "Hey developer".
 */
export function ErrorFallback({ error, root, onRetry }: ErrorFallbackProps) {
  const faultCode = root ? 'FX-SYS-500' : 'FX-MOD-500';
  return (
    <div className={[styles.wrap, root ? styles.rootWrap : ''].join(' ')} role="alert">
      <div className={styles.panel}>
        <span className={[styles.screw, styles.screwTL].join(' ')} aria-hidden />
        <span className={[styles.screw, styles.screwTR].join(' ')} aria-hidden />
        <span className={[styles.screw, styles.screwBL].join(' ')} aria-hidden />
        <span className={[styles.screw, styles.screwBR].join(' ')} aria-hidden />

        <div className={styles.faultHead}>
          <span className={styles.faultStamp}>
            <span className={styles.led} /> FAULT
          </span>
          <span className={styles.faultCode}>{faultCode}</span>
        </div>

        <span className={styles.icon}>
          <Icon name="triangle-exclamation" aria-hidden />
        </span>
        <h1 className={styles.title}>Terjadi kesalahan</h1>
        <p className={styles.desc}>
          {root
            ? 'Aplikasi mengalami gangguan tak terduga. Muat ulang untuk melanjutkan.'
            : 'Halaman ini gagal dimuat. Coba lagi, atau kembali ke dashboard.'}
        </p>

        {import.meta.env.DEV && <pre className={styles.detail}>{error.message}</pre>}

        <div className={styles.actions}>
          {root ? (
            <button
              className={styles.btnPrimary}
              onClick={() => window.location.reload()}
            >
              <Icon name="repeat" aria-hidden /> Muat Ulang Aplikasi
            </button>
          ) : (
            <>
              <button className={styles.btnPrimary} onClick={onRetry}>
                <Icon name="repeat" aria-hidden /> Coba Lagi
              </button>
              <a className={styles.btnGhost} href="/">
                <Icon name="arrow-left" aria-hidden /> Ke Dashboard
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
