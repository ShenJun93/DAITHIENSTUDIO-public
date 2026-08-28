CREATE TABLE `audio_mixes` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audio_mixes_episode_id_unique` ON `audio_mixes` (`episode_id`);--> statement-breakpoint
CREATE TABLE `audio_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`mix_id` text NOT NULL,
	`layer` text NOT NULL,
	`asset_id` text NOT NULL,
	`generation_id` text,
	`start_time_seconds` real DEFAULT 0 NOT NULL,
	`duration_seconds` real NOT NULL,
	`gain_db` real DEFAULT 0 NOT NULL,
	`muted` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`mix_id`) REFERENCES `audio_mixes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`generation_id`) REFERENCES `generations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audio_tracks_mix_idx` ON `audio_tracks` (`mix_id`);