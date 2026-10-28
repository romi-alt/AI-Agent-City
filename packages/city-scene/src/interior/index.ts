export { DemoOfficeScene, type DemoAgent, type DemoOfficeSceneProps } from './DemoOfficeScene.tsx';
export { Interior } from './Interior.tsx';
export {
  type DeskOccupant,
  type OfficeOccupants,
  OfficeOccupantsContext,
  statusColor,
  statusLabel,
} from './occupants.ts';
export { deskLabel, deskWorld, occupantsFromLayout } from './placement.ts';
export { planOffice, variantFor, type OfficePlan, type Workstation } from './plan.ts';
export { ReferenceDesks, type ReferenceDesksProps } from './desks.tsx';
export { ToyAgent } from './figure.tsx';
export { REF_DESK, RefChair, RefDeskTop, refMat } from './furniture.tsx';
export { REF_ROLE_TEXT, REF_SHIRT, REF_STATUS, refStatusColor } from './occupants.ts';
export { REF_DESK_TOP, referenceDeskWorld, referencePlanFor, seatKindOf } from './placement.ts';
export {
  isLeadRole,
  planReferenceOffice,
  type RefDesk,
  type ReferencePlan,
  type RefRug,
  refSeatPosition,
  type SeatKind,
} from './plan.ts';
