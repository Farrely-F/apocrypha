CREATE TABLE `audit_checkpoint` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`hash` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `audit_env_read` (
	`session_id` text NOT NULL,
	`env_id` text NOT NULL,
	PRIMARY KEY(`session_id`, `env_id`),
	FOREIGN KEY (`env_id`) REFERENCES `environment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `audit_event` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`seq` integer NOT NULL,
	`created_at` integer NOT NULL,
	`actor_id` text,
	`type` text NOT NULL,
	`env_id` text,
	`target_user_id` text,
	`data` text NOT NULL,
	`prev_hash` text NOT NULL,
	`hash` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audit_event_org_seq_uidx` ON `audit_event` (`organization_id`,`seq`);--> statement-breakpoint
CREATE INDEX `audit_event_org_created_idx` ON `audit_event` (`organization_id`,`created_at`);