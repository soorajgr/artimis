import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/mission/dashboard";
import { pageHead } from "@/components/mission/format";

export const Route = createFileRoute("/")({
  head: () => pageHead("Mission Dashboard", "Lunar south pole traverse operations and communication monitoring"),
  component: Dashboard,
});
