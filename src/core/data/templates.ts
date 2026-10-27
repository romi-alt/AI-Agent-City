/**
 * Built-in copy the agents use when no AI drafting is configured.
 * Placeholders: {first} lead first name, {store} dealership / company, {agent} agent name, {interest} vehicle or program.
 */

interface Copy { subject: string; email: string; text: string; call: string }

export const CATEGORY_COPY: Record<string, Copy> = {
  'New customers': {
    subject: 'Welcome to {store}, {first}!',
    email: 'Hi {first},\n\nThanks for reaching out about the {interest}. I\'m {agent} and I\'ll make this easy for you. When is a good time this week for a quick call or a visit?\n\nTalk soon,\n{agent}\n{store}',
    text: 'Hi {first}, it\'s {agent} at {store}. Thanks for your interest in the {interest}! When is a good time to chat?',
    call: 'Introduce yourself, confirm what they need from the {interest}, and book a time to come in.',
  },
  'Unsold prospects': {
    subject: 'Still thinking about the {interest}?',
    email: 'Hi {first},\n\nYou visited us recently and I wanted to check in. Has anything changed with your plans for the {interest}? I can put together updated numbers whenever you\'re ready.\n\n{agent}\n{store}',
    text: 'Hi {first}, {agent} from {store}. Still thinking about the {interest}? Happy to send fresh numbers.',
    call: 'Ask what held them back, share any new incentive, and invite them back for a second look.',
  },
  Orphans: {
    subject: '{first}, your new contact at {store}',
    email: 'Hi {first},\n\nYour previous salesperson has moved on, so I\'ll be your point of contact at {store}. If you need anything for your vehicle – service, trade-in values or questions – I\'m here.\n\n{agent}',
    text: 'Hi {first}, I\'m {agent}, your new contact at {store}. Reach me here anytime.',
    call: 'Introduce yourself as their new contact, check how the vehicle is doing, ask about household needs.',
  },
  Mastermind: {
    subject: 'A quick idea for you, {first}',
    email: 'Hi {first},\n\nOur team reviewed your file in this week\'s mastermind and we may be able to lower your payment or upgrade you with little change. Want me to run the numbers?\n\n{agent}\n{store}',
    text: '{first}, our team found a way you might upgrade with little payment change. Want details? – {agent}, {store}',
    call: 'Share the mastermind idea (equity / upgrade), ask permission to run numbers.',
  },
  'Sold customers': {
    subject: 'How are you enjoying your {interest}?',
    email: 'Hi {first},\n\nThank you again for your purchase! How is everything with the {interest}? If you have any questions about features, I\'m one message away.\n\n{agent}\n{store}',
    text: 'Hi {first}, {agent} from {store}. How are you liking the {interest}? Any questions, just text me.',
    call: 'Thank them, answer feature questions, ask for a review and referrals.',
  },
  'Customer birthday': {
    subject: 'Happy birthday, {first}! 🎉',
    email: 'Happy birthday, {first}!\n\nEveryone at {store} hopes you have a great day. Stop by this month for a little birthday gift from us.\n\n{agent}',
    text: 'Happy birthday, {first}! 🎉 From {agent} and everyone at {store}.',
    call: 'Wish them happy birthday and mention the birthday gift.',
  },
  'Ownership anniversary': {
    subject: 'Happy car-iversary, {first}!',
    email: 'Hi {first},\n\nIt\'s been a year since you drove home your {interest}! Thank you for being part of the {store} family. Want a free trade-in appraisal to see what it\'s worth today?\n\n{agent}',
    text: 'Happy car-iversary, {first}! One year with your {interest}. Want a free trade value? – {agent}',
    call: 'Celebrate the anniversary, offer a trade appraisal and service check.',
  },
  Referrals: {
    subject: 'Know someone looking for a car?',
    email: 'Hi {first},\n\nOur best customers come from people like you. If a friend or family member is shopping, send them my way – we\'ll take great care of them and thank you for it.\n\n{agent}\n{store}',
    text: 'Hi {first}, know anyone shopping for a car? Send them to me and I\'ll take care of them. – {agent}',
    call: 'Ask who they know that is shopping; explain the referral thank-you.',
  },
  'CSI follow': {
    subject: 'How did we do, {first}?',
    email: 'Hi {first},\n\nWe want to make sure your experience at {store} was a 10 out of 10. Was there anything we could have done better?\n\n{agent}',
    text: 'Hi {first}, how did we do on your recent visit to {store}? Reply with 1-10. – {agent}',
    call: 'Ask for their satisfaction score; fix anything below a 10 on the spot.',
  },
  'Lease end': {
    subject: 'Your lease is ending soon – let\'s plan ahead',
    email: 'Hi {first},\n\nYour lease is coming up. You have options: buy it out, trade it in or step into a new {interest}. Let\'s find the best one for you.\n\n{agent}\n{store}',
    text: 'Hi {first}, your lease is ending soon. Want to see your options? – {agent}, {store}',
    call: 'Review lease-end date and mileage, present buy-out vs. new lease.',
  },
  'Service visits': {
    subject: 'Time for service on your {interest}',
    email: 'Hi {first},\n\nYour {interest} is due for service. Book a time that works for you and we\'ll have you in and out fast.\n\n{agent}\n{store} Service',
    text: 'Hi {first}, your {interest} is due for service at {store}. Reply with a day that works!',
    call: 'Remind them service is due and book the appointment.',
  },
  Conquest: {
    subject: 'Thinking about switching? See the {interest}',
    email: 'Hi {first},\n\nIf you\'re driving another brand, you might be surprised how the {interest} compares. Come take a test drive – no pressure.\n\n{agent}\n{store}',
    text: 'Hi {first}, curious how the {interest} compares to what you drive now? Test drive on us. – {agent}',
    call: 'Ask what they drive now, compare key features, invite for a test drive.',
  },
  'Lost / out of the market': {
    subject: 'Checking in, {first}',
    email: 'Hi {first},\n\nI understand you went another direction or paused your search. If anything changes, I\'d love to help – and if you bought elsewhere, congratulations!\n\n{agent}\n{store}',
    text: 'Hi {first}, {agent} from {store}. If your plans change, I\'m here to help.',
    call: 'Confirm whether they bought; if not, re-open the conversation.',
  },
  // Fast Sales
  'Contract to expire': {
    subject: 'Your Fast Sales contract renews soon',
    email: 'Hi {first},\n\nYour {interest} contract with Fast Sales is coming up for renewal. Let\'s review results and what\'s next for your team.\n\n{agent}\nFast Sales Training Center',
    text: 'Hi {first}, your Fast Sales {interest} is up for renewal soon. Quick call this week? – {agent}',
    call: 'Review results so far, present renewal options.',
  },
  'Follow-up': {
    subject: 'Following up on the {interest}',
    email: 'Hi {first},\n\nFollowing up on your interest in the {interest}. Do you have any questions I can answer before you get started?\n\n{agent}\nFast Sales Training Center',
    text: 'Hi {first}, {agent} from Fast Sales. Any questions about the {interest}?',
    call: 'Answer questions about the program and book an enrollment call.',
  },
  Unsold: {
    subject: 'Still interested in the {interest}?',
    email: 'Hi {first},\n\nYou looked at the {interest} but haven\'t enrolled yet. Is timing or budget holding you back? We have payment options.\n\n{agent}\nFast Sales Training Center',
    text: 'Hi {first}, still interested in the {interest}? We have payment options. – {agent}, Fast Sales',
    call: 'Find the objection (time / money / fit) and handle it.',
  },
  'New affiliates': {
    subject: 'Partner with Fast Sales',
    email: 'Hi {first},\n\nWe\'d love to have you as a Fast Sales affiliate. You earn a commission for every student or dealership you refer.\n\n{agent}\nFast Sales Training Center',
    text: 'Hi {first}, want to earn by referring students to Fast Sales? – {agent}',
    call: 'Explain the affiliate program and send the sign-up link.',
  },
  'Affiliates follow-up': {
    subject: 'Your affiliate update',
    email: 'Hi {first},\n\nHere\'s a quick update on your referrals and some new material you can share this week.\n\n{agent}\nFast Sales Training Center',
    text: 'Hi {first}, new affiliate material is ready for you to share. – {agent}, Fast Sales',
    call: 'Review referrals, share new material, set goals.',
  },
  'New leads': {
    subject: 'Your Fast Sales {interest} info',
    email: 'Hi {first},\n\nThanks for your interest in the {interest}. Here\'s what\'s included and how to get started. Can we book a 15-minute call?\n\n{agent}\nFast Sales Training Center',
    text: 'Hi {first}, thanks for your interest in the Fast Sales {interest}! 15-min call this week? – {agent}',
    call: 'Qualify the lead and book the enrollment call.',
  },
  'Current customers': {
    subject: 'How is your training going?',
    email: 'Hi {first},\n\nChecking in on your progress in the {interest}. Need help with anything?\n\n{agent}\nFast Sales Training Center',
    text: 'Hi {first}, how is the {interest} going? Need anything? – {agent}',
    call: 'Check progress, unblock them, ask for a testimonial.',
  },
};

