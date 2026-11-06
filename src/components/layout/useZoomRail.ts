import { useState } from 'react';
import { RAIL_ZOOM, useZoomStore } from '@/stores/zoom';

/**
 * Status ciut sidebar. Mulai RAIL_ZOOM sidebar lebar memakan sepertiga layar
 * laptop (media query tidak melihat zoom), jadi ia menciut ke rail saat ambang
 * dilewati, dan kembali saat turun lagi, kecuali pengguna mengubahnya sendiri
 * di antaranya. Hanya PERPINDAHAN ambang yang bertindak: pengguna yang membuka
 * sidebar di 125% tidak dipaksa menciut lagi saat naik ke 150%.
 */
export function useZoomRail(): [collapsed: boolean, toggle: () => void] {
  const railZoom = useZoomStore((s) => s.zoom >= RAIL_ZOOM);
  const [collapsed, setCollapsed] = useState(railZoom);
  const [autoRail, setAutoRail] = useState(railZoom);
  const [seenRailZoom, setSeenRailZoom] = useState(railZoom);

  // Penyesuaian state saat render (pola React untuk "state turunan yang bisa
  // ditimpa"), bukan effect: tidak ada satu frame pun dengan sidebar lebar di
  // 150%.
  if (railZoom !== seenRailZoom) {
    setSeenRailZoom(railZoom);
    if (railZoom && !collapsed) {
      setCollapsed(true);
      setAutoRail(true);
    } else if (!railZoom && autoRail) {
      setCollapsed(false);
      setAutoRail(false);
    }
  }

  const toggle = () => {
    setCollapsed((c) => !c);
    setAutoRail(false);
  };
  return [collapsed, toggle];
}
