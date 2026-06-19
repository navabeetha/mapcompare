import {
  Modal,
  Title,
  Text,
  List,
  Anchor,
  Stack,
  Divider,
  Code,
  Accordion,
  Button,
  Group,
} from '@mantine/core';

interface AboutModalProps {
  opened: boolean;
  onClose: () => void;
}

export function AboutModal({ opened, onClose }: AboutModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Title order={3}>Welcome to MapCompare</Title>}
      size="lg"
      centered
    >
      <Stack gap="md">
        <Text size="sm">
          A split-screen map tool for comparing the true physical size of
          cities side-by-side. Standard web maps use the Web Mercator
          projection, which inflates landmasses the farther you get from the
          equator — Greenland looks as big as Africa even though Africa is
          ~14× larger.
        </Text>

        <div>
          <Title order={6} c="blue" tt="uppercase" mb={6}>
            How to use it
          </Title>
          <List size="sm" spacing={6}>
            <List.Item>
              <strong>Search</strong> a place on either map — start typing and
              pick from the suggestions.
            </List.Item>
            <List.Item>
              <strong>Zoom</strong> one map and the other re-zooms automatically
              so one pixel covers the same real-world distance on both.
            </List.Item>
            <List.Item>
              Toggle the <strong>Scale grid</strong> to overlay matching cells,
              and click its length to pin a fixed grid size.
            </List.Item>
            <List.Item>
              Turn on <strong>Measure</strong> and click two points on each map
              to compare true ground distances.
            </List.Item>
            <List.Item>
              Open <strong>Explore</strong> for curated city comparisons.
            </List.Item>
          </List>
        </div>

        <Accordion variant="separated" multiple>
          <Accordion.Item value="how-it-works">
            <Accordion.Control>How scale equalization works</Accordion.Control>
            <Accordion.Panel>
              <Text size="sm">
                MapCompare cancels this distortion <em>between</em> the two
                panes: when you zoom one map, the other&apos;s zoom is recomputed
                so that one pixel represents the same physical distance on both.
                The math is{' '}
                <Code>
                  z_target = z_source + log₂(cos(lat_target) / cos(lat_source))
                </Code>
                . A city near the equator and a city at 60° latitude end up at
                visibly different zoom levels, but identical scale.
              </Text>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="limitations">
            <Accordion.Control>Current limitations</Accordion.Control>
            <Accordion.Panel>
              <List size="sm" spacing={6}>
                <List.Item>
                  <strong>Each individual map is still Web Mercator.</strong> The
                  equalization happens at the map center. Within a single pane,
                  features farther from the center latitude still have Mercator
                  stretch. At city zoom (z ≥ 11) this is fractions of a percent —
                  invisible. Zoomed out to continent scale, it becomes
                  noticeable.
                </List.Item>
                <List.Item>
                  Panning is fully independent — only zoom is synced. This is by
                  design (it lets you align Times Square with Shibuya manually)
                  but means scale equality is only guaranteed when both centers
                  are set.
                </List.Item>
                <List.Item>
                  Tile providers used here (OSM, Esri imagery, OpenTopoMap) only
                  serve Web Mercator tiles, which constrains the projection
                  options below.
                </List.Item>
              </List>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="next-steps">
            <Accordion.Control>Planned next steps</Accordion.Control>
            <Accordion.Panel>
              <List size="sm" spacing={6}>
                <List.Item>
                  <strong>Full equal-area projection</strong> within each pane —
                  likely via <Code>proj4leaflet</Code> with a Lambert Azimuthal
                  or Albers CRS, or switching to MapLibre + vector tiles which
                  can be reprojected client-side.
                </List.Item>
                <List.Item>
                  A live meters-per-pixel readout per pane to verify
                  equalization.
                </List.Item>
              </List>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>

        <Text size="xs" c="dimmed">
          Built with React, <Anchor href="https://mantine.dev">Mantine</Anchor>,{' '}
          <Anchor href="https://leafletjs.com">Leaflet</Anchor>,{' '}
          <Anchor href="https://www.openstreetmap.org">OpenStreetMap</Anchor>,
          and{' '}
          <Anchor href="https://nominatim.org">Nominatim</Anchor> — all open
          source.
        </Text>

        <Divider />
        <Group justify="flex-end">
          <Button onClick={onClose}>Start exploring</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
