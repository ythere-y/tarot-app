import "./ui/styles.css";
import { installTarotAppLifecycle } from "./app/browser-lifecycle";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing application root");
}

installTarotAppLifecycle({ root: app });
