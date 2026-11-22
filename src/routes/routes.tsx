import { createFileRoute } from "@tanstack/react-router";
import { Route as RouteIcon, ShieldCheck, Zap, Radio, Clock, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMissionStore, useMission } from "@/state/mission";
import { TerrainMap } from "@/components/mission/terrain-map";
import { Panel, PageTitle, Stat } from "@/components/mission/panels";
import { distance, duration, pageHead } from "@/components/mission/format";

export const Route = createFileRoute("/routes")({
  head: () => pageHead("Route Planner", "Direct vs Communication-Aware route comparison and safety analysis"),
  component: RoutePlanner,
});

function RoutePlanner() {
  const m = useMission();
  const select = useMissionStore((s) => s.select);

  const rA = m.routes.A;
  const rB = m.routes.B;
  const rec = m.recommendation;

  return (
    <>
      <PageTitle
        title="Route Planner & Comparison"
        description="A* pathfinding with terrain slope safety constraints & line-of-sight awareness"
      />

      {/* Safety Constraint & Recommendation Banner */}
      <div className="mb-6 p-4 rounded border border-primary/30 bg-primary/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck size={22} className="text-primary shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-semibold tracking-wider text-primary uppercase">
              Mission Recommendation Rule
            </div>
            <p className="text-xs text-foreground mt-1 leading-relaxed">
              {rec.reason}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Principle: Terrain safety (slope ≤ {m.settings.maxSlopeDeg}°) is a hard constraint. Among safe routes, distance, energy, and communication availability are balanced.
            </p>
          </div>
        </div>
        {rec.id && (
          <Button
            size="sm"
            onClick={() => select(rec.id!)}
            variant={m.selected === rec.id ? "default" : "outline"}
            className="shrink-0 text-xs"
          >
            {m.selected === rec.id ? "Active Recommended Route" : `Activate Route ${rec.id}`}
            <ArrowRight size={13} className="ml-1.5" />
          </Button>
        )}
      </div>

      <div className="stat-grid">
        <Stat
          label="ACTIVE TRAVERSE"
          value={`Route ${m.selected}`}
          detail={m.selected === "A" ? "Route A — Direct traverse" : "Route B — Comm-aware alternative"}
          icon={<RouteIcon size={16} />}
          tone="text-primary"
        />
        <Stat
          label="ROUTE A DISTANCE"
          value={distance(rA.metrics?.distanceM ?? 0)}
          detail={`${rA.prediction?.availabilityPct.toFixed(0) ?? 0}% comm availability`}
          icon={<Radio size={16} />}
        />
        <Stat
          label="ROUTE B DISTANCE"
          value={distance(rB.metrics?.distanceM ?? 0)}
          detail={`${rB.prediction?.availabilityPct.toFixed(0) ?? 0}% comm availability`}
          icon={<Zap size={16} />}
          tone="text-route-b"
        />
        <Stat
          label="SAFETY CONSTRAINT"
          value={`≤ ${m.settings.maxSlopeDeg}° Slope`}
          detail={rA.safe && rB.safe ? "Both routes safe" : "Safety violation detected"}
          icon={<AlertTriangle size={16} />}
          tone={rA.safe && rB.safe ? "text-success" : "text-destructive"}
        />
      </div>

      <div className="dashboard-grid mb-6">
        <Panel
          title="Route Path Geometry"
          icon={<RouteIcon size={15} className="text-primary" />}
          action={
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={m.selected === "A" ? "default" : "outline"}
                onClick={() => select("A")}
                className="h-7 text-xs"
              >
                Route A (Direct)
              </Button>
              <Button
                size="sm"
                variant={m.selected === "B" ? "default" : "outline"}
                onClick={() => select("B")}
                className="h-7 text-xs"
              >
                Route B (Comm-Aware)
              </Button>
            </div>
          }
        >
          <TerrainMap />
        </Panel>

        <Panel
          title="Selection Controls"
          icon={<Zap size={15} className="text-primary" />}
        >
          <div className="p-4 flex flex-col gap-4">
            <div className="border border-border rounded p-3 bg-secondary/20">
              <div className="flex justify-between items-center mb-1">
                <span className="font-semibold text-xs text-primary">Route A: Direct</span>
                <span className={`text-[10px] telemetry ${rA.safe ? "text-success" : "text-destructive"}`}>
                  {rA.safe ? "SAFE" : "UNSAFE"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-3 leading-normal">
                Minimizes path distance across terrain regardless of intermediate crater ridges.
              </p>
              <Button
                size="sm"
                className="w-full text-xs"
                variant={m.selected === "A" ? "default" : "outline"}
                onClick={() => select("A")}
              >
                {m.selected === "A" ? "Active Traverse Route" : "Select Route A"}
              </Button>
            </div>

            <div className="border border-border rounded p-3 bg-secondary/20">
              <div className="flex justify-between items-center mb-1">
                <span className="font-semibold text-xs text-route-b">Route B: Comm-Aware</span>
                <span className={`text-[10px] telemetry ${rB.safe ? "text-success" : "text-destructive"}`}>
                  {rB.safe ? "SAFE" : "UNSAFE"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-3 leading-normal">
                Applies penalty to terrain cells that obstruct line-of-sight to the communication relay.
              </p>
              <Button
                size="sm"
                className="w-full text-xs"
                variant={m.selected === "B" ? "default" : "outline"}
                onClick={() => select("B")}
              >
                {m.selected === "B" ? "Active Traverse Route" : "Select Route B"}
              </Button>
            </div>
          </div>
        </Panel>
      </div>

      {/* Side-by-Side Comparison Table */}
      <Panel
        title="Side-by-Side Traverse Metrics Comparison"
        icon={<Clock size={15} className="text-primary" />}
        className="mb-6"
      >
        <div className="table-scroll">
          <table className="mission-table">
            <thead>
              <tr>
                <th>METRIC</th>
                <th className="text-primary">ROUTE A (DIRECT)</th>
                <th className="text-route-b">ROUTE B (COMM-AWARE)</th>
                <th>OPERATIONAL IMPACT</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Terrain Safety Status</td>
                <td className={rA.safe ? "text-success" : "text-destructive"}>
                  {rA.safe ? "✓ COMPLIANT" : "✗ EXCEEDS LIMIT"}
                </td>
                <td className={rB.safe ? "text-success" : "text-destructive"}>
                  {rB.safe ? "✓ COMPLIANT" : "✗ EXCEEDS LIMIT"}
                </td>
                <td className="text-muted-foreground">Hard constraint (Max slope ≤ {m.settings.maxSlopeDeg}°)</td>
              </tr>
              <tr>
                <td>Total Traverse Distance</td>
                <td className="telemetry">{distance(rA.metrics?.distanceM ?? 0)}</td>
                <td className="telemetry">{distance(rB.metrics?.distanceM ?? 0)}</td>
                <td className="text-muted-foreground">
                  {rA.metrics && rB.metrics
                    ? rB.metrics.distanceM > rA.metrics.distanceM
                      ? `Route B is ${distance(rB.metrics.distanceM - rA.metrics.distanceM)} longer`
                      : `Route A is ${distance(rA.metrics.distanceM - rB.metrics.distanceM)} longer`
                    : "—"}
                </td>
              </tr>
              <tr>
                <td>Estimated Travel Time</td>
                <td className="telemetry">{duration(rA.metrics?.travelTimeS ?? 0)}</td>
                <td className="telemetry">{duration(rB.metrics?.travelTimeS ?? 0)}</td>
                <td className="text-muted-foreground">At nominal speed {m.settings.roverSpeedMps.toFixed(1)} m/s</td>
              </tr>
              <tr>
                <td>Maximum Slope</td>
                <td className="telemetry">{rA.metrics?.maxSlopeDeg.toFixed(1)}°</td>
                <td className="telemetry">{rB.metrics?.maxSlopeDeg.toFixed(1)}°</td>
                <td className="text-muted-foreground">Wheel traction and rollover safety threshold</td>
              </tr>
              <tr>
                <td>Mean Slope & Difficulty</td>
                <td className="telemetry">{rA.metrics?.meanSlopeDeg.toFixed(1)}° ({rA.metrics?.difficulty})</td>
                <td className="telemetry">{rB.metrics?.meanSlopeDeg.toFixed(1)}° ({rB.metrics?.difficulty})</td>
                <td className="text-muted-foreground">Terrain ruggedness along path</td>
              </tr>
              <tr>
                <td>Estimated Energy Consumption</td>
                <td className="telemetry">{rA.metrics?.energyWh.toFixed(1)} Wh</td>
                <td className="telemetry">{rB.metrics?.energyWh.toFixed(1)} Wh</td>
                <td className="text-muted-foreground">0.08 Wh/m driven + 1.2 Wh/m elevation gain</td>
              </tr>
              <tr>
                <td>Communication Availability</td>
                <td className="telemetry font-semibold">{rA.prediction?.availabilityPct.toFixed(1)}%</td>
                <td className="telemetry font-semibold text-success">{rB.prediction?.availabilityPct.toFixed(1)}%</td>
                <td className="text-muted-foreground">Percentage of route with geometric line of sight</td>
              </tr>
              <tr>
                <td>Predicted Blackout Count</td>
                <td className="telemetry text-warning">{rA.prediction?.blackouts.length ?? 0} blackout(s)</td>
                <td className="telemetry text-success">{rB.prediction?.blackouts.length ?? 0} blackout(s)</td>
                <td className="text-muted-foreground">Discrete terrain occlusion zones</td>
              </tr>
              <tr>
                <td>Total Blackout Duration</td>
                <td className="telemetry text-destructive">{duration(rA.prediction?.totalBlackoutS ?? 0)}</td>
                <td className="telemetry text-success">{duration(rB.prediction?.totalBlackoutS ?? 0)}</td>
                <td className="text-muted-foreground">Cumulative outage requiring local data buffering</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
