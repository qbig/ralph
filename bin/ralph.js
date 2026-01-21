#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const VERSION = "0.1.0";
const DEFAULT_MODE = "build";
const DEFAULT_OUTPUT_FORMAT = "stream-json";
const DEFAULT_CURSOR_CMD = "cursor-agent";
const OUTPUT_FORMATS = new Set(["text", "json", "stream-json"]);
const MODES = new Set(["build", "plan"]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_TEMPLATES_DIR = path.resolve(__dirname, "../templates");

function printHelp() {
  console.log(`ralph ${VERSION}

Usage:
  ralph init [--dir <path>] [--force]
  ralph run [plan|build] [max] [options]
  ralph loop [options]
  ralph status
  ralph [plan|build] [max] [options]

Run options:
  --mode <build|plan>        Select prompt mode (default: build)
  --max <n>                  Max iterations (0 = unlimited)
  --plan-max <n>             Plan iterations for loop mode (default: 1)
  --prompt-file <path>       Override prompt file path
  --ralph-dir <path>         Ralph files directory (default: ralph/)
  --plan-branch <name>       Branch name to create for plan mode
  --until-done               Stop when PROGRESS.md has DONE + no unchecked items (default: build/loop)
  --no-until-done            Disable done detection
  --sleep <seconds>          Sleep between iterations
  --max-minutes <minutes>    Stop after elapsed minutes
  --log-file <path>          Append JSONL run logs to this file
  --model <name>             Cursor model name
  --output-format <format>   text | json | stream-json (default: stream-json)
  --[no-]force               Allow file changes in print mode (default: --force)
  --api-key <key>            Cursor API key (optional; else CURSOR_API_KEY)
  --cursor-cmd <cmd>         Cursor CLI command (default: cursor-agent)
  --skip-auth-check          Skip cursor-agent status check
  --verbose                  Pass --verbose to cursor-agent

Init options:
  --dir <path>               Target directory (default: ralph/)
  --force                    Overwrite existing files

General:
  -h, --help                 Show help
  -v, --version              Show version
`);
}

function die(message, code = 1) {
  console.error(`Error: ${message}`);
  process.exit(code);
}

function parseFlags(args) {
  const opts = { positional: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      opts.help = true;
      continue;
    }
    if (arg === "-v" || arg === "--version") {
      opts.version = true;
      continue;
    }
    if (arg === "--force") {
      opts.force = true;
      continue;
    }
    if (arg === "--no-force") {
      opts.force = false;
      continue;
    }
    if (arg === "--until-done") {
      opts.untilDone = true;
      continue;
    }
    if (arg === "--no-until-done") {
      opts.untilDone = false;
      continue;
    }
    if (arg === "--verbose") {
      opts.verbose = true;
      continue;
    }
    if (arg === "--skip-auth-check") {
      opts.skipAuthCheck = true;
      continue;
    }

    const valueFlags = new Set([
      "--mode",
      "-m",
      "--max",
      "-n",
      "--plan-max",
      "--prompt-file",
      "--ralph-dir",
      "--plan-branch",
      "--model",
      "--output-format",
      "--api-key",
      "--sleep",
      "--max-minutes",
      "--log-file",
      "--cursor-cmd",
      "--dir",
    ]);
    if (valueFlags.has(arg)) {
      if (i + 1 >= args.length) {
        die(`Missing value for ${arg}`);
      }
      const value = args[i + 1];
      i++;
      switch (arg) {
        case "--mode":
        case "-m":
          opts.mode = value;
          break;
        case "--max":
        case "-n":
          opts.max = value;
          break;
        case "--prompt-file":
          opts.promptFile = value;
          break;
        case "--ralph-dir":
          opts.ralphDir = value;
          break;
        case "--plan-max":
          opts.planMax = value;
          break;
        case "--plan-branch":
          opts.planBranch = value;
          break;
        case "--model":
          opts.model = value;
          break;
        case "--output-format":
          opts.outputFormat = value;
          break;
        case "--api-key":
          opts.apiKey = value;
          break;
        case "--sleep":
          opts.sleep = value;
          break;
        case "--max-minutes":
          opts.maxMinutes = value;
          break;
        case "--log-file":
          opts.logFile = value;
          break;
        case "--cursor-cmd":
          opts.cursorCmd = value;
          break;
        case "--dir":
          opts.dir = value;
          break;
        default:
          break;
      }
      continue;
    }

    if (arg.startsWith("-")) {
      die(`Unknown option: ${arg}`);
    }

    opts.positional.push(arg);
  }
  return opts;
}

