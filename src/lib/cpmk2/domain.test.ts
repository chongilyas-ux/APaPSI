import { describe, expect, it } from "vitest";
import {
  CPMK2_ASPECTS,
  calcA1,
  calcA2,
  calcD1,
  calcD2,
  calculateCpmk2,
  deductionByCode,
  emptyCpmk2Data,
  validateCpmk2,
  type Cpmk2Data,
  type ViolationCode,
} from "./domain";

function base(): Cpmk2Data {
  return emptyCpmk2Data();
}

// wrapper biar destrukturisasi tidak bentrok dengan scope modul
const domain = () => ({ CPMK2_ASPECTS });

function scoreAll(data: Cpmk2Data, score = Infinity): Cpmk2Data {
  // isi B1..B5, C dengan level terendah-kelipatan rentang yang memuat skor tsb:
  // helper percobaan memakai skor aman per aspek (max masing-masing).
  const picks: Record<string, number> = { B1: 5, B2: 15, B3: 15, B4: 10, B5: 10, C: 5 };
  for (const [code, max] of Object.entries(picks)) {
    data.b[code] = { level: "Sangat Baik", score: Math.min(score, max), note: "" };
  }
  return data;
}

function week(data: Cpmk2Data, week0: string, time: Cpmk2Data["a"][string]["time"], content: Cpmk2Data["a"][string]["content"]) {
  data.a[week0] = { time, content };
  return data;
}

function attend(data: Cpmk2Data, scores: Array<[string, number | null, string]>) {
  for (const [w, s, status] of scores) {
    data.d1[w] = { status: status as "hadir", score: s };
  }
  return data;
}

describe("A1 & A2 — akumulasi mingguan", () => {
  it("nol pelanggaran = 10/10", () => {
    const data = scoreAll(base());
    for (const w of ["6", "7", "9"]) week(data, w, "on-time", "suitable");
    expect(calcA1(data)).toBe(10);
    expect(calcA2(data)).toBe(10);
  });

  it("terlambat mengurangi 2 poin per kejadian", () => {
    const data = scoreAll(base());
    week(data, "6", "late", "suitable");
    week(data, "7", "late", "suitable");
    week(data, "9", "on-time", "suitable");
    expect(calcA1(data)).toBe(6);
  });

  it("tidak mengumpulkan dihitung pada A1 dan A2 sekaligus", () => {
    const data = scoreAll(base());
    week(data, "6", "missing", "missing");
    week(data, "7", "on-time", "suitable");
    week(data, "9", "on-time", "suitable");
    expect(calcA1(data)).toBe(8); // 1 terlambat
    expect(calcA2(data)).toBe(8); // 1 kurang
  });

  it("tidak bisa dibuka dihitung kurang", () => {
    const data = scoreAll(base());
    week(data, "6", "on-time", "unreadable");
    week(data, "7", "on-time", "suitable");
    week(data, "9", "on-time", "lacking");
    expect(calcA1(data)).toBe(10);
    expect(calcA2(data)).toBe(6);
  });

  it("bawah ambang: 3 terlambat = 4, dan skenario maksimum lebih besar tetap min 0", () => {
    const data = scoreAll(base());
    week(data, "6", "missing", "missing");
    week(data, "7", "missing", "missing");
    week(data, "9", "missing", "missing");
    // 3 terlambat + 3 kurang sesuai rubrik tabel 3×: A1 = 10-6 = 4, A2 = 4
    expect(calcA1(data)).toBe(4);
    expect(calcA2(data)).toBe(4);
    // konstrain umum formula: tetap tidak bisa negatif
    expect(calcA1({ ...data, a: { "6": { time: "missing", content: "missing" } } })).toBe(null); // tidak lengkap
  });

  it("belum lengkap terekam → null, bukan 10", () => {
    const data = scoreAll(base());
    week(data, "6", "on-time", "suitable");
    expect(calcA1(data)).toBeNull();
    expect(calcA2(data)).toBeNull();
  });
});

