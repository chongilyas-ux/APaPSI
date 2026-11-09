import { createFileRoute } from "@tanstack/react-router";
import FinalScores from "@/app/FinalScores";
import ErrorPage from "@/app/ErrorPage";
import { api } from "@/app/api";
import { pageHead, protect } from "@/lib/route-helpers";

export const Route = createFileRoute("/_authenticated/nilai-akhir")({
  head: () => pageHead("Nilai Akhir", "Rekap nilai akhir per CPMK dan ekspor Excel."),
  loader: () =>
    protect(async () => {
      const [students, cpmk2] = await Promise.all([api("/students"), api("/cpmk2/students")]);
      return { students, cpmk2 };
    }),
  component: () => <FinalScores />,
  errorComponent: ({ error }) => <ErrorPage error={error} />,
});
