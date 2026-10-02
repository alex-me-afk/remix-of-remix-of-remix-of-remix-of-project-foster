import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import BrandMark from "@/components/arena/BrandMark";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Ironhowl" },
      { name: "description", content: "Sign in to Ironhowl with Google to link your progress." },
      { property: "og:title", content: "Sign in — Ironhowl" },
      { property: "og:description", content: "Sign in to Ironhowl with Google to link your progress." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.navigate({ to: "/" });
    });
  }, [router]);

  const signInWithGoogle = async () => {
    setLoading(true);
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError(result.error.message ?? "Sign in failed");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    router.navigate({ to: "/" });
  };

  return (
    <main className="relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-background px-6 text-center">
      <div className="z-10 w-full max-w-sm rounded-2xl border border-border/70 bg-card/95 p-8 shadow-[var(--shadow-hud)]">
        <div className="flex justify-center">
          <BrandMark />
        </div>
        <h1 className="mt-6 text-lg font-black uppercase tracking-[0.2em] text-foreground">
          Link your progress
        </h1>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Sign in with Google to back up your Ironhowl profile and play across devices.
        </p>

        {error && (
          <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-background px-5 py-3 text-xs font-bold uppercase tracking-[0.15em] text-foreground transition hover:bg-secondary active:scale-95 disabled:opacity-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          {loading ? "Opening Google…" : "Sign in with Google"}
        </button>

        <button
          type="button"
          onClick={() => router.history.back()}
          className="mt-3 w-full rounded-xl border border-border bg-card/60 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground transition hover:bg-secondary active:scale-95"
        >
          Continue as guest
        </button>
      </div>
    </main>
  );
}
