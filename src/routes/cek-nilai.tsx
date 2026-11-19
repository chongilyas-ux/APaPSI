import { createFileRoute } from "@tanstack/react-router";
import StudentGrade from "@/app/StudentGrade";
import { pageHead } from "@/lib/route-helpers";

export const Route = createFileRoute("/cek-nilai")({
  head: () =>
    pageHead("Cek Nilai Praktikum", "Lihat nilai praktikum APaPSI berdasarkan NPM."),
  component: StudentGrade,
});
