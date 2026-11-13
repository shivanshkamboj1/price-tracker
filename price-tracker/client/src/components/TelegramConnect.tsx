import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from './Badge';
import { Button } from './Button';
import { Banner } from './Feedback';
import { userApi } from '../services/endpoints';
import { ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { formatDateTime } from '../utils/format';
import type { TelegramChat, TelegramLinkStart } from '../types';

const POLL_MS = 3000;

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback;

function ChatRow({
  chat,
  onTest,
  onRemove,
  testing,
  removing,
}: {
  chat: TelegramChat;
  onTest: () => void;
  onRemove: () => void;
  testing: boolean;
  removing: boolean;
}) {
  const isGroup = chat.chatId.startsWith('-');
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate text-sm font-medium text-ink">
          {chat.chatTitle ?? 'Telegram chat'}
          {isGroup && <Badge tone="neutral">group</Badge>}
        </p>
        <p className="mt-0.5 text-xs text-muted">Linked {formatDateTime(chat.linkedAt)}</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={onTest} loading={testing}>
          Test
        </Button>
        <Button size="sm" variant="ghost" onClick={onRemove} loading={removing}>
          Remove
        </Button>
      </div>
    </li>
  );
}

/**
 * Connected Telegram chats. Each "Connect" hands out a deep link with a
 * one-time code; whoever opens it and taps Start is added, and this component
 * polls until the server has seen that message. Every linked chat gets every
 * Telegram alert, so a household can share one tracker.
 */
