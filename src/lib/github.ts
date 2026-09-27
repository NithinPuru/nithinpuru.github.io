// Build-time GitHub stats for the Work section. One unauthenticated request
// (or GITHUB_TOKEN-authenticated in CI) lists the user's public repos; any
// failure — offline build, rate limit, timeout — returns null and the page
// simply renders without stars. Numbers are fetched, never hand-maintained.
export interface RepoStats {
  stars: number;
  forks: number;
}
export interface GithubStats {
  repos: number;
  stars: number;
  byUrl: Map<string, RepoStats>;
}

let cached: Promise<GithubStats | null> | undefined;

export function githubStats(user: string): Promise<GithubStats | null> {
  cached ??= load(user);
  return cached;
}

async function load(user: string): Promise<GithubStats | null> {
  try {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const res = await fetch(`https://api.github.com/users/${user}/repos?per_page=100&type=owner`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const list = (await res.json()) as {
      html_url: string;
      stargazers_count: number;
      forks_count: number;
      fork: boolean;
    }[];
    const own = list.filter((r) => !r.fork);
    return {
      repos: own.length,
      stars: own.reduce((n, r) => n + r.stargazers_count, 0),
      byUrl: new Map(
        own.map((r) => [r.html_url.toLowerCase(), { stars: r.stargazers_count, forks: r.forks_count }])
      ),
    };
  } catch {
    return null;
  }
}

// Map any github.com/<owner>/<repo>/... URL to its repository stats.
export function repoFor(stats: GithubStats | null, url?: string): RepoStats | undefined {
  if (!stats || !url) return undefined;
  const m = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/i);
  return m ? stats.byUrl.get(`https://github.com/${m[1]}/${m[2]}`.toLowerCase()) : undefined;
}
