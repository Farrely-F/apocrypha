CREATE TABLE `share` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`env_id` text NOT NULL,
	`created_by` text NOT NULL,
	`envelope` text NOT NULL,
	`password_protected` integer NOT NULL,
	`item_count` integer NOT NULL,
	`expires_at` integer,
	`max_views` integer,
	`views` integer DEFAULT 0 NOT NULL,
	`last_viewed_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`env_id`) REFERENCES `environment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `share_organization_id_idx` ON `share` (`organization_id`);--> statement-breakpoint
CREATE INDEX `share_env_id_idx` ON `share` (`env_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_invite_grant` (
	`invite_id` text NOT NULL,
	`env_id` text NOT NULL,
	`key_version` integer NOT NULL,
	`wrapped_key` text NOT NULL,
	PRIMARY KEY(`invite_id`, `env_id`, `key_version`),
	FOREIGN KEY (`invite_id`) REFERENCES `invite`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`env_id`) REFERENCES `environment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_invite_grant`("invite_id", "env_id", "key_version", "wrapped_key") SELECT "invite_id", "env_id", "key_version", "wrapped_key" FROM `invite_grant`;--> statement-breakpoint
DROP TABLE `invite_grant`;--> statement-breakpoint
ALTER TABLE `__new_invite_grant` RENAME TO `invite_grant`;--> statement-breakpoint
PRAGMA foreign_keys=ON;