# Published media retention

The worker checks after each publisher pass (normally every 15 seconds). Once an upload has at least one published target and every post referencing it has only published/cancelled targets, its file is removed, including library uploads. Pending AI drafts, future schedules, in-flight targets and failed targets retain the upload. This also protects covers and media referenced in thread options.

Metadata stays for post history with status `purged`, no path, zero stored bytes and no public URL. The old public file URL returns 404. Keep original files outside LRMsmm if reuse is needed. Unused uploads follow the existing garbage collection policy.

This concerns active application storage. Deployment rollback backups can contain older copies; their existing retention policy is unchanged. Do not remove shared VPS backups as part of a publishing operation.

Instagram post links are saved from Meta and shown in post details. A background job retries missing links for seven days without republishing. Stories generally have no permanent post link. The composer preview is an approximation; Instagram controls final rendering.
