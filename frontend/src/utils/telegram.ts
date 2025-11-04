export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export function getTelegramUser(): TelegramUser | null {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return null;

    const initData = tg.initDataUnsafe?.user;
    if (!initData) return null;

    return initData as TelegramUser;
  } catch (error) {
    console.error('Error getting Telegram user:', error);
    return null;
  }
}

export function openInvoice(packageId: string, onSuccess?: () => void, onError?: () => void) {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) {
      console.error('Telegram WebApp not available');
      onError?.();
      return;
    }

    tg.openInvoice(packageId, (status: string) => {
      if (status === 'paid' || status === 'success') {
        onSuccess?.();
      } else {
        onError?.();
      }
    });
  } catch (error) {
    console.error('Error opening invoice:', error);
    onError?.();
  }
}

export function hapticFeedback(type: 'impact' | 'notification' | 'selection' = 'impact') {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.HapticFeedback) return;

    switch (type) {
      case 'impact':
        tg.HapticFeedback.impactOccurred('medium');
        break;
      case 'notification':
        tg.HapticFeedback.notificationOccurred('success');
        break;
      case 'selection':
        tg.HapticFeedback.selectionChanged();
        break;
    }
  } catch (error) {
    console.error('Error triggering haptic feedback:', error);
  }
}
