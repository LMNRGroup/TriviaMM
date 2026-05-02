"use client";

import { useEffect, useState, type ReactNode } from "react";

const HOST_STAGE_WIDTH = 1920;
const HOST_STAGE_HEIGHT = 1080;
const HOST_STAGE_PADDING = 12;

interface HostStageState {
  height: number;
  scale: number;
  width: number;
}

function measureStage(): HostStageState {
  if (typeof window === "undefined") {
    return {
      width: HOST_STAGE_WIDTH,
      height: HOST_STAGE_HEIGHT,
      scale: 1,
    };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const availableWidth = Math.max(0, viewportWidth - HOST_STAGE_PADDING * 2);
  const availableHeight = Math.max(0, viewportHeight - HOST_STAGE_PADDING * 2);
  const scale = Math.min(availableWidth / HOST_STAGE_WIDTH, availableHeight / HOST_STAGE_HEIGHT);

  return {
    width: Math.max(0, Math.floor(HOST_STAGE_WIDTH * scale)),
    height: Math.max(0, Math.floor(HOST_STAGE_HEIGHT * scale)),
    scale,
  };
}

export function HostStage({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<HostStageState | null>(null);

  useEffect(() => {
    const updateStage = () => {
      setStage(measureStage());
    };

    updateStage();
    window.addEventListener("resize", updateStage);
    window.visualViewport?.addEventListener("resize", updateStage);

    return () => {
      window.removeEventListener("resize", updateStage);
      window.visualViewport?.removeEventListener("resize", updateStage);
    };
  }, []);

  return (
    <main className="host-viewport">
      <section
        className="host-stage"
        style={
          stage
            ? {
                width: `${stage.width}px`,
                height: `${stage.height}px`,
              }
            : { visibility: "hidden" }
        }
      >
        <div
          className="host-stage-canvas"
          style={
            stage
              ? {
                  width: `${HOST_STAGE_WIDTH}px`,
                  height: `${HOST_STAGE_HEIGHT}px`,
                  transform: `scale(${stage.scale})`,
                }
              : undefined
          }
        >
          {children}
        </div>
      </section>
    </main>
  );
}
