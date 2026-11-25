# Panduan Pemilik ZuruPOS

Panduan singkat untuk menyiapkan toko sampai siap berjualan. ZuruPOS **mencatat** pembayaran; uang tidak lewat ZuruPOS.

Ada dua bagian:

- **Dashboard** (browser, di HP atau laptop): untuk pemilik dan manajer. Atur menu, stok, staf, dan lihat laporan.
- **Aplikasi kasir** (tablet Android di kasir): untuk menerima pesanan, mencetak struk, dan mencatat stok.

---

## 1. Daftarkan toko

1. Buka dashboard, pilih **Daftarkan toko**.
2. Isi nama toko, nama Anda, email, kata sandi (minimal 8 karakter), dan **PIN** 4–6 angka.
   PIN dipakai untuk masuk di aplikasi kasir. PIN yang terlalu mudah ditolak: angka sama semua (`1111`), berurutan (`1234`, `4321`) atau pola umum (`1212`).
3. Setelah daftar, Anda masuk ke **Beranda**. Di sana ada kartu **Siapkan toko Anda**: daftar langkah dari profil toko sampai pesanan percobaan pertama. Setiap langkah tercentang sendiri setelah selesai, dan kartunya hilang setelah langkah wajib selesai (bahan dan staf boleh dilewati).

Tanda **(?)** di samping istilah seperti *Pergantian hari*, *Satuan dasar* atau *HPP rata-rata* membuka penjelasan singkat.

## 2. Pengaturan toko

Di **Pengaturan**:

- **Profil toko**: alamat dan telepon (tercetak di struk), zona waktu (biasanya `Asia/Jakarta`).
- **Pergantian hari**: kalau toko buka sampai lewat tengah malam, isi jamnya (misalnya `2`). Pesanan sebelum jam itu masuk ke hari sebelumnya.
- **Pajak & biaya layanan**: nyalakan PB1 (misalnya 10%) dan/atau biaya layanan. Contoh perhitungan di bawahnya langsung berubah, jadi Anda bisa memeriksa sebelum menyimpan.
  Harga menu **belum termasuk** pajak.
- **Metode pembayaran**: matikan yang tidak dipakai (misalnya kartu kredit).
- **Struk**: teks atas dan bawah struk.
- **Peringatan stok**: email saat bahan menipis dikirim ke email pemilik dan email tambahan.
- **Kunci otomatis kasir**: berapa menit tablet terkunci kalau tidak dipakai.

## 3. Staf

Di **Staf** → **Tambah staf**:

| Peran | Masuk dengan | Bisa apa |
|---|---|---|
| Manajer | Email + kata sandi (dashboard), PIN (kasir) | Menu, stok, diskon, pembatalan pesanan, pasang perangkat |
| Kasir | PIN | Terima pesanan dan pembayaran; batal pesanan dengan persetujuan manajer |
| Karyawan | PIN | Lihat pesanan hari ini, catat stok masuk, terbuang, dan stok opname |

- Manajer menerima **email undangan** untuk membuat kata sandi.
- Lupa PIN? Pilih ikon kunci di samping nama staf untuk **atur ulang PIN**.
- Staf berhenti? **Nonaktifkan**. Sesinya langsung berakhir.

## 4. Bahan dan stok awal

1. **Bahan** → **Tambah bahan**: nama, satuan dasar (g, ml, atau pcs), dan batas stok menipis.
   Satuan dasar tidak bisa diubah setelah dibuat.
   Isi **satuan beli** kalau Anda membeli dalam kemasan (misalnya *Karton 1 L = 1000 ml*).
2. **Stok** → **Stok masuk**: pilih bahan, jumlah (boleh dalam satuan beli), dan **total harga beli**.
   ZuruPOS menghitung biaya rata-rata per satuan untuk laporan margin.

## 5. Menu

1. **Menu** → buat **kategori** (misalnya Kopi, Non-Kopi, Makanan), lalu **menu** dengan harga dan warna tombol.
2. **Pilihan Menu** → buat grup pilihan, misalnya:
   - *Ukuran* (wajib, satu pilihan): Regular (default), Large +Rp 5.000
   - *Susu* (wajib): Susu segar (default), Oat milk +Rp 6.000
   - *Tambahan* (boleh beberapa): Extra shot +Rp 5.000
3. Pada tiap pilihan, atur **efek ke bahan**: tambah bahan, hapus bahan, atau ganti bahan.
   Contoh: *Large* mengganti Cup 12oz dengan Cup 16oz dan menambah susu 50 ml.
4. Buka menu → **Resep**: bahan per 1 porsi. Pasang grup pilihan ke menu.
   Kotak **pratinjau** menunjukkan bahan yang terpakai untuk kombinasi pilihan, misalnya *Large + Oat + Extra shot*. Periksa sebelum mulai berjualan.
