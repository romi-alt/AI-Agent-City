import type { ReactNode } from 'react';
import { SectionHead, Tag } from './Primitives';

// Each capability comes from the source documents (references/: Agents tasks, FAST SALES AGENTS, TASKS FOR SOCIAL
// MEDIA AGENTS, the proposal). The example cards are sample work, labelled as such; agent names are personas from
// the public city layout. Anything that needs a connected account is marked "Roadmap".

function SampleCard({
  agent,
  title,
  children,
  status,
}: {
  agent: string;
  title: string;
  children: ReactNode;
  status: ReactNode;
}) {
  return (
    <figure className="mk-sample" aria-label={`Example: ${title} (sample data)`}>
      <div className="mk-sample-top">
        <span className="mk-sample-agent">{agent}</span>
        <Tag tone="sample">Sample</Tag>
      </div>
      <p className="mk-sample-title">{title}</p>
      <div className="mk-sample-body">{children}</div>
      <div className="mk-sample-foot">{status}</div>
    </figure>
  );
}

const TILES: { key: string; tone: string; title: string; text: string; roadmap: string; card: ReactNode }[] = [
  {
    key: 'follow-up',
    tone: 'sky',
    title: 'Follow-up that never drops a lead',
    text: 'Email, phone and text for every kind of customer: unsold prospects, sold customers, birthdays, anniversaries, referrals, lease ends, service visits.',
    roadmap: 'Sending from your own email and numbers, under your approval rules.',
    card: (
      <SampleCard
        agent="Maya · Service visits"
        title="Ownership anniversary"
        status={
          <>
            <Tag tone="wait">Waiting for your OK</Tag>
            <span className="mk-fake-btn">Approve</span>
            <span className="mk-fake-btn is-quiet">Edit</span>
          </>
        }
      >
        <p className="mk-sample-quote">
          Hi Jordan, it&rsquo;s been a year since you drove home your new SUV. Your first service is due this month.
          Would Tuesday or Thursday morning suit you?
        </p>
      </SampleCard>
    ),
  },
  {
    key: 'social',
    tone: 'gold',
    title: 'Social content, planned a month ahead',
    text: 'Strategy, a 30-day calendar, hooks, captions, hashtags and creative briefs. Sensitive comments go to a person.',
    roadmap: 'Publishing to Facebook, Instagram, LinkedIn, TikTok and YouTube, with real reach numbers.',
    card: (
      <SampleCard agent="Luna · Content" title="Week 2 calendar" status={<Tag tone="wait">Waiting for your OK</Tag>}>
        <ol className="mk-cal">
          <li>
            <span>Mon</span>3 lines that close a sale <em>Reels</em>
          </li>
          <li>
            <span>Tue</span>Answering &ldquo;I&rsquo;ll think about it&rdquo; <em>Carousel</em>
          </li>
          <li>
            <span>Fri</span>The walk-around in 60 seconds <em>Shorts</em>
          </li>
        </ol>
      </SampleCard>
    ),
  },
  {
    key: 'scheduling',
    tone: 'coral',
    title: 'Scheduling that keeps the day moving',
    text: 'Calls to book, call-backs that are due, service and class reminders, lease-end timing.',
    roadmap: 'Booking straight into your calendar.',
    card: (
      <SampleCard agent="Remy · Scheduling" title="Today" status={<Tag>3 items · 1 needs you</Tag>}>
        <ol className="mk-agenda">
          <li>
            <time>09:30</time>
            <span>Call back: lease ends in 60 days</span>
          </li>
          <li>
            <time>11:00</time>
            <span>Service reminders: 12 drafts to review</span>
          </li>
          <li>
            <time>15:00</time>
            <span>Reminders for Saturday&rsquo;s live class</span>
          </li>
        </ol>
      </SampleCard>
    ),
  },
  {
    key: 'reporting',
    tone: 'green',
    title: 'A report at the end of every day',
    text: 'A CEO agent tells you what got done, what is waiting for your decision and what happens next.',
    roadmap: 'The daily report delivered to your inbox.',
    card: (
      <SampleCard agent="Max · CEO" title="Daily report" status={<Tag tone="wait">2 decisions for you</Tag>}>
        <dl className="mk-report">
          <div>
            <dt>Done</dt>
            <dd>14 follow-ups drafted · 3 calls booked</dd>
          </div>
          <div>
            <dt>Waiting for you</dt>
            <dd>4 messages · a new ad budget</dd>
          </div>
        </dl>
      </SampleCard>
    ),
  },
];

export function Capabilities() {
  return (
    <section className="mk-section mk-capabilities on-light" aria-labelledby="capabilities-title" id="capabilities">
      <div className="mk-container">
        <SectionHead
          index="03"
          label="What your AI team does"
          id="capabilities-title"
          align="split"
          title={
            <>
              Real jobs, <em>done at every desk.</em>
            </>
          }
          lead={
            <>
              Your demo office shows sample agents with their tasks and conversations; nothing in a demo is ever sent.
              Anything that needs your own accounts is marked <Tag tone="roadmap">Roadmap</Tag>.
            </>
          }
        />
        <div className="mk-tiles">
          {TILES.map(t => (
            <article key={t.key} className={`mk-tile mk-tile-${t.tone}`} aria-labelledby={`cap-${t.key}`}>
              <div className="mk-tile-copy">
                <h3 id={`cap-${t.key}`} className="mk-h3">
                  {t.title}
                </h3>
                <p>{t.text}</p>
              </div>
              <div className="mk-tile-card">{t.card}</div>
              <p className="mk-roadmap">
                <Tag tone="roadmap">Roadmap</Tag> {t.roadmap}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
