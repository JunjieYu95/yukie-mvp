/**
 * MCP (Model Context Protocol) Endpoint for Early Wakeup Habit Tracker
 *
 * This endpoint implements the MCP JSON-RPC protocol over HTTP.
 * It provides tools for habit tracking via MCP.
 */

import { getDb, isoNow } from "../_lib/db.js";
import { sendJson, sendError, parseJsonBody, onlyMethods } from "../_lib/http.js";
import { DateKey } from "../_lib/validation.js";

// ============================================================================
// MCP Tool Definitions
// ============================================================================

const MCP_TOOLS = [
  {
    name: "habit.checkin",
    description: "Record a daily habit check-in. Mark whether the habit was completed for a specific date.",
    inputSchema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Date for the check-in in YYYY-MM-DD format. Defaults to today."
        },
        checked: {
          type: "boolean",
          description: "Whether the habit was completed. Defaults to true.",
          default: true
        },
        note: {
          type: "string",
          description: "Optional note or comment for this check-in."
        },
        wakeTime: {
          type: "string",
          description: "For early wake-up habit, the time woken up (HH:MM format)."
        }
      }
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false
    }
  },
  {
    name: "habit.query",
    description: "Query habit records for a specific date range. Returns check-in history.",
    inputSchema: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "Start date in YYYY-MM-DD format. Defaults to 7 days ago."
        },
        to: {
          type: "string",
          description: "End date in YYYY-MM-DD format. Defaults to today."
        },
        date: {
          type: "string",
          description: "Query a specific date (alternative to from/to range)."
        }
      }
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false
    }
  },
  {
    name: "habit.stats",
    description: "Get habit statistics including current streak, longest streak, and monthly summary.",
    inputSchema: {
      type: "object",
      properties: {
        month: {
          type: "string",
          description: "Month to get stats for in YYYY-MM format. Defaults to current month."
        },
        includeStreak: {
          type: "boolean",
          description: "Include current streak information. Defaults to true.",
          default: true
        }
      }
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false
    }
  },
  {
    name: "habit.delete",
    description: "Delete a habit check-in record for a specific date.",
    inputSchema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Date of the record to delete in YYYY-MM-DD format."
        }
      },
      required: ["date"]
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true
    }
  }
];

// Tool scope requirements
const TOOL_SCOPES = {
  "habit.checkin": ["habit:write"],
  "habit.query": ["habit:read"],
  "habit.stats": ["habit:read"],
  "habit.delete": ["habit:delete"]
};

// ============================================================================
// MCP Server Info
// ============================================================================

const SERVER_INFO = {
  name: "habit-tracker",
  version: "1.0.0"
};

const SERVER_CAPABILITIES = {
  tools: { listChanged: false },
  resources: { listChanged: false, subscribe: false },
  prompts: { listChanged: false }
};

// ============================================================================
// Utility Functions
// ============================================================================

function getNowWithOffset(utcOffsetMinutes) {
  if (Number.isFinite(utcOffsetMinutes)) {
    return new Date(Date.now() + utcOffsetMinutes * 60 * 1000);
  }
  return new Date();
}

function getTodayDate(utcOffsetMinutes) {
  return getNowWithOffset(utcOffsetMinutes).toISOString().split("T")[0];
}

function getDateDaysAgo(days, utcOffsetMinutes) {
  const date = getNowWithOffset(utcOffsetMinutes);
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
}

function getCurrentMonth(utcOffsetMinutes) {
  return getNowWithOffset(utcOffsetMinutes).toISOString().slice(0, 7);
}

