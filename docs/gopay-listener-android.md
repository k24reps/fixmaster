# GoPay Listener — sisi perangkat Android

Alur billing alternatif: pelanggan bayar ke **QRIS merchant GoPay milik kita**, sebuah HP Android
meneruskan notifikasi GoPay ke Edge Function `gopay-listener`, dan langganan diperpanjang otomatis.

Dokumen ini hanya bagian perangkatnya. Sisi server ada di
`supabase/functions/gopay-listener/` + migration `0043_gopay_listener.sql`.

> **Mau mengerjakan cutover-nya?** Ikuti [`runbook-gopay-cutover.md`](runbook-gopay-cutover.md) —
> urutan lengkap staging → produksi beserta gerbang verifikasi tiap fase. Dokumen ini dirujuk
> dari sana sebagai referensi kode perangkat.

## Cara kerja korelasi

Notifikasi GoPay **tidak membawa order id** — cuma nominal dan waktu. Maka nominal dipakai sebagai
penanda: tiap invoice mendapat sufiks acak 0–999 rupiah (Rp49.000 → **Rp49.037**), dan
nominal itu dijamin unik di antara invoice yang masih terbuka oleh *partial unique index* di
Postgres. Invoice kedaluwarsa 30 menit, lalu nominalnya kembali ke pool.

Konsekuensi yang tidak bisa dihindari: **pelanggan harus membayar nominal persis.** UI sudah
memperingatkan ini di pay dock.

## Format notifikasi yang sebenarnya (terverifikasi)

Ditangkap dari perangkat nyata, 15 Agu 2026:

| | |
|---|---|
| Paket | `com.gojek.gopaymerchant` |
| Channel | **`promotional_notifications`** ("Promotions and Marketing") |
| `android.title` | `Pembayaran QRIS statis diterima` |
| `android.text` | `Rp 1.000 di K24 Service, CMH SLTN.` |

Parser server sudah cocok dengan format ini tanpa perubahan (`diterima` lolos filter incoming,
`Rp 1.000` terbaca 1000). Ada test regresi memakai teks asli ini di `parse.test.ts` — kalau GoPay
mengubah kalimatnya, test itu yang gagal lebih dulu.

> [!WARNING]
> **GoPay menaruh notifikasi pembayaran di channel iklan.** Kalau notifikasi "Promotions and
> Marketing" untuk GoPay Merchant dimatikan — hal yang sangat wajar dilakukan orang — seluruh
> deteksi pembayaran berhenti **tanpa pesan error apa pun**. Jangan matikan channel itu, dan
> masukkan ini ke daftar periksa bila suatu saat listener mendadak sunyi.

## Batas yang kamu terima dengan memilih jalur ini

| | Dampak |
|---|---|
| Notifikasi *fire-and-forget* | Fungsi down saat pembayaran masuk → invoice tetap pending, tidak ada yang mengirim ulang. Perlu konfirmasi manual. |
| HP harus hidup 24/7 | Mati, kehabisan baterai, atau di-kill Doze → pipeline pembayaran diam-diam berhenti. |
| Format teks bisa berubah | Update aplikasi GoPay bisa mengubah kalimat notifikasi. Parser ada di server, jadi perbaikannya cukup redeploy fungsi — tidak perlu rilis ulang APK. |
| Bayar beda nominal | Tidak terkorelasi. Uang tetap masuk, invoice tetap pending → rekonsiliasi manual. |

Cek log `gopay-listener` secara berkala untuk baris
`incoming payment with no matching invoice` — itu daftar pembayaran yang butuh tangan manusia.

## Setup

1. **Secret server** (jangan pakai nilai contoh — bikin acak, minimal 32 karakter):

```bash
supabase secrets set GOPAY_LISTENER_SECRET="$(openssl rand -hex 32)" --project-ref vmitplpvncfvyimgyxrn
```

2. **Deploy fungsi:**

```bash
supabase functions deploy gopay-listener --project-ref vmitplpvncfvyimgyxrn
```

3. **Migration:**

```bash
supabase db push --project-ref vmitplpvncfvyimgyxrn
```

4. **Env web** — isi `VITE_GOPAY_QRIS_URL` dengan URL gambar QRIS merchant GoPay kamu
   (upload ke Supabase Storage bucket publik). **Wajib di produksi:** gateway lama sudah dicabut,
   jadi selama variabel ini kosong billing turun ke invoice mock yang harus dikonfirmasi manual —
   artinya produksi tidak menagih apa pun.

5. **HP Android:** pasang aplikasi listener (di bawah), beri izin
   *Notification access* di `Settings → Apps → Special access → Notification access`,
   lalu **matikan optimasi baterai** untuk aplikasi itu — kalau tidak, Doze akan membunuhnya
   dalam hitungan jam dan pembayaran berhenti terdeteksi tanpa peringatan.

### Bertahan hidup di Xiaomi/MIUI (WAJIB — service mati diam tanpa ini)

`NotificationListenerService` jalan sebagai service latar; aplikasi **tidak perlu terbuka** di
layar, HP boleh terkunci. Yang harus terus hidup adalah HP + service latarnya. MIUI paling agresif
membunuh service latar, jadi selain "Battery → Unrestricted":

1. **Autostart** — `Keamanan (Security) → Izin → Autostart` → aktifkan *FixMaster Listener*.
   Tanpa ini, sekali HP restart service **tidak bangun sendiri** sampai app dibuka manual. Ini yang
   paling sering terlewat.
2. **Kunci di Recent** — buka recent apps, tahan kartu *FixMaster Listener* → ikon **gembok**.
   MIUI tidak membunuh app yang terkunci.
