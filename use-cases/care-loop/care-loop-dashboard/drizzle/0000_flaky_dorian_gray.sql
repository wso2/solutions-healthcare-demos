CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patient_id` text NOT NULL,
	`label` text NOT NULL,
	`detail` text,
	`payload` text,
	`received_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `request_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patient_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`triggered_at` text NOT NULL,
	`status` text NOT NULL,
	`response_summary` text
);
