CREATE TABLE `activity_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`user_id` text,
	`action` text NOT NULL,
	`target_type` text DEFAULT '' NOT NULL,
	`target_id` text DEFAULT '' NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_logs_project_idx` ON `activity_logs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`decision` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`decided_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `approvals_target_idx` ON `approvals` (`project_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `asset_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text NOT NULL,
	`child_id` text NOT NULL,
	`relation` text DEFAULT 'derivedFrom' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_relations_uq` ON `asset_relations` (`parent_id`,`child_id`,`relation`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`shot_id` text,
	`generation_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`storage_key` text DEFAULT '' NOT NULL,
	`mime_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`checksum` text DEFAULT '' NOT NULL,
	`width` integer,
	`height` integer,
	`duration_seconds` real,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`favorite` integer DEFAULT false NOT NULL,
	`rating` integer,
	`approval_state` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assets_project_kind_idx` ON `assets` (`project_id`,`kind`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `assets_checksum_idx` ON `assets` (`checksum`);--> statement-breakpoint
CREATE INDEX `assets_shot_idx` ON `assets` (`shot_id`);--> statement-breakpoint
CREATE TABLE `bible_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`ref_id` text NOT NULL,
	`version` integer NOT NULL,
	`payload_json` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bible_versions_uq` ON `bible_versions` (`kind`,`ref_id`,`version`);--> statement-breakpoint
CREATE INDEX `bible_versions_ref_idx` ON `bible_versions` (`ref_id`);--> statement-breakpoint
CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'supporting' NOT NULL,
	`identity_json` text DEFAULT '{}' NOT NULL,
	`variable_json` text DEFAULT '{}' NOT NULL,
	`prompt_token` text DEFAULT '' NOT NULL,
	`negative_prompt` text DEFAULT '' NOT NULL,
	`forbidden_changes_json` text DEFAULT '[]' NOT NULL,
	`color_palette_json` text DEFAULT '[]' NOT NULL,
	`voice_profile_id` text,
	`current_version` integer DEFAULT 1 NOT NULL,
	`lock_enabled` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `characters_project_code_uq` ON `characters` (`project_id`,`code`);--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`code` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`synopsis` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_project_code_uq` ON `episodes` (`project_id`,`code`);--> statement-breakpoint
CREATE TABLE `exports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text DEFAULT 'project-package' NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`storage_key` text DEFAULT '' NOT NULL,
	`frozen_versions_json` text DEFAULT '{}' NOT NULL,
	`summary_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `exports_project_kind_idx` ON `exports` (`project_id`,`kind`);--> statement-breakpoint
CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`shot_id` text,
	`prompt_id` text,
	`prompt_version` integer,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`negative_prompt` text DEFAULT '' NOT NULL,
	`params_json` text DEFAULT '{}' NOT NULL,
	`reference_assets_json` text DEFAULT '[]' NOT NULL,
	`seed` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`locked_at` text,
	`locked_by` text,
	`scheduled_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`started_at` text,
	`finished_at` text,
	`estimated_cost_usd` real DEFAULT 0 NOT NULL,
	`actual_cost_usd` real DEFAULT 0 NOT NULL,
	`error_code` text,
	`error_message` text,
	`raw_response_json` text DEFAULT '{}' NOT NULL,
	`idempotency_key` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generations_idempotency_key_unique` ON `generations` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `generations_queue_idx` ON `generations` (`status`,`priority`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `generations_project_status_idx` ON `generations` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'interior' NOT NULL,
	`era` text DEFAULT '' NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`prompt_block` text DEFAULT '' NOT NULL,
	`negative_prompt` text DEFAULT '' NOT NULL,
	`color_palette_json` text DEFAULT '[]' NOT NULL,
	`continuity_notes` text DEFAULT '' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `locations_project_code_uq` ON `locations` (`project_id`,`code`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`genre` text DEFAULT '' NOT NULL,
	`format` text DEFAULT 'short-film' NOT NULL,
	`target_audience` text DEFAULT '' NOT NULL,
	`platform` text DEFAULT 'youtube' NOT NULL,
	`language` text DEFAULT 'vi-VN' NOT NULL,
	`duration_target_seconds` integer DEFAULT 300 NOT NULL,
	`aspect_ratio` text DEFAULT '16:9' NOT NULL,
	`secondary_aspect_ratios_json` text DEFAULT '["9:16"]' NOT NULL,
	`frame_rate` integer DEFAULT 24 NOT NULL,
	`resolution` text DEFAULT '1920x1080' NOT NULL,
	`style_id` text,
	`status` text DEFAULT 'development' NOT NULL,
	`owner_id` text NOT NULL,
	`creative_brief_json` text DEFAULT '{}' NOT NULL,
	`cost_limit_usd` real DEFAULT 25 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_unique` ON `projects` (`slug`);--> statement-breakpoint
CREATE INDEX `projects_workspace_idx` ON `projects` (`workspace_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `prompt_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt_id` text NOT NULL,
	`version` integer NOT NULL,
	`blocks_json` text DEFAULT '{}' NOT NULL,
	`compiled` text DEFAULT '' NOT NULL,
	`negative` text DEFAULT '' NOT NULL,
	`lock_refs_json` text DEFAULT '{}' NOT NULL,
	`lint_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_versions_uq` ON `prompt_versions` (`prompt_id`,`version`);--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`shot_id` text,
	`kind` text DEFAULT 'image' NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prompts_project_kind_idx` ON `prompts` (`project_id`,`kind`);--> statement-breakpoint
CREATE INDEX `prompts_shot_idx` ON `prompts` (`shot_id`);--> statement-breakpoint
CREATE TABLE `props` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`owner_character_id` text,
	`details_json` text DEFAULT '{}' NOT NULL,
	`prompt_token` text DEFAULT '' NOT NULL,
	`continuity_constraints_json` text DEFAULT '[]' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `props_project_code_uq` ON `props` (`project_id`,`code`);--> statement-breakpoint
CREATE TABLE `quality_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`target_type` text NOT NULL,
	`shot_id` text,
	`asset_id` text,
	`score` integer DEFAULT 0 NOT NULL,
	`passed` integer DEFAULT false NOT NULL,
	`checks_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `quality_reports_project_idx` ON `quality_reports` (`project_id`,`target_type`);--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`episode_id` text,
	`code` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`location_id` text,
	`time_of_day` text DEFAULT 'day' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`action` text DEFAULT '' NOT NULL,
	`dialogue_json` text DEFAULT '[]' NOT NULL,
	`emotion` text DEFAULT '' NOT NULL,
	`visual_goal` text DEFAULT '' NOT NULL,
	`audio_goal` text DEFAULT '' NOT NULL,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`characters_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scenes_project_code_uq` ON `scenes` (`project_id`,`code`);--> statement-breakpoint
CREATE INDEX `scenes_project_number_idx` ON `scenes` (`project_id`,`number`);--> statement-breakpoint
CREATE TABLE `script_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`episode_id` text,
	`title` text DEFAULT 'Main script' NOT NULL,
	`script_type` text DEFAULT 'motion-comic' NOT NULL,
	`raw` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`parsed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `script_documents_project_idx` ON `script_documents` (`project_id`);--> statement-breakpoint
CREATE TABLE `shots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`episode_id` text,
	`scene_id` text NOT NULL,
	`code` text NOT NULL,
	`shot_number` integer NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`shot_size` text DEFAULT 'medium' NOT NULL,
	`camera_angle` text DEFAULT 'eye-level' NOT NULL,
	`camera_movement_json` text DEFAULT '{"type":"static","speed":"static"}' NOT NULL,
	`lens` text DEFAULT '50mm' NOT NULL,
	`duration_seconds` integer DEFAULT 5 NOT NULL,
	`characters_json` text DEFAULT '[]' NOT NULL,
	`location_id` text,
	`location_version_id` text,
	`props_json` text DEFAULT '[]' NOT NULL,
	`dialogue` text DEFAULT '' NOT NULL,
	`emotion` text DEFAULT '' NOT NULL,
	`lighting` text DEFAULT '' NOT NULL,
	`visual_effects_json` text DEFAULT '[]' NOT NULL,
	`sound_effects_json` text DEFAULT '[]' NOT NULL,
	`continuity_in_json` text DEFAULT '{}' NOT NULL,
	`continuity_out_json` text DEFAULT '{}' NOT NULL,
	`intentional_changes_json` text DEFAULT '[]' NOT NULL,
	`aspect_ratio` text DEFAULT '16:9' NOT NULL,
	`importance` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shots_project_code_uq` ON `shots` (`project_id`,`code`);--> statement-breakpoint
CREATE INDEX `shots_scene_number_idx` ON `shots` (`scene_id`,`shot_number`);--> statement-breakpoint
CREATE INDEX `shots_project_status_idx` ON `shots` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `styles` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'stylized-3d' NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`prompt_block` text DEFAULT '' NOT NULL,
	`negative_style_rules` text DEFAULT '' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `styles_project_code_uq` ON `styles` (`project_id`,`code`);--> statement-breakpoint
CREATE TABLE `timelines` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`episode_id` text,
	`name` text DEFAULT 'Master timeline' NOT NULL,
	`items_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `timelines_project_idx` ON `timelines` (`project_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'owner' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_workspace_idx` ON `users` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `voice_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`provider` text DEFAULT 'mock' NOT NULL,
	`language` text DEFAULT 'vi-VN' NOT NULL,
	`voice_name` text DEFAULT '' NOT NULL,
	`speed` real DEFAULT 1 NOT NULL,
	`pitch` real DEFAULT 0 NOT NULL,
	`emotion` text DEFAULT 'neutral' NOT NULL,
	`style` text DEFAULT '' NOT NULL,
	`pronunciation_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `voice_profiles_project_idx` ON `voice_profiles` (`project_id`);--> statement-breakpoint
CREATE TABLE `workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`workflow_key` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`steps_json` text DEFAULT '[]' NOT NULL,
	`input_json` text DEFAULT '{}' NOT NULL,
	`output_json` text DEFAULT '{}' NOT NULL,
	`started_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workflow_runs_project_idx` ON `workflow_runs` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_unique` ON `workspaces` (`slug`);