'use client';

// The selected agent's details in the demo office: who they are, what they're doing, sample tasks and conversations,
// and a few "try it" buttons. Everything is sample content, labelled "Simulated"; the buttons only reveal canned text
// written here in the browser. Nothing is sent, and nothing is written to a CRM or any real record.
import { useEffect, useId, useState } from 'react';
import { describeAgentStatus, formatWhen, type DemoActivity, type DemoAgent } from './demo-api';
import { AgentAvatar, Simulated } from './DemoBits';
import './demo.css';

type TryIt = 'follow-up' | 'pipeline' | 'approval';

const TRY_IT: { key: TryIt; label: string }[] = [
  { key: 'follow-up', label: 'Show me a follow-up draft' },
  { key: 'pipeline', label: 'Summarise today’s pipeline' },
  { key: 'approval', label: 'What needs my approval?' },
];

/** Canned, clearly simulated text for each "try it" button. Sample names only; never a real person. */
export function cannedResponse(kind: TryIt, agent: DemoAgent, company: string): { title: string; body: string } {
  const from = company || 'your company';
  const first = agent.name.split(/\s+/)[0] || agent.name;
  switch (kind) {
    case 'follow-up':
      return {
        title: 'Draft follow-up email (not sent)',
        body: [
          'To: Jordan Rivera (sample lead)',
          `Subject: Following up on your enquiry with ${from}`,
          '',
          'Hi Jordan,',
          '',
          `Thanks for your interest earlier this week. I’ve put together the details you asked about and I’d be glad to walk you through them. Would Thursday at 10:00 or Friday at 14:00 suit you for a short call?`,
          '',
          `Best regards,\n${first}, on behalf of ${from}`,
        ].join('\n'),
      };
    case 'pipeline':
      return {
        title: 'Pipeline summary for today',
        body: [
          '• 6 new sample enquiries, 2 marked as hot',
          '• 3 follow-ups drafted and waiting for approval',
          '• 1 viewing proposed for Thursday',
          '• 2 leads quiet for 7+ days: suggested a gentle check-in',
        ].join('\n'),
      };
    case 'approval':
      return {
        title: 'Waiting for a person’s approval',
        body: [
          '1. Follow-up email to Jordan Rivera (sample lead)',
          '2. Price-match offer for Sam Patel (sample lead): needs a manager',
          '',
          `${first} prepares the work; a person on your team reads it and decides. Nothing leaves the office until someone approves it.`,
        ].join('\n'),
      };
  }
}

export interface DemoAgentPanelProps {
  agent: DemoAgent | null;
  company: string;
  activity: DemoActivity[];
}

export function DemoAgentPanel({ agent, company, activity }: DemoAgentPanelProps) {
  const uid = useId();
  const [shown, setShown] = useState<TryIt | null>(null);
  useEffect(() => setShown(null), [agent?.id]);

  if (!agent) {
    return (
      <section
        className="dm-panel"
        aria-labelledby={`${uid}-empty`}
        data-testid="agent-panel"
        data-agent=""
        data-tour="agent-panel"
      >
        <h2 id={`${uid}-empty`} style={{ margin: 0, fontSize: 18 }}>
          Choose an agent
        </h2>
        <p>Select a desk in the office, or a name in your team list, to see what that agent is working on.</p>
      </section>
    );
  }

  const status = describeAgentStatus(agent.status);
  const mine = activity.filter(a => a.agentId === agent.id);
  const canned = shown ? cannedResponse(shown, agent, company) : null;

  return (
    <section
      className="dm-panel"
      aria-labelledby={`${uid}-name`}
      data-testid="agent-panel"
      data-agent={agent.id}
      data-tour="agent-panel"
    >
      <div className="dm-panel-head">
        <AgentAvatar name={agent.name} id={agent.id} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id={`${uid}-name`} data-testid="agent-name">
            {agent.name}
          </h2>
          <p>{agent.role}</p>
        </div>
        <span className="dm-state" data-state={status} data-testid="agent-status">
          {status}
        </span>
      </div>
      {agent.summary && <p style={{ margin: 0 }}>{agent.summary}</p>}

      <div>
        <h3>
          Activity <Simulated />
        </h3>
        {mine.length === 0 ? (
          <p className="small">No recent activity.</p>
        ) : (
          <ul className="dm-list" data-testid="agent-activity">
            {mine.slice(0, 5).map((a, i) => (
              <li key={i}>
                <span>{a.text}</span>
                {a.when && <small>{formatWhen(a.when)}</small>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3>
          Sample task history <Simulated />
        </h3>
        {agent.tasks.length === 0 ? (
          <p className="small">No tasks yet.</p>
        ) : (
          <ul className="dm-list" data-testid="agent-tasks">
            {agent.tasks.slice(0, 6).map((t, i) => (
              <li key={i}>
                <span>{t.title}</span>
                <small>{[t.status, formatWhen(t.when)].filter(Boolean).join(' · ')}</small>
              </li>
            ))}
          </ul>
        )}
      </div>

      {agent.conversations.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3>
            Example conversations <Simulated />
          </h3>
          {agent.conversations.slice(0, 3).map((c, i) => (
            <details key={i} className="dm-convo" data-testid="agent-conversation">
              <summary>
                <span>{c.title}</span>
                <Simulated />
              </summary>
              <ol>
                {c.messages.map((m, j) => {
                  const fromAgent = m.from && m.from.toLowerCase() === agent.name.toLowerCase();
                  return (
                    <li
                      key={j}
                      className={`dm-bubble${fromAgent || /agent|assistant/i.test(m.from) ? ' dm-from-agent' : ''}`}
                    >
                      {m.from && <small>{m.from}</small>}
                      {m.text}
                    </li>
                  );
                })}
              </ol>
            </details>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-tour="try-it">
        <h3>
          Try it <Simulated />
        </h3>
        <div className="dm-tryit" role="group" aria-label={`Things to try with ${agent.name}`}>
          {TRY_IT.map(t => (
            <button
              key={t.key}
              type="button"
              className="dm-btn"
              aria-pressed={shown === t.key}
              onClick={() => setShown(t.key)}
              data-testid={`agent-try-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div aria-live="polite">
          {canned && (
            <div className="dm-draft" data-testid="agent-canned" data-kind={shown}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <strong>{canned.title}</strong>
                <Simulated />
              </div>
              <p>{canned.body}</p>
              <p className="dm-draft-foot" data-testid="agent-canned-note">
                Simulated for this demo. Nothing was sent, and nothing was written to a CRM or any real record.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
