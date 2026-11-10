import { useEffect, useState } from 'react';
import {
  Button,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import type { Pin, PinX, PinY } from './pin';

interface Pins {
  left: Pin;
  right: Pin;
}

interface Props {
  opened: boolean;
  defaultTitle: string;
  /** The pins of the project on screen, so re-saving it keeps them. */
  defaultPins: Pins;
  onSave: (title: string, pins: Pins) => void;
  onClose: () => void;
}

const ROWS: PinY[] = ['top', 'middle', 'bottom'];
const COLS: PinX[] = ['left', 'center', 'right'];

/**
 * A 3×3 grid of spots, one per pin. The chosen spot is where the place now on
 * it will sit, in that map's part of the screen, for anyone who opens the
 * comparison.
 */
function PinGrid({ label, value, onChange }: { label: string; value: Pin; onChange: (p: Pin) => void }) {
  return (
    <Stack gap={6} align="center">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <SimpleGrid cols={3} spacing={4} verticalSpacing={4} className="pin-grid" role="radiogroup" aria-label={`${label} pin`}>
        {ROWS.flatMap((y) =>
          COLS.map((x) => {
            const on = value.x === x && value.y === y;
            return (
              <UnstyledButton
                key={`${y}-${x}`}
                className="pin-cell"
                data-on={on}
                role="radio"
                aria-checked={on}
                aria-label={`${y} ${x}`}
                onClick={() => onChange({ x, y })}
              />
            );
          })
        )}
      </SimpleGrid>
    </Stack>
  );
}

export function SaveViewModal({ opened, defaultTitle, defaultPins, onSave, onClose }: Props) {
  const [title, setTitle] = useState(defaultTitle);
  const [pins, setPins] = useState<Pins>(defaultPins);

  // Reset each time the modal opens. defaultPins is a fresh object every
  // render, so it is read on open rather than tracked.
  useEffect(() => {
    if (opened) {
      setTitle(defaultTitle);
      setPins({
        left: { x: defaultPins.left.x, y: defaultPins.left.y },
        right: { x: defaultPins.right.x, y: defaultPins.right.y },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, defaultTitle]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onSave(trimmed, pins);
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
          <div>
            <Text size="sm" fw={500}>
              Pin each map
            </Text>
            <Text size="xs" c="dimmed" mb="xs">
              On other screens, the place now at this spot of each map stays at
              that spot. Pick the middle to keep it centred.
            </Text>
            <Group justify="center" gap="xl">
              <PinGrid label="Left map" value={pins.left} onChange={(p) => setPins((s) => ({ ...s, left: p }))} />
              <PinGrid label="Right map" value={pins.right} onChange={(p) => setPins((s) => ({ ...s, right: p }))} />
            </Group>
          </div>
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
