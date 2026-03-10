import type { Character } from "@inuyasha/shared";

export const CHARACTER_POOL: Character[] = [
  {
    id: "inuyasha",
    name: "이누야샤",
    archetype: "swordsman",
    summary: "근접 압박에 강한 검술형 캐릭터",
  },
  {
    id: "sesshomaru",
    name: "셋쇼마루",
    archetype: "spearman",
    summary: "정교한 거리 조절이 강점인 창술형 캐릭터",
  },
  {
    id: "kikyo",
    name: "키쿄우",
    archetype: "caster",
    summary: "안정적인 견제와 제어를 수행하는 영술형 캐릭터",
  },
  {
    id: "kagome",
    name: "카고메",
    archetype: "archer",
    summary: "원거리 압박에 특화된 궁술형 캐릭터",
  },
];

export const DEFAULT_CHARACTER_ID = CHARACTER_POOL[0].id;
