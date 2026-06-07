import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

/** A child that throws on demand to trigger the boundary. */
function Boom({ explode }: { explode: boolean }): React.ReactElement {
  if (explode) throw new Error('ledakan-uji');
  return <div>konten aman</div>;
}

describe('ErrorBoundary', () => {
  // React logs caught errors to console.error; silence it for clean output.
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <Boom explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('konten aman')).toBeInTheDocument();
  });

  it('shows the recoverable fallback when a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Terjadi kesalahan')).toBeInTheDocument();
    expect(screen.getByText('Coba Lagi')).toBeInTheDocument();
  });

  it('shows the root fallback variant with a reload action', () => {
    render(
      <ErrorBoundary root>
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Muat Ulang Aplikasi')).toBeInTheDocument();
  });

  it('auto-resets when resetKey changes (e.g. navigation)', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/a">
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Navigate: new resetKey + non-throwing child → boundary clears.
    rerender(
      <ErrorBoundary resetKey="/b">
        <Boom explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('konten aman')).toBeInTheDocument();
  });
});