describe("Aspek B dan C — rentang rubrik", () => {
  it("setiap skor kategori menolak nilai di luar rentang", () => {
    const data = base();
    data.b["B1"] = { level: "Sangat Baik", score: 5, note: "" }; // SB = 5 saja
    expect(() => validateCpmk2(data)).not.toThrow();
    data.b["B1"] = { level: "Sangat Baik", score: 4, note: "" }; // SB bukan 4
    expect(() => validateCpmk2(data)).toThrow(/rentang|kategori/i);
    data.b["B1"] = { level: "Sangat Baik", score: 5, note: "" }; // kembalikan ke valid
    data.b["B2"] = { level: "Cukup", score: 6, note: "" }; // cukup 6–9
    expect(() => validateCpmk2(data)).not.toThrow();
    data.b["B2"] = { level: "Cukup", score: 10, note: "" };
    expect(() => validateCpmk2(data)).toThrow(/rentang/i);
    data.b["B2"] = { level: "Kurang", score: 0, note: "" };
    expect(() => validateCpmk2(data)).not.toThrow();
    data.b["B2"] = { level: "Kurang", score: 6, note: "" };
    expect(() => validateCpmk2(data)).toThrow(/rentang/i);
  });

  it("semua rentang kategori menutupi 0..max tanpa bolong (B1–B5, C)", () => {
    const { CPMK2_ASPECTS } = domain();
    for (const aspect of CPMK2_ASPECTS) {
      const covered = new Set<number>();
      for (const c of aspect.criteria) for (let v = c.min; v <= c.max; v++) covered.add(v);
      for (let v = 0; v <= aspect.max; v++) expect(covered.has(v), `${aspect.code} bolong di ${v}`).toBe(true);
    }
  });

  it("total maksimum aspek = 100", () => {
    const { CPMK2_ASPECTS } = domain();
    const sum = CPMK2_ASPECTS.map((a) => a.max).reduce((a, b) => a + b, 0) + 30; // A1+A2 = 20, D2 = 10
    expect(sum).toBe(100);
  });
});

describe("D1 — rata-rata kehadiran", () => {
  it("contoh resmi PDF: 9, 8, 8 → 8,33", () => {
    const data = attend(base(), [
      ["6", 9, "hadir"],
      ["7", 8, "hadir"],
      ["9", 8, "hadir"],
    ]);
    expect(calcD1(data).score).toBeCloseTo(8.33, 2);
  });

  it("izin sah memakai rata-rata pertemuan lain yang diikuti", () => {
    const data = attend(base(), [
      ["6", 9, "hadir"],
      ["7", null, "izin"],
      ["9", 7, "hadir"],
    ]);
    expect(calcD1(data).score).toBe(8); // (9+7)/2
  });

  it("tidak ada pertemuan yang diikuti → manual review (bukan nilai rekaan)", () => {
    const data = attend(base(), [
      ["6", null, "izin"],
      ["7", null, "izin"],
      ["9", null, "alpa"],
    ]);
    const d1 = calcD1(data);
    expect(d1.score).toBeNull();
    expect(d1.manualReview).toBe(true);
    const result = calculateCpmk2(data);
    expect(result.manualReview).toBe(true);
    expect(result.complete).toBe(false);
  });

  it("belum semua minggu terekam → belum dihitung", () => {
    const data = attend(base(), [["6", 9, "hadir"]]);
    expect(calcD1(data).score).toBeNull();
  });

  it("skor hadir wajib 0–10", () => {
    const data = attend(base(), [
      ["6", 11, "hadir"],
      ["7", 9, "hadir"],
      ["9", 9, "hadir"],
    ]);
    expect(() => validateCpmk2(data)).toThrow(/0–10/);
  });
});

