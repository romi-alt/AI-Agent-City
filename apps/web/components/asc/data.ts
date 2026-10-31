// Copy and data for the AutoSalesCity front page. Everything on the page is fictional demo content; the hero numbers
// are labelled "illustrative" on the page itself.

export interface Client {
  key: string;
  name: string;
  district: string;
  color: string;
}

export const CLIENTS: Client[] = [
  { key: 'fs', name: 'Fast Sales Training Center', district: 'Academy Square', color: '#f5b83d' },
  { key: 'mm', name: 'Bayside Motors', district: 'Dealer Row', color: '#ff6b5e' },
  { key: 'cab', name: 'Coastline Auto Brokers', district: 'Broker Bay', color: '#818cf8' },
  { key: 'fi', name: 'Summit F&I Group', district: 'F&I Tower', color: '#2dd4bf' },
  { key: 'pa', name: 'Palm Avenue Pre-Owned', district: 'Dealer Row', color: '#e879f9' },
  { key: 'rj', name: 'R. Jimenez · Sales Pro', district: 'Rookie Lane', color: '#38bdf8' },
];

export interface LandingAgent {
  name: string;
  role: string;
  color: string;
  text: string;
}

export const LANDING_AGENTS: LandingAgent[] = [
  {
    name: 'Max',
    role: 'Sales manager',
    color: '#f5b83d',
    text: 'Runs the floor. Assigns every lead, reviews the pipeline each morning and sends the owner a daily report.',
  },
  {
    name: 'Vera',
    role: 'Internet closer',
    color: '#ff6b5e',
    text: 'Aims to answer every new lead within a minute by text and email, qualifies the buyer and books the test drive.',
  },
  {
    name: 'Nico',
    role: 'Follow-up',
    color: '#818cf8',
    text: 'Revives quiet and aged leads with up to three personal messages, then lets them go politely.',
  },
  {
    name: 'Luna',
    role: 'Content & social',
    color: '#e879f9',
    text: 'Plans a week of walk-around videos and inventory posts, written in your voice, sent for your approval.',
  },
  {
    name: 'Teo',
    role: 'Ads & funnels',
    color: '#38bdf8',
    text: 'Tracks where leads come from and what they cost, and writes new ad variations to test every week.',
  },
  {
    name: 'Iris',
    role: 'Customer care',
    color: '#2dd4bf',
    text: 'Welcomes buyers after delivery, answers questions and asks for the review while the new-car smell lasts.',
  },
  {
    name: 'Dante',
    role: 'Partnerships',
    color: '#fb923c',
    text: 'Reaches out to partner dealers and lenders. Drafts every message and waits for your OK before sending.',
  },
];

export const VEHICLES = [
  '2022 Camry',
  '2021 F-150',
  '2023 Civic',
  '2020 Wrangler',
  '2022 RAV4',
  '2019 Model 3',
  '2021 Tahoe',
  '2023 CX-5',
  '2022 Altima',
  '2020 Silverado',
];

export const BUYERS = [
  'Ana R.',
  'Marcus T.',
  'Priya S.',
  'Daniel K.',
  'Sofia M.',
  'James O.',
  'Lena V.',
  'Carlos D.',
  'Grace W.',
  'Omar H.',
];

export const MARQUEE = [
  'AI sales floors',
  'Built to reply in about a minute',
  'CRM connections scoped per setup',
  'Built to book test drives',
  'Agency plan: one building per client',
  'Human approvals built in',
  'Every message logged',
];

export const NAV_LINKS = [
  { href: '#live-demo', label: 'Live demo' },
  { href: '#how', label: 'How it works' },
  { href: '#districts', label: 'Districts' },
  { href: '#agents', label: 'AI team' },
  { href: '#control', label: 'Control room' },
  { href: '#pricing', label: 'Pricing' },
];

export const DEMO_STOPS = [
  { color: '#f5b83d', mark: 'FS', label: 'Fast Sales Training Center HQ' },
  { color: '#2f7cf6', mark: 'A', label: 'Aurora Motors showroom' },
  { color: '#e5484d', mark: 'V', label: 'Vanta Auto showroom' },
  { color: '#f08a24', mark: 'S', label: 'Summit Trucks lot' },
  { color: '#18b67a', mark: 'V', label: 'Volta EV showroom' },
  { color: '#64748b', mark: '◎', label: 'Billboards, planes, day & night' },
];

