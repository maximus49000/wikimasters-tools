export function formatNotes(subjects: string[]): string;
export function subjectsBetween(cwd: string, from?: string, to?: string): string[];
export function latestTag(tags: string[], tagPrefix: string): string | undefined;
export function notesSince(cwd: string, tagPrefix: string, fallback: string): string;
export function isNewerRelease(versionCode: number | string, tags: string[], tagPrefix: string): boolean;