5. Menu habis? Kasir bisa menandai **Habis** dengan menekan lama tombol menu di aplikasi, atau lewat **Pengaturan → Ketersediaan menu** (ada kolom cari).

## 6. Diskon

**Diskon** → buat diskon persen atau potongan Rupiah, untuk **item** atau seluruh **pesanan**.
Kasir hanya bisa memakai diskon yang sudah dibuat; diskon bebas hanya untuk pemilik dan manajer.

## 7. Pasang tablet kasir

1. Pasang aplikasi ZuruPOS di tablet Android.
2. Saat pertama dibuka, pilih **Pasangkan perangkat ini**: pemilik atau manajer memasukkan email, kata sandi, dan nama perangkat (misalnya *Kasir Depan*).
3. Staf memilih namanya, lalu memasukkan PIN. PIN salah 5 kali → terkunci 5 menit.
4. Tablet hilang? Di dashboard **Perangkat** → **Cabut**. Semua staf di tablet itu langsung keluar.

### Printer

Di aplikasi: **Pengaturan** → **Tambah printer** (maksimal 2).

- **Bluetooth**: pasangkan dulu printer di *Pengaturan Android → Bluetooth*, lalu pilih dari daftar. Printer belum muncul? Tekan tombol **muat ulang** di samping daftar.
  Setiap tablet harus dipasangkan sendiri dengan printernya.
- **Jaringan**: isi alamat IP printer (port 9100).
- Pilih lebar kertas (58 atau 80 mm) dan fungsinya: **struk pelanggan** dan/atau **tiket barista**.
- Tekan **Tes cetak**: angka penggaris harus pas satu baris.

Printer mati atau kertas habis tidak membatalkan pesanan. Di layar *Selesai* akan tampil **Gagal** dengan tombol **Coba lagi**. Struk juga bisa dicetak ulang dari **Pesanan hari ini**.

## 8. Sehari-hari

- **Menerima pesanan**: ketuk menu → pilih ukuran dan lain-lain → **Tambah** → **Bayar** → pilih metode.
  Tunai: pilih nominal cepat atau ketik uang diterima; kembalian langsung tampil.
  Non-tunai: pilih penyedia (misalnya GoPay). Tidak ada di daftar? Pilih **Lainnya** lalu ketik namanya.
  **Bayar terpisah**: tambahkan pembayaran berikutnya untuk sisa tagihan (misalnya sebagian tunai, sisanya QRIS).
- **Internet putus**: tombol Bayar nonaktif dan muncul tanda *Offline*. Kalau putus tepat saat **Selesai**, pesanan tersimpan di tablet. Tekan **Coba lagi** setelah internet kembali; pesanan tidak akan tercatat dua kali.
- **Membatalkan pesanan**: **Pesanan hari ini** → pilih pesanan → **Batalkan pesanan**, isi alasan, dan pilih apakah stok bahan dikembalikan. Kasir perlu PIN manajer atau pemilik.
- **Stok**: karyawan atau manajer mencatat **Stok masuk**, **Terbuang** (dengan alasan), dan **Stok opname** (isi hasil hitung; yang kosong tidak berubah). Penjualan otomatis mengurangi stok sesuai resep.
  Stok boleh minus; penjualan tidak pernah ditolak karena stok.
- **Email stok menipis** dikirim sekali saat bahan melewati batas. Email berikutnya baru dikirim setelah stok diisi lagi lalu menipis lagi.

## 9. Laporan (pemilik)

- **Beranda**: penjualan hari ini, diperbarui otomatis setiap menit.
- **Laporan**: penjualan per hari dan per jam, pembayaran per metode, menu terjual, jam ramai, margin dan nilai stok, evaluasi menu, serta pembatalan.
  Pilih periode: Hari ini, Kemarin, 7 hari, Bulan ini, Bulan lalu, atau tanggal sendiri.
- **Pesanan**: semua pesanan dengan pencarian (nomor, nama pelanggan, menu) dan filter.
- *Penjualan bersih* = setelah diskon, sebelum pajak dan biaya layanan. Pesanan batal tidak dihitung.

### Email ringkasan

ZuruPOS mengirim dua email ke **email pemilik** (tidak ke email tambahan untuk stok menipis):

- **Ringkasan harian**, setiap pagi jam 07.00 (waktu toko) untuk hari kemarin: penjualan bersih, jumlah pesanan, rata-rata per pesanan, perbandingan dengan hari yang sama minggu lalu, pembayaran per metode, 3 menu terlaris, pembatalan dan jumlah bahan yang stoknya menipis. Email ini tetap dikirim walau tidak ada transaksi; isinya *Tidak ada transaksi tercatat*. Jika toko buka tapi muncul tulisan itu, periksa tablet kasir.
- **Ringkasan mingguan**, setiap Senin jam 07.30 untuk minggu lalu (Senin–Minggu): penjualan dibanding minggu sebelumnya, jam ramai dan sepi (setelah ada data 3 minggu), dan paling banyak 3 saran dari *Evaluasi menu*. Tidak dikirim untuk minggu tanpa transaksi.

