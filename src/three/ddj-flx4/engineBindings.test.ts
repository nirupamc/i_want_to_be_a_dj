import { describe, it, expect, beforeEach } from "vitest";
import { ControlAdapter, buildBindingTable } from "./engineBindings";
import { CONTROL_IDS, padId } from "./controlIds";

// The engine bindings are pure data — they don't need a real engine for
// unit tests. Dispatcher wiring is covered in dispatcher.test.ts.
function makeAdapter(): { adapter: ControlAdapter } {
  const adapter = new ControlAdapter(buildBindingTable());
  return { adapter };
}

function makeControl(id: string): { id: string } {
  return { id };
}

describe("M12B engine bindings — input dispatch", () => {
  let adapter: ControlAdapter;

  beforeEach(() => {
    const r = makeAdapter();
    adapter = r.adapter;
  });

  it("PLAY A pointerdown toggles isPlaying on deck 0", () => {
    // Track must be loaded for play to be meaningful; load a fake track.
    // We can't decode audio in jsdom, so we test the action *type* instead.
    const actions = adapter.onDown(makeControl(CONTROL_IDS.decks.left.play) as never);
    expect(actions).toHaveLength(1);
    // Marker type that the dispatcher rewrites:
    expect((actions[0] as { type: string }).type).toBe("TOGGLE_PLAY_FOR_DECK");
  });

  it("CUE A/B pointerdown dispatches CUE_DOWN", () => {
    expect(adapter.onDown(makeControl(CONTROL_IDS.decks.left.cue) as never)[0]).toEqual({ type: "CUE_DOWN", deck: 0 });
    expect(adapter.onUp(makeControl(CONTROL_IDS.decks.left.cue) as never)[0]).toEqual({ type: "CUE_UP", deck: 0 });
    expect(adapter.onDown(makeControl(CONTROL_IDS.decks.right.cue) as never)[0]).toEqual({ type: "CUE_DOWN", deck: 1 });
  });

  it("SHIFT dispatches SHIFT_DOWN/UP", () => {
    expect(adapter.onDown(makeControl(CONTROL_IDS.decks.left.shift) as never)[0]).toEqual({ type: "SHIFT_DOWN" });
    expect(adapter.onUp(makeControl(CONTROL_IDS.decks.left.shift) as never)[0]).toEqual({ type: "SHIFT_UP" });
  });

  it("SYNC dispatches TOGGLE_BEAT_SYNC per deck", () => {
    expect(adapter.onDown(makeControl(CONTROL_IDS.decks.left.sync) as never)[0]).toEqual({ type: "TOGGLE_BEAT_SYNC", deck: 0 });
    expect(adapter.onDown(makeControl(CONTROL_IDS.decks.right.sync) as never)[0]).toEqual({ type: "TOGGLE_BEAT_SYNC", deck: 1 });
  });

  it("Loop IN/OUT/4BEAT dispatch correctly per deck", () => {
    expect(adapter.onDown(makeControl(CONTROL_IDS.decks.left.loopIn) as never)[0]).toEqual({ type: "LOOP_IN", deck: 0 });
    expect(adapter.onDown(makeControl(CONTROL_IDS.decks.left.loopOut) as never)[0]).toEqual({ type: "LOOP_OUT", deck: 0 });
    expect(adapter.onDown(makeControl(CONTROL_IDS.decks.left.fourBeatExit) as never)[0]).toEqual({ type: "LOOP_4_BEAT", deck: 0 });
    expect(adapter.onDown(makeControl(CONTROL_IDS.decks.right.loopIn) as never)[0]).toEqual({ type: "LOOP_IN", deck: 1 });
  });

  it("Tempo fader dispatches SET_TEMPO_NORMALIZED marker", () => {
    const actions = adapter.onValue(makeControl(CONTROL_IDS.decks.left.tempo) as never, 0.75);
    expect(actions).toHaveLength(1);
    expect((actions[0] as { type: string }).type).toBe("SET_TEMPO_NORMALIZED");
  });

  it("Trim / EQ / CFX dispatch mapped values", () => {
    expect(adapter.onValue(makeControl(CONTROL_IDS.mixer.channel1.trim) as never, 0.5)).toEqual([{ type: "SET_TRIM", deck: 0, db: -30.5 }]);
    expect(adapter.onValue(makeControl(CONTROL_IDS.mixer.channel1.eqHigh) as never, 0.5)).toEqual([{ type: "SET_EQ_HIGH", deck: 0, db: 0 }]);
    expect(adapter.onValue(makeControl(CONTROL_IDS.mixer.channel1.cfx) as never, 0.5)).toEqual([{ type: "SET_FILTER", deck: 0, p: 0 }]);
  });

  it("Channel fader + crossfader dispatch", () => {
    expect(adapter.onValue(makeControl(CONTROL_IDS.mixer.channel1.fader) as never, 0.6)).toEqual([{ type: "SET_CHANNEL_FADER", deck: 0, fader: 0.6 }]);
    expect(adapter.onValue(makeControl(CONTROL_IDS.mixer.crossfader) as never, 1)).toEqual([{ type: "SET_CROSSFADER", x: 1 }]);
    expect(adapter.onValue(makeControl(CONTROL_IDS.mixer.crossfader) as never, -1)).toEqual([{ type: "SET_CROSSFADER", x: 0 }]);
  });

  it("Pads dispatch PAD_DOWN/PAD_UP per deck and index", () => {
    expect(adapter.onDown(makeControl(padId("left", 1)) as never)).toEqual([{ type: "PAD_DOWN", deck: 0, padIndex: 0 }]);
    expect(adapter.onUp(makeControl(padId("right", 8)) as never)).toEqual([{ type: "PAD_UP", deck: 1, padIndex: 7 }]);
  });

  it("Pad mode buttons dispatch SET_PAD_MODE", () => {
    expect(adapter.onDown(makeControl(CONTROL_IDS.decks.left.hotCueMode) as never)).toEqual([{ type: "SET_PAD_MODE", deck: 0, mode: "HOT_CUE" }]);
    expect(adapter.onDown(makeControl(CONTROL_IDS.decks.right.beatJumpMode) as never)).toEqual([{ type: "SET_PAD_MODE", deck: 1, mode: "BEAT_JUMP" }]);
    expect(adapter.onDown(makeControl(CONTROL_IDS.decks.left.samplerMode) as never)).toEqual([{ type: "SET_PAD_MODE", deck: 0, mode: "SAMPLER" }]);
  });

  it("Pad FX1 mode is unbound (no actions)", () => {
    expect(adapter.onDown(makeControl(CONTROL_IDS.decks.left.padFx1Mode) as never)).toEqual([]);
    expect(adapter.listUnbound()).toContain(CONTROL_IDS.decks.left.padFx1Mode);
  });

  it("Loop call left/right are unbound", () => {
    expect(adapter.onDown(makeControl(CONTROL_IDS.decks.left.callLeft) as never)).toEqual([]);
    expect(adapter.onDown(makeControl(CONTROL_IDS.decks.right.callRight) as never)).toEqual([]);
  });

  it("Headphones/Mic are unbound (not in engine state)", () => {
    expect(adapter.onValue(makeControl(CONTROL_IDS.mixer.headphones.mix) as never, 0.3)).toEqual([]);
    expect(adapter.onValue(makeControl(CONTROL_IDS.mixer.mic.level) as never, 0.3)).toEqual([]);
  });

  it("Browse encoder dispatches LIBRARY_SELECT marker", () => {
    const a = adapter.onValue(makeControl(CONTROL_IDS.browse.encoder) as never, 0.5);
    expect(a).toHaveLength(1);
    expect((a[0] as { type: string }).type).toBe("LIBRARY_SELECT");
  });

  it("Load A/B dispatch LIBRARY_LOAD marker", () => {
    expect(adapter.onDown(makeControl(CONTROL_IDS.browse.load1) as never)).toEqual([{ type: "LIBRARY_LOAD", deck: 0 }]);
    expect(adapter.onDown(makeControl(CONTROL_IDS.browse.load2) as never)).toEqual([{ type: "LIBRARY_LOAD", deck: 1 }]);
  });

  it("Beat FX bindings dispatch correct actions", () => {
    expect(adapter.onDown(makeControl(CONTROL_IDS.fx.onOff) as never)).toEqual([{ type: "TOGGLE_BEAT_FX" }]);
    expect(adapter.onValue(makeControl(CONTROL_IDS.fx.levelDepth) as never, 0.42)).toEqual([{ type: "SET_BEAT_FX_DEPTH", depth: 0.42 }]);
    // Type selector snaps to one of the 5 types
    const typeAction = adapter.onValue(makeControl(CONTROL_IDS.fx.select) as never, 0.0);
    expect(typeAction[0]).toEqual({ type: "SET_BEAT_FX_TYPE", fxType: "ECHO" });
    const typeAction2 = adapter.onValue(makeControl(CONTROL_IDS.fx.select) as never, 0.99);
    expect(typeAction2[0]).toEqual({ type: "SET_BEAT_FX_TYPE", fxType: "FILTER" });
  });

  it("Smart CFX/Fader dispatch correct actions", () => {
    // The physical GLB has one Smart CFX button shared between decks.
    // The binding maps it to deck 0's toggle for simplicity; in a
    // future iteration the GLB could be split per-channel.
    expect(adapter.onDown(makeControl(CONTROL_IDS.mixer.smartCfx) as never)).toEqual([{ type: "TOGGLE_SMART_CFX", deck: 0 }]);
    expect(adapter.onDown(makeControl(CONTROL_IDS.mixer.smartFader) as never)).toEqual([{ type: "TOGGLE_SMART_FADER" }]);
  });

  it("Jog platter dispatches JOG_PLATTER_START/MOVE/END", () => {
    expect(adapter.onJogStart(makeControl(CONTROL_IDS.decks.left.jog) as never)).toEqual([{ type: "JOG_PLATTER_START", deck: 0 }]);
    const moveActions = adapter.onJogMove(makeControl(CONTROL_IDS.decks.left.jog) as never, { deltaRadians: 0.1, velocity: 0.5, direction: 1 });
    expect(moveActions[0]).toEqual({ type: "JOG_PLATTER_MOVE", deck: 0, deltaRadians: 0.1, velocity: 0.5, direction: "forward" });
    expect(adapter.onJogEnd(makeControl(CONTROL_IDS.decks.left.jog) as never)).toEqual([{ type: "JOG_PLATTER_END", deck: 0 }]);
  });

  it("Jog rim dispatches JOG_RIM_* actions", () => {
    const rimId = `${CONTROL_IDS.decks.left.jog}.rim`;
    expect(adapter.onJogStart(makeControl(rimId) as never)).toEqual([{ type: "JOG_RIM_START", deck: 0 }]);
    const move = adapter.onJogMove(makeControl(rimId) as never, { deltaRadians: -0.05, velocity: 0.2, direction: -1 });
    expect(move[0]).toEqual({ type: "JOG_RIM_MOVE", deck: 0, deltaRadians: -0.05, velocity: 0.2, direction: "backward" });
  });

  it("Jog rim is bound to a distinct binding from the platter", () => {
    const rim = adapter.getBinding(`${CONTROL_IDS.decks.left.jog}.rim`);
    expect(rim).toBeDefined();
    const plat = adapter.getBinding(CONTROL_IDS.decks.left.jog);
    expect(plat).toBeDefined();
    expect(rim).not.toBe(plat);
  });
});
