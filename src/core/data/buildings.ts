import type { Agent, AgentKind, Building, BuildingKind, Floor, TaskSetId } from '../types';
import { DEALERSHIP_TASKS, FAST_SALES_TASKS, SOCIAL_TASKS } from './tasks';

type Desk = [role: string, set: TaskSetId, categories?: string[]];

const SOCIAL = SOCIAL_TASKS.map(t => t.name);

/** "Dealership building": L12 → L4 departments, L3–L1 empty. */
const DEALER_DEPTS: [string, string, Desk[]][] = [
  ['Sales Dept.', 'Showroom sales: follow up on prospects, conquest and referral business.', [
    ['closer', 'dealership', ['New customers', 'Unsold prospects', 'Conquest', 'Referrals']],
    ['follow-up', 'dealership', ['Unsold prospects', 'Orphans', 'Lost / out of the market', 'Mastermind']],
    ['greeter', 'dealership', ['New customers', 'Referrals', 'Customer birthday']],
  ]],
  ['Internet Sales Dept.', 'Web, chat and third-party leads – fastest response wins.', [
    ['web leads', 'dealership', ['New customers', 'Unsold prospects', 'Conquest']],
    ['chat', 'dealership', ['New customers', 'Referrals']],
    ['follow-up', 'dealership', ['Unsold prospects', 'Lost / out of the market', 'Orphans']],
  ]],
  ['Finance Dept.', 'F&I, lease-end and loyalty: keep sold customers in the family.', [
    ['F&I', 'dealership', ['Sold customers', 'Ownership anniversary']],
    ['lease end', 'dealership', ['Lease end', 'Ownership anniversary']],
    ['credit', 'dealership', ['Unsold prospects', 'Sold customers']],
  ]],
  ['Social Media Dept.', 'Content, ads and community for the dealership.', [
    ['content', 'social', SOCIAL], ['ads', 'social', SOCIAL], ['community', 'social', SOCIAL],
  ]],
  ['Service Dept.', 'Service visits, CSI and birthday / anniversary touches.', [
    ['service visits', 'dealership', ['Service visits', 'Customer birthday']],
    ['CSI', 'dealership', ['CSI follow', 'Ownership anniversary']],
    ['recalls', 'dealership', ['Service visits', 'Sold customers']],
  ]],
  ['Parts Dept.', 'Parts orders and follow-up with service and retail customers.', [
    ['parts orders', 'dealership', ['Service visits', 'Sold customers']],
    ['follow-up', 'dealership', ['CSI follow', 'Service visits']],
  ]],
  ['Body Shop Dept.', 'Estimates, repairs and post-repair CSI.', [
    ['estimates', 'dealership', ['Service visits', 'Referrals']],
    ['follow-up', 'dealership', ['CSI follow', 'Referrals']],
  ]],
  ['Administrative Dept.', 'Store manager runs the reports and keeps leads moving.', [
    ['manager', 'manager', ['Mastermind', 'Orphans']],
    ['scheduling', 'dealership', ['Orphans', 'Mastermind', 'CSI follow']],
  ]],
  ['HR Dept.', 'Recruiting and onboarding new associates.', [
    ['recruiting', 'none'], ['onboarding', 'none'],
  ]],
];

/** "Fast Sales Training Center – Building 1". */
const TRAINING_FLOORS: [number, string, string, Desk[]][] = [
  [11, 'How to Become an Auto Sales Associate', 'Individual Program – enroll new sales associates.', courseDesks()],
  [10, 'How to Become an Auto F&I Manager', 'F&I Manager Program.', courseDesks()],
  [9, 'How to Become an Auto Broker', 'Auto Broker Program.', courseDesks()],
  [8, 'How to Improve Auto Sales Phone Skills', 'Phone skills course.', courseDesks()],
  [7, 'How to Overcome Auto Sales Objections', 'Objection-handling course.', courseDesks()],
  [6, 'The Essential Auto Dealership Guide', 'The dealership guide course.', courseDesks()],
  [5, 'Dealership Packages', 'Training packages sold to dealerships.', [
    ['dealers', 'fastSales', ['New customers', 'Current customers', 'Contract to expire']],
    ['closer', 'fastSales', ['New leads', 'Unsold', 'Follow-up']],
    ['contracts', 'fastSales', ['Contract to expire', 'Sold customers']],
  ]],
  [4, 'Amazon Books', 'Fast Sales books on Amazon.', [
    ['book sales', 'fastSales', ['New customers', 'Current customers', 'Referrals']],
    ['reviews', 'social', SOCIAL],
  ]],
  [3, 'Affiliates', 'Affiliate partners who refer students and dealers.', [
    ['new affiliates', 'fastSales', ['New affiliates']],
    ['affiliate follow-up', 'fastSales', ['Affiliates follow-up']],
  ]],
];
function courseDesks(): Desk[] {
  return [
    ['enrollment', 'fastSales', ['New leads', 'New customers', 'Unsold']],
    ['follow-up', 'fastSales', ['Follow-up', 'Unsold', 'Referrals']],
    ['students', 'fastSales', ['Current customers', 'Sold customers', 'Referrals']],
  ];
}

