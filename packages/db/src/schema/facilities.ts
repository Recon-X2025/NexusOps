import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

export const buildingStatusEnum = pgEnum("building_status", ["active", "maintenance", "closed"]);
export const bookingStatusEnum = pgEnum("booking_status", ["confirmed", "cancelled"]);
export const moveRequestStatusEnum = pgEnum("move_request_status", [
  "requested", "approved", "scheduled", "completed", "cancelled",
]);
export const facilityRequestTypeEnum = pgEnum("facility_request_type", [
  "maintenance", "cleaning", "catering", "parking", "access", "other",
]);
export const facilityRequestStatusEnum = pgEnum("facility_request_status", [
  "new", "assigned", "in_progress", "completed", "cancelled",
]);

// ── Buildings ──────────────────────────────────────────────────────────────
export const buildings = pgTable(
  "buildings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    floors: integer("floors").default(1),
    capacity: integer("capacity"),
    status: buildingStatusEnum("status").notNull().default("active"),
    amenities: jsonb("amenities").$type<string[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("buildings_org_idx").on(t.orgId) }),
);

// ── Rooms ──────────────────────────────────────────────────────────────────
export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id").notNull().references(() => buildings.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    floor: integer("floor").default(1),
    capacity: integer("capacity"),
    equipment: jsonb("equipment").$type<string[]>().default([]),
    bookable: boolean("bookable").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ buildingIdx: index("rooms_building_idx").on(t.buildingId) }),
);

// ── Room Bookings ──────────────────────────────────────────────────────────
export const roomBookings = pgTable(
  "room_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    bookedById: uuid("booked_by_id").notNull().references(() => users.id),
    title: text("title"),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    attendeeCount: integer("attendee_count"),
    status: bookingStatusEnum("status").notNull().default("confirmed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    roomIdx: index("room_bookings_room_idx").on(t.roomId),
    timeIdx: index("room_bookings_time_idx").on(t.startTime, t.endTime),
  }),
);

// ── Move Requests ──────────────────────────────────────────────────────────
export const moveRequests = pgTable(
  "move_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    requesterId: uuid("requester_id").notNull().references(() => users.id),
    fromLocation: text("from_location"),
    toLocation: text("to_location").notNull(),
    status: moveRequestStatusEnum("status").notNull().default("requested"),
    moveDate: timestamp("move_date", { withTimezone: true }),
    approvedById: uuid("approved_by_id").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("move_requests_org_idx").on(t.orgId) }),
);

// ── Facility Requests ──────────────────────────────────────────────────────
export const facilityRequests = pgTable(
  "facility_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    requesterId: uuid("requester_id").notNull().references(() => users.id),
    type: facilityRequestTypeEnum("type").notNull().default("maintenance"),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    priority: text("priority").notNull().default("medium"),
    status: facilityRequestStatusEnum("status").notNull().default("new"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("facility_requests_org_idx").on(t.orgId),
    statusIdx: index("facility_requests_status_idx").on(t.orgId, t.status),
  }),
);

export const buildingsRelations = relations(buildings, ({ one, many }) => ({
  org: one(organizations, { fields: [buildings.orgId], references: [organizations.id] }),
  rooms: many(rooms),
}));
