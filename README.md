# APaPSI

Ruang kerja penilaian Praktikum APSI (Analisis & Perancangan Sistem Informasi) untuk asisten praktikum
S1 Teknik Industri, Universitas Tidar.

Dibangun dengan TanStack Start + React + TypeScript + Tailwind CSS, dengan data di Supabase
(PostgreSQL + Auth + Row Level Security).

## Menjalankan di lokal

Butuh Node.js 20+.

```sh
git clone <url-repository-ini>
cd apapsi
npm install
cp .env.example .env    # lalu isi dengan kunci project Supabase kamu
npm run dev
```

Buka `http://localhost:3000`.

## Menyiapkan database Supabase

1. Buat project baru di [supabase.com/dashboard](https://supabase.com/dashboard).
2. Buka **SQL Editor → New query**, salin seluruh isi `supabase/SETUP.sql`, lalu **Run**.
   File tersebut aman dijalankan berulang kali.
3. Buka **Project Settings → API**, lalu salin nilainya ke `.env`:

   | Variabel | Asal |
   | --- | --- |
   | `SUPABASE_URL` / `VITE_SUPABASE_URL` | Project URL |
   | `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key |

   `SUPABASE_SERVICE_ROLE_KEY` hanya boleh ada di server dan di environment variables Vercel.
   Jangan pernah menaruhnya di kode frontend atau meng-commit `.env`.

4. Di **Authentication → Sign In / Providers → Email**, matikan **Confirm email** supaya akun
   bisa langsung dipakai, dan turunkan **Minimum password length** ke `5` bila ingin memakai
   password pendek pada login pertama.

## Login pertama

Belum ada akun? Buka halaman login dan isi username + password. Akun pertama yang dibuat
otomatis berperan `admin`; akun berikutnya berperan `asisten`.

Username dipetakan ke alamat email internal (`admin` → `admin@apapsi.app`). Kalau sudah ada
akun lain, username `admin` tidak lagi bisa dipakai untuk membuat akun baru.

## Deployment (Vercel)

```sh
npx vercel login
npx vercel --prod
```

Setelah deploy pertama, tambahkan variabel lingkungan yang sama di **Vercel → Settings →
Environment Variables**, lalu deploy ulang:

```sh
npx vercel env add SUPABASE_URL production
npx vercel env add SUPABASE_PUBLISHABLE_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel env add VITE_SUPABASE_URL production --type config
npx vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production --type config
```

## Struktur penting

| Path | Isi |
| --- | --- |
| `src/app/` | Halaman: Login, Dashboard, Mahasiswa, Penilaian, Nilai Akhir, Rubrik, Pengaturan |
| `src/app/api.ts` | Klien API sisi browser (bearer token + penanganan error) |
| `src/lib/api.server.ts` | Seluruh handler API sisi server + otentikasi sesi |
| `src/lib/domain.ts` | Perhitungan nilai, validasi, dan konfigurasi rubrik default |
| `src/routes/` | Rute berbasis file TanStack Router (`/api/$` adalah satu-satunya pintu API) |
| `supabase/SETUP.sql` | Skema database, RLS, dan trigger |
| `supabase/migrations/` | Migrasi terpisah bila perlu diterapkan bertahap |