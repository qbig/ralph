import React, { useEffect, useRef, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import readline from "node:readline";
import { spawn } from "node:child_process";

const DEFAULT_MAX_LINES = 200;

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

function TuiApp({ child, prompt, title, outputFormat, maxLines }) {
  const { exit } = useApp();
  const [lines, setLines] = useState([]);
  const [current, setCurrent] = useState("");
  const bufferRef = useRef("");

  const pushLines = (nextLines) => {
    if (!nextLines.length) return;
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
      <Text color="cyan">{title}</Text>
      <Text color="gray">Ctrl+C to stop</Text>
      <Box flexDirection="column" marginTop={1}>
        {lines.map((line, index) => (
          <Text key={`${index}-${line}`}>{line}</Text>
        ))}
        {current ? <Text>{current}</Text> : null}
      </Box>
    </Box>
  );
}

export function runTui({ cmd, args, prompt, title, outputFormat, maxLines }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    const app = render(
      <TuiApp
        child={child}
        prompt={prompt}
        title={title}
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
