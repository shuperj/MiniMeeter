import type { RefObject } from "react";
import type { VisualizerFilter, VisualizerPreset } from "../types/style";
import type { SpectrumState } from "../hooks/useSpectrum";
import XmbSmokeVisualizer from "./visualizers/XmbSmokeVisualizer";
import StarfieldVisualizer from "./visualizers/StarfieldVisualizer";
import MatrixRainVisualizer from "./visualizers/MatrixRainVisualizer";
import GradientMeshVisualizer from "./visualizers/GradientMeshVisualizer";
import NoiseFlowVisualizer from "./visualizers/NoiseFlowVisualizer";
import GeometricPulseVisualizer from "./visualizers/GeometricPulseVisualizer";
import LavaLampVisualizer from "./visualizers/LavaLampVisualizer";
import AuroraVisualizer from "./visualizers/AuroraVisualizer";
import DiscoBallVisualizer from "./visualizers/DiscoBallVisualizer";
import PipesVisualizer from "./visualizers/PipesVisualizer";

interface BackgroundLayerProps {
  showColor: boolean;
  color: string;
  colorOpacity: number;
  showVisualizer: boolean;
  visualizerPaused: boolean;
  visualizerPreset: VisualizerPreset;
  visualizerOpacity: number;
  visualizerIntensity: number;
  visualizerSpeed: number;
  visualizerFps: number;
  visualizerFilter: VisualizerFilter;
  masterLevel: number;
  spectrum: RefObject<SpectrumState>;
}

export default function BackgroundLayer({
  showColor,
  color,
  colorOpacity,
  showVisualizer,
  visualizerPaused,
  visualizerPreset,
  visualizerOpacity,
  visualizerIntensity,
  visualizerSpeed,
  visualizerFps,
  visualizerFilter,
  masterLevel,
  spectrum,
}: BackgroundLayerProps) {
  return (
    <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden rounded-[6px]">
      {showColor && (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: color, opacity: colorOpacity }}
        />
      )}

      {showVisualizer && (
        <VisualizerSwitch
          preset={visualizerPreset}
          opacity={visualizerOpacity}
          intensity={visualizerIntensity}
          speed={visualizerSpeed}
          fps={visualizerFps}
          filter={visualizerFilter}
          paused={visualizerPaused}
          masterLevel={masterLevel}
          spectrum={spectrum}
        />
      )}
    </div>
  );
}

function VisualizerSwitch({
  preset,
  opacity,
  intensity,
  speed,
  fps,
  filter,
  paused,
  masterLevel,
  spectrum,
}: {
  preset: VisualizerPreset;
  opacity: number;
  intensity: number;
  speed: number;
  fps: number;
  filter: VisualizerFilter;
  paused: boolean;
  masterLevel: number;
  spectrum: RefObject<SpectrumState>;
}) {
  const props = { opacity, intensity, speed, fps, filter, paused, masterLevel, spectrum };

  switch (preset) {
    case "xmb-smoke":
      return <XmbSmokeVisualizer {...props} />;
    case "starfield":
      return <StarfieldVisualizer {...props} />;
    case "matrix-rain":
      return <MatrixRainVisualizer {...props} />;
    case "gradient-mesh":
      return <GradientMeshVisualizer {...props} />;
    case "noise-flow":
      return <NoiseFlowVisualizer {...props} />;
    case "geometric-pulse":
      return <GeometricPulseVisualizer {...props} />;
    case "lava-lamp":
      return <LavaLampVisualizer {...props} />;
    case "aurora":
      return <AuroraVisualizer {...props} />;
    case "disco-ball":
      return <DiscoBallVisualizer {...props} />;
    case "pipes":
      return <PipesVisualizer {...props} />;
  }
}
