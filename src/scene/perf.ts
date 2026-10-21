import type { WebGLRenderer } from 'three';

const QUALITY_STEPS = [1.75, 1.5, 1.25, 1.0] as const;
const LOW_FRAME_DELTA_MS = 20;
const LOW_FRAME_DURATION_MS = 3000;

export function createAdaptiveQuality(
  renderer: WebGLRenderer,
  initialPixelRatio: number,
  diagnosticElement: HTMLElement | null,
): { sample(now: number, hidden: boolean): void } {
  const initialRatio = Number.isFinite(initialPixelRatio)
    ? Math.max(1, Math.min(initialPixelRatio, 2))
    : 1;
  let pixelRatio = initialRatio;
  let previousSample: number | null = null;
  let lowPerformanceSince: number | null = null;

  const updateDiagnostic = (fps: number | null): void => {
    if (!diagnosticElement) return;

    const { render, memory } = renderer.info;
    const fpsText = fps === null ? '--' : fps.toFixed(1);
    diagnosticElement.textContent =
      `FPS: ${fpsText} | DPR: ${pixelRatio.toFixed(2)} | ` +
      `calls: ${render.calls} | triangles: ${render.triangles} | ` +
      `points: ${render.points} | lines: ${render.lines} | ` +
      `geometries: ${memory.geometries} | textures: ${memory.textures}`;
  };

  return {
    sample(now: number, hidden: boolean): void {
      if (hidden || !Number.isFinite(now) || now < 0) {
        previousSample = null;
        lowPerformanceSince = null;
        updateDiagnostic(null);
        return;
      }

      if (previousSample === null || now <= previousSample) {
        previousSample = now;
        lowPerformanceSince = null;
        updateDiagnostic(null);
        return;
      }

      const frameDelta = now - previousSample;
      previousSample = now;
      if (frameDelta > LOW_FRAME_DELTA_MS) {
        if (lowPerformanceSince === null) lowPerformanceSince = now;

        if (now - lowPerformanceSince >= LOW_FRAME_DURATION_MS) {
          const nextRatio = QUALITY_STEPS.find((step) => step < pixelRatio);
          if (nextRatio !== undefined) {
            pixelRatio = nextRatio;
            renderer.setPixelRatio(pixelRatio);
          }
          lowPerformanceSince = now;
        }
      } else {
        lowPerformanceSince = null;
      }

      updateDiagnostic(1000 / frameDelta);
    },
  };
}
