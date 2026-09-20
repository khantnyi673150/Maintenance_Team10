import type { WorkOrderStatus } from "@/lib/types";

const transitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  OPEN: ["ASSIGNED"],
  ASSIGNED: ["IN_PROGRESS"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
};

export function isAllowedTransition(
  from: WorkOrderStatus,
  to: WorkOrderStatus,
): boolean {
  return transitions[from].includes(to);
}
