ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_created_by_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "invites" DROP CONSTRAINT "invites_invited_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ticket_comments" DROP CONSTRAINT "ticket_comments_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_status_id_ticket_statuses_id_fk";
--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_requester_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_type_id_asset_types_id_fk";
--> statement-breakpoint
ALTER TABLE "workflow_runs" DROP CONSTRAINT "workflow_runs_workflow_version_id_workflow_versions_id_fk";
--> statement-breakpoint
ALTER TABLE "workflows" DROP CONSTRAINT "workflows_created_by_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "hr_cases" DROP CONSTRAINT "hr_cases_status_id_ticket_statuses_id_fk";
--> statement-breakpoint
ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_approver_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_requester_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "goods_receipt_notes" DROP CONSTRAINT "goods_receipt_notes_po_id_purchase_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_vendor_id_vendors_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_vendor_id_vendors_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_requests" DROP CONSTRAINT "purchase_requests_requester_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "announcements" DROP CONSTRAINT "announcements_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "kb_articles" DROP CONSTRAINT "kb_articles_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "work_order_activity_logs" DROP CONSTRAINT "work_order_activity_logs_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "work_order_tasks" DROP CONSTRAINT "work_order_tasks_assigned_to_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "work_orders" DROP CONSTRAINT "work_orders_assigned_to_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "work_orders" DROP CONSTRAINT "work_orders_requested_by_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "change_approvals" DROP CONSTRAINT "change_approvals_approver_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "change_requests" DROP CONSTRAINT "change_requests_requester_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "legal_requests" DROP CONSTRAINT "legal_requests_requester_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "facility_requests" DROP CONSTRAINT "facility_requests_requester_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "move_requests" DROP CONSTRAINT "move_requests_requester_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "room_bookings" DROP CONSTRAINT "room_bookings_booked_by_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "approval_steps" DROP CONSTRAINT "approval_steps_approver_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "oncall_overrides" DROP CONSTRAINT "oncall_overrides_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "itom_suppression_rules" DROP CONSTRAINT "itom_suppression_rules_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "expense_reports" DROP CONSTRAINT "expense_reports_submitted_by_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "expense_reports" DROP CONSTRAINT "expense_reports_approver_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "goals" DROP CONSTRAINT "goals_owner_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "performance_reviews" DROP CONSTRAINT "performance_reviews_reviewee_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "performance_reviews" DROP CONSTRAINT "performance_reviews_reviewer_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "review_cycles" DROP CONSTRAINT "review_cycles_created_by_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "catalog_requests" DROP CONSTRAINT "catalog_requests_item_id_catalog_items_id_fk";
--> statement-breakpoint
ALTER TABLE "catalog_requests" DROP CONSTRAINT "catalog_requests_requester_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "candidate_applications" DROP CONSTRAINT "candidate_applications_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "candidate_applications" DROP CONSTRAINT "candidate_applications_candidate_id_candidates_id_fk";
--> statement-breakpoint
ALTER TABLE "candidate_applications" DROP CONSTRAINT "candidate_applications_job_id_job_requisitions_id_fk";
--> statement-breakpoint
ALTER TABLE "candidate_applications" DROP CONSTRAINT "candidate_applications_assigned_to_users_id_fk";
--> statement-breakpoint
ALTER TABLE "candidates" DROP CONSTRAINT "candidates_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "candidates" DROP CONSTRAINT "candidates_referred_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "interviews" DROP CONSTRAINT "interviews_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "interviews" DROP CONSTRAINT "interviews_application_id_candidate_applications_id_fk";
--> statement-breakpoint
ALTER TABLE "interviews" DROP CONSTRAINT "interviews_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "job_offers" DROP CONSTRAINT "job_offers_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "job_offers" DROP CONSTRAINT "job_offers_application_id_candidate_applications_id_fk";
--> statement-breakpoint
ALTER TABLE "job_offers" DROP CONSTRAINT "job_offers_candidate_id_candidates_id_fk";
--> statement-breakpoint
ALTER TABLE "job_offers" DROP CONSTRAINT "job_offers_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "job_requisitions" DROP CONSTRAINT "job_requisitions_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "job_requisitions" DROP CONSTRAINT "job_requisitions_hiring_manager_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "job_requisitions" DROP CONSTRAINT "job_requisitions_recruiter_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "job_requisitions" DROP CONSTRAINT "job_requisitions_approver_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "job_requisitions" DROP CONSTRAINT "job_requisitions_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "board_meetings" DROP CONSTRAINT "board_meetings_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "board_meetings" DROP CONSTRAINT "board_meetings_chairperson_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "board_meetings" DROP CONSTRAINT "board_meetings_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "board_resolutions" DROP CONSTRAINT "board_resolutions_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "board_resolutions" DROP CONSTRAINT "board_resolutions_meeting_id_board_meetings_id_fk";
--> statement-breakpoint
ALTER TABLE "board_resolutions" DROP CONSTRAINT "board_resolutions_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "company_directors" DROP CONSTRAINT "company_directors_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "esop_grants" DROP CONSTRAINT "esop_grants_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "esop_grants" DROP CONSTRAINT "esop_grants_employee_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "secretarial_filings" DROP CONSTRAINT "secretarial_filings_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "secretarial_filings" DROP CONSTRAINT "secretarial_filings_assigned_to_users_id_fk";
--> statement-breakpoint
ALTER TABLE "share_capital" DROP CONSTRAINT "share_capital_org_id_organizations_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_status_id_ticket_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."ticket_statuses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_type_id_asset_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."asset_types"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_version_id_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflows" ADD CONSTRAINT "workflows_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hr_cases" ADD CONSTRAINT "hr_cases_status_id_ticket_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."ticket_statuses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_order_activity_logs" ADD CONSTRAINT "work_order_activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_order_tasks" ADD CONSTRAINT "work_order_tasks_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "change_approvals" ADD CONSTRAINT "change_approvals_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_requests" ADD CONSTRAINT "legal_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "facility_requests" ADD CONSTRAINT "facility_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "move_requests" ADD CONSTRAINT "move_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_booked_by_id_users_id_fk" FOREIGN KEY ("booked_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oncall_overrides" ADD CONSTRAINT "oncall_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "itom_suppression_rules" ADD CONSTRAINT "itom_suppression_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_reports" ADD CONSTRAINT "expense_reports_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_reports" ADD CONSTRAINT "expense_reports_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goals" ADD CONSTRAINT "goals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_reviewee_id_users_id_fk" FOREIGN KEY ("reviewee_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catalog_requests" ADD CONSTRAINT "catalog_requests_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catalog_requests" ADD CONSTRAINT "catalog_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidate_applications" ADD CONSTRAINT "candidate_applications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidate_applications" ADD CONSTRAINT "candidate_applications_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidate_applications" ADD CONSTRAINT "candidate_applications_job_id_job_requisitions_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_requisitions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidate_applications" ADD CONSTRAINT "candidate_applications_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidates" ADD CONSTRAINT "candidates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidates" ADD CONSTRAINT "candidates_referred_by_users_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interviews" ADD CONSTRAINT "interviews_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_candidate_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."candidate_applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interviews" ADD CONSTRAINT "interviews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_application_id_candidate_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."candidate_applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_hiring_manager_id_users_id_fk" FOREIGN KEY ("hiring_manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_recruiter_id_users_id_fk" FOREIGN KEY ("recruiter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board_meetings" ADD CONSTRAINT "board_meetings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board_meetings" ADD CONSTRAINT "board_meetings_chairperson_id_users_id_fk" FOREIGN KEY ("chairperson_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board_meetings" ADD CONSTRAINT "board_meetings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board_resolutions" ADD CONSTRAINT "board_resolutions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board_resolutions" ADD CONSTRAINT "board_resolutions_meeting_id_board_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."board_meetings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board_resolutions" ADD CONSTRAINT "board_resolutions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_directors" ADD CONSTRAINT "company_directors_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "esop_grants" ADD CONSTRAINT "esop_grants_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "esop_grants" ADD CONSTRAINT "esop_grants_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "secretarial_filings" ADD CONSTRAINT "secretarial_filings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "secretarial_filings" ADD CONSTRAINT "secretarial_filings_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "share_capital" ADD CONSTRAINT "share_capital_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
