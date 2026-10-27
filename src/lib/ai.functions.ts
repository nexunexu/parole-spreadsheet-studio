import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { HistoryEntry, SheetResult } from "./sheet-types";

const SYSTEM = `Tu es "Ultra Smart", un tableur intelligent qui remplace Excel. L'utilisateur décrit en langage naturel un calcul, un tableau, une analyse, une formule ou toute opération possible dans Excel (formules, fonctions, RECHERCHEV, SOMME.SI.ENS, TCD, tris, filtres, dates, texte, finance, statistiques, mises en forme conditionnelles décrites, etc.).
Tu analyses la demande, tu exécutes réellement le calcul et tu renvoies le résultat.
- Si des données sont fournies, calcule EXACTEMENT à partir d'elles.
- Sinon, génère des données d'exemple réalistes et cohérentes, puis calcule.
- Si c'est un affinement, pars du résultat précédent et modifie-le.
- Les nombres dans "rows" sont formatés à la française (espaces pour milliers, virgule décimale, ex "1 234 567", "+9,01%", "—").
- Donne aussi la formule Excel française équivalente (SOMME.SI.ENS, SI, RECHERCHEX...), multi-ligne indentée.
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, de cette forme exacte:
{"title":"Nom_De_Fichier_Court","summary":"phrase","formula":"...","naturalFormula":"explication en français","columns":[{"label":"...","align":"left|right","kind":"text|number|percent"}],"rows":[["..."]],"steps":[{"title":"Compréhension du besoin","detail":"..."},{"title":"Détection des règles","detail":"..."},{"title":"Sélection des données","detail":"..."},{"title":"Construction du calcul","detail":"..."},{"title":"Vérification & optimisation","detail":"..."}],"insights":[{"icon":"crown|growth|tag|alert|info","text":"..."}],"suggestions":["3 prochaines étapes courtes"],"donut":{"title":"...","totalLabel":"7,66 M€","items":[{"label":"...","value":123}]} ou null,"line":{"title":"...","xLabels":["..."],"series":[{"name":"...","values":[1]}]} ou null}
Exactement 3 insights et 3 suggestions. Maximum 200 lignes.`;

function parseJson(text: string): SheetResult {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Réponse IA invalide");
  const r = JSON.parse(text.slice(start, end + 1)) as SheetResult;
  r.rows = (r.rows ?? []).slice(0, 200).map((row) => row.map((c) => String(c ?? "")));
  r.columns ??= [];
  r.steps ??= [];
  r.insights = (r.insights ?? []).slice(0, 3);
  r.suggestions = (r.suggestions ?? []).slice(0, 3);
  return r;
}

export const runCalculation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ projectId: z.string().uuid(), prompt: z.string().min(1).max(4000) }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: project, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .single();
    if (error || !project) throw new Error("Projet introuvable");

    const all = (project.history as unknown as HistoryEntry[]) ?? [];
    const history = all.slice(0, project.current_index + 1);
    const last = history[history.length - 1];

    const messages: { role: "user" | "assistant"; content: string }[] = [];
    if (project.data_text)
      messages.push({ role: "user", content: `Données jointes (CSV/texte):\n${project.data_text.slice(0, 30000)}` });
    for (const h of history.slice(-4, -1)) messages.push({ role: "user", content: h.prompt });
    if (last) {
      messages.push({ role: "user", content: last.prompt });
      messages.push({ role: "assistant", content: JSON.stringify(last.result) });
    }
    messages.push({ role: "user", content: last ? `Affinement : ${data.prompt}` : data.prompt });

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Clé IA non configurée");
    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText } = await import("ai");
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    let text: string;
    try {
      const result = streamText({
        model: provider.responses("openai/gpt-6-luna") as never,
        messages,
        maxRetries: 0,
        providerOptions: {
          openai: {
            store: false,
            forceReasoning: true,
            reasoningEffort: "low",
            reasoningSummary: "auto",
            include: ["reasoning.encrypted_content"],
          },
        },
      });
      text = await result.text;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("402")) throw new Error("Crédits IA épuisés. Ajoutez des crédits à votre espace.");
      if (msg.includes("429")) throw new Error("Trop de requêtes, réessayez dans un instant.");
      throw new Error("Le moteur IA n'a pas pu répondre : " + msg.slice(0, 200));
    }
    const parsed = parseJson(text);
    const entry: HistoryEntry = { prompt: data.prompt, result: parsed, at: new Date().toISOString() };
    const newHistory = [...history, entry];
    const update: Record<string, unknown> = {
      history: newHistory,
      current_index: newHistory.length - 1,
      updated_at: new Date().toISOString(),
    };
    if (all.length === 0 && (project as { name: string }).name === "Nouveau projet") update.name = parsed.title;
    const { error: upErr } = await supabase.from("projects").update(update as never).eq("id", data.projectId);
    if (upErr) throw new Error(upErr.message);
    return entry;
  });
