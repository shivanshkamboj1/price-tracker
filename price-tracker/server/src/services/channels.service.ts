import { DELIVERY_CHANNELS, type DeliveryChannel } from '../config/constants';
import { telegramConfigured, twilioConfigured, whatsappEnabled } from '../config/env';
import { User } from '../models/User';
import { getLinkedWhatsAppAccount } from '../models/WhatsApp';
import { notFound } from '../utils/errors';

export interface ChannelSummary {
  channel: DeliveryChannel;
  /** The server supports it (credentials present, not switched off). */
  available: boolean;
  /** Choosing it now would actually reach somebody. */
  ready: boolean;
  /** One short line for the channel picker: who it reaches, or what is missing. */
  detail: string;
}

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** What each delivery channel can do for this account right now. */
export async function getChannelSummary(userId: string): Promise<ChannelSummary[]> {
  const user = await User.findById(userId).lean();
  if (!user) throw notFound('Account not found');

  const whatsappAccount = whatsappEnabled ? await getLinkedWhatsAppAccount() : null;
  const recipients = user.whatsappRecipients?.length ?? 0;
  const chats = user.telegramChats?.length ?? 0;

  const summaries: Record<DeliveryChannel, Omit<ChannelSummary, 'channel'>> = {
    whatsapp: {
      available: whatsappEnabled,
      ready: Boolean(whatsappAccount) && recipients > 0,
      detail: !whatsappEnabled
        ? 'Turned off on the server'
        : !whatsappAccount
          ? 'Link a WhatsApp account first'
          : recipients === 0
            ? 'Add a number to send to'
            : plural(recipients, 'number'),
    },
    telegram: {
      available: telegramConfigured,
      ready: telegramConfigured && chats > 0,
      detail: !telegramConfigured
        ? 'Not set up on the server'
        : chats === 0
          ? 'Connect a chat first'
          : plural(chats, 'chat'),
    },
    sms: {
      available: twilioConfigured,
      ready: twilioConfigured && Boolean(user.phone),
      detail: !twilioConfigured ? 'Needs Twilio on the server' : user.phone ?? 'Add your mobile number',
    },
    call: {
      available: twilioConfigured,
      ready: twilioConfigured && Boolean(user.phone),
      detail: !twilioConfigured ? 'Needs Twilio on the server' : user.phone ?? 'Add your mobile number',
    },
  };

  return DELIVERY_CHANNELS.map((channel) => ({ channel, ...summaries[channel] }));
}
