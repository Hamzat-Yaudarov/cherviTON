export interface TelegramUser {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
}
export declare function getTelegramUser(): TelegramUser | null;
export declare function openInvoice(packageId: string, onSuccess?: () => void, onError?: () => void): void;
export declare function hapticFeedback(type?: 'impact' | 'notification' | 'selection'): void;
//# sourceMappingURL=telegram.d.ts.map