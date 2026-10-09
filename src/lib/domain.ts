// @ts-nocheck -- ported verbatim from the original app (shared calculation engine).
export type Criterion = {
  level: string;
  min: number;
  max: number;
  description: string;
  active?: boolean;
};
export type Aspect = {
  code: string;
  name: string;
  description?: string;
  group: string;
  max: number;
  kind: "submission-time" | "submission-content" | "criterion" | "average" | "deduction";
  active: boolean;
  criteria: Criterion[];
};
export type Meeting = { id: string; name: string; date: string; active: boolean };
export type Violation = {
  code: string;
  name: string;
  penalty: number;
  active: boolean;
};
export type Configuration = {
  label: string;
  aspects: Aspect[];
  meetings: Meeting[];
  violations: Violation[];
  slots: string[];
  penalty: number;
};
export type AssessmentData = {
  submissions: Record<string, { time: string; content: string }>;
  scores: Record<string, { level: string; score: number | null; note: string }>;
  meetings: Record<string, { score: number | null; excused: boolean }>;
  violations: Record<string, number>;
  d2Reviewed: boolean;
  legacyReviewed: boolean;
  legacy: boolean;
  warnings: string[];
};
export type Student = {
  id: string;
  npm: string;
  name: string;
  rombel_id: number;
  study_case: string;
  active: boolean;
  assessment?: Assessment;
  result?: Calculation;
};
export type Assessment = {
  id: string;
  student_id: string;
  version_id: string;
  revision: number;
  state: "draft" | "verified";
  data: AssessmentData;
  updated_at: string;
  config?: Configuration;
};
export type Calculation = {
  scores: Record<string, number | null>;
  completed: number;
  required: number;
  complete: boolean;
  total: number;
  status: "empty" | "partial" | "complete" | "draft";
};

