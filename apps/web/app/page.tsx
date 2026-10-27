import { fetchReadiness } from '../lib/api';

// Rendered on every request: the page shows the API's live readiness, never a cached copy.
export const dynamic = 'force-dynamic';

export default async function StatusPage() {
  const status = await fetchReadiness();
  return (
    <main>
      <h1>AgentCity platform status</h1>
      <p>
        The new web app asked the new API whether it is ready to serve traffic. Business screens are still in the legacy
        app (<code>apps/legacy</code>) and move here from M05 onwards.
      </p>
      <p>
        <a href="/account" data-testid="home-account">
          Your account
        </a>{' '}
        (you'll be asked to sign in first if you aren't already).
      </p>
      {status.reachable ? (
        <>
          <p data-testid="overall">
            API{' '}
            <span className={status.report.status === 'ready' ? 'ok' : 'bad'}>
              {status.report.status === 'ready' ? 'ready' : 'not ready'}
            </span>{' '}
            (HTTP {status.httpStatus}, checked {status.report.checkedAt})
          </p>
          <table>
            <thead>
              <tr>
                <th>Dependency</th>
                <th>State</th>
                <th>Detail</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {status.report.checks.map(c => (
                <tr key={c.name} data-testid={`check-${c.name}`}>
                  <td>{c.name}</td>
                  <td className={c.ok ? 'ok' : 'bad'}>{c.ok ? 'ok' : 'unavailable'}</td>
                  <td>{c.detail}</td>
                  <td>{c.latencyMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p data-testid="overall" className="bad">
          API unreachable: {status.reason}
        </p>
      )}
    </main>
  );
}
