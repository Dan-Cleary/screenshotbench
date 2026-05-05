import { useQuery } from "convex/react";
import { Sandpack } from "@codesandbox/sandpack-react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";

// Sandpack content: scale-to-fit thumbnail of the generated component.
// Component renders at virtual 1280×853 (3:2), then we transform-scale the
// whole frame down to fit the tile so the full UI is visible at a glance.
const SCALED_APP_WRAPPER = `import Component from "./Component";
import { useEffect, useState } from "react";
import "./styles.css";

const VW = 1280;
const VH = 853;

export default function App() {
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const update = () => {
      const sx = window.innerWidth / VW;
      const sy = window.innerHeight / VH;
      setScale(Math.min(sx, sy));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#fff" }}>
      <div
        style={{
          width: VW,
          height: VH,
          transformOrigin: "top left",
          transform: \`scale(\${scale})\`,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <Component />
      </div>
    </div>
  );
}
`;

const SANDPACK_RESET_CSS = `html, body, #root { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
`;

const SANDPACK_INDEX = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")).render(
  <StrictMode><App /></StrictMode>
);
`;

const RUBRIC = [
  { k: "layout", l: "L" },
  { k: "colors", l: "C" },
  { k: "mobile", l: "M" },
  { k: "interactivity", l: "I" },
] as const;

export default function App() {
  const refs = useQuery(api.references.list);
  const models = useQuery(api.models.list, {});
  const matrix = useQuery(api.runs.matrix);

  if (!refs || !models || !matrix)
    return (
      <div style={{ padding: 48, fontFamily: "var(--mono)", fontSize: 11 }}>
        loading…
      </div>
    );

  const enabledModels = models.filter((m) => m.enabled);
  const runByCell = new Map<string, Doc<"runs">>();
  for (const r of matrix.runs) runByCell.set(`${r.referenceId}:${r.modelId}`, r);

  const totalAttempts = refs.length * enabledModels.length;
  const today = new Date()
    .toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
    .replace(/\//g, ".");

  return (
    <>
      <div className="paper-grain" />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Masthead today={today} />
        <SubBanner
          refs={refs.length}
          models={enabledModels.length}
          attempts={totalAttempts}
          today={today}
        />
        <section style={{ padding: "20px 48px 48px" }}>
          {refs.map((ref, i) => (
            <BenchmarkRow
              key={ref._id}
              ref_={ref}
              index={i}
              total={refs.length}
              models={enabledModels}
              runByCell={runByCell}
            />
          ))}
        </section>
        <Footer />
      </div>
    </>
  );
}

function Masthead({ today }: { today: string }) {
  return (
    <header
      style={{
        padding: "20px 48px 14px",
        borderBottom: "1px solid var(--ink)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              fontStyle: "italic",
            }}
          >
            screenshotbench
          </span>
          <span
            className="mono"
            style={{ fontSize: 10, opacity: 0.5, letterSpacing: "0.08em" }}
          >
            VOL. 1 · {today.split(".").slice(1).join(".")}
          </span>
        </div>
        <nav
          className="mono"
          style={{ display: "flex", gap: 22, fontSize: 12, letterSpacing: "0.04em" }}
        >
          <a style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>Catalog</a>
          <a style={{ opacity: 0.55 }}>Leaderboard</a>
          <a style={{ opacity: 0.55 }}>About</a>
          <a style={{ opacity: 0.55 }}>Submit</a>
        </nav>
      </div>
    </header>
  );
}

function SubBanner({
  refs,
  models,
  attempts,
  today,
}: {
  refs: number;
  models: number;
  attempts: number;
  today: string;
}) {
  return (
    <div
      className="mono"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 16,
        padding: "10px 48px",
        borderBottom: "1px solid var(--rule)",
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        opacity: 0.7,
      }}
    >
      <span>
        {refs} benchmarks · {models} models · {attempts} attempts · graded on
        layout · color · mobile · interactivity
      </span>
      <span>upd. {today}</span>
    </div>
  );
}

function BenchmarkRow({
  ref_,
  index,
  total,
  models,
  runByCell,
}: {
  ref_: Doc<"references"> & { screenshotUrl: string | null };
  index: number;
  total: number;
  models: Doc<"models">[];
  runByCell: Map<string, Doc<"runs">>;
}) {
  const num = String(index + 1).padStart(3, "0");
  return (
    <article
      style={{
        paddingTop: 28,
        paddingBottom: 28,
        borderBottom: index < total - 1 ? "1px solid var(--rule-soft)" : "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 24,
          marginBottom: 14,
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.12em",
            color: "var(--accent)",
            fontWeight: 600,
          }}
        >
          № {num}
        </span>
        <h3
          style={{
            fontSize: 32,
            margin: 0,
            fontWeight: 500,
            letterSpacing: "-0.015em",
            flex: 1,
          }}
        >
          {ref_.name}
        </h3>
        <span
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            opacity: 0.55,
          }}
        >
          {ref_.category}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 3fr",
          gap: 14,
        }}
      >
        <ReferenceTile ref_={ref_} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 14,
          }}
        >
          {models.map((m) => (
            <AttemptTile
              key={m._id}
              model={m}
              run={runByCell.get(`${ref_._id}:${m._id}`)}
            />
          ))}
        </div>
      </div>
    </article>
  );
}

function ReferenceTile({
  ref_,
}: {
  ref_: Doc<"references"> & { screenshotUrl: string | null };
}) {
  return (
    <figure style={{ margin: 0 }}>
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--border-tile)",
          aspectRatio: "3 / 2",
          overflow: "hidden",
          boxShadow: "0 1px 0 rgba(26,22,18,0.04)",
        }}
      >
        {ref_.screenshotUrl && (
          <img
            src={ref_.screenshotUrl}
            alt={ref_.name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top",
              display: "block",
            }}
          />
        )}
      </div>
      <figcaption
        className="mono"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginTop: 8,
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        <span style={{ fontWeight: 600 }}>Reference</span>
        <span style={{ opacity: 0.55 }}>ground truth</span>
      </figcaption>
    </figure>
  );
}

function AttemptTile({
  model,
  run,
}: {
  model: Doc<"models">;
  run: Doc<"runs"> | undefined;
}) {
  const status = run?.status;
  return (
    <figure style={{ margin: 0 }}>
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--border-tile)",
          aspectRatio: "3 / 2",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {status === "complete" && run?.files && run.files.length > 0 ? (
          <SandpackTile files={run.files} />
        ) : (
          <TileEmpty status={status} errorMessage={run?.errorMessage} />
        )}
        <ScoreBadge run={run} />
      </div>
      <figcaption
        className="mono"
        style={{
          marginTop: 8,
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 4,
          }}
        >
          <span style={{ fontWeight: 600 }}>{model.displayName}</span>
          <span style={{ opacity: 0.55 }}>
            {run?.durationMs ? `${(run.durationMs / 1000).toFixed(0)}s` : "—"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
          {RUBRIC.map((row) => (
            <div key={row.k} style={{ flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 9,
                  marginBottom: 2,
                  opacity: 0.7,
                }}
              >
                <span>{row.l}</span>
                <span className="tabular" style={{ fontWeight: 600 }}>
                  —
                </span>
              </div>
              <div style={{ height: 2, background: "var(--track)" }}>
                <div
                  style={{
                    width: 0,
                    height: "100%",
                    background: "var(--accent)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </figcaption>
    </figure>
  );
}

function TileEmpty({
  status,
  errorMessage,
}: {
  status?: string;
  errorMessage?: string;
}) {
  const labels: Record<string, string> = {
    queued: "queued",
    generating: "generating…",
    failed: "failed",
  };
  const label = status ? labels[status] ?? "no run" : "no run";
  return (
    <div
      className="mono"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 4,
        color: "var(--ink-faint)",
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      <span>{label}</span>
      {errorMessage && (
        <span
          style={{
            fontSize: 9,
            opacity: 0.6,
            maxWidth: "80%",
            textAlign: "center",
            textTransform: "none",
            letterSpacing: 0,
          }}
        >
          {errorMessage}
        </span>
      )}
    </div>
  );
}

function ScoreBadge({ run }: { run: Doc<"runs"> | undefined }) {
  if (run?.status !== "complete") return null;
  return (
    <div
      className="mono tabular"
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        background: "var(--ink)",
        color: "var(--bg-paper)",
        padding: "3px 8px",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.04em",
      }}
    >
      <span style={{ color: "var(--accent)" }}>—</span>
      <span style={{ opacity: 0.5 }}>/100</span>
    </div>
  );
}

function SandpackTile({
  files,
}: {
  files: { path: string; content: string }[];
}) {
  const entry =
    files.find((f) => f.path === "Component.tsx") ??
    files.find((f) => f.path.endsWith(".tsx")) ??
    files[0];
  const sandpackFiles: Record<string, string> = {
    "/App.tsx": SCALED_APP_WRAPPER,
    "/Component.tsx": entry.content,
    "/styles.css": SANDPACK_RESET_CSS,
    "/index.tsx": SANDPACK_INDEX,
  };
  for (const f of files) {
    if (f.path !== entry.path) sandpackFiles[`/${f.path}`] = f.content;
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        // Sandpack's preview iframe should fill the tile. We render only the
        // preview (no editor) and rely on Sandpack's auto-scaling.
      }}
    >
      <Sandpack
        template="react-ts"
        files={sandpackFiles}
        options={{
          showNavigator: false,
          showTabs: false,
          showLineNumbers: false,
          showConsoleButton: false,
          editorHeight: "100%",
          editorWidthPercentage: 0,
          classes: {
            "sp-wrapper": "sp-tile-wrapper",
            "sp-preview": "sp-tile-preview",
          },
        }}
      />
    </div>
  );
}

function Footer() {
  return (
    <footer
      className="mono"
      style={{
        padding: "20px 48px 32px",
        borderTop: "1px solid var(--rule)",
        fontSize: 10,
        letterSpacing: "0.08em",
        opacity: 0.5,
        display: "flex",
        justifyContent: "space-between",
      }}
    >
      <span>SCREENSHOTBENCH · OPEN BENCHMARK</span>
      <span>VIA CURSOR SDK</span>
    </footer>
  );
}
