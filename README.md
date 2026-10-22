> **Alur ChatGPT terbaru:** setiap pengguna menambahkan konektor MCP `https://lrmsosmed.playgo.id/mcp` di akun ChatGPT masing-masing dan memberi OAuth memakai login LRMsmm sendiri. OAuth mengirim caption/gambar sebagai draf pribadi ke **Tulis Post**, bukan menerbitkan post langsung. Lihat [panduan handoff](deploy/CHATGPT_HANDOFF.md). Representative memakai area Konten dan Interaksi; administrasi tetap dibatasi Owner.

# LRMsmm

**For coding agents / LLMs:** start with [AGENTS.md](AGENTS.md) and the [engineering handoff](docs/llm/README.md) for current architecture, product rules, API flows and the verification/deployment runbook.

**Shared VPS deployment:** use [deploy/SHARED_VPS.md](deploy/SHARED_VPS.md). The active GitHub workflow uses the dedicated Docker receiver and the existing Nginx Proxy Manager; the older standalone installer below is not used for this VPS.

Aplikasi internal HR Group untuk **membuat, menjadwalkan, dan membalas komentar Instagram & Threads** dari satu tempat — lewat dashboard, REST API, atau langsung dari Claude/ChatGPT lewat MCP. di-host sendiri dan memakai Meta App milik sendiri.

## Isi

| Bagian | Lokasi | Fungsi |
|---|---|---|
| Dashboard | `public/` | Tulis post + preview IG/Threads, kalender bulan/minggu/3 hari, **Pesan (DM Instagram)**, komentar, insights, akun, media, API key, tim, admin |
| REST API | `/v1` (`src/routes/api.js`) | Semua yang bisa di dashboard, plus `Idempotency-Key`, rate limit, error code stabil |
| MCP server | `/mcp` (`src/mcp.js`) | tool OAuth draf pribadi untuk ChatGPT/Claude dan tool API key Owner untuk otomasi (termasuk baca & balas DM). Tool tulis hanya muncul dengan akses baca-tulis |
| OAuth server | `/oauth/*` (`src/routes/oauth.js`) | OAuth 2.1 + PKCE + dynamic client registration, supaya bisa "Add custom connector" di Claude |
| Worker | `src/worker.js` | Posting terjadwal (cek tiap 15 dtk), retry otomatis, sinkron DM (2 mnt) & komentar (10 mnt) sebagai cadangan webhook, statistik (6 jam), perpanjang token (12 jam), bersih-bersih media |
| Real-time | `/webhooks/*` + `/v1/events` | Webhook Meta bertanda tangan → dashboard diperbarui langsung (Server-Sent Events) |
| Integrasi Meta | `src/meta/` | Instagram API with Instagram Login + Threads API. `mock.js` = tiruan Meta untuk testing |

Stack: Node.js 22, Express 5, SQLite bawaan Node (`node:sqlite`), sharp (gambar), ffmpeg (opsional, video). Tidak ada Redis/Postgres — satu proses, satu file database.

## Jalankan di Mac (localhost)
1. Pastikan Node.js 22.5+ terpasang (`node -v`; kalau belum: `brew install node` atau installer LTS di nodejs.org).
2. Klik dua kali **Mulai LRMsmm.command** (kalau macOS menolak: klik kanan → Open), atau di Terminal: `bash start-local.sh`.
3. Browser terbuka ke `http://localhost:3000`. Daftar → akun pertama jadi Owner.
4. Menu **Akun** → *Sambungkan Instagram/Threads* → layar login tiruan → ketik username apa saja → Izinkan.
5. Coba tulis post, jadwalkan, lihat kalender; DM & komentar contoh muncul otomatis setelah posting (atau klik *Muat terbaru*).

Mode lokal memakai Instagram/Threads **tiruan** — tidak ada yang benar-benar terposting. Posting sungguhan butuh server dengan HTTPS publik (lihat *Pasang di production*). Berhenti: Ctrl+C. Mulai ulang dari nol: `bash start-local.sh --reset`.