Keduanya bisa dimatikan di **Pengaturan → Peringatan & perangkat**.

### Jam ramai

**Laporan → Jam ramai** menunjukkan kapan toko ramai: setiap baris satu hari (Senin–Minggu), setiap kolom satu jam. Makin gelap kotaknya, makin ramai jam itu dibanding jam lain.

- Pilih **Jumlah pesanan** atau **Penjualan bersih** di atas tabel. Di **Penjualan bersih**, angka di kotak dibulatkan: *45rb* = Rp 45.000, *1,2jt* = Rp 1.200.000. Ketuk kotak untuk melihat angka lengkapnya.
- Penjualan bersih diambil dari pesanan yang sudah dibayar, jadi tidak perlu resep atau bahan.
- Angkanya **rata-rata per hari buka**. Hari tanpa pesanan sama sekali (misalnya toko tutup) tidak ikut dihitung, jadi tidak menurunkan rata-rata.
- Jika toko buka lewat tengah malam, jam setelah 00.00 tetap masuk ke hari sebelumnya, sesuai **Pergantian hari (jam)** di Pengaturan.
- Pilih periode 4, 8 atau 12 minggu. Selama datanya belum 3 minggu, muncul tulisan **Data baru … minggu**: angkanya sudah benar, tapi polanya belum tentu mewakili minggu biasa. Setelah 3 minggu, ZuruPOS menulis jam paling ramai dan paling sepi di atas tabel.
- Pakai untuk mengatur jadwal staf, waktu menyiapkan bahan, atau jam promo di saat sepi.

### Evaluasi menu

**Laporan → Evaluasi menu** membantu memutuskan menu mana yang dipertahankan, dinaikkan harganya, dipromosikan, atau dievaluasi. Pilih kategori (misalnya Kopi), karena menu dibandingkan dengan menu lain di kategori yang sama.

Setiap menu dinilai dari dua hal: **laris** (jumlah terjual dibanding menu lain di kategorinya) dan **untung per porsi** (penjualan bersih setelah diskon dikurangi HPP).

| Kelompok | Artinya | Yang bisa dilakukan |
|---|---|---|
| **Andalan** | Laris dan untungnya besar | Pertahankan resep, harga dan posisinya |
| **Naikkan harga** | Laris, tapi untung per porsinya kecil | Naikkan harga sedikit atau kurangi HPP. ZuruPOS menyarankan kenaikan (kelipatan Rp 1.000, paling banyak sekitar 10% dari harganya) dan perkiraan tambahan per 30 hari, *jika jumlah terjual tetap* |
| **Promosikan** | Untungnya besar, tapi kurang laris | Tawarkan ke pembeli, taruh di tempat yang terlihat |
| **Evaluasi** | Kurang laris dan untungnya kecil | Ubah resep atau harga, atau pertimbangkan untuk dihapus |

- Laporan ini butuh **HPP yang lengkap**. Menu tanpa resep, dengan bahan yang belum punya biaya (termasuk bahan di pilihan menu, misalnya sirup), atau yang terjual dengan HPP Rp 0, ditaruh di daftar **HPP belum lengkap**. Tekan **Lengkapi** untuk membuka menunya.
- Biaya bahan didapat dari **Stok masuk** (jumlah dan total harga beli). Bahan yang belum pernah dicatat stok masuknya belum punya biaya.
- Jika lebih dari separuh penjualan kategori berasal dari menu yang HPP-nya belum lengkap, muncul **Lengkapi HPP dulu** dan kelompoknya tidak ditampilkan. Kategori juga butuh minimal 3 menu dengan HPP lengkap.
- Periode bawaan 30 hari terakhir (sampai kemarin). Menu yang baru dilengkapi resepnya bisa tetap masuk daftar *HPP belum lengkap* sampai penjualan lamanya (dengan HPP Rp 0) keluar dari periode.

## 10. Masalah umum

| Masalah | Yang dilakukan |
|---|---|
| Staf lupa PIN | Dashboard → Staf → atur ulang PIN |
| PIN terkunci | Tunggu 5 menit, atau masuk dengan staf lain |
| Lupa kata sandi dashboard | Halaman masuk → *Lupa kata sandi?* (link dikirim lewat email) |
| Harga berubah saat kasir membayar | Aplikasi memuat menu terbaru dan menghitung ulang; periksa total lalu bayar lagi |
| Pesanan *belum terkirim* | Periksa internet, lalu tekan **Coba lagi** |
| Struk tidak tercetak | Nyalakan printer / isi kertas, lalu **Coba lagi** atau cetak ulang dari Pesanan hari ini |
