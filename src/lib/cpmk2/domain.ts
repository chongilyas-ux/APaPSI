// Engine penilaian CPMK 2 (Tahap II · Perancangan & Implementasi Basis Data).
// Sumber rubrik: "Rubrik Penilaian basis data2.pdf" (6 halaman), divalidasi terhadap
// master prompt. Fungsi murni & terpusat — komponen UI TIDAK memuat rumus.
// Struktur sengaja paralel dengan src/lib/domain.ts (CPMK 1) agar polanya konsisten.

export const CPMK2_WEEKS = ["6", "7", "9"] as const;
export type Cpmk2Week = (typeof CPMK2_WEEKS)[number];

export type TimeStatus = "" | "on-time" | "late" | "missing";
export type ContentStatus = "" | "suitable" | "lacking" | "unreadable" | "missing";
export type AttendanceStatus = "" | "hadir" | "izin" | "alpa";
export type ViolationCode = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8";

export type Criterion = { level: string; min: number; max: number; description: string };
export type Violation = { code: ViolationCode; name: string; penalty: number };

export type Cpmk2Data = {
  /** Catatan mingguan A: key = "6" | "7" | "9". */
  a: Record<string, { time: TimeStatus; content: ContentStatus }>;
  /** Skor rubrik B1–B5 + C: { level, score, note }. */
  b: Record<string, { level: string; score: number | null; note: string }>;
  /** Kesungguhan per minggu: status hadir/izin/alpa + skor 0–10 saat hadir. */
  d1: Record<string, { status: AttendanceStatus; score: number | null }>;
  /** Catatan pelanggaran satu-per-satu: pengulangan tercatat sebagai entri baru. */
  d2: Array<{ week: string; code: ViolationCode; note: string }>;
  /** Pernyataan asisten bahwa catatan pelanggaran sudah diperiksa (termasuk nihil). */
  d2Reviewed: boolean;
};

export type Cpmk2Result = {
  scores: {
    A1: number | null;
    A2: number | null;
    B1: number | null;
    B2: number | null;
    B3: number | null;
    B4: number | null;
    B5: number | null;
    C: number | null;
    D1: number | null;
    D2: number | null;
  };
  completed: number;
  required: number;
  complete: boolean;
  total: number;
  /** D1 tidak bisa dihitung: tidak ada pertemuan yang diikuti (izin/alpa semua). */
  manualReview: boolean;
  status: "empty" | "partial" | "complete" | "manual-review";
};

export type ViolationEntry = { week: string; code: ViolationCode; note: string };

const LEVELS = ["Sangat Baik", "Baik", "Cukup", "Kurang"];

function criteria(ranges: Array<[number, number]>, descriptions: string[]): Criterion[] {
  return ranges.map(([min, max], index) => ({
    level: LEVELS[index],
    min,
    max,
    description: descriptions[index],
  }));
}

export type RubricAspect = { code: string; name: string; max: number; criteria: Criterion[]; group: string };

const byPdf = (
  rows: Array<[string, string, number, Array<[number, number]>, string[]]>,
  groups: Record<string, string>,
): RubricAspect[] =>
  rows.map(([code, name, max, ranges, descriptions]) => ({
    code,
    name,
    max,
    criteria: criteria(ranges, descriptions),
    group: groups[code],
  }));

