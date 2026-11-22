import { createFileRoute, Link } from "@tanstack/react-router";
import { FlaskConical, Radio, AlertTriangle, Database, CheckCircle2, ArrowRight, Play, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMissionStore, useMission, type DemoId } from "@/state/mission";
import { Panel, PageTitle, Stat, LinkAlert } from "@/components/mission/panels";
import { TerrainMap } from "@/components/mission/terrain-map";
import { CrossSection } from "@/components/mission/cross-section";
import { distance, duration, bytes, pageHead } from "@/components/mission/format";
import { queueKB } from "@/engine/queue";

export const Route = createFileRoute("/demo")({
  head: () => pageHead("Demo Scenarios", "Deterministic evaluation scenarios for hackathon judges"),
  component: DemoMode,
});

interface ScenarioDetail {
  id: DemoId;
  index: string;
  title: string;
  tagline: string;
  description: string;
  expectedState: string;
  expectedTone: string;
  icon: typeof Radio;
  steps: string[];
}

const scenarios: ScenarioDetail[] = [
  {
    id: "normal",
    index: "01",
    title: "Scenario 1 — Normal Communication",
    tagline: "Nominal traverse across plain with unobstructed line of sight",
    description: "The rover moves along Route B through relatively flat terrain. Geometric line-of-sight to Relay 01 remains completely clear. Downlink transmission proceeds nominally without buffering.",
    expectedState: "CLEAR · LINK NOMINAL",
    expectedTone: "text-success border-success/30 bg-success/5",
    icon: Radio,
    steps: [
      "Selects Route B (comm-aware path bypassing the crater)",
      "Geometric line-of-sight remains above terrain elevations",
      "Green nominal status indicator active",
      "Telemetry packets transmit and acknowledge with zero latency queue buildup",
    ],
  },
  {
    id: "approaching",
    index: "02",
    title: "Scenario 2 — Approaching a Crater",
    tagline: "Advance warning detection ~60 seconds before impending obstruction",
    description: "The rover proceeds along Route A toward the elevated crater rim. The prediction engine looks ahead along the trajectory, detects an upcoming geometric obstruction, and generates an amber advance warning.",
    expectedState: "WARNING · BLACKOUT APPROACHING",
    expectedTone: "text-warning border-warning/30 bg-warning/5",
    icon: AlertTriangle,
    steps: [
      "Rover positioned 60 seconds prior to crater ridge occultation",
      "System detects ray intersection at crater rim (+80m elevation)",
      "Amber banner: 'COMMUNICATION BLACKOUT APPROACHING'",
      "Displays countdown until blackout, predicted duration, and reconnection coordinates",
    ],
  },
  {
    id: "blackout",
    index: "03",
    title: "Scenario 3 — Communication Blackout",
    tagline: "Complete line-of-sight blockage & store-and-forward local buffering",
    description: "The rover traverses behind the crater rim. Geometric line-of-sight is obstructed by the terrain profile. Downlink is instantly suspended, and local buffering is activated to protect mission telemetry.",
    expectedState: "BLOCKED · LOCAL BUFFER ACTIVE",
    expectedTone: "text-destructive border-destructive/30 bg-destructive/5",
    icon: Database,
    steps: [
      "Rover enters terrain shadow zone; line-of-sight ray turns red",
      "Red alert: 'COMMUNICATION LOST — LOCAL DATA BUFFER ACTIVE'",
      "Simulated transmission halts immediately; 0 bytes leaked",
      "Multi-priority queue buffers emergency (P1), health (P1), nav (P2), science (P3), image (P4)",
    ],
  },
  {
    id: "restoration",
    index: "04",
    title: "Scenario 4 — Communication Restoration",
    tagline: "Line-of-sight cleared & strict priority-based queue transmission",
    description: "The rover emerges past the crater rim. Geometric clearance is re-established. Downlink resumes immediately, dispatching Critical Priority 1 packets first before lower priorities.",
    expectedState: "RESTORED · TRANSMITTING PRIORITY",
    expectedTone: "text-success border-success/30 bg-success/5",
    icon: CheckCircle2,
    steps: [
      "Rover reaches reconnection coordinate; LOS status transitions to CLEAR",
      "Green alert: 'COMMUNICATION RESTORED — DATA TRANSMISSION RESUMED'",
      "Priority-based dequeue: Emergency alerts & Rover health transmit first",
      "Full simulated acknowledgement with zero packet loss across outage",
    ],
  },
];

