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
  ralph [plan|build] [max] [options]

Run options:
  --mode <build|plan>        Select prompt mode (default: build)
  --max <n>                  Max iterations (0 = unlimited)
  --prompt-file <path>       Override prompt file path
  --model <name>             Cursor model name
  --output-format <format>   text | json | stream-json (default: stream-json)
  --[no-]force               Allow file changes in print mode (default: --force)
  --api-key <key>            Cursor API key (optional; else CURSOR_API_KEY)
  --cursor-cmd <cmd>         Cursor CLI command (default: cursor-agent)
  --skip-auth-check          Skip cursor-agent status check
  --verbose                  Pass --verbose to cursor-agent

Init options:
  --dir <path>               Target directory (default: cwd)
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
      "--prompt-file",
      "--model",
      "--output-format",
      "--api-key",
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
        case "--model":
          opts.model = value;
          break;
        case "--output-format":
          opts.outputFormat = value;
          break;
        case "--api-key":
          opts.apiKey = value;
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

function initCommand(args) {
  const opts = parseFlags(args);
  if (opts.help) {
    printHelp();
    process.exit(0);
  }
  const targetDir = opts.dir
    ? path.resolve(process.cwd(), opts.dir)
    : process.cwd();
  const force = Boolean(opts.force);

  const templatesDir = resolveTemplatesDir();
  const templates = [
    "AGENTS.md",
    "IMPLEMENTATION_PLAN.md",
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

function printRunBanner({ mode, promptFile, max, outputFormat, force, model, cursorCmd }) {
  console.log("------------------------------");
  console.log(`Mode:   ${mode}`);
  console.log(`Prompt: ${promptFile}`);
  console.log(`Cursor: ${cursorCmd}`);
  console.log(`Format: ${outputFormat}`);
  console.log(`Force:  ${force ? "enabled" : "disabled"}`);
  if (model) console.log(`Model:  ${model}`);
  if (max > 0) console.log(`Max:    ${max} iterations`);
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

  const promptFile = opts.promptFile
    ? path.resolve(process.cwd(), opts.promptFile)
    : path.resolve(process.cwd(), `PROMPT_${mode}.md`);

  if (!fs.existsSync(promptFile)) {
    die(`Prompt file not found: ${promptFile}. Run 'ralph init' first.`);
  }

  const outputFormat = opts.outputFormat || DEFAULT_OUTPUT_FORMAT;
  if (!OUTPUT_FORMATS.has(outputFormat)) {
    die(`Invalid --output-format: ${outputFormat}`);
  }

  const force = opts.force !== undefined ? opts.force : true;
  const cursorCmd = opts.cursorCmd || process.env.RALPH_CURSOR_CMD || DEFAULT_CURSOR_CMD;

  checkCursorInstalled(cursorCmd);
  if (!opts.skipAuthCheck) {
    checkCursorAuth(cursorCmd, opts.apiKey);
  }

  printRunBanner({
    mode,
    promptFile: path.relative(process.cwd(), promptFile),
    max,
    outputFormat,
    force,
    model: opts.model,
    cursorCmd,
  });

  let iteration = 0;
  while (true) {
    if (max > 0 && iteration >= max) {
      console.log(`Reached max iterations: ${max}`);
      break;
    }

    const prompt = fs.readFileSync(promptFile, "utf8");
    const cursorArgs = [];
    if (opts.apiKey) cursorArgs.push("--api-key", opts.apiKey);
    cursorArgs.push("--print", "--output-format", outputFormat);
    if (opts.model) cursorArgs.push("--model", opts.model);
    if (force) cursorArgs.push("--force");
    if (opts.verbose) cursorArgs.push("--verbose");

    const exitCode = await runIteration(cursorCmd, cursorArgs, prompt);
    if (exitCode !== 0) {
      process.exit(exitCode);
    }

    iteration += 1;
    console.log(`\n==== LOOP ${iteration} ====`);
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

  // Default to run for positional compatibility (e.g. `ralph plan 5`).
  await runCommand(argv);
}

await main();
