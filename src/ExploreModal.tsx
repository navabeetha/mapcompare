import { Button, Modal, Stack, Text, UnstyledButton, Group } from '@mantine/core';
import type { SavedView } from './savedViews';

interface Props {
  opened: boolean;
  onClose: () => void;
  isAuthor: boolean;
  curatedViews: SavedView[];
  draftViews: SavedView[];
  onLoad: (id: string) => void;
  onDeleteDraft: (id: string) => void;
  onExportDrafts: () => void;
}

export function ExploreModal({
  opened,
  onClose,
  isAuthor,
  curatedViews,
  draftViews,
  onLoad,
  onDeleteDraft,
  onExportDrafts,
}: Props) {
  function handleLoadAndClose(id: string) {
    onLoad(id);
    onClose();
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Explore comparisons"
      centered
      size="md"
    >
      <Stack gap="lg">
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
                  <Text size="sm">{v.title}</Text>
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
                      <Text size="sm">{v.title}</Text>
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
                onClick={onExportDrafts}
              >
                Export drafts to clipboard
              </Button>
            )}
          </div>
        )}
      </Stack>
    </Modal>
  );
}
