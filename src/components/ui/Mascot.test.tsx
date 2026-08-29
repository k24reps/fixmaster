import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Mascot } from './Mascot';

function mockMotionPreference(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );
}

describe('Mascot motion preference', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('omits indefinite SMIL motion when reduced motion is requested', () => {
    mockMotionPreference(true);
    const { container } = render(<Mascot variant="full" animated />);

    expect(container.querySelector('animate')).not.toBeInTheDocument();
    expect(container.querySelector('animateTransform')).not.toBeInTheDocument();
  });

  it('keeps the brand micro-motion when reduced motion is not requested', () => {
    mockMotionPreference(false);
    const { container } = render(<Mascot variant="full" animated />);

    expect(container.querySelector('animate')).toBeInTheDocument();
    expect(container.querySelector('animateTransform')).toBeInTheDocument();
  });
});
