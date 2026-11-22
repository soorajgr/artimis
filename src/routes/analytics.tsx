import { createFileRoute } from "@tanstack/react-router";
import { ChartNoAxesCombined, Download, Terminal, Database, Clock, Zap, FileSpreadsheet } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { useMission } from "@/state/mission";
import { Panel, PageTitle, Stat, EventLog, SimControls } from "@/components/mission/panels";
import { bytes, clock, distance, duration, pageHead } from "@/components/mission/format";

export const Route = createFileRoute("/analytics")({
  head: () => pageHead("Analytics & Reports", "Simulation telemetry analytics, event logs, and CSV export"),
  component: Analytics,
});

function Analytics() {
  const m = useMission();

  // Prepare data for Availability & Buffer History Chart
  const historyData = m.sim.history.map((h) => ({
    time: clock(h.time),
    availability: Number(h.availability.toFixed(1)),
    bufferedKB: Math.round(h.bufferedKB),
    deliveredKB: Math.round(h.deliveredKB),
  }));

  // Route Comparison Data for Bar Charts
  const routeComparisonData = [
    {
      name: "Route A (Direct)",
      distanceKm: Number(((m.routes.A.metrics?.distanceM ?? 0) / 1000).toFixed(2)),
      energyWh: Number((m.routes.A.metrics?.energyWh ?? 0).toFixed(1)),
      blackoutMin: Number(((m.routes.A.prediction?.totalBlackoutS ?? 0) / 60).toFixed(1)),
      availability: Number((m.routes.A.prediction?.availabilityPct ?? 0).toFixed(1)),
    },
    {
      name: "Route B (Comm-Aware)",
      distanceKm: Number(((m.routes.B.metrics?.distanceM ?? 0) / 1000).toFixed(2)),
      energyWh: Number((m.routes.B.metrics?.energyWh ?? 0).toFixed(1)),
      blackoutMin: Number(((m.routes.B.prediction?.totalBlackoutS ?? 0) / 60).toFixed(1)),
      availability: Number((m.routes.B.prediction?.availabilityPct ?? 0).toFixed(1)),
    },
  ];

  const handleExportCSV = () => {
    const rows = [
      ["ARTEMIS Mission Simulation Report", ""],
      ["Generated At", new Date().toISOString()],
      ["Active Route", m.selected],
      ["Traverse Progress (m)", m.sim.progressM.toFixed(1)],
      ["Mission Elapsed Time (s)", m.sim.timeS.toFixed(1)],
      ["Delivered Telemetry (KB)", m.sim.deliveredKB.toFixed(1)],
      ["Interrupted / Retried Telemetry (KB)", (m.sim.wastedKB ?? 0).toFixed(1)],
      ["Delivered Packets", m.sim.deliveredCount.toString()],
      ["Currently Buffered (KB)", m.sim.queue.reduce((acc, i) => acc + i.sizeKB, 0).toFixed(1)],
      [],
      ["--- SIMULATION HISTORY ---", "", "", "", ""],
      ["Time (s)", "Availability (%)", "Buffered (KB)", "Delivered (KB)", "Interrupted (KB)"],
      ...m.sim.history.map((h) => [
        h.time.toFixed(1),
        h.availability.toFixed(2),
        h.bufferedKB.toFixed(1),
        h.deliveredKB.toFixed(1),
        (h.wastedKB ?? 0).toFixed(1),
      ]),
      [],
      ["--- MISSION EVENT LOG ---", "", ""],
      ["MET Time (s)", "Level", "Message"],
      ...m.sim.events.map((e) => [e.time.toFixed(1), e.level.toUpperCase(), `"${e.msg}"`]),
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `artemis-mission-report-met${Math.round(m.sim.timeS)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <PageTitle
        title="Analytics & Telemetry Reports"
        description="Historical communication telemetry, queue performance metrics, and mission log export"
        action={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleExportCSV} className="text-xs">
              <Download size={14} className="mr-1.5" /> Export Mission Report (CSV)
            </Button>
            <SimControls />
          </div>
        }
      />

      <div className="stat-grid">
        <Stat
          label="COMMUNICATION UPTIME"
          value={`${m.sim.timeS > 0 ? ((m.sim.clearSeconds / m.sim.timeS) * 100).toFixed(1) : "100"}%`}
          detail={`${duration(m.sim.clearSeconds)} clear of ${duration(m.sim.timeS)} elapsed`}
          icon={<Clock size={16} />}
          tone="text-primary"
        />
        <Stat
          label="TOTAL GENERATED"
          value={bytes(m.sim.generatedKB)}
          detail={`${m.sim.seq} mission data packets created`}
          icon={<Database size={16} />}
        />
        <Stat
          label="DOWNLINK EFFICIENCY"
          value={`${m.sim.generatedKB > 0 ? ((m.sim.deliveredKB / m.sim.generatedKB) * 100).toFixed(1) : "0"}%`}
          detail={`${bytes(m.sim.deliveredKB)} confirmed delivered`}
          icon={<Zap size={16} />}
          tone="text-success"
        />
        <Stat
          label="RECORDED EVENTS"
          value={`${m.sim.events.length}`}
          detail="Mission state transitions logged"
          icon={<Terminal size={16} />}
        />
      </div>

      {/* Telemetry History Charts */}
      <div className="dashboard-grid mb-6">
        <Panel
          title="Communication Availability Over Time (%)"
          icon={<ChartNoAxesCombined size={15} className="text-primary" />}
        >
          <div className="p-4 h-[320px]">
            {historyData.length < 2 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
                Traverse simulation history will render as the mission progresses.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyData}>
                  <defs>
                    <linearGradient id="availGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                  <XAxis dataKey="time" stroke="var(--muted-foreground)" fontSize={10} />
                  <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={10} unit="%" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      fontSize: "11px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="availability"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#availGrad)"
                    name="Availability %"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel
          title="Buffered vs Delivered Telemetry (KB)"
          icon={<Database size={15} className="text-primary" />}
        >
          <div className="p-4 h-[320px]">
            {historyData.length < 2 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
                Data continuity metrics will render as data packets transmit.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                  <XAxis dataKey="time" stroke="var(--muted-foreground)" fontSize={10} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={10} unit=" KB" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      fontSize: "11px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "10px" }} />
                  <Line
                    type="monotone"
                    dataKey="deliveredKB"
                    stroke="var(--success)"
                    strokeWidth={2}
                    dot={false}
                    name="Delivered (KB)"
                  />
                  <Line
                    type="monotone"
                    dataKey="bufferedKB"
                    stroke="var(--warning)"
                    strokeWidth={2}
                    dot={false}
                    name="Buffered (KB)"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>
      </div>

      {/* Route Distance & Energy Comparison Bars */}
      <div className="dashboard-grid mb-6">
        <Panel
          title="Traverse Distance & Energy Comparison"
          icon={<Zap size={15} className="text-primary" />}
        >
          <div className="p-4 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={routeComparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                    fontSize: "11px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "10px" }} />
                <Bar dataKey="distanceKm" fill="var(--primary)" name="Distance (km)" />
                <Bar dataKey="energyWh" fill="var(--warning)" name="Energy (Wh)" />
                <Bar dataKey="blackoutMin" fill="var(--destructive)" name="Blackout (min)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="Mission Event Stream"
          icon={<Terminal size={15} className="text-primary" />}
          action={<span className="section-label text-[9px]">ACTIVE TELEMETRY LOG</span>}
        >
          <EventLog limit={12} />
        </Panel>
      </div>
    </>
  );
}
