import '@testing-library/jest-dom'

// jsdom has no AudioContext / AnalyserNode — provide stubs so the mixer DSP
// can be unit-tested without a real graph. Real playback still needs a real
// browser.

class FakeAudioParam {
  value = 0
  cancelScheduledValues() {}
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  setTargetAtTime() {}
  exponentialRampToValueAtTime() {}
  cancelAndHoldAtTime() {}
}

class FakeGainNode {
  gain = new FakeAudioParam()
  connect() {}
  disconnect() {}
}

class FakeBiquadFilterNode {
  type = ''
  frequency = new FakeAudioParam()
  Q = new FakeAudioParam()
  gain = new FakeAudioParam()
  connect() {}
  disconnect() {}
}

class FakeBufferSourceNode {
  buffer: AudioBuffer | null = null
  loop = false
  playbackRate = new FakeAudioParam()
  connect() {}
  disconnect() {}
  start() {}
  stop() {}
  onended: (() => void) | null = null
}

class FakeAnalyserNode {
  fftSize = 2048
  frequencyBinCount = 1024
  smoothingTimeConstant = 0.5
  getByteTimeDomainData(_arr: Uint8Array) {
    // Filled with silence so meters read 0.
    for (let i = 0; i < _arr.length; i++) _arr[i] = 128
  }
  getByteFrequencyData(_arr: Uint8Array) {
    for (let i = 0; i < _arr.length; i++) _arr[i] = 0
  }
  connect() {}
  disconnect() {}
}

class FakeAudioContext {
  state = 'running'
  currentTime = 0
  destination = {}
  createGain() { return new FakeGainNode() }
  createBufferSource() { return new FakeBufferSourceNode() }
  createBiquadFilter() { return new FakeBiquadFilterNode() }
  createAnalyser() { return new FakeAnalyserNode() }
  async resume() { this.state = 'running' }
  async decodeAudioData(_buf: ArrayBuffer) {
    return {
      duration: 10,
      sampleRate: 44100,
      length: 1,
      numberOfChannels: 1,
      getChannelData() { return new Float32Array(0) },
    }
  }
  close() { return Promise.resolve() }
}

const w = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown }
if (typeof w.AudioContext === 'undefined') {
  w.AudioContext = FakeAudioContext as unknown as typeof AudioContext
  w.webkitAudioContext = FakeAudioContext as unknown as typeof AudioContext
}