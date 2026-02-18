import type { VisualizerPreset } from "../types/style";
import XmbSmokeVisualizer from "./visualizers/XmbSmokeVisualizer";
import StarfieldVisualizer from "./visualizers/StarfieldVisualizer";
import MatrixRainVisualizer from "./visualizers/MatrixRainVisualizer";
import GradientMeshVisualizer from "./visualizers/GradientMeshVisualizer";
import NoiseFlowVisualizer from "./visualizers/NoiseFlowVisualizer";
import GeometricPulseVisualizer from "./visualizers/GeometricPulseVisualizer";

interface BackgroundLayerProps {
  showColor: boolean;
  color: string;
  colorOpacity: number;
  showVisualizer: boolean;
  visualizerPaused: boolean;
  visualizerPreset: VisualizerPreset;
  visualizerOpacity: number;
  visualizerIntensity: number;
  masterLevel: number;
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
  masterLevel,
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
          paused={visualizerPaused}
          masterLevel={masterLevel}
        />
      )}
    </div>
  );
}

function VisualizerSwitch({
  preset,
  opacity,
  intensity,
  paused,
  masterLevel,
}: {
  preset: VisualizerPreset;
  opacity: number;
  intensity: number;
  paused: boolean;
  masterLevel: number;
}) {
  const props = { opacity, intensity, paused, masterLevel };

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
  }
}
