import { createFileRoute } from "@tanstack/react-router";
import Assessment from "@/app/Assessment";
import ErrorPage from "@/app/ErrorPage";
import { api } from "@/app/api";
import type { Student } from "@/lib/domain";
import { pageHead, protect } from "@/lib/route-helpers";

export const Route = createFileRoute("/_authenticated/penilaian/$rombel/$npm")({
  head: () => pageHead("Form penilaian", "Isi dan sahkan penilaian praktikum mahasiswa."),
  loader: ({ params }) =>
    protect(async () => {
      const students = await api<Student[]>("/students");
      const student = students.find(
        (item) => item.npm === params.npm && `rombel-${item.rombel_id}` === params.rombel,
      );
      if (!student) throw new Error("Mahasiswa tidak ditemukan pada rombel ini.");
      return { ...(await api<object>(`/students/${student.id}/assessment`)), students };
    }),
  component: Assessment,
  errorComponent: ({ error }) => <ErrorPage error={error} />,
});
