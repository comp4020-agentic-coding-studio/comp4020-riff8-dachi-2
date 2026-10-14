// What the HUD and the renderer share about how the player is looking at the
// world: the current tool, the target, and display preferences.
import type { BuildingType } from "../shared/content.ts";

export type Tool = "harvest" | "build" | "inspect" | "demolish" | "mark";

export interface View {
  tool: Tool;
  build: BuildingType | null;
  /** the tile under the crosshair, written by the renderer every frame */
  hover: [number, number] | null;
  keyboardTarget: boolean;
  /** survey: remaining stock glows and shows through everything */
  survey: boolean;
  selected: number | null;
  reducedMotion: boolean;
  low: boolean;
}

export const PLAYER_COLOURS = ["#e8735a", "#4f9de0", "#f2c14e", "#8fcf6a", "#b47ce0", "#f08ab8", "#4fc6b8", "#c9905a"];
