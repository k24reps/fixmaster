@AGENTS.md

# Catatan khusus Claude Code

Berkas ini sengaja **tidak memuat aturan apa pun**. Sumber kebenaran tunggal
tetap `AGENTS.md`, yang diimpor di baris pertama.

## Kenapa berkas ini ada

Claude Code membaca `AGENTS.md` secara langsung sejak v2.1.277, tetapi hanya
bila tidak ada `CLAUDE.md` — dan dukungan itu mati di beberapa kondisi
(versi lebih lama, sesi yang tidak mengambil feature flag, sesi pertama
setelah pemasangan/pembaruan, atau bila plugin bawaan `agents-md` dimatikan).

Kondisi itu bukan teori: pada sesi 21-22 September 2026, `AGENTS.md` TIDAK
termuat meski tidak ada `CLAUDE.md` sama sekali. Akibatnya satu sesi penuh —
audit logika bisnis, migrasi 0069-0079, pembersihan `/simplify`, dan fitur
ekspor PDF — berjalan tanpa aturan §3 (konvensi), §4 (probe regresi UI), §5
(pemeliharaan vault same-turn), dan §6 (saran model). Vault jadi basi tanpa
jejak, persis yang dikhawatirkan §5.

Impor `@AGENTS.md` adalah cara yang direkomendasikan dokumentasi resmi untuk
repo bersumber-tunggal: ia bekerja di SEMUA sesi, termasuk yang tidak bisa
memuat `AGENTS.md` langsung, dan tidak menggandakan isinya.
https://code.claude.com/docs/en/memory.md

Simlink sengaja tidak dipakai: di Windows ia butuh hak Admin atau Developer
Mode, dan tool Edit/Write tidak menulis menembus simlink.

## Aturan khusus Claude Code

Belum ada. Tambahkan di sini HANYA yang benar-benar spesifik Claude Code
(mis. perilaku tool atau slash command). Aturan produk, domain, konvensi
kode, dan verifikasi tetap milik `AGENTS.md` — jangan disalin ke sini.
