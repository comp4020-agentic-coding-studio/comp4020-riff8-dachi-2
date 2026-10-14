// Tile <-> world <-> screen. Tile (i, j) is a diamond centred on world
// iso(i, j); positions are in tile units, so the server's distance checks and
// the renderer agree on where things are.
export const TW = 64;
export const TH = 32;

export const toWorld = (x: number, y: number): [number, number] => [((x - y) * TW) / 2, ((x + y) * TH) / 2];

export const fromWorld = (wx: number, wy: number): [number, number] => {
  const a = wx / (TW / 2);
  const b = wy / (TH / 2);
  return [(a + b) / 2, (b - a) / 2];
};

export interface Camera {
  x: number; // world coords of the screen centre
  y: number;
  zoom: number;
  w: number; // css pixels
  h: number;
}

export const toScreen = (cam: Camera, wx: number, wy: number): [number, number] => [
  (wx - cam.x) * cam.zoom + cam.w / 2,
  (wy - cam.y) * cam.zoom + cam.h / 2,
];

export const screenToTile = (cam: Camera, sx: number, sy: number): [number, number] => {
  const wx = (sx - cam.w / 2) / cam.zoom + cam.x;
  const wy = (sy - cam.h / 2) / cam.zoom + cam.y;
  const [x, y] = fromWorld(wx, wy);
  return [Math.round(x), Math.round(y)];
};
