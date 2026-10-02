import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";

import OrientationGate from "@/components/arena/OrientationGate";

const GameShell = lazy(() => import("@/components/arena/GameShell"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ironhowl — Frostline Arena 2v2 Shooter" },
      {
        name: "description",
        content:
          "Ironhowl is a fast 3D 2v2 arena shooter: deployable frost walls, tight gunplay and a symmetric frostline compound. More maps and modes coming.",
      },
      { property: "og:title", content: "Ironhowl — Frostline Arena 2v2 Shooter" },
      {
        property: "og:description",
        content: "Drop into Ironhowl: a fast 3D 2v2 arena shooter with frost walls and short, punchy rounds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background">
      <div className="absolute inset-0">
        {mounted && (
          <OrientationGate>
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  Ironhowl
                </div>
              }
            >
              <GameShell />
            </Suspense>
          </OrientationGate>
        )}
      </div>
    </main>
  );
}
