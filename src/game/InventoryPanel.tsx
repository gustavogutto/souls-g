import { useEffect, useState } from "react";
import type { GameState } from "./GameState";
import { getItemDef, RARITY_COLOR, SLOT_LABEL, type ItemSlot } from "./utils/items";
import { getEffectiveMaxHP, computeStatSnapshot, computeCandidateEquipped, type StatSnapshot } from "./utils/equipment";

// Paper-doll slot layout (design doc section 15) — narrow-wide-narrow grid
// positions read as a body silhouette even without character art. "spell"
// is included here (it wasn't before): p.equipped.spell already drives
// which spell Q casts (see Player.tsx), but nothing in the UI could ever
// change it away from the guaranteed-starting Ashmote until now.
const EQUIP_SLOTS: ItemSlot[] = ["weapon", "shield", "head", "chest", "hands", "legs", "feet", "ring", "amulet", "spell"];
const DOLL_ROWS: (ItemSlot | null)[][] = [
  [null, "head", null],
  ["weapon", "chest", "shield"],
  [null, "hands", null],
  ["ring", "legs", "amulet"],
  [null, "feet", null],
  [null, "spell", null],
];

type FilterTab = "all" | "weapon" | "armor" | "trinket" | "spell";
const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "ALL" },
  { key: "weapon", label: "WEAPON/SHIELD" },
  { key: "armor", label: "ARMOR" },
  { key: "trinket", label: "RING/AMULET" },
  { key: "spell", label: "SPELL" },
];
function filterMatches(tab: FilterTab, slot: ItemSlot): boolean {
  if (tab === "all") return true;
  if (tab === "weapon") return slot === "weapon" || slot === "shield";
  if (tab === "armor") return slot === "head" || slot === "chest" || slot === "hands" || slot === "legs" || slot === "feet";
  if (tab === "trinket") return slot === "ring" || slot === "amulet";
  return slot === "spell";
}

function rarityCss(hex: number): string {
  return "#" + hex.toString(16).padStart(6, "0");
}

function StatDiffRow({ label, current, candidate, pct }: { label: string; current: number; candidate: number; pct?: boolean }) {
  const delta = candidate - current;
  const fmt = (n: number) => (pct ? `${Math.round(n * 100)}%` : `${n}`);
  const deltaColor = delta > 0 ? "#66ff66" : delta < 0 ? "#ff6666" : "#6b7b8f";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span>
        {fmt(current)}
        {delta !== 0 && (
          <span style={{ color: deltaColor, marginLeft: 6 }}>
            → {fmt(candidate)} ({delta > 0 ? "+" : ""}
            {pct ? `${Math.round(delta * 100)}%` : delta})
          </span>
        )}
      </span>
    </div>
  );
}

