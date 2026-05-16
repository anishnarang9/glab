// P4 — Resend wrapper with console-print fallback for demo
// Exports: sendDigest(to, markdown), or console.log fallback when RESEND_API_KEY is unset

export type SendDigestOptions = {
  subject?: string;
  from?: string;
  dryRun?: boolean;
};

export type SendDigestResult = {
  provider: "resend" | "console";
  sent: boolean;
  id?: string;
  to: string;
  subject: string;
};

type RuntimeProcess = {
  env?: Record<string, string | undefined>;
};

function env(name: string): string | undefined {
  const runtime = globalThis as unknown as { process?: RuntimeProcess; Bun?: { env?: Record<string, string | undefined> } };
  return runtime.process?.env?.[name] ?? runtime.Bun?.env?.[name];
}

export async function sendDigest(
  to: string,
  markdown: string,
  options: SendDigestOptions = {},
): Promise<SendDigestResult> {
  const recipient = cleanEmail(to);
  const body = markdown.trim();
  if (!body) {
    throw new Error("Digest markdown is empty.");
  }

  const subject = options.subject?.trim() || "LabBrain daily paper digest";
  const from = options.from?.trim() || env("RESEND_FROM") || "LabBrain <onboarding@resend.dev>";
  const apiKey = env("RESEND_API_KEY");

  if (!apiKey || options.dryRun) {
    printDigest(recipient, subject, body, options.dryRun ? "dry run" : "RESEND_API_KEY missing");
    return { provider: "console", sent: false, to: recipient, subject };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipient,
      subject,
      html: markdownToHtml(body),
      text: body,
    }),
  });

  const text = await response.text();
  const payload = text ? safeJson(text) : {};

  if (!response.ok) {
    const message = typeof payload === "object" && payload != null && "message" in payload
      ? String((payload as { message: unknown }).message)
      : text;
    throw new Error(`Resend ${response.status} ${response.statusText}: ${message}`);
  }

  const id = typeof payload === "object" && payload != null && "id" in payload
    ? String((payload as { id: unknown }).id)
    : undefined;
  return { provider: "resend", sent: true, id, to: recipient, subject };
}

function cleanEmail(value: string): string {
  const email = value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`Invalid email address: ${value}.`);
  }
  return email;
}

function printDigest(to: string, subject: string, markdown: string, reason: string): void {
  console.log(`LabBrain digest fallback (${reason})`);
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log("");
  console.log(markdown);
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let inList = false;

  for (const line of lines) {
    if (line.startsWith("### ")) {
      closeList();
      html.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      closeList();
      html.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      closeList();
      html.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(line.replace(/^[-*]\s+/, ""))}</li>`);
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      html.push(`<p>${inlineMarkdown(line)}</p>`);
    }
  }

  closeList();
  return `<!doctype html><html><body>${html.join("\n")}</body></html>`;

  function closeList(): void {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  }
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
