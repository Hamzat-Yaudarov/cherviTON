export function getTelegramUser() {
    try {
        const tg = window.Telegram?.WebApp;
        if (!tg)
            return null;
        const initData = tg.initDataUnsafe?.user;
        if (!initData)
            return null;
        return initData;
    }
    catch (error) {
        console.error('Error getting Telegram user:', error);
        return null;
    }
}
export function openInvoice(packageId, onSuccess, onError) {
    try {
        const tg = window.Telegram?.WebApp;
        if (!tg) {
            console.error('Telegram WebApp not available');
            onError?.();
            return;
        }
        tg.openInvoice(packageId, (status) => {
            if (status === 'paid' || status === 'success') {
                onSuccess?.();
            }
            else {
                onError?.();
            }
        });
    }
    catch (error) {
        console.error('Error opening invoice:', error);
        onError?.();
    }
}
export function hapticFeedback(type = 'impact') {
    try {
        const tg = window.Telegram?.WebApp;
        if (!tg?.HapticFeedback)
            return;
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
    }
    catch (error) {
        console.error('Error triggering haptic feedback:', error);
    }
}
//# sourceMappingURL=telegram.js.map