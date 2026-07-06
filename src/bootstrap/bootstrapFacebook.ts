/**
 * bootstrapFacebook — Aki Hybrid
 *
 * يستخدم AkiTransport (Djamel-FCA + 20 طبقة حماية من Nejin)
 * بدلاً من MiraiConnectionManager من Sixsu.
 * باقي المنطق (Gateway، EventAdapter، handlers) محافظ عليه من Sixsu.
 */
import { Bot }                       from "../core/Bot";
import { config }                    from "../config/env";
import { AuthManager }               from "../facebook/auth/AuthManager";
import { AuthCredentials, AppState } from "../facebook/auth/types/IAuth";
import { FacebookConnection }        from "../facebook/FacebookConnection";
import { FacebookEventNormalizer }   from "../facebook/FacebookEventNormalizer";
import { FacebookGateway }           from "../facebook/FacebookGateway";
import { AkiTransport }              from "../facebook/AkiTransport";
import { AkiSender }                 from "../facebook/AkiSender";
import { FcaEventAdapter }           from "../facebook/FcaEventAdapter";
import { HumanBehaviorSender }       from "../facebook/HumanBehaviorSender";
import { ISender }                   from "../facebook/types/ISender";
import { FcaCookie }                 from "../facebook/types/FcaTypes";
import { AdminStore }                from "../middleware/built-in/admin-store";
import { UserService }               from "../users/UserService";
import { ReconnectManager }          from "../facebook/reconnect/ReconnectManager";
import { SessionManager }            from "../facebook/session/SessionManager";
import { handleMessage }             from "../handlers/message.handler";
import {
  setGroupSender, setGroupBotUserId, setGroupApiGetter,
  handleMemberJoined, handleMemberLeft,
  handleNameChanged,  handleNicknameChanged,
} from "../handlers/group.handler";
import { LoggerManager }             from "../logger/LoggerManager";

const log = LoggerManager.getLogger("Boot.Facebook");

export interface ActiveTransport {
  label:     string;
  transport: AkiTransport;
}

function getUserIdFromAppState(appState: unknown): string {
  try {
    const cookies = appState as Array<{ key?: string; name?: string; value: string }>;
    return cookies.find(c => (c.key ?? c.name) === "c_user")?.value ?? "";
  } catch { return ""; }
}

interface AccountOpts {
  label:          string;
  credentials:    AuthCredentials;
  userSvc:        UserService;
  adminStore:     AdminStore;
  bot:            Bot;
  isPrimary:      boolean;
  startupDelayMs: number;
  auth:           AuthManager;
  sessionManager: SessionManager;
}

function bootAccount(opts: AccountOpts): AkiTransport {
  const { label, credentials, userSvc, adminStore, bot, isPrimary, startupDelayMs, auth, sessionManager } = opts;

  const botUserId  = getUserIdFromAppState(credentials.appState);
  const systemName = isPrimary ? "aki-connection" : `aki-connection-${label}`;

  const transport = new AkiTransport(
    credentials.appState as unknown as FcaCookie[],
    systemName,
    { initDelayMs: startupDelayMs, proactiveRestartMs: 30 * 60_000 },
  );

  const sender: ISender = new HumanBehaviorSender(new AkiSender(transport));

  log.info(`Account [${label}]: AkiTransport created.`, { botUserId, systemName });

  if (isPrimary) {
    setGroupSender(sender);
    setGroupBotUserId(botUserId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setGroupApiGetter(() => transport.getApi() as any);
  }

  const gateway = new FacebookGateway(
    new FacebookConnection(),
    sender,
    new FacebookEventNormalizer(),
    config.bot.ownerIds,
    adminStore,
    userSvc,
  );

  const adapter          = new FcaEventAdapter(botUserId);
  const accountSender    = sender;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accountApiGetter = (): any => transport.getApi();

  transport.setEventHandler((fcaEvent) => {
    const entries = adapter.adapt(fcaEvent);
    for (const entry of entries) {
      gateway.processWebhookBody(
        {
          object: "page",
          entry: [{
            id:        botUserId,
            time:      entry.timestamp,
            messaging: [entry],
          }],
        },
        handleMessage,
        {
          onMemberJoined:    (evt) => handleMemberJoined(evt, accountSender),
          onMemberLeft:      (evt) => handleMemberLeft(evt, accountSender),
          onNameChanged:     (evt) => handleNameChanged(evt, accountApiGetter),
          onNicknameChanged: (evt) => handleNicknameChanged(evt, accountApiGetter),
        },
      );
    }
  });

  transport.setOnAppStateRefresh((freshCookies: FcaCookie[]) => {
    auth.updateAppState(label, freshCookies as unknown as AppState);
    sessionManager.saveSession(label).catch((err: unknown) => {
      log.warn(`[${label}] Failed to persist refreshed AppState.`, {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });

  transport.setOnPermanentFailure((reason) => {
    log.error(`Transport [${label}]: permanent failure — ${reason}. [permanent-failure]`, { label, reason });
  });

  bot.register(transport);
  log.info(`Account [${label}]: registered with Bot.`, { botUserId });
  return transport;
}

function wireReconnectHooks(transports: ActiveTransport[], reconnect: ReconnectManager, auth: AuthManager): void {
  const map = new Map(transports.map(({ label, transport }) => [label, transport]));

  reconnect.setHealthCheck(async (id) => {
    const t = map.get(id);
    return t ? t.isConnected() : false;
  });

  reconnect.setRestartHook(async (id) => {
    const t = map.get(id);
    if (t) {
      const creds = auth.getCredentials(id);
      log.info(`ReconnectManager → restarting AkiTransport [${id}].`);
      await t.restart(creds?.appState as unknown as FcaCookie[] | undefined);
    }
  });

  for (const { label, transport: t } of transports) {
    t.setOnPermanentFailure((reason) => {
      log.error(`Transport [${label}]: permanent failure — ${reason}. Triggering ReconnectManager.`);
      reconnect.reconnect(label).catch((err: unknown) => {
        log.error(`Forced reconnect threw for [${label}].`, { error: String(err) });
      });
    });
  }
}

export function bootstrapFacebook(
  auth:           AuthManager,
  userSvc:        UserService,
  adminStore:     AdminStore,
  bot:            Bot,
  reconnect:      ReconnectManager,
  sessionManager: SessionManager,
): ActiveTransport[] {
  const transports: ActiveTransport[] = [];

  const primaryCreds   = auth.getCredentials("primary");
  const secondaryCreds = auth.getCredentials("secondary");

  if (primaryCreds) {
    const t = bootAccount({ label: "primary", credentials: primaryCreds, userSvc, adminStore, bot, isPrimary: true, startupDelayMs: 0, auth, sessionManager });
    transports.push({ label: "primary", transport: t });
  }

  if (secondaryCreds) {
    const t = bootAccount({ label: "secondary", credentials: secondaryCreds, userSvc, adminStore, bot, isPrimary: false, startupDelayMs: 5_000, auth, sessionManager });
    transports.push({ label: "secondary", transport: t });
    log.info("Two accounts active — primary + secondary.");
  }

  if (transports.length === 0) {
    log.warn("No FB_APPSTATE set — health-only mode.");
    const noOp: ISender = {
      sendText:     async () => { log.warn("NoOpSender: no FB_APPSTATE configured."); },
      sendTyping:   async () => {},
      sendReaction: async () => {},
    };
    setGroupSender(new HumanBehaviorSender(noOp));
  }

  if (transports.length > 0) wireReconnectHooks(transports, reconnect, auth);

  return transports;
}