export function fill(t: string, v: Record<string, string>) {
  return t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
}

// ── social media ──────────────────────────────────────────────
export const PLATFORMS = ['Facebook', 'Instagram', 'LinkedIn', 'TikTok', 'YouTube'];
export const FORMATS = ['image', 'carousel', 'video', 'reel', 'story'] as const;
export const POST_TIMES = ['09:00', '12:30', '18:00'];

export const DEALER_TOPICS = [
  'New {model} arrivals on the lot', 'Lease deals on the {model} this month', 'Customer delivery spotlight',
  'Meet our sales team', 'Service special: oil change + inspection', '{model} vs. the competition',
  'Behind the scenes in our service bay', 'Trade-in value event', 'Certified pre-owned: why it matters',
  '3 features you didn\'t know the {model} has', 'Weekend test-drive event', 'Financing made simple',
];
export const TRAINING_TOPICS = [
  'How auto sales associates earn six figures', '5 phone scripts that book appointments', 'Overcoming "I need to think about it"',
  'Day in the life of an F&I manager', 'How to become an auto broker', 'Student success story',
  'The essential dealership guide – free chapter', 'Dealership training packages that lift CSI', 'New book on Amazon',
  'Join the Fast Sales affiliate program', 'Live Q&A: breaking into car sales', 'Top 3 objections and how to handle them',
];
export const HOOKS = ['Stop scrolling 👀', 'Here\'s the secret most people miss:', 'You asked, we answered.', 'This changes everything.', 'Real talk:', 'Quick tip 💡'];
export const CTAS = ['Book your test drive today', 'DM us "INFO" to learn more', 'Tap the link in bio', 'Call us today', 'Enroll now – spots are limited', 'Comment "YES" and we\'ll reach out'];

