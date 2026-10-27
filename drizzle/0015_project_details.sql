ALTER TABLE `environment` ADD `kind` text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE `project` ADD `description` text;--> statement-breakpoint
ALTER TABLE `project` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `project` ADD `repo_url` text;--> statement-breakpoint
ALTER TABLE `project` ADD `docs_url` text;--> statement-breakpoint
UPDATE `environment` SET `kind` = 'prod' WHERE lower(`name`) IN ('prod', 'production', 'prd', 'live');--> statement-breakpoint
UPDATE `environment` SET `kind` = 'staging' WHERE lower(`name`) IN ('staging', 'stage', 'stg', 'preview', 'uat', 'qa', 'test', 'testing');--> statement-breakpoint
UPDATE `environment` SET `kind` = 'dev' WHERE lower(`name`) IN ('dev', 'development', 'local', 'sandbox');
