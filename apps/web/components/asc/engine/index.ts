import { W3 } from './dealers';
import { F3 } from './florida';
import { O3 } from './office';

// What the demo needs from the 3D engine. Imported on demand, so none of it is downloaded until a visitor opens the demo.
export const Office3D = O3.Office3D;
export const DemoWorld = W3.DemoWorld;
export const DEALERS = W3.DEALERS;
export const Florida = F3.Florida;
