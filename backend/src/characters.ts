import type { Character, CharacterId } from "@inuyasha/shared";
import { getSignatureCards } from "./cards.js";

const createCharacter = (
  id: CharacterId,
  name: string,
  archetype: Character["archetype"],
  summary: string,
): Character => {
  const signatureCards = getSignatureCards(id);

  return {
    id,
    name,
    archetype,
    summary,
    signatureCardIds: signatureCards.map((card) => card.id),
    signatureCards: signatureCards.map((card) => ({
      cardId: card.id,
      name: card.name,
      summary: card.summary,
    })),
  };
};

export const CHARACTER_POOL: Character[] = [
  createCharacter("inuyasha", "이누야샤", "swordsman", "넓은 전방 공격과 돌진 압박에 강한 검술형 캐릭터"),
  createCharacter("sesshomaru", "셋쇼마루", "spearman", "직선 사거리와 정교한 간격 조절이 강점인 냉정한 창술형"),
  createCharacter("kikyo", "키쿄우", "caster", "제압형 사격과 회복으로 전장을 통제하는 영술형"),
  createCharacter("kagome", "카고메", "archer", "긴 사거리와 폭넓은 견제에 특화된 궁술형"),
];

export const DEFAULT_CHARACTER_ID = CHARACTER_POOL[0].id;