## Coba lokal tanpa Meta (developer)

```bash
npm install
npm run dev          # META_MOCK=1, buka http://localhost:3000
npm test             # suite end-to-end terhadap Meta tiruan
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

### 1a. Auto-deploy dari GitHub (Actions)
Setiap push ke `main` di `lrmcorp/lrmsmmnew` menjalankan tes lalu membangun image GHCR dengan cache. Untuk VPS bersama, ikuti [panduan setup receiver khusus](deploy/SHARED_VPS.md): lima SSH secrets + `ENABLE_VPS_DEPLOY=true`, host key terverifikasi, backup/rollback, dan transfer layer maksimal 15 menit. Installer standalone `install.sh` tidak dipakai oleh workflow ini.

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


### Penugasan beberapa akun dan diagnosis DM

Owner: **Tim & Akses → Tambah anggota / Ubah → Representative**, pilih semua akun Instagram yang ditugaskan, lalu Simpan. Satu anggota boleh memegang beberapa akun; satu akun boleh dikelola beberapa anggota. Pencabutan penugasan langsung membatasi daftar akun, DM, balasan, sinkronisasi, serta status sinkronisasi pada permintaan berikutnya. Representative tidak dapat mengubah penugasannya sendiri.

Di **Pesan**, filter awal adalah **Semua**. Klik **Muat terbaru** untuk akun yang dipilih, atau semua akun yang ditugaskan. Status terakhir ditampilkan per akun; kegagalan izin/token tidak dilaporkan sebagai “tidak ada pesan baru”. Riwayat yang sudah tersimpan tetap tersedia saat Meta sedang gagal diakses. Endpoint `GET /v1/messages/sync-status` hanya mengembalikan status akun yang menjadi hak pengguna; `POST /v1/messages/sync` menerima `account_id` opsional dan mengembalikan `new_messages`, `synced_accounts`, serta `errors` per akun.

Jika muncul `permission_missing`: sambungkan ulang akun dari LRMsmm, berikan izin `instagram_business_manage_messages`, dan aktifkan akses pesan di **Instagram → Messages and story replies → Message controls → Connected tools → Allow access to messages** (nama menu bisa berbeda menurut versi aplikasi). Jika Meta App masih Development, akun harus menerima undangan Instagram Tester. Sinkronisasi background berlangsung setiap 2 menit. Hanya percakapan yang disediakan Meta API yang dapat ditampilkan; tes otomatis menggunakan Meta tiruan dan bukan bukti akses ke DM produksi.


### Perusahaan → Akun

Owner membuka **Perusahaan & Akun → Tambah perusahaan**, lalu memilih perusahaan pada setiap akun yang tersambung. Setiap akun berada di satu perusahaan; perusahaan dapat memiliki beberapa akun Instagram/Threads. Akun lama tetap tersimpan di **Belum ditetapkan** sampai Owner mengelompokkannya. Perusahaan dapat diubah namanya tanpa menghapus akun atau token.

Di **Tim & Akses → Tambah/Ubah anggota**, perluas daftar perusahaan lalu centang **Akses semua akun perusahaan ini** untuk satu atau beberapa perusahaan. Akses ini meliputi akun sekarang dan akun baru yang dimasukkan ke perusahaan tersebut. Akun individual tambahan tetap bisa dipilih di bagian terpisah; penugasan individual lama dipertahankan saat migrasi. Untuk mencabut seluruh akses ke sebuah akun, hapus semua grant yang memberikannya (perusahaan maupun individual). Perpindahan akun antarperusahaan langsung memperbarui akses berbasis perusahaan. Member tidak bisa membuat perusahaan atau memindahkan akun. Owner mengelola semua perusahaan.

Pemilih akun pada composer, filter DM/komentar, dan insights dikelompokkan menurut perusahaan. Pemeriksaan scope yang sama berlaku pada REST API dan MCP. Worker memeriksa akses pembuat sebelum menjalankan target post terjadwal; target ditolak dengan `access_revoked` jika hak aksesnya sudah dicabut.

Nama dan foto profil dari Meta ditampilkan di semua avatar akun, dengan fallback inisial bila foto kosong, kedaluwarsa, atau tidak bisa dimuat. Klik **Perbarui nama & foto** untuk memperbarui profil akun yang sudah tersambung tanpa mengganti token. Worker juga mencoba memperbarui profil akun aktif setiap 6 jam. Nilai yang tidak disediakan Meta tidak dibuat-buat; nama kosong memakai username.

REST API: `GET/POST /v1/companies`, `PATCH /v1/companies/{id}`, `PUT /v1/accounts/{id}/company` (`company_id` atau null), dan `POST /v1/accounts/{id}/profile`. Buat/ubah anggota melalui `/v1/users` dengan `company_ids` opsional serta `account_ids` untuk grant individual. Daftar perusahaan dan jumlah akun difilter menurut akses pengguna.

## External publishing agents

See [Agent API guide](public/agent-api.md), [OpenAPI](public/openapi.json), and the dependency-free [Python upload example](examples/agent-upload.py). The deployed documentation is at `/agent-api.md` and `/openapi.json`, linked from **API & AI**.

`POST /v1/agent/drafts` accepts a personal write API key or OAuth token and creates a private review draft (caption, ordered uploaded photos/videos, targets, proposed scheduled_at). Only the dashboard can approve it. `/v1/posts` remains available for explicitly trusted API-key automation that schedules/publishes directly; OAuth cannot use it to bypass approval.

Example (set LRMSMM_API_KEY securely first):

```bash
python3 examples/agent-upload.py --account acc_YOUR_ID --caption 'Final caption' --request-id campaign-001 --at '2026-12-01T09:00:00+07:00' photo.jpg clip.mp4
```

Default is a draft. Add `--mode schedule` to activate the schedule or `--mode now` to publish immediately. Save media IDs from upload responses when building a retryable production agent.

## Sosmed Generator

**Operasional → Sosmed Generator** provides a production workflow: concept → revision → Final Visual Conceptor → image generation → final review. The primary Generate action produces the complete proposal; publishing still requires human approval. Each user configures their own encrypted API keys, models and role instructions for OpenAI, Claude and Gemini. Generated images and the final caption go to a private **Tulis Post** draft for human approval; no automatic publishing from generator runs. Claude is supported for text/vision, while image generation uses OpenAI or Gemini.

See [workflow, provider setup, boundaries and GitHub references](deploy/SOSMED_GENERATOR.md). Sosmed Generator is integrated into the main application on the same domain and uses the existing users, companies, accounts, media and Tulis Post approval flow.


### Draft gallery and complete production

Draft Konten opens as a thumbnail gallery. Open a thumbnail to preview/edit; use the checkboxes or Select all to delete multiple eligible drafts with one confirmation. `POST /v1/generator/drafts/delete` is session-only and accepts `{ "ids": ["..."] }` (1–200 unique IDs). Ownership, current account grants and draft states are checked for every item before deletion. Running/queued, handed-off and approved content cannot be bulk deleted. Shared Brand Kit assets and media referenced elsewhere remain protected.

The dashboard sends `produce_media: true` for complete production from a campaign plan or Storyline session. The optional API concept-only behavior remains available when omitted. The new `visual` agent has its own model/instruction controls and saved presets; older presets inherit the concept agent's provider/model for compatibility. It receives uploaded brand references plus up to three recent thumbnails from each connected Instagram account (up to three accounts for older multi-account runs), using Meta's official API. Failed or unavailable profile imagery is reported explicitly; uploaded references still work. Feed previews are cached in memory for five minutes, never stored as uploaded files; only Meta CDN HTTPS URLs without redirects are fetched. Final image prompts preserve the caption/story and require original logos/product details to stay unchanged.
