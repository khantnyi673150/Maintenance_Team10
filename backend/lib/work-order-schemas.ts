import { z } from "zod";

export const createWorkOrderSchema = z.object({
  location_id: z.string().uuid(),
  description: z.string().trim().min(1),
  category_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
});

export const updateWorkOrderSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).optional(),
  location_id: z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one editable field is required",
});

export const assignWorkOrderSchema = z.object({
  staff_id: z.string().uuid(),
});

export const resolveWorkOrderSchema = z.object({
  resolution_notes: z.string().trim().min(1),
});

export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;
export type AssignWorkOrderInput = z.infer<typeof assignWorkOrderSchema>;
export type ResolveWorkOrderInput = z.infer<typeof resolveWorkOrderSchema>;
