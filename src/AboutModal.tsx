import { Modal, Title, Text, List, Anchor, Stack, Divider, Code } from '@mantine/core';

interface AboutModalProps {
  opened: boolean;
  onClose: () => void;
}

export function AboutModal({ opened, onClose }: AboutModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Title order={3}>About MapCompare</Title>}
      size="lg"
      centered
    >
      <Stack gap="md">
        <div>
          <Title order={5} c="blue" tt="uppercase" mb={6}>
            What this is
          </Title>
          <Text size="sm">
            A split-screen map tool for comparing the true physical size of
            cities side-by-side. Standard web maps use the Web Mercator
            projection, which inflates landmasses the farther you get from the
            equator — Greenland looks as big as Africa even though Africa is
            ~14× larger.
          </Text>
          <Text size="sm" mt="sm">
            MapCompare cancels this distortion <em>between</em> the two panes:
            when you zoom one map, the other&apos;s zoom is recomputed so that
            one pixel represents the same physical distance on both. The math
            is{' '}
            <Code>
              z_target = z_source + log₂(cos(lat_target) / cos(lat_source))
            </Code>
            . A city near the equator and a city at 60° latitude end up at
            visibly different zoom levels, but identical scale.
          </Text>
        </div>

        <div>
          <Title order={5} c="blue" tt="uppercase" mb={6}>
            Current limitations
          </Title>
          <List size="sm" spacing={6}>
            <List.Item>
              <strong>Each individual map is still Web Mercator.</strong> The
              equalization happens at the map center. Within a single pane,
              features farther from the center latitude still have Mercator
              stretch. At city zoom (z ≥ 11) this is fractions of a percent —
              invisible. Zoomed out to continent scale, it becomes noticeable.
            </List.Item>
            <List.Item>
              Panning is fully independent — only zoom is synced. This is by
              design (it lets you align Times Square with Shibuya manually) but
              means scale equality is only guaranteed when both centers are
              set.
            </List.Item>
            <List.Item>
              Tile providers used here (OSM, Esri imagery, OpenTopoMap) only
              serve Web Mercator tiles, which constrains the projection options
              below.
            </List.Item>
          </List>
        </div>

        <div>
          <Title order={5} c="blue" tt="uppercase" mb={6}>
            Planned next steps
          </Title>
          <List size="sm" spacing={6}>
            <List.Item>
              <strong>Full equal-area projection</strong> within each pane —
              likely via <Code>proj4leaflet</Code> with a Lambert Azimuthal or
              Albers CRS, or switching to MapLibre + vector tiles which can be
              reprojected client-side.
            </List.Item>
            <List.Item>
              A live meters-per-pixel readout per pane to verify equalization.
            </List.Item>
            <List.Item>
              A measurement tool (click two points to get true ground
              distance).
            </List.Item>
            <List.Item>
              A reference grid overlay showing geographic spacing.
            </List.Item>
          </List>
        </div>

        <Divider />
        <Text size="xs" c="dimmed">
          Built with React, <Anchor href="https://mantine.dev">Mantine</Anchor>,{' '}
          <Anchor href="https://leafletjs.com">Leaflet</Anchor>,{' '}
          <Anchor href="https://www.openstreetmap.org">OpenStreetMap</Anchor>,
          and{' '}
          <Anchor href="https://nominatim.org">Nominatim</Anchor> — all open
          source.
        </Text>
      </Stack>
    </Modal>
  );
}
