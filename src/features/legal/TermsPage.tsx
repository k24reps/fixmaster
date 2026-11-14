import { useEffect } from 'react';
import { LegalLayout } from './LegalLayout';
import { useT } from '@/i18n';

/**
 * Public Terms of Service. Covers per-unit pricing and the prepaid balance (0101),
 * acceptable use, payment/cancellation, liability limits, and termination.
 * Good-faith template — review by a legal professional before launch.
 */
export function TermsPage() {
  const t = useT();
  useEffect(() => {
    const prev = document.title;
    document.title = t('legal.termsDocTitle');
    return () => {
      document.title = prev;
    };
  }, [t]);

  return (
    <LegalLayout
      title={t('legal.termsTitle')}
      docId="SK-001"
      intro={t('legal.termsIntro')}
      updated="2026-11-14"
    >
      <div className="callout">
        <p>
          <strong>Catatan:</strong> Dokumen ini adalah template umum yang disusun dengan itikad
          baik. Sebelum peluncuran komersial, mohon ditinjau oleh profesional hukum agar sesuai
          dengan model bisnis dan yurisdiksi Anda.
        </p>
      </div>

      <p>
        Dengan mendaftar atau menggunakan FixMaster ("Layanan"), Anda menyetujui Syarat &amp;
        Ketentuan ini. Jika Anda tidak setuju, mohon untuk tidak menggunakan Layanan.
      </p>

      <h2>1. Layanan</h2>
      <p>
        FixMaster menyediakan aplikasi berbasis web untuk manajemen usaha reparasi gadget dan
        elektronik, mencakup tiket servis, kasir (POS), inventori, keuangan, absensi, tugas
        internal, dan laporan. Semua fitur tersedia untuk setiap akun; tidak ada paket yang
        membedakan fitur, jumlah pengguna, atau jumlah outlet.
      </p>

      <h2>2. Akun &amp; Tanggung Jawab</h2>
      <ul>
        <li>Anda bertanggung jawab atas keakuratan data yang Anda masukkan.</li>
        <li>Anda menjaga kerahasiaan kredensial akun dan seluruh aktivitas di dalamnya.</li>
        <li>
          Anda bertanggung jawab atas data pelanggan yang Anda kelola, termasuk memperoleh dasar
          yang sah untuk memprosesnya.
        </li>
      </ul>

      <h2>3. Harga &amp; Saldo Unit</h2>
      <ul>
        <li>
          <strong>Harga:</strong> Rp 1.000 untuk setiap tiket servis yang dibuat (satu unit),
          dipotong dari saldo unit akun Anda. Penjualan kasir dan klaim garansi tidak memotong
          saldo.
        </li>
        <li>
          <strong>Kuota awal:</strong> akun baru memperoleh 50 unit gratis tanpa batas waktu.
        </li>
        <li>
          <strong>Pengembalian unit:</strong> tiket yang dibatalkan atau dihapus paling lama 10
          menit setelah dibuat mendapat unitnya kembali, satu kali per tiket.
        </li>
        <li>
          <strong>Saldo habis:</strong> saldo boleh minus sampai 20 unit. Setelah itu pembuatan
          tiket baru ditahan sampai saldo diisi. Tiket yang sudah ada tetap dapat dikerjakan,
          ditagih, dan diserahkan.
        </li>
      </ul>

      <h2>4. Pengisian Saldo</h2>
      <p>
        Saldo diisi di muka, minimal Rp 50.000 dalam kelipatan Rp 1.000. Saat ini pengisian
        dilakukan lewat transfer bank yang dikonfirmasi melalui WhatsApp; saldo bertambah setelah
        pembayaran diverifikasi. Saldo tidak memiliki masa berlaku dan tidak dapat dikembalikan
        atau diuangkan, kecuali diwajibkan hukum.
      </p>

      <h2>5. Penggunaan yang Dilarang</h2>
      <ul>
        <li>Menggunakan Layanan untuk aktivitas melanggar hukum.</li>
        <li>Mencoba mengakses data tenant lain atau menembus keamanan sistem.</li>
        <li>Mengganggu, membebani, atau merekayasa balik Layanan tanpa izin.</li>
      </ul>

      <h2>6. Ketersediaan Layanan</h2>
      <p>
        Kami berupaya menjaga Layanan tetap tersedia, namun tidak menjamin operasi tanpa
        gangguan. Pemeliharaan terjadwal atau gangguan tak terduga dapat memengaruhi akses untuk
        sementara.
      </p>

      <h2>7. Data Anda</h2>
      <p>
        Anda memiliki data yang Anda masukkan. Kami memprosesnya sesuai{' '}
        <a href="/privacy">Kebijakan Privasi</a>. Anda dapat mengekspor atau meminta penghapusan
        data sesuai ketentuan yang berlaku.
      </p>

      <h2>8. Batasan Tanggung Jawab</h2>
      <p>
        Sejauh diizinkan hukum, FixMaster tidak bertanggung jawab atas kerugian tidak langsung,
        insidental, atau konsekuensial yang timbul dari penggunaan Layanan. Layanan disediakan
        "sebagaimana adanya" tanpa jaminan tersirat di luar yang diwajibkan hukum.
      </p>

      <h2>9. Penghentian</h2>
      <p>
        Anda dapat berhenti menggunakan Layanan dan menghapus akun kapan saja. Kami dapat
        menangguhkan atau menghentikan akses bila terjadi pelanggaran ketentuan ini.
      </p>

      <h2>10. Perubahan Ketentuan</h2>
      <p>
        Kami dapat memperbarui ketentuan ini. Perubahan material akan diinformasikan melalui
        aplikasi atau email. Penggunaan berkelanjutan setelah perubahan berarti Anda menyetujui
        ketentuan yang diperbarui.
      </p>

      <h2>11. Kontak</h2>
      <p>
        Pertanyaan terkait ketentuan ini dapat dikirim ke kontak dukungan FixMaster yang
        tercantum di situs atau aplikasi resmi kami.
      </p>
    </LegalLayout>
  );
}
