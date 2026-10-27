import type { Agent, AgentRole, City, Dealership } from './types';

const ROLES: AgentRole[] = ['greeter', 'sales', 'sales', 'finance', 'service', 'manager'];

function staff(dealerId: string, w: number, h: number): Agent[] {
  return ROLES.map((role, i) => ({
    id: `${dealerId}-${role}-${i}`,
    name: `${role[0].toUpperCase()}${role.slice(1)} ${i + 1}`,
    role,
    x: 1 + (i % (w - 2)),
    y: 1 + Math.floor(i / (w - 2)) % (h - 2),
  }));
}

function dealer(id: string, name: string, brand: string, color: string, x: number, y: number): Dealership {
  const w = 6, h = 5;
  return { id, name, brand, color, x, y, w, h, agents: staff(id, w, h) };
}

/** Placeholder layout: 2 rows of dealerships along a main boulevard. */
export const city: City = {
  width: 40,
  height: 24,
  tileSize: 24,
  dealerships: [
    dealer('toyota', 'Downtown Toyota', 'Toyota', '#d64545', 2, 2),
    dealer('honda', 'Honda Plaza', 'Honda', '#3b7dd8', 10, 2),
    dealer('ford', 'Ford Motors', 'Ford', '#2f5ea8', 18, 2),
    dealer('bmw', 'BMW Gallery', 'BMW', '#4aa3df', 26, 2),
    dealer('tesla', 'Tesla Studio', 'Tesla', '#9aa0a6', 2, 16),
    dealer('hyundai', 'Hyundai Center', 'Hyundai', '#2c4f8a', 10, 16),
    dealer('kia', 'Kia Auto Mall', 'Kia', '#c0392b', 18, 16),
    dealer('mercedes', 'Mercedes Hub', 'Mercedes', '#5f6b75', 26, 16),
  ],
};