// Deskripsi level diambil langsung dari rubrik PDF halaman 3–4 & tabel rekap halaman 6.
export const CPMK2_ASPECTS: RubricAspect[] = byPdf(
  [
    [
      "B1",
      "Tinjauan pustaka basis data",
      5,
      [
        [5, 5],
        [4, 4],
        [2, 3],
        [0, 1],
      ],
      [
        "Membahas konsep basis data relasional, tipe data, primary key dan foreign key, serta normalisasi; referensi relevan minimal 2 sumber dan disitasi.",
        "Konsep cukup lengkap, tetapi referensi hanya 1 sumber atau sitasi belum rapi.",
        "Konsep kurang lengkap (misalnya normalisasi belum dibahas) atau tanpa sitasi.",
        "Tidak relevan atau tidak ada.",
      ],
    ],
    [
      "B2",
      "Merancang tabel basis data dari hasil ERD",
      15,
      [
        [13, 15],
        [10, 12],
        [6, 9],
        [0, 5],
      ],
      [
        "Seluruh entitas pada ERD menjadi tabel dan atributnya menjadi kolom; setiap tabel memiliki primary key dan tipe data yang sesuai; tabel dibuat di MySQL Workbench dan tangkapan layar strukturnya disertakan.",
        "Seluruh tabel sudah dibuat, tetapi ada kesalahan kecil pada kolom, tipe data, atau kunci.",
        "Sebagian entitas belum menjadi tabel, atau banyak tabel tanpa primary key.",
        "Rancangan tabel tidak sesuai ERD atau tidak ada.",
      ],
    ],
    [
      "B3",
      "Normalisasi basis data",
      15,
      [
        [13, 15],
        [10, 12],
        [6, 9],
        [0, 5],
      ],
      [
        "Tahapan 1NF, 2NF, dan 3NF ditunjukkan dengan contoh data studi kasus dan penjelasan singkat setiap tahap; hasil akhir berupa tabel-tabel dalam bentuk 3NF.",
        "Tahapan sampai 3NF ada, tetapi penjelasan kurang atau terdapat kesalahan kecil.",
        "Normalisasi hanya sampai 1NF atau 2NF, atau hanya menampilkan hasil akhir tanpa tahapan.",
        "Normalisasi keliru atau tidak ada.",
      ],
    ],
    [
      "B4",
      "Pembuatan relasi antar tabel",
      10,
      [
        [9, 10],
        [7, 8],
        [4, 6],
        [0, 3],
      ],
      [
        "Foreign key dibuat di MySQL Workbench pada tabel yang tepat sesuai relasi pada ERD (relasi M:N dibuat tabel penghubung); EER Diagram ditampilkan.",
        "Relasi benar, tetapi EER Diagram tidak ditampilkan atau terdapat kesalahan kecil.",
        "Sebagian relasi belum dibuat atau ada foreign key yang keliru.",
        "Tabel tidak saling berelasi atau tidak ada.",
      ],
    ],
    [
      "B5",
      "Pengisian data ke basis data",
      10,
      [
        [9, 10],
        [7, 8],
        [4, 6],
        [0, 3],
      ],
      [
        "Data riil studi kasus (hasil pengumpulan minggu ke-8) diisikan ke seluruh tabel melalui MySQL Workbench; jumlah data cukup untuk menggambarkan proses bisnis (acuan: minimal 5 baris pada tabel transaksi); tangkapan layar isi setiap tabel disertakan.",
        "Seluruh tabel terisi, tetapi jumlah data masih sedikit atau tangkapan layar belum lengkap (data sekunder).",
        "Hanya sebagian tabel terisi atau data berupa contoh (bukan data riil).",
        "Data tidak sesuai studi kasus atau tidak ada.",
      ],
    ],
    [
      "C",
      "Tata tulis dan format",
      5,
      [
        [5, 5],
        [4, 4],
        [2, 3],
        [0, 1],
      ],
      [
        "Sistematika sesuai template; tabel, gambar, dan tangkapan layar bernomor, berjudul, dan terbaca; bahasa baku.",
        "Terdapat kesalahan kecil pada penomoran atau bahasa.",
        "Sistematika kurang runtut atau beberapa tangkapan layar sulit dibaca.",
        "Tidak mengikuti template.",
      ],
    ],
    [
      "D1",
      "Kesungguhan dan keaktifan",
      10,
      [
        [9, 10],
        [7, 8],
        [4, 6],
        [0, 3],
      ],
      [
        "Mengerjakan tugas praktikum dengan sungguh-sungguh selama sesi dan target tugas sesi tercapai.",
        "Mengerjakan tugas dengan sungguh-sungguh, tetapi target tugas sesi belum sepenuhnya tercapai.",
        "Mengerjakan tugas, tetapi sering tidak fokus dan perlu diingatkan lebih dari satu kali.",
        "Hampir tidak mengerjakan tugas praktikum selama sesi atau tidak hadir tanpa keterangan.",
      ],
    ],
  ],
  { B1: "Substansi", B2: "Substansi", B3: "Substansi", B4: "Substansi", B5: "Substansi", C: "Tata Tulis", D1: "Sikap" },
);

