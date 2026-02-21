import Image from 'next/image';
import Link from 'next/link';
import { getTeamLogoUrl } from '@/lib/data';
import { formatDateTime } from '@/lib/format';
import { getLeaderboardRuns } from '@/lib/run-service';

export default async function LeaderboardPage({
  searchParams
}: {
  searchParams: {
    groupCode?: string;
  };
}) {
  const groupCode = searchParams.groupCode?.trim() ?? '';
  const runs = await getLeaderboardRuns(groupCode || null);

  return (
    <div className="space-y-4">
      <section className="card p-6">
        <h1 className="text-2xl font-bold text-slate-900">Friend Leaderboard</h1>
        <p className="mt-1 text-sm text-slate-600">
          Filter by Group Code to compare runs with friends. Leave blank to see recent top runs.
        </p>

        <form className="mt-4 flex flex-wrap items-end gap-2" method="get">
          <div>
            <label htmlFor="groupCode" className="mb-1 block text-sm font-medium text-slate-700">
              Group Code
            </label>
            <input
              id="groupCode"
              name="groupCode"
              className="input"
              placeholder="e.g. FRIENDS"
              defaultValue={groupCode}
              maxLength={16}
            />
          </div>
          <button type="submit" className="button-primary">
            Apply
          </button>
          <Link href="/leaderboard" className="button-secondary">
            Clear
          </Link>
        </form>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {groupCode ? `Results for ${groupCode.toUpperCase()}` : 'Top Runs'}
          </h2>
        </div>

        {runs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-600">No runs found for this filter yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Share Code</th>
                  <th className="px-4 py-3">Group</th>
                  <th className="px-4 py-3">Lineup</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run, index) => (
                  <tr key={run.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3 font-semibold text-slate-900">#{index + 1}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{run.teamScore.toFixed(1)}</td>
                    <td className="px-4 py-3 text-slate-700">{run.userName ?? 'Anonymous'}</td>
                    <td className="px-4 py-3">
                      <Link href={`/results/${run.shareCode}`} className="font-semibold text-court-700 hover:underline">
                        {run.shareCode}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{run.groupCode ?? 'None'}</td>
                    <td className="px-4 py-3 text-slate-700">
                      <ul className="space-y-1">
                        {run.picks.map((pick) => {
                          const teamLogoUrl = getTeamLogoUrl(pick.teamAbbr);

                          return (
                            <li key={pick.id}>
                              <span className="font-semibold">{pick.slot}</span>:{' '}
                              <span className="inline-flex items-center gap-1">
                                {teamLogoUrl ? (
                                  <Image
                                    src={teamLogoUrl}
                                    alt={`${pick.teamAbbr} logo`}
                                    width={28}
                                    height={28}
                                    className="h-7 w-7 rounded-sm border border-slate-200 bg-white p-[2px]"
                                  />
                                ) : null}
                                {pick.isPenalty ? 'Shot Clock Violation' : pick.playerName}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatDateTime(run.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
