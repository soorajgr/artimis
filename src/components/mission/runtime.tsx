import { useEffect } from 'react';
import { useMissionStore } from '@/state/mission';
import { buildRoute } from '@/engine/routes';
import { loadMissionState, saveMissionState, type MissionSnapshot } from '@/state/persistence';

export function MissionRuntime() {
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    let lastSavedTime = 0;

    loadMissionState()
      .then((snapshot) => {
        if (!active) return;
        if (snapshot) {
          const { terrain, settings, selected, sim } = snapshot;
          useMissionStore.setState({
            terrain,
            settings,
            selected,
            sim: { ...sim, running: false },
            routes: {
              A: buildRoute(terrain, 'A', settings),
              B: buildRoute(terrain, 'B', settings),
            },
          });
        }
        useMissionStore.setState({ hydrated: true });
      })
      .catch(() => {
        if (active) useMissionStore.setState({ hydrated: true });
      });

    unsubscribe = useMissionStore.subscribe((s) => {
      if (!s.hydrated) return;
      const now = Date.now();
      // Throttle rapid simulation ticks to once every 2 seconds; save immediately on pause or settings change
      if (!s.sim.running || now - lastSavedTime > 2000) {
        lastSavedTime = now;
        const snapshot: MissionSnapshot = {
          version: 2,
          savedAt: now,
          terrain: s.terrain,
          settings: s.settings,
          selected: s.selected,
          sim: s.sim,
        };
        saveMissionState(snapshot);
      }
    });

    const timer = window.setInterval(() => {
      const s = useMissionStore.getState();
      s.tick(s.settings.simSpeed * 0.25);
    }, 250);

    return () => {
      active = false;
      unsubscribe();
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
