import { router } from 'expo-router';
import { useT } from '@/i18n';
import { Button, EmptyState } from './ui';

export function NotFound() {
  const t = useT();
  return (
    <EmptyState
      icon="help-circle-outline"
      message={`${t('notFoundTitle')}\n${t('notFoundMessage')}`}
      action={<Button title={t('goBack')} variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />}
    />
  );
}
