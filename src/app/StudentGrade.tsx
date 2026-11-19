import { useState, type FormEvent } from "react";
import { BookOpen, CheckCircle2, Clock3, GraduationCap, Search, XCircle } from "lucide-react";

type Slot = { week: string; slot: "lab" | "rumah"; time: string; content: string };

type ApiResult = {
  found: boolean;
  message?: string;
  student?: { npm: string; name: string; rombel_id: number };
  tugas1?: { label: string; state: string; result: { scores: Record<string, number | null>; completed: number; required: number; complete: boolean; total: number; status: string } };
  tugas2?: { label: string; state: string; result: { scores: Record<string, number | null>; completed: number; required: number; complete: boolean; total: number; status: string }; slots: Slot[] };
  tugas3?: { label: string; available: boolean; message: string };
};

const c1Names: Record<string, string> = {
  A1: "Ketepatan waktu pengumpulan",
  A2: "Kondisi isi saat pengumpulan",
  B1: "Latar belakang",
  B2: "Rumusan masalah, tujuan, dan manfaat",
  B3: "Tinjauan pustaka",
  B4: "Identifikasi aktor dan kebutuhan pengguna",
  B5: "Data Flow Diagram (DFD)",
  B6: "Entity Relationship Diagram (ERD)",
  B7: "Activity Diagram (UML)",
  C: "Tata tulis dan format",
  D1: "Kesungguhan dan keaktifan",
  D2: "Kepatuhan tata tertib praktikum",
};
const c2Names: Record<string, string> = {
  A1: "Ketepatan waktu pengumpulan",
  A2: "Kondisi isi saat pengumpulan",
  B1: "Tinjauan pustaka basis data",
  B2: "Merancang tabel basis data dari hasil ERD",
  B3: "Normalisasi basis data",
  B4: "Pembuatan relasi antar tabel",
  B5: "Pengisian data ke basis data",
  C: "Tata tulis dan format",
  D1: "Kesungguhan dan keaktifan",
  D2: "Kepatuhan tata tertib praktikum",
};

const statusLabel: Record<string, string> = {
  empty: "Belum dinilai",
  partial: "Sebagian",
  complete: "Lengkap",
  draft: "Draft",
  "manual-review": "Perlu tinjauan manual",
  "belum dinilai": "Belum dinilai",
};

function fmt(v: number | null | undefined) {
  return v == null ? "-" : v.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}
