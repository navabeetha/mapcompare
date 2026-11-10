import { useState } from 'react';
import {
  ActionIcon,
  Button,
  Checkbox,
  Divider,
  Group,
  NumberInput,
  Popover,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Tooltip,
} from '@mantine/core';
import { MdLayers } from 'react-icons/md';
import { formatDistance } from './altitude';
import { STYLE_LABELS, type MapStyle } from './tileLayers';
import { ALL_BORDER_LEVELS, type BorderLevel } from './vectorStyle';

interface Props {
  gridVisible: boolean;
  onGridVisibleChange: (on: boolean) => void;
  /** The grid's current cell length, auto or fixed. */
  gridStepMeters: number;
  gridOverrideMeters: number | null;
  /** null goes back to auto. */
  onGridOverride: (meters: number | null) => void;
  labelsVisible: boolean;
  onLabelsVisibleChange: (on: boolean) => void;
  /** Base view, shared by both maps. */
  mapStyle: MapStyle;
  onMapStyleChange: (style: MapStyle) => void;
  /** Border groups on. Empty means the Borders switch is off. */
  borders: BorderLevel[];
  onBordersChange: (levels: BorderLevel[]) => void;
  /** Shapes (and notes, when they exist) drawn on the maps. */
  annotationsVisible: boolean;
  onAnnotationsVisibleChange: (on: boolean) => void;
}

const BORDER_NAMES: Record<BorderLevel, string> = {
  states: 'States & regions',
  districts: 'Districts',
  cities: 'Cities (zoomed in)',
};

/**
 * The Layers dropdown: things drawn over both maps. Each layer is one row, a
 * switch plus its own settings underneath when it's on. New layers, or more
 * label settings, go in as further rows.
 */
/** Each layer row: name and description on the left, switch at the far right. */
const ROW = {
  body: { justifyContent: 'space-between', alignItems: 'flex-start' },
  labelWrapper: { flex: 1, paddingInlineStart: 0 },
} as const;

export function LayersMenu(p: Props) {
  const [opened, setOpened] = useState(false);
  const [gridInput, setGridInput] = useState<number | string>('');
  const [gridUnit, setGridUnit] = useState<'m' | 'km'>('km');

  // Fill the length box from the current grid each time the menu opens.
  function toggle() {
    if (!opened) {
      setGridInput(p.gridStepMeters >= 1000 ? +(p.gridStepMeters / 1000).toFixed(2) : Math.round(p.gridStepMeters));
      setGridUnit(p.gridStepMeters >= 1000 ? 'km' : 'm');
    }
    setOpened((o) => !o);
  }


  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" withArrow shadow="md" width={260}>
      <Popover.Target>
        <Tooltip label="Layers" withArrow disabled={opened}>
          <ActionIcon
            size="lg"
            variant="default"
            onClick={toggle}
            aria-label="Layers"
            aria-expanded={opened}
          >
            <MdLayers size={18} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <SegmentedControl
            fullWidth
            size="xs"
            value={p.mapStyle}
            onChange={(v) => p.onMapStyleChange(v as MapStyle)}
            data={(['satellite', 'roadmap'] as const).map((v) => ({ value: v, label: STYLE_LABELS[v] }))}
            aria-label="Map view"
          />
          <Divider />
          <Switch
            size="sm"
            labelPosition="left"
            styles={ROW}
            checked={p.annotationsVisible}
            onChange={(e) => p.onAnnotationsVisibleChange(e.currentTarget.checked)}
            label="Annotations"
            description="Shapes and measurements drawn on the maps."
          />
          <Divider />
          <Switch
            size="sm"
            labelPosition="left"
            styles={ROW}
            checked={p.labelsVisible}
            onChange={(e) => p.onLabelsVisibleChange(e.currentTarget.checked)}
            label="Labels"
            description="Countries, regions, cities, districts, seas."
          />
          <Divider />
          <Switch
            size="sm"
            labelPosition="left"
            styles={ROW}
            checked={p.borders.length > 0}
            onChange={(e) => p.onBordersChange(e.currentTarget.checked ? ALL_BORDER_LEVELS : [])}
            label="Borders"
            description="States, districts, cities. No country borders."
          />
          {p.borders.length > 0 && (
            <Checkbox.Group
              value={p.borders}
              // Keep the menu's order whatever order they're ticked in.
              onChange={(v) => p.onBordersChange(ALL_BORDER_LEVELS.filter((l) => v.includes(l)))}
            >
              <Stack gap={6} pl={2}>
                {ALL_BORDER_LEVELS.map((l) => (
                  <Checkbox key={l} size="xs" value={l} label={BORDER_NAMES[l]} />
                ))}
              </Stack>
            </Checkbox.Group>
          )}
          <Divider />
          <Switch
            size="sm"
            labelPosition="left"
            styles={ROW}
            checked={p.gridVisible}
            onChange={(e) => p.onGridVisibleChange(e.currentTarget.checked)}
            label="Scale grid"
            description={`Cells ${formatDistance(p.gridStepMeters)}${p.gridOverrideMeters != null ? ' (fixed)' : ' (auto)'}`}
          />
          {p.gridVisible && (
            <>
              <Group gap="xs" align="flex-end" wrap="nowrap">
                <NumberInput label="Cell length" size="xs" min={0} w={110} value={gridInput} onChange={setGridInput} />
                <SegmentedControl
                  size="xs"
                  value={gridUnit}
                  onChange={(v) => setGridUnit(v as 'm' | 'km')}
                  data={[
                    { label: 'm', value: 'm' },
                    { label: 'km', value: 'km' },
                  ]}
                />
              </Group>
              <Group gap="xs" justify="space-between">
                <Button variant="subtle" size="xs" onClick={() => p.onGridOverride(null)}>
                  Reset to auto
                </Button>
                <Button
                  size="xs"
                  onClick={() => {
                    const meters = Number(gridInput) * (gridUnit === 'km' ? 1000 : 1);
                    if (meters > 0) p.onGridOverride(meters);
                  }}
                >
                  Set
                </Button>
              </Group>
            </>
          )}
          <Text size="xs" c="dimmed">
            Shown on both maps.
          </Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
