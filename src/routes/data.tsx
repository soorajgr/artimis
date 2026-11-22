import { createFileRoute } from "@tanstack/react-router";
import { Database, PlusCircle, Radio, HardDrive, CheckCircle2, ShieldAlert, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMissionStore, useMission } from "@/state/mission";
import { queueKB, DATA_TYPES, PRIORITY_LABEL, type DataType, type Priority } from "@/engine/queue";
import { Panel, PageTitle, Stat, SimControls, LinkAlert, Row } from "@/components/mission/panels";
import { bytes, clock, pageHead } from "@/components/mission/format";

export const Route = createFileRoute("/data")({
  head: () => pageHead("Data Continuity", "Store-and-Forward priority queue and local buffer management"),
  component: DataContinuity,
});

function DataContinuity() {
  const m = useMission();
  const generate = useMissionStore((s) => s.generate);
  const setAuto = useMissionStore((s) => s.setAuto);

  const bufferedKB = queueKB(m.sim.queue);
  const capacityPct = (bufferedKB / m.settings.capacityKB) * 100;
  const isBlocked = m.los.status === "BLOCKED";

  const priorityColor = (p: Priority) => {
    switch (p) {
      case 1:
        return "text-destructive border-destructive/40 bg-destructive/10";
      case 2:
        return "text-warning border-warning/40 bg-warning/10";
      case 3:
        return "text-primary border-primary/40 bg-primary/10";
      case 4:
        return "text-muted-foreground border-border bg-secondary/50";
    }
  };

  return (
    <>
      <PageTitle
        title="Data Continuity & Store-and-Forward Buffer"
        description="4-tier priority queue with local storage buffering and automatic resumption upon link restoration"
        action={<SimControls />}
      />

      <LinkAlert />

      <div className="stat-grid">
        <Stat
          label="BUFFER UTILIZATION"
          value={bytes(bufferedKB)}
          detail={`${capacityPct.toFixed(1)}% of ${bytes(m.settings.capacityKB)} capacity`}
          icon={<HardDrive size={16} />}
          tone={capacityPct > 80 ? "text-destructive" : capacityPct > 50 ? "text-warning" : "text-primary"}
        />
        <Stat
          label="QUEUED PACKETS"
          value={`${m.sim.queue.length}`}
          detail={`${m.sim.queue.filter((i) => i.priority === 1).length} critical P1 items`}
          icon={<Database size={16} />}
        />
        <Stat
          label="TRANSMISSION STATE"
          value={isBlocked ? "BUFFERING" : "TRANSMITTING"}
          detail={isBlocked ? "Link blocked · Storage active" : `Downlink active @ ${m.settings.txRateKBps} KB/s`}
          icon={<Radio size={16} />}
          tone={isBlocked ? "text-destructive" : "text-success"}
        />
        <Stat
          label="DELIVERED & ACKED"
          value={`${m.sim.deliveredCount}`}
          detail={`${bytes(m.sim.deliveredKB)} total telemetry received`}
          icon={<CheckCircle2 size={16} />}
          tone="text-success"
        />
      </div>

      <div className="dashboard-grid mb-6">
        {/* Manual Data Packet Generator */}
        <Panel
          title="Mission Telemetry Generator"
          icon={<PlusCircle size={15} className="text-primary" />}
          action={
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Auto-generate during traverse:</span>
              <Button
                variant={m.sim.autoGenerate ? "default" : "outline"}
                size="sm"
                className="h-6 text-[11px]"
                onClick={() => setAuto(!m.sim.autoGenerate)}
              >
                {m.sim.autoGenerate ? "Enabled" : "Disabled"}
              </Button>
            </div>
          }
        >
          <div className="p-4">
            <p className="text-xs text-muted-foreground mb-4">
              Simulate generation of rover instruments and sensors. Packets are queued locally in browser IndexedDB according to mission priority:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {(Object.keys(DATA_TYPES) as DataType[]).map((type) => {
                const spec = DATA_TYPES[type];
                return (
                  <div
                    key={type}
                    className="border border-border rounded p-3 bg-secondary/20 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-medium text-xs text-foreground">{spec.label}</span>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded border font-mono ${priorityColor(spec.priority)}`}>
                          P{spec.priority} · {PRIORITY_LABEL[spec.priority]}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground telemetry mt-1">
                        Size: {spec.minKB}–{spec.maxKB} KB
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 w-full text-xs h-7"
                      onClick={() => generate(type)}
                    >
                      <Sparkles size={12} className="mr-1 text-primary" /> Generate {type.toUpperCase()}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>

        {/* Priority Hierarchy & Downlink Stats */}
        <Panel
          title="Priority Hierarchy"
          icon={<ShieldAlert size={15} className="text-primary" />}
        >
          <div className="px-4 py-2">
            <Row
              label="Priority 1: Critical"
              value={`${m.sim.queue.filter((i) => i.priority === 1).length} packets (${bytes(queueKB(m.sim.queue.filter((i) => i.priority === 1)))})`}
              tone="text-destructive font-semibold"
            />
            <Row
              label="Priority 2: High"
              value={`${m.sim.queue.filter((i) => i.priority === 2).length} packets (${bytes(queueKB(m.sim.queue.filter((i) => i.priority === 2)))})`}
              tone="text-warning"
            />
            <Row
              label="Priority 3: Medium"
              value={`${m.sim.queue.filter((i) => i.priority === 3).length} packets (${bytes(queueKB(m.sim.queue.filter((i) => i.priority === 3)))})`}
              tone="text-primary"
            />
            <Row
              label="Priority 4: Low"
              value={`${m.sim.queue.filter((i) => i.priority === 4).length} packets (${bytes(queueKB(m.sim.queue.filter((i) => i.priority === 4)))})`}
              tone="text-muted-foreground"
            />
            <Row label="Storage Capacity" value={bytes(m.settings.capacityKB)} />
            <Row label="Downlink Bandwidth" value={`${m.settings.txRateKBps} KB/s`} />
          </div>
          <div className="p-4 border-t border-border text-[10px] text-muted-foreground leading-relaxed">
            <strong>Rule:</strong> Packets are strictly dequeued in Priority 1 → Priority 4 order, with FIFO within the same priority tier. Unacknowledged packets are retried automatically.
          </div>
        </Panel>
      </div>

      {/* Real-time Buffered Packet Queue Table */}
      <Panel
        title="Local Transmission Buffer Queue"
        icon={<HardDrive size={15} className="text-primary" />}
        action={
          <span className="section-label text-[9px] telemetry">
            {m.sim.queue.length} PACKETS ENQUEUED
          </span>
        }
      >
        <div className="table-scroll">
          <table className="mission-table">
            <thead>
              <tr>
                <th>PACKET ID</th>
                <th>DATA TYPE</th>
                <th>PRIORITY</th>
                <th>SIZE</th>
                <th>PROGRESS</th>
                <th>ATTEMPTS</th>
                <th>CREATED (MET)</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {m.sim.queue.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-muted-foreground text-xs italic">
                    Buffer queue is empty. Generate telemetry manually or start the traverse simulation.
                  </td>
                </tr>
              ) : (
                m.sim.queue.map((item) => (
                  <tr key={item.id}>
                    <td className="font-semibold telemetry text-primary">{item.id}</td>
                    <td>{DATA_TYPES[item.type]?.label ?? item.type}</td>
                    <td>
                      <span className={`text-[10px] px-2 py-0.5 rounded border font-mono ${priorityColor(item.priority)}`}>
                        P{item.priority} · {PRIORITY_LABEL[item.priority]}
                      </span>
                    </td>
                    <td className="telemetry">{bytes(item.sizeKB)}</td>
                    <td className="telemetry">
                      {item.sentKB > 0 ? `${bytes(item.sentKB)} (${((item.sentKB / item.sizeKB) * 100).toFixed(0)}%)` : "0%"}
                    </td>
                    <td className="telemetry">{item.attempts}</td>
                    <td className="telemetry">{clock(item.createdAt)}</td>
                    <td>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                        item.status === "transmitting"
                          ? "bg-success/20 text-success border border-success/40 animate-pulse"
                          : item.status === "awaiting-ack"
                          ? "bg-primary/20 text-primary border border-primary/40"
                          : item.status === "retry"
                          ? "bg-warning/20 text-warning border border-warning/40"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {item.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
