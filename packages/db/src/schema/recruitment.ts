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

export const jobStatusEnum = pgEnum("job_status", [
  "draft", "open", "on_hold", "closed", "cancelled",
]);

export const jobTypeEnum = pgEnum("job_type", [
  "full_time", "part_time", "contract", "internship", "freelance",
]);

export const jobLevelEnum = pgEnum("job_level", [
  "intern", "junior", "mid", "senior", "lead", "manager", "director", "vp", "c_level",
]);

export const candidateStageEnum = pgEnum("candidate_stage", [
  "applied", "screening", "phone_screen", "technical", "panel", "hr_round", "offer", "hired", "rejected", "withdrawn",
]);

export const interviewTypeEnum = pgEnum("interview_type", [
  "phone", "video", "onsite", "technical", "case_study", "hr",
]);

export const interviewStatusEnum = pgEnum("interview_status", [
  "scheduled", "completed", "cancelled", "no_show",
]);

export const offerStatusEnum = pgEnum("offer_status", [
  "draft", "sent", "accepted", "declined", "expired", "revoked",
]);

export const candidateSourceEnum = pgEnum("candidate_source", [
  "linkedin", "naukri", "indeed", "referral", "agency", "website", "campus", "internal", "other",
]);

// ── Tables ──────────────────────────────────────────────────────────────────────

export const jobRequisitions = pgTable("job_requisitions", {
  id:              uuid("id").primaryKey().defaultRandom(),
  orgId:           uuid("org_id").notNull().references(() => organizations.id),
  number:          text("number").notNull(), // REQ-001
  title:           text("title").notNull(),
  department:      text("department").notNull(),
  location:        text("location"),
  workMode:        text("work_mode"), // remote, hybrid, onsite
  type:            jobTypeEnum("type").notNull().default("full_time"),
  level:           jobLevelEnum("level").notNull().default("mid"),
  status:          jobStatusEnum("status").notNull().default("draft"),
  openings:        integer("openings").notNull().default(1),
  filled:          integer("filled").notNull().default(0),
  description:     text("description"),
  requirements:    text("requirements"),
  niceToHave:      text("nice_to_have"),
  salaryMin:       integer("salary_min"),
  salaryMax:       integer("salary_max"),
  currency:        text("currency").default("INR"),
  budgetCode:      text("budget_code"),
  hiringManagerId: uuid("hiring_manager_id").references(() => users.id),
  recruiterId:     uuid("recruiter_id").references(() => users.id),
  approverId:      uuid("approver_id").references(() => users.id),
  approvedAt:      timestamp("approved_at"),
  targetDate:      timestamp("target_date"),
  closedAt:        timestamp("closed_at"),
  createdBy:       uuid("created_by").references(() => users.id),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  orgIdx:    index("job_req_org_idx").on(t.orgId),
  statusIdx: index("job_req_status_idx").on(t.orgId, t.status),
}));

export const candidates = pgTable("candidates", {
  id:           uuid("id").primaryKey().defaultRandom(),
  orgId:        uuid("org_id").notNull().references(() => organizations.id),
  firstName:    text("first_name").notNull(),
  lastName:     text("last_name").notNull(),
  email:        text("email").notNull(),
  phone:        text("phone"),
  location:     text("location"),
  currentTitle: text("current_title"),
  currentCo:    text("current_company"),
  experience:   integer("experience_years"),
  skills:       text("skills").array().default([]),
  resumeUrl:    text("resume_url"),
  linkedinUrl:  text("linkedin_url"),
  source:       candidateSourceEnum("source").default("other"),
  referredBy:   uuid("referred_by").references(() => users.id),
  notes:        text("notes"),
  tags:         text("tags").array().default([]),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("candidate_org_idx").on(t.orgId),
}));

export const candidateApplications = pgTable("candidate_applications", {
  id:            uuid("id").primaryKey().defaultRandom(),
  orgId:         uuid("org_id").notNull().references(() => organizations.id),
  candidateId:   uuid("candidate_id").notNull().references(() => candidates.id),
  jobId:         uuid("job_id").notNull().references(() => jobRequisitions.id),
  stage:         candidateStageEnum("stage").notNull().default("applied"),
  rating:        integer("rating"), // 1-5 stars
  feedback:      text("feedback"),
  rejectionReason: text("rejection_reason"),
  assignedTo:    uuid("assigned_to").references(() => users.id),
  appliedAt:     timestamp("applied_at").notNull().defaultNow(),
  stageUpdatedAt: timestamp("stage_updated_at").notNull().defaultNow(),
  hiredAt:       timestamp("hired_at"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  orgIdx:    index("app_org_idx").on(t.orgId),
  jobIdx:    index("app_job_idx").on(t.jobId),
  candIdx:   index("app_candidate_idx").on(t.candidateId),
  stageIdx:  index("app_stage_idx").on(t.orgId, t.stage),
}));

export const interviews = pgTable("interviews", {
  id:            uuid("id").primaryKey().defaultRandom(),
  orgId:         uuid("org_id").notNull().references(() => organizations.id),
  applicationId: uuid("application_id").notNull().references(() => candidateApplications.id),
  type:          interviewTypeEnum("type").notNull().default("video"),
  status:        interviewStatusEnum("status").notNull().default("scheduled"),
  title:         text("title").notNull(),
  scheduledAt:   timestamp("scheduled_at").notNull(),
  durationMins:  integer("duration_mins").default(60),
  location:      text("location"), // room / video link
  interviewers:  uuid("interviewers").array().default([]),
  scorecard:     jsonb("scorecard").default({}), // { criteria: [{name, rating, comment}] }
  overallRating: integer("overall_rating"), // 1-5
  decision:      text("decision"), // strong_yes, yes, no, strong_no
  notes:         text("notes"),
  meetingLink:   text("meeting_link"),
  createdBy:     uuid("created_by").references(() => users.id),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("interview_org_idx").on(t.orgId),
  appIdx: index("interview_app_idx").on(t.applicationId),
}));

export const jobOffers = pgTable("job_offers", {
  id:              uuid("id").primaryKey().defaultRandom(),
  orgId:           uuid("org_id").notNull().references(() => organizations.id),
  applicationId:   uuid("application_id").notNull().references(() => candidateApplications.id),
  candidateId:     uuid("candidate_id").notNull().references(() => candidates.id),
  status:          offerStatusEnum("status").notNull().default("draft"),
  title:           text("title").notNull(),
  department:      text("department"),
  baseSalary:      integer("base_salary"),
  variablePay:     integer("variable_pay"),
  joiningBonus:    integer("joining_bonus"),
  currency:        text("currency").default("INR"),
  startDate:       timestamp("start_date"),
  expiryDate:      timestamp("expiry_date"),
  components:      jsonb("components").default({}), // { pf, gratuity, insurance, etc. }
  notes:           text("notes"),
  sentAt:          timestamp("sent_at"),
  respondedAt:     timestamp("responded_at"),
  createdBy:       uuid("created_by").references(() => users.id),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("offer_org_idx").on(t.orgId),
}));