/** The reference office team (Admin / CEO / Accounting floor). */
const LEADERSHIP: [string, string, AgentKind, TaskSetId, string[]?][] = [
  ['Elvis', 'owner', 'human', 'none'],
  ['Max', 'CEO', 'ai', 'manager', ['Follow-up', 'Current customers']],
  ['Vera', 'closer', 'ai', 'fastSales', ['New leads', 'Unsold', 'Follow-up']],
  ['Nico', 'follow-up', 'ai', 'fastSales', ['Follow-up', 'Unsold', 'Referrals']],
  ['Luna', 'content', 'ai', 'social', SOCIAL],
  ['Teo', 'ads', 'ai', 'social', SOCIAL],
  ['Iris', 'students', 'ai', 'fastSales', ['Current customers', 'Sold customers']],
  ['Dante', 'dealers', 'ai', 'fastSales', ['Contract to expire', 'New customers', 'Current customers']],
];

const NEW_CAR_ASSOCIATES = ['Javier', 'Andre', 'Josiah', 'Luiz', 'Abdul', 'Bilal', 'Claudia', 'Frank', 'Seyling', 'Shaher', 'Jolson', 'Rafael', 'Soco', 'Will', 'Anarkis'];
const USED_CAR_ASSOCIATES = ['Federico', 'Jeffrey', 'John', 'Reymer', 'Wayne', 'Clarissa'];

export const BRAND_MODELS: Record<string, string[]> = {
  Audi: ['Q5', 'A4', 'Q7', 'e-tron GT'], Honda: ['CR-V', 'Civic', 'Accord', 'Pilot', 'HR-V'],
  Hyundai: ['Tucson', 'Santa Fe', 'Ioniq 5', 'Elantra'], Genesis: ['GV80', 'GV70', 'G70', 'G80'],
  Acura: ['MDX', 'RDX', 'Integra', 'TLX'], Volkswagen: ['Tiguan', 'Atlas', 'ID.4', 'Jetta'],
  'Alfa Romeo': ['Giulia', 'Stelvio', 'Tonale'], Maserati: ['Grecale', 'Levante', 'MC20', 'GranTurismo'],
  Fiat: ['500e', '500X'],
};

const AI_NAMES = [
  'Ava', 'Kai', 'Mila', 'Leo', 'Zara', 'Omar', 'Nora', 'Eli', 'Ruby', 'Finn', 'Lena', 'Hugo', 'Maya', 'Arlo', 'Ivy',
  'Jude', 'Sage', 'Rio', 'Noa', 'Cleo', 'Remy', 'Juno', 'Axel', 'Lux', 'Otis', 'Pia', 'Rex', 'Tess', 'Uma', 'Vik',
  'Wren', 'Yara', 'Zed', 'Bea', 'Cruz', 'Dex', 'Elle', 'Faye', 'Gus', 'Hana', 'Ines', 'Jax', 'Kira', 'Lio', 'Mae',
];
let nameIx = 0;
const nextAiName = () => AI_NAMES[nameIx++ % AI_NAMES.length];

export function defaultCategories(set: TaskSetId): string[] {
  return set === 'dealership' ? DEALERSHIP_TASKS : set === 'fastSales' ? FAST_SALES_TASKS : set === 'social' ? SOCIAL : [];
}

export function makeAgent(buildingId: string, floor: number, i: number, name: string, role: string, kind: AgentKind, taskSet: TaskSetId, categories?: string[]): Agent {
  return {
    id: `${buildingId}-L${floor}-${i}`, name, role, kind, taskSet,
    categories: categories ?? defaultCategories(taskSet),
    buildingId, floor, status: 'idle', done: 0,
  };
}

function vacant(level: number, name = 'Empty Floor', rent?: number): Floor {
  return { level, name, vacant: true, rent, agents: [] };
}

function staffed(buildingId: string, level: number, name: string, info: string, desks: Desk[]): Floor {
  return {
    level, name, info, vacant: false,
    agents: desks.map(([role, set, cats], i) => makeAgent(buildingId, level, i, nextAiName(), role, 'ai', set, cats)),
  };
}

function base(id: string, name: string, short: string, kind: BuildingKind, color: string, accent: string, x: number, z: number, floors: Floor[], w = 9, d = 9): Building {
  return { id, name, short, kind, color, accent, x, z, w, d, floors: floors.sort((a, b) => b.level - a.level) };
}