const levels = ["Sangat Baik", "Baik", "Cukup", "Kurang"];
function criteria(ranges: number[][], descriptions: string[]): Criterion[] {
  return ranges.map((range, index) => ({
    level: levels[index],
    min: range[0],
    max: range[1],
    description: descriptions[index],
  }));
}
function aspect(
  code: string,
  name: string,
  max: number,
  ranges: number[][],
  descriptions: string[],
  group = "Substansi",
): Aspect {
  return {
    code,
    name,
    max,
    group,
    kind: "criterion",
    active: true,
    criteria: criteria(ranges, descriptions),
  };
}
export const initialConfig: Configuration = {
  label: "Tahap I · Angkatan 2024",
  penalty: 1,
  slots: ["lab", "rumah"],
  meetings: Array.from({ length: 5 }, (_, index) => ({
    id: `meeting-${index + 1}`,
    name: `Pertemuan ${index + 1}`,
    date: "",
    active: true,
  })),
  aspects: [
    {
      code: "A1",
      name: "Ketepatan waktu pengumpulan",
      max: 10,
      group: "Administrasi",
      kind: "submission-time",
      active: true,
      criteria: [],
    },
    {
      code: "A2",
      name: "Kondisi isi saat pengumpulan",
      max: 10,
      group: "Administrasi",
      kind: "submission-content",
      active: true,
      criteria: [],
    },
    aspect(
      "B1",
      "Latar belakang",
      6,
      [
        [6, 6],
        [4, 5],
        [2, 3],
        [0, 1],
      ],
      [
        "Menjelaskan kondisi nyata studi kasus, permasalahan jelas dan didukung data/fakta, alasan perlunya sistem informasi logis.",
        "Permasalahan jelas, tetapi data/fakta pendukung terbatas.",
        "Uraian bersifat umum dan kurang terkait studi kasus.",
        "Tidak relevan atau tidak ada.",
      ],
    ),
    aspect(
      "B2",
      "Rumusan masalah, tujuan, dan manfaat",
      5,
      [
        [5, 5],
        [4, 4],
        [2, 3],
        [0, 1],
      ],
      [
        "Rumusan spesifik, setiap tujuan menjawab rumusan masalah, manfaat jelas bagi pihak terkait.",
        "Lengkap, tetapi keterkaitan rumusan dan tujuan kurang tegas.",
        "Salah satu bagian belum ada atau terlalu umum.",
        "Tidak sesuai atau tidak ada.",
      ],
    ),
    aspect(
      "B3",
      "Tinjauan pustaka",
      7,
      [
        [7, 7],
        [5, 6],
        [3, 4],
        [0, 2],
      ],
      [
        "Membahas konsep sistem informasi, DFD, ERD, dan UML; referensi relevan minimal 5 sumber; sitasi APA konsisten.",
        "Konsep lengkap, referensi relevan tetapi kurang dari 5 sumber atau sitasi kurang konsisten.",
        "Konsep tidak lengkap, referensi minim atau tidak disitasi dengan benar.",
        "Tanpa referensi atau tidak relevan.",
      ],
    ),
    aspect(
      "B4",
      "Identifikasi aktor dan kebutuhan pengguna",
      7,
      [
        [7, 7],
        [5, 6],
        [3, 4],
        [0, 2],
      ],
      [
        "Seluruh aktor teridentifikasi beserta perannya; kebutuhan fungsional dan nonfungsional dirinci per aktor dan sesuai studi kasus.",
        "Aktor lengkap, kebutuhan kurang rinci atau tidak dipisahkan antara fungsional dan nonfungsional.",
        "Terdapat aktor yang terlewat atau kebutuhan terlalu umum.",
        "Tidak sesuai studi kasus atau tidak ada.",
      ],
    ),
    aspect(
      "B5",
      "Data Flow Diagram (DFD)",
      11,
      [
        [10, 11],
        [7, 9],
        [4, 6],
        [0, 3],
      ],
      [
        "Diagram konteks dan DFD level 0/1 lengkap; notasi benar; entitas eksternal sesuai aktor; aliran data diberi nama; seimbang (balancing) antarlevel; data store konsisten.",
        "Lengkap, terdapat kesalahan minor pada notasi, penamaan, atau balancing.",
        "Hanya sebagian level, beberapa aliran atau proses tidak logis.",
        "Notasi salah secara umum, tidak menggambarkan sistem, atau tidak ada.",
      ],
    ),
    aspect(
      "B6",
      "Entity Relationship Diagram (ERD)",
      11,
      [
        [10, 11],
        [7, 9],
        [4, 6],
        [0, 3],
      ],
      [
        "Entitas dan atribut lengkap; primary key dan foreign key tepat; relasi dan kardinalitas benar; konsisten dengan data store pada DFD.",
        "Lengkap, terdapat kesalahan minor pada kardinalitas atau atribut kunci.",
        "Entitas/atribut kurang lengkap, relasi atau kardinalitas banyak yang keliru.",
        "Tidak sesuai kaidah ERD atau tidak ada.",
      ],
    ),
    aspect(
      "B7",
      "Activity Diagram (UML)",
      8,
      [
        [7, 8],
        [5, 6],
        [3, 4],
        [0, 2],
      ],
      [
        "Proses utama tergambar; menggunakan swimlane per aktor; notasi (initial, action, decision, fork/join, final) benar; alur logis dan konsisten dengan DFD serta kebutuhan pengguna.",
        "Proses utama tergambar, terdapat kesalahan minor notasi atau tanpa swimlane.",
        "Hanya sebagian proses, alur kurang logis.",
        "Notasi salah, tidak sesuai sistem, atau tidak ada.",
      ],
    ),
    aspect(
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
        "Sistematika sesuai template, gambar/tabel bernomor dan berjudul, diagram terbaca jelas, bahasa baku.",
        "Terdapat kesalahan minor penomoran atau bahasa.",
        "Sistematika tidak runtut, beberapa diagram sulit dibaca.",
        "Tidak mengikuti template.",
      ],
      "Tata Tulis",
    ),
    {
      code: "D1",
      name: "Kesungguhan dan keaktifan",
      max: 10,
      group: "Sikap",
      kind: "average",
      active: true,
      criteria: criteria(
        [
          [9, 10],
          [7, 8],
          [4, 6],
          [0, 3],
        ],
        [
          "Fokus mengerjakan tugas praktikum dari awal sampai akhir sesi, aktif bertanya atau berdiskusi, dan target tugas sesi tercapai.",
          "Mengerjakan tugas dengan sungguh-sungguh, tetapi kurang aktif atau target tugas sesi belum sepenuhnya tercapai.",
          "Mengerjakan tugas, tetapi sering tidak fokus dan perlu diingatkan lebih dari satu kali.",
          "Hampir tidak mengerjakan tugas praktikum selama sesi atau tidak hadir tanpa keterangan.",
        ],
      ),
    },
    {
      code: "D2",
      name: "Kepatuhan tata tertib praktikum",
      max: 10,
      group: "Sikap",
      kind: "deduction",
      active: true,
      criteria: [],
    },
  ],
  violations: [
    {
      code: "P1",
      name: "Bermain HP untuk keperluan di luar praktikum (media sosial, chat, game, video) selama sesi berlangsung.",
      penalty: 1,
      active: true,
    },
    {
      code: "P2",
      name: "Menonton video, membuka media sosial, bermain game, atau membuka situs hiburan di komputer praktikum.",
      penalty: 1,
      active: true,
    },
    {
      code: "P3",
      name: "Tidak mengerjakan tugas praktikum selama sesi (mengerjakan tugas mata kuliah lain, hanya diam, atau tidur).",
      penalty: 2,
      active: true,
    },
    {
      code: "P4",
      name: "Terlambat hadir lebih dari 15 menit tanpa alasan yang dapat diterima.",
      penalty: 1,
      active: true,
    },
    {
      code: "P5",
      name: "Meninggalkan ruang praktikum tanpa izin atau pulang sebelum sesi selesai.",
      penalty: 1,
      active: true,
    },
    {
      code: "P6",
      name: "Membuat gaduh atau mengganggu mahasiswa lain yang sedang mengerjakan tugas.",
      penalty: 1,
      active: true,
    },
    {
      code: "P7",
      name: "Menyalin pekerjaan mahasiswa atau kelompok lain dan mengakuinya sebagai hasil sendiri.",
      penalty: 2,
      active: true,
    },
    {
      code: "P8",
      name: "Tidak hadir praktikum tanpa keterangan.",
      penalty: 2,
      active: true,
    },
  ],
};

