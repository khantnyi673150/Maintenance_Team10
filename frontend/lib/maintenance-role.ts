export type MaintenanceRole = "reporter" | "staff" | "admin";
export type MaintenanceCategory = "Plumbing" | "Electrical" | "HVAC" | "Safety";
export type WorkspaceSelection = MaintenanceCategory | "Manual Review";

export const maintenanceCategories: { value: MaintenanceCategory; description: string }[] = [
  { value: "Plumbing", description: "Water supply, pipes, drainage" },
  { value: "Electrical", description: "Lighting, power, electrical systems" },
  { value: "HVAC", description: "Air conditioning and ventilation" },
  { value: "Safety", description: "Hazards and safety-related issues" },
];

export const workspaceSelections: { value: WorkspaceSelection; description: string }[] = [
  ...maintenanceCategories,
  { value: "Manual Review", description: "Admin classification queue" },
];

// UI routing uses the same administrator-controlled claim as the API.
// The backend still verifies authorization on every protected request.
export function maintenanceRole(user: { app_metadata?: Record<string, unknown> } | null | undefined): MaintenanceRole | null {
  const role = user?.app_metadata?.role;
  return role === "reporter" || role === "staff" || role === "admin" ? role : null;
}
