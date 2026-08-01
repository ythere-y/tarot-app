import "./ui/styles.css";
import { createTarotApp } from "./app/app";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing application root");
}

const tarotApp = createTarotApp({ root: app });
tarotApp.start();

window.addEventListener("pagehide", () => {
  tarotApp.dispose();
}, { once: true });