function DemoMode() {
  const m = useMission();
  const demo = useMissionStore((s) => s.demo);
  const toggle = useMissionStore((s) => s.toggle);

  const activeDemoId: DemoId =
    m.los.status === "BLOCKED"
      ? "blackout"
      : m.sim.restored
      ? "restoration"
      : m.warning
      ? "approaching"
      : "normal";

  return (
    <>
      <PageTitle
        title="Hackathon Judge Demonstration Suite"
        description="Four deterministic, one-click evaluation scenarios testing the complete ARTEMIS mission loop"
      />

      <LinkAlert />

      {/* Scenario Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
        {scenarios.map((s) => {
          const Icon = s.icon;
          const isActive = activeDemoId === s.id;
          return (
            <div
              key={s.id}
              className={`p-5 rounded border transition-all flex flex-col justify-between ${
                isActive ? "border-primary bg-primary/10 shadow-lg" : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="telemetry text-xs text-primary font-bold">SCENARIO {s.index}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono border ${s.expectedTone}`}>
                    {s.expectedState}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-1">
                  <Icon size={18} className="text-primary" /> {s.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                  {s.description}
                </p>

                <div className="border-t border-border/60 pt-2.5 mb-4">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1.5">Verification Criteria:</div>
                  <ul className="text-[11px] text-foreground/80 space-y-1 list-disc list-inside">
                    {s.steps.map((st, i) => (
                      <li key={i}>{st}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <Button
                  className="flex-1 text-xs"
                  variant={isActive ? "default" : "outline"}
                  onClick={() => demo(s.id)}
                >
                  <Play size={13} className="mr-1.5" /> Execute Scenario {s.index}
                </Button>
                <Button asChild variant="ghost" size="sm" className="text-xs">
                  <Link to="/">
                    <Eye size={13} className="mr-1" /> View Dashboard
                  </Link>
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Active Inspection Panel */}
      <div className="dashboard-grid mb-6">
        <Panel
          title="Active Scenario Elevation Geometry & Ray"
          icon={<Radio size={15} className="text-primary" />}
          action={
            <span className={`telemetry text-[10px] font-semibold ${m.los.status === "CLEAR" ? "text-success" : "text-destructive"}`}>
              STATUS: {m.los.status}
            </span>
          }
        >
          <div className="p-4">
            <CrossSection />
          </div>
          <div className="p-4 border-t border-border flex justify-between items-center text-xs">
            <span className="telemetry text-muted-foreground">
              Traverse Progress: {distance(m.sim.progressM)} · Buffered: {bytes(queueKB(m.sim.queue))}
            </span>
            <Button size="sm" onClick={toggle} className="text-xs h-7">
              {m.sim.running ? "Pause Simulation" : "Step / Run Simulation"}
            </Button>
          </div>
        </Panel>

        <Panel
          title="Deterministic Scenario State"
          icon={<FlaskConical size={15} className="text-primary" />}
        >
          <div className="p-4 space-y-3">
            <div className="text-xs text-muted-foreground">
              Each scenario seeds identical coordinates and telemetry so results are 100% reproducible for evaluation judges.
            </div>
            <div className="border border-border rounded p-3 bg-secondary/30 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Selected Route:</span>
                <span className="telemetry font-bold">Route {m.selected}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Line of Sight:</span>
                <span className={`telemetry font-bold ${m.los.status === "CLEAR" ? "text-success" : "text-destructive"}`}>
                  {m.los.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Advance Warning:</span>
                <span className={`telemetry font-bold ${m.warning ? "text-warning" : "text-muted-foreground"}`}>
                  {m.warning ? "ACTIVE (AMBER)" : "INACTIVE"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Queue Buffer:</span>
                <span className="telemetry font-bold">{m.sim.queue.length} packets</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivered Packets:</span>
                <span className="telemetry font-bold text-success">{m.sim.deliveredCount} packets</span>
              </div>
            </div>

            <Button asChild className="w-full text-xs mt-2" variant="outline">
              <Link to="/">
                Return to Full Mission Dashboard <ArrowRight size={13} className="ml-1" />
              </Link>
            </Button>
          </div>
        </Panel>
      </div>
    </>
  );
}
