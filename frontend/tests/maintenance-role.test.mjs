import { test } from "node:test";
import assert from "node:assert/strict";
import { assignedStaffCategory, maintenanceRole } from "../lib/maintenance-role.ts";

test("uses the category configured by an administrator", () => {
  assert.equal(assignedStaffCategory({ app_metadata: { role: "staff", maintenance_category: "Plumbing", category: "Safety" } }), "Plumbing");
  assert.equal(assignedStaffCategory({ app_metadata: { role: "staff", category: "Electrical" } }), "Electrical");
  assert.equal(maintenanceRole({ app_metadata: { role: "admin" } }), "admin");
});

test("rejects unassigned, self-selected and reviewer categories for staff", () => {
  assert.equal(assignedStaffCategory({ app_metadata: { role: "staff" }, user_metadata: { maintenance_category: "Safety" } }), null);
  assert.equal(assignedStaffCategory({ app_metadata: { role: "staff", maintenance_category: "Manual Review" } }), null);
  assert.equal(assignedStaffCategory({ app_metadata: { role: "staff", maintenance_categories: ["Safety"] } }), null);
  assert.equal(assignedStaffCategory({ app_metadata: { role: "admin", maintenance_category: "Safety" } }), null);
});
