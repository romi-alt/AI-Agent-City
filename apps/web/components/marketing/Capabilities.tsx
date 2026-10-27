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

const ROWS: {
  key: string;
  title: ReactNode;
  text: string;
  list: string[];
  roadmap: string;
  card: ReactNode;
}[] = [
  {
    key: 'follow-up',
    title: (
      <>
        Follow-up <em>that never drops a lead</em>
      </>
    ),
    text: 'Agents keep in touch with every kind of customer your business has, by email, phone and text. They are built to read the history before they write, so nobody gets the same message twice.',
    list: [
      'New customers and unsold prospects',
      'Sold customers, birthdays and ownership anniversaries',
      'Referrals and satisfaction (CSI) follow-up',
      'Lease ends, contracts about to expire and service visits',
      'Customers lost to the market, and conquest',
    ],
    roadmap: 'Sending from your own email and phone numbers, under your approval rules.',
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
        <p className="mk-sample-meta">To: Jordan R. (sample contact) · Text message</p>
        <p className="mk-sample-quote">
          Hi Jordan, it&rsquo;s been a year since you drove home your new SUV. Happy anniversary! Your first service is
          due this month. Would Tuesday or Thursday morning suit you?
        </p>
      </SampleCard>
    ),
  },
  {
    key: 'social',
    title: (
      <>
        Social content, <em>planned a month ahead</em>
      </>
    ),
    text: 'A social media team that builds the weekly and monthly strategy, keeps a 30-day calendar, and writes the hooks, captions, calls to action and hashtags for each platform, with briefs for images, carousels and short videos.',
    list: [
      'Strategy and a 30-day posting calendar',
      'Captions, hooks, hashtags and creative briefs',
      'Comments and messages answered from approved FAQs; sensitive ones go to a person',
      'Weekly summaries: work done, what is scheduled, recommendations',
    ],
    roadmap: 'Publishing to Facebook, Instagram, LinkedIn, TikTok and YouTube, and real reach and engagement numbers.',
    card: (
      <SampleCard
        agent="Luna · Content"
        title="Week 2 content calendar"
        status={<Tag tone="wait">Drafted · waiting for your OK</Tag>}
      >
        <ol className="mk-cal">
          <li>
            <span>Mon</span>3 lines that close a sale on the floor <em>Reels</em>
          </li>
          <li>
            <span>Tue</span>How to answer &ldquo;I&rsquo;ll think about it&rdquo; <em>Carousel</em>
          </li>
          <li>
            <span>Wed</span>Closing role-play with a student <em>Live</em>
          </li>
          <li>
            <span>Fri</span>The walk-around in 60 seconds <em>Shorts</em>
          </li>
          <li>
            <span>Sun</span>Enrolment open: dealers, train your team <em>LinkedIn</em>
          </li>
        </ol>
      </SampleCard>
    ),
  },
  {
    key: 'scheduling',
    title: (
      <>
        Scheduling <em>that keeps the day moving</em>
      </>
    ),
    text: 'Agents line up the calls, reminders and follow-ups that are due, so the people on your team spend the day talking to customers instead of working out who to call.',
    list: [
      'Calls to book and call-backs that are due',
      'Service, class and appointment reminders',
      'Lease-end and contract-renewal timing',
    ],
    roadmap: 'Booking straight into your calendar.',
    card: (
      <SampleCard agent="Remy · Scheduling" title="Today" status={<Tag>3 items · 1 needs you</Tag>}>
        <ol className="mk-agenda">
          <li>
            <time>09:30</time>
            <span>Call back: lease ends in 60 days</span>
            <Tag tone="wait">Needs a person</Tag>
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
    title: (
      <>
        A report <em>at the end of every day</em>
      </>
    ),
    text: 'A CEO agent runs the team and reports to you: what got done, what is waiting for your decision and what happens next. Social agents add a weekly summary of their work.',
    list: [
      'Daily report across every floor and channel',
      'Approvals waiting for you, with a clear yes or no',
      'Weekly social summary and recommendations',
    ],
    roadmap: 'The daily report delivered to your inbox.',
    card: (
      <SampleCard agent="Max · CEO" title="Daily report" status={<Tag tone="wait">2 decisions for you</Tag>}>
        <dl className="mk-report">
          <div>
            <dt>Done</dt>
            <dd>14 follow-ups drafted · 3 calls booked · week 2 calendar planned</dd>
          </div>
          <div>
            <dt>Waiting for you</dt>
            <dd>4 messages to approve · a new ad budget</dd>
          </div>
          <div>
            <dt>Tomorrow</dt>
            <dd>Lease-end outreach · class reminders</dd>
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
          index="05"
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
              Your demo office shows sample agents with their tasks, conversations and activity. Nothing in a demo is
              ever sent. Anything that needs your own accounts connected is marked <Tag tone="roadmap">Roadmap</Tag>.
            </>
          }
        />
        <div className="mk-caps">
          {ROWS.map((r, i) => (
            <article key={r.key} className={`mk-cap ${i % 2 ? 'is-flipped' : ''}`} aria-labelledby={`cap-${r.key}`}>
              <div className="mk-cap-copy">
                <h3 id={`cap-${r.key}`} className="mk-h3 mk-cap-title">
                  {r.title}
                </h3>
                <p>{r.text}</p>
                <ul className="mk-ticks">
                  {r.list.map(x => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                <p className="mk-roadmap">
                  <Tag tone="roadmap">Roadmap</Tag> {r.roadmap}
                </p>
              </div>
              <div className="mk-cap-card">{r.card}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