export const CPMK2_VIOLATIONS: Violation[] = [
  { code: "P1", name: "Bermain HP untuk keperluan di luar praktikum (media sosial, chat, game, video) selama sesi berlangsung.", penalty: 1 },
  { code: "P2", name: "Menonton video, membuka media sosial, bermain game, atau membuka situs hiburan di komputer praktikum.", penalty: 1 },
  { code: "P3", name: "Tidak mengerjakan tugas praktikum selama sesi (mengerjakan tugas mata kuliah lain, hanya diam, atau tidur).", penalty: 2 },
  { code: "P4", name: "Terlambat hadir lebih dari 15 menit tanpa alasan yang dapat diterima.", penalty: 1 },
  { code: "P5", name: "Meninggalkan ruang praktikum tanpa izin atau pulang sebelum sesi selesai.", penalty: 1 },
  { code: "P6", name: "Membuat gaduh atau mengganggu mahasiswa lain yang sedang mengerjakan tugas.", penalty: 1 },
  { code: "P7", name: "Menyalin pekerjaan mahasiswa atau kelompok lain, termasuk rancangan tabel dan data, dan mengakuinya sebagai hasil sendiri.", penalty: 2 },
  { code: "P8", name: "Tidak hadir praktikum tanpa keterangan.", penalty: 2 },
];

export const CPMK2_LABEL = "Tahap II · Perancangan & Implementasi Basis Data";

/** Aspek bertipe kategori pada PDF (bagian B dan C). */
export const CPMK2_CRITERION_CODES = ["B1", "B2", "B3", "B4", "B5", "C"] as const;