function parseScopes(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.flatMap((v) => String(v).split(","));
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function requireScope(scopes, required) {
  if (scopes.includes("admin")) return true;
  return required.every((scope) => scopes.includes(scope));
}

function validateDate(value) {
  const parsed = DateKey.safeParse(value);
  if (!parsed.success) {
    throw { code: -32602, message: "date must be YYYY-MM-DD" };
  }
  return parsed.data;
}

// ============================================================================
// Database Helpers
// ============================================================================

async function fetchRecords(db, from, to) {
  const rs = await db.execute({
    sql: `SELECT date, checked, image_url as imageUrl, image_public_id as imagePublicId, note, utc_offset_minutes as utcOffsetMinutes, created_at as createdAt, updated_at as updatedAt
          FROM wakeup_records
          WHERE date >= ? AND date <= ?
          ORDER BY date ASC`,
    args: [from, to]
  });
  return rs.rows || [];
}

async function fetchRecord(db, date) {
  const rs = await db.execute({
    sql: `SELECT date, checked, image_url as imageUrl, image_public_id as imagePublicId, note, utc_offset_minutes as utcOffsetMinutes, created_at as createdAt, updated_at as updatedAt
          FROM wakeup_records WHERE date = ? LIMIT 1`,
    args: [date]
  });
  return rs.rows?.[0] || null;
}

async function createOrUpdateRecord(db, date, checked, note, utcOffsetMinutes) {
  await db.execute({
    sql: `INSERT INTO wakeup_records (date, checked, image_url, image_public_id, note, utc_offset_minutes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(date) DO UPDATE SET
            checked=excluded.checked,
            image_url=excluded.image_url,
            image_public_id=excluded.image_public_id,
            note=excluded.note,
            utc_offset_minutes=excluded.utc_offset_minutes,
            updated_at=excluded.updated_at`,
    args: [
      date,
      checked ? 1 : 0,
      null,
      null,
      note ?? null,
      utcOffsetMinutes ?? null,
      isoNow(),
      isoNow()
    ]
  });
}

async function deleteRecord(db, date) {
  await db.execute({ sql: `DELETE FROM wakeup_records WHERE date = ?`, args: [date] });
}

// ============================================================================
// Tool Handlers
// ============================================================================

async function handleCheckin(db, args, userId, utcOffsetMinutes) {
  const date = args.date ? validateDate(args.date) : getTodayDate(utcOffsetMinutes);
  const checked = args.checked !== false;
  const note = args.note;
  const wakeTime = args.wakeTime;

  const fullNote = wakeTime
    ? (note ? `${note} (Woke up at ${wakeTime})` : `Woke up at ${wakeTime}`)
    : note;

  await createOrUpdateRecord(db, date, checked, fullNote, utcOffsetMinutes);

  return {
    content: [
      {
        type: "text",
        text: checked
          ? `Check-in recorded for ${date}. Great job!`
          : `Marked as not completed for ${date}.`
      }
    ],
    structuredContent: {
      success: true,
      message: checked
        ? `Check-in recorded for ${date}. Great job!`
        : `Marked as not completed for ${date}.`,
      record: {
        date,
        checked,
        note: fullNote || undefined,
        wakeTime,
        utcOffsetMinutes: utcOffsetMinutes ?? undefined
      },
      userId
    }
  };
}

async function handleQuery(db, args, utcOffsetMinutes) {
  if (args.date) {
    const date = validateDate(args.date);
    const record = await fetchRecord(db, date);
    return {
      content: [
        {
          type: "text",
          text: record
            ? `Record found for ${date}: ${record.checked === 1 ? "Completed" : "Not completed"}${record.note ? `. Note: ${record.note}` : ""}`
            : `No record found for ${date}.`
        }
      ],
      structuredContent: {
        success: true,
        date,
        found: !!record,
        record: record
          ? {
              date: record.date,
              checked: record.checked === 1,
              note: record.note || undefined,
              utcOffsetMinutes: record.utcOffsetMinutes ?? undefined
            }
          : null
      }
    };
  }

  const from = args.from ? validateDate(args.from) : getDateDaysAgo(7, utcOffsetMinutes);
  const to = args.to ? validateDate(args.to) : getTodayDate(utcOffsetMinutes);

  const externalRecords = await fetchRecords(db, from, to);
  const records = externalRecords.map((r) => ({
    date: r.date,
    checked: r.checked === 1,
    note: r.note || undefined,
    utcOffsetMinutes: r.utcOffsetMinutes ?? undefined
  }));

  const completed = records.filter(r => r.checked).length;

  return {
    content: [
      {
        type: "text",
        text: `Found ${records.length} records from ${from} to ${to}. ${completed} days completed.`
      }
    ],
    structuredContent: {
      success: true,
      from,
      to,
      count: records.length,
      completed,
      records
    }
  };
}

async function handleStats(db, args, utcOffsetMinutes) {
  const month = args.month || getCurrentMonth(utcOffsetMinutes);
  const includeStreak = args.includeStreak !== false;

  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;
  const fromDate = includeStreak ? getDateDaysAgo(60, utcOffsetMinutes) : monthStart;
  const toDate = includeStreak ? getTodayDate(utcOffsetMinutes) : monthEnd;

  const externalRecords = await fetchRecords(db, fromDate, toDate);
  const allRecords = externalRecords
    .map((r) => ({
      date: r.date,
      checked: r.checked === 1
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const monthRecords = allRecords.filter((r) => r.date.startsWith(month));
  const completedDays = monthRecords.filter((r) => r.checked).length;
  const totalDays = monthRecords.length;

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  if (includeStreak) {
    const sortedRecords = [...allRecords].sort((a, b) => b.date.localeCompare(a.date));
    let expectedDate = getTodayDate(utcOffsetMinutes);

    for (const record of sortedRecords) {
      if (record.date === expectedDate && record.checked) {
        currentStreak++;
        const prevDate = new Date(expectedDate);
        prevDate.setDate(prevDate.getDate() - 1);
        expectedDate = prevDate.toISOString().split("T")[0];
      } else if (record.date < expectedDate) {
        break;
      }
    }

    for (const record of allRecords) {
      if (record.checked) {
        tempStreak++;
        if (tempStreak > longestStreak) longestStreak = tempStreak;
      } else {
        tempStreak = 0;
      }
    }
  }

  const completionRate = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;

  const summary = currentStreak > 0
    ? `You're on a ${currentStreak}-day streak! This month: ${completedDays}/${totalDays} days (${completionRate}%).`
    : `This month: ${completedDays}/${totalDays} days (${completionRate}%). Start your streak today!`;

  return {
    content: [
      {
        type: "text",
        text: summary
      }
    ],
    structuredContent: {
      success: true,
      month,
      stats: {
        completedDays,
        totalDays,
        completionRate: `${completionRate}%`,
        ...(includeStreak ? { currentStreak, longestStreak } : {})
      },
      summary
    }
  };
}

async function handleDelete(db, args) {
  const date = args.date ? validateDate(args.date) : null;
  if (!date) {
    return {
      content: [{ type: "text", text: "Error: date parameter is required" }],
      isError: true,
      structuredContent: {
        success: false,
        error: { code: "MISSING_PARAM", message: "date parameter is required" }
      }
    };
  }

  const record = await fetchRecord(db, date);
  if (!record) {
    return {
      content: [{ type: "text", text: `No record found for ${date}` }],
      isError: true,
      structuredContent: {
        success: false,
        error: { code: "NOT_FOUND", message: `No record found for ${date}` }
      }
    };
  }

  await deleteRecord(db, date);
  return {
    content: [{ type: "text", text: `Record for ${date} has been deleted.` }],
    structuredContent: {
      success: true,
      message: `Record for ${date} has been deleted.`,
      date
    }
  };
}

// ============================================================================
// MCP JSON-RPC Handler
// ============================================================================

function jsonRpcError(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, data }
  };
}

function jsonRpcResult(id, result) {
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

async function handleMCPRequest(body, headers) {
  const { jsonrpc, id, method, params } = body;

  // Validate JSON-RPC structure
  if (jsonrpc !== "2.0" || !method) {
    return jsonRpcError(id || null, -32600, "Invalid Request");
  }

  // Extract context from headers
  const userId = headers["x-yukie-user-id"];
  const scopes = parseScopes(headers["x-yukie-scopes"]);
  const headerOffset = headers["x-yukie-utc-offset-minutes"];
  const utcOffsetMinutes = headerOffset !== undefined ? Number(headerOffset) : undefined;

  switch (method) {
    case "initialize":
      return jsonRpcResult(id, {
        protocolVersion: "2024-11-05",
        capabilities: SERVER_CAPABILITIES,
        serverInfo: SERVER_INFO,
        instructions: "Track daily habits like waking up early. Supports check-ins, streaks, and statistics."
      });

    case "initialized":
      return jsonRpcResult(id, {});

    case "ping":
      return jsonRpcResult(id, { pong: true });

    case "tools/list":
      return jsonRpcResult(id, { tools: MCP_TOOLS });

    case "tools/call": {
      const { name, arguments: args } = params || {};

      if (!name) {
        return jsonRpcError(id, -32602, "Missing tool name");
      }

      // Find the tool
      const tool = MCP_TOOLS.find(t => t.name === name);
      if (!tool) {
        return jsonRpcError(id, -32003, `Tool not found: ${name}`);
      }

      // Check required scopes
      const requiredScopes = TOOL_SCOPES[name] || [];
      if (requiredScopes.length > 0 && !requireScope(scopes, requiredScopes)) {
        return jsonRpcError(id, -32602, "Insufficient permissions", {
          required: requiredScopes,
          provided: scopes
        });
      }

      // Check for userId on write operations
      if (name === "habit.checkin" && !userId) {
        return jsonRpcError(id, -32602, "Missing X-Yukie-User-Id header");
      }

      try {
        const db = getDb();
        let result;

        switch (name) {
          case "habit.checkin":
            result = await handleCheckin(db, args || {}, userId, utcOffsetMinutes);
            break;
          case "habit.query":
            result = await handleQuery(db, args || {}, utcOffsetMinutes);
            break;
          case "habit.stats":
            result = await handleStats(db, args || {}, utcOffsetMinutes);
            break;
          case "habit.delete":
            result = await handleDelete(db, args || {});
            break;
          default:
            return jsonRpcError(id, -32003, `Tool not implemented: ${name}`);
        }

        return jsonRpcResult(id, result);
      } catch (err) {
        if (err.code && err.message) {
          return jsonRpcError(id, err.code, err.message);
        }
        return jsonRpcError(id, -32603, err.message || "Internal error");
      }
    }

    case "resources/list":
      return jsonRpcResult(id, { resources: [] });

    case "prompts/list":
      return jsonRpcResult(id, { prompts: [] });

    default:
      return jsonRpcError(id, -32601, `Unknown method: ${method}`);
  }
}

// ============================================================================
// HTTP Handler
// ============================================================================

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Yukie-User-Id, X-Yukie-Scopes, X-Yukie-Request-Id, X-Yukie-UTC-Offset-Minutes");

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Handle GET request for server info
  if (req.method === "GET") {
    sendJson(res, 200, {
      ...SERVER_INFO,
      protocol: "mcp",
      protocolVersion: "2024-11-05",
      capabilities: SERVER_CAPABILITIES,
      toolCount: MCP_TOOLS.length,
      tools: MCP_TOOLS.map(t => ({ name: t.name, description: t.description }))
    });
    return;
  }

  // Handle POST for JSON-RPC
  try {
    const m = onlyMethods(req, ["GET", "POST", "OPTIONS"]);
    if (m) throw m;

    const body = await parseJsonBody(req);
    const result = await handleMCPRequest(body, req.headers);

    sendJson(res, result.error ? 400 : 200, result);
  } catch (err) {
    sendError(res, err);
  }
}
