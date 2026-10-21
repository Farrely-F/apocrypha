CREATE TABLE `vault` (
	`user_id` text PRIMARY KEY NOT NULL,
	`public_key` text NOT NULL,
	`passphrase_blob` text NOT NULL,
	`recovery_blob` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
