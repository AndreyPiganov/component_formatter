// Offsets are fractions of the two rotated objects' combined half-extents.
// An offset of 1 puts the objects edge to edge on that axis.
export interface ScenePlacement {
  assetId: string;
  relativeTo: string | null;
  dx: number;
  dy: number;
  rotation: number;
}
