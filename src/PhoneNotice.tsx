import { useState } from 'react';
import { Anchor, Button, Center, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { LuCheck, LuLink, LuShare } from 'react-icons/lu';
import logoUrl from './assets/mapcompare-logo.svg';

/**
 * Shown instead of the app on phone-sized screens (smallScreen.ts). It keeps
 * the link the visitor arrived on, including a shared view (`#v=`) or
 * comparison (`?project=`), so they can send it to a bigger screen.
 * "Continue anyway" opens the app for those who want to try.
 */
export function PhoneNotice({ onContinue }: { onContinue: () => void }) {
  const url = window.location.href;
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === 'function';

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // The box below is selectable; copying by hand still works.
    }
  }

  return (
    <Center mih="100dvh" p="lg" style={{ background: 'var(--mantine-color-dark-8)' }}>
      <Stack gap="md" maw={420} w="100%">
        <Group gap="xs">
          <img src={logoUrl} alt="" width={28} height={28} />
          <Text fw={700} size="lg">
            MapCompare
          </Text>
        </Group>
        <Title order={3}>Best viewed on a larger screen</Title>
        <Text c="dimmed">
          Sorry, two maps side by side don’t fit on a phone. Open this link on a computer or tablet to compare
          places at true scale.
        </Text>
        <TextInput value={url} readOnly onFocus={(e) => e.currentTarget.select()} aria-label="Link to this page" />
        <Group gap="xs" grow>
          <Button leftSection={copied ? <LuCheck size={16} /> : <LuLink size={16} />} onClick={copy}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          {canShare && (
            <Button
              variant="default"
              leftSection={<LuShare size={16} />}
              onClick={() => navigator.share({ title: 'MapCompare', url }).catch(() => undefined)}
            >
              Share
            </Button>
          )}
        </Group>
        <Anchor component="button" type="button" size="sm" c="dimmed" onClick={onContinue} ta="left">
          Continue anyway
        </Anchor>
      </Stack>
    </Center>
  );
}
