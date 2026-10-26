import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  cleanText,
  LIMITS,
  resolveBranch,
  withSiteLine,
  type BranchRow,
} from "@/lib/contact-submission";
import { isGraceTicketId } from "@/lib/grace-handoff";

const TOPICS = new Set([
  "Sunday visit",
  "Prayer",
  "Giving",
  "Pastoral",
  "General",
  "Chat follow-up",
  "Baptism",
]);

const MAX_TICKET = 64;
const MAX_TRANSCRIPT = 6000;

type LocalContactRecord = {
  id: string;
  created_at: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  topic: string;
  branch: string | null;
  message: string;
  workspace: "kharis";
  status: "new";
};

let localContactWriteQueue: Promise<void> = Promise.resolve();

/** Development-only persistence for previews without configured Supabase credentials. */
function saveLocalContact(record: LocalContactRecord): Promise<void> {
  const save = localContactWriteQueue.then(async () => {
    const [{ mkdir, readFile, rename, writeFile }, { dirname, join }] = await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
    ]);
    const file = join(process.cwd(), ".local-data", "contact-messages.json");
    await mkdir(dirname(file), { recursive: true });

    let records: LocalContactRecord[] = [];
    try {
      records = JSON.parse(await readFile(file, "utf8")) as LocalContactRecord[];
      if (!Array.isArray(records)) throw new Error("Local contact store is not an array.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const temporaryFile = `${file}.${record.id}.tmp`;
    await writeFile(temporaryFile, JSON.stringify([...records, record], null, 2) + "\n", {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryFile, file);
  });

  localContactWriteQueue = save.then(
    () => undefined,
    () => undefined,
  );
  return save;
}

async function localContactResponse(
  input: Omit<LocalContactRecord, "id" | "created_at" | "workspace" | "status">,
) {
  const [{ randomUUID }] = await Promise.all([import("node:crypto")]);
  const id = randomUUID();
  try {
    await saveLocalContact({
      ...input,
      id,
      created_at: new Date().toISOString(),
      workspace: "kharis",
      status: "new",
    });
  } catch (error) {
    console.error("Local development contact save error:", error);
    return NextResponse.json(
      { ok: false, error: "Unable to save your message locally. Please try again." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, id, storage: "local-development" });
}

function sanitizeTicket(raw: unknown): string {
  const t = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!t || t.length > MAX_TICKET) return "";
  if (!isGraceTicketId(t)) return "";
  return t;
}

function sanitizeTranscript(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .slice(0, MAX_TRANSCRIPT);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const nameParts = cleanText(data.name, LIMITS.name).split(/\s+/).filter(Boolean);
  let first = cleanText(data.first, LIMITS.name);
  let last = cleanText(data.last, LIMITS.name);
  if (!first && nameParts[0]) first = nameParts[0];
  if (!last && nameParts.length === 1) last = nameParts[0] ?? "";
  if (!last && nameParts.length > 1) last = nameParts.slice(1).join(" ");
  const email = cleanText(data.email, LIMITS.email);
  const phone = cleanText(data.phone, LIMITS.phone);
  const topic = cleanText(data.topic ?? "General", 40);
  const branch = cleanText(data.branch, LIMITS.branch);
  let message = cleanText(data.message, LIMITS.message);
  const chatTicket = sanitizeTicket(data.chatTicket);
  const chatTranscript = sanitizeTranscript(data.chatTranscript);

  if (chatTicket && !message.includes("--- Grace chat handoff ---")) {
    const staffBlock = [
      `--- Grace chat handoff ---`,
      `Ticket: ${chatTicket}`,
      chatTranscript ? `Transcript:\n${chatTranscript}` : null,
      `--- end handoff ---`,
    ]
      .filter(Boolean)
      .join("\n");
    message = `${message}\n\n${staffBlock}`.trim();
  }

  if (!first || !last) {
    return NextResponse.json({ ok: false, error: "Please enter your name." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Please enter a valid email." }, { status: 400 });
  }
  if (message.length < 8) {
    return NextResponse.json(
      {
        ok: false,
        error: "Please add a short message so we know how to help.",
      },
      { status: 400 },
    );
  }
  if (!TOPICS.has(topic)) {
    return NextResponse.json({ ok: false, error: "Please choose a topic." }, { status: 400 });
  }

  message = withSiteLine(message, "Main site");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    if (process.env.NODE_ENV === "development") {
      return localContactResponse({
        first_name: first,
        last_name: last,
        email,
        phone: phone || null,
        topic,
        branch: branch || null,
        message,
      });
    }

    console.error("Missing Supabase server environment variables");
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  // File the message under the branch in the directory, and in the KP2 inbox for KP2 branches.
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    const { data: branchRows } = await supabase.from("branches").select("id, name, workspace");
    const filed = resolveBranch((branchRows ?? []) as BranchRow[], data.branchId, branch);

    const { data: row, error } = await supabase
      .from("contact_messages")
      .insert({
        first_name: first,
        last_name: last,
        email,
        phone: phone || null,
        topic,
        branch_id: filed.branch_id,
        branch_name: filed.branch_name,
        message,
        workspace: filed.workspace,
        status: "new",
      })
      .select("id")
      .single();

    if (error) {
      console.error("Supabase contact insert error:", error);
      if (process.env.NODE_ENV === "development") {
        return localContactResponse({
          first_name: first,
          last_name: last,
          email,
          phone: phone || null,
          topic,
          branch: filed.branch_name,
          message,
        });
      }
      return NextResponse.json(
        { ok: false, error: "Unable to send your message. Please try again." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      id: row.id,
    });
  } catch (error) {
    console.error("Supabase contact request failed:", error);
    if (process.env.NODE_ENV === "development") {
      return localContactResponse({
        first_name: first,
        last_name: last,
        email,
        phone: phone || null,
        topic,
        branch: branch || null,
        message,
      });
    }
    return NextResponse.json(
      { ok: false, error: "Unable to send your message. Please try again." },
      { status: 500 },
    );
  }
}
