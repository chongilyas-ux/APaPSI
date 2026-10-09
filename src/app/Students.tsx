// @ts-nocheck -- ported verbatim from the original app, which was type-checked under its own (less strict) settings.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLoaderData, useRevalidator, useSearchParams } from "@/lib/rr";
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, download, json } from "./api";
import {
  Button,
  Card,
  Empty,
  Field,
  inputClass,
  Modal,
  PageHeading,
  Progress,
  SearchInput,
  Spinner,
  Status,
} from "./components";
import { formatScore, initialConfig, type Student } from "@/lib/domain";
import { AICommandBox } from "./AIWorkspace";

type StudentForm = {
  npm: string;
  name: string;
  rombel_id: number;
  study_case: string;
};
type ImportPreview = {
  records: StudentForm[];
  errors: string[];
  total: number;
  existing: number;
  missingStudyCase: number;
};
export default function Students({
  mode = "students",
}: {
  mode?: "students" | "assessment" | "final";
}) {
  const students = useLoaderData() as Student[];
  const revalidator = useRevalidator();
  const [params, setParams] = useSearchParams();
  const rombel = Number(params.get("rombel") ?? (params.get("q") ? 0 : 1));
  const status = params.get("status") ?? "all";
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: "npm" | "name"; ascending: boolean }>({
    key: "npm",
    ascending: true,
  });
  const [editing, setEditing] = useState<Student | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("apapsi-assessment-state", {
        detail: {
          npm: "__students__",
          dirty: editing !== undefined || Boolean(deleting) || importing,
        },
      }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("apapsi-assessment-state", {
          detail: { npm: "__students__", dirty: false },
        }),
      );
    };
  }, [editing, deleting, importing]);
  const [error, setError] = useState("");
  const [form, setForm] = useState<StudentForm>({
    npm: "",
    name: "",
    rombel_id: 1,
    study_case: "",
  });
  const urlQuery = params.get("q") ?? "";
  useEffect(() => {
    setQuery(urlQuery);
    setPage(1);
  }, [urlQuery]);
  useEffect(() => setPage(1), [rombel, status]);
  const filtered = useMemo(
    () =>
      students
        .filter(
          (student) =>
            (!rombel || student.rombel_id === rombel) &&
            (!query ||
              [student.npm, student.name, student.study_case].some((value) =>
                value.toLowerCase().includes(query.toLowerCase()),
              )) &&
            (status === "all" ||
              (status === "partial"
                ? ["partial", "draft"].includes(student.result?.status ?? "")
                : student.result?.status === status)),
        )
        .sort(
          (before, after) =>
            before[sort.key].localeCompare(after[sort.key]) * (sort.ascending ? 1 : -1),
        ),
    [students, rombel, query, status, sort],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  const title =
    mode === "students"
      ? "Data mahasiswa"
      : mode === "assessment"
        ? "Penilaian praktikum"
        : "Nilai akhir";
  const descriptions = {
    students: "Kelola identitas, rombel, dan studi kasus seluruh praktikan.",
    assessment: "Pilih rombel, temukan praktikan, lalu lanjutkan penilaian.",
    final: "Rekap seluruh komponen. Nilai resmi hanya tersedia setelah disahkan.",
  };
  const codes = [
    ...new Set([
      ...initialConfig.aspects.map((item) => item.code),
      ...students.flatMap((student) => Object.keys(student.result?.scores ?? {})),
    ]),
  ];
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next);
  }
  function edit(student: Student | null) {
    setEditing(student);
    setError("");
    setForm(
      student
        ? {
            npm: student.npm,
            name: student.name,
            rombel_id: student.rombel_id,
            study_case: student.study_case,
          }
        : { npm: "", name: "", rombel_id: rombel || 1, study_case: "" },
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(editing ? `/students/${editing.id}` : "/students", {
        method: editing ? "PUT" : "POST",
        body: json(form),
      });
      toast.success(editing ? "Data mahasiswa diperbarui" : "Mahasiswa berhasil ditambahkan");
      setEditing(undefined);
      revalidator.revalidate();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      await api(`/students/${deleting.id}`, { method: "DELETE" });
      toast.success("Mahasiswa dinonaktifkan; riwayat tetap tersimpan");
      setDeleting(null);
      revalidator.revalidate();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportFile() {
    setExporting(true);
    try {
      await download(
        `/export?type=${mode === "students" ? "students" : "grades"}${
          rombel ? `&rombel=${rombel}` : ""
        }`,
        `APaPSI-${mode === "students" ? "Mahasiswa" : "Nilai-Akhir"}.xlsx`,
      );
      toast.success("File Excel berhasil diekspor");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setExporting(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setError("");
    setPreview(null);
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Pilih file .xlsx.");
      return;
    }
    setBusy(true);
    try {
      setPreview(
        await api<ImportPreview>("/students/import/preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
          body: file,
        }),
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ inserted: number; skipped: number }>("/students/import/commit", {
        method: "POST",
        body: json({ records: preview.records }),
      });
      toast.success(
        `${result.inserted} mahasiswa diimpor, ${result.skipped} NPM yang sudah ada dilewati`,
      );
      setImporting(false);
      setPreview(null);
      revalidator.revalidate();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="Praktikum APSI"
        title={title}
        description={descriptions[mode]}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportFile} disabled={exporting}>
              {exporting ? <Spinner /> : <Download size={15} />}Export Excel
            </Button>
            {mode === "students" && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setImporting(true);
                    setPreview(null);
                    setError("");
                  }}
                >
                  <Upload size={15} />
                  Import
                </Button>
                <Button onClick={() => edit(null)}>
                  <Plus size={15} />
                  Tambah mahasiswa
                </Button>
              </>
            )}
          </div>
        }
      />
      {mode === "assessment" && <AICommandBox />}
      {mode === "assessment" && students.some((student) => student.result?.status === "draft") && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3.5">
          <FileSpreadsheet size={17} className="mt-0.5 shrink-0 text-blue-600" />
          <p className="text-[11px] leading-relaxed text-blue-800">
            <span className="font-semibold">Draft Excel perlu diperiksa.</span> Input lama
            dipertahankan; sel kosong tetap belum dinilai. Lengkapi dan konfirmasi sebelum
            mengesahkan nilai.
          </p>
        </div>
      )}
      <Card className="overflow-hidden">
        <div className="flex gap-1 overflow-x-auto border-b border-border px-5 pt-3">
          {[0, 1, 2, 3, 4].map((value) => (
            <button
              key={value}
              onClick={() => update("rombel", String(value))}
              className={`relative flex shrink-0 items-center gap-2 px-4 py-3.5 text-xs font-medium transition ${
                rombel === value ? "text-teal-700" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {value ? `Rombel ${value}` : "Semua"}
              <span
                className={`rounded-md px-1.5 py-0.5 text-[9px] ${
                  rombel === value ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-400"
                }`}
              >
                {students.filter((student) => !value || student.rombel_id === value).length}
              </span>
              {rombel === value && (
                <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-teal-600" />
              )}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <SearchInput
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
          />
          <div className="flex items-center gap-3">
            <select
              aria-label="Filter status penilaian"
              value={status}
              onChange={(event) => update("status", event.target.value)}
              className={`${inputClass} min-w-40 text-[11px]`}
            >
              <option value="all">Semua status</option>
              <option value="empty">Belum dinilai</option>
              <option value="partial">Belum lengkap</option>
              <option value="draft">Draft Excel</option>
              <option value="complete">Sudah lengkap</option>
            </select>
            <span className="hidden whitespace-nowrap text-[11px] text-slate-400 md:block">
              {filtered.length} mahasiswa
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table
            className={`w-full border-collapse text-left ${
              mode === "final" ? "min-w-[1300px]" : "min-w-[740px]"
            }`}
          >
            <thead>
              <tr className="border-y border-border bg-[#f8fafb] text-[9px] font-semibold uppercase tracking-[1px] text-slate-500">
                {mode !== "final" && <th className="w-14 py-3 pl-5">No</th>}
                <th className="px-3 py-3">
                  <button
                    onClick={() =>
                      setSort({
                        key: "npm",
                        ascending: sort.key !== "npm" || !sort.ascending,
                      })
                    }
                    className="flex items-center gap-2"
                  >
                    NPM
                    <ArrowDownUp size={11} />
                  </button>
                </th>
                <th className="px-3 py-3">
                  <button
                    onClick={() =>
                      setSort({
                        key: "name",
                        ascending: sort.key !== "name" || !sort.ascending,
                      })
                    }
                    className="flex items-center gap-2"
                  >
                    Nama mahasiswa
                    <ArrowDownUp size={11} />
                  </button>
                </th>
                {mode === "final" ? (
                  codes.map((code) => (
                    <th key={code} className="px-2 py-3 text-center">
                      {code}
                    </th>
                  ))
                ) : (
                  <th className="px-3 py-3">Studi kasus</th>
                )}
                {mode === "assessment" && <th className="px-3 py-3">Progress</th>}
                {mode !== "students" && (
                  <th className="whitespace-nowrap px-3 py-3 text-right">Nilai akhir</th>
                )}
                <th className="px-3 py-3">Status</th>
                {mode !== "final" && <th className="py-3 pl-3 pr-5 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((student, index) => (
                <tr key={student.id} className="transition hover:bg-slate-50/70">
                  {mode !== "final" && (
                    <td className="py-5 pl-5 text-[11px] text-slate-400">
                      {(currentPage - 1) * 10 + index + 1}
                    </td>
                  )}
                  <td className="px-3 py-5 text-[11px] tabular-nums text-slate-500">
                    {student.npm}
                  </td>
                  <td className="min-w-44 px-3 py-5">
                    <Link
                      to={`/penilaian/rombel-${student.rombel_id}/${student.npm}`}
                      className="text-xs font-semibold hover:text-teal-700"
                    >
                      {student.name}
                    </Link>
                    {!rombel && (
                      <p className="mt-1 text-[10px] text-slate-400">Rombel {student.rombel_id}</p>
                    )}
                  </td>
                  {mode === "final" ? (
                    codes.map((code) => (
                      <td
                        key={code}
                        className="px-2 py-5 text-center text-[11px] tabular-nums text-slate-500"
                      >
                        {formatScore(student.result?.scores[code])}
                      </td>
                    ))
                  ) : (
                    <td className="max-w-[260px] px-3 py-5">
                      <p
                        className={`line-clamp-2 text-[11px] leading-relaxed ${
                          student.study_case ? "text-slate-500" : "italic text-amber-600"
                        }`}
                        title={student.study_case}
                      >
                        {student.study_case || "Belum diisi"}
                      </p>
                    </td>
                  )}
                  {mode === "assessment" && (
                    <td className="px-3 py-5">
                      <Progress
                        value={student.result?.completed ?? 0}
                        total={student.result?.required ?? 12}
                      />
                    </td>
                  )}
                  {mode !== "students" && (
                    <td className="px-3 py-5 text-right">
                      <span
                        className={`text-[13px] font-semibold tabular-nums ${
                          student.result?.status === "complete" ? "text-teal-700" : "text-slate-500"
                        }`}
                      >
                        {student.result?.status === "empty"
                          ? "—"
                          : formatScore(student.result?.total)}
                      </span>
                      {student.result?.status !== "complete" &&
                        student.result?.status !== "empty" && (
                          <p className="mt-1 text-[8px] text-slate-400">Sementara</p>
                        )}
                    </td>
                  )}
                  <td className="px-3 py-5">
                    <Status result={student.result} />
                  </td>
                  {mode !== "final" && (
                    <td className="py-5 pl-3 pr-5">
                      <div className="flex justify-end gap-1.5">
                        {mode === "students" ? (
                          <>
                            <button
                              aria-label={`Edit ${student.name}`}
                              onClick={() => edit(student)}
                              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-teal-700"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              aria-label={`Hapus ${student.name}`}
                              onClick={() => {
                                setDeleting(student);
                                setError("");
                              }}
                              className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        ) : (
                          <Link
                            to={`/penilaian/rombel-${student.rombel_id}/${student.npm}`}
                            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[10px] font-semibold text-primary transition hover:border-teal-300 hover:bg-teal-50"
                          >
                            Nilai
                            <ArrowRight size={12} />
                          </Link>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && (
            <Empty
              title="Mahasiswa tidak ditemukan"
              description="Coba kata pencarian lain atau ubah filter rombel dan status."
            />
          )}
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4">
          <p className="text-[10px] text-slate-400">
            Menampilkan {filtered.length ? (currentPage - 1) * 10 + 1 : 0}–
            {Math.min(currentPage * 10, filtered.length)} dari {filtered.length} mahasiswa
          </p>
          <div className="flex items-center gap-2">
            <button
              aria-label="Halaman sebelumnya"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
              className="rounded-md border border-border p-1.5 text-slate-500 disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[10px] tabular-nums text-slate-500">
              {currentPage} / {pageCount}
            </span>
            <button
              aria-label="Halaman berikutnya"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
              className="rounded-md border border-border p-1.5 text-slate-500 disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </Card>
      {mode === "final" && (
        <p className="mt-4 text-[11px] text-slate-400">
          Nilai sementara bukan nilai final yang sah. Skor dihitung menggunakan versi konfigurasi
          masing-masing penilaian.
        </p>
      )}
      {editing !== undefined && (
        <Modal
          title={editing ? "Edit mahasiswa" : "Tambah mahasiswa"}
          onClose={() => {
            if (!busy) setEditing(undefined);
          }}
        >
          <form onSubmit={save} className="space-y-4">
            <Field label="NPM">
              <input
                required
                pattern="[0-9]{10}"
                maxLength={10}
                inputMode="numeric"
                className={inputClass}
                value={form.npm}
                onChange={(event) => setForm({ ...form, npm: event.target.value })}
              />
            </Field>
            <Field label="Nama lengkap">
              <input
                required
                maxLength={200}
                className={inputClass}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <Field label="Rombel">
              <select
                className={inputClass}
                value={form.rombel_id}
                onChange={(event) => setForm({ ...form, rombel_id: Number(event.target.value) })}
              >
                {[1, 2, 3, 4].map((value) => (
                  <option key={value} value={value}>
                    Rombel {value}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Studi kasus" hint="Boleh dikosongkan jika belum ditentukan.">
              <textarea
                rows={3}
                maxLength={2000}
                className={inputClass}
                value={form.study_case}
                onChange={(event) => setForm({ ...form, study_case: event.target.value })}
              />
            </Field>
            {error && (
              <p role="alert" className="text-xs text-red-600">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditing(undefined)}
                disabled={busy}
              >
                Batal
              </Button>
              <Button disabled={busy}>
                {busy ? <Spinner /> : <Check size={14} />}Simpan mahasiswa
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Nonaktifkan mahasiswa?"
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <p className="text-sm leading-relaxed text-slate-600">
            <strong>{deleting.name}</strong> tidak lagi tampil pada daftar aktif. Penilaian dan
            riwayatnya tetap disimpan dalam database.
          </p>
          {error && (
            <p role="alert" className="mt-4 text-xs text-red-600">
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={busy}>
              Batal
            </Button>
            <Button variant="danger" onClick={remove} disabled={busy}>
              {busy ? <Spinner /> : <Trash2 size={14} />}Nonaktifkan
            </Button>
          </div>
        </Modal>
      )}
      {importing && (
        <Modal
          title="Import data mahasiswa"
          onClose={() => {
            if (!busy) setImporting(false);
          }}
          wide
        >
          <p className="mb-4 text-xs leading-relaxed text-slate-500">
            Workbook .xlsx, maksimum 5 MB. Nama sheet: Rombel 1–4. Header: No, NPM, Nama, Studi
            Kasus. NPM yang sudah ada dilewati tanpa menimpa data.
          </p>
          <label className="flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-7">
            <Upload size={25} className="mb-3 text-teal-700" />
            <span className="text-xs font-medium">Pilih workbook mahasiswa</span>
            <input
              type="file"
              accept=".xlsx"
              disabled={busy}
              onChange={(event) => upload(event.target.files?.[0])}
              className="mt-3 max-w-full text-[11px] text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:text-teal-700"
            />
          </label>
          {busy && (
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <Spinner />
              Memproses workbook...
            </div>
          )}
          {error && (
            <p role="alert" className="mt-4 text-xs text-red-600">
              {error}
            </p>
          )}
          {preview && (
            <div className="mt-5">
              <div className="grid grid-cols-3 gap-3">
                {[
                  ["Baris dibaca", preview.total],
                  ["NPM sudah ada", preview.existing],
                  ["Studi kasus kosong", preview.missingStudyCase],
                ].map(([label, count]) => (
                  <div key={label} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[10px] text-slate-500">{label}</p>
                    <p className="mt-1 text-xl font-semibold">{count}</p>
                  </div>
                ))}
              </div>
              {preview.errors.length > 0 && (
                <div className="mt-4 rounded-lg bg-red-50 p-4">
                  <p className="mb-2 text-xs font-semibold text-red-700">
                    Perbaiki konflik sebelum import
                  </p>
                  {preview.errors.map((message, index) => (
                    <p key={index} className="mt-1 text-[11px] text-red-600">
                      {message}
                    </p>
                  ))}
                </div>
              )}
              <div className="mt-4 max-h-48 overflow-auto rounded-lg border border-border">
                {preview.records.slice(0, 100).map((record, index) => (
                  <div
                    key={index}
                    className="flex justify-between gap-3 border-b border-border px-3 py-2 text-[11px] last:border-0"
                  >
                    <span>
                      {record.npm} · {record.name}
                    </span>
                    <span className="shrink-0 text-slate-400">Rombel {record.rombel_id}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex justify-end">
                <Button
                  onClick={commit}
                  disabled={busy || preview.errors.length > 0 || !preview.total}
                >
                  <Check size={14} />
                  Konfirmasi import
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