describe("D2 — pelanggaran", () => {
  it("denda tiap kode P1..P8", () => {
    for (const [code, penalty] of [
      ["P1", 1],
      ["P2", 1],
      ["P3", 2],
      ["P4", 1],
      ["P5", 1],
      ["P6", 1],
      ["P7", 2],
      ["P8", 2],
    ] as Array<[ViolationCode, number]>) {
      const data = base();
      data.d2 = [{ week: "6", code, note: "" }];
      data.d2Reviewed = true;
      expect(calcD2(data)).toBe(10 - penalty);
    }
  });

  it("contoh resmi PDF: P1 dua kali + P2 satu kali → 7", () => {
    const data = base();
    data.d2 = [
      { week: "6", code: "P1", note: "" },
      { week: "7", code: "P1", note: "" },
      { week: "7", code: "P2", note: "" },
    ];
    data.d2Reviewed = true;
    expect(calcD2(data)).toBe(7); // 10 - 2 - 1
  });

  it("pengulangan setelah teguran tercatat sebagai entri baru", () => {
    const data = base();
    data.d2 = [
      { week: "6", code: "P3", note: "teguran kesatu" },
      { week: "6", code: "P3", note: "diulang setelah teguran" },
    ];
    data.d2Reviewed = true;
    expect(calcD2(data)).toBe(6); // 10 - 2 - 2
  });

  it("tidak pernah di bawah 0", () => {
    const data = base();
    data.d2 = Array.from({ length: 9 }, (_, i) => ({ week: "6", code: "P3" as ViolationCode, note: "" }));
    data.d2Reviewed = true;
    expect(calcD2(data)).toBe(0);
    expect(deductionByCode(data).P3).toBe(18);
  });

  it("izin sah tidak tercatat sebagai P8 otomatis", () => {
    const data = attend(base(), [
      ["6", null, "izin"],
      ["7", 9, "hadir"],
      ["9", 9, "hadir"],
    ]);
    data.d2Reviewed = true;
    expect(data.d2.filter((e) => e.code === "P8")).toHaveLength(0);
    expect(calcD2(data)).toBe(10);
  });
});

describe("Total akhir", () => {
  it("nilai lengkap maksimal 100, contoh resmi PDF D1 8,33 + D2 7", () => {
    const data = scoreAll(base());
    for (const w of ["6", "7", "9"]) week(data, w, "on-time", "suitable");
    attend(data, [
      ["6", 9, "hadir"],
      ["7", 8, "hadir"],
      ["9", 8, "hadir"],
    ]);
    data.d2 = [
      { week: "6", code: "P1", note: "" },
      { week: "7", code: "P1", note: "" },
      { week: "7", code: "P2", note: "" },
    ];
    data.d2Reviewed = true;
    // B semua maksimal justru 60; A 20; D1 8.33; D2 7 → tidak lebih dari 100
    const result = calculateCpmk2(data);
    expect(result.total).toBe(95.33);
    expect(result.total).toBeLessThanOrEqual(100);
    // perbandingan dengan PDF: aspek D = 15,33
    expect(8.33 + 7).toBe(15.33);
  });

  it("pengesahan butuh seluruh 10 komponen", () => {
    const data = scoreAll(base());
    week(data, "6", "late", "suitable");
    week(data, "7", "on-time", "suitable");
    week(data, "9", "on-time", "suitable");
    attend(data, [
      ["6", 9, "hadir"],
      ["7", 9, "hadir"],
      ["9", 9, "hadir"],
    ]);
    data.d2Reviewed = true;
    const result = calculateCpmk2(data);
    expect(result.complete).toBe(true);
    expect(result.status).toBe("complete");
    // hapus satu skor → tidak lengkap
    delete data.b.B5;
    expect(calculateCpmk2(data).complete).toBe(false);
  });

  it("kosong → status empty, total 0", () => {
    const result = calculateCpmk2(emptyCpmk2Data());
    expect(result.status).toBe("empty");
    expect(result.total).toBe(0);
  });
});

describe("Validator", () => {
  it("menolak status pengumpulan tidak sah", () => {
    const data = base();
    data.a["6"] = { time: "ontime" as never, content: "suitable" as never };
    expect(() => validateCpmk2(data)).toThrow(/minggu 6/);
  });

  it("izin sah tidak boleh punya skor manual", () => {
    const data = base();
    data.d1["6"] = { status: "izin", score: 9 };
    expect(() => validateCpmk2(data)).toThrow(/izin/);
  });

  it("entri pelanggaran dengan kode tak dikenal ditolak", () => {
    const data = base();
    data.d2 = [{ week: "6", code: "P99" as ViolationCode, note: "" }];
    expect(() => validateCpmk2(data)).toThrow(/pelanggaran/);
  });
});
