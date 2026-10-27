import type { Channel } from '../types';

export const CHANNELS: Channel[] = ['email', 'phone', 'text'];

/** "Agents' tasks for dealerships and rental buildings" – run over email, phone and text. */
export const DEALERSHIP_TASKS = [
  'New customers', 'Unsold prospects', 'Orphans', 'Mastermind', 'Sold customers',
  'Customer birthday', 'Ownership anniversary', 'Referrals', 'CSI follow', 'Lease end',
  'Service visits', 'Conquest', 'Lost / out of the market',
];

/** "Fast Sales agents' tasks for dealerships and rental buildings" – email, phone and text. */
export const FAST_SALES_TASKS = [
  'New customers', 'Unsold', 'Sold customers', 'Contract to expire', 'Referrals', 'Follow-up',
  'New affiliates', 'Affiliates follow-up', 'New leads', 'Current customers',
];

/** "Tasks for social media agents (Fast Sales and dealerships)". */
export const SOCIAL_TASKS: { name: string; detail: string }[] = [
  { name: 'Content strategy', detail: 'Weekly and monthly strategy from goals, audience, products and promotions.' },
  { name: 'Content calendar', detail: '30-day posting calendar: topics, platforms, dates, publish times.' },
  { name: 'Content creation', detail: 'Captions, hooks, CTAs, hashtags; creative briefs for images, carousels, videos.' },
  { name: 'Graphic & video production', detail: 'Branded graphics, promo images, short-form video, reels, stories.' },
  { name: 'Multi-platform publishing', detail: 'Schedule approved content to Facebook, Instagram, LinkedIn, TikTok, YouTube.' },
  { name: 'Community engagement', detail: 'Monitor comments, mentions, DMs; answer approved FAQs, escalate sensitive ones.' },
  { name: 'Lead generation', detail: 'Campaigns driving site visits, info requests, course sign-ups, dealership contact.' },
  { name: 'Trend monitoring', detail: 'Spot relevant industry trends and content opportunities.' },
  { name: 'Competitor analysis', detail: 'Review public competitor content, frequency, messaging, engagement.' },
  { name: 'Performance analytics', detail: 'Reach, impressions, engagement, clicks, leads, conversions, followers.' },
  { name: 'Content optimization', detail: 'Find winners, test new approaches, recommend improvements.' },
  { name: 'Weekly reporting', detail: 'Weekly summary, completed-work log, upcoming schedule, recommendations.' },
];

export const SOCIAL_PLATFORMS = ['Facebook', 'Instagram', 'LinkedIn', 'TikTok', 'YouTube'];