function resolveTemplatesDir() {
  if (process.env.RALPH_TEMPLATES_DIR) {
    return path.resolve(process.env.RALPH_TEMPLATES_DIR);
  }
  return DEFAULT_TEMPLATES_DIR;
}

function resolveRalphDir(override) {
  if (override) return path.resolve(process.cwd(), override);
  if (process.env.RALPH_DIR) return path.resolve(process.cwd(), process.env.RALPH_DIR);
  return path.resolve(process.cwd(), "ralph");
}

function initCommand(args) {
  const opts = parseFlags(args);
  if (opts.help) {
    printHelp();
    process.exit(0);
  }
  const targetDir = opts.dir
    ? path.resolve(process.cwd(), opts.dir)
    : resolveRalphDir(opts.ralphDir);
  const force = Boolean(opts.force);

  const templatesDir = resolveTemplatesDir();
  const templates = [
    "AGENTS.md",
    "PRD.md",
    "PROGRESS.md",
    "PROMPT_build.md",
    "PROMPT_plan.md",
  ];

  if (!fs.existsSync(templatesDir)) {
    die(`Templates directory not found: ${templatesDir}`);
  }

  fs.mkdirSync(targetDir, { recursive: true });

  const results = [];
  for (const name of templates) {
    const src = path.join(templatesDir, name);
    const dest = path.join(targetDir, name);
    if (!fs.existsSync(src)) {
      die(`Missing template: ${src}`);
    }
    const existed = fs.existsSync(dest);
    if (existed && !force) {
      results.push(`skip ${path.relative(process.cwd(), dest)}`);
      continue;
    }
    fs.copyFileSync(src, dest);
    results.push(`${existed ? "overwrite" : "write"} ${path.relative(process.cwd(), dest)}`);
  }

  console.log(results.join("\n"));
}

function parseMax(value) {
  if (value === undefined || value === null) return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    die(`Invalid max iterations: ${value}`);
  }
  return n;
}

function parsePositiveNumber(value, label) {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    die(`Invalid ${label}: ${value}`);
  }
  return n;
}

function parseSleepMs(value) {
  const seconds = parsePositiveNumber(value, "sleep seconds");
  if (seconds === null) return 0;
  return Math.round(seconds * 1000);
}

function parseMaxMinutesMs(value) {
  const minutes = parsePositiveNumber(value, "max minutes");
  if (minutes === null) return 0;
  return Math.round(minutes * 60 * 1000);
}

function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      die("git not found. Install git to use plan/build branch workflows.");
    }
    die(`Failed to run git ${args.join(" ")}: ${result.error.message}`);
  }
  return result;
}

function tryGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    return null;
  }
  return result;
}

function isGitRepo() {
  const result = tryGit(["rev-parse", "--is-inside-work-tree"]);
  return Boolean(result && result.stdout.trim() === "true");
}

function ensureGitRepo() {
  const result = runGit(["rev-parse", "--is-inside-work-tree"]);
  if (result.status !== 0 || result.stdout.trim() !== "true") {
    die("Not a git repository. Initialize git before running plan mode.");
  }
}

function getGitDir() {
  const result = runGit(["rev-parse", "--git-dir"]);
  if (result.status !== 0) {
    die("Unable to resolve git directory.");
  }
  const gitDir = result.stdout.trim();
  if (!gitDir) {
    die("Unable to resolve git directory.");
  }
  return path.resolve(process.cwd(), gitDir);
}

function getCurrentBranch() {
  const result = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (result.status !== 0) {
    die("Unable to determine current branch.");
  }
  return result.stdout.trim();
}

function isWorktreeClean() {
  const result = runGit(["status", "--porcelain"]);
  if (result.status !== 0) {
    die("Unable to determine git status.");
  }
  return result.stdout.trim().length === 0;
}