export function TelegramConnect() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  const [link, setLink] = useState<TelegramLinkStart | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const statusQuery = useQuery({ queryKey: ['telegram'], queryFn: userApi.telegramStatus });
  const status = statusQuery.data;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['telegram'] }),
      queryClient.invalidateQueries({ queryKey: ['channels'] }),
    ]);
    await refreshUser();
  };

  const linkMutation = useMutation({
    mutationFn: userApi.telegramLink,
    onSuccess: (result) => {
      setLinkError(null);
      setCopied(false);
      setLink(result);
    },
    onError: (error) => toast(errorMessage(error, 'Could not start connecting Telegram'), 'error'),
  });

  const testMutation = useMutation({
    mutationFn: (chatId?: string) => userApi.telegramTest(chatId),
    onSuccess: (result) => {
      if (result.failed.length === 0) {
        toast(
          result.sent === 1 ? 'Test message sent — check Telegram' : `Test sent to ${result.sent} chats`,
          'success',
        );
      } else {
        toast(`Sent to ${result.sent}; not delivered to ${result.failed.map((f) => f.reason).join('; ')}`, 'error');
      }
    },
    onError: (error) => toast(errorMessage(error, 'Could not send the test message'), 'error'),
  });

  const removeMutation = useMutation({
    mutationFn: userApi.telegramRemoveChat,
    onSuccess: async () => {
      toast('Telegram chat removed', 'success');
      await refresh();
    },
    onError: (error) => toast(errorMessage(error, 'Could not remove that chat'), 'error'),
  });

  const cancelLink = () => {
    setLink(null);
    // Invalidate the code server-side too, in case the link was shared.
    void userApi.telegramCancelLink().catch(() => undefined);
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      toast('Could not copy — select the link and copy it manually', 'error');
    }
  };

  // Poll while a link is open; stop on success, on an error, or at expiry.
  useEffect(() => {
    if (!link) return;
    let stopped = false;

    const tick = async () => {
      if (Date.now() > new Date(link.expiresAt).getTime()) {
        stopped = true;
        setLink(null);
        setLinkError('That link expired. Start again to get a new one.');
        return;
      }
      try {
        const result = await userApi.telegramVerify();
        if (!stopped && result.connected) {
          stopped = true;
          setLink(null);
          toast(`Connected ${result.chat?.chatTitle ?? 'a Telegram chat'}`, 'success');
          await refresh();
        }
      } catch (error) {
        if (!stopped) {
          stopped = true;
          setLink(null);
          setLinkError(errorMessage(error, 'Could not check Telegram'));
        }
      }
    };

    const timer = window.setInterval(() => {
      if (!stopped) void tick();
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
    // Keyed on the link alone: each new link starts one polling loop.
  }, [link]);

  if (statusQuery.isError) {
    const error = statusQuery.error;
    // A 404 here means the browser has the new client but the API is an older build.
    const outdated = error instanceof ApiError && error.status === 404;
    return (
      <Banner
        tone="bad"
        title="Could not load Telegram settings"
        action={
          <Button size="sm" variant="secondary" onClick={() => void statusQuery.refetch()}>
            Try again
          </Button>
        }
      >
        {outdated
          ? 'The API is running an older version without Telegram support. Rebuild the server (npm run build) and restart the API process.'
          : errorMessage(error, 'The server did not respond. Check that the API is running.')}
      </Banner>
    );
  }

  if (!status) {
    return <p className="text-sm text-muted">Checking Telegram…</p>;
  }

  if (!status.configured) {
    return (
      <Banner tone="warn" title="Telegram is not set up on the server">
        Create a bot with @BotFather, put its token in{' '}
        <code className="rounded bg-line/60 px-1 py-0.5 text-xs">TELEGRAM_BOT_TOKEN</code> in the
        server's <code className="rounded bg-line/60 px-1 py-0.5 text-xs">.env</code>, then restart
        the API and worker.
      </Banner>
    );
  }

  const { chats, maxChats } = status;
  const full = chats.length >= maxChats;

  return (
    <div className="space-y-3">
      {chats.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {chats.map((chat) => (
            <ChatRow
              key={chat.chatId}
              chat={chat}
              onTest={() => testMutation.mutate(chat.chatId)}
              onRemove={() => removeMutation.mutate(chat.chatId)}
              testing={testMutation.isPending && testMutation.variables === chat.chatId}
              removing={removeMutation.isPending && removeMutation.variables === chat.chatId}
            />
          ))}
        </ul>
      )}

      {link ? (
        <div className="space-y-3 rounded-xl border border-brand/30 bg-brand/5 px-4 py-4">
          <p className="text-sm text-ink">
            Open <span className="font-medium">@{link.botUsername}</span> on the Telegram account
            you want to add and tap <span className="font-medium">Start</span>. This page picks it
            up automatically.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-8 items-center rounded-xl bg-brand px-3 text-xs font-medium text-white shadow-sm hover:brightness-110"
            >
              Open Telegram ↗
            </a>
            <Button size="sm" variant="secondary" onClick={() => void copyLink()}>
              {copied ? 'Link copied' : 'Copy link to share'}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelLink}>
              Cancel
            </Button>
            <span className="text-xs text-muted" aria-live="polite">
              Waiting for Start…
            </span>
          </div>
          <p className="text-xs text-muted">
            Adding someone else? Send them the link — when they tap Start, their account is added
            here. For a group, add @{link.botUsername} to it and send{' '}
            <code className="rounded bg-line/60 px-1 py-0.5">/start {link.code}</code> in the
            group. Each link adds one chat and expires after 15 minutes.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={chats.length ? 'secondary' : 'primary'}
            onClick={() => linkMutation.mutate()}
            loading={linkMutation.isPending}
            disabled={full}
          >
            {chats.length ? 'Add another Telegram account' : 'Connect Telegram'}
          </Button>
          {chats.length > 1 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => testMutation.mutate(undefined)}
              loading={testMutation.isPending && testMutation.variables === undefined}
            >
              Test all
            </Button>
          )}
          {chats.length > 0 && (
            <span className="text-xs text-muted">
              {chats.length} of {maxChats} connected
              {full ? ' — remove one to add another' : ''}
            </span>
          )}
        </div>
      )}

      {linkError && <p className="text-xs text-bad">{linkError}</p>}
    </div>
  );
}
