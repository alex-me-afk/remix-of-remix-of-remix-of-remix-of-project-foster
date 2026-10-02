import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [
      { title: "Completing sign in — Ironhowl" },
      { name: "description", content: "Completing Google sign in for Ironhowl." },
      { property: "og:title", content: "Completing sign in — Ironhowl" },
      { property: "og:description", content: "Completing Google sign in for Ironhowl." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"processing" | "done" | "error">("processing");
  const [message, setMessage] = useState("Completing sign in…");

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken) {
      setStatus("error");
      setMessage("Missing access token. Please try signing in again.");
      return;
    }

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken ?? "" })
      .then(({ error }) => {
        if (error) {
          setStatus("error");
          setMessage(error.message);
        } else {
          setStatus("done");
          setMessage("Signed in successfully.");
          window.setTimeout(() => router.navigate({ to: "/" }), 600);
        }
      });
  }, [router]);

  return (
    <main className="flex h-screen w-screen flex-col items-center justify-center bg-background px-6 text-center">
      <div className="w-full max-w-sm rounded-2xl border border-border/70 bg-card/95 p-8 shadow-[var(--shadow-hud)]">
        <h1 className="text-lg font-black uppercase tracking-[0.2em] text-foreground">
          {status === "error" ? "Sign in failed" : "Signing in"}
        </h1>
        <p className="mt-3 text-xs text-muted-foreground">{message}</p>
        {status === "error" && (
          <button
            type="button"
            onClick={() => router.navigate({ to: "/auth" })}
            className="mt-5 rounded-xl bg-[var(--hud-accent)] px-6 py-2.5 text-xs font-bold uppercase tracking-[0.15em] text-[var(--hud-accent-foreground)] transition hover:brightness-110 active:scale-95"
          >
            Try again
          </button>
        )}
      </div>
    </main>
  );
}
