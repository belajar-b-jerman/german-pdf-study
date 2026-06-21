# Deutsch PDF Study

PWA local-first untuk belajar bahasa Jerman dari PDF di iPad atau desktop.

## Fitur MVP

- Import beberapa PDF dari perangkat.
- PDF disimpan offline di browser dengan IndexedDB.
- Reader PDF berbasis PDF.js.
- Annotation layer untuk pen, highlighter, underline, strike, eraser, dan undo.
- Tool teks untuk mengisi workbook langsung di atas PDF.
- Mode pindah halaman: tombol, swipe kiri/kanan, dan scroll/gesture vertikal.
- Mode cursor agar tidak selalu membuat coretan atau teks.
- Mobile reader full-screen dengan drawer File, Tools, dan Notes.
- Catatan per halaman.
- Study Cards terstruktur untuk ringkasan, grammar, vocab, contoh kalimat, dan pertanyaan.
- Vocab list per dokumen.
- Search teks PDF jika PDF punya text layer.
- Export dan import backup JSON untuk catatan halaman aktif, teks, coretan, Study Cards, dan vocab.
- PWA installable dan siap GitHub Pages.
- Optional bundled PDFs lewat `public/pdfs/manifest.json`.

## Catatan PDF

App ini tidak menyertakan PDF di repo. Ini lebih aman untuk GitHub public repo, terutama jika PDF berasal dari buku/kelas berlisensi. Di iPad, buka PWA lalu pilih `Import PDF`; file akan tersimpan lokal di perangkat.

Kalau repo dibuat private atau PDF memang boleh didistribusikan, letakkan PDF di `public/pdfs/` lalu isi `public/pdfs/manifest.json`.

Contoh:

```json
[
  {
    "title": "BAHAN AJAR BABAK A1 FULL",
    "file": "BAHAN%20AJAR%20BABAK%20A1%20FULL.pdf"
  }
]
```

Setelah online, PDF itu akan muncul sebagai pilihan `PDF online` dan bisa disimpan offline ke perangkat.

## Cara pakai cepat

1. Import PDF atau pilih PDF online jika tersedia.
2. Gunakan `Cursor` untuk membaca tanpa membuat tanda.
3. Pilih tool `T`, tap area workbook, lalu ketik jawaban.
4. Pilih `Pen`, `Highlight`, atau `Garis` untuk menandai.
5. Pilih mode halaman `+/-`, `Swipe`, atau `Scroll`.
6. Di layar HP/iPad, buka tombol bawah: `File`, `Tools`, `Full/Exit`, dan `Notes`.
7. Simpan catatan belajar di `Catatan halaman` atau `Study Cards`.

## Penyimpanan anotasi

Coretan, highlight, teks jawaban, catatan, dan Study Cards tidak mengubah PDF asli. Semuanya disimpan sebagai data terpisah di browser lewat IndexedDB.

Gunakan `Export backup` untuk menyimpan anotasi ke file JSON. Gunakan `Import backup` untuk memasukkan lagi anotasi itu ke dokumen aktif di perangkat lain.

Fitur export PDF final yang menyatukan PDF + anotasi bisa ditambahkan sebagai tahap berikutnya.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Folder hasil build ada di `dist/` dan bisa di-deploy ke GitHub Pages.

## GitHub Pages

Project ini sudah punya workflow `.github/workflows/deploy.yml`.

1. Upload isi folder project ke repo GitHub.
2. Buka `Settings` -> `Pages`.
3. Pada `Build and deployment`, pilih `GitHub Actions`.
4. Push ke branch `main`.
5. Setelah workflow selesai, buka URL Pages dari tab `Actions` atau `Settings` -> `Pages`.

## Install PWA

Android Chrome:

1. Buka URL GitHub Pages.
2. Tap menu.
3. Pilih `Install app` atau `Add to Home screen`.

iPhone/iPad Safari:

1. Buka URL GitHub Pages.
2. Tap Share.
3. Pilih `Add to Home Screen`.
4. Buka dari ikon Home Screen.
