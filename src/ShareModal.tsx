import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Center, Divider, Group, Loader, Menu, Modal, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { LuChevronDown, LuCopy, LuDownload, LuLink, LuX } from 'react-icons/lu';
import { downloadBlob, type RenderedImage } from './exportImage';
import { fileSize, imageInfo, type ImageFormat } from './exportLayout';

/**
 * Share (header button). Two sections:
 *   - Image: a preview (exportImage.ts) with Copy image and a Download menu
 *     offering PNG (lossless, large) or JPEG (much smaller), each with its
 *     size. Both come from the same render as the preview, not a second one.
 *   - Link: a link to exactly what's on screen, with the whole view packed
 *     into it (viewLink.ts, `#v=`). For a comparison in Explore there's also
 *     its short link (`?project=<id>`), which opens it as published.
 * Later sections (embed code, more formats) slot in below.
 *
 * The image is made each time the modal opens, from the maps as they are
 * then. The modal sits over the maps, but rendering reads the maps' own
 * elements, so the overlay never ends up in the picture.
 */
interface Props {
  opened: boolean;
  onClose: () => void;
  /** Makes the image of the comparison on screen. */
  render: () => Promise<RenderedImage>;
  /** Makes a link to exactly what's on screen. */
  makeViewLink: () => Promise<string>;
  /** The open comparison's public link, if it's in Explore. */
  link: { url: string; title: string } | null;
}

/** The Download menu, in order. */
const FORMATS: { format: ImageFormat; label: string; hint: string }[] = [
  { format: 'png', label: 'PNG', hint: 'Full quality' },
  { format: 'jpeg', label: 'JPEG', hint: 'Smaller file, for posts and messages' },
];

/** Copying an image needs the async clipboard and ClipboardItem (most modern browsers). */
const canCopyImage = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;

export function ShareModal({ opened, onClose, render, makeViewLink, link }: Props) {
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [linkKind, setLinkKind] = useState<'view' | 'explore'>('view');
  const [image, setImage] = useState<RenderedImage | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Guards against a slow render finishing after the modal was closed or reopened.
  const runRef = useRef(0);

  async function make() {
    const run = ++runRef.current;
    setLoading(true);
    setError(null);
    try {
      const img = await render();
      if (run !== runRef.current) return;
      setImage(img);
      setUrl(URL.createObjectURL(img.files.png.blob));
    } catch (e) {
      if (run !== runRef.current) return;
      setError(e instanceof Error ? e.message : 'The image could not be made.');
    } finally {
      if (run === runRef.current) setLoading(false);
    }
  }

  // The view link is made fresh each time, from the maps as they are now.
  useEffect(() => {
    if (!opened) return;
    setViewUrl(null);
    setLinkKind('view');
    makeViewLink().then(setViewUrl, () => setViewUrl(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  useEffect(() => {
    if (opened) void make();
    else {
      runRef.current++;
      setImage(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  // Free the preview's object URL when it's replaced or the modal closes.
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  useEffect(() => {
    if (!opened) setUrl(null);
  }, [opened]);

  const shownUrl = linkKind === 'explore' && link ? link.url : viewUrl;

  async function copyLink() {
    if (!shownUrl) return;
    try {
      await navigator.clipboard.writeText(shownUrl);
      notifications.show({
        title: 'Link copied',
        message: linkKind === 'explore' && link ? `Opens "${link.title}" on MapCompare.` : 'Opens this view on MapCompare.',
        color: 'blue',
      });
    } catch {
      notifications.show({ title: 'Copy failed', message: 'The browser blocked the clipboard. Select the link and copy it.', color: 'red' });
    }
  }

  async function copy() {
    if (!image) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': image.files.png.blob })]);
      notifications.show({ title: 'Copied', message: 'The image is on your clipboard. Paste it anywhere.', color: 'blue' });
    } catch {
      notifications.show({ title: 'Copy failed', message: 'The browser blocked the clipboard. Use Download instead.', color: 'red' });
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={700}>Share</Text>} size={880} centered>
      <Stack gap="sm">
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          Image
        </Text>

        <div className="share-preview">
          {loading && (
            <Center h={320}>
              <Loader size="sm" />
            </Center>
          )}
          {!loading && error && (
            <Alert color="red" variant="light" icon={<LuX size={16} />} m="sm">
              {error}{' '}
              <Button size="compact-xs" variant="subtle" onClick={() => void make()}>
                Try again
              </Button>
            </Alert>
          )}
          {!loading && !error && url && <img src={url} alt="Preview of the image to download" />}
        </div>

        <Group justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed">
            {image ? imageInfo(image.width, image.height) : ' '}
          </Text>
          <Group gap="xs" wrap="nowrap">
            {canCopyImage && (
              <Button variant="default" size="xs" leftSection={<LuCopy size={14} />} onClick={copy} disabled={!image}>
                Copy image
              </Button>
            )}
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <Button
                  size="xs"
                  leftSection={<LuDownload size={14} />}
                  rightSection={<LuChevronDown size={14} />}
                  disabled={!image}
                >
                  Download
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {FORMATS.map(({ format, label, hint }) => (
                  <Menu.Item
                    key={format}
                    onClick={() => image && downloadBlob(image.files[format].blob, image.files[format].fileName)}
                    rightSection={
                      <Text size="xs" c="dimmed">
                        {image ? fileSize(image.files[format].blob.size) : ''}
                      </Text>
                    }
                  >
                    <Text size="sm">{label}</Text>
                    <Text size="xs" c="dimmed">
                      {hint}
                    </Text>
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>

        <Divider my={4} />
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          Link
        </Text>
        {link && (
          <SegmentedControl
            size="xs"
            value={linkKind}
            onChange={(v) => setLinkKind(v as 'view' | 'explore')}
            data={[
              { value: 'view', label: 'This view' },
              { value: 'explore', label: 'Explore comparison' },
            ]}
          />
        )}
        <Group gap="xs" wrap="nowrap">
          <TextInput
            size="xs"
            style={{ flex: 1 }}
            value={shownUrl ?? ''}
            placeholder="Making the link…"
            readOnly
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Link to share"
          />
          <Button size="xs" variant="default" leftSection={<LuLink size={14} />} onClick={copyLink} disabled={!shownUrl}>
            Copy link
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          {linkKind === 'explore' && link
            ? `Opens “${link.title}” as it’s saved in Explore, so changes you’ve made since opening it aren’t included.`
            : 'Opens exactly what’s on screen: both maps, the split, layers and shapes. The view is stored in the link itself, so it’s long but needs no account.'}
        </Text>
      </Stack>
    </Modal>
  );
}
