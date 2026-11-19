import { useState, type FormEvent } from "react";
import { BookOpen, CheckCircle2, CircleDashed, GraduationCap, MessageSquareText, Search, XCircle } from "lucide-react";

type ComponentItem = { code: string; name: string; group: string; assessed: boolean; level: string; note: string };
type Tugas = { label: string; state: string; components: ComponentItem[] };
type ApiResult = {
  found: boolean;
  message?: string;
  student?: { npm: string; name: string; rombel_id: number };
  tugas1?: Tugas;
  tugas2?: Tugas;
  tugas3?: { label: string; available: boolean; message: string };
};

function levelStyle(level: string) {
  if (level === "Sangat Baik") return "border-teal-100 bg-teal-50 text-teal-700";
  if (level === "Baik") return "border-sky-100 bg-sky-50 text-sky-700";
  if (level === "Cukup") return "border-amber-100 bg-amber-50 text-amber-700";
  if (level === "Kurang") return "border-red-100 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}
function isLacking(level: string) {
  return level === "Kurang" || level === "Cukup";
}

function TugasCard({ tugas }: { tugas: Tugas }) {
  const assessed = tugas.components.filter((c) => c.assessed).length;
  const unassessed = tugas.components.filter((c) => !c.assessed);
  const lacking = tugas.components.filter((c) => c.assessed && isLacking(c.level));
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{tugas.label}</h2>
          <p className="mt-1 text-[11px] text-slate-500">Komponen B (Substansi) & C (Tata Tulis)</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[1.4px] text-slate-400">Sudah dinilai</p>
          <p className="font-display text-2xl text-teal-800">
            {assessed}<span className="text-xs text-slate-400"> / {tugas.components.length}</span>
          </p>
        </div>
      </div>
      <div className="px-5 py-4">
        {unassessed.length > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-700">
            <CircleDashed size={16} className="mt-0.5 shrink-0 text-slate-400" />
            <span>
              {unassessed.length} komponen belum dinilai: <span className="font-semibold">{unassessed.map((c) => c.code).join(", ")}</span>.
            </span>
          </div>
        )}
        {lacking.length > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/70 p-3 text-[12px] text-amber-800">
            <CircleDashed size={16} className="mt-0.5 shrink-0" />
            <span>
              {lacking.length} komponen perlu diperbaiki/ditambah (Cukup/Kurang):{" "}
              <span className="font-semibold">{lacking.map((c) => `${c.code} (${c.level})`).join(", ")}</span>.
            </span>
          </div>
        )}
        {unassessed.length === 0 && lacking.length === 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-teal-100 bg-teal-50/60 p-3 text-[12px] text-teal-800">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>Semua komponen B dan C sudah dinilai dengan hasil Baik/Sangat Baik. Lihat catatan jika ada masukan.</span>
          </div>
        )}

        <div className="divide-y divide-slate-100">
          {tugas.components.map((c) => (
            <div key={c.code} className="py-3">
              <div className="flex flex-wrap items-start gap-3">
                <span className="w-8 shrink-0 pt-0.5 text-[11px] font-semibold text-slate-500">{c.code}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[12px] font-medium text-slate-700">{c.name}</p>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{c.group}</span>
                  </div>
                  {c.assessed && c.note && (
                    <div className="mt-2 flex items-start gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                      <MessageSquareText size={14} className="mt-0.5 shrink-0 text-slate-400" />
                      <span><span className="font-medium text-slate-700">Catatan asisten:</span> {c.note}</span>
                    </div>
                  )}
                </div>
                {c.assessed ? (
                  <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[10px] font-medium ${levelStyle(c.level || "")}`}>
                    {c.level || "Dinilai"}
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600">
                    <CircleDashed size={12} /> Belum dinilai
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function StudentProgress() {
  const [npm, setNpm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ApiResult | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = npm.trim();
    if (!/^\d{10}$/.test(value)) {
      setError("Masukkan NPM 10 digit angka.");
      setData(null);
      return;
    }
    setBusy(true);
    setError("");
    setData(null);
    try {
      const res = await fetch(`/api/public/student-progress?npm=${encodeURIComponent(value)}`);
      const body = (await res.json()) as ApiResult;
      if (!res.ok || !body.found) setError(body.message || "NPM tidak ditemukan.");
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
          <h1 className="mt-2 font-display text-3xl text-[#20364a]">Cek Kekurangan Penilaian</h1>
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
            <button
              disabled={busy}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#203b52] px-4 text-[13px] font-semibold text-white hover:bg-[#2e5068] disabled:opacity-60"
            >
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
                  {data.student.name
                    .split(" ")
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-800">{data.student.name}</h2>
                    <span className="rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-500">Rombel {data.student.rombel_id}</span>
                  </div>
                  <p className="mt-1 text-[11px] tabular-nums text-slate-400">NPM {data.student.npm}</p>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-teal-700">
                  <CheckCircle2 size={15} /> Data ditemukan
                </div>
              </div>
            </section>

            {data.tugas1 && <TugasCard tugas={data.tugas1} />}
            {data.tugas2 && <TugasCard tugas={data.tugas2} />}

            <section className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-5">
              <div className="flex items-start gap-3">
                <BookOpen size={18} className="mt-0.5 text-slate-400" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-700">Tugas 3</h2>
                  <p className="mt-1 text-[12px] text-slate-500">
                    Belum tersedia (rubrik belum ada). Akan ditampilkan di sini setelah rubrik dan penilaian Tugas 3 dibuka.
                  </p>
                </div>
              </div>
            </section>

            <p className="text-center text-[10px] text-slate-400">
              Informasi ini bersifat read-only, hanya menampilkan kategori dan catatan komponen B & C milik NPM yang dimasukkan (tanpa angka nilai).
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
