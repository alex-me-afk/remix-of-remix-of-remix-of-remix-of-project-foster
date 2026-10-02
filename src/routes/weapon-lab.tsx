import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const WeaponLab = lazy(() => import("@/components/arena/WeaponLab"));

export const Route = createFileRoute("/weapon-lab")({
  head: () => ({
    meta: [{ title: "Ironhowl — Weapon Lab (debug)" }],
  }),
  component: LabPage,
});

function LabPage() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0b0f14]">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.3em] text-white/40">
            Loading lab…
          </div>
        }
      >
        <WeaponLab />
      </Suspense>
    </main>
  );
}