export const STEPS = [
  {
    color: 'var(--coral)',
    num: '01',
    title: 'A lead lands',
    text: 'From your website, Facebook ads or listing sites. It enters your CRM and lights up a window in your building.',
    chip: '0 s · lead captured',
    delay: '',
  },
  {
    color: 'var(--amber)',
    num: '02',
    title: 'An agent replies',
    text: 'Vera checks the vehicle, the budget and past messages, then texts and emails a personal reply, never a template blast.',
    chip: 'target < 60 s · first reply',
    delay: 'd1',
  },
  {
    color: 'var(--green)',
    num: '03',
    title: 'The appointment is booked',
    text: 'Questions answered, trade-in noted, test drive on the calendar. The pipeline updates itself and your salesperson walks in prepared.',
    chip: 'same day · on the calendar',
    delay: 'd2',
  },
];

export const DISTRICTS = [
  {
    n: '01',
    title: 'Dealer Row',
    color: 'var(--amber)',
    hex: '#f5b83d',
    wide: true,
    delay: '',
    text: 'Franchise and independent dealerships. Internet leads, service-to-sales, aged-lead revival and appointment setting around the clock.',
  },
  {
    n: '02',
    title: 'Broker Bay',
    color: 'var(--violet)',
    hex: '#818cf8',
    wide: false,
    delay: 'd1',
    text: 'Auto brokers who live on speed: instant quotes, follow-ups and deal updates.',
  },
  {
    n: '03',
    title: 'F&I Tower',
    color: 'var(--teal)',
    hex: '#2dd4bf',
    wide: false,
    delay: '',
    text: 'Finance managers and their pipelines, with compliant messaging and document reminders.',
  },
  {
    n: '04',
    title: 'Rookie Lane',
    color: 'var(--pink)',
    hex: '#e879f9',
    wide: false,
    delay: 'd1',
    text: 'Independent salespeople get their own floor: 2 to 4 agents working their personal book.',
  },
  {
    n: '05',
    title: 'Academy Square',
    color: 'var(--sky)',
    hex: '#38bdf8',
    wide: false,
    delay: 'd2',
    text: 'Sales-training companies: enrolment, student care and course content on autopilot.',
  },
];

export const FEATURES = [
  {
    n: '01',
    delay: 'd1',
    title: 'Sealed client data',
    text: "Each building's leads, CRM tokens and knowledge stay inside its own walls.",
  },
  {
    n: '02',
    delay: 'd2',
    title: 'Human approval queue',
    text: 'Anything outside policy pauses for a yes or no from your team.',
  },
  {
    n: '03',
    delay: 'd3',
    title: 'Every message explained',
    text: 'See what the agent read, what it wrote and why it sent it.',
  },
];

export const NUMBERS = [
  { count: 7, prefix: '', suffix: '', label: 'AI agents working one live CRM' },
  { count: 60, prefix: '<', suffix: 's', label: 'Target first reply to a new lead' },
  { count: 871, prefix: '', suffix: '', label: 'Knowledge chunks the agents answer from' },
  { count: 24, prefix: '', suffix: '/7', label: 'On duty, nights and weekends included' },
];

export const PLANS = [
  {
    name: 'Starter floor',
    who: 'Solo salesperson',
    price: '$79',
    per: ' /mo',
    items: ['2 AI agents', '1 CRM connection', '1 user'],
    cta: 'Start',
    delay: '',
    hot: false,
  },
  {
    name: 'Pro floor',
    who: 'Small sales team',
    price: '$199',
    per: ' /mo',
    items: ['4 AI agents', 'Your own knowledge base', '5 users'],
    cta: 'Start',
    delay: 'd1',
    hot: false,
  },
  {
    name: 'Full building',
    who: 'Dealership or training center',
    price: '$399',
    per: ' to $799 /mo',
    items: ['7+ AI agents', 'Approvals and daily reports', '15 users'],
    cta: 'Get a building',
    delay: 'd2',
    hot: true,
  },
  {
    name: 'Agency district',
    who: 'Marketing agencies',
    price: '$999',
    per: ' /mo + per building',
    items: ['Client-branded city (roadmap)', 'Unlimited client buildings', 'Wholesale pricing'],
    cta: 'Talk to us',
    delay: 'd3',
    hot: false,
  },
];
