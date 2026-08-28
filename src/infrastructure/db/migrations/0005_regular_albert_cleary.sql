CREATE TABLE `publishes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`export_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`export_id`) REFERENCES `exports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `publishes_project_idx` ON `publishes` (`project_id`);--> statement-breakpoint
CREATE INDEX `publishes_export_idx` ON `publishes` (`export_id`);