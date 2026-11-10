export type MaintenanceRole = "reporter" | "staff" | "admin";
export type MaintenanceCategory = "Plumbing" | "Electrical" | "HVAC" | "Safety";
type AccountMetadata = { app_metadata?: Record<string, unknown> };

export const maintenanceCategories: { value: MaintenanceCategory; description: string }[] = [
  { value: "Plumbing", description: "Water supply, pipes, drainage" },
  { value: "Electrical", description: "Lighting, power, electrical systems" },
  { value: "HVAC", description: "Air conditioning and ventilation" },
  { value: "Safety", description: "Hazards and safety-related issues" },
];

// UI routing uses the same administrator-controlled claim as the API.
// The backend still verifies authorization on every protected request.
export function maintenanceRole(user: AccountMetadata | null | undefined): MaintenanceRole | null {
  const role = user?.app_metadata?.role;
  return role === "reporter" || role === "staff" || role === "admin" ? role : null;
}

export function assignedStaffCategory(user: AccountMetadata): MaintenanceCategory | null {
  if (maintenanceRole(user) !== "staff") return null;
  const assigned = user.app_metadata?.maintenance_category ?? user.app_metadata?.category;
  return maintenanceCategories.find(({ value }) => value === assigned)?.value ?? null;
}
