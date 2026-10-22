CREATE TABLE `system_access_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`subject_id` text
);
--> statement-breakpoint
CREATE INDEX `system_access_log_at_idx` ON `system_access_log` (`at`);--> statement-breakpoint
CREATE TABLE `system_snapshot` (
	`key` text PRIMARY KEY NOT NULL,
	`computed_at` integer NOT NULL,
	`payload` text NOT NULL
);
