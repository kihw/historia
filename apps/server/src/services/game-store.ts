import { readFile, readdir, writeFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { GameState, ParsedAction, TurnHistoryEntry, DiplomaticMessage } from "@historia/shared";

const SAVES_DIR = join(import.meta.dirname, "../../../../saves");

/** Shape of a persisted save file. */
interface SaveData {
  gameState: GameState;
  turnHistory: TurnHistoryEntry[];
  diplomaticChats: Record<string, DiplomaticMessage[]>; // key = "nationA:nationB"
  savedAt: string;
}

/** Ensure the saves directory exists. */
async function ensureSavesDir(): Promise<void> {
  await mkdir(SAVES_DIR, { recursive: true });
}

/**
 * Persist a game to disk.
 * Called after every turn resolution and on game creation.
 */
export async function saveGame(
  gameId: string,
  state: GameState,
  history: TurnHistoryEntry[],
  chats: Map<string, DiplomaticMessage[]>
): Promise<void> {
  await ensureSavesDir();

  const chatObj: Record<string, DiplomaticMessage[]> = {};
  for (const [key, msgs] of chats.entries()) {
    chatObj[key] = msgs;
  }

  const data: SaveData = {
    gameState: state,
    turnHistory: history,
    diplomaticChats: chatObj,
    savedAt: new Date().toISOString(),
  };

  const filePath = join(SAVES_DIR, `${gameId}.json`);
  await writeFile(filePath, JSON.stringify(data), "utf-8");
}

/**
 * Load a single game from disk.
 */
export async function loadGame(
  gameId: string
): Promise<{
  state: GameState;
  history: TurnHistoryEntry[];
  chats: Map<string, DiplomaticMessage[]>;
} | null> {
  try {
    const filePath = join(SAVES_DIR, `${gameId}.json`);
    const raw = await readFile(filePath, "utf-8");
    const data: SaveData = JSON.parse(raw);

    const chats = new Map<string, DiplomaticMessage[]>();
    for (const [key, msgs] of Object.entries(data.diplomaticChats)) {
      chats.set(key, msgs);
    }

    return {
      state: data.gameState,
      history: data.turnHistory,
      chats,
    };
  } catch {
    return null;
  }
}

/**
 * Load all saved games from disk.
 * Returns Maps ready to be used by the route module.
 */
export async function loadAllGames(): Promise<{
  games: Map<string, GameState>;
  turnHistory: Map<string, TurnHistoryEntry[]>;
  diplomaticChats: Map<string, Map<string, DiplomaticMessage[]>>;
}> {
  await ensureSavesDir();

  const games = new Map<string, GameState>();
  const turnHistory = new Map<string, TurnHistoryEntry[]>();
  const diplomaticChats = new Map<string, Map<string, DiplomaticMessage[]>>();

  try {
    const files = await readdir(SAVES_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const gameId = file.replace(".json", "");
      const loaded = await loadGame(gameId);
      if (loaded) {
        games.set(gameId, loaded.state);
        turnHistory.set(gameId, loaded.history);
        diplomaticChats.set(gameId, loaded.chats);
      }
    }
  } catch {
    // Saves dir might not exist yet
  }

  return { games, turnHistory, diplomaticChats };
}

/**
 * Delete a saved game from disk.
 */
export async function deleteGameSave(gameId: string): Promise<boolean> {
  try {
    const safeId = gameId.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safeId) return false;
    const filePath = join(SAVES_DIR, `${safeId}.json`);
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
}
