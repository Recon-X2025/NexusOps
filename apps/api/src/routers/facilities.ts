import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  buildings,
  rooms,
  roomBookings,
  moveRequests,
  facilityRequests,
  buildingStatusEnum,
  moveRequestStatusEnum,
  facilityRequestStatusEnum,
  facilityRequestTypeEnum,
  facilitySpaces,
  facilitySpaceStatusEnum,
  users,
  eq,
  and,
  desc,
  asc,
  sql,
  count,
} from "@coheronconnect/db";

export const facilitiesRouter = router({
  hubSnapshot: permissionProcedure("facilities", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const [roomCountRow] = await db
      .select({ roomCount: count() })
      .from(rooms)
      .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
      .where(eq(buildings.orgId, org!.id));
    return { roomCount: Number(roomCountRow?.roomCount ?? 0) };
  }),

  spaces: router({
    list: permissionProcedure("facilities", "read")
      .input(z.object({ limit: z.coerce.number().default(100) }).optional())
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        return db.select().from(facilitySpaces).where(eq(facilitySpaces.orgId, org!.id))
          .orderBy(facilitySpaces.createdAt).limit(input?.limit ?? 100);
      }),
    
    create: permissionProcedure("facilities", "write")
      .input(z.object({
        spaceId: z.string().min(1),
        name: z.string().min(1),
        building: z.string().optional(),
        floor: z.string().optional(),
        type: z.string().optional(),
        area: z.string().optional(),
        capacity: z.coerce.number().optional(),
        assignedTo: z.string().optional(),
        occupancy: z.string().optional(),
        status: z.enum(facilitySpaceStatusEnum.enumValues).default("acquired"),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [space] = await db.insert(facilitySpaces).values({
          orgId: org!.id,
          ...input,
        }).returning();
        return space;
      }),
  }),

  buildings: router({
    list: permissionProcedure("facilities", "read")
      .input(z.object({ status: z.enum(buildingStatusEnum.enumValues).optional(), limit: z.coerce.number().default(50) }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(buildings.orgId, org!.id)];
        if (input.status) conditions.push(eq(buildings.status, input.status));
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
          ? db.select().from(rooms).where(and(...conditions)).orderBy(asc(rooms.name)).limit(input.limit)
          : db.select().from(rooms).orderBy(asc(rooms.name)).limit(input.limit);
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
          ? conflicts.filter((b) => b.id !== input.excludeBookingId)
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
        
        const query = db
          .select({
            id: roomBookings.id,
            roomId: roomBookings.roomId,
            title: roomBookings.title,
            startTime: roomBookings.startTime,
            endTime: roomBookings.endTime,
            attendeeCount: roomBookings.attendeeCount,
            status: roomBookings.status,
            createdAt: roomBookings.createdAt,
            spaceName: facilitySpaces.name,
            spaceBuilding: facilitySpaces.building,
          })
          .from(roomBookings)
          .leftJoin(facilitySpaces, eq(roomBookings.roomId, facilitySpaces.id))
          .orderBy(desc(roomBookings.startTime))
          .limit(input.limit);

        if (conditions.length > 0) {
          query.where(and(...conditions));
        }

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
            sql`${roomBookings.startTime} < ${end.toISOString()} AND ${roomBookings.endTime} > ${start.toISOString()}`,
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
      .input(z.object({ status: z.enum(moveRequestStatusEnum.enumValues).optional(), limit: z.coerce.number().default(50) }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(moveRequests.orgId, org!.id)];
        if (input.status) conditions.push(eq(moveRequests.status, input.status));
        const query = db
          .select({
            id: moveRequests.id,
            fromLocation: moveRequests.fromLocation,
            toLocation: moveRequests.toLocation,
            notes: moveRequests.notes,
            moveDate: moveRequests.moveDate,
            status: moveRequests.status,
            createdAt: moveRequests.createdAt,
            requesterName: users.name,
          })
          .from(moveRequests)
          .leftJoin(users, eq(moveRequests.requesterId, users.id))
          .where(and(...conditions))
          .orderBy(desc(moveRequests.createdAt))
          .limit(input.limit);
        return query;
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
      .input(z.object({ status: z.enum(facilityRequestStatusEnum.enumValues).optional(), type: z.enum(facilityRequestTypeEnum.enumValues).optional(), limit: z.coerce.number().default(50) }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(facilityRequests.orgId, org!.id)];
        if (input.status) conditions.push(eq(facilityRequests.status, input.status));
        if (input.type) conditions.push(eq(facilityRequests.type, input.type));
        
        const query = db
          .select({
            id: facilityRequests.id,
            type: facilityRequests.type,
            title: facilityRequests.title,
            description: facilityRequests.description,
            status: facilityRequests.status,
            createdAt: facilityRequests.createdAt,
            requesterId: facilityRequests.requesterId,
            spaceId: facilityRequests.spaceId,
            building: facilitySpaces.building,
            floor: facilitySpaces.floor,
            spaceName: facilitySpaces.name,
            submittedBy: users.name,
          })
          .from(facilityRequests)
          .leftJoin(facilitySpaces, eq(facilityRequests.spaceId, facilitySpaces.id))
          .leftJoin(users, eq(facilityRequests.requesterId, users.id))
          .where(and(...conditions))
          .orderBy(desc(facilityRequests.createdAt))
          .limit(input.limit);

        return query;
      }),

    create: permissionProcedure("facilities", "write")
      .input(z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(["maintenance", "cleaning", "catering", "parking", "access", "other"]).default("maintenance"),
        spaceId: z.string().uuid().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [req] = await db.insert(facilityRequests).values({
          orgId: org!.id,
          requesterId: ctx.user!.id,
          type: input.type,
          title: input.title,
          description: input.description,
          spaceId: input.spaceId,
        }).returning();
        return req;
      }),
  }),
});