function dealership(id: string, brand: string, color: string, accent: string, x: number, z: number): Building {
  const floors: Floor[] = DEALER_DEPTS.map(([dept, info, desks], i) => staffed(id, 12 - i, dept, info, desks));
  floors.push(vacant(3), vacant(2), vacant(1));
  const b = base(id, `${brand} Dealership`, brand, 'dealership', color, accent, x, z, floors);
  b.brand = brand;
  return b;
}

function rental(n: number, color: string, x: number, z: number): Building {
  const floors = Array.from({ length: 12 }, (_, i) => vacant(i + 1, 'Floor for Rent', 199));
  return base(`rental-${n}`, `Rental Building ${n}`, `Rental ${n}`, 'rental', color, '#ffffff', x, z, floors);
}

function associates(id: string, name: string, short: string, totalFloors: number, people: string[], color: string, x: number, z: number): Building {
  const floors: Floor[] = [];
  for (let level = 1; level <= totalFloors; level++) {
    const person = people[level - 1];
    if (!person) { floors.push(vacant(level)); continue; }
    floors.push({
      level, name: `${person}'s office`, vacant: false,
      info: `${person}'s personal sales office with a follow-up AI and a social media AI.`,
      agents: [
        makeAgent(id, level, 0, person, 'associate', 'human', 'none'),
        makeAgent(id, level, 1, `${person}'s AI`, 'follow-up', 'ai', 'dealership'),
        makeAgent(id, level, 2, nextAiName(), 'social', 'ai', 'social'),
      ],
    });
  }
  const b = base(id, name, short, 'associates', color, '#ffffff', x, z, floors, 8, 8);
  b.brand = 'Honda';
  return b;
}

function trainingCenter(): Building {
  const id = 'fast-sales';
  const floors: Floor[] = [{
    level: 12, name: 'Admin / CEO / Accounting', vacant: false, info: 'Owner, CEO and the core sales team.',
    agents: LEADERSHIP.map(([n, role, kind, set, cats], i) => makeAgent(id, 12, i, n, role, kind, set, cats)),
  }];
  for (const [level, name, info, desks] of TRAINING_FLOORS) floors.push(staffed(id, level, name, info, desks));
  floors.push(vacant(2), vacant(1));
  return base(id, 'Fast Sales Training Center', 'Fast Sales', 'training', '#f2efe6', '#f5b335', 0, 0, floors, 14, 12);
}

/** Lead source → owning Training Center floor. */
export const TRAINING_SOURCES: [source: string, interest: string, floor: number][] = [
  ['Individual Program Website', 'Individual Program', 11],
  ['F&I Manager Program Website', 'F&I Manager', 10],
  ['Auto Broker Program Website', 'Auto Broker', 9],
  ['Phone Skills Course', 'Phone skills', 8],
  ['Objections Course', 'Objection handling', 7],
  ['Dealership Guide', 'Dealership guide', 6],
  ['Dealership Packages', 'Dealer package', 5],
  ['Amazon Books', 'Book buyer', 4],
];

const S = 20; // lot spacing

/**
 * City layout: 5 × 3 grid of lots, Fast Sales Training Center in the middle,
 * Rick Case Honda's associate buildings flanking it next to the Honda dealership.
 */
export function buildCity(): Building[] {
  nameIx = 0;
  return [
    dealership('audi', 'Audi', '#e8e4dc', '#bb0a30', -2 * S, -S),
    dealership('honda', 'Honda', '#f28b82', '#cc0000', -S, -S),
    dealership('hyundai', 'Hyundai', '#7fa7d9', '#002c5f', 0, -S),
    dealership('genesis', 'Genesis', '#b9a58c', '#1a1a1a', S, -S),
    dealership('acura', 'Acura', '#9ad1c4', '#2b2b2b', 2 * S, -S),
    rental(1, '#f6c26b', -2 * S, 0),
    associates('rc-new', 'Rick Case Honda · New Cars Sales Associates', 'RC New Cars', 15, NEW_CAR_ASSOCIATES, '#f4a6c1', -S, 0),
    trainingCenter(),
    associates('rc-used', 'Rick Case Honda · Used Cars Sales Associates', 'RC Used Cars', 12, USED_CAR_ASSOCIATES, '#a8d58a', S, 0),
    rental(2, '#c6b3f0', 2 * S, 0),
    dealership('volkswagen', 'Volkswagen', '#8fb8e8', '#001e50', -2 * S, S),
    dealership('alfa-romeo', 'Alfa Romeo', '#e57373', '#8f0c19', -S, S),
    dealership('maserati', 'Maserati', '#5c6f91', '#0c2340', 0, S),
    dealership('fiat', 'Fiat', '#f7a072', '#a6192e', S, S),
    rental(3, '#80cbc4', 2 * S, S),
  ];
}
