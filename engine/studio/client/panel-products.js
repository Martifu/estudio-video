// Panel "Productos": products.json list + add/edit dialog + drag a product onto the stage or the timeline (products-panel.js).
import { registerPanel, ICONS } from "./rail.js";
import { mountProductsPanel } from "./products-panel.js";

registerPanel({ id: "products", label: "Productos", icon: ICONS.products, order: 60, title: "Productos", mount: (root) => { mountProductsPanel(root); } });
