// @ts-nocheck -- ported verbatim from the original app, which was type-checked under its own (less strict) settings.
import { useState } from "react";
import { CheckCheck, Plus, ShieldCheck, X } from "lucide-react";
import type { AIAdminPlan } from "@/lib/ai-shared";
import type { Configuration } from "@/lib/domain";
import { api, json } from "./api";
import { Button, Card, Field, Spinner, inputClass } from "./components";

const titles = {
  student: "Perubahan mahasiswa",
  deactivate: "Nonaktifkan mahasiswa",
  clear: "Kosongkan penilaian",
  configuration: "Simpan draft konfigurasi",
  publish: "Terbitkan konfigurasi",
  import: "Import mahasiswa",
};
const clone = <Value,>(value: Value): Value => JSON.parse(JSON.stringify(value));
export default function AIAdminReview({
  plan,
  onChange,
  onConfirm,
  dirty,
}: {
  plan: AIAdminPlan;
  onChange: (plan: AIAdminPlan) => void;
  onConfirm: (plan: AIAdminPlan) => Promise<void>;
  dirty: boolean;
}) {
  const [after, setAfter] = useState(() => clone(plan.after));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const changed = JSON.stringify(after) !== JSON.stringify(plan.after);
  const active = plan.state === "awaiting_review";
  const dangerous = ["deactivate", "clear", "publish"].includes(plan.kind);
  const [acknowledged, setAcknowledged] = useState(false);
  function configChange(update: (config: Configuration) => void) {
    const config = clone(after) as Configuration;
    update(config);
    setAfter(config);
  }
  async function review() {
    setBusy(true);
    setError("");
    try {
      onChange(
        await api<AIAdminPlan>(`/ai/plans/${plan.id}`, {
          method: "PATCH",
          body: json({ revision: plan.revision, hash: plan.hash, after }),
        }),
      );
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > 5 * 1024 * 1024) {
      setError("Gunakan .xlsx maksimal 5 MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const preview = await api<{
        records: Record<string, unknown>[];
        errors: string[];
        existing: number;
      }>("/students/import/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        body: await file.arrayBuffer(),
      });
      if (preview.errors.length) throw new Error(preview.errors.join(" · "));
      setAfter({ records: preview.records });
      setPage(0);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    setBusy(true);
    try {
      await api(`/ai/plans/${plan.id}/cancel`, { method: "POST" });
      onChange({ ...plan, state: "cancelled" });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm(plan);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const config = after as Configuration;
  return (
    <Card className="mt-5 overflow-hidden">
      <div
        className={`border-b border-border px-5 py-4 ${dangerous ? "bg-amber-50" : "bg-teal-50/50"}`}
      >
        <h3 className="text-sm font-semibold">
          {titles[plan.kind]} · revisi {plan.revision}
        </h3>
        <p className="mt-2 text-xs text-muted-foreground">
          {plan.student
            ? `${plan.student.name} · ${plan.student.npm} · Rombel ${plan.student.rombel_id}`
            : "Konfirmasi tindakan pada database APaPSI"}
        </p>
        <p className="mt-2 text-xs font-medium">
          {active
            ? "Belum dieksekusi"
            : plan.state === "executed"
              ? "Tersimpan dan diverifikasi"
              : "Dibatalkan"}
        </p>
      </div>
      <fieldset disabled={busy || !active} className="min-w-0 space-y-4 p-5">
        {plan.kind === "student" && (
          <div className="grid gap-4 sm:grid-cols-2">
            {["npm", "name", "rombel_id", "study_case"].map((field) => (
              <Field
                key={field}
                label={
                  { npm: "NPM", name: "Nama", rombel_id: "Rombel", study_case: "Studi Kasus" }[
                    field
                  ] ?? field
                }
                hint={`Sebelum: ${String((plan.before as Record<string, unknown>)[field])}`}
              >
                <input
                  aria-label={`AI mahasiswa ${field}`}
                  className={`${inputClass} text-xs`}
                  value={after[field]}
                  type={field === "rombel_id" ? "number" : "text"}
                  min={field === "rombel_id" ? 1 : undefined}
                  max={field === "rombel_id" ? 4 : undefined}
                  maxLength={field === "npm" ? 10 : field === "study_case" ? 2000 : 200}
                  onChange={(event) =>
                    setAfter({
                      ...after,
                      [field]:
                        field === "rombel_id" ? Number(event.target.value) : event.target.value,
                    })
                  }
                />
              </Field>
            ))}
          </div>
        )}
        {plan.kind === "deactivate" && (
          <p className="text-sm leading-relaxed">
            Mahasiswa akan berubah dari <strong>aktif → nonaktif</strong>. Penilaian dan riwayat
            tetap dipertahankan. Mahasiswa tidak lagi muncul pada daftar aktif.
          </p>
        )}
        {plan.kind === "clear" && (
          <p className="text-sm leading-relaxed">
            Seluruh komponen penilaian mahasiswa ini akan dikosongkan dan status menjadi{" "}
            <strong>draft</strong>. Nilai lama tetap tercatat dalam audit; tindakan ini tidak
            menghapus mahasiswa.
          </p>
        )}
        {(plan.kind === "configuration" || plan.kind === "publish") && (
          <>
            <div className="rounded-lg bg-muted p-3 text-xs">
              Total aspek aktif:{" "}
              <strong>
                {config.aspects
                  .filter((aspect) => aspect.active)
                  .reduce((total, aspect) => total + aspect.max, 0)}
                /100
              </strong>
              . Publikasi memerlukan total 100 dan rentang valid. Nilai lama tetap menggunakan versi
              asal.
            </div>
            {plan.kind === "configuration" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nama konfigurasi">
                  <input
                    aria-label="AI nama konfigurasi"
                    className={`${inputClass} text-xs`}
                    value={config.label}
                    onChange={(event) =>
                      configChange((data) => {
                        data.label = event.target.value;
                      })
                    }
                  />
                </Field>
                <Field label="Penalti per slot pengumpulan">
                  <input
                    className={`${inputClass} text-xs`}
                    type="number"
                    min={0.1}
                    max={10}
                    step={0.1}
                    value={config.penalty}
                    onChange={(event) =>
                      configChange((data) => {
                        data.penalty = Number(event.target.value);
                      })
                    }
                  />
                </Field>
                <Field label="Slot pengumpulan (pisahkan koma)">
                  <input
                    className={`${inputClass} text-xs`}
                    value={config.slots.join(",")}
                    onChange={(event) =>
                      configChange((data) => {
                        data.slots = event.target.value.split(",").map((slot) => slot.trim());
                      })
                    }
                  />
                </Field>
              </div>
            )}
            <fieldset disabled={plan.kind === "publish"} className="min-w-0 space-y-4">
              <details open>
                <summary className="cursor-pointer text-sm font-semibold">Aspek & kriteria</summary>
                <div className="mt-4 space-y-4">
                  {config.aspects.map((aspect, index) => (
                    <div key={index} className="space-y-3 rounded-lg border border-border p-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Kode">
                          <input
                            className={`${inputClass} text-xs`}
                            value={aspect.code}
                            onChange={(event) =>
                              configChange((data) => {
                                data.aspects[index].code = event.target.value.toUpperCase();
                              })
                            }
                          />
                        </Field>
                        <Field label="Nama">
                          <input
                            className={`${inputClass} text-xs`}
                            value={aspect.name}
                            onChange={(event) =>
                              configChange((data) => {
                                data.aspects[index].name = event.target.value;
                              })
                            }
                          />
                        </Field>
                        <Field label="Maksimum">
                          <input
                            className={`${inputClass} text-xs`}
                            type="number"
                            min={1}
                            max={100}
                            value={aspect.max}
                            onChange={(event) =>
                              configChange((data) => {
                                data.aspects[index].max = Number(event.target.value);
                              })
                            }
                          />
                        </Field>
                        <Field label="Kelompok">
                          <select
                            className={`${inputClass} text-xs`}
                            value={aspect.group}
                            onChange={(event) =>
                              configChange((data) => {
                                data.aspects[index].group = event.target.value;
                              })
                            }
                          >
                            {["Administrasi", "Substansi", "Tata Tulis", "Sikap"].map((group) => (
                              <option key={group}>{group}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Tipe kalkulasi">
                          <select
                            className={`${inputClass} text-xs`}
                            value={aspect.kind}
                            onChange={(event) =>
                              configChange((data) => {
                                data.aspects[index].kind = event.target.value as typeof aspect.kind;
                              })
                            }
                          >
                            {[
                              "criterion",
                              "submission-time",
                              "submission-content",
                              "average",
                              "deduction",
                            ].map((kind) => (
                              <option key={kind}>{kind}</option>
                            ))}
                          </select>
                        </Field>
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={aspect.active}
                            onChange={(event) =>
                              configChange((data) => {
                                data.aspects[index].active = event.target.checked;
                              })
                            }
                          />
                          Aspek aktif
                        </label>
                      </div>
                      <Field label="Deskripsi aspek">
                        <textarea
                          rows={2}
                          className={`${inputClass} text-xs`}
                          value={aspect.description ?? ""}
                          onChange={(event) =>
                            configChange((data) => {
                              data.aspects[index].description = event.target.value;
                            })
                          }
                        />
                      </Field>
                      {aspect.kind === "criterion" && (
                        <div className="space-y-3">
                          {aspect.criteria.map((criterion, criterionIndex) => (
                            <div key={criterionIndex} className="rounded bg-muted p-3">
                              <div className="grid gap-2 sm:grid-cols-3">
                                <Field label="Kategori">
                                  <input
                                    className={`${inputClass} text-xs`}
                                    value={criterion.level}
                                    onChange={(event) =>
                                      configChange((data) => {
                                        data.aspects[index].criteria[criterionIndex].level =
                                          event.target.value;
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="Skor minimum">
                                  <input
                                    type="number"
                                    className={`${inputClass} text-xs`}
                                    value={criterion.min}
                                    onChange={(event) =>
                                      configChange((data) => {
                                        data.aspects[index].criteria[criterionIndex].min = Number(
                                          event.target.value,
                                        );
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="Skor maksimum">
                                  <input
                                    type="number"
                                    className={`${inputClass} text-xs`}
                                    value={criterion.max}
                                    onChange={(event) =>
                                      configChange((data) => {
                                        data.aspects[index].criteria[criterionIndex].max = Number(
                                          event.target.value,
                                        );
                                      })
                                    }
                                  />
                                </Field>
                              </div>
                              <textarea
                                aria-label={`Deskripsi ${aspect.code} ${criterion.level}`}
                                rows={2}
                                className={`${inputClass} mt-2 text-xs`}
                                value={criterion.description}
                                onChange={(event) =>
                                  configChange((data) => {
                                    data.aspects[index].criteria[criterionIndex].description =
                                      event.target.value;
                                  })
                                }
                              />
                              <label className="mt-2 flex items-center gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  checked={criterion.active !== false}
                                  onChange={(event) =>
                                    configChange((data) => {
                                      data.aspects[index].criteria[criterionIndex].active =
                                        event.target.checked;
                                    })
                                  }
                                />
                                Kriteria aktif
                              </label>
                            </div>
                          ))}
                          <Button
                            variant="secondary"
                            onClick={() =>
                              configChange((data) => {
                                data.aspects[index].criteria.push({
                                  level: `Kategori ${aspect.criteria.length + 1}`,
                                  min: 0,
                                  max: 0,
                                  description: "",
                                  active: false,
                                });
                              })
                            }
                          >
                            <Plus size={12} />
                            Tambah kriteria
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="secondary"
                    onClick={() =>
                      configChange((data) => {
                        data.aspects.push({
                          code: `X${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`,
                          name: "Aspek baru",
                          group: "Substansi",
                          kind: "criterion",
                          max: 1,
                          active: false,
                          criteria: [],
                        });
                      })
                    }
                  >
                    <Plus size={12} />
                    Tambah aspek
                  </Button>
                </div>
              </details>
              <details>
                <summary className="cursor-pointer text-sm font-semibold">Pertemuan</summary>
                <div className="mt-4 space-y-3">
                  {config.meetings.map((meeting, index) => (
                    <div key={meeting.id} className="flex flex-wrap gap-2">
                      <input
                        aria-label={`Nama pertemuan ${index + 1}`}
                        className={`${inputClass} w-auto flex-1 text-xs`}
                        value={meeting.name}
                        onChange={(event) =>
                          configChange((data) => {
                            data.meetings[index].name = event.target.value;
                          })
                        }
                      />
                      <input
                        type="date"
                        className={`${inputClass} w-auto text-xs`}
                        value={meeting.date}
                        onChange={(event) =>
                          configChange((data) => {
                            data.meetings[index].date = event.target.value;
                          })
                        }
                      />
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={meeting.active}
                          onChange={(event) =>
                            configChange((data) => {
                              data.meetings[index].active = event.target.checked;
                            })
                          }
                        />
                        Aktif
                      </label>
                    </div>
                  ))}
                  <Button
                    variant="secondary"
                    onClick={() =>
                      configChange((data) => {
                        data.meetings.push({
                          id: crypto.randomUUID(),
                          name: `Pertemuan ${data.meetings.length + 1}`,
                          date: "",
                          active: false,
                        });
                      })
                    }
                  >
                    <Plus size={12} />
                    Tambah pertemuan
                  </Button>
                </div>
              </details>
              <details>
                <summary className="cursor-pointer text-sm font-semibold">Pelanggaran</summary>
                <div className="mt-4 space-y-3">
                  {config.violations.map((violation, index) => (
                    <div
                      key={index}
                      className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-3"
                    >
                      <Field label="Kode">
                        <input
                          className={`${inputClass} text-xs`}
                          value={violation.code}
                          onChange={(event) =>
                            configChange((data) => {
                              data.violations[index].code = event.target.value.toUpperCase();
                            })
                          }
                        />
                      </Field>
                      <Field label="Nama">
                        <input
                          className={`${inputClass} text-xs`}
                          value={violation.name}
                          onChange={(event) =>
                            configChange((data) => {
                              data.violations[index].name = event.target.value;
                            })
                          }
                        />
                      </Field>
                      <Field label="Pengurangan">
                        <input
                          className={`${inputClass} text-xs`}
                          type="number"
                          min={1}
                          max={100}
                          value={violation.penalty}
                          onChange={(event) =>
                            configChange((data) => {
                              data.violations[index].penalty = Number(event.target.value);
                            })
                          }
                        />
                      </Field>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={violation.active}
                          onChange={(event) =>
                            configChange((data) => {
                              data.violations[index].active = event.target.checked;
                            })
                          }
                        />
                        Aktif
                      </label>
                    </div>
                  ))}
                  <Button
                    variant="secondary"
                    onClick={() =>
                      configChange((data) => {
                        data.violations.push({
                          code: `P${data.violations.length + 1}`,
                          name: "Pelanggaran baru",
                          penalty: 1,
                          active: false,
                        });
                      })
                    }
                  >
                    <Plus size={12} />
                    Tambah pelanggaran
                  </Button>
                </div>
              </details>
            </fieldset>
          </>
        )}
        {plan.kind === "import" && (
          <>
            <Field label="Workbook .xlsx — hanya diunggah ke backend APaPSI">
              <input
                aria-label="AI import workbook"
                type="file"
                accept=".xlsx"
                onChange={(event) => void upload(event.target.files?.[0])}
                className="block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2"
              />
            </Field>
            {after.records?.length > 0 && (
              <>
                <p className="text-xs">
                  {after.records.length} baris · NPM existing akan dilewati, bukan ditimpa.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="p-2">NPM</th>
                        <th className="p-2">Nama</th>
                        <th className="p-2">Rombel</th>
                        <th className="p-2">Studi kasus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {after.records.slice(page * 25, page * 25 + 25).map((student: any) => (
                        <tr key={student.npm} className="border-b border-border">
                          <td className="p-2">{student.npm}</td>
                          <td className="p-2">{student.name}</td>
                          <td className="p-2">{student.rombel_id}</td>
                          <td className="p-2">{student.study_case || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between">
                  <Button
                    variant="secondary"
                    disabled={!page}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    Sebelumnya
                  </Button>
                  <span className="text-xs">
                    Halaman {page + 1}/{Math.ceil(after.records.length / 25)}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={(page + 1) * 25 >= after.records.length}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Berikutnya
                  </Button>
                </div>
              </>
            )}
          </>
        )}
        <details className="rounded-lg bg-muted p-3">
          <summary className="cursor-pointer text-xs font-semibold">
            Perbandingan lengkap: sebelum → usulan
          </summary>
          <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(plan.before, null, 2)}
            </pre>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(after, null, 2)}
            </pre>
          </div>
        </details>
      </fieldset>
      <div className="space-y-3 border-t border-border bg-muted/30 p-5">
        {error && (
          <p role="alert" className="text-xs text-red-700">
            {error}
          </p>
        )}
        {dirty && (
          <p className="text-xs text-amber-700">
            Selesaikan form yang belum tersimpan sebelum menjalankan tindakan ini.
          </p>
        )}
        {active && (
          <>
            {dangerous && (
              <label className="flex items-start gap-2 text-xs leading-relaxed">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-0.5"
                />
                Saya telah meninjau dampak {titles[plan.kind].toLowerCase()} dan menyetujui tindakan
                ini.
              </label>
            )}
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck size={13} />
              Tidak ada data yang berubah sebelum konfirmasi.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={busy} onClick={cancel}>
                <X size={13} />
                Batalkan
              </Button>
              {changed ? (
                <Button disabled={busy} onClick={review}>
                  {busy ? <Spinner /> : <CheckCheck size={14} />}Simpan revisi rencana
                </Button>
              ) : (
                <Button
                  variant={dangerous ? "danger" : "primary"}
                  disabled={busy || !plan.ready || dirty || (dangerous && !acknowledged)}
                  onClick={confirm}
                >
                  {busy ? <Spinner /> : <CheckCheck size={14} />}Konfirmasi{" "}
                  {titles[plan.kind].toLowerCase()}
                </Button>
              )}
            </div>
            {!plan.ready && !changed && (
              <p className="text-xs text-amber-700">
                Isi perubahan/file yang valid sebelum konfirmasi.
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
