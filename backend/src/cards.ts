import { type Card, type CharacterId, type RelativeCell } from "@inuyasha/shared";

const move = (dx: number, dy: number): { cells: RelativeCell[] } => ({
  cells: [{ dx, dy }],
});

const patternFromTargets = (targets: number[]): RelativeCell[] => {
  const targetMap: Record<number, RelativeCell> = {
    1: { dx: -1, dy: -1 },
    2: { dx: 0, dy: -1 },
    3: { dx: 1, dy: -1 },
    4: { dx: -1, dy: 0 },
    5: { dx: 0, dy: 0 },
    6: { dx: 1, dy: 0 },
    7: { dx: -1, dy: 1 },
    8: { dx: 0, dy: 1 },
    9: { dx: 1, dy: 1 },
  };

  return targets.map((target) => targetMap[target]).filter((cell): cell is RelativeCell => Boolean(cell));
};

const COMMON_CARD_DEFS = [
  {
    id: "move_up",
    name: "Move_up",
    type: "move",
    energyCost: 0,
    energyGain: 0,
    damage: 0,
    defenseValue: 0,
    healAmount: 0,
    summary: "한 칸 위로 이동한다.",
    movePattern: move(0, -1),
  },
  {
    id: "move_down",
    name: "Move_down",
    type: "move",
    energyCost: 0,
    energyGain: 0,
    damage: 0,
    defenseValue: 0,
    healAmount: 0,
    summary: "한 칸 아래로 이동한다.",
    movePattern: move(0, 1),
  },
  {
    id: "move_left",
    name: "Move_left",
    type: "move",
    energyCost: 0,
    energyGain: 0,
    damage: 0,
    defenseValue: 0,
    healAmount: 0,
    summary: "한 칸 왼쪽으로 이동한다.",
    movePattern: move(-1, 0),
  },
  {
    id: "move_right",
    name: "Move_right",
    type: "move",
    energyCost: 0,
    energyGain: 0,
    damage: 0,
    defenseValue: 0,
    healAmount: 0,
    summary: "한 칸 오른쪽으로 이동한다.",
    movePattern: move(1, 0),
  },
  {
    id: "strike_1",
    name: "Strike_1",
    type: "attack",
    energyCost: 15,
    energyGain: 0,
    damage: 15,
    defenseValue: 0,
    healAmount: 0,
    summary: "주변 3x3 전 범위를 타격하는 기본 공격.",
    attackPattern: {
      radius: 3,
      cells: patternFromTargets([1, 2, 3, 4, 5, 6, 7, 8, 9]),
    },
  },
  {
    id: "strike_2",
    name: "Strike_2",
    type: "attack",
    energyCost: 25,
    energyGain: 0,
    damage: 25,
    defenseValue: 0,
    healAmount: 0,
    summary: "십자형 범위를 타격하는 강한 공격.",
    attackPattern: {
      radius: 3,
      cells: patternFromTargets([2, 4, 5, 6, 8]),
    },
  },
  {
    id: "strike_3",
    name: "Strike_3",
    type: "attack",
    energyCost: 25,
    energyGain: 0,
    damage: 25,
    defenseValue: 0,
    healAmount: 0,
    summary: "대각선 중심 범위를 타격하는 강한 공격.",
    attackPattern: {
      radius: 3,
      cells: patternFromTargets([1, 3, 5, 7, 9]),
    },
  },
  {
    id: "guard_15",
    name: "Guard_15",
    type: "defense",
    energyCost: 0,
    energyGain: 0,
    damage: 0,
    defenseValue: 15,
    healAmount: 0,
    summary: "피해를 15까지 막는 기본 방어.",
  },
  {
    id: "restore_15",
    name: "Restore_15",
    type: "energy_recover",
    energyCost: 0,
    energyGain: 15,
    damage: 0,
    defenseValue: 0,
    healAmount: 0,
    summary: "에너지를 15 회복한다.",
  },
] satisfies Omit<Card, "scope" | "ownerCharacterId">[];

