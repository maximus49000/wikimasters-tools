export function parseFix(line: string): { id: string; title: string } | null;
export function recentFixes(cwd: string, limit?: number): { id: string; title: string }[];
