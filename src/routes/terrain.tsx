import { useState, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Mountain, Upload, RotateCcw, AlertTriangle, CheckCircle2, Info, Compass, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMissionStore, useMission } from "@/state/mission";
import { generateSyntheticTerrain, parseTerrainFile, sampleElevation, toMetres, type Point } from "@/engine/terrain";
import { TerrainMap } from "@/components/mission/terrain-map";
import { Panel, PageTitle, Stat, Row } from "@/components/mission/panels";
import { distance, pageHead } from "@/components/mission/format";

export const Route = createFileRoute("/terrain")({
  head: () => pageHead("Terrain Explorer", "Topographic elevation models, DEM import, and lunar surface analysis"),
  component: TerrainExplorer,
});

function TerrainExplorer() {
  const m = useMission();
  const setTerrain = useMissionStore((s) => s.setTerrain);
  const [selectedPoint, setSelectedPoint] = useState<Point | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const elevRange = m.terrain.maxElevM - m.terrain.minElevM;
  const inspectedPos = selectedPoint ? toMetres(m.terrain, selectedPoint) : null;
  const inspectedElev = selectedPoint ? sampleElevation(m.terrain, selectedPoint.x, selectedPoint.y) : null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadSuccess(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseTerrainFile(text, file.name);
        setTerrain(parsed);
        setUploadSuccess(`Successfully loaded ${file.name} (${parsed.width}×${parsed.height} cells, ${parsed.resolutionM}m resolution)`);
      } catch (err: unknown) {
        setUploadError(err instanceof Error ? err.message : "Failed to parse terrain file");
      }
    };
    reader.onerror = () => setUploadError("Error reading file");
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleResetSynthetic = () => {
    setTerrain(generateSyntheticTerrain(42, 80, 25));
    setUploadError(null);
    setUploadSuccess("Restored default synthetic lunar terrain baseline.");
    setSelectedPoint(null);
  };

  return (
    <>
      <PageTitle
        title="Terrain Explorer"
        description="Topographic elevation analysis & Digital Elevation Model (DEM) management"
        action={
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,.txt"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} className="mr-1.5" /> Import DEM (CSV/JSON)
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetSynthetic}
              title="Reset to default synthetic terrain"
            >
              <RotateCcw size={14} className="mr-1.5" /> Reset Synthetic
            </Button>
          </div>
        }
      />

      {uploadError && (
        <div className="mb-4 flex items-center gap-3 border border-destructive/40 bg-destructive/10 p-3 rounded text-xs text-destructive">
          <AlertTriangle size={16} />
          <span>{uploadError}</span>
        </div>
      )}

      {uploadSuccess && (
        <div className="mb-4 flex items-center gap-3 border border-success/40 bg-success/10 p-3 rounded text-xs text-success">
          <CheckCircle2 size={16} />
          <span>{uploadSuccess}</span>
        </div>
      )}

      <div className="stat-grid">
        <Stat
          label="TERRAIN SOURCE"
          value={m.terrain.source === "synthetic" ? "Synthetic" : "Custom DEM"}
          detail={m.terrain.name}
          icon={<Mountain size={16} />}
          tone="text-primary"
        />
        <Stat
          label="GRID RESOLUTION"
          value={`${m.terrain.resolutionM} m`}
          detail={`${m.terrain.width} × ${m.terrain.height} cells (${distance(m.terrain.width * m.terrain.resolutionM)} span)`}
          icon={<Layers size={16} />}
        />
        <Stat
          label="ELEVATION RANGE"
          value={`${m.terrain.minElevM.toFixed(0)} to ${m.terrain.maxElevM.toFixed(0)} m`}
          detail={`Total relief: ${elevRange.toFixed(1)} m`}
          icon={<Compass size={16} />}
        />
        <Stat
          label="SAFETY THRESHOLD"
          value={`≤ ${m.settings.maxSlopeDeg}°`}
          detail="Max slope for safe traverse"
          icon={<AlertTriangle size={16} />}
          tone="text-warning"
        />
      </div>

      <div className="dashboard-grid">
        <Panel
          title="Topographic Elevation Heatmap"
          icon={<Mountain size={15} className="text-primary" />}
          action={
            <span className="section-label text-[9px]">
              {m.terrain.source === "synthetic" ? "PROCEDURAL SYNTHESIS" : "EXTERNAL DEM"}
            </span>
          }
        >
          <TerrainMap large={true} onPick={(p) => setSelectedPoint(p)} />
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel
            title="Surface Inspector"
            icon={<Info size={15} className="text-primary" />}
          >
            <div className="p-4">
              <p className="text-xs text-muted-foreground mb-3">
                Click anywhere on the map to sample coordinates and surface elevation.
              </p>
              {selectedPoint && inspectedPos && inspectedElev !== null ? (
                <div className="border border-border/80 rounded p-3 bg-secondary/30">
                  <Row label="Grid Cell" value={`[${selectedPoint.x}, ${selectedPoint.y}]`} />
                  <Row label="Surface X" value={`${inspectedPos.x.toFixed(0)} m`} />
                  <Row label="Surface Y" value={`${inspectedPos.y.toFixed(0)} m`} />
                  <Row
                    label="Elevation"
                    value={`${inspectedElev.toFixed(2)} m`}
                    tone="text-primary"
                  />
                  <Row
                    label="Relative to Min"
                    value={`+${(inspectedElev - m.terrain.minElevM).toFixed(1)} m`}
                  />
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-xs italic">
                  Select a coordinate on the map to inspect
                </div>
              )}
            </div>
          </Panel>

          <Panel
            title="Terrain Characteristics"
            icon={<Layers size={15} className="text-primary" />}
          >
            <div className="px-4 py-2">
              <Row label="Terrain Source" value={m.terrain.source.toUpperCase()} />
              <Row label="Grid Width" value={`${m.terrain.width} cells`} />
              <Row label="Grid Height" value={`${m.terrain.height} cells`} />
              <Row label="Cell Resolution" value={`${m.terrain.resolutionM} m/cell`} />
              <Row label="Min Elevation" value={`${m.terrain.minElevM.toFixed(1)} m`} />
              <Row label="Max Elevation" value={`${m.terrain.maxElevM.toFixed(1)} m`} />
              <Row label="Coordinate Origin" value={`(0, 0) m`} />
            </div>
            <div className="p-4 border-t border-border text-[10px] text-muted-foreground leading-relaxed">
              <strong>Notice:</strong> Synthetic terrain is generated programmatically to simulate representative lunar features (impact craters, raised rims, and sloping ridges). It is not real NASA DEM data unless an actual DEM file is imported.
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