export function emptyData(): AssessmentData {
  return {
    submissions: {},
    scores: {},
    meetings: {},
    violations: {},
    d2Reviewed: false,
    legacyReviewed: false,
    legacy: false,
    warnings: [],
  };
}
export function slotKey(meeting: string, slot: string) {
  return `${meeting}:${slot}`;
}
export function calculate(
  data: AssessmentData,
  config: Configuration,
  verified = false,
): Calculation {
  const meetings = config.meetings.filter((meeting) => meeting.active);
  const submissions = meetings.flatMap((meeting) =>
    config.slots.map((slot) => data.submissions[slotKey(meeting.id, slot)]),
  );
  const scores: Record<string, number | null> = {};
  for (const aspect of config.aspects.filter((item) => item.active)) {
    if (aspect.kind === "submission-time" || aspect.kind === "submission-content") {
      const field = aspect.kind === "submission-time" ? "time" : "content";
      const values = submissions.map((item) => item?.[field]);
      const valid = values.length > 0 && values.every(Boolean);
      const penalty =
        values.filter((value) => value && value !== (field === "time" ? "on-time" : "suitable"))
          .length * config.penalty;
      scores[aspect.code] = valid ? Math.max(0, aspect.max - penalty) : null;
    } else if (aspect.kind === "criterion") {
      scores[aspect.code] = data.scores[aspect.code]?.score ?? null;
    } else if (aspect.kind === "average") {
      const present = meetings.filter((meeting) => !data.meetings[meeting.id]?.excused);
      const values = present.map((meeting) => data.meetings[meeting.id]?.score ?? null);
      scores[aspect.code] =
        values.length > 0 && values.every((value) => value !== null)
          ? (values.reduce<number>((sum, value) => sum + (value ?? 0), 0) / values.length / 10) *
            aspect.max
          : null;
    } else {
      const penalty = config.violations
        .filter((item) => item.active)
        .reduce((sum, item) => sum + (data.violations[item.code] ?? 0) * item.penalty, 0);
      scores[aspect.code] = data.d2Reviewed ? Math.max(0, aspect.max - penalty) : null;
    }
  }
  const completed = Object.values(scores).filter((value) => value !== null).length;
  const required = Object.keys(scores).length;
  const complete = completed === required && (!data.legacy || data.legacyReviewed);
  const total = Object.values(scores).reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const touched =
    Object.keys(data.submissions).length +
      Object.keys(data.scores).length +
      Object.keys(data.meetings).length +
      Object.keys(data.violations).length >
      0 || data.d2Reviewed;
  return {
    scores,
    completed,
    required,
    complete,
    total,
    status:
      data.legacy && !verified
        ? "draft"
        : complete && verified
          ? "complete"
          : touched
            ? "partial"
            : "empty",
  };
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function validateConfig(config: Configuration, draft = false) {
  ensure(
    config &&
      typeof config === "object" &&
      Array.isArray(config.aspects) &&
      Array.isArray(config.meetings) &&
      Array.isArray(config.violations) &&
      Array.isArray(config.slots),
    "Konfigurasi tidak valid.",
  );
  ensure(
    typeof config.label === "string" && config.label.length > 0 && config.label.length <= 150,
    "Nama konfigurasi wajib diisi.",
  );
  ensure(
    config.aspects.length > 0 &&
      config.aspects.length <= 50 &&
      config.meetings.length <= 50 &&
      config.violations.length <= 100,
    "Jumlah konfigurasi melebihi batas.",
  );
  ensure(
    Number.isFinite(config.penalty) && config.penalty > 0 && config.penalty <= 10,
    "Penalti pengumpulan harus >0 sampai 10.",
  );
  ensure(
    config.slots.length > 0 &&
      config.slots.length <= 10 &&
      new Set(config.slots).size === config.slots.length &&
      config.slots.every((slot) => /^[a-z0-9-]{1,20}$/.test(slot)),
    "Slot pengumpulan tidak valid.",
  );
  if (!draft)
    ensure(
      config.aspects.filter((item) => item.active).reduce((sum, item) => sum + item.max, 0) === 100,
      "Total maksimum aspek aktif wajib 100.",
    );
  ensure(
    new Set(config.aspects.map((item) => item.code)).size === config.aspects.length,
    "Kode aspek harus unik.",
  );
  for (const kind of ["submission-time", "submission-content", "average", "deduction"]) {
    ensure(config.aspects.filter(aspect => aspect.active && aspect.kind === kind).length <= 1, "Setiap tipe kalkulasi otomatis hanya memiliki satu aspek aktif.");
  }
  for (const item of config.aspects) {
    ensure(
      /^[A-Z][A-Z0-9]{0,9}$/.test(item.code) &&
        typeof item.name === "string" &&
        item.name.trim().length > 0 &&
        item.name.length <= 200 &&
        ["Administrasi", "Substansi", "Tata Tulis", "Sikap"].includes(item.group),
      "Kode, nama, atau kelompok aspek tidak valid.",
    );
    ensure(
      Number.isInteger(item.max) &&
        item.max > 0 &&
        item.max <= 100 &&
        typeof item.active === "boolean",
      `Maksimum ${item.code} tidak valid.`,
    );
    ensure(
      ["submission-time", "submission-content", "criterion", "average", "deduction"].includes(
        item.kind,
      ) && Array.isArray(item.criteria),
      "Tipe kalkulasi tidak valid.",
    );
    ensure(
      item.description === undefined ||
        (typeof item.description === "string" && item.description.length <= 5000),
      "Deskripsi aspek tidak valid.",
    );
    ensure(
      item.kind === "criterion"
        ? ["Substansi", "Tata Tulis"].includes(item.group)
        : item.kind.startsWith("submission")
          ? item.group === "Administrasi"
          : item.group === "Sikap",
      "Kelompok aspek tidak sesuai tipe kalkulasi.",
    );
    if (item.kind === "criterion" || item.kind === "average") {
      const rangeMax = item.kind === "average" ? 10 : item.max;
      const covered = new Set<number>();
      ensure(
        (draft || item.criteria.length > 0) &&
          new Set(item.criteria.map((criterion) => criterion.level)).size === item.criteria.length,
        `Kategori ${item.code} wajib unik.`,
      );
      for (const criterion of item.criteria) {
        ensure(
          typeof criterion.level === "string" &&
            criterion.level.length > 0 &&
            criterion.level.length <= 100 &&
            typeof criterion.description === "string" &&
            criterion.description.length <= 5000,
          "Deskripsi kategori tidak valid.",
        );
        ensure(
          Number.isInteger(criterion.min) &&
            Number.isInteger(criterion.max) &&
            criterion.min >= 0 &&
            criterion.max <= rangeMax &&
            criterion.min <= criterion.max,
          `Rentang ${item.code} tidak valid.`,
        );
        ensure(
          criterion.active === undefined || typeof criterion.active === "boolean",
          "Status kategori tidak valid.",
        );
        if (criterion.active !== false)
          for (let score = criterion.min; score <= criterion.max; score++) {
            if (!draft) ensure(!covered.has(score), `Rentang ${item.code} tumpang tindih.`);
            covered.add(score);
          }
      }
      if (!draft && item.active)
        ensure(covered.size === rangeMax + 1, `Rentang ${item.code} harus mencakup 0–${rangeMax}.`);
    }
  }
  ensure(
    (draft || config.meetings.some((meeting) => meeting.active)) &&
      new Set(config.meetings.map((meeting) => meeting.id)).size === config.meetings.length,
    "Pertemuan aktif wajib tersedia dan ID harus unik.",
  );
  for (const meeting of config.meetings)
    ensure(
      typeof meeting.id === "string" &&
        /^[a-zA-Z0-9-]{1,50}$/.test(meeting.id) &&
        typeof meeting.name === "string" &&
        meeting.name.length > 0 &&
        meeting.name.length <= 100 &&
        typeof meeting.active === "boolean" &&
        (meeting.date === "" || /^\d{4}-\d{2}-\d{2}$/.test(meeting.date)),
      "Pertemuan tidak valid.",
    );
  ensure(
    new Set(config.violations.map((item) => item.code)).size === config.violations.length,
    "Kode pelanggaran harus unik.",
  );
  for (const item of config.violations)
    ensure(
      /^[A-Z][A-Z0-9]{0,9}$/.test(item.code) &&
        typeof item.name === "string" &&
        item.name.length > 0 &&
        item.name.length <= 1000 &&
        Number.isFinite(item.penalty) &&
        item.penalty > 0 &&
        item.penalty <= 100 &&
        typeof item.active === "boolean",
      "Pelanggaran tidak valid.",
    );
}
export function validateAssessment(data: AssessmentData, config: Configuration) {
  ensure(
    data &&
      typeof data === "object" &&
      data.submissions &&
      data.scores &&
      data.meetings &&
      data.violations,
    "Data penilaian tidak valid.",
  );
  ensure(
    typeof data.d2Reviewed === "boolean" && typeof data.legacyReviewed === "boolean",
    "Status pemeriksaan tidak valid.",
  );
  const keys = config.meetings
    .filter((meeting) => meeting.active)
    .flatMap((meeting) => config.slots.map((slot) => slotKey(meeting.id, slot)));
  for (const [key, item] of Object.entries(data.submissions)) {
    ensure(
      keys.includes(key) &&
        item &&
        ["", "on-time", "late", "missing"].includes(item.time) &&
        ["", "suitable", "lacking", "unreadable", "missing"].includes(item.content),
      "Status pengumpulan tidak valid.",
    );
    ensure(
      (item.time === "missing") === (item.content === "missing"),
      "Tidak mengumpulkan harus tercatat pada waktu dan isi.",
    );
  }
  for (const [code, item] of Object.entries(data.scores)) {
    const aspect = config.aspects.find(
      (aspect) => aspect.code === code && aspect.active && aspect.kind === "criterion",
    );
    ensure(
      aspect && item && typeof item.note === "string" && item.note.length <= 5000,
      "Aspek atau catatan tidak valid.",
    );
    if (item.score === null) {
      ensure(
        item.level === "" ||
          aspect.criteria.some(
            (criterion) => criterion.active !== false && criterion.level === item.level,
          ),
        "Kategori tidak valid.",
      );
      continue;
    }
    const criterion = aspect.criteria.find(
      (criterion) => criterion.active !== false && criterion.level === item.level,
    );
    ensure(
      criterion &&
        Number.isInteger(item.score) &&
        item.score >= criterion.min &&
        item.score <= criterion.max,
      `Skor ${code} di luar rentang kategori.`,
    );
  }
  for (const [key, item] of Object.entries(data.meetings))
    ensure(
      config.meetings.some((meeting) => meeting.id === key && meeting.active) &&
        item &&
        typeof item.excused === "boolean" &&
        (item.score === null ||
          (Number.isInteger(item.score) && item.score >= 0 && item.score <= 10)) &&
        (!item.excused || item.score === null),
      "Skor D1 harus 0–10; izin sah tidak memiliki skor manual.",
    );
  for (const [key, count] of Object.entries(data.violations))
    ensure(
      config.violations.some((item) => item.code === key && item.active) &&
        Number.isInteger(count) &&
        count >= 0 &&
        count <= 10000,
      "Jumlah pelanggaran tidak valid.",
    );
}
export function formatScore(value: number | null | undefined) {
  return value == null
    ? "—"
    : value.toLocaleString("id-ID", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
}
