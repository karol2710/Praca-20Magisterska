import "./global.css";

import { createRoot } from "react-dom/client";
import AppComponent from "./App";

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(<AppComponent />);
}
