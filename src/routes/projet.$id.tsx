import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus, Sparkles, FileText, Table2, Workflow, Clock, Paperclip, Mic, SendHorizontal, Check,
  ChevronDown, Undo2, Redo2, Share2, MoreHorizontal, Copy, Info, Crown, TrendingUp, Tag,
  AlertTriangle, ChevronRight, Maximize2, X, Loader2, Download, Pencil, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { runCalculation } from "@/lib/ai.functions";
import type { HistoryEntry, SheetResult } from "@/lib/sheet-types";
import { Donut, LineChart, UniversalChart } from "@/components/Charts";

export const Route = createFileRoute("/projet/$id")({
  head: () => ({
    meta: [
      { title: "Espace de travail — Ultra Smart" },
      { name: "description", content: "Décrivez votre calcul en langage naturel, Ultra Smart l'exécute." },
      { property: "og:title", content: "Espace de travail — Ultra Smart" },
      { property: "og:description", content: "Le tableur 100% langage naturel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Workspace,
});

type Project = { id: string; name: string; data_text: string | null; history: HistoryEntry[]; current_index: number };

const STEP_DEFAULT = [
  "Compréhension du besoin",
  "Détection des règles",
  "Sélection des données",
  "Construction du calcul",
  "Vérification & optimisation",
];

function Workspace() {
  const { id } = Route.useParams();
  const { session, user, loading } = useAuth();
  const navigate = useNavigate();
  const run = useServerFn(runCalculation);
  const [project, setProject] = useState<Project | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [natural, setNatural] = useState(false);
  const [full, setFull] = useState<null | "table" | "charts">(null);
  const [showHistory, setShowHistory] = useState(false);
  const [menu, setMenu] = useState(false);
  const [listening, setListening] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/" });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (!user) return;
    const load = () =>
      supabase.from("projects").select("*").eq("id", id).single().then(({ data }) => {
        if (data) setProject(data as unknown as Project);
      });
    load();
    const ch = supabase
      .channel(`project-${id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "projects", filter: `id=eq.${id}` }, (p) =>
        setProject(p.new as unknown as Project),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, id]);

  useEffect(() => {
    if (!busy) return;
    setStepIdx(0);
    const t = setInterval(() => setStepIdx((s) => Math.min(s + 1, 4)), 1800);
    return () => clearInterval(t);
  }, [busy]);

  const entry = project && project.current_index >= 0 ? project.history[project.current_index] : null;
  const r: SheetResult | null = entry?.result ?? null;

  useEffect(() => {
    if (entry && !prompt) setPrompt(entry.prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.at]);

  const submit = async (text = prompt) => {
    if (!text.trim() || busy || !project) return;
    setBusy(true);
    try {
      await run({ data: { projectId: project.id, prompt: text.trim() } });
      const { data } = await supabase.from("projects").select("*").eq("id", id).single();
      if (data) setProject(data as unknown as Project);
      toast.success("Calcul exécuté avec succès");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const setIndex = async (i: number) => {
    if (!project || i < 0 || i >= project.history.length) return;
    setProject({ ...project, current_index: i });
    setPrompt(project.history[i].prompt);
    await supabase.from("projects").update({ current_index: i }).eq("id", project.id);
  };

  const attach = async (f: File) => {
    if (!project) return;
    const text = (await f.text()).slice(0, 200000);
    setProject({ ...project, data_text: text });
    await supabase.from("projects").update({ data_text: text }).eq("id", project.id);
    toast.success(`Données jointes : ${f.name}`);
  };

  const saveResult = (next: SheetResult, persist = false) => {
    if (!project) return;
    const history = [...project.history];
    const idx = project.current_index >= 0 ? project.current_index : 0;
    if (history.length === 0) history.push({ prompt: "Tableau manuel", result: next, at: new Date().toISOString() });
    else history[idx] = { ...history[idx], result: next };
    const p2 = { ...project, history, current_index: idx };
    setProject(p2);
    if (persist) void supabase.from("projects").update({ history: history as never, current_index: idx }).eq("id", project.id);
  };
  const blankSheet = (): SheetResult => ({
    title: project?.name ?? "Feuille", summary: "", formula: "", naturalFormula: "",
    columns: ["A", "B", "C"].map((l) => ({ label: l, align: "left" as const, kind: "text" as const })),
    rows: Array.from({ length: 5 }, () => ["", "", ""]), steps: [], insights: [], suggestions: [], donut: null, line: null, charts: [],
  });
  const editCell = (ri: number, ci: number, v: string) => {
    if (!r) return;
    saveResult({ ...r, rows: r.rows.map((row, i) => (i === ri ? row.map((c, j) => (j === ci ? v : c)) : row)) });
  };
  const editHeader = (ci: number, v: string) => {
    if (!r) return;
    saveResult({ ...r, columns: r.columns.map((c, j) => (j === ci ? { ...c, label: v } : c)) });
  };
  const addRow = () => r && saveResult({ ...r, rows: [...r.rows, r.columns.map(() => "")] }, true);
  const addCol = () => r && saveResult({
    ...r,
    columns: [...r.columns, { label: `Colonne ${r.columns.length + 1}`, align: "left", kind: "text" }],
    rows: r.rows.map((row) => [...row, ""]),
  }, true);
  const delRow = (ri: number) => r && saveResult({ ...r, rows: r.rows.filter((_, i) => i !== ri) }, true);
  const delCol = (ci: number) => r && r.columns.length > 1 && saveResult({
    ...r, columns: r.columns.filter((_, j) => j !== ci), rows: r.rows.map((row) => row.filter((_, j) => j !== ci)),
  }, true);
  const persist = () => r && saveResult(r, true);

  const newProject = async () => {
    const { data } = await supabase.from("projects").insert({ name: "Nouveau projet" }).select("id").single();
    if (data) {
      setPrompt("");
      navigate({ to: "/projet/$id", params: { id: data.id } });
    }
  };

  const rename = async () => {
    if (!project) return;
    const n = window.prompt("Nouveau nom", project.name);
    if (!n) return;
    setProject({ ...project, name: n });
    await supabase.from("projects").update({ name: n }).eq("id", project.id);
  };

  const exportCsv = () => {
    if (!r) return;
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [r.columns.map((c) => esc(c.label)).join(";"), ...r.rows.map((row) => row.map(esc).join(";"))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" }));
    a.download = `${project?.name ?? "export"}.csv`;
    a.click();
  };

  const voice = () => {
    const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec })
      .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;
    if (!SR) return toast.error("Dictée vocale non supportée par ce navigateur");
    const rec = new SR();
    rec.lang = "fr-FR";
    rec.onresult = (e) => setPrompt((p) => (p ? p + " " : "") + e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const firstName = (user?.user_metadata?.["full_name"] as string) || user?.email?.split("@")[0] || "Moi";

  if (!project) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const steps = r?.steps?.length ? r.steps : STEP_DEFAULT.map((t) => ({ title: t, detail: "" }));

  const navItems = [
    { icon: Plus, label: "Nouveau", onClick: newProject, round: true },
    { icon: Sparkles, label: "Assistant", onClick: () => taRef.current?.focus(), active: true },
    { icon: FileText, label: "Feuilles", onClick: () => navigate({ to: "/dashboard" }) },
    { icon: Table2, label: "Tableaux", onClick: () => (r ? setFull("table") : saveResult(blankSheet(), true)) },
    { icon: Workflow, label: "Automatisations", onClick: () => r?.suggestions[2] && submit(r.suggestions[2]) },
    { icon: Clock, label: "Historique", onClick: () => setShowHistory(true) },
  ];

  const tableEl = r && (
    <div className="overflow-auto">
      <table className="w-full min-w-[560px] text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="w-8 border-b border-border px-2 py-2 text-left font-normal">#</th>
            {r.columns.map((c, i) => (
              <th key={i} className="group border-b border-border px-1 py-1 font-medium">
                <div className="flex items-center gap-1">
                  <input
                    aria-label={`Nom de la colonne ${i + 1}`}
                    value={c.label}
                    onChange={(e) => editHeader(i, e.target.value)}
                    onBlur={persist}
                    className={`w-full min-w-16 rounded bg-transparent px-2 py-1 outline-none focus:bg-accent/60 ${c.align === "right" ? "text-right" : ""}`}
                  />
                  <button onClick={() => delCol(i)} title="Supprimer la colonne" className="opacity-0 transition group-hover:opacity-100 hover:text-destructive">×</button>
                </div>
              </th>
            ))}
            <th className="w-10 border-b border-border px-1">
              <button onClick={addCol} title="Ajouter une colonne" className="rounded px-2 py-1 text-primary hover:bg-accent/60">+</button>
            </th>
          </tr>
        </thead>
        <tbody>
          {r.rows.map((row, ri) => (
            <tr key={ri} className="group transition-colors hover:bg-accent/40">
              <td className="border-b border-border/50 px-2 py-1 text-muted-foreground">
                <button onClick={() => delRow(ri)} title="Supprimer la ligne" className="group-hover:hidden">{ri + 1}</button>
                <button onClick={() => delRow(ri)} title="Supprimer la ligne" className="hidden text-destructive group-hover:inline">×</button>
              </td>
              {r.columns.map((col, ci) => {
                const cell = row[ci] ?? "";
                const pos = col?.kind === "percent" && cell.trim().startsWith("+");
                const neg = col?.kind === "percent" && /^[-−]\s?\d/.test(cell.trim());
                return (
                  <td key={ci} className="border-b border-border/50 p-0">
                    <input
                      aria-label={`Cellule ligne ${ri + 1} colonne ${ci + 1}`}
                      value={cell}
                      onChange={(e) => editCell(ri, ci, e.target.value)}
                      onBlur={persist}
                      className={`w-full min-w-16 bg-transparent px-3 py-1.5 tabular-nums outline-none focus:bg-accent/60 focus:ring-1 focus:ring-primary ${col?.align === "right" ? "text-right" : ""} ${pos ? "text-success" : neg ? "text-destructive" : ""}`}
                    />
                  </td>
                );
              })}
              <td className="border-b border-border/50" />
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-2 p-2">
        <button onClick={addRow} className="rounded-md px-3 py-1.5 text-xs text-primary hover:bg-accent/60">+ Ajouter une ligne</button>
        <button onClick={addCol} className="rounded-md px-3 py-1.5 text-xs text-primary hover:bg-accent/60">+ Ajouter une colonne</button>
      </div>
    </div>
  );

  const chartsEl = r && (
    <div className="grid gap-4 md:grid-cols-2">
      {r.donut && (
        <div className="panel p-4">
          <h3 className="mb-4 text-sm font-medium">{r.donut.title}</h3>
          <Donut data={r.donut} />
        </div>
      )}
      {r.line && (
        <div className="panel p-4">
          <h3 className="mb-4 text-sm font-medium">{r.line.title}</h3>
          <LineChart data={r.line} />
        </div>
      )}
      {(r.charts ?? []).map((c, i) => (
        <div key={`${entry?.at}-${i}`} className="panel p-4">
          <UniversalChart spec={c} />
        </div>
      ))}
    </div>
  );

  const insightIcon = { crown: Crown, growth: TrendingUp, tag: Tag, alert: AlertTriangle, info: Info } as const;
  const insightColor = { crown: "text-warning", growth: "text-success", tag: "text-violet", alert: "text-destructive", info: "text-azure" } as const;

  return (
    <div className="flex min-h-screen flex-col gap-3 p-3 lg:h-screen lg:flex-row lg:overflow-hidden">
      {/* Rail */}
      <nav className="panel flex shrink-0 items-center gap-1 overflow-x-auto p-2 lg:w-[88px] lg:flex-col lg:py-4">
        <Link to="/dashboard" className="mb-0 grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-logo text-base font-bold shadow-glow lg:mb-6 lg:h-12 lg:w-12">US</Link>
        {navItems.map((n) => (
          <button key={n.label} onClick={n.onClick} className={`relative flex shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] transition lg:w-full lg:py-3 ${n.active ? "bg-accent/60 text-foreground" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"}`}>
            {n.active && <span className="absolute left-0 top-2 hidden h-[calc(100%-16px)] w-0.5 rounded bg-violet lg:block" />}
            <span className={`grid h-7 w-7 place-items-center ${n.round ? "rounded-full border border-border" : ""} ${n.active ? "rounded-lg bg-gradient-primary shadow-glow" : ""}`}>
              <n.icon className="h-4 w-4" />
            </span>
            {n.label}
          </button>
        ))}
        <div className="ml-auto flex shrink-0 flex-col items-center gap-1 lg:ml-0 lg:mt-auto">
          <button onClick={() => supabase.auth.signOut()} title="Déconnexion" className="relative grid h-10 w-10 place-items-center rounded-full bg-gradient-primary text-sm font-semibold uppercase">
            {firstName[0]}
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-success" />
          </button>
          <span className="hidden text-xs lg:block">{firstName}</span>
          <span className="hidden text-[10px] text-muted-foreground lg:block">Pro Plan</span>
        </div>
      </nav>

      {/* Assistant column */}
      <section className="flex shrink-0 flex-col gap-3 lg:w-[290px] lg:overflow-y-auto">
        <div className="panel p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-azure" /> Assistant Ultra Smart
          </h2>
          <div className="rounded-xl bg-gradient-prompt p-3 shadow-glow">
            <textarea
              ref={taRef}
              autoFocus
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={6}
              placeholder="Décrivez votre calcul en langage naturel… ex : Calcule le CA total par mois et par région, hors retours, avec une remise de 5% pour les clients Premium."
              className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => fileRef.current?.click()} className="panel-inner flex min-w-0 items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
              <Paperclip className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{project.data_text ? "Données jointes ✓" : "Joindre des données"}</span>
            </button>
            <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,.json" hidden onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])} />
            <button onClick={voice} className={`ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full ${listening ? "bg-destructive text-destructive-foreground" : "text-muted-foreground hover:text-foreground"}`} aria-label="Dictée">
              <Mic className="h-4 w-4" />
            </button>
            <button onClick={() => submit()} disabled={busy} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-primary shadow-glow animate-pulse-glow disabled:opacity-60" aria-label="Envoyer">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="panel flex-1 p-4">
          <h2 className="mb-4 text-sm font-medium">Analyse de la demande</h2>
          <ul className="space-y-4">
            {steps.map((s, i) => {
              const done = busy ? i < stepIdx : !!r;
              const active = busy && i === stepIdx;
              return (
                <li key={i} className="flex gap-3 animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                  <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${done ? (i === 0 ? "bg-primary" : "bg-success") : "border border-border"}`}>
                    {done ? <Check className="h-3 w-3 text-primary-foreground" /> : active ? <Loader2 className="h-3 w-3 animate-spin text-azure" /> : null}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm">{s.title}</p>
                    {s.detail && !busy && <p className="text-[11px] text-azure/80">{s.detail}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-6">
            <p className="mb-2 flex items-center gap-2 text-xs">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-azure" /> : r ? <Check className="h-3.5 w-3.5 rounded-full bg-success p-0.5 text-primary-foreground" /> : null}
              {busy ? "Analyse en cours…" : r ? "Analyse terminée" : "En attente de votre demande"}
            </p>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full progress-bar transition-all duration-700" style={{ width: busy ? `${(stepIdx + 1) * 20}%` : r ? "100%" : "0%" }} />
            </div>
          </div>
        </div>
      </section>

      {/* Center */}
      <section className="panel flex min-w-0 flex-1 flex-col gap-3 p-3 lg:overflow-y-auto">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-1">
          <button onClick={rename} className="flex min-w-0 items-center gap-2 text-left">
            <h1 className="truncate text-lg font-semibold">{project.name}</h1>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
          <div className="relative flex items-center gap-1">
            {r && (
              <span className="hidden items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs sm:flex">
                <Check className="h-3 w-3 rounded-full bg-success p-0.5 text-primary-foreground" /> Exécuté avec succès
              </span>
            )}
            <button onClick={() => setIndex(project.current_index - 1)} disabled={project.current_index <= 0} className="rounded p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Annuler"><Undo2 className="h-4 w-4" /></button>
            <button onClick={() => setIndex(project.current_index + 1)} disabled={project.current_index >= project.history.length - 1} className="rounded p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Rétablir"><Redo2 className="h-4 w-4" /></button>
            <button onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Lien copié"); }} className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs hover:bg-accent">
              <Share2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Partager</span>
            </button>
            <button onClick={() => setMenu(!menu)} className="rounded-lg bg-secondary p-1.5 hover:bg-accent" aria-label="Plus"><MoreHorizontal className="h-4 w-4" /></button>
            {menu && (
              <div className="panel absolute right-0 top-10 z-20 w-48 p-1 text-sm" onMouseLeave={() => setMenu(false)}>
                <button onClick={() => { exportCsv(); setMenu(false); }} className="flex w-full items-center gap-2 rounded px-3 py-2 hover:bg-accent"><Download className="h-4 w-4" /> Exporter CSV</button>
                <button onClick={() => { rename(); setMenu(false); }} className="flex w-full items-center gap-2 rounded px-3 py-2 hover:bg-accent"><Pencil className="h-4 w-4" /> Renommer</button>
                <button onClick={async () => { if (confirm("Supprimer ce projet ?")) { await supabase.from("projects").delete().eq("id", project.id); navigate({ to: "/dashboard" }); } }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-destructive hover:bg-accent"><Trash2 className="h-4 w-4" /> Supprimer</button>
              </div>
            )}
          </div>
        </header>

        {!r ? (
          <div className="grid flex-1 place-items-center p-10 text-center">
            <div className="max-w-sm animate-fade-up">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-primary shadow-glow animate-pulse-glow">
                {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Sparkles className="h-6 w-6" />}
              </div>
              <h2 className="text-lg font-semibold">{busy ? "Ultra Smart calcule…" : "Décrivez ce que vous voulez calculer"}</h2>
              <p className="mt-2 text-sm text-muted-foreground">Formules, tableaux croisés, recherches, statistiques, finance, dates… tout ce que fait Excel, en français.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="panel-inner p-3">
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <h2 className="font-medium">Résultat</h2>
                <button onClick={() => setFull("table")} className="flex items-center gap-2 text-xs font-semibold hover:text-azure">
                  <span className="hidden sm:inline">Afficher le tableau en pleine écran</span> <Maximize2 className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[340px] overflow-auto">{tableEl}</div>
            </div>
            {chartsEl}
            {(r.donut || r.line) && (
              <button onClick={() => setFull("charts")} className="ml-auto flex items-center gap-2 text-xs font-semibold hover:text-azure">
                Afficher tout les Graphiques <Maximize2 className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </section>

      {/* Right column */}
      <aside className="flex shrink-0 flex-col gap-3 lg:w-[270px] lg:overflow-y-auto">
        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Formule générée</h2>
            <button disabled={!r} onClick={() => { navigator.clipboard.writeText(natural ? r!.naturalFormula : r!.formula); toast.success("Copié"); }} className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs text-azure hover:bg-accent disabled:opacity-40">
              <Copy className="h-3 w-3" /> Copier
            </button>
          </div>
          <pre className="panel-inner max-h-56 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed">
            {r ? (natural ? r.naturalFormula : <Formula text={r.formula} />) : <span className="text-muted-foreground">La formule apparaîtra ici.</span>}
          </pre>
          <button onClick={() => setNatural(!natural)} className="mt-3 flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <Info className="h-3.5 w-3.5" /> {natural ? "Afficher la formule" : "Afficher en langage naturel"}
          </button>
        </div>

        <div className="panel p-4">
          <h2 className="mb-3 flex items-center justify-between font-medium">Insights <ChevronRight className="h-4 w-4 text-azure" /></h2>
          <ul className="space-y-4">
            {(r?.insights ?? []).map((ins, i) => {
              const I = insightIcon[ins.icon] ?? Info;
              return (
                <li key={i} className="flex gap-3 text-xs leading-relaxed animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
                  <I className={`h-4 w-4 shrink-0 ${insightColor[ins.icon] ?? "text-azure"}`} />
                  <span>{ins.text}</span>
                </li>
              );
            })}
            {!r && <li className="text-xs text-muted-foreground">Les insights apparaîtront après votre premier calcul.</li>}
          </ul>
        </div>

        <div className="panel p-4">
          <h2 className="mb-3 font-medium">Prochaines étapes suggérées</h2>
          <div className="space-y-2">
            {(r?.suggestions ?? []).map((s, i) => (
              <button key={i} disabled={busy} onClick={() => { setPrompt(s); submit(s); }} className="panel-inner flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition hover:bg-accent/50">
                <span className="min-w-0">{s}</span> <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>

        <div className="panel grid place-items-center p-4">
          <button onClick={() => { setPrompt(""); taRef.current?.focus(); }} className="flex items-center gap-2 rounded-full bg-gradient-primary px-8 py-2.5 text-sm font-medium shadow-glow transition hover:brightness-110">
            <Sparkles className="h-4 w-4" /> Nouveau calcul
          </button>
        </div>
      </aside>

      {/* Fullscreen */}
      {full && r && (
        <div className="fixed inset-0 z-50 overflow-auto bg-background/95 p-4 backdrop-blur animate-fade-up sm:p-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{full === "table" ? "Résultat" : "Graphiques"} — {project.name}</h2>
            <button onClick={() => setFull(null)} className="rounded-lg bg-secondary p-2 hover:bg-accent" aria-label="Fermer"><X className="h-5 w-5" /></button>
          </div>
          {full === "table" ? <div className="panel p-4">{tableEl}</div> : chartsEl}
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur" onClick={() => setShowHistory(false)}>
          <div className="panel max-h-[80vh] w-full max-w-lg overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Historique</h2>
              <button onClick={() => setShowHistory(false)} aria-label="Fermer"><X className="h-4 w-4" /></button>
            </div>
            {project.history.length === 0 && <p className="text-sm text-muted-foreground">Aucune version pour l'instant.</p>}
            <ul className="space-y-2">
              {project.history.map((h, i) => (
                <li key={i}>
                  <button onClick={() => { setIndex(i); setShowHistory(false); }} className={`panel-inner w-full p-3 text-left text-xs hover:bg-accent/50 ${i === project.current_index ? "ring-2 ring-ring" : ""}`}>
                    <p className="mb-1 text-muted-foreground">Version {i + 1} · {new Date(h.at).toLocaleString("fr-FR")}</p>
                    <p className="line-clamp-2">{h.prompt}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

type SpeechRec = {
  lang: string;
  onresult: (e: { results: { 0: { 0: { transcript: string } } } }) => void;
  onend: () => void;
  start: () => void;
};

function Formula({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]*\]|"[^"]*"|\b[A-ZÉÈ][A-ZÉÈ.]{2,}(?=\())/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("[") ? <span key={i} className="text-formula-ref">{p}</span>
        : p.startsWith('"') ? <span key={i} className="text-success">{p}</span>
        : /^[A-ZÉÈ][A-ZÉÈ.]{2,}$/.test(p) ? <span key={i} className="text-foreground">{p}</span>
        : <span key={i} className="text-formula-key">{p}</span>,
      )}
    </>
  );
}
