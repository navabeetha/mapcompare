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
import { LuGlobe } from 'react-icons/lu';
import { displayTitle, type Project } from './projects';

interface Props {
  isAuthor: boolean;
  curatedViews: Project[];
  draftViews: Project[];
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
      position="bottom-start"
      withArrow
      shadow="md"
      width={300}
    >
      <Popover.Target>
        {/* 34 px tall, like the size-lg icon buttons beside it. */}
        <Button
          size="sm"
          h={34}
          px={12}
          leftSection={<LuGlobe size={18} />}
          styles={{ section: { marginInlineEnd: 6 } }}
          onClick={() => setOpened((o) => !o)}
        >
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
                      <Text size="sm" >
                        {displayTitle(v.title)}
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
                          <Text size="sm" >
                            {displayTitle(v.title)}
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
