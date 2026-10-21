import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const words = /\b(?:akun|konten|sesi|simpan|hapus|tinjau|setujui|buat|belum|sudah|semua|jadwal|perusahaan|pilih|pesan|komentar|beranda|kalender|pengaturan|tersimpan|gagal|berhasil|dibatalkan|menunggu|kembali|keluar|masuk)\b/i;
let failures = 0;
for (const file of await readdir(root)) {
  if (!/\.(js|html)$/.test(file)) continue;
  const lines = (await readFile(join(root, file), 'utf8')).split('\n');
  lines.forEach((line, index) => {
    if (/\/\/.*(?:source|prompt|content|caption)/i.test(line)) return;
    const literals = line.match(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g) || [];
    if (literals.some(value => words.test(value))) { console.error(`${join(root, file)}:${index + 1}`); failures++; }
  });
}
if (failures) process.exitCode = 1;
else console.log('No common Indonesian interface words found.');
