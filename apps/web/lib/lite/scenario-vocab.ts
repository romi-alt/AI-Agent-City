// Sample wording for the three kinds of business the demo speaks to. Every name, vehicle, course and service is
// invented for the demo; none refers to a real person, brand or result.

export type Sector = 'dealership' | 'training' | 'agency';

export interface Vocab {
  sector: Sector;
  label: string;
  offer: string;
  offerShort: string;
  channel: string;
  enquiry: string;
  meet: string;
  meetLong: string;
  quietReason: string;
  quietAsk: string;
  proposal: string[];
  afterVisit: string;
  visitKind: string;
  reminder: string;
  gap: string;
  posts: [string, string, string];
  praise: string;
  critical: string;
  chat: string;
  chatAnswer: string;
}

export const SAMPLE_PEOPLE = [
  'Sample Jordan Lee',
  'Sample Priya Nair',
  'Sample Tom Becker',
  'Sample Maria Santos',
  'Sample Ahmed Khan',
  'Sample Chloe Dubois',
  'Sample Sam Rivera',
  'Sample Ana Kowalski',
];

export const SLOTS = ['10:00', '11:30', '14:00', '15:30'];

export const VOCABS: Vocab[] = [
  {
    sector: 'dealership',
    label: 'dealership',
    offer: 'the Sample used compact SUV (2021, automatic)',
    offerShort: 'compact SUV',
    channel: 'Website vehicle page',
    enquiry:
      'Is the compact SUV on your site still available? I could come on Saturday morning, and I would like to know if you take part-exchange.',
    meet: 'test drive',
    meetLong: 'a 30-minute test drive',
    quietReason:
      'looked at the SUV and a hatchback, asked about part-exchange nine days ago, then went quiet after the price',
    quietAsk: 'part-exchange and the Saturday test drive',
    proposal: [
      'Vehicle: the Sample compact SUV, as listed',
      'Part-exchange: a valuation visit (no figure promised in writing yet)',
      'Finance: an overview of the options, with no rates quoted',
      'Handover: two date options',
    ],
    afterVisit: 'collected a vehicle five days ago',
    visitKind: 'handover',
    reminder: 'service appointment on Thursday at 09:00',
    gap: 'a cancelled Tuesday 14:00 service slot',
    posts: [
      'Meet the people at the service desk',
      'Three checks before a long drive',
      'New arrivals this week (sample stock)',
    ],
    praise: 'Friendly handover and no pressure. Thank you!',
    critical: 'I waited 40 minutes past my service time and nobody updated me.',
    chat: 'Are you open on Sunday, and can I book a test drive?',
    chatAnswer: 'Showroom hours are on the Contact page; test drives need a person to confirm the vehicle and time',
  },
  {
    sector: 'training',
    label: 'training centre',
    offer: 'the Sample Forklift Safety course (3 days)',
    offerShort: 'forklift safety course',
    channel: 'Website course page',
    enquiry:
      'I am looking for the forklift safety course for four staff next month. Do you run it on weekdays, and can the company be invoiced?',
    meet: 'course walkthrough call',
    meetLong: 'a free 20-minute course walkthrough call',
    quietReason: 'asked for group dates and a quote nine days ago, opened the quote twice, no reply since',
    quietAsk: 'group dates and the quote',
    proposal: [
      'Course: Forklift Safety, four places',
      'Dates: two weekday options',
      'Group booking terms (draft, to be confirmed by you)',
      'Prerequisites checklist for the four learners',
    ],
    afterVisit: 'finished the course on Friday',
    visitKind: 'course',
    reminder: 'class on Tuesday at 18:00',
    gap: 'two empty seats in next Tuesday’s class',
    posts: ['Learner story (with permission)', 'What to bring on day one', 'New course dates'],
    praise: 'Clear trainer and practical exercises. I felt ready for the assessment.',
    critical: 'The course notes arrived late and the room was cold on day one.',
    chat: 'Do you have evening classes, and can I pay in two parts?',
    chatAnswer: 'Evening dates are listed on the course page; payment terms need a person to confirm',
  },
  {
    sector: 'agency',
    label: 'agency',
    offer: 'the Sample website refresh package',
    offerShort: 'website refresh',
    channel: 'Website contact form',
    enquiry:
      'We run a small clinic and our website feels dated. Could someone call us about a refresh and monthly updates?',
    meet: 'discovery call',
    meetLong: 'a 20-minute discovery call',
    quietReason: 'opened the proposal twice and asked about the timeline nine days ago, with no reply since',
    quietAsk: 'the timeline and what the monthly updates include',
    proposal: [
      'Scope: a five-page refresh',
      'Timeline: two start-date options',
      'Monthly updates: what is included and what is not',
      'Assumptions: content supplied by the client',
    ],
    afterVisit: 'launched the new site last week',
    visitKind: 'launch',
    reminder: 'monthly review call on Wednesday at 11:00',
    gap: 'an open Friday 10:00 review slot',
    posts: ['Before and after (sample project)', 'Three quick wins for your site', 'Meet the team'],
    praise: 'A calm process, and the new site is easy for us to update.',
    critical: 'The first draft missed our opening hours.',
    chat: 'Do you also manage social media, and what happens on a first call?',
    chatAnswer: 'Services are listed on the Services page; what a first call covers is easy to explain',
  },
];