function commitIfNeeded(message) {
  if (!isGitRepo()) return null;
  const status = runGit(["status", "--porcelain"]);
  if (status.status !== 0) {
    die("Unable to determine git status before commit.");
  }
  if (status.stdout.trim().length === 0) {
    return null;
  }
  const addResult = runGit(["add", "-A"]);
  if (addResult.status !== 0) {
    const msg = (addResult.stderr || addResult.stdout || "").trim();
    die(`git add failed: ${msg || "non-zero exit"}`);
  }
  const commitResult = runGit(["commit", "-m", message]);
  if (commitResult.status !== 0) {
    const msg = (commitResult.stderr || commitResult.stdout || "").trim();
    if (/author identity unknown|user\.email|user\.name/i.test(msg)) {
      die("git commit failed: configure user.name and user.email before running ralph.");
    }
    die(`git commit failed: ${msg || "non-zero exit"}`);
  }
  const hashResult = runGit(["rev-parse", "HEAD"]);
  if (hashResult.status !== 0) {
    return null;
  }
  return hashResult.stdout.trim();
}

function branchExists(branch) {
  const result = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
    encoding: "utf8",
  });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      die("git not found. Install git to use plan/build branch workflows.");
    }
    die(`Failed to check branch ${branch}: ${result.error.message}`);
  }
  return result.status === 0;
}

function checkoutNewBranch(branch) {
  const result = runGit(["checkout", "-b", branch]);
  if (result.status !== 0) {
    const msg = (result.stderr || result.stdout || "").trim();
    die(`Failed to create branch ${branch}: ${msg || "non-zero exit"}`);
  }
}

function checkoutBranch(branch) {
  const result = runGit(["checkout", branch]);
  if (result.status !== 0) {
    const msg = (result.stderr || result.stdout || "").trim();
    die(`Failed to checkout branch ${branch}: ${msg || "non-zero exit"}`);
  }
}

function defaultPlanBranchName() {
  const iso = new Date().toISOString();
  const stamp = iso.replace(/\.\d+Z$/, "Z").replace(/[-:]/g, "").replace("T", "-");
  return `ralph/plan-${stamp}`;
}

function getPlanBranchRecordPath() {
  return path.join(getGitDir(), "ralph-plan-branch");
}

function writePlanBranchRecord(branch) {
  const recordPath = getPlanBranchRecordPath();
  fs.writeFileSync(recordPath, `${branch}\n`, "utf8");
}

function readPlanBranchRecord() {
  if (!isGitRepo()) return null;
  const recordPath = getPlanBranchRecordPath();
  if (!fs.existsSync(recordPath)) return null;
  const content = fs.readFileSync(recordPath, "utf8").trim();
  return content.length > 0 ? content : null;
}

function ensurePlanBranch(planBranch) {
  ensureGitRepo();
  const base = planBranch || defaultPlanBranchName();
  let branch = base;
  if (planBranch) {
    if (branchExists(branch)) {
      die(`Plan branch already exists: ${branch}`);
    }
  } else {
    let counter = 1;
    while (branchExists(branch)) {
      counter += 1;
      branch = `${base}-${counter}`;
    }
  }
  checkoutNewBranch(branch);
  writePlanBranchRecord(branch);
  return branch;
}

function syncToPlanBranchIfNeeded() {
  const planBranch = readPlanBranchRecord();
  if (!planBranch) return null;
  if (!branchExists(planBranch)) {
    die(`Recorded plan branch not found: ${planBranch}. Delete the record or recreate the plan.`);
  }
  const current = getCurrentBranch();
  if (current !== planBranch) {
    if (!isWorktreeClean()) {
      die(`Current branch ${current} has uncommitted changes. Commit or stash before switching to ${planBranch}.`);
    }
    checkoutBranch(planBranch);
    console.log(`Switched to plan branch: ${planBranch}`);
  }
  return planBranch;
}

function getStateDir() {
  if (isGitRepo()) {
    return path.join(getGitDir(), "ralph");
  }
  return path.join(process.cwd(), ".ralph");
}

function getStatePath() {
  return path.join(getStateDir(), "state.json");
}

