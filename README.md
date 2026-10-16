# LRMsmm

Aplikasi internal HR Group untuk **membuat, menjadwalkan, dan membalas komentar Instagram & Threads** dari satu tempat — lewat dashboard, REST API, atau langsung dari Claude/ChatGPT lewat MCP. Fungsinya setara Tebar, tapi di-host sendiri dan memakai Meta App milik sendiri.

## Isi

| Bagian | Lokasi | Fungsi |
|---|---|---|
| Dashboard | `public/` | Tulis post + preview IG/Threads, kalender bulan/minggu/3 hari, **Pesan (DM Instagram)**, komentar, insights, akun, media, API key, tim, admin |
| REST API | `/v1` (`src/routes/api.js`) | Semua yang bisa di dashboard, plus `Idempotency-Key`, rate limit, error code stabil |
| MCP server | `/mcp` (`src/mcp.js`) | 24 tool untuk Claude, ChatGPT, Claude Code, Cursor, n8n (termasuk baca & balas DM). Tool tulis hanya muncul dengan akses baca-tulis |
| OAuth server | `/oauth/*` (`src/routes/oauth.js`) | OAuth 2.1 + PKCE + dynamic client registration, supaya bisa "Add custom connector" di Claude |
| Worker | `src/worker.js` | Posting terjadwal (cek tiap 15 dtk), retry otomatis, sinkron DM (2 mnt) & komentar (10 mnt) sebagai cadangan webhook, statistik (6 jam), perpanjang token (12 jam), bersih-bersih media |
| Real-time | `/webhooks/*` + `/v1/events` | Webhook Meta bertanda tangan → dashboard diperbarui langsung (Server-Sent Events) |
| Integrasi Meta | `src/meta/` | Instagram API with Instagram Login + Threads API. `mock.js` = tiruan Meta untuk testing |

Stack: Node.js 22, Express 5, SQLite bawaan Node (`node:sqlite`), sharp (gambar), ffmpeg (opsional, video). Tidak ada Redis/Postgres — satu proses, satu file database.

## Coba lokal tanpa Meta (5 menit)

```bash
npm install
npm run dev          # META_MOCK=1, buka http://localhost:3000
npm test             # 34 tes end-to-end terhadap Meta tiruan
```

Di mode mock, layar login Instagram/Threads adalah tiruan dan tidak ada yang benar-benar terposting. Caption berisi `#fail-expired`, `#fail-transient`, atau `#fail-permission` mensimulasikan error Meta.

## Pasang di production

### 1. Server
Butuh VPS dengan domain HTTPS publik, misalnya `lrmsmm.playgo.id`. **Wajib publik**: Meta mengunduh foto/video dari `PUBLIC_URL/m/...` saat posting.

**Cara tercepat (Ubuntu/Debian):** dari Mac, di folder berisi `lrmsmm.tar.gz`, `install.sh`, `deploy-from-mac.sh`:
```bash
bash deploy-from-mac.sh root@IP_VPS          # install pertama & setiap update
```
Script memasang Node 22 + ffmpeg, service systemd `lrmsmm` (port 3077), `/etc/lrmsmm.env` berisi kunci baru (tidak pernah ditimpa), data di `/var/lib/lrmsmm` (di-backup tiap update), Nginx/Caddy + HTTPS, dan rollback otomatis kalau versi baru gagal start atau konfigurasi Nginx ditolak.

Manual:

```bash
cp .env.example .env      # isi PUBLIC_URL, ENCRYPTION_KEY (openssl rand -hex 32), kredensial Meta
docker compose up -d --build
```

Tanpa Docker: `npm ci --omit=dev && npm start` (pasang `ffmpeg` agar durasi video terbaca dan video otomatis di-"fast start"). Pasang reverse proxy HTTPS, contoh Caddy:

```
lrmsmm.playgo.id {
  reverse_proxy 127.0.0.1:3000
  request_body { max_size 110MB }
}
```

