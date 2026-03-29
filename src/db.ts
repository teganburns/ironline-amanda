import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";
import { Unarchiver, NSAttributedString } from "node-typedstream";

const DB_PATH = join(homedir(), "Library", "Messages", "chat.db");
export const MAC_EPOCH = 978307200000; // ms since Unix epoch to 2001-01-01

function openDb(): Database {
  return new Database(DB_PATH, { readonly: true });
}

export function macTsToDate(macNs: number): string {
  return new Date(MAC_EPOCH + macNs / 1_000_000).toISOString();
}

export function dateToMacNs(date: Date): number {
  return (date.getTime() - MAC_EPOCH) * 1_000_000;
}

function decodeBody(blob: unknown): string | null {
  if (!blob) return null;
  try {
    const buf = Buffer.isBuffer(blob)
      ? blob
      : blob instanceof Uint8Array
      ? Buffer.from(blob)
      : null;
    if (!buf || buf.length === 0) return null;

    const decoded = Unarchiver.open(
      buf,
      Unarchiver.BinaryDecoding.decodable
    ).decodeAll();
    const items = Array.isArray(decoded) ? decoded : [decoded];

    for (const item of items) {
      if (item instanceof NSAttributedString && item.string)
        return item.string;
      if (item?.values)
        for (const v of item.values)
          if (v instanceof NSAttributedString && v.string) return v.string;
    }
  } catch {
    // silently fail — blob format may vary
  }
  return null;
}

export function mapReaction(type: unknown): {
  isReaction: boolean;
  reactionType: string | null;
  isRemoval: boolean;
} {
  const n = typeof type === "number" ? type : 0;
  if (!n || (n < 2000 && n > 0)) return { isReaction: false, reactionType: null, isRemoval: false };
  const isAdd = n >= 2000 && n <= 2005;
  const isRemove = n >= 3000 && n <= 3005;
  if (!isAdd && !isRemove) return { isReaction: false, reactionType: null, isRemoval: false };
  const base = isRemove ? n - 1000 : n;
  const map: Record<number, string> = {
    2000: "love", 2001: "like", 2002: "dislike",
    2003: "laugh", 2004: "emphasize", 2005: "question",
  };
  return { isReaction: true, reactionType: map[base] ?? null, isRemoval: isRemove };
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface Attachment {
  filename: string;
  mimeType: string;
  size: number;
}

export interface Message {
  id: string;
  guid: string;
  text: string | null;
  sender: string;
  chatId: string;
  isFromMe: boolean;
  isRead: boolean;
  service: string;
  date: string; // ISO
  isReaction: boolean;
  reactionType: string | null;
  isReactionRemoval: boolean;
  associatedMessageGuid: string | null;
  attachments: Attachment[];
}

export interface ChatSummary {
  chatId: string;
  displayName: string | null;
  lastMessageAt: string | null; // ISO
  isGroup: boolean;
  unreadCount: number;
}

export interface GetMessagesOpts {
  chatId?: string;
  since?: Date;
  limit?: number;
  search?: string;
  unreadOnly?: boolean;
}

// ── getServiceForChat ────────────────────────────────────────────────────────

export function getServiceForChat(chatId: string): string {
  const db = openDb();
  try {
    const row = db
      .prepare(
        `SELECT service_name FROM chat
         WHERE chat_identifier = ? OR guid = ?
         LIMIT 1`
      )
      .get(chatId, chatId) as Record<string, unknown> | undefined;
    return row?.service_name ? String(row.service_name) : "iMessage";
  } finally {
    db.close();
  }
}

// ── listChats ────────────────────────────────────────────────────────────────

export function listChats(limit = 20): ChatSummary[] {
  const db = openDb();
  try {
    const rows = db
      .prepare(
        `
        SELECT
          chat.chat_identifier    AS chat_identifier,
          chat.guid               AS chat_guid,
          chat.service_name       AS service_name,
          chat.display_name       AS display_name,
          (
            SELECT MAX(m.date)
            FROM chat_message_join cmj
            INNER JOIN message m ON m.ROWID = cmj.message_id
            WHERE cmj.chat_id = chat.ROWID
          ) AS last_date,
          (SELECT COUNT(*) FROM chat_handle_join WHERE chat_handle_join.chat_id = chat.ROWID) > 1
            AS is_group_chat,
          (
            SELECT COUNT(*)
            FROM chat_message_join cmj
            INNER JOIN message m ON m.ROWID = cmj.message_id
            WHERE cmj.chat_id = chat.ROWID
              AND m.is_read = 0
              AND m.is_from_me = 0
          ) AS unread_count
        FROM chat
        ORDER BY (last_date IS NULL), last_date DESC
        LIMIT ?
      `
      )
      .all(limit) as Array<Record<string, unknown>>;

    return rows.map((row) => {
      const guid = row.chat_guid ? String(row.chat_guid) : "";
      const identifier = row.chat_identifier ? String(row.chat_identifier) : "";
      const service = row.service_name ? String(row.service_name) : "";
      const chatId = guid || (service ? `${service};${identifier}` : `iMessage;${identifier}`);

      return {
        chatId,
        displayName: row.display_name ? String(row.display_name) : null,
        lastMessageAt:
          typeof row.last_date === "number"
            ? macTsToDate(row.last_date)
            : null,
        isGroup: Boolean(row.is_group_chat),
        unreadCount:
          typeof row.unread_count === "number" ? row.unread_count : 0,
      };
    });
  } finally {
    db.close();
  }
}

// ── getAttachments ───────────────────────────────────────────────────────────

function getAttachments(db: Database, messageId: string): Attachment[] {
  try {
    const rows = db
      .prepare(
        `
        SELECT
          attachment.filename,
          attachment.mime_type,
          attachment.total_bytes AS size
        FROM attachment
        INNER JOIN message_attachment_join
          ON attachment.ROWID = message_attachment_join.attachment_id
        WHERE message_attachment_join.message_id = ?
      `
      )
      .all(messageId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      filename: row.filename ? String(row.filename) : "",
      mimeType: row.mime_type
        ? String(row.mime_type)
        : "application/octet-stream",
      size: typeof row.size === "number" ? row.size : 0,
    }));
  } catch {
    return [];
  }
}

