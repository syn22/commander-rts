import fs from 'fs';
import path from 'path';

interface LeaderboardEntry {
  playerName: string;
  timeSeconds: number;
  mode: 'singleplayer' | 'multiplayer';
  timestamp: number;
  levelId?: number;
}

const LEADERBOARD_FILE = path.join(process.cwd(), 'leaderboard.json');
const MAX_ENTRIES = 100;

export class LeaderboardManager {
  private entries: LeaderboardEntry[] = [];

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(LEADERBOARD_FILE)) {
        const data = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
        this.entries = JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
      this.entries = [];
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(this.entries, null, 2));
    } catch (error) {
      console.error('Failed to save leaderboard:', error);
    }
  }

  addEntry(playerName: string, timeSeconds: number, mode: 'singleplayer' | 'multiplayer', levelId?: number): void {
    this.entries.push({
      playerName,
      timeSeconds,
      mode,
      timestamp: Date.now(),
      levelId,
    });

    // Sort by time (fastest first)
    this.entries.sort((a, b) => a.timeSeconds - b.timeSeconds);

    // Keep only top entries
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(0, MAX_ENTRIES);
    }

    this.save();
  }

  getTopEntries(limit: number = 10, mode?: 'singleplayer' | 'multiplayer'): LeaderboardEntry[] {
    let filtered = this.entries;

    if (mode) {
      filtered = this.entries.filter(e => e.mode === mode);
    }

    return filtered.slice(0, limit);
  }
}
