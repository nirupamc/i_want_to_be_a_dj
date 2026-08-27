import { describe, it, expect } from 'vitest'
import {
  generateTrackId,
  inferTitle,
  matchesSearch,
  filterByStatus,
  sortTracks,
  applyLibraryQuery,
  findDuplicate,
  getLoadedDeckIds,
} from './libraryHelpers'
import type { LibraryTrack } from './libraryTypes'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTrack(overrides: Partial<LibraryTrack> = {}): LibraryTrack {
  return {
    id: 'test-1',
    name: 'test.mp3',
    title: 'Test Track',
    artist: 'Test Artist',
    fileName: 'test.mp3',
    fileSize: 1024000,
    lastModified: 1000,
    durationSeconds: 180,
    analyzedBpm: 128,
    bpmConfidence: 0.9,
    analysisStatus: 'ready',
    addedAt: 1000,
    lastPlayedAt: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// generateTrackId
// ---------------------------------------------------------------------------

describe('generateTrackId', () => {
  it('generates deterministic ID from file metadata', () => {
    const id = generateTrackId('song.mp3', 1024, 5000)
    expect(id).toBe('song.mp3-1024-5000')
  })

  it('different files produce different IDs', () => {
    const id1 = generateTrackId('song.mp3', 1024, 5000)
    const id2 = generateTrackId('song.mp3', 2048, 5000)
    expect(id1).not.toBe(id2)
  })
})

// ---------------------------------------------------------------------------
// inferTitle
// ---------------------------------------------------------------------------

describe('inferTitle', () => {
  it('removes .mp3 extension', () => {
    expect(inferTitle('my_song.mp3')).toBe('my song')
  })

  it('removes .wav extension', () => {
    expect(inferTitle('track-name.wav')).toBe('track name')
  })

  it('removes .flac extension', () => {
    expect(inferTitle('long_track.flac')).toBe('long track')
  })

  it('handles no extension', () => {
    expect(inferTitle('songname')).toBe('songname')
  })

  it('replaces underscores with spaces', () => {
    expect(inferTitle('my_track_name.mp3')).toBe('my track name')
  })
})

// ---------------------------------------------------------------------------
// matchesSearch
// ---------------------------------------------------------------------------

describe('matchesSearch', () => {
  const track = makeTrack({ title: 'Summer Vibes', artist: 'DJ Sun', fileName: 'summer_vibes.mp3' })

  it('empty query matches all', () => {
    expect(matchesSearch(track, '')).toBe(true)
  })

  it('matches title', () => {
    expect(matchesSearch(track, 'summer')).toBe(true)
  })

  it('matches artist', () => {
    expect(matchesSearch(track, 'sun')).toBe(true)
  })

  it('matches filename', () => {
    expect(matchesSearch(track, 'vibes')).toBe(true)
  })

  it('case insensitive', () => {
    expect(matchesSearch(track, 'SUMMER')).toBe(true)
    expect(matchesSearch(track, 'Sun')).toBe(true)
  })

  it('trims whitespace', () => {
    expect(matchesSearch(track, '  summer  ')).toBe(true)
  })

  it('no match returns false', () => {
    expect(matchesSearch(track, 'winter')).toBe(false)
  })

  it('null artist handled', () => {
    const noArtist = makeTrack({ artist: null })
    expect(matchesSearch(noArtist, 'test')).toBe(true)
    expect(matchesSearch(noArtist, 'artist')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// filterByStatus
// ---------------------------------------------------------------------------

describe('filterByStatus', () => {
  const tracks = [
    makeTrack({ id: '1', analysisStatus: 'ready' }),
    makeTrack({ id: '2', analysisStatus: 'analyzing' }),
    makeTrack({ id: '3', analysisStatus: 'failed' }),
    makeTrack({ id: '4', analysisStatus: 'idle' }),
  ]

  it('all returns all tracks', () => {
    expect(filterByStatus(tracks, 'all')).toHaveLength(4)
  })

  it('ready filter', () => {
    expect(filterByStatus(tracks, 'ready')).toHaveLength(1)
    expect(filterByStatus(tracks, 'ready')[0].id).toBe('1')
  })

  it('analyzing filter', () => {
    expect(filterByStatus(tracks, 'analyzing')).toHaveLength(1)
  })

  it('failed filter', () => {
    expect(filterByStatus(tracks, 'failed')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// sortTracks
// ---------------------------------------------------------------------------

describe('sortTracks', () => {
  const tracks = [
    makeTrack({ id: '1', title: 'Bravo', analyzedBpm: 120, addedAt: 3000 }),
    makeTrack({ id: '2', title: 'Alpha', analyzedBpm: 140, addedAt: 1000 }),
    makeTrack({ id: '3', title: 'Charlie', analyzedBpm: null, addedAt: 2000 }),
  ]

  it('sorts by title ascending', () => {
    const sorted = sortTracks(tracks, 'title', 'asc')
    expect(sorted.map((t) => t.title)).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  it('sorts by title descending', () => {
    const sorted = sortTracks(tracks, 'title', 'desc')
    expect(sorted.map((t) => t.title)).toEqual(['Charlie', 'Bravo', 'Alpha'])
  })

  it('sorts by BPM ascending', () => {
    const sorted = sortTracks(tracks, 'bpm', 'asc')
    // null BPM goes to end
    expect(sorted.map((t) => t.analyzedBpm)).toEqual([120, 140, null])
  })

  it('sorts by addedAt ascending', () => {
    const sorted = sortTracks(tracks, 'addedAt', 'asc')
    expect(sorted.map((t) => t.id)).toEqual(['2', '3', '1'])
  })

  it('does not mutate original array', () => {
    const original = [...tracks]
    sortTracks(tracks, 'title', 'asc')
    expect(tracks).toEqual(original)
  })
})

// ---------------------------------------------------------------------------
// applyLibraryQuery
// ---------------------------------------------------------------------------

describe('applyLibraryQuery', () => {
  const tracks = [
    makeTrack({ id: '1', title: 'Alpha', analysisStatus: 'ready', analyzedBpm: 128 }),
    makeTrack({ id: '2', title: 'Beta', analysisStatus: 'analyzing', analyzedBpm: null }),
    makeTrack({ id: '3', title: 'Gamma', analysisStatus: 'ready', analyzedBpm: 110 }),
    makeTrack({ id: '4', title: 'Delta', analysisStatus: 'failed', analyzedBpm: null }),
  ]

  it('no filters returns all sorted by default', () => {
    const result = applyLibraryQuery(tracks, '', 'all', 'addedAt', 'desc')
    expect(result).toHaveLength(4)
  })

  it('search + filter combined', () => {
    const result = applyLibraryQuery(tracks, 'a', 'ready', 'title', 'asc')
    // "a" matches Alpha and Gamma (both contain 'a')
    // ready filter: Alpha and Gamma
    expect(result).toHaveLength(2)
    expect(result.map((t) => t.title)).toEqual(['Alpha', 'Gamma'])
  })
})

// ---------------------------------------------------------------------------
// findDuplicate
// ---------------------------------------------------------------------------

describe('findDuplicate', () => {
  it('finds existing track', () => {
    const tracks = [makeTrack({ id: 'abc' }), makeTrack({ id: 'def' })]
    expect(findDuplicate(tracks, 'abc')?.id).toBe('abc')
  })

  it('returns null for non-existent', () => {
    const tracks = [makeTrack({ id: 'abc' })]
    expect(findDuplicate(tracks, 'xyz')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getLoadedDeckIds
// ---------------------------------------------------------------------------

describe('getLoadedDeckIds', () => {
  it('detects track in deck A', () => {
    const result = getLoadedDeckIds('track-1', 'track-2', 'track-1')
    expect(result.inA).toBe(true)
    expect(result.inB).toBe(false)
  })

  it('detects track in deck B', () => {
    const result = getLoadedDeckIds('track-1', 'track-2', 'track-2')
    expect(result.inA).toBe(false)
    expect(result.inB).toBe(true)
  })

  it('detects track in both', () => {
    const result = getLoadedDeckIds('track-1', 'track-1', 'track-1')
    expect(result.inA).toBe(true)
    expect(result.inB).toBe(true)
  })

  it('detects track not loaded', () => {
    const result = getLoadedDeckIds('track-1', 'track-2', 'track-3')
    expect(result.inA).toBe(false)
    expect(result.inB).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Duplicate handling
// ---------------------------------------------------------------------------

describe('duplicate prevention', () => {
  it('same file metadata produces same ID', () => {
    const id1 = generateTrackId('song.mp3', 1024, 5000)
    const id2 = generateTrackId('song.mp3', 1024, 5000)
    expect(id1).toBe(id2)
  })

  it('different size produces different ID', () => {
    const id1 = generateTrackId('song.mp3', 1024, 5000)
    const id2 = generateTrackId('song.mp3', 2048, 5000)
    expect(id1).not.toBe(id2)
  })
})

// ---------------------------------------------------------------------------
// Track metadata
// ---------------------------------------------------------------------------

describe('track metadata', () => {
  it('all fields are serializable', () => {
    const track = makeTrack()
    const json = JSON.stringify(track)
    const parsed = JSON.parse(json) as LibraryTrack
    expect(parsed.id).toBe('test-1')
    expect(parsed.title).toBe('Test Track')
    expect(parsed.analysisStatus).toBe('ready')
  })

  it('null artist is serializable', () => {
    const track = makeTrack({ artist: null })
    const json = JSON.stringify(track)
    const parsed = JSON.parse(json) as LibraryTrack
    expect(parsed.artist).toBeNull()
  })
})
