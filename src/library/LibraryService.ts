/**
 * M10 LibraryService: manages local track library.
 *
 * Responsibilities:
 * - Add local tracks (with duplicate prevention)
 * - Store runtime File references privately
 * - Expose serializable metadata
 * - Search, sort, filter
 * - Recent tracks
 * - Retrieve File for deck load
 * - Remove track from library
 *
 * File objects live in a private Map, never in serialized state.
 */

import type { LibraryTrack, LibraryState, LibrarySortField, LibrarySortDirection, LibraryFilterMode } from './libraryTypes'
import {
  generateTrackId,
  inferTitle,
  applyLibraryQuery,
  findDuplicate,
} from './libraryHelpers'
import { analyzeTrack } from '../analysis/TrackAnalyzer'
import type { TrackAnalysis } from '../analysis/analysisTypes'

export interface LibraryServiceOptions {
  onTrackAdded?: (track: LibraryTrack) => void
  onTrackRemoved?: (trackId: string) => void
  onTrackUpdated?: (track: LibraryTrack) => void
}

export class LibraryService {
  private tracks: LibraryTrack[] = []
  private fileCache: Map<string, File> = new Map()
  private analysisCache: Map<string, TrackAnalysis> = new Map()
  public options: LibraryServiceOptions

  // UI state
  private _selectedTrackId: string | null = null
  private _searchQuery = ''
  private _sortField: LibrarySortField = 'addedAt'
  private _sortDirection: LibrarySortDirection = 'desc'
  private _filterMode: LibraryFilterMode = 'all'

  constructor(options: LibraryServiceOptions = {}) {
    this.options = options
  }

  // ── State access ─────────────────────────────────────────────

  getState(): LibraryState {
    return {
      tracks: this.getDisplayTracks(),
      selectedTrackId: this._selectedTrackId,
      searchQuery: this._searchQuery,
      sortField: this._sortField,
      sortDirection: this._sortDirection,
      filterMode: this._filterMode,
    }
  }

  getDisplayTracks(): LibraryTrack[] {
    return applyLibraryQuery(
      this.tracks,
      this._searchQuery,
      this._filterMode,
      this._sortField,
      this._sortDirection,
    )
  }

  getAllTracks(): LibraryTrack[] {
    return this.tracks
  }

  getTrackById(id: string): LibraryTrack | null {
    return this.tracks.find((t) => t.id === id) ?? null
  }

  // ── Track management ─────────────────────────────────────────

  /**
   * Add a file to the library.
   * Returns the created/existing LibraryTrack.
   * If the track already exists, returns the existing entry.
   */
  addTrack(file: File): LibraryTrack {
    const id = generateTrackId(file.name, file.size, file.lastModified)
    const existing = findDuplicate(this.tracks, id)

    if (existing) {
      // Update runtime File reference
      this.fileCache.set(id, file)
      return existing
    }

    const track: LibraryTrack = {
      id,
      name: file.name,
      title: inferTitle(file.name),
      artist: null,
      fileName: file.name,
      fileSize: file.size,
      lastModified: file.lastModified,
      durationSeconds: null,
      analyzedBpm: null,
      bpmConfidence: null,
      analysisStatus: 'idle',
      addedAt: Date.now(),
      lastPlayedAt: null,
    }

    this.tracks.push(track)
    this.fileCache.set(id, file)
    this.options.onTrackAdded?.(track)
    return track
  }

  /**
   * Add multiple files at once.
   */
  addTracks(files: File[]): LibraryTrack[] {
    return Array.from(files).map((f) => this.addTrack(f))
  }

  /**
   * Remove a track from the library.
   * Does NOT affect currently loaded deck tracks.
   */
  removeTrack(trackId: string): boolean {
    const idx = this.tracks.findIndex((t) => t.id === trackId)
    if (idx === -1) return false

    this.tracks.splice(idx, 1)
    this.fileCache.delete(trackId)
    this.analysisCache.delete(trackId)

    if (this._selectedTrackId === trackId) {
      this._selectedTrackId = null
    }

    this.options.onTrackRemoved?.(trackId)
    return true
  }

