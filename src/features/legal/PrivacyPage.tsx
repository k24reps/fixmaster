import { useEffect } from 'react';
import { LegalLayout } from './LegalLayout';

/**
 * Public Privacy Policy. Content is structured around Indonesia's UU PDP
 * No. 27/2022 (lawful basis, data subject rights, retention, controller
 * contact). This is a good-faith template — it must be reviewed by a legal
 * professional before public launch (see the in-page disclaimer).
 */
export function PrivacyPage() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'Kebijakan Privasi — FixMaster';
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <LegalLayout
      title="Kebijakan Privasi"
      docId="PRIVASI-001"
      intro="Bagaimana FixMaster mengumpulkan, menggunakan, dan melindungi data Anda serta data pelanggan usaha reparasi Anda."
      updated="2026-09-27"
    >
      <div className="callout">
        <p>
          <strong>Catatan:</strong> Dokumen ini adalah template umum yang disusun dengan
          itikad baik mengacu pada UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi
          (UU PDP). Sebelum peluncuran komersial, mohon ditinjau oleh profesional hukum
          agar sesuai dengan praktik bisnis dan yurisdiksi Anda.
        </p>
      </div>

      <p>
        FixMaster ("kami") adalah aplikasi manajemen usaha reparasi gadget dan elektronik.
        Kebijakan ini menjelaskan praktik kami terkait data pribadi. Dengan menggunakan
        FixMaster, Anda menyetujui pengumpulan dan penggunaan informasi sesuai kebijakan ini.
      </p>

      <h2>1. Data yang Kami Kumpulkan</h2>
      <ul>
        <li>
          <strong>Data akun:</strong> alamat email dan kata sandi (tersimpan dalam bentuk
          ter-enkripsi) yang Anda berikan saat mendaftar.
        </li>
        <li>
          <strong>Data usaha:</strong> nama usaha, data karyawan, dan konfigurasi yang Anda
          masukkan untuk mengoperasikan aplikasi.
        </li>
        <li>
          <strong>Data operasional:</strong> tiket servis, transaksi penjualan, inventori,
          keuangan, dan tugas yang Anda buat di dalam aplikasi.
        </li>
        <li>
          <strong>Data pelanggan Anda:</strong> nama, nomor telepon, dan perangkat pelanggan
          yang Anda input. Anda bertindak sebagai pengendali data atas informasi ini; FixMaster
          memprosesnya atas nama Anda.
        </li>
        <li>
          <strong>Data teknis:</strong> log aktivitas terbatas yang diperlukan untuk keamanan
          dan pemeliharaan layanan.
        </li>
      </ul>

      <h2>2. Dasar &amp; Tujuan Pemrosesan</h2>
      <p>Kami memproses data untuk tujuan berikut:</p>
      <ul>
        <li>Menyediakan dan mengoperasikan fitur FixMaster.</li>
        <li>Memproses langganan dan pembayaran (melalui penyedia pembayaran pihak ketiga).</li>
        <li>Menjaga keamanan, mencegah penyalahgunaan, dan memenuhi kewajiban hukum.</li>
        <li>Memberikan dukungan teknis saat Anda memintanya.</li>
      </ul>

      <h2>3. Penyimpanan &amp; Lokasi Data</h2>
      <p>
        Data disimpan di server yang kami kelola di pusat data di Jakarta, Indonesia, dengan
        isolasi antar-tenant (Row Level Security), sehingga data satu usaha tidak dapat
        diakses usaha lain. Lalu lintas ke server melewati jaringan Cloudflare dan selalu
        terenkripsi (HTTPS). Salinan cadangan dibuat dua kali sehari, dienkripsi (AES-256)
        sebelum dikirim, lalu disimpan di layanan penyimpanan cloud. Pembayaran langganan
        dikonfirmasi secara manual; kami tidak menyimpan detail kartu Anda.
      </p>

      <h2>4. Pembagian Data ke Pihak Ketiga</h2>
      <p>
        Kami tidak menjual data Anda. Kami hanya membagikan data kepada pemroses yang
        diperlukan untuk menjalankan layanan (mis. penyedia server, jaringan, dan pengiriman email),
        atau bila diwajibkan oleh hukum.
      </p>

      <h2>5. Hak Anda sebagai Subjek Data</h2>
      <p>Sesuai UU PDP, Anda berhak untuk:</p>
      <ul>
        <li>Mengakses dan memperoleh salinan data pribadi Anda.</li>
        <li>Memperbaiki data yang tidak akurat.</li>
        <li>Menghapus data Anda (penghapusan akun).</li>
        <li>Menarik persetujuan dan membatasi pemrosesan.</li>
        <li>Memperoleh portabilitas data dalam format yang lazim digunakan.</li>
      </ul>
      <p>
        Untuk menggunakan hak ini, hubungi kami melalui kontak di bagian akhir. Sebagian hak
        ini dapat Anda jalankan langsung dari menu Pengaturan aplikasi.
      </p>

      <h2>6. Retensi Data</h2>
      <p>
        Kami menyimpan data selama akun Anda aktif. Setelah penghapusan akun, data akan dihapus
        atau dianonimkan dalam jangka waktu wajar, kecuali penyimpanan lebih lanjut diwajibkan
        oleh hukum (mis. catatan keuangan/perpajakan).
      </p>

      <h2>7. Keamanan</h2>
      <p>
        Kami menerapkan langkah teknis dan organisasi yang wajar — enkripsi saat transit,
        kontrol akses berbasis peran, dan isolasi data antar-tenant. Tidak ada sistem yang 100%
        aman; Anda turut bertanggung jawab menjaga kerahasiaan kata sandi akun Anda.
      </p>

      <h2>8. Perubahan Kebijakan</h2>
      <p>
        Kami dapat memperbarui kebijakan ini sewaktu-waktu. Perubahan material akan
        diinformasikan melalui aplikasi atau email. Tanggal "terakhir diperbarui" di atas
        menunjukkan versi berlaku.
      </p>

      <h2>9. Kontak</h2>
      <p>
        Pertanyaan terkait privasi atau permintaan hak data dapat dikirim ke kontak dukungan
        FixMaster yang tercantum di situs atau aplikasi resmi kami.
      </p>
    </LegalLayout>
  );
}
