// One-time helper: connects SUG Packs to its Dropbox app folder.
//
// Run it in a terminal, in this folder:   node setup/dropbox-token.mjs
// It opens Dropbox so you can click "Allow", then puts the refresh token on
// your clipboard, ready for Supabase → Edge Functions → Secrets. The token is
// never printed or saved to a file.

import { createHash, randomBytes } from "node:crypto";
import { exec, spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";

const APP_KEY = "7jyw1f6xaj2q0zq"; // the SUG Packs Dropbox app key (not secret)
const NEEDED = ["files.metadata.read", "files.content.read", "files.content.write", "sharing.read", "sharing.write"];

const base64url = (buffer) => buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const verifier = base64url(randomBytes(48));
const challenge = base64url(createHash("sha256").update(verifier).digest());
const url = "https://www.dropbox.com/oauth2/authorize?" + new URLSearchParams({
  client_id: APP_KEY,
  response_type: "code",
  token_access_type: "offline",
  code_challenge: challenge,
  code_challenge_method: "S256",
});

console.log("\n1) Dropbox is opening in your browser. Click Continue, then Allow.");
console.log(`   (If nothing opens, copy this link into your browser:)\n   ${url}\n`);
exec(`open "${url}"`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const code = (await rl.question("2) Paste the code Dropbox shows you, then press Enter: ")).trim();
rl.close();

const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
  method: "POST",
  body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: APP_KEY, code_verifier: verifier }),
});
const data = await res.json();

if (!res.ok || !data.refresh_token) {
  console.error("\nThat didn't work:", data.error_description || data.error || res.status);
  console.error("Run the script again and paste the newest code (each code works once).\n");
  process.exit(1);
}

const granted = String(data.scope ?? "").split(" ");
const missing = NEEDED.filter((scope) => !granted.includes(scope));
if (missing.length) {
  console.error(`\nDropbox didn't grant: ${missing.join(", ")}`);
  console.error("Tick them in the Dropbox App Console → Permissions → Submit, then run this again.\n");
  process.exit(1);
}

if (process.platform === "darwin") {
  const copy = spawn("pbcopy");
  copy.stdin.end(data.refresh_token);
  console.log("\nDone. The refresh token is on your clipboard.\n");
} else {
  console.log(`\nDone. Refresh token:\n${data.refresh_token}\n`);
}
console.log("In Supabase → Edge Functions → Secrets, add:");
console.log(`   DROPBOX_APP_KEY        ${APP_KEY}`);
console.log("   DROPBOX_REFRESH_TOKEN  (paste from clipboard)\n");
console.log("Keep the refresh token private: it opens the SUG Packs app folder.\n");
