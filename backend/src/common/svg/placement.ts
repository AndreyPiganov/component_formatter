// A unit offset along one axis places the rotated bounds edge to edge.
// Diagonal offsets follow an isometric footprint to allow for empty SVG corners.
export interface ScenePlacement {
  assetId: string;
  relativeTo: string | null;
  dx: number;
  dy: number;
  rotation: number;
}
