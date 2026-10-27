export type AgentRole = 'greeter' | 'sales' | 'finance' | 'service' | 'manager';

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  /** Position inside the building, in tiles relative to the building origin. */
  x: number;
  y: number;
}

export interface Dealership {
  id: string;
  name: string;
  brand: string;
  color: string;
  /** Top-left tile of the lot and its size in tiles. */
  x: number;
  y: number;
  w: number;
  h: number;
  agents: Agent[];
}

export interface City {
  width: number;
  height: number;
  tileSize: number;
  dealerships: Dealership[];
}