function readState() {
  const statePath = getStatePath();
  if (!fs.existsSync(statePath)) return null;
  try {
    const raw = fs.readFileSync(statePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeState(update) {
  const stateDir = getStateDir();
  fs.mkdirSync(stateDir, { recursive: true });
  const statePath = path.join(stateDir, "state.json");
  const current = readState() || {};
  const next = {
    ...current,
    ...update,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(statePath, JSON.stringify(next, null, 2), "utf8");
  return next;
}

function defaultLogFile() {
  return path.join(getStateDir(), "loop.log");
}

function resolveLogFile(logFile) {
  if (!logFile) return null;
  return path.resolve(process.cwd(), logFile);
}

function appendLog(logFile, event, data = {}) {
  if (!logFile) return;
  const dir = path.dirname(logFile);
  fs.mkdirSync(dir, { recursive: true });
  const entry = {
    ts: new Date().toISOString(),
    event,
    ...data,
  };
  fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`, "utf8");
}

function readPrdStatus(prdPath) {
  if (!fs.existsSync(prdPath)) {
    return { exists: false, status: null, ready: false };
  }
  const content = fs.readFileSync(prdPath, "utf8");
  const match = content.match(/^\s*Status\s*:\s*(.+)$/im);
  if (!match) {
    return { exists: true, status: null, ready: false };
  }
  const statusRaw = match[1].trim();
  const normalized = statusRaw.toLowerCase();
  const word = normalized.split(/[^a-z]+/).filter(Boolean)[0] || normalized;
  const readyWords = new Set(["ready", "approved", "final"]);
  return { exists: true, status: statusRaw, ready: readyWords.has(word) };
}

function readProgressStatus(progressPath) {
  if (!fs.existsSync(progressPath)) {
    return { exists: false, status: null, done: false };
  }
  const content = fs.readFileSync(progressPath, "utf8");
  const statusMatch = content.match(/^\s*Status\s*:\s*(.+)$/im);
  const statusRaw = statusMatch ? statusMatch[1].trim() : null;

  const doneMarker = /^\s*DONE\s*$/im.test(content);
  const uncheckedMatches = content.match(/^\s*[-*]\s+\[\s\]/gm);
  const uncheckedCount = uncheckedMatches ? uncheckedMatches.length : 0;
  const done = doneMarker && uncheckedCount === 0;

  return {
    exists: true,
    status: statusRaw,
    done,
    doneMarker,
    uncheckedCount,
  };
}

function checkCursorInstalled(cmd) {
  const result = spawnSync(cmd, ["--version"], { encoding: "utf8" });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      die(`Cursor CLI not found (expected '${cmd}'). Install Cursor CLI and ensure it is on your PATH.`);
    }
    die(`Failed to run '${cmd} --version': ${result.error.message}`);
  }
  if (result.status !== 0) {
    const msg = (result.stderr || result.stdout || "").trim();
    die(`Cursor CLI check failed: ${msg || "non-zero exit"}`);
  }
}

function checkCursorAuth(cmd, apiKey) {
  const args = [];
  if (apiKey) args.push("--api-key", apiKey);
  args.push("status");
  const result = spawnSync(cmd, args, { encoding: "utf8" });
  if (result.error) {
    die(`Failed to check Cursor auth status: ${result.error.message}`);
  }
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.status !== 0 || /not authenticated|not logged in|login required/i.test(output)) {
    die("Cursor CLI is not authenticated. Run 'cursor-agent login' or set CURSOR_API_KEY / --api-key.");
  }
}

function printRunBanner({
  mode,
  promptFile,
  max,
  outputFormat,
  force,
  model,
  cursorCmd,
  branch,
  untilDone,
  sleepMs,
  maxMinutesMs,
}) {
  console.log("------------------------------");
  console.log(`Mode:   ${mode}`);
  console.log(`Prompt: ${promptFile}`);
  console.log(`Cursor: ${cursorCmd}`);
  console.log(`Format: ${outputFormat}`);
  console.log(`Force:  ${force ? "enabled" : "disabled"}`);
  if (branch) console.log(`Branch: ${branch}`);
  if (model) console.log(`Model:  ${model}`);
  if (max > 0) console.log(`Max:    ${max} iterations`);
  if (untilDone) console.log("Until:  done");
  if (sleepMs > 0) console.log(`Sleep:  ${Math.round(sleepMs / 1000)}s`);
  if (maxMinutesMs > 0) console.log(`Limit:  ${Math.round(maxMinutesMs / 60000)}m`);
  console.log("------------------------------");
}

async function runIteration(cmd, args, prompt) {
  return await new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "inherit", "inherit"] });
    child.on("error", () => resolve(1));
    child.stdin.write(prompt);
    child.stdin.end();
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function resolveUntilDone(mode, opts, isLoop) {
  if (opts.untilDone !== undefined) return opts.untilDone;
  if (mode === "build") return true;
  if (isLoop) return true;
  return false;
}

function resolveLogFilePath(logFile, mode, isLoop) {
  if (logFile !== undefined && logFile !== null) {
    return logFile ? resolveLogFile(logFile) : null;
  }
  if (mode === "build" || isLoop) {
    return defaultLogFile();
  }
  return null;
}

async function runWithConfig(config) {
  const {
    mode,
    max,
    promptFile,
    outputFormat,
    force,
    cursorCmd,
    apiKey,
    model,
    verbose,
    skipAuthCheck,
    planBranch,
    untilDone,
    sleepMs,
    maxMinutesMs,
    logFile,
    isLoop,
    ralphDir,
  } = config;

  if (!fs.existsSync(promptFile)) {
    die(`Prompt file not found: ${promptFile}. Run 'ralph init' first.`);
  }

  if (!OUTPUT_FORMATS.has(outputFormat)) {
    die(`Invalid --output-format: ${outputFormat}`);
  }

  let branch = null;
  if (mode === "plan") {
    branch = ensurePlanBranch(planBranch);
  } else if (mode === "build" && isGitRepo()) {
    branch = syncToPlanBranchIfNeeded() || getCurrentBranch();
  }

  const resolvedLogFile = resolveLogFilePath(logFile, mode, isLoop);
  const baseDir = ralphDir || resolveRalphDir();
  const progressPath = path.join(baseDir, "PROGRESS.md");

  if (mode === "build" && untilDone) {
    const status = readProgressStatus(progressPath);
    if (status.done) {
      console.log("Progress already marked done. Exiting.");
      appendLog(resolvedLogFile, "done", {
        mode,
        branch,
        iteration: 0,
        progressStatus: status.status,
      });
      writeState({
        lastMode: mode,
        lastIteration: 0,
        lastResult: "done",
        lastProgressStatus: status.status,
        branch,
        planBranch: branch || readPlanBranchRecord(),
      });
      return;
    }
  }

  checkCursorInstalled(cursorCmd);
  if (!skipAuthCheck) {
    checkCursorAuth(cursorCmd, apiKey);
  }

  printRunBanner({
    mode,
    promptFile: path.relative(process.cwd(), promptFile),
    max,
    outputFormat,
    force,
    model,
    cursorCmd,
    branch,
    untilDone,
    sleepMs,
    maxMinutesMs,
  });

  appendLog(resolvedLogFile, "start", {
    mode,
    branch,
    max,
    untilDone,
  });

  writeState({
    lastMode: mode,
    lastIteration: 0,
    lastResult: "started",
    branch,
    planBranch: branch || readPlanBranchRecord(),
    startedAt: new Date().toISOString(),
  });

  const startTime = Date.now();
  let iteration = 0;
  while (true) {
    if (max > 0 && iteration >= max) {
      appendLog(resolvedLogFile, "stop", { mode, branch, reason: "max", iteration });
      break;
    }
    if (maxMinutesMs > 0 && Date.now() - startTime >= maxMinutesMs) {
      appendLog(resolvedLogFile, "stop", { mode, branch, reason: "time", iteration });
      break;
    }

    const prompt = fs.readFileSync(promptFile, "utf8");
    const cursorArgs = [];
    if (apiKey) cursorArgs.push("--api-key", apiKey);
    cursorArgs.push("--print", "--output-format", outputFormat);
    if (model) cursorArgs.push("--model", model);
    if (force) cursorArgs.push("--force");
    if (verbose) cursorArgs.push("--verbose");

    appendLog(resolvedLogFile, "iteration-start", { mode, branch, iteration: iteration + 1 });
    const exitCode = await runIteration(cursorCmd, cursorArgs, prompt);
    if (exitCode !== 0) {
      appendLog(resolvedLogFile, "error", { mode, branch, iteration: iteration + 1, exitCode });
      writeState({
        lastMode: mode,
        lastIteration: iteration,
        lastResult: "error",
        branch,
        planBranch: branch || readPlanBranchRecord(),
      });
      process.exit(exitCode);
    }

    iteration += 1;
    const progressStatus = readProgressStatus(progressPath);
    let commitHash = null;
    if (mode === "build") {
      const suffix = progressStatus.done ? " (done)" : "";
      commitHash = commitIfNeeded(`ralph: iteration ${iteration}${suffix}`);
    }
    writeState({
      lastMode: mode,
      lastIteration: iteration,
      lastResult: progressStatus.done ? "done" : "ok",
      lastProgressStatus: progressStatus.status,
      lastCommit: commitHash || undefined,
      branch,
      planBranch: branch || readPlanBranchRecord(),
    });
    appendLog(resolvedLogFile, "iteration-end", {
      mode,
      branch,
      iteration,
      progressStatus: progressStatus.status,
      done: progressStatus.done,
      commit: commitHash,
    });

    console.log(`\n==== LOOP ${iteration} ====`);

    if (mode === "build" && untilDone && progressStatus.done) {
      console.log("Progress marked done. Stopping.");
      appendLog(resolvedLogFile, "done", {
        mode,
        branch,
        iteration,
        progressStatus: progressStatus.status,
      });
      break;
    }

    if (sleepMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
    }
  }
}

async function runCommand(args) {
  const opts = parseFlags(args);
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  let mode = opts.mode;
  const positional = [...opts.positional];
  if (!mode && positional.length > 0 && MODES.has(positional[0])) {
    mode = positional.shift();
  }
  if (!mode) mode = DEFAULT_MODE;
  if (!MODES.has(mode)) {
    die(`Invalid mode: ${mode}`);
  }

  let max = opts.max;
  if (max === undefined && positional.length > 0) {
    const maybeMax = Number(positional[0]);
    if (Number.isInteger(maybeMax) && maybeMax >= 0) {
      max = positional.shift();
    }
  }
  max = parseMax(max);

  if (positional.length > 0) {
    die(`Unknown arguments: ${positional.join(" ")}`);
  }

  const ralphDir = resolveRalphDir(opts.ralphDir);
  const promptFile = opts.promptFile
    ? path.resolve(process.cwd(), opts.promptFile)
    : path.join(ralphDir, `PROMPT_${mode}.md`);

  const outputFormat = opts.outputFormat || DEFAULT_OUTPUT_FORMAT;
  const force = opts.force !== undefined ? opts.force : true;
  const cursorCmd = opts.cursorCmd || process.env.RALPH_CURSOR_CMD || DEFAULT_CURSOR_CMD;
  const sleepMs = parseSleepMs(opts.sleep);
  const maxMinutesMs = parseMaxMinutesMs(opts.maxMinutes);
  const untilDone = resolveUntilDone(mode, opts, false);
  const logFile = opts.logFile;

  await runWithConfig({
    mode,
    max,
    promptFile,
    outputFormat,
    force,
    cursorCmd,
    apiKey: opts.apiKey,
    model: opts.model,
    verbose: opts.verbose,
    skipAuthCheck: opts.skipAuthCheck,
    planBranch: opts.planBranch,
    untilDone: mode === "plan" ? false : untilDone,
    sleepMs,
    maxMinutesMs,
    logFile,
    isLoop: false,
    ralphDir,
  });
}

async function loopCommand(args) {
  const opts = parseFlags(args);
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  if (opts.mode) {
    die("Loop mode runs plan then build; use 'ralph run' to select a single mode.");
  }
  if (opts.promptFile) {
    die("Loop mode uses PROMPT_plan.md and PROMPT_build.md. Use 'ralph run --prompt-file' for custom prompts.");
  }

  const ralphDir = resolveRalphDir(opts.ralphDir);

  let buildMax = opts.max;
  const positional = [...opts.positional];
  if (buildMax === undefined && positional.length > 0) {
    const maybeMax = Number(positional[0]);
    if (Number.isInteger(maybeMax) && maybeMax >= 0) {
      buildMax = positional.shift();
    }
  }
  buildMax = parseMax(buildMax);
  if (positional.length > 0) {
    die(`Unknown arguments: ${positional.join(" ")}`);
  }

  let planMax = parseMax(opts.planMax ?? 1);
  if (planMax === 0) planMax = 1;
  const outputFormat = opts.outputFormat || DEFAULT_OUTPUT_FORMAT;
  const force = opts.force !== undefined ? opts.force : true;
  const cursorCmd = opts.cursorCmd || process.env.RALPH_CURSOR_CMD || DEFAULT_CURSOR_CMD;
  const sleepMs = parseSleepMs(opts.sleep);
  const maxMinutesMs = parseMaxMinutesMs(opts.maxMinutes);
  const untilDone = resolveUntilDone("build", opts, true);
  const logFile = opts.logFile;

  const planPrompt = path.join(ralphDir, "PROMPT_plan.md");
  const buildPrompt = path.join(ralphDir, "PROMPT_build.md");
  const prdPath = path.join(ralphDir, "PRD.md");
  const prdStatus = readPrdStatus(prdPath);
  const planNeeded = !prdStatus.ready;

  if (planNeeded) {
    await runWithConfig({
      mode: "plan",
      max: planMax,
      promptFile: planPrompt,
      outputFormat,
      force,
      cursorCmd,
      apiKey: opts.apiKey,
      model: opts.model,
      verbose: opts.verbose,
      skipAuthCheck: opts.skipAuthCheck,
      planBranch: opts.planBranch,
      untilDone: false,
      sleepMs: 0,
      maxMinutesMs: 0,
      logFile,
      isLoop: true,
      ralphDir,
    });
  } else {
    console.log("PRD is ready. Skipping plan.");
    if (isGitRepo() && !readPlanBranchRecord()) {
      console.log("No recorded plan branch. Staying on current branch.");
    }
  }

  await runWithConfig({
    mode: "build",
    max: buildMax,
    promptFile: buildPrompt,
    outputFormat,
    force,
    cursorCmd,
    apiKey: opts.apiKey,
    model: opts.model,
    verbose: opts.verbose,
    skipAuthCheck: opts.skipAuthCheck,
    planBranch: opts.planBranch,
    untilDone,
    sleepMs,
    maxMinutesMs,
    logFile,
    isLoop: true,
    ralphDir,
  });
}

function statusCommand(args) {
  const opts = parseFlags(args);
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const ralphDir = resolveRalphDir(opts.ralphDir);
  const inGit = isGitRepo();
  const currentBranch = inGit ? getCurrentBranch() : "n/a";
  const planBranch = inGit ? readPlanBranchRecord() : null;
  const prdPath = path.join(ralphDir, "PRD.md");
  const progressPath = path.join(ralphDir, "PROGRESS.md");
  const prdStatus = readPrdStatus(prdPath);
  const progress = readProgressStatus(progressPath);
  const state = readState();

  console.log("Ralph status");
  console.log(`  Ralph dir:   ${ralphDir}`);
  console.log(`  Git repo:     ${inGit ? "yes" : "no"}`);
  console.log(`  Branch:       ${currentBranch}`);
  console.log(`  Plan branch:  ${planBranch || "none"}`);
  console.log(`  PRD.md:       ${fs.existsSync(prdPath) ? "present" : "missing"}`);
  console.log(`  PRD status:   ${prdStatus.status || "unknown"}${prdStatus.ready ? " (ready)" : ""}`);
  console.log(`  PROGRESS.md:  ${fs.existsSync(progressPath) ? "present" : "missing"}`);
  const progressSuffix = progress.done ? " (done)" : "";
  console.log(`  Progress:     ${progress.status || "unknown"}${progressSuffix}`);
  if (progress.exists) {
    console.log(`  Done marker:  ${progress.doneMarker ? "yes" : "no"}`);
    console.log(`  Unchecked:    ${progress.uncheckedCount ?? 0}`);
  }
  if (state) {
    console.log(`  Last mode:    ${state.lastMode || "n/a"}`);
    console.log(`  Iterations:   ${state.lastIteration ?? "n/a"}`);
    console.log(`  Last result:  ${state.lastResult || "n/a"}`);
    console.log(`  Updated:      ${state.updatedAt || "n/a"}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    printHelp();
    process.exit(0);
  }

  if (argv.includes("-h") || argv.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  if (argv.includes("-v") || argv.includes("--version")) {
    console.log(VERSION);
    process.exit(0);
  }

  const command = argv[0];
  const rest = argv.slice(1);

  if (command === "init") {
    initCommand(rest);
    return;
  }

  if (command === "run") {
    await runCommand(rest);
    return;
  }

  if (command === "loop") {
    await loopCommand(rest);
    return;
  }

  if (command === "status") {
    statusCommand(rest);
    return;
  }

  // Default to run for positional compatibility (e.g. `ralph plan 5`).
  await runCommand(argv);
}

await main();
