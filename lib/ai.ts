import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";

const DEFAULT_MODEL = "gemini-3.5-flash";

/** Env values pasted from a dashboard often keep their quotes; PEM keys keep literal "\n". */
const clean = (v?: string) => v?.trim().replace(/^["'“”]+|["'“”]+$/g, "") || undefined;

/**
 * The Gemini model every AI route uses. Server-only: credentials are read
 * here and never leave the server.
 *
 * - Vertex AI with a service account when GOOGLE_GENAI_USE_VERTEXAI=true (or the
 *   GCP_* service-account vars are set) — GOOGLE_CLOUD_PROJECT,
 *   GOOGLE_CLOUD_LOCATION, GCP_CLIENT_EMAIL, GCP_PRIVATE_KEY.
 * - Otherwise a Gemini API key (GEMINI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY).
 */
export function geminiModel() {
  const modelId = clean(process.env.GEMINI_MODEL) || DEFAULT_MODEL;
  const clientEmail = clean(process.env.GCP_CLIENT_EMAIL);
  const privateKey = clean(process.env.GCP_PRIVATE_KEY)?.replace(/\\n/g, "\n");
  const useVertex = clean(process.env.GOOGLE_GENAI_USE_VERTEXAI) === "true" || Boolean(clientEmail && privateKey);

  if (useVertex) {
    const project = clean(process.env.GOOGLE_CLOUD_PROJECT);
    if (!project || !clientEmail || !privateKey) {
      throw new Error(
        "Vertex AI is on but not fully set up — need GOOGLE_CLOUD_PROJECT, GCP_CLIENT_EMAIL and GCP_PRIVATE_KEY.",
      );
    }
    const vertex = createVertex({
      project,
      location: clean(process.env.GOOGLE_CLOUD_LOCATION) || "global",
      googleAuthOptions: { credentials: { client_email: clientEmail, private_key: privateKey } },
    });
    return vertex(modelId);
  }

  const apiKey =
    clean(process.env.GOOGLE_GENERATIVE_AI_API_KEY) ||
    clean(process.env.GEMINI_API_KEY) ||
    clean(process.env.GOOGLE_API_KEY);
  if (!apiKey) {
    throw new Error(
      "No AI credentials found. Set the Vertex service-account vars or GEMINI_API_KEY, then restart the server.",
    );
  }
  return createGoogleGenerativeAI({ apiKey })(modelId);
}
