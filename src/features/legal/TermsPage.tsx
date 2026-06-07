import { useEffect } from 'react';
import { LegalLayout } from './LegalLayout';

/**
 * Public Terms of Service. Covers the subscription model (trial → paid),
 * acceptable use, payment/cancellation, liability limits, and termination.
 * Good-faith template — review by a legal professional before launch.
 */
export function TermsPage() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'Syarat & Ketentuan — FixMaster';
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <LegalLayout
      title="Syarat & Ketentuan"
      intro="Ketentuan penggunaan layanan FixMaster, termasuk langganan, pembayaran, dan tanggung jawab masing-masing pihak."
      updated="2026-06-07"
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
        internal, dan laporan. Fitur yang tersedia dapat berbeda menurut paket langganan.
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

      <h2>3. Uji Coba &amp; Langganan</h2>
      <ul>
        <li>
          <strong>Uji coba:</strong> akun baru memperoleh masa uji coba 14 hari dengan akses
          fitur penuh, tanpa biaya.
        </li>
        <li>
          <strong>Berbayar:</strong> setelah uji coba, akses fitur lanjutan memerlukan langganan
          berbayar sesuai paket yang dipilih.
        </li>
        <li>
          <strong>Masa aktif:</strong> langganan diperpanjang berdasarkan pembayaran yang
          berhasil. Bila tidak diperpanjang, akses dapat dibatasi.
        </li>
      </ul>

      <h2>4. Pembayaran</h2>
      <p>
        Pembayaran diproses melalui penyedia gateway pihak ketiga (mis. QRIS). Harga yang berlaku
        ditampilkan di dalam aplikasi sebelum Anda berlangganan. Kecuali diwajibkan hukum,
        pembayaran yang telah diselesaikan untuk periode berjalan pada umumnya tidak dapat
        dikembalikan.
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
