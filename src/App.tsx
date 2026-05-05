import { useQuery } from "convex/react";
import { Sandpack } from "@codesandbox/sandpack-react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";

export default function App() {
  const refs = useQuery(api.references.list);
  const models = useQuery(api.models.list, {});
  const matrix = useQuery(api.runs.matrix);

  if (!refs || !models || !matrix)
    return <div style={{ padding: 24 }}>Loading…</div>;

  const enabledModels = models.filter((m) => m.enabled);
  const runByCell = new Map<string, Doc<"runs">>();
  for (const r of matrix.runs) runByCell.set(`${r.referenceId}:${r.modelId}`, r);

  return (
    <div
      style={{
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        padding: 24,
        maxWidth: 1400,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>
          screenshotbench
        </h1>
        <p style={{ color: "#666", margin: "4px 0 0" }}>
          {refs.length} reference{refs.length === 1 ? "" : "s"} ×{" "}
          {enabledModels.length} model{enabledModels.length === 1 ? "" : "s"} ·{" "}
          {matrix.runs.length} run{matrix.runs.length === 1 ? "" : "s"}
        </p>
      </header>

      {refs.length === 0 && (
        <p>
          No references yet. Run <code>tsx runner/seed.ts</code>.
        </p>
      )}

      {refs.map((ref) => (
        <section key={ref._id} style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 12px" }}>
            {ref.name}{" "}
            <span style={{ color: "#999", fontWeight: 400 }}>
              · {ref.category}
            </span>
          </h2>
          <div
            style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 24 }}
          >
            <div>
              {ref.screenshotUrl && (
                <img
                  src={ref.screenshotUrl}
                  alt={ref.name}
                  style={{
                    width: "100%",
                    border: "1px solid #e5e5e5",
                    borderRadius: 4,
                  }}
                />
              )}
              <p style={{ fontSize: 12, color: "#999", marginTop: 8 }}>
                reference
              </p>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
                gap: 16,
              }}
            >
              {enabledModels.map((m) => {
                const run = runByCell.get(`${ref._id}:${m._id}`);
                return <Cell key={m._id} model={m} run={run} />;
              })}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

function Cell({
  model,
  run,
}: {
  model: Doc<"models">;
  run: Doc<"runs"> | undefined;
}) {
  const containerStyle: React.CSSProperties = {
    border: "1px solid #e5e5e5",
    borderRadius: 4,
    overflow: "hidden",
    background: "white",
  };
  const headerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    fontSize: 12,
    padding: "8px 12px",
    borderBottom: "1px solid #e5e5e5",
    background: "#fafafa",
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <strong>{model.displayName}</strong>
        <span style={{ color: "#999" }}>{model.provider}</span>
      </div>
      {!run && <Empty>no run yet</Empty>}
      {run?.status === "queued" && <Empty>queued</Empty>}
      {run?.status === "generating" && <Empty>generating…</Empty>}
      {run?.status === "failed" && (
        <Empty>failed: {run.errorMessage ?? "(unknown)"}</Empty>
      )}
      {run?.status === "complete" && run.files && run.files.length > 0 && (
        <Render files={run.files} duration={run.durationMs} />
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 24,
        textAlign: "center",
        color: "#999",
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

function Render({
  files,
  duration,
}: {
  files: { path: string; content: string }[];
  duration: number | undefined;
}) {
  const entry =
    files.find((f) => f.path === "Component.tsx") ??
    files.find((f) => f.path.endsWith(".tsx")) ??
    files[0];

  const sandpackFiles: Record<string, string> = {
    "/App.tsx": `import Component from "./Component";\nexport default function App() { return <Component />; }`,
    "/Component.tsx": entry.content,
  };
  for (const f of files) {
    if (f.path !== entry.path) sandpackFiles[`/${f.path}`] = f.content;
  }

  return (
    <div>
      <Sandpack
        template="react-ts"
        files={sandpackFiles}
        options={{
          showNavigator: false,
          showTabs: false,
          showLineNumbers: false,
          editorHeight: 360,
          editorWidthPercentage: 0,
        }}
      />
      <div
        style={{
          padding: "6px 12px",
          fontSize: 11,
          color: "#999",
          borderTop: "1px solid #e5e5e5",
        }}
      >
        {duration ? `${(duration / 1000).toFixed(1)}s` : ""} · {files.length} file
        {files.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}
