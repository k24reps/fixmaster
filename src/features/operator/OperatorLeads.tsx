/**
 * Tab "Kontak demo" di konsol operator: pengunjung yang mengisi gerbang demo
 * landing (nama toko + WhatsApp, migrasi 0102). Teks literal Indonesia seperti
 * sisa konsol (surface internal vendor-only, lihat kepala OperatorPage.tsx).
 *
 * `leads === null` berarti RPC-nya belum ada di server (0102 belum
 * diterapkan): tab lain tetap jalan, tab ini menjelaskan sebabnya.
 */
import { useMemo, useState } from 'react';
import { Button, Card, CardBody, ConfirmDialog, EmptyState, Icon } from '@/components/ui';
import {
  adminDeleteDemoLead,
  adminSetDemoLeadContacted,
  type AdminDemoLead,
} from '@/data/supabase-client';
import { DEMO_LEAD_RETENTION_DAYS } from '@/lib/business/demoLead';
import { waLink } from '@/lib/business/notify';
import { fmtDate, localDateOf } from '@/lib/time';
import { toast } from '@/stores/toast';
import styles from './OperatorPage.module.css';

const SOURCE_LABEL: Record<AdminDemoLead['source'], string> = {
  hero: 'Landing atas',
  final: 'Landing bawah',
  demo: '/demo langsung',
};

/** 6281234567890 → 0812-3456-7890. */
function localPhone(phone: string): string {
  return ('0' + phone.slice(2)).replace(/^(\d{4})(\d{4})(\d+)$/, '$1-$2-$3');
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

function greeting(lead: AdminDemoLead): string {
  return `Halo ${lead.shopName}, ini dari FixMaster. Terima kasih sudah mencoba demo kami. Ada yang bisa kami bantu?`;
}

interface OperatorLeadsProps {
  leads: AdminDemoLead[] | null;
  onChanged: () => Promise<void>;
}

export function OperatorLeads({ leads, onChanged }: OperatorLeadsProps) {
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminDemoLead | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('id-ID');
    const digits = query.replace(/\D/g, '');
    return (leads ?? []).filter(
      (lead) =>
        !needle ||
        lead.shopName.toLocaleLowerCase('id-ID').includes(needle) ||
        (digits.length >= 3 && (lead.phone.includes(digits) || localPhone(lead.phone).replace(/\D/g, '').includes(digits))),
    );
  }, [leads, query]);

  if (leads === null) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            title="Tabel kontak demo belum ada di server"
            description="Terapkan migrasi 0102 (runbook Rilis 0102 di Self-Hosting.md), lalu muat ulang."
          />
        </CardBody>
      </Card>
    );
  }

  const pending = leads.filter((lead) => !lead.contactedAt).length;

  const toggleContacted = async (lead: AdminDemoLead) => {
    setBusyId(lead.id);
    try {
      await adminSetDemoLeadContacted(lead.id, !lead.contactedAt);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await adminDeleteDemoLead(deleting.id);
      await onChanged();
      toast.success(`Kontak ${deleting.shopName} dihapus`);
      setDeleting(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menghapus');
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <>
      <div className={styles.clientToolbar}>
        <label className={styles.searchBox}>
          <Icon name="magnifying-glass" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari nama toko atau nomor"
            aria-label="Cari kontak demo"
            autoComplete="off"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')}>
              Bersihkan
            </button>
          )}
        </label>
        <span className={styles.resultCount} aria-live="polite">
          {pending} belum dihubungi · dihapus otomatis {DEMO_LEAD_RETENTION_DAYS} hari sesudah terakhir
          diisi
        </span>
      </div>
      <Card>
        <CardBody className={visible.length ? styles.noPad : undefined}>
          {visible.length === 0 ? (
            <EmptyState
              title={leads.length === 0 ? 'Belum ada kontak dari gerbang demo' : 'Kontak tidak ditemukan'}
              description={leads.length === 0 ? undefined : 'Coba kata kunci lain atau bersihkan pencarian.'}
            />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Terakhir isi</th>
                    <th>Toko</th>
                    <th>WhatsApp</th>
                    <th>Sumber</th>
                    <th>Email</th>
                    <th>Tindak lanjut</th>
                    <th aria-label="Aksi" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((lead) => (
                    <tr key={lead.id}>
                      <td className={styles.idle}>
                        {fmtDate(localDateOf(lead.lastSeenAt))} · {timeOf(lead.lastSeenAt)}
                        {lead.visits > 1 && <span className={styles.leadVisits}>{lead.visits}× isi</span>}
                      </td>
                      <td className={styles.orgName}>
                        {lead.shopName}
                        {lead.locale === 'en' && <span className={styles.leadVisits}>EN</span>}
                      </td>
                      <td className={styles.leadPhone}>{localPhone(lead.phone)}</td>
                      <td className={styles.idle}>{SOURCE_LABEL[lead.source]}</td>
                      <td>
                        <span className={styles.leadState}>
                          <span
                            className={[styles.led, lead.notifiedAt ? styles.ledOk : styles.ledWarn].join(' ')}
                            aria-hidden
                          />
                          {lead.notifiedAt ? 'terkirim' : 'menunggu'}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.leadToggle}
                          aria-pressed={Boolean(lead.contactedAt)}
                          disabled={busyId === lead.id}
                          onClick={() => void toggleContacted(lead)}
                        >
                          <span
                            className={[styles.led, lead.contactedAt ? styles.ledOk : ''].join(' ')}
                            aria-hidden
                          />
                          {lead.contactedAt
                            ? `Dihubungi ${fmtDate(localDateOf(lead.contactedAt))}`
                            : 'Tandai dihubungi'}
                        </button>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <a
                            className={styles.leadWa}
                            href={waLink(lead.phone, greeting(lead))}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Icon name="whatsapp" aria-hidden /> Sapa
                          </a>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleting(lead)}
                            aria-label={`Hapus kontak ${lead.shopName}`}
                          >
                            <Icon name="trash" aria-hidden />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Hapus kontak ${deleting.shopName}?` : ''}
        message="Nomor WhatsApp dan nama toko dihapus permanen, misalnya atas permintaan pemilik nomor. Kalau ia mengisi gerbang lagi, kontaknya tercatat sebagai baru."
        confirmLabel="Hapus permanen"
        danger
        loading={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
