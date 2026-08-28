import { describe, it, expect } from "vitest";
import {
  eqNormalizedToDb,
  eqDbToNormalized,
  trimNormalizedToDb,
  trimDbToNormalized,
  filterNormalizedToParam,
  filterParamToNormalized,
  crossfaderFrom3D,
  crossfaderTo3D,
  tempoNormalizedToPercent,
  channelFaderFrom3D,
  channelFaderTo3D,
  masterLevelFrom3D,
  masterLevelTo3D,
} from "./valueMapping";

describe("M12B value mapping", () => {
  it("EQ exactly produces 0 dB at normalized 0.5", () => {
    expect(eqNormalizedToDb(0.5)).toBe(0);
    expect(eqDbToNormalized(0)).toBe(0.5);
  });

  it("EQ spans -26..+6 dB at the endpoints", () => {
    expect(eqNormalizedToDb(0)).toBeCloseTo(-26, 5);
    expect(eqNormalizedToDb(1)).toBeCloseTo(6, 5);
    expect(eqDbToNormalized(-26)).toBeCloseTo(0, 5);
    expect(eqDbToNormalized(6)).toBeCloseTo(1, 5);
  });

  it("EQ is asymmetric around 0 dB by design (preserve center detent)", () => {
    const upper = eqNormalizedToDb(0.75); // half of upper half
    const lower = eqNormalizedToDb(0.25); // half of lower half
    expect(upper).toBeCloseTo(3, 5);
    expect(lower).toBeCloseTo(-13, 5);
  });

  it("EQ round-trips", () => {
    for (const n of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const db = eqNormalizedToDb(n);
      const back = eqDbToNormalized(db);
      expect(back).toBeCloseTo(n, 5);
    }
  });

  it("Trim spans -70..+9 dB linearly", () => {
    expect(trimNormalizedToDb(0)).toBe(-70);
    expect(trimNormalizedToDb(1)).toBe(9);
    expect(trimDbToNormalized(-70)).toBe(0);
    expect(trimDbToNormalized(9)).toBe(1);
  });

  it("Filter spans -1..+1 with 0.5 → 0", () => {
    expect(filterNormalizedToParam(0.5)).toBe(0);
    expect(filterNormalizedToParam(0)).toBe(-1);
    expect(filterNormalizedToParam(1)).toBe(1);
    expect(filterParamToNormalized(0)).toBe(0.5);
  });

  it("Crossfader: 3D [-1..+1] ↔ engine [0..1]", () => {
    expect(crossfaderFrom3D(-1)).toBe(0);
    expect(crossfaderFrom3D(0)).toBe(0.5);
    expect(crossfaderFrom3D(1)).toBe(1);
    expect(crossfaderTo3D(0)).toBe(-1);
    expect(crossfaderTo3D(0.5)).toBe(0);
    expect(crossfaderTo3D(1)).toBe(1);
  });

  it("Crossfader round-trips", () => {
    for (const v of [-1, -0.5, 0, 0.5, 1]) {
      const e = crossfaderFrom3D(v);
      const back = crossfaderTo3D(e);
      expect(back).toBeCloseTo(v, 6);
    }
  });

  it("Tempo normalized → percent using current range", () => {
    expect(tempoNormalizedToPercent(0.5, 6)).toBe(0);
    expect(tempoNormalizedToPercent(0, 6)).toBe(-6);
    expect(tempoNormalizedToPercent(1, 6)).toBe(6);
    expect(tempoNormalizedToPercent(0.5, 100)).toBe(0);
    expect(tempoNormalizedToPercent(0, 100)).toBe(-100);
    expect(tempoNormalizedToPercent(1, 100)).toBe(100);
  });

  it("Channel fader 1:1 in [0..1]", () => {
    expect(channelFaderFrom3D(0.7)).toBe(0.7);
    expect(channelFaderTo3D(0.7)).toBe(0.7);
  });

  it("Master level 1:1 in [0..1]", () => {
    expect(masterLevelFrom3D(0.5)).toBe(0.5);
    expect(masterLevelTo3D(0.5)).toBe(0.5);
  });
});
