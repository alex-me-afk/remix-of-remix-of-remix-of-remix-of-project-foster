import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const CarLab = lazy(() => import("@/components/arena/CarLab"));

export const Route = createFileRoute("/car-lab")({
  head: () => ({
    meta: [{ title: "Ironhowl — Car Lab (debug)" }],
  }),
  component: CarLabPage,
});

function CarLabPage() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0b0f14]">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.3em] text-white/40">
            Loading car lab…
          </div>
        }
      >
        <CarLab />
      </Suspense>
    </main>
  );
}
