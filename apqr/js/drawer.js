// Product navigation. The product file used to be a slide-over panel; it is
// now a full page (views-product.js). openProduct() routes to that page.
let opener = null;
export const setProductOpener = (fn) => { opener = fn; };
export function openProduct(key) { opener?.(key); }
export const isOpen = () => false;
export function closeDrawer() {}
export function refreshDrawer() {}
export function initDrawer() {}
