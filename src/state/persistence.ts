import { get, set, del } from "idb-keyval";
import type { Terrain } from "@/engine/terrain";
import type { SimulationSettings, SimulationState } from "@/engine/simulation";
import type { RouteId } from "@/engine/routes";

export const MISSION_STORAGE_KEY = "artemis-mission-v2";

export interface MissionSnapshot {
  version: 2;
  savedAt: number;
  terrain: Terrain;
  settings: SimulationSettings;
  selected: RouteId;
  sim: SimulationState;
}

export function isValidSnapshot(data: unknown): data is MissionSnapshot {
  if (!data || typeof data !== "object") return false;
  const d = data as Partial<MissionSnapshot>;
  if (d.version !== 2) return false;

  // Validate terrain
  if (!d.terrain || typeof d.terrain !== "object") return false;
  const t = d.terrain;
  if (typeof t.width !== "number" || typeof t.height !== "number" || typeof t.resolutionM !== "number") return false;
  if (!Array.isArray(t.elevation) || t.elevation.length !== t.width * t.height) return false;
  if (t.source !== "synthetic" && t.source !== "uploaded-dem") return false;

  // Validate settings
  if (!d.settings || typeof d.settings !== "object") return false;
  const s = d.settings;
  if (
    typeof s.roverSpeedMps !== "number" ||
    typeof s.maxSlopeDeg !== "number" ||
    typeof s.capacityKB !== "number" ||
    typeof s.roverAntennaM !== "number" ||
    typeof s.endpointAntennaM !== "number"
  ) {
    return false;
  }

  // Validate simulation state
  if (!d.sim || typeof d.sim !== "object") return false;
  const sim = d.sim;
  if (
    typeof sim.timeS !== "number" ||
    typeof sim.progressM !== "number" ||
    !Array.isArray(sim.queue) ||
    typeof sim.seq !== "number" ||
    typeof sim.generatedKB !== "number" ||
    typeof sim.deliveredKB !== "number"
  ) {
    return false;
  }

  // Validate selected route
  if (d.selected !== "A" && d.selected !== "B") return false;

  return true;
}

// In-memory fallback for SSR and non-browser test runs
const memoryStore = new Map<string, unknown>();

export async function saveMissionState(snapshot: MissionSnapshot): Promise<boolean> {
  try {
    if (typeof window !== "undefined" && typeof window.indexedDB !== "undefined") {
      await set(MISSION_STORAGE_KEY, snapshot);
    } else {
      memoryStore.set(MISSION_STORAGE_KEY, snapshot);
    }
    return true;
  } catch (err) {
    console.warn("Failed to persist ARTEMIS mission state to IndexedDB:", err);
    return false;
  }
}

export async function loadMissionState(): Promise<MissionSnapshot | null> {
  try {
    let data: unknown;
    if (typeof window !== "undefined" && typeof window.indexedDB !== "undefined") {
      data = await get(MISSION_STORAGE_KEY);
    } else {
      data = memoryStore.get(MISSION_STORAGE_KEY);
    }
    if (isValidSnapshot(data)) {
      return data;
    }
    return null;
  } catch (err) {
    console.warn("Failed to load ARTEMIS mission state from IndexedDB:", err);
    return null;
  }
}

export async function clearMissionState(): Promise<boolean> {
  try {
    if (typeof window !== "undefined" && typeof window.indexedDB !== "undefined") {
      await del(MISSION_STORAGE_KEY);
    } else {
      memoryStore.delete(MISSION_STORAGE_KEY);
    }
    return true;
  } catch (err) {
    console.warn("Failed to clear ARTEMIS mission state from IndexedDB:", err);
    return false;
  }
}
