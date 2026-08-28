CREATE TABLE `project_production_types` (
  `project_id` text PRIMARY KEY NOT NULL,
  `production_type` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
