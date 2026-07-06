export interface FcaAttachment {
  type: string;
  url?: string;
  previewUrl?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  filename?: string;
  fileSize?: number;
  mimeType?: string;
  duration?: number;
}

export interface FcaMessageEvent {
  type: "message" | "message_reply";
  senderID: string;
  threadID: string;
  messageID: string;
  body: string;
  attachments: FcaAttachment[];
  isGroup: boolean;
  timestamp: string | number;
  mentions?: Record<string, string>;
  messageReply?: FcaMessageEvent;
}

export interface FcaGroupEvent {
  type: "event";
  senderID: string;
  threadID: string;
  messageID: string;
  logMessageType: string;
  logMessageData: {
    addedParticipants?: Array<{ userFbId: string; name?: string }>;
    leftParticipantFbId?: string;
    name?: string;
    participant_id?: string;
    nickname?: string;
  };
  logMessageBody: string;
  author: string;
  timestamp: string | number;
  participantIDs?: string[];
}

export type FcaEvent =
  | FcaMessageEvent
  | FcaGroupEvent
  | { type: string; [k: string]: unknown };

export interface FcaApi {
  listen(callback: (err: Error | null, event: FcaEvent) => void): () => void;
  sendMessage(
    message: string | { body?: string; attachment?: unknown },
    threadID: string,
    callback?: (err: Error | null, info: { messageID: string }) => void,
    replyMessageID?: string,
  ): void;
  sendTypingIndicator(threadID: string, callback?: (err?: Error) => void): () => void;
  setMessageReaction(
    reaction: string,
    messageID: string,
    callback?: (err?: Error) => void,
    forceCustomReactions?: boolean,
  ): void;
  setOptions(options: Record<string, unknown>): void;
  getAppState(): FcaCookie[];
  getCurrentUserID(): string;
  logout(callback?: (err?: Error) => void): void;
  getUserInfo(
    ids: string | string[],
    callback: (err: Error | null, info: Record<string, { name: string }>) => void,
  ): void;
  getThreadInfo(
    threadID: string,
    callback: (err: Error | null, info: unknown) => void,
  ): void;
  removeUserFromGroup(
    userID: string,
    threadID: string,
    callback?: (err: Error | null) => void,
  ): void;
  changeAdminStatus(
    threadID: string,
    userIDs: string[],
    adminStatus: boolean,
    callback?: (err: Error | null) => void,
  ): void;
  setTitle(
    newTitle: string,
    threadID: string,
    callback?: (err: Error | null) => void,
  ): void;
  changeNickname(
    nickname: string,
    threadID: string,
    participantID: string,
    callback?: (err: Error | null) => void,
  ): void;
  markAsRead(threadID: string, callback?: (err: Error | null) => void): void;
  handleMessageRequest(
    threadID: string,
    accept: boolean,
    callback?: (err: Error | null) => void,
  ): void;
  listenMqtt?(callback: (err: Error | null, event: FcaEvent) => void): () => void;
}

export interface FcaCookie {
  key: string;
  value: string;
  domain: string;
  path: string;
  hostOnly?: boolean;
  creation?: string;
  lastAccessed?: string;
  expires?: number | string;
}
