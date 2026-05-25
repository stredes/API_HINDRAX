import { z } from "zod";

const optionalText = z.string().trim().optional();
const optionalTextOrNumber = z.union([z.string().trim(), z.coerce.number()]).optional();
const timestamp = z.coerce.number().int().nonnegative().optional();

export const taskSchema = z.object({
  id: z.string().trim().min(1).optional(),
  deviceId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: optionalText,
  status: z.string().trim().min(1).default("open"),
  type: optionalText,
  scheduledTime: timestamp,
  locationName: optionalText,
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  quantity: z.coerce.number().nonnegative().optional(),
  unit: optionalText,
  inventoryItemId: optionalTextOrNumber,
  assignedPeerId: optionalText,
  checklist: z.array(z.unknown()).optional(),
  deleted: z.boolean().optional(),
  updatedAt: timestamp
});

export const inventorySchema = z.object({
  id: z.string().trim().min(1).optional(),
  deviceId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  sku: optionalText,
  category: optionalText,
  quantity: z.coerce.number().default(0),
  unit: optionalText,
  minQuantity: z.coerce.number().nonnegative().optional(),
  deleted: z.boolean().optional(),
  updatedAt: timestamp
});

export const deviceSchema = z.object({
  deviceId: z.string().trim().min(1),
  nickname: optionalText,
  appVersion: optionalText,
  publicAddress: optionalText,
  updatedAt: timestamp
});

export const chatMessageSchema = z.object({
  id: z.string().trim().min(1).optional(),
  deviceId: z.string().trim().min(1),
  peerId: z.string().trim().min(1),
  message: z.string(),
  isFromMe: z.boolean().default(true),
  status: optionalText,
  timestamp: timestamp,
  updatedAt: timestamp
});

export const syncSchema = z.object({
  items: z.array(z.record(z.unknown())).default([])
});

export const bootstrapSchema = z.object({
  device: z.record(z.unknown()).optional(),
  tasks: z.array(z.record(z.unknown())).default([]),
  inventory: z.array(z.record(z.unknown())).default([])
});

export const adminResetSchema = z.object({
  rootKey: z.string().trim().min(1),
  confirm: z.literal("RESET_FIREBASE")
});

export const adminDeleteDeviceSchema = z.object({
  rootKey: z.string().trim().min(1),
  deviceId: z.string().trim().min(1)
});

export function parseUpdatedAfter(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}
