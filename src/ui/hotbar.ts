import type { SurvivalSession } from "../survival/session";
import { ITEMS } from "../items/catalog";
import { BlockId } from "../world/blocks";
import { paintItem } from "./inventory";

export class Hotbar {
  private container: HTMLElement;
  private session: SurvivalSession;
  private signature = "";
  constructor(container: HTMLElement, session: SurvivalSession) {
    this.container = container;
    this.session = session;
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className = "hotbar-slot";
      slot.setAttribute("aria-label", `ホットバー ${i + 1}`);
      slot.addEventListener("click", () => {
        session.data.selected = i;
        this.refresh();
      });
      container.append(slot);
    }
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof Element && e.target.matches("input,select,textarea")) return;
      const match = /^Digit([1-9])$/.exec(e.code);
      if (match) {
        session.data.selected = Number(match[1]) - 1;
        this.refresh();
      }
    });
    window.addEventListener("wheel", (e) => {
      if (document.querySelector("#inventory-panel:not([hidden])")) return;
      session.data.selected = (session.data.selected + (e.deltaY > 0 ? 1 : 8)) % 9;
      this.refresh();
    });
    this.refresh();
  }
  refresh(): void {
    const sig = JSON.stringify([
      this.session.data.inventory.slice(0, 9),
      this.session.data.selected,
    ]);
    if (sig === this.signature) return;
    this.signature = sig;
    Array.from(this.container.children).forEach((el, i) => {
      paintItem(el as HTMLElement, this.session.data.inventory[i] ?? null);
      el.classList.toggle("selected", i === this.session.data.selected);
      const key = document.createElement("span");
      key.className = "hotbar-key";
      key.textContent = String(i + 1);
      el.append(key);
    });
  }
  get selectedBlock(): BlockId {
    const item = this.session.held;
    return item ? (ITEMS[item.id]?.block ?? BlockId.AIR) : BlockId.AIR;
  }
}
