import { itemIcon } from "../render/item-icon";
import { must } from "../core/assert";
import { ITEMS, stack, stackLimit } from "../items/catalog";
import { addItem, emptySlots, transfer, type Slots } from "../items/inventory";
import { craft, matchRecipe, RECIPES } from "../items/recipes";
import type { SurvivalSession } from "../survival/session";
export function paintItem(el: HTMLElement, item: Slots[number]): void {
  el.replaceChildren();
  if (!item) {
    el.removeAttribute("title");
    return;
  }
  const def = must(ITEMS[item.id]);
  el.title = `${def.name}${item.durability === undefined ? "" : ` · 耐久 ${item.durability}/${def.durability}`}`;
  const icon = document.createElement("img");
  icon.className = "item-bitmap";
  icon.src = itemIcon(item.id);
  icon.alt = def.name;
  icon.draggable = false;
  const label = document.createElement("span");
  label.className = "item-count";
  label.textContent = item.count > 1 ? String(item.count) : "";
  el.append(icon, label);
  if (item.durability !== undefined) {
    const bar = document.createElement("span");
    bar.className = "durability";
    bar.style.width = `${(item.durability / must(def.durability)) * 85}%`;
    el.append(bar);
  }
}
interface Source {
  slots: Slots;
  index: number;
}
export class InventoryView {
  readonly root: HTMLDivElement;
  private selected: Source | null = null;
  private station: "inventory" | "table" | "furnace" | "chest" = "inventory";
  private container: Slots | null = null;
  private signature = "";
  onClose: (() => void) | undefined;
  constructor(privateSession: SurvivalSession) {
    this.session = privateSession;
    this.root = document.createElement("div");
    this.root.id = "inventory-panel";
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-label", "所持品とクラフト");
    must(document.querySelector("#app")).append(this.root);
    document.addEventListener("keydown", (e) => {
      if (e.code === "Escape" && this.isOpen) {
        e.preventDefault();
        this.close();
      }
    });
  }
  private session: SurvivalSession;
  get isOpen(): boolean {
    return !this.root.hidden;
  }
  open(station: typeof this.station = "inventory", container: Slots | null = null): void {
    this.station = station;
    this.container = container;
    const size = station === "table" ? 3 : 2;
    if (this.session.data.gridSize !== size) {
      this.returnGrid();
      this.session.data.gridSize = size;
      this.session.data.grid = emptySlots(size * size);
    }
    this.root.hidden = false;
    this.selected = null;
    this.signature = "";
    this.render();
  }
  close(): void {
    this.returnGrid();
    this.root.hidden = true;
    this.selected = null;
    this.onClose?.();
  }
  private returnGrid(): void {
    for (let i = 0; i < this.session.data.grid.length; i++) {
      const item = this.session.data.grid[i];
      if (!item) continue;
      const left = addItem(this.session.data.inventory, item);
      if (left) this.session.drop({ ...item, count: left });
      this.session.data.grid[i] = null;
    }
  }
  refresh(): void {
    if (!this.isOpen) return;
    const signature = JSON.stringify([
      this.session.data.inventory,
      this.session.data.grid,
      this.container,
    ]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.render();
  }
  private slot(slots: Slots, index: number, area: string, readOnly = false): HTMLButtonElement {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "inventory-slot";
    el.dataset.area = area;
    el.dataset.slot = String(index);
    el.setAttribute("aria-label", `${area} ${index + 1}`);
    paintItem(el, slots[index] ?? null);
    el.draggable = !!slots[index];
    if (this.selected?.slots === slots && this.selected.index === index) el.classList.add("chosen");
    const receive = (split = false) => {
      if (!this.selected) {
        if (slots[index]) this.selected = { slots, index };
      } else if (this.selected.slots === slots && this.selected.index === index)
        this.selected = null;
      else if (!readOnly) {
        transfer(this.selected.slots, this.selected.index, slots, index, split);
        if (!split || !this.selected.slots[this.selected.index]) this.selected = null;
      }
      this.signature = "";
      this.render();
    };
    el.addEventListener("click", () => {
      receive();
    });
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      receive(true);
    });
    el.addEventListener("dragstart", (e) => {
      this.selected = { slots, index };
      e.dataTransfer?.setData("text/plain", String(index));
    });
    el.addEventListener("dragover", (e) => {
      e.preventDefault();
    });
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      receive();
    });
    return el;
  }
  private render(): void {
    const body = document.createElement("section");
    body.className = "inventory-card";
    const header = document.createElement("header");
    const title = document.createElement("h2");
    title.textContent = {
      inventory: "所持品",
      table: "作業台",
      furnace: "かまど",
      chest: "チェスト",
    }[this.station];
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "戻る [E / Esc]";
    close.addEventListener("click", () => {
      this.close();
    });
    header.append(title, close);
    body.append(header);
    if (this.station === "inventory" || this.station === "table") {
      const area = document.createElement("div");
      area.className = "craft-area";
      const grid = document.createElement("div");
      grid.className = "slot-grid";
      grid.style.gridTemplateColumns = `repeat(${this.session.data.gridSize}, 48px)`;
      this.session.data.grid.forEach((_s, i) => {
        grid.append(this.slot(this.session.data.grid, i, "craft"));
      });
      const output = document.createElement("button");
      output.id = "craft-output";
      output.type = "button";
      output.className = "inventory-slot craft-output";
      const recipe = matchRecipe(this.session.data.grid, this.session.data.gridSize);
      paintItem(output, recipe?.output ?? null);
      output.disabled = !recipe;
      output.title = recipe
        ? `${must(ITEMS[recipe.output.id]).name} を作る`
        : "材料を配置してください";
      output.addEventListener("click", () => {
        if (!craft(this.session.data.grid, this.session.data.gridSize, this.session.data.inventory))
          this.session.notice?.("材料または空きスロットを確認してください");
        this.selected = null;
        this.render();
      });
      const arrow = document.createElement("span");
      arrow.textContent = "→";
      area.append(grid, arrow, output);
      body.append(area);
      const book = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "レシピ集（クリックで材料を配置）";
      book.append(summary);
      const recipes = document.createElement("div");
      recipes.className = "recipe-book";
      for (const r of RECIPES.filter((r) => r.station <= this.session.data.gridSize)) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = must(ITEMS[r.output.id]).name;
        b.dataset.recipe = r.id;
        b.title = r.pattern
          .map((line) =>
            Array.from(line)
              .map((ch) => (r.keys[ch] ? must(ITEMS[must(r.keys[ch])]).name : "・"))
              .join(" / "),
          )
          .join("\n");
        b.addEventListener("click", () => {
          this.returnGrid();
          const inv = this.session.data.inventory.map((s) => (s ? { ...s } : null));
          const result = emptySlots(this.session.data.gridSize ** 2);
          let ok = true;
          for (const [y, line] of r.pattern.entries()) {
            for (const [x, ch] of Array.from(line).entries()) {
              const id = r.keys[ch];
              if (!id) continue;
              const i = inv.findIndex((s) => s?.id === id);
              const item = inv[i];
              if (!item) {
                ok = false;
                continue;
              }
              result[y * this.session.data.gridSize + x] = { ...item, count: 1 };
              if (--item.count === 0) inv[i] = null;
            }
          }
          if (ok) {
            this.session.data.inventory = inv;
            this.session.data.grid = result;
          } else this.session.notice?.("このレシピの材料が足りません");
          this.selected = null;
          this.render();
        });
        recipes.append(b);
      }
      book.append(recipes);
      body.append(book);
    } else if (this.container) {
      const grid = document.createElement("div");
      grid.className = "slot-grid";
      grid.style.gridTemplateColumns = `repeat(${this.station === "chest" ? 9 : 3}, 48px)`;
      this.container.forEach((_s, i) => {
        grid.append(
          this.slot(must(this.container), i, this.station, this.station === "furnace" && i === 2),
        );
      });
      const text = document.createElement("p");
      text.textContent =
        this.station === "furnace"
          ? "左：材料　中央：燃料　右：完成品（8秒 / 個）"
          : "27 スロットの保管庫";
      body.append(text, grid);
    }
    if (this.session.creative) {
      const palette = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "クリエイティブ：アイテム一覧";
      palette.append(summary);
      const list = document.createElement("div");
      list.className = "recipe-book";
      for (const [id, def] of Object.entries(ITEMS)) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = def.name;
        button.addEventListener("click", () => {
          this.session.collect(stack(id, stackLimit(id)));
          this.render();
        });
        list.append(button);
      }
      palette.append(list);
      body.append(palette);
    }
    const help = document.createElement("p");
    help.className = "inventory-help";
    help.textContent = "ドラッグまたは2回クリックで移動 · 右クリックで1個移す";
    body.append(help);
    const inv = document.createElement("div");
    inv.className = "slot-grid inventory-grid";
    for (let i = 9; i < 36; i++) inv.append(this.slot(this.session.data.inventory, i, "inventory"));
    const quick = document.createElement("div");
    quick.className = "slot-grid inventory-grid quick-grid";
    for (let i = 0; i < 9; i++)
      quick.append(this.slot(this.session.data.inventory, i, "inventory"));
    body.append(inv, quick);
    this.root.replaceChildren(body);
    this.signature = JSON.stringify([
      this.session.data.inventory,
      this.session.data.grid,
      this.container,
    ]);
  }
}
