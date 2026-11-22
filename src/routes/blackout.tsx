import { createFileRoute } from "@tanstack/react-router";
import { Radio, AlertTriangle, Crosshair, Timer, Satellite, ShieldAlert } from "lucide-react";
import { useMission } from "@/state/mission";
import { CrossSection } from "@/components/mission/cross-section";
import { Panel, PageTitle, Stat, SimControls, LinkAlert, Row } from "@/components/mission/panels";
import { distance, duration, pageHead } from "@/components/mission/format";
import { toMetres } from "@/engine/terrain";

export const Route = createFileRoute("/blackout")({
  head: () => pageHead("Blackout Prediction", "Geometric line-of-sight analysis and outage interval estimation"),
  component: BlackoutPrediction,
});

function BlackoutPrediction() {
  const m = useMission();
  const route = m.route;
  const blackouts = route.prediction?.blackouts ?? [];
  const pos = toMetres(m.terrain, m.rover);

  return (
    <>
      <PageTitle
        title="Blackout Prediction Engine"
        description="Geometric line-of-sight ray tracing, obstruction detection, and advance outage prediction"
        action={<SimControls />}
      />

      <LinkAlert />

      <div className="stat-grid">
        <Stat
          label="CURRENT LINK STATE"
          value={m.los.status === "CLEAR" ? "CLEAR" : "BLOCKED"}
          detail={m.los.status === "CLEAR" ? "Geometric LOS uninterrupted" : "Terrain ridge occultation"}
          icon={<Radio size={16} />}
          tone={m.los.status === "CLEAR" ? "text-success" : "text-destructive"}
        />
        <Stat
          label="TIME UNTIL BLACKOUT"
          value={duration(m.untilS)}
          detail={m.untilM !== null ? `${distance(m.untilM)} traverse distance` : "No upcoming outage"}
          icon={<Timer size={16} />}
          tone="text-warning"
        />
        <Stat
          label="ESTIMATED DURATION"
          value={m.blackout ? duration(m.blackout.durationS) : "0s"}
          detail={m.blackout ? (m.blackout.reconnects ? "Reconnection predicted" : "No reconnection on route") : "Clear traverse"}
          icon={<AlertTriangle size={16} />}
        />
        <Stat
          label="ROUTE AVAILABILITY"
          value={`${route.prediction?.availabilityPct.toFixed(1) ?? 100}%`}
          detail={`Route ${m.selected} total comm uptime`}
          icon={<Satellite size={16} />}
          tone="text-primary"
        />
      </div>

      {/* Line of Sight Cross-Section Panel */}
      <Panel
        title="Geometric Line-of-Sight Cross-Section"
        icon={<Crosshair size={15} className="text-primary" />}
        action={
          <div className="flex items-center gap-3">
            <span className="section-label text-[9px]">
              ANTENNAS: ROVER {m.settings.roverAntennaM}m · RELAY {m.settings.endpointAntennaM}m
            </span>
            <span className={`telemetry text-[10px] font-semibold ${m.los.status === "CLEAR" ? "text-success" : "text-destructive"}`}>
              {m.los.status}
            </span>
          </div>
        }
        className="mb-6"
      >
        <div className="p-4">
          <CrossSection />
        </div>
        <div className="px-4 pb-3 flex flex-wrap justify-between items-center text-[10px] text-muted-foreground telemetry border-t border-border/50 pt-2">
          <span>Distance to Relay: {distance(m.los.distanceM)}</span>
          <span>Minimum Clearance: {m.los.minClearanceM.toFixed(1)} m</span>
          <span>Obstruction Samples: {m.los.obstructions.length}</span>
          <span>Rover Antenna: {m.settings.roverAntennaM} m above surface</span>
          <span>Relay Antenna: {m.settings.endpointAntennaM} m above surface</span>
        </div>
      </Panel>

      {/* Traverse Timeline & Interval Details */}
      <div className="dashboard-grid mb-6">
        <Panel
          title="Predicted Traverse Timeline & Outage Intervals"
          icon={<Timer size={15} className="text-primary" />}
        >
          <div className="p-4">
            <div className="text-xs text-muted-foreground mb-3">
              Traverse Distance: 0 m → {distance(route.metrics?.distanceM ?? 0)}
            </div>

            {/* Visual Route Timeline Bar */}
            <div className="relative w-full h-8 bg-secondary rounded overflow-hidden flex border border-border">
              {route.prediction?.samples.map((s, i) => (
                <div
                  key={i}
                  className={`flex-1 h-full ${s.clear ? "bg-success/40" : "bg-destructive/80"}`}
                  title={`${distance(s.d)}: ${s.clear ? "CLEAR" : "BLOCKED"}`}
                />
              ))}
              {/* Rover Progress Pin */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-primary z-10 shadow-[0_0_8px_var(--primary)]"
                style={{
                  left: `${Math.min(100, Math.max(0, (m.sim.progressM / (route.metrics?.distanceM || 1)) * 100))}%`,
                }}
              />
            </div>

            <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-2 telemetry">
              <span>Start (0 m)</span>
              <span>Rover Position: {distance(m.sim.progressM)} ({((m.sim.progressM / (route.metrics?.distanceM || 1)) * 100).toFixed(0)}%)</span>
              <span>End ({distance(route.metrics?.distanceM ?? 0)})</span>
            </div>

            <div className="flex items-center gap-5 mt-4 text-[10px] telemetry">
              <span className="flex items-center gap-1.5"><span className="size-2.5 bg-success/60 rounded-xs inline-block" /> Comm Available</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 bg-destructive rounded-xs inline-block" /> Outage / Blackout Zone</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 bg-primary rounded-xs inline-block" /> Current Rover Position</span>
            </div>
          </div>
        </Panel>

        <Panel
          title="Rover Kinematics"
          icon={<Satellite size={15} className="text-primary" />}
        >
          <div className="px-4 py-2">
            <Row label="Rover Coordinates" value={`(${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}) m`} />
            <Row label="Traverse Speed" value={`${m.settings.roverSpeedMps.toFixed(2)} m/s`} />
            <Row label="Warning Lead Threshold" value={`${m.settings.warningS} s (${distance(m.settings.warningS * m.settings.roverSpeedMps)})`} />
            <Row label="Upcoming Blackout Start" value={m.blackout ? distance(m.blackout.startM) : "None"} />
            <Row label="Predicted Reconnection" value={m.blackout?.reconnects ? distance(m.blackout.endM) : "None"} />
            <Row label="Total Outage Time" value={duration(route.prediction?.totalBlackoutS ?? 0)} />
          </div>
        </Panel>
      </div>

      {/* Discrete Blackout Table */}
      <Panel
        title="Predicted Blackout Intervals"
        icon={<ShieldAlert size={15} className="text-primary" />}
      >
        <div className="table-scroll">
          <table className="mission-table">
            <thead>
              <tr>
                <th>ZONE</th>
                <th>START DISTANCE</th>
                <th>RECONNECTION POINT</th>
                <th>ZONE LENGTH</th>
                <th>ESTIMATED DURATION</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {blackouts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-muted-foreground text-xs italic">
                    No terrain obstructions predicted on Route {m.selected}. Line-of-sight remains clear throughout the entire traverse.
                  </td>
                </tr>
              ) : (
                blackouts.map((b) => {
                  const isCurrent = m.sim.progressM >= b.startM && m.sim.progressM <= b.endM;
                  const isPassed = m.sim.progressM > b.endM;
                  return (
                    <tr key={b.index}>
                      <td className="font-semibold telemetry text-primary">ZONE 0{b.index + 1}</td>
                      <td className="telemetry">{distance(b.startM)}</td>
                      <td className="telemetry">{b.reconnects ? distance(b.endM) : "Traverse End (No Reconnect)"}</td>
                      <td className="telemetry">{distance(b.lengthM)}</td>
                      <td className="telemetry text-warning">{duration(b.durationS)}</td>
                      <td>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                          isCurrent
                            ? "bg-destructive/20 text-destructive border border-destructive/40"
                            : isPassed
                            ? "bg-muted text-muted-foreground"
                            : "bg-warning/20 text-warning border border-warning/40"
                        }`}>
                          {isCurrent ? "ACTIVE BLACKOUT" : isPassed ? "PASSED" : "UPCOMING"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