// Equip-only inventory panel — a DOM overlay toggled by C or Esc, pausing
// gameplay (state.paused) while open. Deliberately no drag/drop yet (the
// source's InventoryScene is 696 lines of that) — click an inventory item
// to equip it, click an equipped slot to unequip it, swapping with
// whatever was there. Hovering either shows a live before/after stat
// preview, reusing utils/equipment.ts's existing candidate-snapshot infra.
export function InventoryPanel({ state, open, setOpen }: { state: GameState; open: boolean; setOpen: (v: boolean | ((o: boolean) => boolean)) => void }) {
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);
  const [previewSlot, setPreviewSlot] = useState<ItemSlot | null>(null);

  useEffect(() => {
    state.paused = open;
    if (open && document.pointerLockElement) document.exitPointerLock();
  }, [open, state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyC") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.code === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  if (!open) return null;
  const onClose = () => setOpen(false);

  const p = state.player;

  const equipItem = (itemId: string) => {
    const def = getItemDef(itemId);
    if (!EQUIP_SLOTS.includes(def.slot)) return;
    const previous = p.equipped[def.slot];
    p.equipped = { ...p.equipped, [def.slot]: itemId };
    p.inventory = p.inventory.filter((id) => id !== itemId);
    if (previous) p.inventory.push(previous);
    p.maxHp = getEffectiveMaxHP(p.stats.vigor, p.equipped, p.upgrades);
    p.hp = Math.min(p.hp, p.maxHp);
    refresh();
  };

  const unequipItem = (slot: ItemSlot) => {
    const itemId = p.equipped[slot];
    if (!itemId) return;
    const next = { ...p.equipped };
    delete next[slot];
    p.equipped = next;
    p.inventory.push(itemId);
    p.maxHp = getEffectiveMaxHP(p.stats.vigor, p.equipped, p.upgrades);
    p.hp = Math.min(p.hp, p.maxHp);
    refresh();
  };

  const currentSnapshot = computeStatSnapshot(p.stats, p.equipped, p.upgrades);
  let previewSnapshot: StatSnapshot = currentSnapshot;
  if (previewItemId) {
    const def = getItemDef(previewItemId);
    const candidate = computeCandidateEquipped(p.equipped, def.slot, previewItemId);
    previewSnapshot = computeStatSnapshot(p.stats, candidate, p.upgrades);
  } else if (previewSlot) {
    const candidate = computeCandidateEquipped(p.equipped, previewSlot, null);
    previewSnapshot = computeStatSnapshot(p.stats, candidate, p.upgrades);
  }

  const visibleInventory = p.inventory
    .map((itemId, i) => ({ itemId, i, def: getItemDef(itemId) }))
    .filter(({ def }) => filterMatches(filter, def.slot));

  return (
    <div
      style={{
        position: "absolute", inset: 0, background: "rgba(5,5,10,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "Georgia, serif", color: "#e8e0d4", zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{ width: 640, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto", background: "#12121c", border: "1px solid #3a3a4a", borderRadius: 8, padding: 20, display: "flex", gap: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ width: 190, flexShrink: 0 }}>
          <div style={{ fontSize: 20, letterSpacing: 1, color: "#c9a84c", marginBottom: 14 }}>EQUIPMENT</div>
          {DOLL_ROWS.map((row, ri) => (
            <div key={ri} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 6 }}>
              {row.map((slot, ci) => {
                if (!slot) return <div key={ci} />;
                const itemId = p.equipped[slot];
                const def = itemId ? getItemDef(itemId) : undefined;
                return (
                  <div
                    key={slot}
                    onClick={() => itemId && unequipItem(slot)}
                    onMouseEnter={() => setPreviewSlot(itemId ? slot : null)}
                    onMouseLeave={() => setPreviewSlot(null)}
                    style={{
                      border: `1px solid ${def ? rarityCss(RARITY_COLOR[def.rarity]) : "#3a3a4a"}`,
                      borderRadius: 4, padding: 5, cursor: itemId ? "pointer" : "default",
                      background: "rgba(255,255,255,0.03)", minHeight: 34,
                    }}
                    title={itemId ? "Click to unequip" : undefined}
                  >
                    <div style={{ fontSize: 8, opacity: 0.5, textTransform: "uppercase" }}>{SLOT_LABEL[slot]}</div>
                    <div style={{ fontSize: 10, color: def ? rarityCss(RARITY_COLOR[def.rarity]) : "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {def ? def.name : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 3, border: "1px solid #3a3a4a", borderRadius: 4, padding: 8 }}>
            <StatDiffRow label="ATK" current={currentSnapshot.atkPwr} candidate={previewSnapshot.atkPwr} />
            <StatDiffRow label="DMG RED" current={currentSnapshot.dmgRedPct} candidate={previewSnapshot.dmgRedPct} pct />
            <StatDiffRow label="HP" current={currentSnapshot.maxHp} candidate={previewSnapshot.maxHp} />
            <StatDiffRow label="FP" current={currentSnapshot.maxFp} candidate={previewSnapshot.maxFp} />
            <StatDiffRow label="STA" current={currentSnapshot.maxStamina} candidate={previewSnapshot.maxStamina} />
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <div style={{ fontSize: 13, letterSpacing: 1, opacity: 0.7 }}>INVENTORY ({p.inventory.length})</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>C / Esc to close</div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                style={{
                  fontSize: 10, padding: "3px 8px", borderRadius: 3, cursor: "pointer",
                  border: `1px solid ${filter === tab.key ? "#c9a84c" : "#3a3a4a"}`,
                  background: filter === tab.key ? "rgba(201,168,76,0.15)" : "transparent",
                  color: filter === tab.key ? "#c9a84c" : "#8b8b9b",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 380, overflowY: "auto" }}>
            {visibleInventory.length === 0 && <div style={{ fontSize: 12, opacity: 0.5 }}>Nothing here.</div>}
            {visibleInventory.map(({ itemId, i, def }) => {
              const equippable = EQUIP_SLOTS.includes(def.slot);
              return (
                <div
                  key={`${itemId}-${i}`}
                  onMouseEnter={() => equippable && setPreviewItemId(itemId)}
                  onMouseLeave={() => setPreviewItemId(null)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    border: `1px solid ${rarityCss(RARITY_COLOR[def.rarity])}`, borderRadius: 4,
                    padding: "6px 10px", background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div>
                    <span style={{ color: rarityCss(RARITY_COLOR[def.rarity]), fontSize: 13 }}>{def.name}</span>
                    <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 8 }}>{SLOT_LABEL[def.slot]}</span>
                  </div>
                  {equippable && (
                    <button
                      onClick={() => equipItem(itemId)}
                      style={{ fontSize: 11, padding: "3px 10px", borderRadius: 3, border: "1px solid #c9a84c", background: "rgba(201,168,76,0.15)", color: "#e8e0d4", cursor: "pointer" }}
                    >
                      Equip
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
