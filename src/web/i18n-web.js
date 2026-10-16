// Texts of the phone web app. They are added to the shared dictionaries at
// start (see addWebTranslations), so the desktop bundle stays as it is and
// t() works the same everywhere.

import { translations } from '../i18n.js';

export const webTranslations = {
  ru: {
    // Phone web app
    'web-tab-timer': 'Таймер',
    'web-tab-week': 'Неделя',
    'web-sync': 'Синхр.',
    'web-syncing': 'Синхронизация...',
    'web-synced-at': 'Синхронизировано: {time}',
    'web-never-synced': 'Ещё не синхронизировано',
    'web-offline': 'Нет сети, изменения сохранены на телефоне',
    'web-renew-needed': 'Доступ к Google истёк',
    'web-renew': 'Войти снова',
    'web-signin-text': 'Войдите тем же аккаунтом Google, что и в приложении на компьютере: записи синхронизируются через ваш Google Drive.',
    'web-signin-btn': 'Войти через Google',
    'web-signin-waiting': 'Ждём ответа Google...',
    'web-not-configured': 'Вход через Google для этой сборки ещё не настроен.',
    'web-signin-failed': 'Не удалось войти: {error}',
    'web-scope-denied': 'Без доступа к Google Drive синхронизация не работает. Войдите снова и отметьте доступ к Drive.',
    'web-sync-failed': 'Не удалось синхронизировать: {error}',
    'web-pulled': 'Данные обновлены из Google Drive',
    'web-merged': 'Изменения с другого устройства объединены с этими',
    'web-up-to-date': 'Всё уже синхронизировано',
    'web-account-title': 'Аккаунт Google',
    'web-sign-out': 'Выйти',
    'web-signed-out': 'Вы вышли из Google. Данные остались на телефоне.',
    'web-add-manual': 'Добавить вручную',
    'web-continue': 'Продолжить',
    'web-timer-cancelled': 'Таймер отменён',
    'web-entry-saved': 'Запись сохранена',
    'web-entry-edit': 'Запись',
    'web-week-total': 'Всего',
    'web-week-billable': 'К оплате',
    'web-week-amount': 'Сумма',
    'web-week-prev': 'Предыдущая неделя',
    'web-week-next': 'Следующая неделя',
    'web-day-empty': 'Нет записей',
    'web-timer-idle': 'Таймер не запущен',
    'web-paused': 'На паузе'
  },
  en: {
    // Phone web app
    'web-tab-timer': 'Timer',
    'web-tab-week': 'Week',
    'web-sync': 'Sync',
    'web-syncing': 'Syncing...',
    'web-synced-at': 'Synced: {time}',
    'web-never-synced': 'Not synced yet',
    'web-offline': 'Offline, changes are kept on this phone',
    'web-renew-needed': 'Google access has expired',
    'web-renew': 'Sign in again',
    'web-signin-text': 'Sign in with the same Google account as in the desktop app: your entries sync through your Google Drive.',
    'web-signin-btn': 'Sign in with Google',
    'web-signin-waiting': 'Waiting for Google...',
    'web-not-configured': 'Google sign-in is not set up for this build yet.',
    'web-signin-failed': 'Sign-in failed: {error}',
    'web-scope-denied': 'Sync does not work without access to Google Drive. Sign in again and tick the Drive access.',
    'web-sync-failed': 'Sync failed: {error}',
    'web-pulled': 'Data updated from Google Drive',
    'web-merged': 'Changes from another device were merged with these',
    'web-up-to-date': 'Already up to date',
    'web-account-title': 'Google account',
    'web-sign-out': 'Sign out',
    'web-signed-out': 'Signed out of Google. Your data stays on this phone.',
    'web-add-manual': 'Add manually',
    'web-continue': 'Continue',
    'web-timer-cancelled': 'Timer cancelled',
    'web-entry-saved': 'Entry saved',
    'web-entry-edit': 'Entry',
    'web-week-total': 'Total',
    'web-week-billable': 'Billable',
    'web-week-amount': 'Amount',
    'web-week-prev': 'Previous week',
    'web-week-next': 'Next week',
    'web-day-empty': 'No entries',
    'web-timer-idle': 'Timer is not running',
    'web-paused': 'Paused'
  }
};

export function addWebTranslations(target = translations) {
  Object.keys(webTranslations).forEach(lang => {
    target[lang] = { ...(target[lang] || {}), ...webTranslations[lang] };
  });
  return target;
}
