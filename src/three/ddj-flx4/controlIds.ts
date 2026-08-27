// Semantic control IDs for the 3D DDJ-FLX4 layer.
// Names follow the handoff (docs/3d/INTEGRATION.md) and the
// legacy controlManifest.ts schema so M12B can later bind to the engine
// without renaming anything.

export const CONTROL_IDS = {
  // Decks — Left/Right map to physical A/B in the binding layer.
  decks: {
    left: {
      play: "deck.left.play",
      cue: "deck.left.cue",
      shift: "deck.left.shift",
      sync: "deck.left.beatSync",
      loopIn: "deck.left.loop.in",
      loopOut: "deck.left.loop.out",
      fourBeatExit: "deck.left.loop.4beatExit",
      callLeft: "deck.left.loop.callLeft",
      callRight: "deck.left.loop.callRight",
      hotCueMode: "deck.left.mode.hotCue",
      padFx1Mode: "deck.left.mode.padFx1",
      beatJumpMode: "deck.left.mode.beatJump",
      samplerMode: "deck.left.mode.sampler",
      tempo: "deck.left.tempo",
      jog: "deck.left.jog",
      pads: Array.from({ length: 8 }, (_, i) => `deck.left.pad.${String(i + 1).padStart(2, "0")}`)
    },
    right: {
      play: "deck.right.play",
      cue: "deck.right.cue",
      shift: "deck.right.shift",
      sync: "deck.right.beatSync",
      loopIn: "deck.right.loop.in",
      loopOut: "deck.right.loop.out",
      fourBeatExit: "deck.right.loop.4beatExit",
      callLeft: "deck.right.loop.callLeft",
      callRight: "deck.right.loop.callRight",
      hotCueMode: "deck.right.mode.hotCue",
      padFx1Mode: "deck.right.mode.padFx1",
      beatJumpMode: "deck.right.mode.beatJump",
      samplerMode: "deck.right.mode.sampler",
      tempo: "deck.right.tempo",
      jog: "deck.right.jog",
      pads: Array.from({ length: 8 }, (_, i) => `deck.right.pad.${String(i + 1).padStart(2, "0")}`)
    }
  },

  // Mixer — channel1 = A, channel2 = B
  mixer: {
    channel1: {
      trim: "mixer.channel1.trim",
      eqHigh: "mixer.channel1.eq.high",
      eqMid: "mixer.channel1.eq.mid",
      eqLow: "mixer.channel1.eq.low",
      cfx: "mixer.channel1.cfx",
      fader: "mixer.channel1.fader",
      cue: "mixer.channel1.cue"
    },
    channel2: {
      trim: "mixer.channel2.trim",
      eqHigh: "mixer.channel2.eq.high",
      eqMid: "mixer.channel2.eq.mid",
      eqLow: "mixer.channel2.eq.low",
      cfx: "mixer.channel2.cfx",
      fader: "mixer.channel2.fader",
      cue: "mixer.channel2.cue"
    },
    crossfader: "mixer.crossfader",
    master: {
      level: "mixer.master.level",
      cue: "mixer.master.cue"
    },
    mic: { level: "mixer.mic.level" },
    headphones: {
      mix: "mixer.headphones.mix",
      level: "mixer.headphones.level"
    },
    smartCfx: "mixer.smartCfx",
    smartFader: "mixer.smartFader"
  },

  // Browse / FX / Smart
  browse: {
    encoder: "browse.encoder",
    load1: "browse.load1",
    load2: "browse.load2"
  },

  fx: {
    select: "fx.select",
    beatLeft: "fx.beatLeft",
    beatRight: "fx.beatRight",
    onOff: "fx.onOff",
    channelSelect: "fx.channelSelect",
    levelDepth: "fx.levelDepth"
  }
} as const;

export function padId(side: "left" | "right", index1to8: number): string {
  return `deck.${side}.pad.${String(index1to8).padStart(2, "0")}`;
}

export function allExpectedIds(): string[] {
  const out: string[] = [];
  out.push(CONTROL_IDS.decks.left.jog, CONTROL_IDS.decks.right.jog);
  out.push(CONTROL_IDS.decks.left.tempo, CONTROL_IDS.decks.right.tempo);
  for (let i = 1; i <= 8; i += 1) {
    out.push(padId("left", i), padId("right", i));
  }
  for (const k of ["play", "cue", "shift", "sync", "loopIn", "loopOut", "fourBeatExit", "callLeft", "callRight", "hotCueMode", "padFx1Mode", "beatJumpMode", "samplerMode"] as const) {
    out.push(CONTROL_IDS.decks.left[k], CONTROL_IDS.decks.right[k]);
  }
  for (const c of [CONTROL_IDS.mixer.channel1, CONTROL_IDS.mixer.channel2] as const) {
    out.push(c.trim, c.eqHigh, c.eqMid, c.eqLow, c.cfx, c.fader, c.cue);
  }
  out.push(
    CONTROL_IDS.mixer.crossfader,
    CONTROL_IDS.mixer.master.level,
    CONTROL_IDS.mixer.master.cue,
    CONTROL_IDS.mixer.mic.level,
    CONTROL_IDS.mixer.headphones.mix,
    CONTROL_IDS.mixer.headphones.level,
    CONTROL_IDS.mixer.smartCfx,
    CONTROL_IDS.mixer.smartFader,
    CONTROL_IDS.browse.encoder,
    CONTROL_IDS.browse.load1,
    CONTROL_IDS.browse.load2,
    CONTROL_IDS.fx.select,
    CONTROL_IDS.fx.beatLeft,
    CONTROL_IDS.fx.beatRight,
    CONTROL_IDS.fx.onOff,
    CONTROL_IDS.fx.channelSelect,
    CONTROL_IDS.fx.levelDepth
  );
  return out;
}
