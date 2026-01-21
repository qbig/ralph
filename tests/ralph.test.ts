import { test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const repoRoot = path.resolve(import.meta.dir, "..");
const ralphBin = path.join(repoRoot, "bin", "ralph.js");

function runCli(args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}) {
  const result = Bun.spawnSync({
    cmd: ["bun", ralphBin, ...args],
    cwd: opts.cwd ?? repoRoot,
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  return result;
}

function makeTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runGit(args: string[], cwd: string) {
  return Bun.spawnSync({
    cmd: ["git", ...args],
    cwd,
  });
}

function makeCursorStub(dir: string) {
  const stubPath = path.join(dir, "cursor-stub.js");
  const content = `#!/usr/bin/env bun
import fs from "node:fs";
const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log("cursor-stub 0.0.0");
  process.exit(0);
}
if (process.env.TEST_LOG) {
  fs.appendFileSync(process.env.TEST_LOG, args.join(" ") + "\\n");
}
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  if (process.env.ECHO_STDIN === "1") {
    process.stdout.write(input);
  }
  process.exit(0);
});
`;
  fs.writeFileSync(stubPath, content, "utf8");
  fs.chmodSync(stubPath, 0o755);
  return stubPath;
}

test("--help and --version", () => {
  const help = runCli(["--help"]);
  expect(help.exitCode).toBe(0);
  expect(help.stdout.toString()).toContain("Usage:");
  expect(help.stdout.toString()).toContain("ralph init");

  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const version = runCli(["--version"]);
  expect(version.exitCode).toBe(0);
  expect(version.stdout.toString().trim()).toBe(pkg.version);
});

test("init copies template files", () => {
  const tmp = makeTempDir("ralph-init-");
  const result = runCli(["init", "--dir", tmp]);
  expect(result.exitCode).toBe(0);

  const expected = [
    "AGENTS.md",
    "PRD.md",
    "PROGRESS.md",
    "PROMPT_build.md",
    "PROMPT_plan.md",
  ];
  for (const name of expected) {
    expect(fs.existsSync(path.join(tmp, name))).toBe(true);
  }
});

test("plan mode creates a new branch and records it", () => {
  const tmp = makeTempDir("ralph-plan-");
  expect(runGit(["init", "-b", "main"], tmp).exitCode).toBe(0);
  expect(runGit(["config", "user.email", "test@example.com"], tmp).exitCode).toBe(0);
  expect(runGit(["config", "user.name", "Test User"], tmp).exitCode).toBe(0);
  const ralphDir = path.join(tmp, "ralph");
  fs.mkdirSync(ralphDir, { recursive: true });
  fs.writeFileSync(path.join(tmp, "README.md"), "init\n", "utf8");
  fs.writeFileSync(path.join(ralphDir, "PROMPT_plan.md"), "Plan prompt\n", "utf8");
  expect(runGit(["add", "."], tmp).exitCode).toBe(0);
  expect(runGit(["commit", "-m", "init"], tmp).exitCode).toBe(0);
  const logPath = path.join(tmp, "cursor-log.txt");
  const stubDir = makeTempDir("ralph-stub-");
  const stub = makeCursorStub(stubDir);

  const result = runCli(
    [
      "run",
      "--mode",
      "plan",
      "--max",
      "1",
      "--plan-branch",
      "ralph/plan-test",
      "--cursor-cmd",
      stub,
      "--skip-auth-check",
    ],
    {
      cwd: tmp,
      env: { TEST_LOG: logPath },
    }
  );

  expect(result.exitCode).toBe(0);
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], tmp).stdout.toString().trim();
  expect(branch).toBe("ralph/plan-test");

  const gitDir = runGit(["rev-parse", "--git-dir"], tmp).stdout.toString().trim();
  const recordPath = path.resolve(tmp, gitDir, "ralph-plan-branch");
  expect(fs.existsSync(recordPath)).toBe(true);
  const record = fs.readFileSync(recordPath, "utf8").trim();
  expect(record).toBe("ralph/plan-test");
});

