import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  buildings,
  rooms,
  roomBookings,
  moveRequests,
  facilityRequests,
  eq,
  and,
  desc,
  sql,
} from "@nexusops/db";

export const facilitiesRouter = router({
  buildings: router({
    list: permissionProcedure("facilities", "read")
      .input(z.object({ status: z.string().optional(), limit: z.coerce.number().default(50) }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(buildings.orgId, org!.id)];
        if (input.status) conditions.push(eq(buildings.status, input.status as any));
        return db.select().from(buildings).where(and(...conditions))
          .orderBy(buildings.name).limit(input.limit);
      }),

    get: permissionProcedure("facilities", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [building] = await db.select().from(buildings)
          .where(and(eq(buildings.id, input.id), eq(buildings.orgId, org!.id)));
        if (!building) throw new TRPCError({ code: "NOT_FOUND" });
        return building;
      }),

    create: permissionProcedure("facilities", "write")
      .input(z.object({
        name: z.string().min(1),
        address: z.string().optional(),
        floors: z.coerce.number().default(1),
        capacity: z.coerce.number().optional(),
        amenities: z.array(z.string()).default([]),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [building] = await db.insert(buildings).values({
          orgId: org!.id,
          ...input,
        }).returning();
        return building;
      }),
  }),

  rooms: router({
    list: permissionProcedure("facilities", "read")
      .input(z.object({ buildingId: z.string().uuid().optional(), limit: z.coerce.number().default(100) }))
      .query(async ({ ctx, input }) => {
        const { db } = ctx;
        const conditions = [];
        if (input.buildingId) conditions.push(eq(rooms.buildingId, input.buildingId));
        const query = conditions.length > 0
          ? db.select().from(rooms).where(and(...conditions)).limit(input.limit)
          : db.select().from(rooms).limit(input.limit);
        return query;
      }),

    checkAvailability: permissionProcedure("facilities", "read")
      .input(z.object({
        roomId: z.string().uuid(),
        startTime: z.string(),
        endTime: z.string(),
        excludeBookingId: z.string().uuid().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const { db } = ctx;
        const start = new Date(input.startTime);
        const end = new Date(input.endTime);
        const conflicts = await db.select().from(roomBookings)
          .where(and(
            eq(roomBookings.roomId, input.roomId),
            eq(roomBookings.status, "confirmed"),
            sql`${roomBookings.startTime} < ${end} AND ${roomBookings.endTime} > ${start}`,
          ));
        const filtered = input.excludeBookingId
          ? conflicts.filter((b: any) => b.id !== input.excludeBookingId)
          : conflicts;
        return { available: filtered.length === 0, conflicts: filtered };
      }),
  }),

  bookings: router({
    list: permissionProcedure("facilities", "read")
      .input(z.object({ roomId: z.string().uuid().optional(), limit: z.coerce.number().default(50) }))
      .query(async ({ ctx, input }) => {
        const { db } = ctx;
        const conditions = [];
        if (input.roomId) conditions.push(eq(roomBookings.roomId, input.roomId));
        const query = conditions.length > 0
          ? db.select().from(roomBookings).where(and(...conditions)).orderBy(desc(roomBookings.startTime)).limit(input.limit)
          : db.select().from(roomBookings).orderBy(desc(roomBookings.startTime)).limit(input.limit);
        return query;
      }),

    create: permissionProcedure("facilities", "write")
      .input(z.object({
        roomId: z.string().uuid(),
        title: z.string().optional(),
        startTime: z.string(),
        endTime: z.string(),
        attendeeCount: z.coerce.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db } = ctx;
        const start = new Date(input.startTime);
        const end = new Date(input.endTime);

        const conflicts = await db.select().from(roomBookings)
          .where(and(
            eq(roomBookings.roomId, input.roomId),
            eq(roomBookings.status, "confirmed"),
            sql`${roomBookings.startTime} < ${end} AND ${roomBookings.endTime} > ${start}`,
          ));

        if (conflicts.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "Room is not available for the selected time" });
        }

        const [booking] = await db.insert(roomBookings).values({
          roomId: input.roomId,
          bookedById: ctx.user!.id,
          title: input.title,
          startTime: start,
          endTime: end,
          attendeeCount: input.attendeeCount,
        }).returning();
        return booking;
      }),
  }),

  moveRequests: router({
    list: permissionProcedure("facilities", "read")
      .input(z.object({ status: z.string().optional(), limit: z.coerce.number().default(50) }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(moveRequests.orgId, org!.id)];
        if (input.status) conditions.push(eq(moveRequests.status, input.status as any));
        return db.select().from(moveRequests).where(and(...conditions))
          .orderBy(desc(moveRequests.createdAt)).limit(input.limit);
      }),

    create: permissionProcedure("facilities", "write")
      .input(z.object({
        fromLocation: z.string().optional(),
        toLocation: z.string().min(1),
        moveDate: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [req] = await db.insert(moveRequests).values({
          orgId: org!.id,
          requesterId: ctx.user!.id,
          fromLocation: input.fromLocation,
          toLocation: input.toLocation,
          moveDate: input.moveDate ? new Date(input.moveDate) : undefined,
          notes: input.notes,
        }).returning();
        return req;
      }),
  }),

  facilityRequests: router({
    list: permissionProcedure("facilities", "read")
      .input(z.object({ status: z.string().optional(), type: z.string().optional(), limit: z.coerce.number().default(50) }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(facilityRequests.orgId, org!.id)];
        if (input.status) conditions.push(eq(facilityRequests.status, input.status as any));
        if (input.type) conditions.push(eq(facilityRequests.type, input.type as any));
        return db.select().from(facilityRequests).where(and(...conditions))
          .orderBy(desc(facilityRequests.createdAt)).limit(input.limit);
      }),

    create: permissionProcedure("facilities", "write")
      .input(z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(["maintenance", "cleaning", "catering", "parking", "access", "other"]).default("maintenance"),
        location: z.string().optional(),
        priority: z.string().default("medium"),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [req] = await db.insert(facilityRequests).values({
          orgId: org!.id,
          requesterId: ctx.user!.id,
          ...input,
        }).returning();
        return req;
      }),
  }),
});
