CREATE TABLE `invite` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`created_by` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`email` text,
	`ephemeral_public_key` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`used_by` text,
	`revoked_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invite_organization_id_idx` ON `invite` (`organization_id`);--> statement-breakpoint
CREATE TABLE `invite_grant` (
	`invite_id` text NOT NULL,
	`env_id` text NOT NULL,
	`key_version` integer NOT NULL,
	`wrapped_key` text NOT NULL,
	PRIMARY KEY(`invite_id`, `env_id`),
	FOREIGN KEY (`invite_id`) REFERENCES `invite`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`env_id`) REFERENCES `environment`(`id`) ON UPDATE no action ON DELETE cascade
);