Jalankan **satu instance saja** (worker dan SQLite ada di proses yang sama). Backup = salin folder `data/` (database + media). Jangan pernah mengganti `ENCRYPTION_KEY` setelah akun tersambung.

### 1b. Kalau domain di Cloudflare
`deploy/install.sh` mendeteksi Cloudflare otomatis (awan oranye) dan:
- memasang Nginx dengan HTTPS di origin (Let's Encrypt via webroot; kalau gagal, sertifikat self-signed sementara),
- mengembalikan IP asli pengunjung dari header `CF-Connecting-IP` (hanya dipercaya dari range IP Cloudflare).

Di dashboard Cloudflare:
1. **SSL/TLS** → *Full (strict)* kalau Let's Encrypt sukses, kalau tidak *Full*. Jangan *Flexible* (bisa redirect loop).
2. **Security → WAF → Custom rule → Skip** untuk path `/m/`, `/webhooks/`, `/mcp`, `/oauth/`, `/.well-known/`, `/v1/` di host LRMsmm. Tanpa ini Bot Fight Mode/challenge bisa memblokir Meta (mengambil foto, mengirim webhook) dan Claude (MCP).
3. Batas upload Cloudflare 100 MB per request — dashboard otomatis memotong video besar jadi bagian 8 MB.

### 2. Meta App (sekali saja)
Buka developers.facebook.com → **Create App**.

**Instagram** (akun harus Business atau Creator)
1. Tambah use case **"Manage messaging & content on Instagram"** → pilih *API setup with Instagram login*.
2. Salin **Instagram App ID** dan **Instagram App Secret** (beda dari Facebook App ID) ke `IG_APP_ID` / `IG_APP_SECRET`.
3. Di *Set up Instagram business login* → OAuth redirect URI: `https://lrmsmm.playgo.id/connect/instagram/callback`
4. Deauthorize callback: `https://lrmsmm.playgo.id/meta/instagram/uninstall` · Data deletion: `https://lrmsmm.playgo.id/meta/instagram/delete`
5. Izin: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_insights`, `instagram_business_manage_messages`.
6. Untuk DM: di aplikasi Instagram akun brand, buka Settings → Messages and story replies → Message controls → **Connected tools**, aktifkan *Allow access to messages*.
7. Webhooks (opsional, untuk real-time): callback `https://lrmsmm.playgo.id/webhooks/instagram`, verify token = `WEBHOOK_VERIFY_TOKEN`, subscribe field `comments` dan `messages`. Tanpa webhook, DM tetap masuk lewat sinkron tiap 2 menit.

**Threads**
1. Tambah use case **"Access the Threads API"** (bisa app yang sama atau terpisah).
2. Salin Threads App ID/Secret ke `THREADS_APP_ID` / `THREADS_APP_SECRET`.
3. Redirect callback: `https://lrmsmm.playgo.id/connect/threads/callback` · Uninstall: `/meta/threads/uninstall` · Delete: `/meta/threads/delete`
4. Izin: `threads_basic`, `threads_content_publish`, `threads_read_replies`, `threads_manage_replies`, `threads_manage_insights`.
5. Webhooks (opsional): callback `https://lrmsmm.playgo.id/webhooks/threads`, field `replies`.

**Tanpa App Review (cocok untuk internal):** biarkan app di **Development mode**, lalu daftarkan tiap akun brand sebagai tester:
- App roles → Roles → **Instagram Testers** → tambah username. Terima undangan di Instagram: Settings → Website permissions → Apps and websites → Tester invites.
- App roles → Roles → **Threads Testers** → tambah username. Terima di Threads: Settings → Account → Website permissions → Invites.

Akun dengan role di app bisa memakai semua izin tanpa App Review. App Review hanya perlu kalau nanti mau dipakai akun di luar tim.

### 3. Tim: Owner & Representative
Buka `https://lrmsmm.playgo.id` → user pertama otomatis jadi **Owner**. Owner menambah anggota dari menu **Tim** (pendaftaran publik tertutup kecuali `ALLOW_SIGNUP=1`).

| Peran | Bisa |
|---|---|
| **Owner** (superadmin) | Semua akun sosial, kelola anggota & penugasan akun, putus akun, halaman Admin (log audit, post gagal) |
| **Representative** | Hanya akun yang ditugaskan (boleh lebih dari satu): posting, jadwal, balas komentar, balas DM, insights. Post yang juga menuju akun lain hanya bisa dilihat, tidak diubah |

Batasan yang sama berlaku untuk API key dan koneksi AI milik anggota itu. Akun yang disambungkan Representative otomatis ditugaskan ke dia. Pustaka media dipakai bersama seluruh tim.

### Pesan (DM) & notifikasi
- Menu **Pesan** menampilkan DM Instagram semua akun yang kamu pegang: filter *Perlu dibalas / Semua / Selesai*, balas langsung, tandai selesai.
- Percakapan yang menunggu balasan **lebih dari 5 menit** ditandai merah, angka muncul di menu Pesan dan judul tab, plus pop-up di pojok layar. Ambang bisa diubah lewat `UNREPLIED_ALERT_SECONDS`.
- **Threads tidak punya API pesan**, jadi hanya Instagram.
- Aturan Instagram: balasan dari aplikasi pihak ketiga hanya boleh dalam **24 jam** sejak pesan terakhir pelanggan. Di luar itu LRMsmm menolak dengan jelas dan menyarankan membalas dari aplikasi Instagram.

### 4. Sambungkan ke AI
- **Claude / ChatGPT**: Settings → Connectors → Add custom connector → `https://lrmsmm.playgo.id/mcp`. Login LRMsmm, pilih *baca saja* atau *baca dan tulis*.
- **Claude Code**: buat API key di menu *API & AI*, lalu
  `claude mcp add --transport http lrmsmm https://lrmsmm.playgo.id/mcp --header "Authorization: Bearer lrm_live_..."`
- **n8n / Cursor / skrip sendiri**: REST API dengan header `Authorization: Bearer lrm_live_...`.

Contoh prompt: *"Jadwalkan foto ini di IG dan Threads Daily Dose Pilates besok jam 7 pagi, caption promo kelas Reformer."* · *"Balas komentar yang belum dibalas di Sunrise Padel, tampilkan drafnya dulu."*

## REST API ringkas

Base URL `PUBLIC_URL/v1`. JSON `snake_case`, waktu ISO 8601 (kirim dengan zona waktu, respons UTC). Pagination `?limit=&cursor=` → `next_cursor`.

| Method | Path | Scope | Fungsi |
|---|---|---|---|
| GET | `/me`, `/accounts`, `/accounts/{id}` | read | Info token, akun tersambung |
| GET | `/accounts/{id}/publishing-limit` | read | Kuota 24 jam (langsung dari Meta) |
| GET | `/platform-rules` | read | Batas teks/media tiap platform |
| POST | `/posts` | write | Buat/jadwalkan post (`Idempotency-Key` disarankan) |
| GET | `/posts`, `/posts/{id}`, `/calendar?from&to` | read | Daftar, detail, kalender |
| PATCH / DELETE | `/posts/{id}` | write | Ubah / batalkan post terjadwal |
| POST | `/posts/{id}/publish` · `/retry` · `/remove` | write | Terbit sekarang · ulangi yang gagal · hapus dari riwayat |
| POST | `/media/upload` (raw body ≤100 MB) · `/media/from-url` | write | Upload media |
| POST/PUT/POST | `/media/uploads` → `/media/{id}/parts/{n}` → `/media/{id}/complete` | write | Upload terpotong (video besar, part 8 MB) |
| GET / PATCH / DELETE | `/media`, `/media/{id}` | read/write | Pustaka, alt text, hapus |
| GET | `/comments?account_id&post_id&reply_status` | read | Inbox (default `unreplied`) |
| POST | `/comments/{id}/reply` · `/comments/{id}/hide` · `/comments/sync` | write | Balas, sembunyikan, sinkron |
| GET | `/accounts/{id}/insights?from&to`, `/posts/{id}/insights` | read | Statistik |
| GET | `/conversations?filter=needs_reply\|all\|done&account_id`, `/conversations/{id}` | read | DM Instagram |
| POST | `/conversations/{id}/messages` `{"text"}` | write | Balas DM (dalam 24 jam) |
| PATCH | `/conversations/{id}` `{"status":"done"\|"open"}` | write | Tandai selesai / buka lagi |
| GET | `/messages/unreplied` | read | Jumlah DM menunggu & yang lewat 5 menit |
| GET | `/events` | read | Stream real-time (SSE): `message.new`, `comment.new`, `post.updated` |
| GET/POST/PATCH/DELETE | `/users`, `PUT /users/{id}/accounts` | Owner | Anggota & penugasan akun |
| GET | `/admin/audit`, `/admin/failed-posts`, `/admin/overview` | Owner | Log audit, post gagal, ringkasan |
| POST | `/insights/sync` | write | Ambil statistik sekarang (maks 1×/5 mnt) |

Contoh:
```bash
curl https://lrmsmm.playgo.id/v1/posts \
  -H "Authorization: Bearer lrm_live_xxx" -H "Idempotency-Key: $(uuidgen)" -H "Content-Type: application/json" \
  -d '{"content":"Promo akhir pekan","media_ids":["m_..."],
       "targets":[{"account_id":"ig_..."},{"account_id":"th_...","options":{"topic_tag":"Pilates"}}],
       "scheduled_at":"2026-10-17T09:00:00+07:00"}'
```

Opsi per target (`targets[].options`): Instagram `format` (`feed`/`story`), `share_to_feed`, `cover_media_id`, `thumb_offset_ms`. Threads `thread` (utas, maks 10 bagian), `poll`, `link_attachment`, `text_attachment`, `topic_tag`, `reply_control`. Teks/media per akun: `targets[].content`, `targets[].media_ids`.

Error: `{"error":{"code","message","details"}}` — `code` stabil (`caption_too_long`, `media_required`, `aspect_ratio_invalid`, `account_expired`, `permission_missing`, `idempotency_conflict`, `post_not_editable`, `rate_limited`, …).

## Keamanan
- Token Meta disimpan terenkripsi AES-256-GCM. Password (scrypt), API key, dan token OAuth hanya disimpan sebagai hash.
- Ganti password = semua API key dan akses AI dicabut.
- Webhook Meta diverifikasi dengan tanda tangan `X-Hub-Signature-256` (HMAC app secret); yang tidak valid ditolak.
- Setiap aksi penting tercatat di log audit beserta pelakunya dan jalurnya (dashboard, API key, atau AI).
- Komentar dikirim ke AI dengan tanda *untrusted*, dan instruksi server MCP mewajibkan AI konfirmasi teks + akun sebelum posting/membalas.
- Upload dicek dari isi file (bukan Content-Type); `from-url` menolak alamat jaringan privat (anti-SSRF).

## Batasan yang perlu diketahui
- **Belum diuji ke Meta asli.** Semua alur sudah lolos tes terhadap tiruan Meta yang meniru endpoint resmi, tapi uji pertama dengan akun sungguhan perlu dilakukan setelah Meta App siap — kemungkinan ada penyesuaian kecil (versi API, nama field).
- Instagram hanya JPEG (PNG otomatis dikonversi). Rasio feed 4:5–1.91:1. Story tanpa caption.
- Real-time butuh webhook Meta dikonfigurasi; tanpa itu DM disinkron tiap 2 menit dan komentar tiap 10 menit.
- DM: hanya Instagram, hanya teks (lampiran ditampilkan sebagai “[lampiran]”), hanya dalam jendela 24 jam.
- Statistik diperbarui tiap 6 jam; Meta sendiri bisa telat sampai 48 jam.
- Belum ada: LinkedIn, Facebook Page, TikTok, YouTube, login Google, kartu upload di dalam chat AI (pakai `get_upload_link` → upload di dashboard → `list_media`).
- Post yang sudah tayang tidak diedit/dihapus dari LRMsmm — lakukan di aplikasinya.
