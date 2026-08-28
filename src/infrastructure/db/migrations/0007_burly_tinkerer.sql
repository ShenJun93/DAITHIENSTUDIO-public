CREATE TABLE `production_asset_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`target_version_id` text DEFAULT '' NOT NULL,
	`role` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `production_asset_bindings_uq` ON `production_asset_bindings` (`asset_id`,`target_type`,`target_id`,`target_version_id`,`role`);--> statement-breakpoint
CREATE INDEX `production_asset_bindings_project_target_idx` ON `production_asset_bindings` (`project_id`,`target_type`,`target_id`);--> statement-breakpoint
ALTER TABLE `projects` ADD `production_strategy` text DEFAULT 'hybrid' NOT NULL;