import { useCallback, useEffect, useState, type RefObject } from 'react';

export type Step = 0 | 1 | 2 | 3;

const AUTO_FIRST_MS = 1400;
const AUTO_STEP_MS = 2600;

/**
 * Bagian yang harus terlihat sebelum autoplay mulai: jejak sinkron dan notifikasi
 * ponsel duduk ±130px dari tepi atas adegan, jadi 140px cukup. Ambang rasio
 * (0,35) dulu membuat adegan diam di 1280×720, yang hanya memperlihatkan 32%.
 */
const SEEN_PX = 140;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export interface BenchSteps {
  step: Step;
  /** Pengunjung sudah menekan tuts sendiri: autoplay berhenti, perubahan diumumkan. */
  byUser: boolean;
  advance: () => void;
  /** Adegan atau strip sedang terlihat: gambar langkah berikutnya boleh dimuat. */
  visible: boolean;
}

/**
 * Satu keadaan untuk adegan penuh dan strip ponsel. Autoplay jalan sekali sampai
 * lunas begitu salah satunya terlihat, lalu diam di keadaan akhir; berhenti
 * begitu pengunjung menekan tuts. Dengan reduced motion adegan mulai dari
 * keadaan akhir, yang tetap memperlihatkan nilai sebelum → sesudah.
 */
export function useBenchSteps(targets: RefObject<HTMLElement | null>[]): BenchSteps {
  const reduced = useReducedMotion();
  const [step, setStep] = useState<Step>(() => (reduced ? 3 : 0));
  const [byUser, setByUser] = useState(false);
  // Tanpa IntersectionObserver (browser lama, jsdom) adegan dianggap terlihat.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const nodes = targets.map((ref) => ref.current).filter((node): node is HTMLElement => !!node);
    if (nodes.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const seen = new Map<Element, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const need = Math.min(SEEN_PX, entry.boundingClientRect.height * 0.5);
          seen.set(entry.target, entry.isIntersecting && entry.intersectionRect.height >= need);
        }
        setVisible([...seen.values()].some(Boolean));
      },
      { threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.75, 1] },
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
    // Ref wadah tidak berganti selama landing hidup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (reduced || byUser || !visible || step === 3) return;
    const timer = window.setTimeout(
      () => setStep((s) => (s < 3 ? ((s + 1) as Step) : s)),
      step === 0 ? AUTO_FIRST_MS : AUTO_STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [reduced, byUser, visible, step]);

  const advance = useCallback(() => {
    setByUser(true);
    setStep((s) => (s === 3 ? 0 : ((s + 1) as Step)));
  }, []);

  return { step, byUser, advance, visible };
}

