CREATE TABLE `secret` (
	`id` text PRIMARY KEY NOT NULL,
	`environment_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`environment_id`) REFERENCES `environment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `secret_environment_idx` ON `secret` (`environment_id`);--> statement-breakpoint
CREATE TABLE `secret_version` (
	`secret_id` text NOT NULL,
	`version` integer NOT NULL,
	`key_version` integer NOT NULL,
	`name` text NOT NULL,
	`value` text NOT NULL,
	`metadata` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`secret_id`, `version`),
	FOREIGN KEY (`secret_id`) REFERENCES `secret`(`id`) ON UPDATE no action ON DELETE cascade
);
