import { useEffect, useState } from 'react';
import { Button, Group, Modal, Stack, TextInput } from '@mantine/core';

interface Props {
  opened: boolean;
  defaultTitle: string;
  onSave: (title: string) => void;
  onClose: () => void;
}

export function SaveViewModal({ opened, defaultTitle, onSave, onClose }: Props) {
  const [title, setTitle] = useState(defaultTitle);

  useEffect(() => {
    if (opened) setTitle(defaultTitle);
  }, [opened, defaultTitle]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onSave(trimmed);
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Save view" centered size="sm">
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            data-autofocus
            required
          />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