// ── getMessages ──────────────────────────────────────────────────────────────

export function getMessages(opts: GetMessagesOpts = {}): Message[] {
  const { chatId, since, limit = 50, search, unreadOnly } = opts;
  const db = openDb();

  try {
    const params: (string | number)[] = [];
    let query = `
      SELECT
        message.ROWID                   AS id,
        message.guid                    AS guid,
        message.text                    AS text,
        message.attributedBody          AS attributed_body,
        message.date                    AS date,
        message.is_read                 AS is_read,
        message.is_from_me              AS is_from_me,
        message.service                 AS service,
        message.associated_message_type AS reaction_type,
        message.associated_message_guid AS reaction_guid,
        handle.id                       AS sender,
        chat.chat_identifier            AS chat_identifier,
        chat.guid                       AS chat_guid,
        chat.service_name               AS chat_service
      FROM message
      LEFT JOIN handle          ON message.handle_id         = handle.ROWID
      LEFT JOIN chat_message_join ON message.ROWID           = chat_message_join.message_id
      LEFT JOIN chat             ON chat_message_join.chat_id = chat.ROWID
      WHERE 1=1
    `;

    if (chatId) {
      query += " AND (chat.chat_identifier = ? OR chat.guid = ?)";
      params.push(chatId, chatId);
    }

    if (since) {
      query += " AND message.date >= ?";
      params.push(dateToMacNs(since));
    }

    if (unreadOnly) {
      query += " AND message.is_read = 0 AND message.is_from_me = 0";
    }

    if (search) {
      query += " AND (message.text LIKE ? OR CAST(message.attributedBody AS TEXT) LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    query += " ORDER BY message.date DESC LIMIT ?";
    params.push(limit);

    const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;

    return rows.map((row) => {
      const messageId = String(row.id);
      const text =
        decodeBody(row.attributed_body) ??
        (row.text ? String(row.text) : null);

      const guid = row.chat_guid ? String(row.chat_guid) : "";
      const identifier = row.chat_identifier ? String(row.chat_identifier) : "";
      const svc = row.chat_service ? String(row.chat_service) : "";
      const chatIdResolved =
        guid || (svc ? `${svc};${identifier}` : `iMessage;${identifier}`);

      const reaction = mapReaction(row.reaction_type);

      return {
        id: messageId,
        guid: row.guid ? String(row.guid) : "",
        text,
        sender: row.sender ? String(row.sender) : "me",
        chatId: chatIdResolved,
        isFromMe: Boolean(row.is_from_me),
        isRead: Boolean(row.is_read),
        service: row.service ? String(row.service) : "iMessage",
        date: typeof row.date === "number" ? macTsToDate(row.date) : new Date().toISOString(),
        isReaction: reaction.isReaction,
        reactionType: reaction.reactionType,
        isReactionRemoval: reaction.isRemoval,
        associatedMessageGuid: row.reaction_guid ? String(row.reaction_guid) : null,
        attachments: getAttachments(db, messageId),
      };
    });
  } finally {
    db.close();
  }
}
