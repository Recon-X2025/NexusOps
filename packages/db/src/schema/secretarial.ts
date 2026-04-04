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
import { organizations, users } from "./auth";

// ── Enums ──────────────────────────────────────────────────────────────────────

export const meetingTypeEnum = pgEnum("board_meeting_type", [
  "board", "audit_committee", "nomination_committee", "compensation_committee", "agm", "egm", "creditors",
]);

export const meetingStatusEnum = pgEnum("board_meeting_status", [
  "scheduled", "in_progress", "completed", "cancelled", "adjourned",
]);

export const resolutionTypeEnum = pgEnum("board_resolution_type", [
  "ordinary", "special", "board", "circular",
]);

export const resolutionStatusEnum = pgEnum("board_resolution_status", [
  "draft", "passed", "rejected", "withdrawn",
]);

export const filingStatusEnum = pgEnum("secretarial_filing_status", [
  "upcoming", "in_progress", "filed", "overdue", "not_applicable",
]);

export const shareClassEnum = pgEnum("share_class", [
  "equity", "preference", "esop_pool", "convertible",
]);

export const esopEventEnum = pgEnum("esop_event", [
  "grant", "vest", "exercise", "lapse", "cancel",
]);

// ── Tables ──────────────────────────────────────────────────────────────────────

export const boardMeetings = pgTable("board_meetings", {
  id:           uuid("id").primaryKey().defaultRandom(),
  orgId:        uuid("org_id").notNull().references(() => organizations.id),
  number:       text("number").notNull(),       // BM-2024-001
  type:         meetingTypeEnum("type").notNull().default("board"),
  status:       meetingStatusEnum("status").notNull().default("scheduled"),
  title:        text("title").notNull(),
  scheduledAt:  timestamp("scheduled_at").notNull(),
  duration:     integer("duration_mins").default(120),
  venue:        text("venue"),
  videoLink:    text("video_link"),
  agenda:       jsonb("agenda").default([]),       // [{item, presenter, duration}]
  attendees:    jsonb("attendees").default([]),     // [{userId, role, attended}]
  quorumMet:    boolean("quorum_met"),
  minutesUrl:   text("minutes_url"),
  minutesDraft: text("minutes_draft"),
  chairperson:  uuid("chairperson_id").references(() => users.id),
  createdBy:    uuid("created_by").references(() => users.id),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  orgIdx:    index("board_meeting_org_idx").on(t.orgId),
  statusIdx: index("board_meeting_status_idx").on(t.orgId, t.status),
}));

export const boardResolutions = pgTable("board_resolutions", {
  id:          uuid("id").primaryKey().defaultRandom(),
  orgId:       uuid("org_id").notNull().references(() => organizations.id),
  meetingId:   uuid("meeting_id").references(() => boardMeetings.id),
  number:      text("number").notNull(),        // BR-2024-045
  type:        resolutionTypeEnum("type").notNull().default("board"),
  status:      resolutionStatusEnum("status").notNull().default("draft"),
  title:       text("title").notNull(),
  body:        text("body").notNull(),
  passedAt:    timestamp("passed_at"),
  votesFor:    integer("votes_for").default(0),
  votesAgainst: integer("votes_against").default(0),
  abstentions: integer("abstentions").default(0),
  attachment:  text("attachment_url"),
  tags:        text("tags").array().default([]),
  createdBy:   uuid("created_by").references(() => users.id),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("resolution_org_idx").on(t.orgId),
}));

export const secretarialFilings = pgTable("secretarial_filings", {
  id:         uuid("id").primaryKey().defaultRandom(),
  orgId:      uuid("org_id").notNull().references(() => organizations.id),
  formNumber: text("form_number").notNull(), // MGT-7, AOC-4, DIR-3 KYC
  title:      text("title").notNull(),
  authority:  text("authority").notNull(),   // MCA, ROC, SEBI, RBI
  category:   text("category").notNull(),    // annual_return, financial_statement, director_kyc
  status:     filingStatusEnum("status").notNull().default("upcoming"),
  dueDate:    timestamp("due_date").notNull(),
  filedAt:    timestamp("filed_at"),
  srn:        text("srn"),                   // Service Request Number from MCA
  fees:       integer("fees"),
  penaltyPaid: integer("penalty_paid").default(0),
  notes:      text("notes"),
  attachmentUrl: text("attachment_url"),
  assignedTo: uuid("assigned_to").references(() => users.id),
  fy:         text("fy"),                    // 2024-25
  createdAt:  timestamp("created_at").notNull().defaultNow(),
  updatedAt:  timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  orgIdx:   index("filing_org_idx").on(t.orgId),
  dueDateIdx: index("filing_due_date_idx").on(t.orgId, t.dueDate),
}));

export const shareCapital = pgTable("share_capital", {
  id:           uuid("id").primaryKey().defaultRandom(),
  orgId:        uuid("org_id").notNull().references(() => organizations.id),
  folio:        text("folio").notNull(),         // SH-001
  holderName:   text("holder_name").notNull(),
  holderType:   text("holder_type").default("individual"), // individual, institution, promoter
  shareClass:   shareClassEnum("share_class").notNull().default("equity"),
  nominalValue: integer("nominal_value").notNull().default(10), // Rs.10
  quantity:     integer("quantity").notNull(),
  paidUpValue:  integer("paid_up_value"),
  pan:          text("pan"),
  dematAccount: text("demat_account"),
  address:      text("address"),
  notes:        text("notes"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("share_capital_org_idx").on(t.orgId),
}));

export const esopGrants = pgTable("esop_grants", {
  id:            uuid("id").primaryKey().defaultRandom(),
  orgId:         uuid("org_id").notNull().references(() => organizations.id),
  grantNumber:   text("grant_number").notNull(),
  employeeId:    uuid("employee_id").references(() => users.id),
  employeeName:  text("employee_name").notNull(),
  event:         esopEventEnum("event").notNull().default("grant"),
  options:       integer("options").notNull(),
  exercisePrice: integer("exercise_price").notNull(), // paise
  grantDate:     timestamp("grant_date").notNull(),
  vestingStart:  timestamp("vesting_start"),
  vestingEnd:    timestamp("vesting_end"),
  vestingSchedule: jsonb("vesting_schedule").default([]), // [{date, qty, cliff}]
  exerciseWindow: timestamp("exercise_window"),
  notes:         text("notes"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("esop_grant_org_idx").on(t.orgId),
}));

export const companyDirectors = pgTable("company_directors", {
  id:          uuid("id").primaryKey().defaultRandom(),
  orgId:       uuid("org_id").notNull().references(() => organizations.id),
  name:        text("name").notNull(),
  din:         text("din").notNull(), // Director Identification Number
  designation: text("designation").notNull(), // Managing Director, Independent Director
  category:    text("category").default("non_executive"), // executive, non_executive, independent
  dob:         timestamp("dob"),
  pan:         text("pan"),
  email:       text("email"),
  phone:       text("phone"),
  appointedAt: timestamp("appointed_at"),
  resignedAt:  timestamp("resigned_at"),
  isActive:    boolean("is_active").notNull().default(true),
  kyc:         text("kyc_status").default("pending"), // pending, filed, expired
  kycDueDate:  timestamp("kyc_due_date"),
  address:     text("address"),
  notes:       text("notes"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("director_org_idx").on(t.orgId),
}));
