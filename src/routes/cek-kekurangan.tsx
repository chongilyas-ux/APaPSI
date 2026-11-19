import { createFileRoute } from "@tanstack/react-router";
import StudentProgress from "@/app/StudentProgress";
import { pageHead } from "@/lib/route-helpers";

export const Route = createFileRoute("/cek-kekurangan")({
  head: () =>
    pageHead(
      "Cek Kekurangan Penilaian",
      "Lihat komponen B dan C yang sudah atau belum dinilai pada praktikum APaPSI berdasarkan NPM.",
    ),
  component: StudentProgress,
});