export const INBOX_SAMPLES: { intent: 'faq' | 'sensitive' | 'lead' | 'praise'; text: string; reply?: string }[] = [
  { intent: 'faq', text: 'What are your hours on Saturday?', reply: 'We\'re open 9am–7pm on Saturdays. See you soon!' },
  { intent: 'faq', text: 'Do you take trade-ins?', reply: 'Yes! Bring your vehicle in or send us the VIN for a quick estimate.' },
  { intent: 'faq', text: 'How long is the course?', reply: 'Most students finish in 4–6 weeks at their own pace.' },
  { intent: 'faq', text: 'Is this still available?', reply: 'Thanks for asking! Send us a DM and we\'ll check inventory for you right away.' },
  { intent: 'lead', text: 'I\'m interested, can someone call me?' },
  { intent: 'lead', text: 'How much would my payment be on this?' },
  { intent: 'lead', text: 'Can I sign up for the next class?' },
  { intent: 'praise', text: 'Great experience buying here! 🙌', reply: 'Thank you so much! We loved working with you.' },
  { intent: 'praise', text: 'Love this content, super helpful', reply: 'Thank you! More coming every week.' },
  { intent: 'sensitive', text: 'I was charged twice for my service visit and nobody calls me back.' },
  { intent: 'sensitive', text: 'Your salesperson was rude to me yesterday.' },
  { intent: 'sensitive', text: 'I want a refund for the course.' },
];
export const SOCIAL_HANDLES = ['@carlover22', '@jess_drives', '@mike.auto', '@sarahk', '@dealer_pro', '@newdriver', '@roadtrip_rob', '@lena.m', '@autofan', '@salesgrind'];

export const TREND_INSIGHTS = [
  'Short walk-around videos under 30s are outperforming photos on Instagram this week.',
  'EV tax-credit questions are trending in local search – good topic for a carousel.',
  '"Day in the life" career content is getting 2× engagement on TikTok.',
  'Payment-focused posts ("from $X/mo") get more clicks than price-focused posts.',
  'LinkedIn audiences respond to earnings and career-path content.',
];
export const COMPETITOR_INSIGHTS = [
  'Nearby competitor posts 2×/day on Instagram, mostly inventory photos with low engagement.',
  'A competitor is running a trade-in event ad – consider a stronger trade-value offer.',
  'Competitor TikTok uses salesperson personalities; their top video has 40k views.',
  'Competing training programs focus on price; we can lead with student results.',
];
export const OPTIMIZATION_INSIGHTS = [
  'Reels get 3× the reach of static images – shift two image slots per week to reels.',
  'Posts at 18:00 earn the most clicks; move lead-gen posts to the evening slot.',
  'Captions with a question in the hook get 40% more comments.',
  'Carousels with a price in slide 1 drive the most DMs.',
];
export const STRATEGY_INSIGHTS = [
  'This week: push lease specials + one customer story per day; test 3 ad variations.',
  'This month: build trust with behind-the-scenes and team content; 1 lead-gen campaign per week.',
  'Focus on the evening slot and reels; reply to every comment within an hour.',
];
