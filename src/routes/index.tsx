import { createFileRoute, redirect } from "@tanstack/react-router";
import { pageHead } from "@/lib/route-helpers";

export const Route = createFileRoute("/")({
  head: () => pageHead("Asisten Praktikum APSI", "Ruang kerja penilaian praktikum APSI untuk asisten."),
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
});
