import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

// Detect platform at runtime by user-agent.  Tauri 2 does not expose a stable
// platform flag on window, and the UA check also covers plain-browser dev runs.
const root = document.getElementById("root")!;

const isMobile =
  /android/i.test(navigator.userAgent) ||
  /iPad|iPhone|iPod/i.test(navigator.userAgent);

if (isMobile) {
  import("./mobile/MobileApp").then(({ default: MobileApp }) => {
    ReactDOM.createRoot(root).render(
      <StrictMode>
        <MobileApp />
      </StrictMode>
    );
  });
} else {
  import("./components/App").then(({ default: App }) => {
    ReactDOM.createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  });
}
