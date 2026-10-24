import "server-only";
import type { CharacterSheetProvider } from "./provider";
import { HiggsfieldSoul2CharacterSheetProvider } from "./higgsfield";

export function createCharacterSheetProvider(): CharacterSheetProvider {
  return new HiggsfieldSoul2CharacterSheetProvider();
}
