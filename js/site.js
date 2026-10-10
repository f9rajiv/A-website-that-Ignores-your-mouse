// Himalayan Kettle: the cafe page itself.
// Menu tabs, the pickup order form and the confirmation dialog.
// Everything here works with a normal mouse; the body input layer
// (js/body_input.js) only triggers the same clicks in a different way.

const prices = { cinnamon_bun: 3.9, masala_chai: 3.5, momo: 11.9 };
const item_labels = { cinnamon_bun: "Cinnamon bun", masala_chai: "Masala chai", momo: "Momo" };

const order = { cinnamon_bun: 0, masala_chai: 0, momo: 0 };

const order_lines_el = document.getElementById("order_lines");
const order_total_el = document.getElementById("order_total");
const place_order_btn = document.getElementById("place_order_btn");
const modal_el = document.getElementById("order_modal");
const modal_text_el = document.getElementById("order_modal_text");
const modal_number_el = document.getElementById("order_modal_number");

// Other scripts can listen for what happens on the page without the page knowing about them.
function emit(type, detail) {
  document.dispatchEvent(new CustomEvent("cafe:" + type, { detail }));
}

function format_eur(value) {
  return "€" + value.toFixed(2);
}

function run_action(button) {
  const action = button.dataset.action;
  const arg = button.dataset.arg || "";
  if (action === "scroll_to") {
    const target = document.getElementById(arg);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (action === "menu_tab") {
    document.querySelectorAll(".menu_tab").forEach((b) => b.classList.toggle("is_active", b.dataset.arg === arg));
    document.querySelectorAll(".menu_panel").forEach((p) => p.classList.toggle("is_active", p.dataset.panel === arg));
    emit("menu_tab", { tab: arg });
  } else if (action === "qty") {
    const [item, delta] = arg.split(":");
    order[item] = Math.max(0, Math.min(9, order[item] + Number(delta)));
    render_order();
  } else if (action === "place_order") {
    place_order();
  } else if (action === "close_modal") {
    modal_el.classList.remove("is_open");
  }
}

function render_order() {
  let total = 0;
  const lines = [];
  for (const item of Object.keys(prices)) {
    const qty = order[item];
    document.querySelector(`[data-qty="${item}"]`).textContent = qty;
    if (qty > 0) {
      total += qty * prices[item];
      lines.push(`<li><span>${qty} × ${item_labels[item]}</span><span>${format_eur(qty * prices[item])}</span></li>`);
    }
  }
  order_lines_el.innerHTML = lines.length ? lines.join("") : '<li style="justify-content:center">Nothing yet</li>';
  order_total_el.textContent = format_eur(total);
  place_order_btn.disabled = total === 0;
}

function place_order() {
  const items = Object.keys(prices).filter((k) => order[k] > 0);
  const summary = items.map((k) => `${order[k]} × ${item_labels[k].toLowerCase()}`).join(", ");
  const number = 4100 + Math.floor(Math.random() * 800);
  modal_text_el.textContent = `We're getting ${summary} ready for you.`;
  modal_number_el.textContent = `Order #${number}, ready in 8 min`;
  modal_el.classList.add("is_open");
  emit("order_placed", { order: { ...order }, number });
  for (const k of Object.keys(order)) order[k] = 0;
  render_order();
}

document.addEventListener("click", (e) => {
  const button = e.target.closest("[data-action]");
  if (!button) return;
  e.preventDefault();
  run_action(button);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") modal_el.classList.remove("is_open");
});

render_order();
