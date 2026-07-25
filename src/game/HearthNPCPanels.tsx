import { useEffect, useState } from "react";
import type { GameState } from "./GameState";
import { grantItem, depositItem, withdrawItem } from "./GameState";
import { STAT_METADATA, NO_EFFECT_STATS, getSoulsForLevel, getSoulsForItemUpgrade, ITEM_UPGRADE_MAX_LEVEL } from "./utils/constants";
import { getItemDef, RARITY_COLOR, RARITY_SELL_VALUE, RARITY_BUY_VALUE, SLOT_LABEL, type ItemSlot } from "./utils/items";
import { getEffectiveMaxHP } from "./utils/equipment";
import { getMaxStamina, getMaxFP } from "./utils/constants";

const EQUIP_SLOTS: ItemSlot[] = ["weapon", "shield", "head", "chest", "hands", "legs", "feet", "ring", "amulet"];
const FLASK_SHARD_ITEM = "healing_flask";

function rarityCss(hex: number): string {
  return "#" + hex.toString(16).padStart(6, "0");
}

function PanelFrame({ title, subtitle, tagline, onClose, children }: { title: string; subtitle: string; tagline: string; onClose: () => void; children: React.ReactNode }) {
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
        style={{ width: 560, maxWidth: "92vw", maxHeight: "82vh", overflowY: "auto", background: "#12121c", border: "1px solid #3a3a4a", borderRadius: 8, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <div style={{ fontSize: 20, letterSpacing: 1, color: "#c9a84c" }}>{title}</div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>{subtitle} · Esc to close</div>
        </div>
        <p style={{ fontSize: 12, fontStyle: "italic", opacity: 0.7, marginBottom: 16 }}>{tagline}</p>
        {children}
      </div>
    </div>
  );
}

// Martyna, Keeper of Grace — the ONLY place souls convert into attribute
// points (design doc's locked decision #8). Cost scales with the player's
// global level regardless of which stat is purchased, same as the source.
export function MartynaPanel({ state, open, onClose }: { state: GameState; open: boolean; onClose: () => void }) {
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    state.paused = open;
    if (open && document.pointerLockElement) document.exitPointerLock();
  }, [open, state]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const p = state.player;
  const cost = getSoulsForLevel(p.stats.level);

  const buyStat = (key: keyof typeof p.stats) => {
    if (key === "level" || key === "souls" || p.stats.souls < cost) return;
    p.stats = { ...p.stats, [key]: (p.stats[key] as number) + 1, level: p.stats.level + 1, souls: p.stats.souls - cost };
    p.maxHp = getEffectiveMaxHP(p.stats.vigor, p.equipped, p.upgrades);
    p.hp = Math.min(p.hp, p.maxHp);
    p.maxStamina = getMaxStamina(p.stats.endurance);
    p.maxFp = getMaxFP(p.stats.mind);
    p.fp = Math.min(p.fp, p.maxFp);
    refresh();
  };

  return (
    <PanelFrame title="MARTYNA, KEEPER OF GRACE" subtitle={`Lv ${p.stats.level}`} tagline="Sit. Tell me what you survived. I will hold it for you." onClose={onClose}>
      <div style={{ fontSize: 13, marginBottom: 14 }}>
        Next point costs <span style={{ color: "#c9a84c" }}>{cost.toLocaleString()} souls</span> — you hold {p.stats.souls.toLocaleString()}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {STAT_METADATA.map((s) => {
          const noEffect = NO_EFFECT_STATS.includes(s.key);
          const val = p.stats[s.key] as number;
          return (
            <div key={s.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${noEffect ? "#3a3a4a" : s.color + "55"}`, borderRadius: 4, padding: "6px 10px", opacity: noEffect ? 0.55 : 1 }}>
              <div>
                <span style={{ color: noEffect ? "#888" : s.color, fontSize: 13 }}>{s.name}</span>
                <span style={{ fontSize: 16, marginLeft: 8 }}>{val}</span>
                <div style={{ fontSize: 10, opacity: 0.6 }}>{noEffect ? `${s.description} — no effect yet` : s.description}</div>
              </div>
              <button
                disabled={p.stats.souls < cost}
                onClick={() => buyStat(s.key)}
                style={{ fontSize: 16, width: 30, height: 30, borderRadius: 3, border: "1px solid #c9a84c", background: "rgba(201,168,76,0.15)", color: "#e8e0d4", cursor: "pointer", opacity: p.stats.souls < cost ? 0.4 : 1 }}
              >
                +
              </button>
            </div>
          );
        })}
      </div>
    </PanelFrame>
  );
}

// Varn, the blacksmith — upgrade (souls + one duplicate copy as material,
// max +3, +10%/level), sell duplicates for a flat rarity price, buy flask
// shards. Whole-gear buy/sell and true reforging stay unbuilt, matching the
// design doc's explicit scope cut.
export function VarnPanel({ state, open, onClose }: { state: GameState; open: boolean; onClose: () => void }) {
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    state.paused = open;
    if (open && document.pointerLockElement) document.exitPointerLock();
  }, [open, state]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const p = state.player;

  const upgradeItem = (itemId: string, cost: number) => {
    const dupIdx = p.inventory.indexOf(itemId);
    if (dupIdx < 0 || p.stats.souls < cost) return;
    p.inventory = p.inventory.filter((_, i) => i !== dupIdx);
    p.stats = { ...p.stats, souls: p.stats.souls - cost };
    p.upgrades = { ...p.upgrades, [itemId]: (p.upgrades[itemId] ?? 0) + 1 };
    p.maxHp = getEffectiveMaxHP(p.stats.vigor, p.equipped, p.upgrades);
    refresh();
  };

  const sellItem = (index: number, price: number) => {
    p.inventory = p.inventory.filter((_, i) => i !== index);
    p.stats = { ...p.stats, souls: p.stats.souls + price };
    refresh();
  };

  const flaskShardPrice = RARITY_BUY_VALUE[getItemDef(FLASK_SHARD_ITEM).rarity];
  const buyFlaskShard = () => {
    if (p.stats.souls < flaskShardPrice) return;
    p.stats = { ...p.stats, souls: p.stats.souls - flaskShardPrice };
    grantItem(state, FLASK_SHARD_ITEM);
    refresh();
  };

  const equippedEntries = EQUIP_SLOTS.map((slot) => p.equipped[slot]).filter((id): id is string => !!id);

  return (
    <PanelFrame title="VARN, THE BLACKSMITH" subtitle={`${p.stats.souls.toLocaleString()} souls`} tagline="The forge is cold. Bring me steel worth working." onClose={onClose}>
      <div style={{ fontSize: 13, letterSpacing: 1, opacity: 0.7, marginBottom: 8 }}>REINFORCE (costs a duplicate + souls)</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
        {equippedEntries.length === 0 && <div style={{ fontSize: 12, opacity: 0.5 }}>Nothing equipped.</div>}
        {equippedEntries.map((itemId) => {
          const def = getItemDef(itemId);
          const lvl = p.upgrades[itemId] ?? 0;
          const maxed = lvl >= ITEM_UPGRADE_MAX_LEVEL;
          const cost = maxed ? 0 : getSoulsForItemUpgrade(lvl + 1);
          const hasDupe = p.inventory.includes(itemId);
          return (
            <div key={itemId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${rarityCss(RARITY_COLOR[def.rarity])}`, borderRadius: 4, padding: "6px 10px" }}>
              <div>
                <span style={{ color: rarityCss(RARITY_COLOR[def.rarity]), fontSize: 13 }}>{def.name} +{lvl}</span>
                <div style={{ fontSize: 10, opacity: 0.6 }}>{maxed ? "Fully reinforced" : hasDupe ? `${cost.toLocaleString()} souls + 1 duplicate` : "Need a duplicate copy"}</div>
              </div>
              <button
                disabled={maxed || !hasDupe || p.stats.souls < cost}
                onClick={() => upgradeItem(itemId, cost)}
                style={{ fontSize: 11, padding: "3px 10px", borderRadius: 3, border: "1px solid #e8823c", background: "rgba(232,130,60,0.15)", color: "#e8e0d4", cursor: "pointer", opacity: maxed || !hasDupe || p.stats.souls < cost ? 0.4 : 1 }}
              >
                {maxed ? "MAX" : "Reinforce"}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 13, letterSpacing: 1, opacity: 0.7, marginBottom: 8 }}>SELL ({p.inventory.length} carried)</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18, maxHeight: 180, overflowY: "auto" }}>
        {p.inventory.length === 0 && <div style={{ fontSize: 12, opacity: 0.5 }}>Nothing to sell.</div>}
        {p.inventory.map((itemId, i) => {
          const def = getItemDef(itemId);
          const price = RARITY_SELL_VALUE[def.rarity];
          return (
            <div key={`${itemId}-${i}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${rarityCss(RARITY_COLOR[def.rarity])}`, borderRadius: 4, padding: "6px 10px" }}>
              <div>
                <span style={{ color: rarityCss(RARITY_COLOR[def.rarity]), fontSize: 13 }}>{def.name}</span>
                <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 8 }}>{SLOT_LABEL[def.slot]}</span>
              </div>
              <button
                onClick={() => sellItem(i, price)}
                style={{ fontSize: 11, padding: "3px 10px", borderRadius: 3, border: "1px solid #8adbb4", background: "rgba(138,219,180,0.12)", color: "#e8e0d4", cursor: "pointer" }}
              >
                Sell {price}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 13, letterSpacing: 1, opacity: 0.7, marginBottom: 8 }}>BUY</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #4a3a2a", borderRadius: 4, padding: "6px 10px" }}>
        <span style={{ fontSize: 13 }}>Flask Shard <span style={{ opacity: 0.6 }}>(+1 max flask charge)</span></span>
        <button
          disabled={p.stats.souls < flaskShardPrice}
          onClick={buyFlaskShard}
          style={{ fontSize: 11, padding: "3px 10px", borderRadius: 3, border: "1px solid #c9a84c", background: "rgba(201,168,76,0.15)", color: "#e8e0d4", cursor: "pointer", opacity: p.stats.souls < flaskShardPrice ? 0.4 : 1 }}
        >
          Buy {flaskShardPrice}
        </button>
      </div>
    </PanelFrame>
  );
}

