import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  FileCheck2,
  Fingerprint,
  Layers3,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useNavigate, useLoaderData } from "@/lib/rr";
import { api, json, type UserSession } from "./api";
import { Brand, Spinner } from "./components";

export default function Login() {
  const navigate = useNavigate();
  const loader = useLoaderData() as { serviceError?: string } | null;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const user = await api<UserSession>("/auth/login", {
        method: "POST",
        body: json({ username, password }),
      });
      navigate(user.requirePasswordChange ? "/pengaturan" : "/dashboard", { replace: true });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-[#fcfcfb] lg:grid lg:grid-cols-[1fr_0.94fr]">
      <section className="flex min-h-screen flex-col px-7 py-8 sm:px-12 lg:px-[9%] lg:py-10">
        <header className="flex items-center justify-between">
          <Brand />
          <span className="hidden rounded-full border border-slate-200 px-3 py-1.5 text-[10px] font-medium text-slate-500 sm:block">
            Sistem internal akademik
          </span>
        </header>
        <div className="mx-auto flex w-full max-w-[375px] flex-1 flex-col justify-center py-16 lg:py-12">
          <div className="mb-6 flex items-center gap-2.5">
            <span className="h-px w-7 bg-teal-600" />
            <span className="text-[10px] font-semibold uppercase tracking-[2.4px] text-teal-700">
              Ruang kerja asisten
            </span>
          </div>
          <h1 className="font-display text-[42px] leading-[1.12] text-[#20364a] sm:text-[46px]">
            Selamat datang
            <br />
            kembali<span className="text-teal-600">.</span>
          </h1>
          <p className="mt-4 max-w-[330px] text-[13px] leading-[1.8] text-slate-500">
            Satu ruang untuk mengelola praktikan, menilai dengan terarah, dan melihat setiap
            progres.
          </p>
          <form onSubmit={submit} className="mt-9 space-y-5">
            <label className="block">
              <span className="mb-2.5 block text-xs font-semibold text-slate-600">Username</span>
              <div className="relative">
                <UserRound
                  size={17}
                  strokeWidth={1.5}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Masukkan username Anda"
                  className="h-[49px] w-full rounded-lg border border-slate-200 bg-white pl-11 pr-4 text-[13px] placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/10"
                />
              </div>
            </label>
            <label className="block">
              <span className="mb-2.5 block text-xs font-semibold text-slate-600">Password</span>
              <div className="relative">
                <LockKeyhole
                  size={17}
                  strokeWidth={1.5}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={visible ? "text" : "password"}
                  placeholder="Masukkan password Anda"
                  className="h-[49px] w-full rounded-lg border border-slate-200 bg-white pl-11 pr-11 text-[13px] placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/10"
                />
                <button
                  type="button"
                  aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
                  onClick={() => setVisible(!visible)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <ShieldCheck size={14} />
              <span>Sesi aman. Data praktikan tetap terlindungi.</span>
            </div>
            {(error || loader?.serviceError) && (
              <p
                role="alert"
                className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs leading-relaxed text-red-700"
              >
                {error || loader?.serviceError}
              </p>
            )}
            <button
              disabled={busy}
              className="group flex h-[49px] w-full items-center justify-center gap-3 rounded-lg bg-[#203b52] text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#2e5068]"
            >
              {busy ? (
                <Spinner />
              ) : (
                <>
                  Masuk ke APaPSI{" "}
                  <ArrowRight size={16} className="transition group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>
          <div className="mt-7 flex items-start gap-2.5 rounded-lg bg-[#f2f5f4] px-4 py-3.5">
            <Fingerprint size={18} className="mt-0.5 shrink-0 text-teal-700" />
            <p className="text-[11px] leading-[1.7] text-slate-500">
              Akses khusus asisten praktikum APSI.
              <br />
              <span className="text-slate-600">Gunakan akun yang diberikan administrator.</span>
              <br />
              <span className="text-slate-400">
                Belum ada akun? Isi username dan password minimal 6 karakter — akun pertama
                otomatis menjadi administrator.
              </span>
            </p>
          </div>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 text-[10px] text-slate-400">
          <span>© {new Date().getFullYear()} APaPSI · Teknik Industri</span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-teal-600" />
            Praktikum APSI
          </span>
        </footer>
      </section>
      <section className="relative hidden min-h-screen overflow-hidden bg-[#18354a] px-[10%] py-10 text-white lg:flex lg:flex-col">
        <div className="absolute -right-32 -top-40 size-[650px] rounded-full border border-white/[0.035]" />
        <div className="absolute -right-20 -top-28 size-[550px] rounded-full border border-white/[0.04]" />
        <div className="absolute -bottom-60 -left-60 size-[700px] rounded-full border border-white/[0.04]" />
        <div className="relative flex items-center justify-between">
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-[2px] text-slate-300">
            <BookOpen size={15} strokeWidth={1.5} />
            Analisis & perancangan sistem informasi
          </span>
          <ArrowUpRight size={18} className="text-slate-400" />
        </div>
        <div className="relative my-auto py-12">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] text-[#b9d7d0]">
            <span className="size-1.5 rounded-full bg-[#91b9a9]" />
            TERSTRUKTUR. TERPUSAT. TERUKUR.
          </span>
          <h2 className="mt-7 font-display text-[47px] leading-[1.13] xl:text-[54px]">
            Lebih sedikit sheet.
            <br />
            Lebih banyak
            <br />
            <span className="italic text-[#b6d3c5]">ruang untuk menilai.</span>
          </h2>
          <p className="mt-5 max-w-[350px] text-[12px] leading-[1.9] text-[#a6b8c6]">
            Dari pengumpulan hingga nilai akhir, semua terhubung dalam satu alur yang jelas. Fokus
            pada penilaian, bukan perhitungan.
          </p>
          <div className="mt-10 rounded-xl border border-white/15 bg-white/[0.035] p-5 backdrop-blur-sm">
            <div className="mb-5 flex items-center justify-between">
              <span className="text-[9px] font-semibold tracking-[1.8px] text-slate-400">
                ALUR PENILAIAN
              </span>
              <span className="rounded bg-[#83aa9c]/15 px-2 py-1 text-[9px] text-[#b6d3c5]">
                Tahap I
              </span>
            </div>
            <div className="flex items-center justify-between gap-1">
              {[
                { icon: Layers3, label: "Pilih rombel", number: "01" },
                { icon: FileCheck2, label: "Isi penilaian", number: "02" },
                { icon: Check, label: "Nilai akhir", number: "03" },
              ].map((step, index) => (
                <div key={step.number} className="contents">
                  <div className="flex flex-col items-center gap-2.5">
                    <div className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#b6d3c5]">
                      <step.icon size={19} strokeWidth={1.5} />
                    </div>
                    <span className="text-[10px] text-slate-300">{step.label}</span>
                  </div>
                  {index < 2 && <ChevronRight size={15} className="-mt-5 text-slate-500" />}
                </div>
              ))}
            </div>
            <div className="mt-5 border-t border-white/10 pt-4 text-center text-[10px] text-[#8da6b5]">
              Input terarah <span className="px-2 text-slate-600">/</span> Kalkulasi otomatis{" "}
              <span className="px-2 text-slate-600">/</span> Riwayat tercatat
            </div>
          </div>
          <div className="mt-8 grid grid-cols-3 divide-x divide-white/10">
            {[
              ["4", "Asisten praktikum"],
              ["5", "Pertemuan awal"],
              ["100", "Maksimum poin"],
            ].map(([value, label]) => (
              <div key={label} className="first:pl-0 pl-6">
                <div className="font-display text-[30px] text-[#d7e7e0]">{value}</div>
                <div className="mt-1 text-[9px] text-slate-400">{label}</div>
              </div>
            ))}
          </div>
        </div>
        <footer className="relative flex items-end justify-between border-t border-white/10 pt-5">
          <p className="text-[10px] leading-[1.8] text-slate-400">
            S1 Teknik Industri
            <br />
            <span className="text-slate-300">Universitas Tidar</span>
          </p>
          <span className="text-[9px] tracking-[1.5px] text-[#698798]">
            DIRANCANG UNTUK ASISTEN
          </span>
        </footer>
      </section>
    </main>
  );
}
