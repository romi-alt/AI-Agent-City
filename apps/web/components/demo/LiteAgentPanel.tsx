// The selected agent in the lite demo office: role, status, what they are doing now, a plain summary and their
// tasks. Everything comes from /api/lite/demo/office and is simulated; nothing here can send anything.
import type { LiteAgent, LiteTask } from '../../lib/api-client';
import { AgentAvatar, Simulated } from './DemoBits';
import { formatWhen } from './demo-api';
import { LiteStatus } from './LiteBits';

export function LiteAgentPanel({ agent, tasks }: { agent: LiteAgent | null; tasks: LiteTask[] }) {
  if (!agent) {
    return (
      <section className="dm-mock" aria-labelledby="lite-agent-empty" data-testid="agent-panel" data-agent="">
        <div className="dm-mock-bar">
          <h2 id="lite-agent-empty" className="dm-mock-title">
            Agent details
          </h2>
        </div>
        <p className="dm-empty">
          Choose a desk in the office, or a name in your team, to see what that agent is doing.
        </p>
      </section>
    );
  }
  const mine = tasks.filter(t => t.agentId === agent.id);
  return (
    <section className="dm-mock" aria-labelledby="lite-agent-name" data-testid="agent-panel" data-agent={agent.id}>
      <div className="dm-mock-bar">
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <AgentAvatar name={agent.name} />
          <span className="dm-row-main">
            <h2 id="lite-agent-name" className="dm-mock-title" data-testid="agent-name">
              {agent.name}
            </h2>
            <span className="dm-row-sub" data-testid="agent-role">
              {agent.role}
            </span>
          </span>
        </span>
        <LiteStatus status={agent.status} testId="agent-status" />
      </div>
      <div className="dm-panel-body">
        <div className="dm-panel-section">
          <h3 className="dm-label">
            Right now <Simulated />
          </h3>
          <p data-testid="agent-task">{agent.currentTask ?? 'Nothing in progress.'}</p>
        </div>
        {agent.summary && (
          <div className="dm-panel-section">
            <h3 className="dm-label">Summary</h3>
            <p className="dm-muted" data-testid="agent-summary">
              {agent.summary}
            </p>
          </div>
        )}
        {mine.length > 0 && (
          <div className="dm-panel-section">
            <h3 className="dm-label">
              Tasks <Simulated />
            </h3>
            <ul className="dm-lines" data-testid="agent-tasks">
              {mine.slice(0, 6).map(t => (
                <li key={t.id}>
                  <span>{t.title}</span>
                  {t.status && <span className="dm-row-when">{t.status}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {agent.updatedAt && <p className="dm-row-when">Updated {formatWhen(agent.updatedAt)}</p>}
      </div>
    </section>
  );
}
