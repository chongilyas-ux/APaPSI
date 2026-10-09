import { useEffect, useState, type FormEvent } from "react";
import { useBlocker, useLoaderData, useRevalidator, useRouteLoaderData } from "@/lib/rr";
import {
  Check,
  ChevronRight,
  Copy,
  Info,
  LockKeyhole,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api, json, type UserSession } from "./api";
import { Button, Card, Field, inputClass, Modal, PageHeading, Spinner } from "./components";
import { validateConfig, type Aspect, type Configuration, type Violation } from "@/lib/domain";
import { AIEntry } from "./AIWorkspace";

export type ConfigData = {
  active: { id: string; number: number; label: string; config: Configuration };
  draft: { config: Configuration; base_version: string; revision: number } | null;
  versions: {
    id: string;
    number: number;
    label: string;
    state: string;
    created_at: string;
  }[];
};
const tabs = ["Aspek & rubrik", "Pertemuan", "Pelanggaran", "Keamanan", "Versi"];
export default function Settings() {
  const loaded = useLoaderData() as ConfigData;
  const user = useRouteLoaderData("internal") as UserSession;
  const revalidator = useRevalidator();
  const [config, setConfig] = useState<Configuration>(
    structuredClone(loaded.draft?.config ?? loaded.active.config),
  );
  const [saved, setSaved] = useState(JSON.stringify(config));
  const [draftRevision, setDraftRevision] = useState(loaded.draft?.revision ?? 0);
  const [tab, setTab] = useState(user.requirePasswordChange ? "Keamanan" : "Aspek & rubrik");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editAspect, setEditAspect] = useState<{
    index: number;
    aspect: Aspect;
  } | null>(null);
  const [editViolation, setEditViolation] = useState<{
    index: number;
    violation: Violation;
  } | null>(null);
  const [publish, setPublish] = useState(false);
  const [password, setPassword] = useState({
    current: "",
    password: "",
    confirm: "",
  });
  const dirty = JSON.stringify(config) !== saved;
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("apapsi-assessment-state", { detail: { npm: "__configuration__", dirty } }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("apapsi-assessment-state", {
          detail: { npm: "__configuration__", dirty: false },
        }),
      );
    };
  }, [dirty]);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  const total = config.aspects
    .filter((item) => item.active)
    .reduce((sum, item) => sum + item.max, 0);
  useEffect(() => {
    if (dirty) return;
    const next = structuredClone(loaded.draft?.config ?? loaded.active.config);
    setConfig(next);
    setSaved(JSON.stringify(next));
    setDraftRevision(loaded.draft?.revision ?? 0);
  }, [loaded.active.id, loaded.draft?.revision]);
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const draft = await api<{ revision: number }>("/config/draft", {
        method: "PUT",
        body: json({
          config,
          base_version: loaded.active.id,
          revision: draftRevision,
        }),
      });
      setDraftRevision(draft.revision);
      setSaved(JSON.stringify(config));
      toast.success("Draft konfigurasi tersimpan; aturan aktif belum berubah");
      revalidator.revalidate();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function preparePublish() {
    setError("");
    try {
      validateConfig(config);
      if (dirty || !draftRevision) throw new Error("Simpan draft terbaru sebelum menerbitkan.");
      setPublish(true);
    } catch (error) {
      setError((error as Error).message);
      toast.error((error as Error).message);
    }
  }
  async function publishVersion() {
    setBusy(true);
    setError("");
    try {
      await api("/config/publish", {
        method: "POST",
        body: json({ revision: draftRevision }),
      });
      setPublish(false);
      toast.success("Versi baru diterbitkan. Nilai lama tidak berubah.");
      revalidator.revalidate();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password.password !== password.confirm) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/password", { method: "POST", body: json(password) });
      setPassword({ current: "", password: "", confirm: "" });
      toast.success("Password diperbarui; sesi lain dicabut");
      revalidator.revalidate();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function aspectEditor(aspect: Aspect, index: number) {
    setEditAspect({ index, aspect: structuredClone(aspect) });
  }
  function storeAspect(event: FormEvent) {
    event.preventDefault();
    if (!editAspect) return;
    const list = [...config.aspects];
    if (editAspect.index < 0) list.push(editAspect.aspect);
    else list[editAspect.index] = editAspect.aspect;
    setConfig({ ...config, aspects: list });
    setEditAspect(null);
  }
  function storeViolation(event: FormEvent) {
    event.preventDefault();
    if (!editViolation) return;
    const list = [...config.violations];
    if (editViolation.index < 0) list.push(editViolation.violation);
    else list[editViolation.index] = editViolation.violation;
    setConfig({ ...config, violations: list });
    setEditViolation(null);
  }
  const setAspect = (patch: Partial<Aspect>) => {
    if (editAspect)
      setEditAspect({
        ...editAspect,
        aspect: { ...editAspect.aspect, ...patch },
      });
  };
  return (
    <>
      <PageHeading
        eyebrow="Administrasi sistem"
        title="Pengaturan"
        description="Atur penilaian tanpa mengubah nilai lama secara tidak sengaja."
        action={
          tab !== "Keamanan" && tab !== "Versi" ? (
            <div className="flex gap-2">
              <Button variant="secondary" disabled={busy || !dirty} onClick={save}>
                {busy ? <Spinner /> : <Save size={14} />}Simpan draft
              </Button>
              <Button disabled={busy || dirty || !draftRevision} onClick={preparePublish}>
                Terbitkan versi
                <ChevronRight size={14} />
              </Button>
            </div>
          ) : undefined
        }
      />
      <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">AI Assistant</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Strict privacy · Sanitized instructions only · API key hanya di backend
          </p>
        </div>
        <AIEntry tab="Konfigurasi" />
      </Card>
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
        <ShieldCheck size={19} className="text-blue-600" />
        <p className="flex-1 text-[11px] leading-relaxed text-blue-800">
          <strong>Konfigurasi berversi.</strong> Versi aktif: {loaded.active.number}. Perubahan
          menjadi draft terlebih dahulu. Versi baru hanya digunakan untuk penilaian yang belum
          dimulai.
        </p>
        <span className="rounded-md bg-white px-2 py-1 text-[10px] text-blue-700">
          {dirty
            ? "Belum tersimpan"
            : draftRevision
              ? `Draft revisi ${draftRevision}`
              : "Tidak ada draft"}
        </span>
      </div>
      {user.mustChangePassword && (
        <div className="mb-5 rounded-lg border border-amber-100 bg-amber-50 p-4 text-[11px] leading-relaxed text-amber-800">
          Password awal masih digunakan. Ganti melalui tab Keamanan sebelum menggunakan data
          produksi.
        </div>
      )}
      <div className="mb-6 flex gap-2 overflow-x-auto">
        {tabs.map((item) => (
          <button
            key={item}
            onClick={() => {
              setTab(item);
              setError("");
            }}
            className={`shrink-0 rounded-lg px-4 py-2.5 text-xs font-medium ${
              item === tab
                ? "bg-primary text-white"
                : "border border-border bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-red-100 bg-red-50 p-3 text-xs leading-relaxed text-red-700"
        >
          {error}
        </p>
      )}
      {tab === "Aspek & rubrik" && (
        <>
          <Card className="mb-5 flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <h2 className="text-sm font-semibold">Total maksimum poin</h2>
              <p className="mt-1 text-[11px] text-slate-400">
                Wajib 100 sebelum konfigurasi dapat diterbitkan.
              </p>
            </div>
            <span
              className={`text-2xl font-semibold tabular-nums ${
                total === 100 ? "text-teal-700" : "text-red-600"
              }`}
            >
              {total}
              <span className="ml-1 text-sm font-normal text-slate-400">/ 100</span>
            </span>
          </Card>
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-5">
              <h2 className="text-sm font-semibold">Aspek penilaian</h2>
              <Button
                variant="secondary"
                onClick={() =>
                  aspectEditor(
                    {
                      code: "",
                      name: "",
                      group: "Substansi",
                      max: 1,
                      kind: "criterion",
                      active: true,
                      criteria: [
                        {
                          level: "Sangat Baik",
                          min: 1,
                          max: 1,
                          description: "",
                        },
                        { level: "Kurang", min: 0, max: 0, description: "" },
                      ],
                    },
                    -1,
                  )
                }
              >
                <Plus size={14} />
                Tambah aspek
              </Button>
            </div>
            <div className="divide-y divide-border">
              {config.aspects.map((aspect, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-3 px-5 py-4 ${
                    aspect.active ? "" : "bg-slate-50 opacity-60"
                  }`}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-semibold text-primary">
                    {aspect.code}
                  </span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold">{aspect.name}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {aspect.group} ·{" "}
                      {aspect.criteria.length
                        ? `${aspect.criteria.length} kategori`
                        : "Kalkulasi otomatis"}
                      {!aspect.active ? " · Nonaktif" : ""}
                    </p>
                  </div>
                  <span className="text-xs font-semibold">
                    {aspect.max}
                    <span className="ml-1 font-normal text-slate-400">poin</span>
                  </span>
                  <button
                    aria-label={`Edit aspek ${aspect.code}`}
                    onClick={() => aspectEditor(aspect, index)}
                    className="ml-3 rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                  >
                    <Pencil size={15} />
                  </button>
                </div>
              ))}
            </div>
          </Card>
          <Card className="mt-5 p-5">
            <Field label="Nama versi penilaian">
              <input
                value={config.label}
                maxLength={150}
                onChange={(event) => setConfig({ ...config, label: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Penalti per slot pengumpulan">
              <input
                type="number"
                min={0.1}
                max={10}
                step={0.1}
                value={config.penalty}
                onChange={(event) => setConfig({ ...config, penalty: Number(event.target.value) })}
                className={`${inputClass} mt-2`}
              />
            </Field>
          </Card>
        </>
      )}
      {tab === "Pertemuan" && (
        <Card className="p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Pertemuan praktikum</h2>
              <p className="mt-1 text-[11px] text-slate-400">
                Urutan daftar menentukan urutan pertemuan. A1/A2 memiliki slot lab dan rumah.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() =>
                setConfig({
                  ...config,
                  meetings: [
                    ...config.meetings,
                    {
                      id: crypto.randomUUID(),
                      name: `Pertemuan ${config.meetings.length + 1}`,
                      date: "",
                      active: true,
                    },
                  ],
                })
              }
            >
              <Plus size={14} />
              Tambah
            </Button>
          </div>
          <div className="space-y-3">
            {config.meetings.map((meeting, index) => (
              <div
                key={meeting.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
              >
                <span className="w-5 text-xs text-slate-400">{index + 1}</span>
                <input
                  aria-label={`Nama pertemuan ${index + 1}`}
                  required
                  maxLength={100}
                  value={meeting.name}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      meetings: config.meetings.map((item, position) =>
                        position === index ? { ...item, name: event.target.value } : item,
                      ),
                    })
                  }
                  className={`${inputClass} min-w-32 flex-1`}
                />
                <input
                  aria-label={`Tanggal pertemuan ${index + 1}`}
                  type="date"
                  value={meeting.date}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      meetings: config.meetings.map((item, position) =>
                        position === index ? { ...item, date: event.target.value } : item,
                      ),
                    })
                  }
                  className={`${inputClass} w-40!`}
                />
                <label className="flex items-center gap-2 text-[11px] text-slate-500">
                  <input
                    type="checkbox"
                    checked={meeting.active}
                    onChange={(event) =>
                      setConfig({
                        ...config,
                        meetings: config.meetings.map((item, position) =>
                          position === index ? { ...item, active: event.target.checked } : item,
                        ),
                      })
                    }
                    className="accent-teal-700"
                  />
                  Aktif
                </label>
                <button
                  aria-label={`Hapus ${meeting.name} dari draft`}
                  onClick={() =>
                    setConfig({
                      ...config,
                      meetings: config.meetings.filter((_, position) => position !== index),
                    })
                  }
                  className="p-2 text-slate-400 hover:text-red-600"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-5 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
            Menambah pertemuan menambah slot wajib dan mengubah denominator D1 pada versi baru.
            Penilaian lama tidak berubah. Sedikitnya satu pertemuan harus aktif.
          </p>
        </Card>
      )}
      {tab === "Pelanggaran" && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="text-sm font-semibold">Jenis pelanggaran D2</h2>
            <Button
              variant="secondary"
              onClick={() =>
                setEditViolation({
                  index: -1,
                  violation: { code: "", name: "", penalty: 1, active: true },
                })
              }
            >
              <Plus size={14} />
              Tambah pelanggaran
            </Button>
          </div>
          <div className="divide-y divide-border">
            {config.violations.map((violation, index) => (
              <div key={index} className="flex items-start gap-3 p-5">
                <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold">
                  {violation.code}
                </span>
                <div className="flex-1">
                  <p className="text-xs leading-relaxed text-slate-600">{violation.name}</p>
                  <p className="mt-2 text-[10px] text-slate-400">
                    {violation.active ? "Aktif" : "Nonaktif"}
                  </p>
                </div>
                <span className="text-xs font-semibold text-red-600">−{violation.penalty}</span>
                <button
                  aria-label={`Edit pelanggaran ${violation.code}`}
                  onClick={() =>
                    setEditViolation({
                      index,
                      violation: structuredClone(violation),
                    })
                  }
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                >
                  <Pencil size={14} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
      {tab === "Keamanan" && (
        <Card className="max-w-xl p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="rounded-lg bg-teal-50 p-2.5 text-teal-700">
              <LockKeyhole size={20} />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Ubah password akun</h2>
              <p className="mt-1 text-[11px] text-slate-400">
                Akun bersama admin/asisten. Password tersimpan sebagai hash.
              </p>
            </div>
          </div>
          <form onSubmit={changePassword} className="space-y-4">
            <Field label="Password sekarang">
              <input
                type="password"
                autoComplete="current-password"
                required
                maxLength={200}
                className={inputClass}
                value={password.current}
                onChange={(event) => setPassword({ ...password, current: event.target.value })}
              />
            </Field>
            <Field
              label="Password baru"
              hint="Minimal 12 karakter. Gunakan kombinasi yang tidak mudah ditebak."
            >
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={200}
                className={inputClass}
                value={password.password}
                onChange={(event) => setPassword({ ...password, password: event.target.value })}
              />
            </Field>
            <Field label="Konfirmasi password baru">
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={200}
                className={inputClass}
                value={password.confirm}
                onChange={(event) => setPassword({ ...password, confirm: event.target.value })}
              />
            </Field>
            <Button disabled={busy}>
              {busy ? <Spinner /> : <ShieldCheck size={14} />}Perbarui password
            </Button>
          </form>
          <p className="mt-5 border-t border-border pt-4 text-[11px] leading-relaxed text-slate-500">
            Sesi login lain dicabut setelah password berubah. Dengan satu akun bersama, riwayat
            hanya mengidentifikasi Admin, bukan asisten individual.
          </p>
        </Card>
      )}
      {tab === "Versi" && (
        <Card className="overflow-hidden">
          <div className="border-b border-border p-5">
            <h2 className="text-sm font-semibold">Riwayat versi konfigurasi</h2>
            <p className="mt-1 text-[11px] text-slate-400">
              Versi arsip dipertahankan untuk penilaian yang sudah dimulai.
            </p>
          </div>
          <div className="divide-y divide-border">
            {loaded.versions.map((version) => (
              <div key={version.id} className="flex items-center gap-4 p-5">
                <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold">
                  v{version.number}
                </span>
                <div className="flex-1">
                  <p className="text-xs font-semibold">{version.label}</p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {new Date(version.created_at).toLocaleString("id-ID")}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] ${
                    version.state === "active"
                      ? "bg-teal-50 text-teal-700"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {version.state === "active" ? "Aktif" : "Arsip"}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
      {editAspect && (
        <Modal
          title={editAspect.index < 0 ? "Tambah aspek" : "Edit aspek & rubrik"}
          onClose={() => setEditAspect(null)}
          wide
        >
          <form onSubmit={storeAspect} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Kode">
                <input
                  required
                  pattern="[A-Z][A-Z0-9]{0,9}"
                  value={editAspect.aspect.code}
                  onChange={(event) => setAspect({ code: event.target.value.toUpperCase() })}
                  className={inputClass}
                />
              </Field>
              <Field label="Maksimum poin">
                <input
                  required
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={editAspect.aspect.max}
                  onChange={(event) => setAspect({ max: Number(event.target.value) })}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Nama aspek">
              <input
                required
                maxLength={200}
                value={editAspect.aspect.name}
                onChange={(event) => setAspect({ name: event.target.value })}
                className={inputClass}
              />
            </Field>
            {editAspect.aspect.kind === "criterion" && (
              <Field label="Kelompok">
                <select
                  value={editAspect.aspect.group}
                  onChange={(event) => setAspect({ group: event.target.value })}
                  className={inputClass}
                >
                  <option>Substansi</option>
                  <option>Tata Tulis</option>
                </select>
              </Field>
            )}
            <Field label="Deskripsi aspek">
              <textarea
                rows={2}
                maxLength={5000}
                value={editAspect.aspect.description ?? ""}
                onChange={(event) => setAspect({ description: event.target.value })}
                className={inputClass}
              />
            </Field>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={editAspect.aspect.active}
                onChange={(event) => setAspect({ active: event.target.checked })}
                className="accent-teal-700"
              />
              Aspek aktif pada versi baru
            </label>
            {editAspect.aspect.criteria.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold">Kriteria rubrik</h3>
                {editAspect.aspect.criteria.map((criterion, index) => (
                  <div key={index} className="rounded-lg border border-border p-4">
                    <div className="mb-3 grid grid-cols-[1fr_75px_75px_30px] gap-2">
                      <input
                        aria-label={`Nama kategori ${index + 1}`}
                        required
                        value={criterion.level}
                        maxLength={100}
                        onChange={(event) =>
                          setAspect({
                            criteria: editAspect.aspect.criteria.map((item, position) =>
                              position === index ? { ...item, level: event.target.value } : item,
                            ),
                          })
                        }
                        className={inputClass}
                      />
                      <input
                        aria-label={`Skor minimum kategori ${index + 1}`}
                        type="number"
                        required
                        min={0}
                        max={100}
                        value={criterion.min}
                        onChange={(event) =>
                          setAspect({
                            criteria: editAspect.aspect.criteria.map((item, position) =>
                              position === index
                                ? { ...item, min: Number(event.target.value) }
                                : item,
                            ),
                          })
                        }
                        className={inputClass}
                      />
                      <input
                        aria-label={`Skor maksimum kategori ${index + 1}`}
                        type="number"
                        required
                        min={0}
                        max={100}
                        value={criterion.max}
                        onChange={(event) =>
                          setAspect({
                            criteria: editAspect.aspect.criteria.map((item, position) =>
                              position === index
                                ? { ...item, max: Number(event.target.value) }
                                : item,
                            ),
                          })
                        }
                        className={inputClass}
                      />
                      <button
                        type="button"
                        aria-label={`Hapus kategori ${criterion.level} dari draft`}
                        onClick={() =>
                          setAspect({
                            criteria: editAspect.aspect.criteria.filter(
                              (_, position) => position !== index,
                            ),
                          })
                        }
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <textarea
                      aria-label={`Deskripsi kategori ${index + 1}`}
                      rows={3}
                      maxLength={5000}
                      value={criterion.description}
                      onChange={(event) =>
                        setAspect({
                          criteria: editAspect.aspect.criteria.map((item, position) =>
                            position === index
                              ? { ...item, description: event.target.value }
                              : item,
                          ),
                        })
                      }
                      className={inputClass}
                    />
                    <label className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
                      <input
                        type="checkbox"
                        checked={criterion.active !== false}
                        onChange={(event) =>
                          setAspect({
                            criteria: editAspect.aspect.criteria.map((item, position) =>
                              position === index ? { ...item, active: event.target.checked } : item,
                            ),
                          })
                        }
                        className="accent-teal-700"
                      />
                      Kategori aktif pada versi baru
                    </label>
                  </div>
                ))}
              </div>
            )}
            {["criterion", "average"].includes(editAspect.aspect.kind) && (
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setAspect({
                    criteria: [
                      ...editAspect.aspect.criteria,
                      { level: "", min: 0, max: 0, description: "" },
                    ],
                  })
                }
              >
                <Plus size={14} />
                Tambah kategori
              </Button>
            )}
            <p className="rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
              Penghapusan kategori dari draft tidak menghapus rubrik versi lama. Seluruh rentang
              skor harus tercakup tanpa tumpang tindih sebelum publikasi.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditAspect(null)}>
                Batal
              </Button>
              <Button>
                <Check size={14} />
                Terapkan ke draft
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {editViolation && (
        <Modal
          title={editViolation.index < 0 ? "Tambah pelanggaran" : "Edit pelanggaran"}
          onClose={() => setEditViolation(null)}
        >
          <form onSubmit={storeViolation} className="space-y-4">
            <Field label="Kode">
              <input
                required
                pattern="[A-Z][A-Z0-9]{0,9}"
                value={editViolation.violation.code}
                onChange={(event) =>
                  setEditViolation({
                    ...editViolation,
                    violation: {
                      ...editViolation.violation,
                      code: event.target.value.toUpperCase(),
                    },
                  })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Nama / deskripsi">
              <textarea
                required
                rows={3}
                maxLength={1000}
                value={editViolation.violation.name}
                onChange={(event) =>
                  setEditViolation({
                    ...editViolation,
                    violation: {
                      ...editViolation.violation,
                      name: event.target.value,
                    },
                  })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Pengurangan per kejadian">
              <input
                type="number"
                required
                min={0.1}
                max={100}
                step={0.1}
                value={editViolation.violation.penalty}
                onChange={(event) =>
                  setEditViolation({
                    ...editViolation,
                    violation: {
                      ...editViolation.violation,
                      penalty: Number(event.target.value),
                    },
                  })
                }
                className={inputClass}
              />
            </Field>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={editViolation.violation.active}
                onChange={(event) =>
                  setEditViolation({
                    ...editViolation,
                    violation: {
                      ...editViolation.violation,
                      active: event.target.checked,
                    },
                  })
                }
                className="accent-teal-700"
              />
              Aktif
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditViolation(null)}>
                Batal
              </Button>
              <Button>Terapkan ke draft</Button>
            </div>
          </form>
        </Modal>
      )}
      {publish && (
        <Modal
          title="Terbitkan versi baru?"
          onClose={() => {
            if (!busy) setPublish(false);
          }}
        >
          <p className="text-sm leading-relaxed text-slate-500">
            Konfigurasi ini akan menjadi versi <strong>{loaded.active.number + 1}</strong> dengan
            total <strong>{total} poin</strong>. Penilaian yang sudah dimulai tetap memakai versi
            lama. Tidak ada kalkulasi ulang otomatis untuk nilai lama.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => setPublish(false)}>
              Batal
            </Button>
            <Button disabled={busy} onClick={publishVersion}>
              {busy ? <Spinner /> : <Check size={14} />}Terbitkan versi
            </Button>
          </div>
        </Modal>
      )}
      {blocker.state === "blocked" && (
        <Modal title="Draft belum tersimpan" onClose={() => blocker.reset?.()}>
          <p className="text-sm text-slate-500">
            Simpan draft agar perubahan konfigurasi tidak hilang.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => blocker.reset?.()}>
              Tetap di sini
            </Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              Tinggalkan perubahan
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