test("run uses cursor stub and respects --no-force", () => {
  const tmp = makeTempDir("ralph-run-");
  const ralphDir = path.join(tmp, "ralph");
  fs.mkdirSync(ralphDir, { recursive: true });
  const prompt = path.join(ralphDir, "PROMPT_build.md");
  fs.writeFileSync(prompt, "Hello from test\n", "utf8");

  const logPath = path.join(tmp, "cursor-log.txt");
  const stub = makeCursorStub(tmp);

  const result = runCli([
    "run",
    "--mode",
    "build",
    "--max",
    "1",
    "--no-force",
    "--output-format",
    "json",
    "--cursor-cmd",
    stub,
    "--skip-auth-check",
  ], {
    cwd: tmp,
    env: { TEST_LOG: logPath },
  });

  expect(result.exitCode).toBe(0);
  const log = fs.readFileSync(logPath, "utf8");
  expect(log).toContain("--print");
  expect(log).toContain("--output-format json");
  expect(log).not.toContain("--force");
});

test("run defaults to --force", () => {
  const tmp = makeTempDir("ralph-run-force-");
  const ralphDir = path.join(tmp, "ralph");
  fs.mkdirSync(ralphDir, { recursive: true });
  const prompt = path.join(ralphDir, "PROMPT_build.md");
  fs.writeFileSync(prompt, "Hello from test\n", "utf8");

  const logPath = path.join(tmp, "cursor-log.txt");
  const stub = makeCursorStub(tmp);

  const result = runCli([
    "run",
    "--mode",
    "build",
    "--max",
    "1",
    "--cursor-cmd",
    stub,
    "--skip-auth-check",
  ], {
    cwd: tmp,
    env: { TEST_LOG: logPath },
  });

  expect(result.exitCode).toBe(0);
  const log = fs.readFileSync(logPath, "utf8");
  expect(log).toContain("--force");
});

test("build stops immediately when PROGRESS is done", () => {
  const tmp = makeTempDir("ralph-done-");
  const ralphDir = path.join(tmp, "ralph");
  fs.mkdirSync(ralphDir, { recursive: true });
  fs.writeFileSync(path.join(ralphDir, "PROMPT_build.md"), "Build prompt\n", "utf8");
  fs.writeFileSync(
    path.join(ralphDir, "PROGRESS.md"),
    "Status: in-progress\n- [x] Item A\nDONE\n",
    "utf8"
  );

  const logPath = path.join(tmp, "cursor-log.txt");
  const stub = makeCursorStub(tmp);

  const result = runCli(
    [
      "run",
      "--mode",
      "build",
      "--until-done",
      "--cursor-cmd",
      stub,
      "--skip-auth-check",
    ],
    {
      cwd: tmp,
      env: { TEST_LOG: logPath },
    }
  );

  expect(result.exitCode).toBe(0);
  expect(fs.existsSync(logPath)).toBe(false);
});

test("loop skips plan when PRD is ready", () => {
  const tmp = makeTempDir("ralph-loop-ready-");
  expect(runGit(["init", "-b", "main"], tmp).exitCode).toBe(0);
  expect(runGit(["config", "user.email", "test@example.com"], tmp).exitCode).toBe(0);
  expect(runGit(["config", "user.name", "Test User"], tmp).exitCode).toBe(0);
  const ralphDir = path.join(tmp, "ralph");
  fs.mkdirSync(ralphDir, { recursive: true });
  fs.writeFileSync(path.join(ralphDir, "PRD.md"), "Status: ready\n", "utf8");
  fs.writeFileSync(path.join(ralphDir, "PROGRESS.md"), "Status: in-progress\n- [x] Item A\nDONE\n", "utf8");
  fs.writeFileSync(path.join(ralphDir, "PROMPT_plan.md"), "Plan prompt\n", "utf8");
  fs.writeFileSync(path.join(ralphDir, "PROMPT_build.md"), "Build prompt\n", "utf8");
  fs.writeFileSync(path.join(tmp, "README.md"), "init\n", "utf8");
  expect(runGit(["add", "."], tmp).exitCode).toBe(0);
  expect(runGit(["commit", "-m", "init"], tmp).exitCode).toBe(0);

  const stubDir = makeTempDir("ralph-stub-");
  const stub = makeCursorStub(stubDir);

  const result = runCli(
    [
      "loop",
      "--max",
      "1",
      "--cursor-cmd",
      stub,
      "--skip-auth-check",
    ],
    {
      cwd: tmp,
    }
  );

  expect(result.exitCode).toBe(0);
  const gitDir = runGit(["rev-parse", "--git-dir"], tmp).stdout.toString().trim();
  const recordPath = path.resolve(tmp, gitDir, "ralph-plan-branch");
  expect(fs.existsSync(recordPath)).toBe(false);
});
