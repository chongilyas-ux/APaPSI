import { createFileRoute } from "@tanstack/react-router";
import Cpmk2Assessment from "@/app/Cpmk2Assessment";
import ErrorPage from "@/app/ErrorPage";
import { api } from "@/app/api";
import { pageHead, protect } from "@/lib/route-helpers";

type Cpmk2Student = {
  id: string;
  npm: string;
  rombel_id: number;
};

export const Route = createFileRoute("/_authenticated/cpmk2/$rombel/$npm")({
  head: () =>
    pageHead("Form penilaian CPMK 2", "Isi dan sahkan penilaian Tahap II (basis data) mahasiswa."),
  loader: ({ params }) =>
    protect(async () => {
      const students = await api<Cpmk2Student[]>("/cpmk2/students");
      const student = students.find(
        (item) => item.npm === params.npm && `rombel-${item.rombel_id}` === params.rombel,
      );
      if (!student) throw new Error("Mahasiswa tidak ditemukan pada rombel ini.");
      return { student, students };
    }),
  component: Cpmk2Assessment,
  errorComponent: ({ error }) => <ErrorPage error={error} />,
});
