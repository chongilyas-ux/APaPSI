import { supabase } from "@/integrations/supabase/client";

export type UserSession = {
  username: string;
  csrf: string;
  mustChangePassword: boolean;
  requirePasswordChange?: boolean;
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

/** Accounts sign in with "username" — plain usernames map to the APaPSI account domain. */
export function usernameToEmail(username: string) {
  const value = username.trim().toLowerCase();
  return value.includes("@") ? value : `${value}@apapsi.app`;
}

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

async function login(body: { username: string; password: string }): Promise<UserSession> {
  const email = usernameToEmail(body.username);
  let result = await supabase.auth.signInWithPassword({ email, password: body.password });
  if (result.error) {
    // First run: if no account exists yet, the first sign-in creates the administrator.
    const response = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: body.password }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 201) {
      result = await supabase.auth.signInWithPassword({ email, password: body.password });
    } else if (response.status === 400 && payload?.message) {
      throw new ApiError(payload.message, 400);
    }
    if (result.error) throw new ApiError("Username atau password tidak sesuai.", 401);
  }
  return { username: body.username, csrf: "-", mustChangePassword: false };
}

async function changePassword(body: { current: string; password: string }) {
  if (typeof body.password !== "string" || body.password.length < 12 || body.password === "admin")
    throw new ApiError("Password baru minimal 12 karakter dan bukan password awal.", 400);
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email) throw new ApiError("Silakan login untuk melanjutkan.", 401);
  const check = await supabase.auth.signInWithPassword({ email, password: body.current });
  if (check.error) throw new ApiError("Password sekarang salah.", 400);
  const { error } = await supabase.auth.updateUser({ password: body.password });
  if (error) throw new ApiError(error.message, 400);
  await supabase.auth.signOut({ scope: "others" });
  await api("/auth/password-logged", { method: "POST" });
  return { success: true };
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const parsed = typeof options.body === "string" ? JSON.parse(options.body) : undefined;
  if (path === "/auth/login") return (await login(parsed)) as T;
  if (path === "/auth/logout") {
    await supabase.auth.signOut();
    return { success: true } as T;
  }
  if (path === "/auth/password") return (await changePassword(parsed)) as T;

  const headers = new Headers(options.headers);
  if (options.body && typeof options.body === "string")
    headers.set("Content-Type", "application/json");
  const token = await accessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers,
      credentials: "same-origin",
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(60000)])
        : AbortSignal.timeout(60000),
    });
  } catch {
    throw new ApiError(
      "Server tidak dapat dihubungi atau waktu koneksi habis. Input Anda tetap tersedia. Coba kembali.",
      503,
      "BACKEND_UNAVAILABLE",
    );
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(
      "Respons backend tidak dapat dibaca. Tidak ada proses yang dinyatakan berhasil.",
      502,
      "INVALID_API_RESPONSE",
    );
  }
  if (!body || typeof body !== "object")
    throw new ApiError("Respons backend tidak valid. Coba kembali.", 502, "INVALID_API_RESPONSE");
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") window.location.replace("/login");
    throw new ApiError(body.message ?? "Permintaan gagal.", response.status, body.code);
  }
  return body as T;
}
export function json(body: unknown) {
  return JSON.stringify(body);
}
export async function session() {
  return api<UserSession>("/auth/session");
}
export async function download(path: string, filename: string) {
  const token = await accessToken();
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error((await response.json()).message);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
