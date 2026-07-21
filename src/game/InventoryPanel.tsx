import { useEffect, useState } from "react";
import type { GameState } from "./GameState";
import { getItemDef, RARITY_COLOR, SLOT_LABEL, type ItemSlot } from "./utils/items";
import { getEffectiveMaxHP, computeStatSnapshot } from "./utils/equipment";

const EQUIP_SLOTS: ItemSlot[] = ["weapon", "shield", "head", "chest", "hands", "legs", "feet", "ring", "amulet"];

function rarityCss(hex: number): string {
  return "#" + hex.toString(16).padStart(6, "0");
}

// Equip-only inventory panel (phase 4) — a DOM overlay toggled by C or the
// INV touch button, pausing gameplay (state.paused) while open. Deliberately
// no drag/drop or item-compare tooltips yet (the source's InventoryScene is
// 696 lines of that) — click an inventory item to equip it, click an
// equipped slot to unequip it, swapping with whatever was there.
export function InventoryPanel({ state, open, setOpen }: { state: GameState; open: boolean; setOpen: (v: boolean | ((o: boolean) => boolean)) => void }) {
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    state.paused = open;
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

  const snapshot = computeStatSnapshot(p.stats, p.equipped, p.upgrades);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(5,5,10,0.88)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Georgia, serif",
        color: "#e8e0d4",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 560,
          maxWidth: "92vw",
          maxHeight: "82vh",
          overflowY: "auto",
          background: "#12121c",
          border: "1px solid #3a3a4a",
          borderRadius: 8,
          padding: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <div style={{ fontSize: 20, letterSpacing: 1, color: "#c9a84c" }}>EQUIPMENT</div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>C / Esc to close</div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 14, lineHeight: 1.6 }}>
          ATK {snapshot.atkPwr} &nbsp;·&nbsp; DMG RED {Math.round(snapshot.dmgRedPct * 100)}% &nbsp;·&nbsp; HP {snapshot.maxHp} &nbsp;·&nbsp; STA {snapshot.maxStamina}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
          {EQUIP_SLOTS.map((slot) => {
            const itemId = p.equipped[slot];
            const def = itemId ? getItemDef(itemId) : undefined;
            return (
              <div
                key={slot}
                onClick={() => itemId && unequipItem(slot)}
                style={{
                  border: `1px solid ${def ? rarityCss(RARITY_COLOR[def.rarity]) : "#3a3a4a"}`,
                  borderRadius: 4,
                  padding: 8,
                  cursor: itemId ? "pointer" : "default",
                  background: "rgba(255,255,255,0.03)",
                }}
                title={itemId ? "Click to unequip" : undefined}
              >
                <div style={{ fontSize: 10, opacity: 0.5, textTransform: "uppercase" }}>{SLOT_LABEL[slot]}</div>
                <div style={{ fontSize: 13, color: def ? rarityCss(RARITY_COLOR[def.rarity]) : "#666" }}>{def ? def.name : "— empty —"}</div>
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 13, letterSpacing: 1, opacity: 0.7, marginBottom: 8 }}>INVENTORY ({p.inventory.length})</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {p.inventory.length === 0 && <div style={{ fontSize: 12, opacity: 0.5 }}>Nothing carried.</div>}
          {p.inventory.map((itemId, i) => {
            const def = getItemDef(itemId);
            const equippable = EQUIP_SLOTS.includes(def.slot);
            return (
              <div
                key={`${itemId}-${i}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  border: `1px solid ${rarityCss(RARITY_COLOR[def.rarity])}`,
                  borderRadius: 4,
                  padding: "6px 10px",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div>
                  <span style={{ color: rarityCss(RARITY_COLOR[def.rarity]), fontSize: 13 }}>{def.name}</span>
                  <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 8 }}>{SLOT_LABEL[def.slot]}</span>
                </div>
                {equippable && (
                  <button
                    onClick={() => equipItem(itemId)}
                    style={{
                      fontSize: 11,
                      padding: "3px 10px",
                      borderRadius: 3,
                      border: "1px solid #c9a84c",
                      background: "rgba(201,168,76,0.15)",
                      color: "#e8e0d4",
                      cursor: "pointer",
                    }}
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
  );
}
