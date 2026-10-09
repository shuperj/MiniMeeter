import type { RefObject } from "react";
import type { CelEdges, TerrainMaterial, TerrainPattern, VisualizerFilter, VisualizerPreset } from "../types/style";
import type { SpectrumState } from "../hooks/useSpectrum";
import XmbSmokeVisualizer from "./visualizers/XmbSmokeVisualizer";
import StarfieldVisualizer from "./visualizers/StarfieldVisualizer";
import MatrixRainVisualizer from "./visualizers/MatrixRainVisualizer";
import NoiseFlowVisualizer from "./visualizers/NoiseFlowVisualizer";
import LavaLampVisualizer from "./visualizers/LavaLampVisualizer";
import FerrofluidVisualizer from "./visualizers/FerrofluidVisualizer";
import LiquidMetalVisualizer from "./visualizers/LiquidMetalVisualizer";
import TerrainVisualizer from "./visualizers/TerrainVisualizer";
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
  visualizerFilters: readonly VisualizerFilter[];
  visualizerCelEdges: CelEdges;
  terrainMaterial: TerrainMaterial;
  terrainPattern: TerrainPattern;
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
  visualizerFilters,
  visualizerCelEdges,
  terrainMaterial,
  terrainPattern,
  masterLevel,
  spectrum,
}: BackgroundLayerProps) {
  return (
    <div className="background-layer absolute inset-0 -z-10 pointer-events-none overflow-hidden rounded-[6px]">
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
          filters={visualizerFilters}
          celEdges={visualizerCelEdges}
          terrainMaterial={terrainMaterial}
          terrainPattern={terrainPattern}
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
  filters,
  celEdges,
  terrainMaterial,
  terrainPattern,
  paused,
  masterLevel,
  spectrum,
}: {
  preset: VisualizerPreset;
  opacity: number;
  intensity: number;
  speed: number;
  fps: number;
  filters: readonly VisualizerFilter[];
  celEdges: CelEdges;
  terrainMaterial: TerrainMaterial;
  terrainPattern: TerrainPattern;
  paused: boolean;
  masterLevel: number;
  spectrum: RefObject<SpectrumState>;
}) {
  const props = { opacity, intensity, speed, fps, filters, celEdges, paused, masterLevel, spectrum };

  switch (preset) {
    case "xmb-smoke":
      return <XmbSmokeVisualizer {...props} />;
    case "starfield":
      return <StarfieldVisualizer {...props} />;
    case "matrix-rain":
      return <MatrixRainVisualizer {...props} />;
    case "noise-flow":
      return <NoiseFlowVisualizer {...props} />;
    case "lava-lamp":
      return <LavaLampVisualizer {...props} />;
    case "ferrofluid":
      return <FerrofluidVisualizer {...props} />;
    case "liquid-metal":
      return <LiquidMetalVisualizer {...props} />;
    case "terrain":
      return <TerrainVisualizer {...props} material={terrainMaterial} pattern={terrainPattern} />;
    case "disco-ball":
      return <DiscoBallVisualizer {...props} />;
    case "pipes":
      return <PipesVisualizer {...props} />;
  }
}
