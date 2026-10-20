import { Stack } from 'expo-router';
import { NotFound } from '@/components/NotFound';
import { useT } from '@/i18n';

export default function NotFoundScreen() {
  const t = useT();
  return (
    <>
      <Stack.Screen options={{ title: t('notFoundTitle') }} />
      <NotFound />
    </>
  );
}
