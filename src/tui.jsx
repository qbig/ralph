import React, { useEffect, useRef, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import readline from "node:readline";
import { spawn } from "node:child_process";

const DEFAULT_MAX_LINES = 200;

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function Badge({ label, color, backgroundColor }) {
  return (
    <Text color={color} backgroundColor={backgroundColor}>
      {` ${label} `}
    </Text>
  );
}

function Header({ header, stats, elapsed }) {
  const modeLabel = header?.mode ? header.mode.toUpperCase() : "RUN";
  const iterationLabel =
    header?.iteration !== undefined ? `iter ${header.iteration}` : "iter ?";
  const branchLabel = header?.branch ? header.branch : null;
  const formatLabel = header?.outputFormat ? header.outputFormat : "output ?";
  const modelLabel = header?.model ? `model ${header.model}` : null;
  const runLabel = header?.interactive ? "interactive" : "print";

  const modeColor = header?.mode === "plan" ? "black" : "black";
  const modeBg = header?.mode === "plan" ? "yellow" : "green";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text color="cyan" bold>
          ralph
        </Text>
        <Badge label={modeLabel} color={modeColor} backgroundColor={modeBg} />
        <Badge label={iterationLabel} color="black" backgroundColor="blue" />
        <Badge label={runLabel} color="black" backgroundColor="white" />
        {branchLabel ? (
          <Badge label={branchLabel} color="black" backgroundColor="magenta" />
        ) : null}
        <Badge label={formatLabel} color="black" backgroundColor="gray" />
        {modelLabel ? (
          <Badge label={modelLabel} color="black" backgroundColor="cyan" />
        ) : null}
      </Box>
      <Text color="gray">
        tools: {stats.started} started / {stats.completed} done | errors:{" "}
        {stats.errors} | lines: {stats.lines} | elapsed: {formatElapsed(elapsed)}
      </Text>
      <Text color="gray">last tool: {stats.lastTool || "-"}</Text>
      <Text color="gray">------------------------------------------------------------</Text>
    </Box>
  );
}

function extractText(event) {
  if (!event) return "";
  if (typeof event.text === "string") return event.text;
  const message = event.message;
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (!part) return "";
        if (typeof part === "string") return part;
        if (part.type === "text" && typeof part.text === "string") return part.text;
        return "";
      })
      .join("");
  }
  return "";
}

function extractToolName(toolCall) {
  if (!toolCall || typeof toolCall !== "object") return "tool";
  const keys = Object.keys(toolCall);
  if (keys.length === 0) return "tool";
  const raw = keys[0];
  return raw.replace(/ToolCall$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function TuiApp({ child, prompt, header, outputFormat, maxLines }) {
  const { exit } = useApp();
  const [lines, setLines] = useState([]);
  const [current, setCurrent] = useState("");
  const bufferRef = useRef("");
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [stats, setStats] = useState({
    started: 0,
    completed: 0,
    errors: 0,
    lines: 0,
    lastTool: "",
  });

  const pushLines = (nextLines) => {
    if (!nextLines.length) return;
    setStats((prev) => ({
      ...prev,
      lines: prev.lines + nextLines.length,
    }));
    setLines((prev) => {
      const merged = [...prev, ...nextLines];
      if (merged.length <= maxLines) return merged;
      return merged.slice(merged.length - maxLines);
    });
  };

  const pushLine = (line) => pushLines([line]);

  const appendText = (text) => {
    if (!text) return;
    bufferRef.current += text;
    const parts = bufferRef.current.split(/\r?\n/);
    const remainder = parts.pop() ?? "";
    if (parts.length > 0) {
      pushLines(parts);
    }
    bufferRef.current = remainder;
    setCurrent(remainder);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 1000);

    const rl = readline.createInterface({ input: child.stdout });

    const handleStreamLine = (line) => {
      if (!line.trim()) return;
      if (outputFormat !== "stream-json") {
        pushLine(line);
        return;
      }
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        pushLine(line);
        return;
      }
      if (event.type === "assistant") {
        appendText(extractText(event));
        return;
      }
      if (event.type === "tool_call") {
        const name = extractToolName(event.tool_call);
        const status = event.subtype || "event";
        setStats((prev) => ({
          ...prev,
          started: prev.started + (status === "started" ? 1 : 0),
          completed: prev.completed + (status === "completed" ? 1 : 0),
          lastTool: `${status} ${name}`.trim(),
        }));
        pushLine(`[${status}] ${name}`);
        return;
      }
      if (event.type === "system" && event.subtype === "init") {
        const model = event.model ? `model: ${event.model}` : "system init";
        pushLine(`[system] ${model}`);
        return;
      }
      if (event.type === "result" && event.subtype === "success") {
        pushLine("[result] success");
        return;
      }
      if (event.type === "error" || event.is_error) {
        const message = event.message || "error";
        setStats((prev) => ({
          ...prev,
          errors: prev.errors + 1,
        }));
        pushLine(`[error] ${message}`);
        return;
      }
    };

    rl.on("line", handleStreamLine);
    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        const text = chunk.toString("utf8").trim();
        if (text) pushLine(`[stderr] ${text}`);
      });
    }

    if (prompt && child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }

    return () => {
      clearInterval(interval);
      rl.close();
    };
  }, [child, outputFormat, prompt]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      child.kill("SIGINT");
      exit();
    }
  });

  return (
    <Box flexDirection="column">
      <Header header={header} stats={stats} elapsed={elapsed} />
      <Box flexDirection="column" marginTop={1}>
        {lines.map((line, index) => (
          <Text key={`${index}-${line}`}>{line}</Text>
        ))}
        {current ? <Text>{current}</Text> : null}
      </Box>
      <Text color="gray">Ctrl+C to stop</Text>
    </Box>
  );
}

export function runTui({ cmd, args, prompt, header, outputFormat, maxLines }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    const app = render(
      <TuiApp
        child={child}
        prompt={prompt}
        header={header}
        outputFormat={outputFormat}
        maxLines={maxLines ?? DEFAULT_MAX_LINES}
      />,
      { exitOnCtrlC: false }
    );
    child.on("error", () => {
      app.unmount();
      resolve(1);
    });
    child.on("close", (code) => {
      app.unmount();
      resolve(code ?? 1);
    });
  });
}
