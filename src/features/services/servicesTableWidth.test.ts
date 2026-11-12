import { describe, expect, it } from 'vitest';
import tsxRaw from './ServicesPage.tsx?raw';
import cssRaw from './ServicesPage.module.css?raw';
import detailTsxRaw from './ServiceDetailPage.tsx?raw';
import pickerTsxRaw from './SparepartPickerModal.tsx?raw';
import pickerCssRaw from './SparepartPickerModal.module.css?raw';
import detailCssRaw from './ServiceDetailPage.module.css?raw';
import tokensRaw from '../../styles/tokens.css?raw';
import { id } from '@/i18n/id';

// Checkout Windows (core.autocrlf) memberi CRLF pada ?raw; pola di bawah memakai LF.
const lf = (s: string) => s.replace(/\r\n/g, '\n');
const tsx = lf(tsxRaw);
const css = lf(cssRaw);
const detailTsx = lf(detailTsxRaw);
const pickerTsx = lf(pickerTsxRaw);
const pickerCss = lf(pickerCssRaw);
const detailCss = lf(detailCssRaw);
const tokens = lf(tokensRaw);

/**
 * Tampilan Daftar Servis berupa baris seperti Inventori & Kasir, bukan tabel.
 * Tabel dulu harus diukur lalu jatuh ke kartu saat tak muat, sehingga "Daftar"
 * sering tampil sebagai kartu. Tes ini tidak mengukur piksel (tak bisa di
 * jsdom); ia mengunci mekanismenya.
 */
