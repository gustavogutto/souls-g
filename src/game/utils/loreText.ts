import { Area } from "./constants";

// Ported verbatim from the 2D source's utils/loreText.ts (first-draft
// narrative content split from HOHENBERG_LORE_BIBLE.md's Core Myth and
// AREAS sections) — same caveat already on record there: expected to be
// rewritten once seen in place, not treated as final copy.

export const INTRO_CRAWL_LINES: string[] = [
  "Ashveil was a fortress-city carved through a coastal mountain, from sea-root to spire. Its Ashen Order kept a Great Hearth burning at the mountain's heart — the fire's memory held the halls in their shape.",
  "Then the flood began. Slow at first. A tide where no tide should reach. The drowned did not stay dead — they washed back with each high water, nameless and wrong.",
  "The last king learned the water's law: it claims by name. So he committed the great heresy — he struck his own name from every stone, book, and mouth in Ashveil.",
  "It worked. He cannot drown. He cannot die, cannot be remembered, cannot end. He persists at the top of the Hollow Spire — a king-shaped absence.",
  "You washed up at the mountain's frozen roots. No name, no memory. Nothing the flood can take. The perfect climber.",
];

// One line per floor (index = floor index within its area), shown right
// after clearing that floor — each area's 5th line is its chapter's
// closing beat, right after that area's own boss.
export const FLOOR_LORE: Partial<Record<Area, string[]>> = {
  [Area.AREA_1]: [
    "The sea-roots of the mountain. Below even the flood's reach.",
    "Here the first water froze, and never thawed.",
    "The Ashen Order's old forges lie cold in this dark.",
    "These drowned are the earliest ones — ice-bound, half-erased.",
    'It did not hate you. It simply had no name for "stop."',
  ],
  [Area.AREA_2]: [
    "The fortress' great open ward. Here, the flood breathes strongest.",
    "Moss and rubble and standing water — the drowned, at their most numerous.",
    "Something vast moves beneath the tide here. Waiting.",
    "The Ruined Colossus. A siege-titan, drowned standing up.",
    "Its name was worn off its own chestplate, long before you arrived. Make of that what you will.",
  ],
  [Area.AREA_3]: [
    "The mountain's heart. Here, the Great Hearth once burned.",
    "The Ashen Order made its last stand in this place.",
    "The fire remembers too hard here — the same deaths, replayed in ember and smoke.",
    "Something keeps this fire lit. Something that used to be a man.",
    "He apologized, in the end. For what the fire had become.",
  ],
  [Area.AREA_4]: [
    "Above the waterline. Dry. Silent. The flood has never reached this high.",
    "And that is the horror — nothing here was ever erased. It simply left.",
    "Portrait frames with no portraits. Thrones with no sitters.",
    "Something followed the king into namelessness. You are close now.",
    "An empty banner flew over that fight. It still does.",
  ],
  [Area.AREA_5]: [
    "Above the Spire, the sky itself is broken — open catwalks over nothing at all.",
    "Stone that used to fly still remembers the shape of flying.",
    "Something up here answers to no name the Order ever recorded.",
    "It circles. It always circled. Long before anyone climbed high enough to see.",
    "The last thing standing between you and whatever the mountain was hiding.",
  ],
};
