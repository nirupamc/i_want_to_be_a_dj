/**
 * M10 Library types.
 * All types are serializable — no File, AudioBuffer, AudioNode, DOM objects.
 */

export interface LibraryTrack {
  id: string
  name: string
  title: string
  artist: string | null
  fileName: string
  fileSize: number
  lastModified: number
  durationSeconds: number | null
  analyzedBpm: number | null
  bpmConfidence: number | null
  analysisStatus: 'idle' | 'analyzing' | 'ready' | 'failed'
  addedAt: number
  lastPlayedAt: number | null
}

export type LibrarySortField = 'title' | 'artist' | 'bpm' | 'duration' | 'addedAt' | 'lastPlayedAt'
export type LibrarySortDirection = 'asc' | 'desc'
export type LibraryFilterMode = 'all' | 'ready' | 'analyzing' | 'failed'

export interface LibraryState {
  tracks: LibraryTrack[]
  selectedTrackId: string | null
  searchQuery: string
  sortField: LibrarySortField
  sortDirection: LibrarySortDirection
  filterMode: LibraryFilterMode
}
