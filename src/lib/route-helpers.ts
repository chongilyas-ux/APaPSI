import { redirect } from "@tanstack/react-router";
import { ApiError } from "@/app/api";

/** Run a page loader; a missing/expired session sends the user back to the login page. */
export async function protect<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) throw redirect({ to: "/login" });
    throw error;
  }
}

export const pageHead = (title: string, description: string) => ({
  meta: [
    { title: `${title} — APaPSI` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} — APaPSI` },
    { property: "og:description", content: description },
  ],
});