3. **HP tetap tercolok listrik + terhubung internet.** Forwarding butuh internet tepat saat
   notifikasi masuk; Doze paling galak saat layar mati **dan** tidak dicas.
4. **Setelah tiap reinstall APK**, ulangi toggle Notification access (off→on). Reinstall memutus
   binding service.

> **Pakai HP KHUSUS untuk produksi**, bukan HP harian. HP harian sering dibersihkan, di-restart,
> dan kehabisan baterai — tiap kejadian itu adalah jendela di mana pembayaran masuk tapi tidak
> terdeteksi. Plafon ini melekat pada jalur listener; tidak ada retry seperti webhook gateway.

## Aplikasi listener (Kotlin)

Sengaja dibuat bodoh: hanya meneruskan teks mentah. Semua parsing ada di server supaya perubahan
format GoPay tidak memaksa rilis APK baru.

`AndroidManifest.xml` — lengkap, di dalam `<manifest>`:

```xml
<uses-permission android:name="android.permission.INTERNET" />

<application
    android:allowBackup="false"
    android:label="FixMaster Listener"
    android:icon="@mipmap/ic_launcher"
    android:theme="@style/Theme.AppCompat.Light">

    <activity android:name=".MainActivity" android:exported="true">
        <intent-filter>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
        </intent-filter>
    </activity>

    <service
        android:name=".GopayListenerService"
        android:exported="true"
        android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
        <intent-filter>
            <action android:name="android.service.notification.NotificationListenerService" />
        </intent-filter>
    </service>
</application>
```

`MainActivity.kt` — satu tombol untuk membuka layar izin. Tanpa ini kamu tidak punya cara
mudah memberi Notification access dan memastikan aplikasi terpasang benar.

```kotlin
package com.fixmaster.gopaylistener

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.LinearLayout

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val button = Button(this).apply {
            text = "Buka pengaturan Notification access"
            setOnClickListener {
                startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            }
        }
        setContentView(LinearLayout(this).apply {
            setPadding(48, 96, 48, 48)
            addView(button)
        })
    }
}
```

`GopayListenerService.kt`:

```kotlin
package com.fixmaster.gopaylistener

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

private const val ENDPOINT = "https://<project-ref>.supabase.co/functions/v1/gopay-listener"
private const val SECRET = "<GOPAY_LISTENER_SECRET yang sama dengan di server>"

// Paket yang boleh memicu pembayaran. Aplikasi lain diabaikan supaya tidak
// ada yang bisa memalsukan notifikasi.
//
// TERVERIFIKASI 15 Agu 2026 di perangkat nyata: notifikasi pembayaran QRIS
// merchant datang dari `com.gojek.gopaymerchant` (aplikasi GoPay Merchant).
// Tebakan awal `com.gojek.gobiz` SALAH. Kalau perangkatmu berbeda, cari
// sendiri lewat DISCOVERY_MODE di bawah — jangan menebak.
private val ALLOWED = setOf("com.gojek.gopaymerchant")

// Set true SEMENTARA untuk menemukan nama paket yang benar: setiap notifikasi
// yang masuk dicatat ke logcat tanpa dikirim ke server. Kembalikan ke false
// setelah selesai — mode ini mencatat isi notifikasi apa pun ke log.
private const val DISCOVERY_MODE = false

class GopayListenerService : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (DISCOVERY_MODE) {
            val e = sbn.notification.extras
            android.util.Log.d(
                "GopayDiscovery",
                "pkg=${sbn.packageName} title=${e.getCharSequence("android.title")} " +
                    "text=${e.getCharSequence("android.text")}",
            )
            return
        }
        if (sbn.packageName !in ALLOWED) return

        val extras = sbn.notification.extras
        val text = listOfNotNull(
            extras.getCharSequence("android.title")?.toString(),
            extras.getCharSequence("android.text")?.toString(),
            extras.getCharSequence("android.bigText")?.toString(),
        ).joinToString(" ")
        if (text.isBlank()) return

        forward(text, sbn.postTime)
    }

    private fun forward(text: String, postedAt: Long) = thread {
        // Satu percobaan ulang: jaringan seluler sering meleset sekali.
        repeat(2) { attempt ->
            try {
                val body = JSONObject()
                    .put("text", text)
                    .put("postedAt", postedAt)
                    .toString()

                val conn = (URL(ENDPOINT).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    doOutput = true
                    connectTimeout = 10_000
                    readTimeout = 10_000
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("X-Listener-Secret", SECRET)
                }
                conn.outputStream.use { it.write(body.toByteArray()) }
                val code = conn.responseCode
                conn.disconnect()

                // 4xx = permanen (secret salah, notifikasi basi) → jangan ulangi.
                if (code < 500) return@thread
            } catch (_: Exception) {
                if (attempt == 1) return@thread
            }
            Thread.sleep(3_000)
        }
    }
}
```

`SECRET` di-hardcode dalam APK. Itu bisa dibaca siapa pun yang memegang file APK-nya, jadi
**jangan sebarkan APK ini** — pasang langsung ke HP yang kamu kendalikan. Kalau bocor, penyerang
bisa memalsukan pembayaran; rotasi dengan `supabase secrets set` lalu pasang ulang APK.

## Uji

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/gopay-listener" \
  -H "Content-Type: application/json" \
  -H "X-Listener-Secret: <secret>" \
  -d "{\"text\":\"Kamu menerima Rp49037 dari Budi\",\"postedAt\":$(date +%s000)}"
```

Balasan `{"matched":false,...}` berarti pipeline hidup tapi tidak ada invoice dengan nominal itu —
buat invoice dulu lewat UI, pakai nominal persisnya, lalu ulangi.
