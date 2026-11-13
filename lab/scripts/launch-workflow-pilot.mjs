import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { labRoot, repoRoot, laboratoryEnvironment } from "./prepare.mjs";
import { pilotFiles, pilotRequest } from "./workflow-pilot-fixture.mjs";
import { prepareOpenCodeRoles } from "./opencode-roles.mjs";
import { projectStartupEnvironment } from "./project-startup.mjs";

const require = createRequire(path.join(repoRoot, "package.json"));
const writeInitial = async (filename, text) => {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  try {
    await fs.writeFile(filename, text, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
};

const syncBundledFile = async (filename, content) => {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const previous = await fs.readFile(filename).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
  if (previous?.equals(content)) return;
  const temporary = filename + "." + randomUUID() + ".tmp";
  await fs.writeFile(temporary, content, { flag: "wx" });
  try { await fs.rename(temporary, filename); }
  finally { await fs.rm(temporary, { force: true }); }
};

export const prepareWorkflowPilot = async (
  root = path.join(labRoot, "profile", "workflow-pilot"),
  { fixture = false } = {},
) => {
  const data = path.join(root, "data");
  const home = path.join(root, "home");
  const project = path.join(root, "workspace");
  if (fixture) {
    for (const [name, content] of Object.entries(pilotFiles))
      await writeInitial(path.join(project, name), content);
  }
  const hasPilot = fixture || await fs.access(path.join(project, "view.json")).then(() => true, () => false);

  const bundledExtensions = {
    ...(fixture && { "openai-codex": ["index.ts", "ConfigComponent.jsx", "StatusBarComponent.jsx", "icon.png", "package.json"] }),
    "reasoning-selector": ["index.ts", "ReasoningSelector.jsx", "icon.png"],
  };
  for (const [extension, files] of Object.entries(bundledExtensions)) {
    const source = path.join(repoRoot, "packages", "extensions", "extensions", extension);
    const destination = path.join(home, "extensions", extension);
    for (const name of files) {
      const install = extension === "reasoning-selector" ? syncBundledFile : writeInitial;
      await install(path.join(destination, name), await fs.readFile(path.join(source, name)));
    }
  }
  await writeInitial(
    path.join(data, "config.json"),
    JSON.stringify(
      {
        settingsVersion: 22,
        providers: [],
        openProjects: hasPilot ? [{ active: true, baseDir: project, settings: { mainModel: "", agentProfileId: "default", modelEditFormats: {}, currentMode: "agent" } }] : [],
        recentProjects: [],
        settings: {
          language: "it",
          startupMode: "last",
          onboardingFinished: true,
          telemetryEnabled: false,
          telemetryInformed: true,
          aiderDeskAutoUpdate: false,
          memory: { enabled: false },
          extensions: { repositories: [], disabled: [] },
          server: { enabled: false },
          taskSettings: {
            smartTaskState: false,
            autoGenerateTaskName: false,
            defaultProjectMode: "agent",
            defaultWorkingMode: "local",
            renameBranchOnNameGeneration: false,
          },
        },
      },
      null,
      2,
    ),
  );
  if (fixture) await writeInitial(
    path.join(home, "agents", "workflow-pilot", "config.json"),
    JSON.stringify(
      {
        id: "default",
        name: "Pilota – GPT-6.1 Sol",
        provider: "openai-codex",
        model: "gpt-6.1-sol",
        usePowerTools: false,
        useAiderTools: false,
        useTodoTools: false,
        useSubagents: false,
        useTaskTools: false,
        useMemoryTools: false,
        useSkillsTools: false,
        useExtensionTools: false,
        enabledServers: [],
        toolApprovals: {},
      },
      null,
      2,
    ),
  );
  const pilotProfile = path.join(home, "agents", "workflow-pilot", "config.json");
  const hasPilotProfile = await fs.access(pilotProfile).then(() => true, () => false);
  const baseProfile = hasPilotProfile ? pilotProfile : path.join(home, "agents", "power-tools", "config.json");
  prepareOpenCodeRoles(home, baseProfile);
  await writeInitial(path.join(home, "mcp-servers.json"), '{"mcpServers":{}}');
  return {
    data,
    project,
    env: {
      ...laboratoryEnvironment(),
      NODE_ENV: "production",
      AIDER_DESK_LAB_MODE: "false",
      AIDER_DESK_GENERAL_MODE: "false",
      AIDER_DESK_NO_UPDATES: "true",
      AIDER_DESK_DATA_DIR: data,
      AIDER_DESK_HOME_DIR: home,
      AIDER_DESK_DIR: ".aider-desk",
      ...(hasPilot && { AIDER_DESK_WORKFLOW_PILOT_DIR: project }),
      AIDER_DESK_PORT: "24361",
      AIDER_DESK_RESOURCES_DIR: path.join(repoRoot, "resources"),
      AIDER_DESK_WORKFLOW_NODE: process.execPath,
      AIDER_DESK_WORKFLOW_BROWSER_CHECK: path.join(labRoot, "scripts", "verify-workflow-browser.mjs"),
    },
  };
};

export const serveWorkflowPreview = async (project) => {
  const files = new Map([
    ["/", ["index.html", "text/html; charset=utf-8"]],
    ["/view.json", ["view.json", "application/json"]],
  ]);
  const server = createServer(async (request, response) => {
    const entry = files.get(request.url);
    if (request.method !== "GET" || !entry) {
      response.writeHead(404).end();
      return;
    }
    try {
      const file = path.join(project, entry[0]);
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.nlink !== 1)
        throw new Error("File fuori perimetro");
      response
        .writeHead(200, {
          "Content-Type": entry[1],
          "Cache-Control": "no-store",
          "Content-Security-Policy":
            "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
        })
        .end(await fs.readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { server, url: "http://127.0.0.1:" + server.address().port + "/" };
};

export const launchWorkflowPilot = async ({ full = false } = {}) => {
  const build = path.join(
    labRoot,
    "work",
    full ? "workflow-environment-desktop-pair-build" : "workflow-pilot-build-reasoning",
    "main",
    "index.js",
  );
  await fs.access(build);
  const root = path.join(labRoot, "profile", "workflow-pilot");
  const data = path.join(root, "data");
  await fs.mkdir(data, { recursive: true });
  const lockPath = path.join(data, "launcher.lock");
  const lock = await fs.open(lockPath, "wx");
  let preview;
  try {
    const pilot = await prepareWorkflowPilot(root);
    const { project, env } = full
      ? await (await import("./workflow-environment.mjs")).prepareWorkflowEnvironment(pilot, root)
      : pilot;
    Object.assign(env, projectStartupEnvironment());
    if (full) env.AIDER_DESK_WORKFLOW_REMOTE_PORT = "24363";
    if (pilot.env.AIDER_DESK_WORKFLOW_PILOT_DIR) preview = await serveWorkflowPreview(project);
    if (full) console.log("Configurazione e associazione remota: " + data);
    if (preview) {
      console.log("Progetto pilota: " + project);
      console.log("Anteprima locale: " + preview.url);
      console.log("Richiesta di prova: " + pilotRequest);
    }
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(require("electron"), [build], {
        cwd: repoRoot,
        env,
        windowsHide: false,
        stdio: "inherit",
      });
      child.once("error", reject);
      child.once("exit", resolve);
    });
    process.exitCode = exitCode ?? 1;
  } finally {
    preview?.server.close();
    await lock.close();
    await fs.unlink(lockPath);
  }
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await launchWorkflowPilot({ full: process.argv.includes("--full") }).catch((error) => {
    console.error(
      error.code === "EEXIST"
        ? "Esiste già un avvio del pilota. Verifica che la finestra sia chiusa prima di rimuovere un lock rimasto dopo un arresto."
        : error.message,
    );
    process.exitCode = 1;
  });
}
