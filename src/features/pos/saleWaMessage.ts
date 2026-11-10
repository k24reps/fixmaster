import { fmtRp } from '@/lib/format';
import { interpolate } from '@/lib/business/notify';
import type { Sale } from '@/data/types';

/** Isi struk WA: dipakai panel LUNAS dan kirim ulang dari riwayat. */
export const saleWaMessage = (template: string, shop: string, sale: Sale) =>
  interpolate(template, {
    shop,
    no: sale.saleNo,
    items: sale.lines.map((l) => `${l.qty}× ${l.name}`).join('\n'),
    total: fmtRp(sale.total),
  });