function ownedEntries(source: string[]): { itemId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const id of source) counts.set(id, (counts.get(id) ?? 0) + 1);
  return Array.from(counts.entries()).map(([itemId, count]) => ({ itemId, count }));
}

// The personal stash — deposit/withdraw between inventory and stash (design
// doc section 10). No combat relevance, purely decluttering; no cap on
// either side, matching the 2D source's StashScene.
export function StashPanel({ state, open, onClose }: { state: GameState; open: boolean; onClose: () => void }) {
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    state.paused = open;
    if (open && document.pointerLockElement) document.exitPointerLock();
  }, [open, state]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const p = state.player;
  const equippedIds = new Set(Object.values(p.equipped));

  return (
    <PanelFrame title="THE STASH" subtitle={`${p.stash.length} stored`} tagline="A chest for what you're not carrying today." onClose={onClose}>
      <div style={{ fontSize: 13, letterSpacing: 1, opacity: 0.7, marginBottom: 8 }}>INVENTORY ({p.inventory.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18, maxHeight: 180, overflowY: "auto" }}>
        {ownedEntries(p.inventory).length === 0 && <div style={{ fontSize: 12, opacity: 0.5 }}>Nothing carried right now.</div>}
        {ownedEntries(p.inventory).map(({ itemId, count }) => {
          const def = getItemDef(itemId);
          const onlyCopyEquipped = count === 1 && equippedIds.has(itemId);
          return (
            <div key={itemId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${rarityCss(RARITY_COLOR[def.rarity])}`, borderRadius: 4, padding: "6px 10px" }}>
              <div>
                <span style={{ color: rarityCss(RARITY_COLOR[def.rarity]), fontSize: 13 }}>{def.name} x{count}</span>
                <div style={{ fontSize: 10, opacity: 0.6 }}>{onlyCopyEquipped ? "Equipped — unequip first" : "Tap to deposit"}</div>
              </div>
              <button
                disabled={onlyCopyEquipped}
                onClick={() => { depositItem(p, itemId); refresh(); }}
                style={{ fontSize: 11, padding: "3px 10px", borderRadius: 3, border: "1px solid #c9a84c", background: "rgba(201,168,76,0.15)", color: "#e8e0d4", cursor: "pointer", opacity: onlyCopyEquipped ? 0.4 : 1 }}
              >
                Deposit
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 13, letterSpacing: 1, opacity: 0.7, marginBottom: 8 }}>STASH ({p.stash.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
        {ownedEntries(p.stash).length === 0 && <div style={{ fontSize: 12, opacity: 0.5 }}>Stash is empty.</div>}
        {ownedEntries(p.stash).map(({ itemId, count }) => {
          const def = getItemDef(itemId);
          return (
            <div key={itemId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${rarityCss(RARITY_COLOR[def.rarity])}`, borderRadius: 4, padding: "6px 10px" }}>
              <div>
                <span style={{ color: rarityCss(RARITY_COLOR[def.rarity]), fontSize: 13 }}>{def.name} x{count}</span>
                <div style={{ fontSize: 10, opacity: 0.6 }}>Tap to withdraw</div>
              </div>
              <button
                onClick={() => { withdrawItem(p, itemId); refresh(); }}
                style={{ fontSize: 11, padding: "3px 10px", borderRadius: 3, border: "1px solid #8adbb4", background: "rgba(138,219,180,0.12)", color: "#e8e0d4", cursor: "pointer" }}
              >
                Withdraw
              </button>
            </div>
          );
        })}
      </div>
    </PanelFrame>
  );
}

// The Tide-Refused — dialogue-only wanderer, no mechanical function. Lines
// ported verbatim from the 2D source's WandererScene.ts.
const TIDE_REFUSED_LINES = [
  "You again. Still climbing, then.",
  "I washed up same as you. Nameless, cold, refused by the water. I just... didn't keep walking.",
  "Down there the flood forgets you kindly. Up there, I don't know what it does. Maybe that's why you go.",
  "Warm enough by the fire. That's enough for me.",
];

export function TideRefusedPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    if (open && document.pointerLockElement) document.exitPointerLock();
    if (!open) setLineIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <PanelFrame title="THE TIDE-REFUSED" subtitle="a wanderer" tagline="" onClose={onClose}>
      <p
        style={{ fontSize: 13, lineHeight: 1.6, minHeight: 60, cursor: "pointer" }}
        onClick={() => setLineIndex((i) => (i + 1) % TIDE_REFUSED_LINES.length)}
      >
        {TIDE_REFUSED_LINES[lineIndex]}
      </p>
      <div style={{ fontSize: 10, opacity: 0.5 }}>Click to continue</div>
    </PanelFrame>
  );
}
