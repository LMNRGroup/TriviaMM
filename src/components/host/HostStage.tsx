import type { ReactNode } from "react";

export function HostStage({ children }: { children: ReactNode }) {
  return (
    <main className="host-viewport">
      <section className="host-stage">
        <div className="host-stage-canvas">{children}</div>
      </section>
    </main>
  );
}
