import { useState } from "react";
import { GameScene } from "./game/GameScene";
import { TitleScreen } from "./TitleScreen";
import { SlotPicker } from "./SlotPicker";
import { hasAnySave, setActiveSlot } from "./game/saveGame";

type Screen = "title" | "slots" | "game";
type SlotMode = "continue" | "start";

function App() {
  const [screen, setScreen] = useState<Screen>("title");
  const [slotMode, setSlotMode] = useState<SlotMode>("start");

  if (screen === "title") {
    return (
      <TitleScreen
        canContinue={hasAnySave()}
        onContinue={() => {
          setSlotMode("continue");
          setScreen("slots");
        }}
        onStart={() => {
          setSlotMode("start");
          setScreen("slots");
        }}
      />
    );
  }

  if (screen === "slots") {
    return (
      <SlotPicker
        mode={slotMode}
        onBack={() => setScreen("title")}
        onPick={(slot) => {
          setActiveSlot(slot);
          setScreen("game");
        }}
      />
    );
  }

  return <GameScene onReturnToTitle={() => setScreen("title")} />;
}

export default App;
