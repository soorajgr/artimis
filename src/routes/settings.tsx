import { createFileRoute } from "@tanstack/react-router";
import { Settings as SettingsIcon, RotateCcw, Save, ShieldAlert, Radio, HardDrive, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMissionStore, defaultSettings } from "@/state/mission";
import { Panel, PageTitle, Stat } from "@/components/mission/panels";
import { pageHead } from "@/components/mission/format";

export const Route = createFileRoute("/settings")({
  head: () => pageHead("Settings", "Configure simulation parameters, antenna heights, and safety thresholds"),
  component: SettingsView,
});

function SettingsView() {
  const settings = useMissionStore((s) => s.settings);
  const setSettings = useMissionStore((s) => s.setSettings);

  const handleReset = () => {
    setSettings(defaultSettings);
  };

  return (
    <>
      <PageTitle
        title="Simulation Parameters & Calibration"
        description="Configure antenna geometry, safety thresholds, kinematics, and store-and-forward constraints"
        action={
          <Button variant="outline" size="sm" onClick={handleReset} className="text-xs">
            <RotateCcw size={14} className="mr-1.5" /> Reset to Baseline Defaults
          </Button>
        }
      />

      <div className="stat-grid">
        <Stat
          label="ROVER ANTENNA"
          value={`${settings.roverAntennaM} m`}
          detail="Height above local terrain"
          icon={<Radio size={16} />}
        />
        <Stat
          label="RELAY ANTENNA"
          value={`${settings.endpointAntennaM} m`}
          detail="Relay mast elevation"
          icon={<Radio size={16} />}
          tone="text-primary"
        />
        <Stat
          label="MAX SLOPE SAFETY"
          value={`${settings.maxSlopeDeg}°`}
          detail="Hard traverse safety limit"
          icon={<ShieldAlert size={16} />}
          tone="text-warning"
        />
        <Stat
          label="DOWNLINK RATE"
          value={`${settings.txRateKBps} KB/s`}
          detail={`Storage: ${(settings.capacityKB / 1024).toFixed(0)} MB`}
          icon={<HardDrive size={16} />}
        />
      </div>

      <div className="dashboard-grid mb-6">
        <Panel
          title="Antenna & Communication Geometry"
          icon={<Radio size={15} className="text-primary" />}
        >
          <div className="p-4 form-grid">
            <div className="field">
              <label>Rover Antenna Height (m)</label>
              <input
                type="number"
                min="0.5"
                max="15"
                step="0.5"
                value={settings.roverAntennaM}
                onChange={(e) => setSettings({ roverAntennaM: Number(e.target.value) })}
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">
                Standard lunar rover antenna mast height (e.g. VIPER is ~2.5m).
              </span>
            </div>

            <div className="field">
              <label>Endpoint / Relay Antenna Height (m)</label>
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                value={settings.endpointAntennaM}
                onChange={(e) => setSettings({ endpointAntennaM: Number(e.target.value) })}
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">
                Base station / lunar lander mast height.
              </span>
            </div>

            <div className="field">
              <label>Relay Position X (Cell Index)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.endpoint.x}
                onChange={(e) =>
                  setSettings({ endpoint: { ...settings.endpoint, x: Number(e.target.value) } })
                }
              />
            </div>

            <div className="field">
              <label>Relay Position Y (Cell Index)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.endpoint.y}
                onChange={(e) =>
                  setSettings({ endpoint: { ...settings.endpoint, y: Number(e.target.value) } })
                }
              />
            </div>
          </div>
        </Panel>

        <Panel
          title="Rover Kinematics & Safety"
          icon={<Gauge size={15} className="text-primary" />}
        >
          <div className="p-4 flex flex-col gap-4">
            <div className="field">
              <label>Traverse Speed (m/s)</label>
              <input
                type="number"
                min="0.1"
                max="5.0"
                step="0.1"
                value={settings.roverSpeedMps}
                onChange={(e) => setSettings({ roverSpeedMps: Number(e.target.value) })}
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">
                Typical lunar exploration speed: 0.1 to 1.0 m/s.
              </span>
            </div>

            <div className="field">
              <label>Max Permitted Terrain Slope (degrees)</label>
              <input
                type="number"
                min="5"
                max="45"
                step="1"
                value={settings.maxSlopeDeg}
                onChange={(e) => setSettings({ maxSlopeDeg: Number(e.target.value) })}
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">
                Hard safety limit. Routes exceeding this slope are tagged UNSAFE.
              </span>
            </div>

            <div className="field">
              <label>Advance Warning Threshold (seconds)</label>
              <input
                type="number"
                min="10"
                max="600"
                step="10"
                value={settings.warningS}
                onChange={(e) => setSettings({ warningS: Number(e.target.value) })}
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">
                Lead time to alert operators before entering predicted blackout.
              </span>
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title="Store-and-Forward Buffer & Simulation Timing"
        icon={<HardDrive size={15} className="text-primary" />}
        className="mb-6"
      >
        <div className="p-4 form-grid">
          <div className="field">
            <label>Data Transmission Rate (KB/s)</label>
            <input
              type="number"
              min="1"
              max="1024"
              step="4"
              value={settings.txRateKBps}
              onChange={(e) => setSettings({ txRateKBps: Number(e.target.value) })}
            />
            <span className="text-[10px] text-muted-foreground mt-1 block">
              Simulated RF downlink throughput during clear line-of-sight.
            </span>
          </div>

          <div className="field">
            <label>Local Buffer Storage Capacity (KB)</label>
            <input
              type="number"
              min="1024"
              max="262144"
              step="1024"
              value={settings.capacityKB}
              onChange={(e) => setSettings({ capacityKB: Number(e.target.value) })}
            />
            <span className="text-[10px] text-muted-foreground mt-1 block">
              Onboard solid-state buffer storage size ({Math.round(settings.capacityKB / 1024)} MB).
            </span>
          </div>

          <div className="field">
            <label>Simulation Clock Speed Multiplier</label>
            <select
              value={settings.simSpeed}
              onChange={(e) => setSettings({ simSpeed: Number(e.target.value) })}
            >
              {[1, 5, 10, 20, 50, 100].map((v) => (
                <option key={v} value={v}>
                  {v}× Real-time
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Alternative Route Comm Loss Penalty Weight</label>
            <input
              type="number"
              min="1"
              max="10"
              step="0.5"
              value={settings.commPenalty}
              onChange={(e) => setSettings({ commPenalty: Number(e.target.value) })}
            />
            <span className="text-[10px] text-muted-foreground mt-1 block">
              A* cost multiplier for blocked cells when planning Route B.
            </span>
          </div>
        </div>
      </Panel>
    </>
  );
}
