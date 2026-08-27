/**
 * M10 Library helpers: search, sort, filter, duplicate detection.
 * Framework-independent, deterministic, testable.
 */

import type { LibraryTrack, LibrarySortField, LibrarySortDirection, LibraryFilterMode } from './libraryTypes'

/**
 * Generate a track ID from file metadata.
 * Reuses the existing pattern: name + size + lastModified.
 */
export function generateTrackId(fileName: string, fileSize: number, lastModified: number): string {
  return `${fileName}-${fileSize}-${lastModified}`
}

/**
 * Infer title from file name by removing common audio extensions.
 */
export function inferTitle(fileName: string): string {
  return fileName
    .replace(/\.(mp3|wav|ogg|flac|aac|m4a|wma|opus|webm)$/i, '')
    .replace(/[_-]/g, ' ')
    .trim()
}

/**
 * Case-insensitive search across title, artist, and fileName.
 * Returns true if the query matches any field.
 */
export function matchesSearch(track: LibraryTrack, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true

  const title = track.title.toLowerCase()
  const artist = (track.artist ?? '').toLowerCase()
  const fileName = track.fileName.toLowerCase()

  return title.includes(q) || artist.includes(q) || fileName.includes(q)
}

/**
 * Filter tracks by analysis status.
 */
export function filterByStatus(tracks: LibraryTrack[], mode: LibraryFilterMode): LibraryTrack[] {
  if (mode === 'all') return tracks
  return tracks.filter((t) => t.analysisStatus === mode)
}

/**
 * Sort tracks by the given field and direction.
 * Null values sort deterministically (nulls last for asc, nulls first for desc).
 */
export function sortTracks(
  tracks: LibraryTrack[],
  field: LibrarySortField,
  direction: LibrarySortDirection,
): LibraryTrack[] {
  const sorted = [...tracks]
  const dir = direction === 'asc' ? 1 : -1

  sorted.sort((a, b) => {
    let aVal: number | string | null
    let bVal: number | string | null

    switch (field) {
      case 'title':
        aVal = a.title.toLowerCase()
        bVal = b.title.toLowerCase()
        break
      case 'artist':
        aVal = (a.artist ?? '').toLowerCase()
        bVal = (b.artist ?? '').toLowerCase()
        break
      case 'bpm':
        aVal = a.analyzedBpm
        bVal = b.analyzedBpm
        break
      case 'duration':
        aVal = a.durationSeconds
        bVal = b.durationSeconds
        break
      case 'addedAt':
        aVal = a.addedAt
        bVal = b.addedAt
        break
      case 'lastPlayedAt':
        aVal = a.lastPlayedAt ?? 0
        bVal = b.lastPlayedAt ?? 0
        break
      default:
        return 0
    }

    // Null handling: nulls go to end for asc, start for desc
    if (aVal === null && bVal === null) return 0
    if (aVal === null) return 1 * dir
    if (bVal === null) return -1 * dir

    if (aVal < bVal) return -1 * dir
    if (aVal > bVal) return 1 * dir
    return 0
  })

  return sorted
}

/**
 * Apply search, filter, and sort to a track list.
 */
export function applyLibraryQuery(
  tracks: LibraryTrack[],
  searchQuery: string,
  filterMode: LibraryFilterMode,
  sortField: LibrarySortField,
  sortDirection: LibrarySortDirection,
): LibraryTrack[] {
  let result = tracks
  result = filterByStatus(result, filterMode)
  result = result.filter((t) => matchesSearch(t, searchQuery))
  result = sortTracks(result, sortField, sortDirection)
  return result
}

/**
 * Check if a track with the given ID already exists in the library.
 */
export function findDuplicate(tracks: LibraryTrack[], id: string): LibraryTrack | null {
  return tracks.find((t) => t.id === id) ?? null
}

/**
 * Check if a track is loaded in either deck.
 */
export function getLoadedDeckIds(
  deckATrackId: string | null,
  deckBTrackId: string | null,
  libraryTrackId: string,
): { inA: boolean; inB: boolean } {
  return {
    inA: deckATrackId === libraryTrackId,
    inB: deckBTrackId === libraryTrackId,
  }
}
