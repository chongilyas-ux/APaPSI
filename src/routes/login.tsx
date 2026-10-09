import { createFileRoute } from "@tanstack/react-router";
import Login from "@/app/Login";
import { pageHead } from "@/lib/route-helpers";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => pageHead("Masuk", "Masuk ke ruang kerja internal asisten praktikum APSI."),
  loader: () => null,
  component: Login,
});