export function emptyCpmk2Data(): Cpmk2Data {
  return {
    a: {},
    b: {},
    d1: {},
    d2: [],
    d2Reviewed: false,
  };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** A1 = max(0, 10 − 2 × keterlambatan). "Tidak mengumpulkan" = 1 terlambat. */
export function calcA1Records(data: Cpmk2Data): { late: number; kurang: number; recorded: boolean } {
  let late = 0;
  let kurang = 0;
  let recorded = true;
  for (const week of CPMK2_WEEKS) {
    const entry = data.a[week];
    if (!entry || !entry.time || !entry.content) {
      recorded = false;
      continue;
    }
    if (entry.time === "late" || entry.time === "missing") late++;
    if (entry.content === "lacking" || entry.content === "unreadable" || entry.content === "missing") kurang++;
  }
  return { late, kurang, recorded };
}

export function calcA1(data: Cpmk2Data): number | null {
  const { late, recorded } = calcA1Records(data);
  return recorded ? Math.max(0, 10 - late * 2) : null;
}

export function calcA2(data: Cpmk2Data): number | null {
  const { kurang, recorded } = calcA1Records(data);
  return recorded ? Math.max(0, 10 - kurang * 2) : null;
}

export function calcD1(
  data: Cpmk2Data,
): { score: number | null; manualReview: boolean; recorded: boolean; attendedScores: number[] } {
  let recorded = true;
  const attendedScores: number[] = [];
  for (const week of CPMK2_WEEKS) {
    const entry = data.d1[week];
    if (!entry || !entry.status) {
      recorded = false;
      continue;
    }
    if (entry.status === "hadir") {
      if (entry.score === null) recorded = false;
      else attendedScores.push(entry.score);
    }
    // izin: tanpa skor, mengikuti rata-rata pertemuan lain (dihitung di bawah).
    // alpa: tanpa skor D1 minggu itu; konsekuensinya dicatat sebagai P8 pada D2.
  }
  if (!attendedScores.length && recorded) return { score: null, manualReview: true, recorded, attendedScores };
  if (!recorded) return { score: null, manualReview: false, recorded, attendedScores };
  const avg = attendedScores.reduce((sum, value) => sum + value, 0) / attendedScores.length;
  return { score: round2(avg), manualReview: false, recorded, attendedScores };
}

export function calcD2(data: Cpmk2Data): number | null {
  if (!data.d2Reviewed) return null;
  const deduction = data.d2.reduce((sum, entry) => {
    const violation = CPMK2_VIOLATIONS.find((item) => item.code === entry.code);
    return sum + (violation?.penalty ?? 0);
  }, 0);
  return Math.max(0, 10 - deduction);
}

/** Denda kumulatif tiap kode pelanggaran, dipakai UI ringkasan. */
export function deductionByCode(data: Cpmk2Data): Record<string, number> {
  const result: Record<string, number> = {};
  for (const entry of data.d2) {
    const violation = CPMK2_VIOLATIONS.find((item) => item.code === entry.code);
    if (violation) result[entry.code] = (result[entry.code] ?? 0) + violation.penalty;
  }
  return result;
}

export function calculateCpmk2(data: Cpmk2Data): Cpmk2Result {
  const a1 = calcA1(data);
  const a2 = calcA2(data);
  const d1 = calcD1(data);
  const d2 = calcD2(data);
  const scores = { A1: a1, A2: a2, D1: d1.score, D2: d2 } as Cpmk2Result["scores"];
  for (const code of CPMK2_CRITERION_CODES) {
    const entry = data.b[code];
    scores[code as "B1"] = entry && entry.score !== null ? entry.score : null;
  }
  const values = Object.values(scores).filter((value) => value != null) as number[];
  const completed = values.length;
  const required = 10;
  const total = round2(values.reduce((sum, value) => sum + value, 0));
  const touched =
    Object.keys(data.a).length > 0 ||
    Object.keys(data.b).length > 0 ||
    Object.keys(data.d1).length > 0 ||
    data.d2.length > 0 ||
    data.d2Reviewed;
  const complete = !d1.manualReview && completed === required;
  return {
    scores,
    completed,
    required,
    complete,
    total,
    manualReview: d1.manualReview,
    status: d1.manualReview && touched ? "manual-review" : !touched ? "empty" : complete ? "complete" : "partial",
  };
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const TIME_VALUES: TimeStatus[] = ["", "on-time", "late", "missing"];
const CONTENT_VALUES: ContentStatus[] = ["", "suitable", "lacking", "unreadable", "missing"];
const ATTENDANCE_VALUES: AttendanceStatus[] = ["", "hadir", "izin", "alpa"];

export function validateCpmk2(data: Cpmk2Data) {
  ensure(
    data && typeof data === "object" && data.a && data.b && data.d1 && Array.isArray(data.d2),
    "Data penilaian tidak valid.",
  );
  ensure(typeof data.d2Reviewed === "boolean", "Status pemeriksaan pelanggaran tidak valid.");
  for (const [week, entry] of Object.entries(data.a)) {
    ensure(
      (CPMK2_WEEKS as readonly string[]).includes(week) &&
        entry &&
        TIME_VALUES.includes(entry.time) &&
        CONTENT_VALUES.includes(entry.content),
      `Status pengumpulan minggu ${week} tidak valid.`,
    );
  }
  for (const [code, entry] of Object.entries(data.b)) {
    const aspect = CPMK2_ASPECTS.find((item) => item.code === code && code !== "D1");
    ensure(aspect && entry && typeof entry.note === "string" && entry.note.length <= 5000, `Aspek ${code} tidak valid.`);
    if (entry.score === null) continue;
    const criterion = aspect!.criteria.find((item) => item.level === entry.level);
    ensure(
      !(entry.level === "" && entry.score !== null),
      `Kategori ${code} belum dipilih.`,
    );
    ensure(
      criterion && Number.isInteger(entry.score) && entry.score >= criterion.min && entry.score <= criterion.max,
      `Skor ${code} harus dalam rentang ${entry.level ? "kategori terpilih" : "rubrik"} (0–${aspect!.max}).`,
    );
  }
  for (const [week, entry] of Object.entries(data.d1)) {
    ensure(
      (CPMK2_WEEKS as readonly string[]).includes(week) &&
        entry &&
        ATTENDANCE_VALUES.includes(entry.status),
      `Status kehadiran minggu ${week} tidak valid.`,
    );
    ensure(
      entry.status !== "hadir" || (Number.isInteger(entry.score) && entry.score >= 0 && entry.score <= 10),
      `Skor D1 minggu ${week} harus 0–10.`,
    );
    ensure(
      entry.status !== "izin" || entry.score === null,
      "Pertemuan izin sah tidak memiliki skor manual.",
    );
  }
  const weeks = CPMK2_WEEKS as readonly string[];
  for (const entry of data.d2) {
    ensure(
      entry && weeks.includes(entry.week) && CPMK2_VIOLATIONS.some((item) => item.code === entry.code),
      "Catatan pelanggaran tidak valid.",
    );
    ensure(typeof entry.note === "string" && entry.note.length <= 1000, "Catatan pelanggaran terlalu panjang.");
  }
}

export function formatScore2(value: number | null | undefined) {
  return value == null
    ? "—"
    : value.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}