  /**
   * Clear the entire library.
   */
  clearLibrary(): void {
    this.tracks = []
    this.fileCache.clear()
    this.analysisCache.clear()
    this._selectedTrackId = null
  }

  // ── File access ──────────────────────────────────────────────

  /**
   * Get the runtime File reference for a track.
   * Returns null if the file reference is missing.
   */
  getFileForTrack(trackId: string): File | null {
    return this.fileCache.get(trackId) ?? null
  }

  // ── Analysis ─────────────────────────────────────────────────

  /**
   * Run analysis on a track and cache the result.
   * Updates the library track metadata with analysis results.
   */
  async analyzeTrackById(trackId: string): Promise<TrackAnalysis | null> {
    // Check cache first
    const cached = this.analysisCache.get(trackId)
    if (cached) return cached

    const track = this.getTrackById(trackId)
    if (!track) return null

    const file = this.getFileForTrack(trackId)
    if (!file) return null

    // Mark as analyzing
    track.analysisStatus = 'analyzing'
    this.options.onTrackUpdated?.(track)

    try {
      // Decode audio
      const arrayBuffer = await file.arrayBuffer()
      const audioContext = new AudioContext()
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      audioContext.close()

      // Run analysis
      const result = analyzeTrack(audioBuffer)

      // Update track metadata
      track.durationSeconds = result.durationSeconds
      track.analyzedBpm = result.bpm
      track.bpmConfidence = result.bpmConfidence
      track.analysisStatus = 'ready'

      // Cache
      this.analysisCache.set(trackId, result)

      this.options.onTrackUpdated?.(track)
      return result
    } catch {
      track.analysisStatus = 'failed'
      this.options.onTrackUpdated?.(track)
      return null
    }
  }

  /**
   * Get cached analysis for a track.
   */
  getCachedAnalysis(trackId: string): TrackAnalysis | null {
    return this.analysisCache.get(trackId) ?? null
  }

  // ── Recent tracks ────────────────────────────────────────────

  /**
   * Mark a track as recently played.
   */
  markAsPlayed(trackId: string): void {
    const track = this.getTrackById(trackId)
    if (track) {
      track.lastPlayedAt = Date.now()
      this.options.onTrackUpdated?.(track)
    }
  }

  /**
   * Get tracks sorted by last played (most recent first).
   */
  getRecentTracks(): LibraryTrack[] {
    return [...this.tracks]
      .filter((t) => t.lastPlayedAt !== null)
      .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
  }

  // ── UI state ─────────────────────────────────────────────────

  selectTrack(trackId: string | null): void {
    this._selectedTrackId = trackId
  }

  /** Move selection by a delta (positive = next, negative = previous) over
   *  the currently displayed (filtered/sorted) track list. */
  selectByDelta(delta: number): LibraryTrack | null {
    const list = this.getDisplayTracks()
    if (list.length === 0) {
      this._selectedTrackId = null
      return null
    }
    let idx = list.findIndex((t) => t.id === this._selectedTrackId)
    if (idx < 0) idx = delta > 0 ? -1 : list.length
    idx = ((idx + delta) % list.length + list.length) % list.length
    const next = list[idx]
    this._selectedTrackId = next.id
    return next
  }

  setSearchQuery(query: string): void {
    this._searchQuery = query
  }

  setSortField(field: LibrarySortField): void {
    if (this._sortField === field) {
      // Toggle direction
      this._sortDirection = this._sortDirection === 'asc' ? 'desc' : 'asc'
    } else {
      this._sortField = field
      this._sortDirection = 'asc'
    }
  }

  setFilterMode(mode: LibraryFilterMode): void {
    this._filterMode = mode
  }

  // ── Stats ────────────────────────────────────────────────────

  get totalTracks(): number { return this.tracks.length }
  get analyzedCount(): number { return this.tracks.filter((t) => t.analysisStatus === 'ready').length }
  get analyzingCount(): number { return this.tracks.filter((t) => t.analysisStatus === 'analyzing').length }
  get failedCount(): number { return this.tracks.filter((t) => t.analysisStatus === 'failed').length }
}
