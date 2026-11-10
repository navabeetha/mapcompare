import { useState } from 'react';
import {
  Button,
  Popover,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { LuGlobe } from 'react-icons/lu';
import { displayTitle, type Project } from './projects';

interface Props {
  isAuthor: boolean;
  curatedViews: Project[];
  onLoad: (id: string) => void;
  /** Opens Manage Explore (author only), which is also where drafts live. */
  onManage: () => void;
}

export function ExploreMenu({
  isAuthor,
  curatedViews,
  onLoad,
  onManage,
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
                <Button
                  variant="default"
                  size="xs"
                  fullWidth
                  onClick={() => {
                    setOpened(false);
                    onManage();
                  }}
                >
                  Manage Explore…
                </Button>
              </div>
            )}
          </Stack>
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
}
