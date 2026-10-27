import type { Agent, AgentKind, Building, BuildingKind, Floor, TaskSetId } from '../types';

const DEALER_DEPTS = [
  'Sales Dept.', 'Internet Sales Dept.', 'Finance Dept.', 'Social Media Dept.', 'Service Dept.',
  'Parts Dept.', 'Body Shop Dept.', 'Administrative Dept.', 'HR Dept.',
];

/** Desk roles staffed by AI agents on each department floor. */
const DEPT_ROLES: Record<string, [string, TaskSetId][]> = {
  'Sales Dept.': [['closer', 'dealership'], ['follow-up', 'dealership'], ['greeter', 'dealership']],
  'Internet Sales Dept.': [['web leads', 'dealership'], ['chat', 'dealership'], ['follow-up', 'dealership']],
  'Finance Dept.': [['F&I', 'dealership'], ['lease end', 'dealership'], ['credit', 'dealership']],
  'Social Media Dept.': [['content', 'social'], ['ads', 'social'], ['community', 'social']],
  'Service Dept.': [['service visits', 'dealership'], ['CSI', 'dealership'], ['recalls', 'dealership']],
  'Parts Dept.': [['parts orders', 'dealership'], ['follow-up', 'dealership']],
  'Body Shop Dept.': [['estimates', 'dealership'], ['follow-up', 'dealership']],
  'Administrative Dept.': [['reports', 'dealership'], ['scheduling', 'dealership']],
  'HR Dept.': [['recruiting', 'none'], ['onboarding', 'none']],
};

const TRAINING_FLOORS: [number, string, [string, string, AgentKind, TaskSetId][]][] = [
  [12, 'Admin / CEO / Accounting', [
    ['Elvis', 'owner', 'human', 'none'], ['Max', 'CEO', 'ai', 'fastSales'], ['Vera', 'closer', 'ai', 'fastSales'],
    ['Nico', 'follow-up', 'ai', 'fastSales'], ['Luna', 'content', 'ai', 'social'], ['Teo', 'ads', 'ai', 'social'],
    ['Iris', 'students', 'ai', 'fastSales'], ['Dante', 'dealers', 'ai', 'fastSales'],
  ]],
  [11, 'How to Become an Auto Sales Associate', []],
  [10, 'How to Become an Auto F&I Manager', []],
  [9, 'How to Become an Auto Broker', []],
  [8, 'How to Improve Auto Sales Phone Skills', []],
  [7, 'How to Overcome Auto Sales Objections', []],
  [6, 'The Essential Auto Dealership Guide', []],
  [5, 'Dealership Packages', []],
  [4, 'Amazon Books', []],
  [3, 'Affiliates', []],
];
const COURSE_ROLES: [string, TaskSetId][] = [['enrollment', 'fastSales'], ['follow-up', 'fastSales'], ['students', 'fastSales']];
const SPECIAL_ROLES: Record<number, [string, TaskSetId][]> = {
  5: [['dealers', 'fastSales'], ['closer', 'fastSales'], ['contracts', 'fastSales']],
  4: [['book sales', 'fastSales'], ['reviews', 'social']],
  3: [['new affiliates', 'fastSales'], ['affiliate follow-up', 'fastSales']],
};

const NEW_CAR_ASSOCIATES = ['Javier', 'Andre', 'Josiah', 'Luiz', 'Abdul', 'Bilal', 'Claudia', 'Frank', 'Seyling', 'Shaher', 'Jolson', 'Rafael', 'Soco', 'Will', 'Anarkis'];
const USED_CAR_ASSOCIATES = ['Federico', 'Jeffrey', 'John', 'Reymer', 'Wayne', 'Clarissa'];

const AI_NAMES = [
  'Ava', 'Kai', 'Mila', 'Leo', 'Zara', 'Omar', 'Nora', 'Eli', 'Ruby', 'Finn', 'Lena', 'Hugo', 'Maya', 'Arlo', 'Ivy',
  'Jude', 'Sage', 'Rio', 'Noa', 'Cleo', 'Remy', 'Juno', 'Axel', 'Lux', 'Otis', 'Pia', 'Rex', 'Tess', 'Uma', 'Vik',
  'Wren', 'Yara', 'Zed', 'Bea', 'Cruz', 'Dex', 'Elle', 'Faye', 'Gus', 'Hana', 'Ines', 'Jax', 'Kira', 'Lio', 'Mae',
];
let nameIx = 0;
const nextAiName = () => AI_NAMES[nameIx++ % AI_NAMES.length];

function agent(buildingId: string, floor: number, i: number, name: string, role: string, kind: AgentKind, taskSet: TaskSetId): Agent {
  return { id: `${buildingId}-L${floor}-${i}`, name, role, kind, taskSet, buildingId, floor, status: 'idle', done: 0 };
}

function vacant(level: number, name = 'Empty Floor', rent?: number): Floor {
  return { level, name, vacant: true, rent, agents: [] };
}

function staffed(buildingId: string, level: number, name: string, roles: [string, TaskSetId][]): Floor {
  return {
    level, name, vacant: false,
    agents: roles.map(([role, set], i) => agent(buildingId, level, i, nextAiName(), role, 'ai', set)),
  };
}

function base(id: string, name: string, short: string, kind: BuildingKind, color: string, accent: string, x: number, z: number, floors: Floor[], w = 9, d = 9): Building {
  return { id, name, short, kind, color, accent, x, z, w, d, floors: floors.sort((a, b) => b.level - a.level) };
}

function dealership(id: string, brand: string, color: string, accent: string, x: number, z: number): Building {
  const floors: Floor[] = DEALER_DEPTS.map((dept, i) => staffed(id, 12 - i, dept, DEPT_ROLES[dept]));
  floors.push(vacant(3), vacant(2), vacant(1));
  return base(id, `${brand} Dealership`, brand, 'dealership', color, accent, x, z, floors);
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
      agents: [
        agent(id, level, 0, person, 'associate', 'human', 'none'),
        agent(id, level, 1, `${person}'s AI`, 'follow-up', 'ai', 'dealership'),
        agent(id, level, 2, nextAiName(), 'social', 'ai', 'social'),
      ],
    });
  }
  return base(id, name, short, 'associates', color, '#ffffff', x, z, floors, 8, 8);
}

function trainingCenter(): Building {
  const id = 'fast-sales';
  const floors: Floor[] = TRAINING_FLOORS.map(([level, name, team]) =>
    team.length
      ? { level, name, vacant: false, agents: team.map(([n, role, kind, set], i) => agent(id, level, i, n, role, kind, set)) }
      : staffed(id, level, name, SPECIAL_ROLES[level] ?? COURSE_ROLES));
  floors.push(vacant(2), vacant(1));
  return base(id, 'Fast Sales Training Center', 'Fast Sales', 'training', '#f2efe6', '#f5b335', 0, 0, floors, 14, 12);
}

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