describe('tampilan Daftar servis', () => {
  it('baris dengan container query, bukan tabel yang diukur lalu jatuh ke kartu', () => {
    expect(tsx).not.toContain('<table');
    expect(tsx).not.toContain('data-fit');
    expect(tsx).not.toContain('ResizeObserver');
    expect(css).toMatch(/@container svcRows/);
  });

  it('tampilan ditentukan perangkat: kartu di ponsel, daftar di layar lebar, tanpa pemilih', () => {
    // Ambang sama dengan tata letak ponsel halaman ini di CSS.
    expect(tsx).toContain("useMediaQuery('(max-width: 720px)') ? 'cards' : 'list'");
    expect(css).toContain('@media (max-width: 720px)');
    expect(tsx).not.toContain('ViewToggle');
    expect(tsx).not.toContain('usePersistedView');
    expect(tsx).not.toContain("'tiles'");
    expect(css).not.toContain('.tileGrid');
  });

  it('segmen opsional dan lajurnya mengikuti pengaturan kolom', () => {
    for (const id of ['customer', 'device']) {
      expect(tsx).toContain(`cols.has('${id}') && 'minmax(`);
    }
    expect(tsx).toContain("showTech && 'minmax(");
    for (const id of ['customer', 'device', 'cost']) {
      expect(tsx).toContain(`cols.has('${id}') && (`);
    }
    expect(tsx).toContain('showTech && (');
  });

  it('kolom Teknisi hilang sendiri bila toko tak punya yang bisa dibedakan', () => {
    // Yang dihitung nama pada tiket, bukan jumlah karyawan aktif (semua karyawan
    // bisa dipilih jadi teknisi, jadi demo berkaryawan banyak tetap satu nama).
    expect(tsx).toContain("const showTech = cols.has('technician') && distinctTechs > 1;");
    expect(tsx).toContain("new Set(services.map((s) => s.technicianName || '')).size");
    // Header, segmen, dan lajur semuanya lewat showTech; tak ada yang membaca kolomnya langsung.
    expect(tsx.match(/cols\.has\('technician'\)/g)).toHaveLength(1);
  });

  it('aksi cepat sparepart: pemilih dan jalur simpan sama dengan detail tiket', () => {
    expect(tsx).toContain('canQuickAddParts(s.status) && (');
    expect(tsx).toContain('<SparepartPickerModal');
    expect(tsx).toContain('await addServicePart(partsService, line)');
    // Lajur aksi memuat tiga tombol 40px; membuka tiket = klik barisnya.
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) 11rem 9rem 7.5rem;');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) 11rem 7.5rem;');
    // Layar sentuh: tiga tombol 44px, bukan empat.
    expect(css).toContain('11rem 9rem calc(var(--control-h) * 3)');
    expect(css).not.toContain('calc(var(--control-h) * 4)');
  });

  it('seluruh baris membuka tiket; ikon "Lihat tiket" hanya tersisa di Kartu', () => {
    expect(tsx).toContain('onClick={(e) => openTicket(e, s.id)}');
    // Kontrol di dalam baris, seleksi teks, dan klik bermodifikasi tidak ikut membuka.
    expect(tsx).toContain("closest('a, button, input, select, textarea, label')");
    expect(tsx).toContain('window.getSelection()?.toString()');
    expect(tsx).toContain('{renderActions(s)}');
    expect(tsx).toContain('{renderActions(s, true)}');
    expect(tsx).toContain('{viewLink && (');
    expect(css).toMatch(/\.rows > \.row \{\s*cursor: pointer;/);
  });

  it('judul kolom tampil hanya bila lantai semua lajur muat sebaris', () => {
    // Bawaan = mengalir dan tanpa judul; tabel hanya di blok min-width.
    expect(css).toMatch(/\.rowHead \{\s*display: none;/);
    expect(tsx).toContain('data-segs={segCount}');
    expect(css).toContain('@container svcRows (min-width: 1156px)');
    expect(css).toContain('@container svcRows (min-width: 1056px)');
    expect(css).not.toContain('@container svcRows (max-width: 1180px)');
    expect(css).not.toContain('@container svcRows (min-width: 1181px)');
  });

  it('ambang tabel tak lebih kecil dari jumlah lantai lajur + lajur kanan', () => {
    const rem = (v: string) => parseFloat(v) * 16;
    const num = '(\\d+(?:\\.\\d+)?)';
    const pick = (re: RegExp, src: string) => {
      const m = re.exec(src);
      if (!m) throw new Error(`tak ketemu: ${re}`);
      return m;
    };
    // Lantai tiap segmen, dibaca dari rowTracks di TSX.
    const floors = {
      id: rem(pick(new RegExp(`const tracks = \\[\\s*'${num}rem'`), tsx)[1]),
      customer: rem(pick(new RegExp(`cols\\.has\\('customer'\\) && 'minmax\\(${num}rem`), tsx)[1]),
      device: rem(pick(new RegExp(`cols\\.has\\('device'\\) && 'minmax\\(${num}rem`), tsx)[1]),
      notes: rem(pick(new RegExp(`showNotes && \`minmax\\(${num}rem`), tsx)[1]),
      tech: rem(pick(new RegExp(`showTech && 'minmax\\(${num}rem`), tsx)[1]),
    };
    const lanes = pick(new RegExp(`minmax\\(0, 1fr\\) ${num}rem ${num}rem ${num}rem;`), css);
    // Tiga jarak 16px antar-lajur (utama, status, biaya, aksi) + padding 16 + 4.
    const right = rem(lanes[1]) + rem(lanes[2]) + rem(lanes[3]) + 3 * 16 + 20;
    const need = (segs: number[]) => segs.reduce((a, b) => a + b, 0) + (segs.length - 1) * 12 + right;
    const five = need([floors.id, floors.customer, floors.device, floors.notes, floors.tech]);
    const four = need([floors.id, floors.customer, floors.device, floors.notes]);
    const t5 = Number(pick(/min-width: (\d+)px\) \{\s*\.rowHead/, css)[1]);
    const t4 = Number(pick(/min-width: (\d+)px\) \{\s*\.rowList:not/, css)[1]);
    expect(t5).toBeGreaterThanOrEqual(five);
    expect(t4).toBeGreaterThanOrEqual(four);
    // Persis, tak dibulatkan: pembulatan membuang ruang (Padat di 1366px = wadah 1056px).
    expect(t5 - five).toBeLessThan(8);
    expect(t4 - four).toBeLessThan(8);
  });

  it('nomor tiket dan nomor HP muat utuh di lajurnya, bukan dipotong elipsis', () => {
    // Lebar mono = 0,6em per karakter (JetBrains Mono terukur 7,2px di 12px).
    const rem = (v: string) => parseFloat(v) * 16;
    const size = (token: string) => {
      const m = new RegExp(`${token}:\\s*([\\d.]+)rem`).exec(tokens);
      if (!m) throw new Error(`token tak ketemu: ${token}`);
      return rem(m[1]);
    };
    const floor = (re: RegExp, src: string) => {
      const m = re.exec(src);
      if (!m) throw new Error(`tak ketemu: ${re}`);
      return rem(m[1]);
    };
    // Nomor HP terpanjang yang wajar: "+62 812-3456-78901" (18 karakter).
    const phoneNeed = 18 * 0.6 * size('--text-xs');
    expect(floor(/cols\.has\('customer'\) && 'minmax\((\d+(?:\.\d+)?)rem/, tsx)).toBeGreaterThanOrEqual(phoneNeed);
    // Nomor tiket terpanjang: awalan 5 huruf (batas Wizard) + "-" + 6 digit, tebal.
    const idNeed = 12 * 0.6 * size('--text-sm');
    expect(floor(/const tracks = \[\s*'(\d+(?:\.\d+)?)rem'/, tsx)).toBeGreaterThanOrEqual(idNeed);
    // Nomor HP mono; nomor tiket --text-sm tebal (bukan --text-xs).
    expect(css).toMatch(/\.phone \{\s*font-family: var\(--font-mono\);/);
    expect(tsx).toContain('className={[styles.sub, styles.phone].join(\' \')}');
    expect(css).toMatch(/\.mono \{\s*font-family: var\(--font-mono\);\s*font-size: var\(--text-sm\);\s*font-weight: var\(--fw-bold\);/);
  });

  it('tombol status muat di lajur Status: label terpanjang tak menjorok dari lajurnya', () => {
    const rem = (v: string) => parseFloat(v) * 16;
    const lane = rem(/minmax\(0, 1fr\) (\d+(?:\.\d+)?)rem (?:\d+(?:\.\d+)?)rem (?:\d+(?:\.\d+)?)rem;/.exec(css)![1]);
    const rule = /\.statusBtn \{([^}]*)\}/.exec(css)![1];
    const gap = Number(/gap: (\d+)px/.exec(rule)![1]);
    const padX = Number(/padding: \d+px (\d+)px/.exec(rule)![1]);
    // Lencana = border 1 + padding 9 tiap sisi + LED 7 + jarak 5 + teks mono kapital
    // (0,6em + tracking 0,045em per huruf, di --text-xs). Pensil = 0,7em dari 16px.
    const xs = rem(new RegExp('--text-xs:\\s*([\\d.]+)rem').exec(tokens)![1]);
    const longest = Math.max(
      ...Object.entries(id)
        .filter(([k]) => k.startsWith('statusLabel.'))
        .map(([, v]) => v.length),
    );
    const badge = 2 * (1 + 9) + 7 + 5 + longest * (0.6 + 0.045) * xs;
    const pencil = 0.7 * 16;
    // Margin negatif = padding, jadi kotak mulai satu padding di kiri lajur dan
    // ujung kanannya tak boleh melewati tepi lajur (sub-piksel dibulatkan peramban).
    expect(badge + gap + pencil + padX).toBeLessThanOrEqual(lane + 0.5);
    expect(rule).toMatch(new RegExp(`margin: -2px -${padX}px;`));
    // Bahasa UI terkunci Indonesia; label Inggris (17 karakter) akan menjorok ±8px.
    // Tinjau ulang bila kunci bahasa dibuka.
  });

  it('nama pelanggan boleh dua baris dan punya title; nomor HP juga', () => {
    expect(tsx).toContain('title={s.customerName || undefined}');
    expect(tsx).toContain('title={s.customerPhone || undefined}');
    // Hanya di baris Daftar: Kartu memakai .customerName yang sama dan tak boleh ikut berubah.
    expect(css).toMatch(/\.rowCell > \.customerName \{[^}]*-webkit-line-clamp: 2;[^}]*white-space: normal;/);
  });

  it('baris punya spine 3px dengan peta nada yang sama dengan Kartu', () => {
    // Satu peta STATUS_TONE untuk dua tampilan: dipasang sebagai data-tone di keduanya.
    expect(tsx.match(/data-tone=\{STATUS_TONE\[s\.status\]\}/g)).toHaveLength(2);
    expect(css).toMatch(/\.rows > \.row::before \{[^}]*width: 3px;/);
    expect(css).toMatch(/\.row \{\s*position: relative;/);
    // Tiap nada berbagi aturan dengan Kartu, bukan salinan yang bisa melenceng.
    for (const tone of ['info', 'warning', 'accent', 'success', 'danger']) {
      expect(css).toContain(`.jobCard[data-tone='${tone}']::before,\n.rows > .row[data-tone='${tone}']::before {`);
    }
  });

  it('strip tiket di pemilih sparepart memakai spine yang sama dengan baris (peta STATUS_TONE)', () => {
    // Spine resmi, bukan "side-stripe" hiasan: warnanya status tiket, dari peta yang sama.
    expect(pickerTsx).toContain('data-tone={STATUS_TONE[ticket.status]}');
    expect(pickerCss).toMatch(/\.context \{[^}]*border-left: 3px solid var\(--text-muted\);/);
    const tones: Record<string, string> = {
      info: '--info',
      warning: '--warning',
      accent: '--accent',
      success: '--success',
      danger: '--danger',
    };
    for (const [tone, token] of Object.entries(tones)) {
      expect(pickerCss).toContain(`.context[data-tone='${tone}'] {\n  border-left-color: var(${token});\n}`);
    }
    // Warna hanya lewat token: tak ada hex di berkasnya.
    expect(pickerCss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('kartu biaya di detail tiket berbingkai 1px (tanpa tepi kiri tebal) dan angka besar memakai token', () => {
    const notice = detailCss.slice(detailCss.indexOf('.costNotice {'));
    const noticeBody = notice.slice(0, notice.indexOf('}'));
    expect(noticeBody).not.toContain('border-left-width');
    expect(detailCss).not.toMatch(/font-size:\s*3rem/);
    expect(detailCss).toMatch(/\.nfCode \{[^}]*font-size: var\(--text-3xl\);/);
  });

  it('status ambil dan tertahan satu zona di lajur status, LED tak terjepit', () => {
    const device = tsx.slice(tsx.indexOf('data-seg="device"'), tsx.indexOf('data-seg="notes"'));
    expect(device).not.toContain('renderPickup');
    const lane = tsx.slice(tsx.indexOf('<div className={styles.rowStatus}>'));
    const laneBody = lane.slice(0, lane.indexOf('</div>'));
    expect(laneBody).toContain('{renderStatus(s)}');
    expect(laneBody.indexOf('{renderPickup(s)}')).toBeGreaterThan(laneBody.indexOf('{renderStatus(s)}'));
    expect(laneBody.indexOf('{renderStall(s)}')).toBeGreaterThan(laneBody.indexOf('{renderPickup(s)}'));
    expect(css).toMatch(/\.pickupWait::before \{[^}]*flex-shrink: 0;/);
  });

  it('tombol yang berulang tiap baris menyebut tiketnya untuk pembaca layar', () => {
    // Tombol status: nama memuat teks lencana (label-in-name) + nomor tiket.
    expect(tsx).toContain("aria-label={interpolate(t('services.statusChangeAria'), {");
    // Tombol ikon (sparepart, lihat tiket, WhatsApp, ubah) menunjuk nomor tiketnya.
    expect(tsx.match(/aria-describedby=\{noId\(s\)\}/g)).toHaveLength(4);
    // Nomor tiket di Daftar dan di Kartu memegang id-nya.
    expect(tsx.match(/ id=\{noId\(s\)\}/g)).toHaveLength(2);
    expect(tsx).toContain("const noId = (s: Service) => `svc-no-${s.id}`;");
    // Tombol ambil (manajer): nama memuat teks yang terlihat, tiket, dan akibat klik.
    expect(tsx).toContain(
      "aria-label={`${t(s.pickedUp ? 'services.pickedUp' : 'services.notPickedUp')} ${s.serviceNo}. ${action}`}",
    );
    // Pensil di tombol status juga tampil saat fokus keyboard, bukan hanya hover.
    expect(css).toContain('.statusBtn:focus-visible > svg');
  });

  it('label margin lewat teks tersembunyi; aria-label pada <span> tak dibacakan', () => {
    expect(tsx).not.toMatch(/<span[^>]*aria-label=\{interpolate\(t\('services\.(modal|profit)Aria'\)/);
    expect(tsx).toContain('<span aria-hidden>-{fmtNumber(modal)}</span>');
    expect(tsx).toContain("interpolate(t('services.modalAria'), { amount: fmtRp(modal) })");
    expect(tsx).toContain("interpolate(t('services.profitAria'), { amount: fmtRp(profit) })");
    expect(tsx.match(/className="fm-visually-hidden"/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('judul kolom yang hanya label disembunyikan dari pembaca layar; tiap sel membawa labelnya sendiri', () => {
    // Wadah judul TIDAK aria-hidden (isinya tombol urut yang bisa difokus): ia grup berlabel,
    // dan hanya label murni (Perangkat, Keluhan/Penanganan, Teknisi, Aksi) yang aria-hidden.
    const head = tsx.slice(tsx.indexOf('styles.rowHead'), tsx.indexOf('<ul className={styles.rows}>'));
    expect(head).toContain('role="group"');
    expect(head).toContain("aria-label={t('services.sortAria')}");
    expect(head).not.toMatch(/styles\.rowHead[^>]*aria-hidden/);
    expect(head).toContain('<span aria-hidden="true">{t(\'services.colDevice\')}</span>');
    expect(head).toContain('<span aria-hidden="true">{t(\'services.colTech\')}</span>');
    for (const key of ['colCustomer', 'colDevice', 'colTech', 'colCost']) {
      expect(tsx).toContain(`{srLabel('services.${key}')}`);
    }
    // Label keluhan/penanganan yang mengulang judul disembunyikan secara visual,
    // bukan display: none (yang menghapusnya dari pohon aksesibilitas).
    expect(css).not.toMatch(/\.clamp b\s*\{\s*display: none/);
    expect(css.match(/\[data-single\] \.clamp b \{\s*position: absolute;/g)).toHaveLength(2);
  });

  it('urut per kolom: empat judul adalah tombol, dropdown memuat nilai yang sama dan keduanya satu state', () => {
    const head = tsx.slice(tsx.indexOf('styles.rowHead'), tsx.indexOf('<ul className={styles.rows}>'));
    for (const [column, label] of [
      ['date', "t('services.colNo')"],
      ['customer', "t('services.colCustomer')"],
      ['status', "t('common.status')"],
      ['cost', "t('services.colCost')"],
    ]) {
      expect(head).toContain(`sortHead('${column}', ${label})`);
    }
    // Tombol sungguhan, bukan div ber-onClick; tanpa aria-sort (tak sah di luar columnheader).
    expect(tsx).toMatch(/<button\s+type="button"\s+className=\{styles\.sortBtn\}/);
    expect(tsx).not.toContain('aria-sort=');
    // Klik lewat state yang sama dengan dropdown, lewat change() (balik ke halaman pertama).
    expect(tsx).toContain('change(() => setSort(nextSort(sort, column)))');
    expect(tsx).toContain('change(() => setSort(e.target.value as ServiceSort))');
    expect(tsx).toContain('{SERVICE_SORTS.map((value) => (');
    // Urutan aktif dibacakan; panah hanya hiasan.
    expect(tsx).toContain("interpolate(t('services.sortCurrent')");
    expect(tsx).toMatch(/<Icon name=\{dir === 'descending' \? 'arrow-down' : 'arrow-up'\}[^>]*aria-hidden/);
    // Panah tak aktif tersembunyi, aktif penuh; fokus keyboard menampakkannya.
    expect(css).toMatch(/\.sortMark \{[^}]*opacity: 0;/);
    expect(css).toMatch(/\.sortBtn:hover \.sortMark,\s*\.sortBtn:focus-visible \.sortMark \{[^}]*opacity: 0\.6;/);
    expect(css).toMatch(/\.sortBtn\[data-dir='descending'\] \.sortMark \{[^}]*opacity: 1;/);
    // Target >=24px: padding 4px di sekeliling baris teks.
    expect(css).toMatch(/\.sortBtn \{[^}]*padding: 4px;/);
  });

  it('konteks daftar bertahan saat tiket dibuka: ingatan sesi, bukan state yang lenyap', () => {
    // Tampilan awal lewat satu pemutus (tautan vs ingatan), bukan baca ?status dst. satu-satu.
    expect(tsx).toContain('resolveListView({');
    expect(tsx).toContain('readListSnapshot()');
    expect(tsx).not.toContain("searchParams.get('status')");
    expect(tsx).toContain('useState(start.query)');
    expect(tsx).toContain('useState<ServiceScope>(start.scope)');
    // Setiap perubahan saringan dicatat; gulir dicatat hanya selama halaman ini masih terpasang
    // (peralihan rute memotong gulir ke 0 — itu bukan posisi daftar).
    expect(tsx).toContain('saveListView(listOwner, entryKey, {');
    expect(tsx).toContain('wrapRef.current?.isConnected');
    // Peristiwa scroll tak menggelembung dan wadahnya bisa elemen (demo): harus capture.
    expect(tsx).toMatch(/addEventListener\('scroll', onScroll, \{ capture: true/);
    // Penanda "sudah dipulihkan" dinyalakan DI DALAM rAF, supaya pembatalan efek tak menelannya.
    expect(tsx).toMatch(/requestAnimationFrame\(\(\) => \{\s*scrollRestored\.current = true;/);
  });

  it('limit dipulihkan bersama gulir, dan gulir menunggu arsip yang diminta', () => {
    // Satu sumber ukuran halaman: modul murni, bukan salinan lokal yang bisa menyimpang.
    expect(tsx).not.toMatch(/const PAGE_SIZE\b/);
    expect(tsx).toContain('useState(start.limit)');
    expect(tsx).toContain('setLimit(LIST_PAGE_SIZE);');
    expect(tsx).toContain('setLimit((n) => n + LIST_PAGE_SIZE)');
    // limit dicatat dan memicu pencatatan ulang saat "Tampilkan lebih banyak" diklik.
    const save = tsx.slice(tsx.indexOf('saveListView(listOwner, entryKey, {'));
    expect(save.slice(0, 120)).toMatch(/entryKey, \{\s*limit,/);
    expect(save).toMatch(/\}, \[\s*listOwner,\s*entryKey,\s*limit,/);
    // Pemulihan menunggu jendela DAN arsip; kosong dilewati, bukan ditunda selamanya.
    expect(tsx).toContain('const { rows: archive, pending: archivePending } = useServiceArchive({');
    expect(tsx).toContain('scrollRestoreStep({ loading, archivePending, rowCount })');
    expect(tsx).toContain("if (step === 'wait') return;");
    expect(tsx).toContain("if (step === 'skip') {");
    expect(tsx).toContain('[loading, archivePending, rowCount, initial.scrollTop]');
    // Bukan lagi sekadar "ada baris pertama": itu yang membuat gulir mendarat di halaman pendek.
    expect(tsx).not.toContain('const hasRows');
  });

  it('baris Penanganan kosong tak tampil sebelum tiket selesai', () => {
    expect(tsx).toContain('{showFixLine(s) && (');
    expect(tsx).toContain("s.status === 'selesai' || s.status === 'lunas'");
  });

  it('modal dadakan dari aksi cepat: owner/admin saja, jalur kas sama dengan detail', () => {
    expect(tsx).toContain('await addServiceModalLine(partsService, input)');
    expect(tsx).toMatch(/modalDadakan=\{\s*isManager\s*\?/);
    expect(detailTsx).toContain('await addServiceModalLine(service, input)');
    // Detail tak lagi menulis pengeluaran baru sendiri; satu jalur di data layer.
    expect(detailTsx).not.toContain('addServiceModal(');
    expect(pickerTsx).toContain('modalDadakanIssue(input)');
  });

  it('keluhan dan penanganan satu segmen, tiap barisnya tetap ikut pengaturan', () => {
    expect(tsx).toContain('const showNotes = showComplaint || showFix;');
    expect(tsx).toContain('showNotes && `minmax(');
    expect(tsx).toContain('data-seg="notes"');
    expect(tsx).not.toContain('data-seg="complaint"');
    expect(tsx).not.toContain('data-seg="completionNote"');
    // Label di dalam segmen hanya disembunyikan bila toko memakai satu jenis
    // (keluhan SAJA atau penanganan SAJA): tiket tanpa penanganan tetap
    // berlabel, karena baris dengan dan tanpa label di satu kolom membingungkan.
    expect(tsx).toContain("data-single={showComplaint !== showFix ? 'true' : undefined}");
    expect(css).toContain('.rows [data-single] .clamp b');
    expect(css).not.toContain(':only-child');
  });
});