const SIGNATURE_CARD_DEFS: Record<CharacterId, Omit<Card, "scope" | "ownerCharacterId">[]> = {
  inuyasha: [
    {
      id: "explosion",
      name: "Explosion",
      type: "attack",
      energyCost: 80,
      energyGain: 0,
      damage: 80,
      defenseValue: 0,
      healAmount: 0,
      summary: "자기 위치를 중심으로 폭발을 일으키는 고위력 기술.",
      attackPattern: {
        radius: 3,
        cells: patternFromTargets([5]),
      },
    },
    {
      id: "restore_20",
      name: "Restore_20",
      type: "energy_recover",
      energyCost: 0,
      energyGain: 20,
      damage: 0,
      defenseValue: 0,
      healAmount: 0,
      summary: "에너지를 20 회복한다.",
    },
  ],
  sesshomaru: [
    {
      id: "tackle",
      name: "Tackle",
      type: "attack",
      energyCost: 30,
      energyGain: 0,
      damage: 35,
      defenseValue: 0,
      healAmount: 0,
      summary: "좌중우 일직선 범위를 밀어붙이는 돌진 공격.",
      attackPattern: {
        radius: 3,
        cells: patternFromTargets([4, 5, 6]),
      },
    },
    {
      id: "guard_30",
      name: "Guard_30",
      type: "defense",
      energyCost: 10,
      energyGain: 0,
      damage: 0,
      defenseValue: 30,
      healAmount: 0,
      summary: "30까지 막는 고성능 방어.",
    },
  ],
  kikyo: [
    {
      id: "scatter",
      name: "Scatter",
      type: "attack",
      energyCost: 35,
      energyGain: 0,
      damage: 25,
      defenseValue: 0,
      healAmount: 0,
      summary: "상하 열을 동시에 덮는 분산형 공격.",
      attackPattern: {
        radius: 3,
        cells: patternFromTargets([1, 2, 3, 7, 8, 9]),
      },
    },
    {
      id: "shot",
      name: "Shot",
      type: "attack",
      energyCost: 35,
      energyGain: 0,
      damage: 40,
      defenseValue: 0,
      healAmount: 0,
      summary: "좌우 근접 칸을 강하게 찌르는 정밀 사격.",
      attackPattern: {
        radius: 3,
        cells: patternFromTargets([4, 6]),
      },
    },
  ],
  kagome: [
    {
      id: "jump_left",
      name: "Jump_left",
      type: "move",
      energyCost: 10,
      energyGain: 0,
      damage: 0,
      defenseValue: 0,
      healAmount: 0,
      summary: "왼쪽으로 두 칸 점프한다.",
      movePattern: move(-2, 0),
    },
    {
      id: "jump_right",
      name: "Jump_right",
      type: "move",
      energyCost: 10,
      energyGain: 0,
      damage: 0,
      defenseValue: 0,
      healAmount: 0,
      summary: "오른쪽으로 두 칸 점프한다.",
      movePattern: move(2, 0),
    },
  ],
};

export const COMMON_CARD_POOL: Card[] = COMMON_CARD_DEFS.map((card) => ({
  ...card,
  scope: "common",
}));

export const CHARACTER_CARD_POOL: Record<CharacterId, Card[]> = Object.fromEntries(
  Object.entries(SIGNATURE_CARD_DEFS).map(([characterId, cards]) => [
    characterId,
    cards.map((card) => ({
      ...card,
      scope: "signature",
      ownerCharacterId: characterId,
    })),
  ]),
) as Record<CharacterId, Card[]>;

export const CARD_POOL: Card[] = [
  ...COMMON_CARD_POOL,
  ...Object.values(CHARACTER_CARD_POOL).flat(),
];

export const CARD_LOOKUP = new Map(CARD_POOL.map((card) => [card.id, card]));

export const getSignatureCards = (characterId: CharacterId) => CHARACTER_CARD_POOL[characterId] ?? [];

export const getSelectableCardPool = (characterId?: CharacterId) => [
  ...COMMON_CARD_POOL,
  ...(characterId ? getSignatureCards(characterId) : []),
];
