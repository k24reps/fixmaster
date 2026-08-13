# GoPay Listener — sisi perangkat Android

Alur billing alternatif: pelanggan bayar ke **QRIS merchant GoPay milik kita**, sebuah HP Android
meneruskan notifikasi GoPay ke Edge Function `gopay-listener`, dan langganan diperpanjang otomatis.

Dokumen ini hanya bagian perangkatnya. Sisi server ada di
`supabase/functions/gopay-listener/` + migration `0043_gopay_listener.sql`.

## Cara kerja korelasi

Notifikasi GoPay **tidak membawa order id** — cuma nominal dan waktu. Maka nominal dipakai sebagai
penanda: tiap invoice mendapat sufiks acak 0–999 rupiah (Rp49.000 → **Rp49.037**), dan
nominal itu dijamin unik di antara invoice yang masih terbuka oleh *partial unique index* di
Postgres. Invoice kedaluwarsa 30 menit, lalu nominalnya kembali ke pool.

Konsekuensi yang tidak bisa dihindari: **pelanggan harus membayar nominal persis.** UI sudah
memperingatkan ini di pay dock.

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

## Aplikasi listener (Kotlin)

Sengaja dibuat bodoh: hanya meneruskan teks mentah. Semua parsing ada di server supaya perubahan
format GoPay tidak memaksa rilis APK baru.

`AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />

<service
    android:name=".GopayListenerService"
    android:exported="true"
    android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
    <intent-filter>
        <action android:name="android.service.notification.NotificationListenerService" />
    </intent-filter>
</service>
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

// Paket resmi Gojek/GoPay. Notifikasi dari paket lain diabaikan supaya
// aplikasi lain tidak bisa memicu pembayaran palsu.
private val ALLOWED = setOf("com.gojek.app", "com.gojek.gopay")

class GopayListenerService : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification) {
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