function badge(status: string) {
  const s = statusLabel[status] ?? status;
  const cls =
    status === "complete"
      ? "bg-teal-50 text-teal-700 border-teal-100"
      : status === "manual-review"
        ? "bg-amber-50 text-amber-700 border-amber-100"
        : status === "partial" || status === "draft"
          ? "bg-slate-100 text-slate-600 border-slate-200"
          : "bg-slate-100 text-slate-500 border-slate-200";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${cls}`}>{s}</span>;
}
function timeLabel(t: string) {
  return t === "on-time" ? "Tepat waktu" : t === "late" ? "Terlambat" : t === "missing" ? "Tidak mengumpulkan" : "Belum diisi";
}
function contentLabel(c: string) {
  return c === "suitable" ? "Sesuai" : c === "lacking" ? "Masih kurang" : c === "unreadable" ? "Tidak bisa dibuka" : c === "missing" ? "Tidak mengumpulkan" : "Belum diisi";
}

function ScoreCard({
  title,
  state,
  result,
  names,
  children,
}: {
  title: string;
  state: string;
  result: { scores: Record<string, number | null>; completed: number; required: number; total: number; status: string } | null;
  names: Record<string, string>;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <p className="mt-1 text-[11px] text-slate-500">Status: {state}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[1.4px] text-slate-400">Nilai</p>
          <p className="font-display text-3xl text-teal-800">{fmt(result?.total ?? null)}<span className="text-xs text-slate-400"> / 100</span></p>
          <div className="mt-1">{badge(result?.status ?? "empty")}</div>
        </div>
      </div>
      {result && (
        <div className="px-5 py-4">
          <p className="mb-3 text-[10px] text-slate-400">Progres komponen: {result.completed}/{result.required}</p>
          <div className="divide-y divide-slate-100">
            {Object.keys(names).map((code) => (
              <div key={code} className="flex items-center gap-3 py-2.5">
                <span className="w-8 text-[11px] font-semibold text-slate-500">{code}</span>
                <span className="flex-1 text-[11px] text-slate-600">{names[code]}</span>
                <span className="text-[11px] font-semibold tabular-nums text-teal-700">{fmt(result.scores[code])}</span>
              </div>
            ))}
          </div>
          {children}
        </div>
      )}
    </section>
  );
}

export default function StudentGrade() {
  const [npm, setNpm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ApiResult | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = npm.trim();
    if (!/^\d{10}$/.test(value)) { setError("Masukkan NPM 10 digit angka."); setData(null); return; }
    setBusy(true); setError(""); setData(null);
    try {
      const res = await fetch(`/api/public/student-grade?npm=${encodeURIComponent(value)}`);
      const body = (await res.json()) as ApiResult;
      if (!res.ok || !body.found) { setError(body.message || "NPM tidak ditemukan."); }
      else setData(body);
    } catch {
      setError("Gagal menghubungi server. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7faf9]">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-[#203b52] text-[#b4d7cc]">
            <GraduationCap size={26} strokeWidth={1.5} />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[2px] text-teal-700">APaPSI · Praktikum APSI</p>
          <h1 className="mt-2 font-display text-3xl text-[#20364a]">Cek Nilai Praktikum</h1>
          <p className="mt-2 text-[13px] text-slate-500">Masukkan NPM untuk melihat nilai Tugas 1 dan Tugas 2 kamu.</p>
        </header>

        <form onSubmit={submit} className="mx-auto mb-8 max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="block text-xs font-semibold text-slate-600">NPM</label>
          <div className="mt-2 flex gap-2">
            <input
              value={npm}
              onChange={(e) => setNpm(e.target.value.replace(/\D/g, "").slice(0, 10))}
              inputMode="numeric"
              maxLength={10}
              placeholder="Contoh: 2440508079"
              className="h-11 flex-1 rounded-lg border border-slate-200 px-3.5 text-[13px] placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/10"
            />
            <button disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#203b52] px-4 text-[13px] font-semibold text-white hover:bg-[#2e5068] disabled:opacity-60">
              <Search size={15} /> {busy ? "Mencari…" : "Cek"}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-slate-400">NPM terdiri dari 10 digit angka.</p>
        </form>

        {error && (
          <div className="mx-auto mb-6 flex max-w-md items-start gap-2 rounded-lg border border-red-100 bg-red-50 p-3 text-[12px] text-red-700">
            <XCircle size={16} className="mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}

        {data?.found && data.student && (
          <div className="space-y-5">
            <section className="rounded-xl border border-teal-100 bg-white p-5">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-xl bg-[#edf3f0] font-display text-xl text-teal-800">
                  {data.student.name.split(" ").slice(0, 2).map((w) => w[0]).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-800">{data.student.name}</h2>
                    <span className="rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-500">Rombel {data.student.rombel_id}</span>
                  </div>
                  <p className="mt-1 text-[11px] tabular-nums text-slate-400">NPM {data.student.npm}</p>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-teal-700"><CheckCircle2 size={15} /> Data ditemukan</div>
              </div>
            </section>

            {data.tugas1 && (
              <ScoreCard title={data.tugas1.label} state={data.tugas1.state} result={data.tugas1.result} names={c1Names} />
            )}

            {data.tugas2 && (
              <ScoreCard title={data.tugas2.label} state={data.tugas2.state} result={data.tugas2.result} names={c2Names}>
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-slate-700"><Clock3 size={14} /> Rekap pengumpulan (Minggu 6, 7, 9)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] text-left text-[11px]">
                      <thead><tr className="border-b border-slate-100 text-slate-400"><th className="py-2 pr-3 font-medium">Slot</th><th className="py-2 pr-3 font-medium">Waktu</th><th className="py-2 font-medium">Isi</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.tugas2.slots.map((s) => (
                          <tr key={`${s.week}-${s.slot}`}>
                            <td className="py-2 pr-3 text-slate-600">Minggu {s.week} — {s.slot === "lab" ? "Di lab" : "Tugas di rumah"}</td>
                            <td className={`py-2 pr-3 ${s.time === "late" ? "text-amber-700" : s.time === "on-time" ? "text-teal-700" : "text-slate-400"}`}>{timeLabel(s.time)}</td>
                            <td className={`py-2 ${s.content === "suitable" ? "text-teal-700" : s.content ? "text-amber-700" : "text-slate-400"}`}>{contentLabel(s.content)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </ScoreCard>
            )}

            <section className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-5">
              <div className="flex items-start gap-3">
                <BookOpen size={18} className="mt-0.5 text-slate-400" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-700">Tugas 3</h2>
                  <p className="mt-1 text-[12px] text-slate-500">Belum tersedia (rubrik belum ada). Akan ditampilkan di sini setelah rubrik dan penilaian Tugas 3 dibuka.</p>
                </div>
              </div>
            </section>

            <p className="text-center text-[10px] text-slate-400">Informasi ini bersifat read-only dan hanya menampilkan nilai milik NPM yang dimasukkan.</p>
          </div>
        )}
      </div>
    </main>
  );
}
