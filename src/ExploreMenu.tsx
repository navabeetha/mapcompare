import { useState } from 'react';
import {
  Button,
  Popover,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
  Group,
} from '@mantine/core';
import type { SavedView } from './savedViews';

interface Props {
  isAuthor: boolean;
  curatedViews: SavedView[];
  draftViews: SavedView[];
  onLoad: (id: string) => void;
  onDeleteDraft: (id: string) => void;
  onExportDrafts: () => void;
}

export function ExploreMenu({
  isAuthor,
  curatedViews,
  draftViews,
  onLoad,
  onDeleteDraft,
  onExportDrafts,
}: Props) {
  const [opened, setOpened] = useState(false);

  function handleLoadAndClose(id: string) {
    onLoad(id);
    setOpened(false);
  }

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      withArrow
      shadow="md"
      width={300}
    >
      <Popover.Target>
        <Button size="sm" onClick={() => setOpened((o) => !o)}>
          Explore
        </Button>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <ScrollArea.Autosize mah={360} type="hover">
          <Stack gap="md">
            <div>
              {isAuthor && (
                <Text size="xs" c="dimmed" tt="uppercase" mb="xs">
                  Featured
                </Text>
              )}
              {curatedViews.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No comparisons yet.
                </Text>
              ) : (
                <Stack gap={2}>
                  {curatedViews.map((v) => (
                    <UnstyledButton
                      key={v.id}
                      onClick={() => handleLoadAndClose(v.id)}
                      className="explore-row"
                    >
                      <Text size="sm" tt="capitalize">
                        {v.title}
                      </Text>
                    </UnstyledButton>
                  ))}
                </Stack>
              )}
            </div>

            {isAuthor && (
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" mb="xs">
                  Drafts (local only)
                </Text>
                {draftViews.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No drafts saved yet.
                  </Text>
                ) : (
                  <Stack gap={2}>
                    {draftViews.map((v) => (
                      <UnstyledButton
                        key={v.id}
                        onClick={() => handleLoadAndClose(v.id)}
                        className="explore-row"
                      >
                        <Group justify="space-between" wrap="nowrap">
                          <Text size="sm" tt="capitalize">
                            {v.title}
                          </Text>
                          <Text
                            component="span"
                            size="sm"
                            c="dimmed"
                            title="Delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteDraft(v.id);
                            }}
                            style={{ cursor: 'pointer', padding: '0 4px' }}
                          >
                            ×
                          </Text>
                        </Group>
                      </UnstyledButton>
                    ))}
                  </Stack>
                )}
                {draftViews.length > 0 && (
                  <Button
                    mt="md"
                    variant="default"
                    size="xs"
                    fullWidth
                    onClick={onExportDrafts}
                  >
                    Export drafts to clipboard
                  </Button>
                )}
              </div>
            )}
          </Stack>
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
}
