# ChatGPT → Tulis Post

## Representative

Sidebar hanya menampilkan **Operasional** (Beranda, Tulis Post, Kalender) dan **Interaksi** (DM, Komentar, Insights). Bookmark halaman administrasi dialihkan ke Tulis Post. Pengelolaan perusahaan, akun sosial, anggota dan kredensial server tetap milik Owner. Representative dapat mengunggah media melalui composer; tidak memerlukan akses halaman Pustaka Media.

## Hubungkan akun AI pribadi

1. Buka ChatGPT dengan akun masing-masing. Cari **Settings → Apps/Connectors → Create/Add custom connector**. Custom MCP/developer mode bergantung paket, rollout, dan kebijakan workspace ChatGPT; administrator workspace mungkin harus mengaktifkannya.
2. Gunakan URL MCP `https://lrmsosmed.playgo.id/mcp`, dengan autentikasi **OAuth**.
3. Login pada halaman LRMsmm menggunakan akun LRMsmm anggota itu sendiri. Pilih **Baca dan kirim draf**. Jangan menggunakan login Owner atau berbagi token/API key.
4. Pada LRMsmm, buka **Tulis Post → Koneksi AI pribadi** untuk melihat atau mencabut koneksi sendiri. Setelah menghubungkan, klik **Muat draf dari ChatGPT**.

LRMsmm adalah server OAuth untuk konektor tersebut. Ini bukan fitur “Login with OpenAI”, dan server tidak memperoleh password atau token login akun ChatGPT. Nama aplikasi OAuth adalah metadata yang didaftarkan klien, bukan bukti identitas ChatGPT yang diverifikasi. Akses akun/perusahaan diambil dari penugasan pengguna LRMsmm dan diperiksa kembali pada setiap permintaan. API key tidak dapat dipakai oleh Representative untuk MCP.

## Kirim hasil final dari chat

Setelah pengguna menyetujui gambar/caption final di ChatGPT, minta konektor menjalankan `submit_post_draft`:

```json
{
  "request_id": "unique-request-id-reuse-for-retries",
  "content": "Caption final",
  "targets": [{"account_id": "ID-dari-list_accounts"}],
  "images": [{"url": "https://public-image-host.example/image.png"}]
}
```

Alternatif untuk setiap gambar adalah `{"base64":"..."}` (JPEG/PNG, boleh data URL). Media LRMsmm milik pengguna yang sama dapat dikirim dengan `media_ids`. Maksimal 10 media, 8 MB per gambar baru, dan 20 MB total gambar baru. PNG dikonversi ke JPEG. URL sementara/signed dapat digunakan selama dapat diunduh server lewat HTTPS tanpa header login. Token URL tidak disimpan dalam draf; gambar disalin ke penyimpanan LRMsmm. Redirect dan hasil DNS diperiksa agar tidak mengakses jaringan privat.

ChatGPT tidak selalu menyediakan file hasil gambar kepada konektor sebagai URL unduh/base64. Tautan `sandbox:/mnt/data/...`, file di ChatGPT Projects, dan halaman percakapan bukan URL unduh publik. Jangan mengaku gambar sudah dikirim jika tool gagal. Jika file tidak tersedia ke konektor, pengguna mengunduhnya dari ChatGPT dan mengunggahnya melalui composer LRMsmm. Tidak ada integrasi otomatis dengan seluruh isi ChatGPT Projects.

`request_id` yang sama dengan isi identik mengembalikan draf yang sama; isi berbeda ditolak. Respons memberikan `compose_url`. Draf dan gambar non-library dimiliki pengirim dan tidak dapat dibuka anggota lain, walaupun memegang perusahaan/akun yang sama. Foto siap-publikasi tetap memiliki URL acak untuk pengambilan oleh Meta; jangan membagikan URL tersebut sebelum waktunya.

## Persetujuan akhir di LRMsmm

Buka `compose_url`, atau **Tulis Post → Draf AI · menunggu persetujuan**. Caption, gambar, target dan usulan jadwal dimuat ke editor. Edit bila perlu, lalu klik **Setujui & Terbitkan** atau **Setujui & Jadwalkan**. Hanya sesi dashboard pemilik draf yang dapat menyetujui. Permintaan OAuth ke endpoint tulis post ditolak; tool OAuth tidak menyediakan create_post/publish_now/retry/update_scheduled_post. Balasan DM/komentar via OAuth tetap memerlukan konfirmasi di chat.

Draf belum membuat baris post/target worker, jadi tidak dapat terbit tanpa approval. Hak target diperiksa kembali saat draf dibuka, disetujui, dan ketika worker menerbitkan. Pengiriman ulang maupun retry approval tidak menggandakan post. Gambar draf pending tidak dihapus oleh garbage collector. Cabut koneksi menghentikan handoff baru; draf lama milik pengguna tetap dapat ditinjau selama akses target masih berlaku.

API key Owner untuk otomasi lama masih memiliki alur REST/MCP penerbitan yang terpisah; itu bukan alur handoff OAuth pribadi. Jangan membagikan API key Owner kepada Representative.

## Bukti pengujian

Tes otomatis memakai OAuth authorization-code + PKCE lokal, SDK MCP sungguhan, database SQLite sementara dan Meta tiruan: impor gambar/caption, deduplikasi, larangan publish dari OAuth, approval dashboard, isolasi dua pengguna, penolakan target di luar penugasan, serta revokasi token. Pengunduhan HTTPS diuji dengan transport stub untuk DNS/redirect privat. UI desktop/mobile diperiksa secara lokal. Ini bukan bukti koneksi langsung ke akun ChatGPT produksi atau penerbitan Meta sungguhan.

Setelah deployment, refresh/reconnect konektor ChatGPT agar daftar tool lama diperbarui. Jika unggahan besar mendapat HTTP 413, periksa batas body hanya pada Proxy Host aplikasi di NPM (`client_max_body_size 32m;` atau batas 110m yang sudah didokumentasikan); jangan mengubah proxy bersama secara global.
