import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Center, Group, Loader, Modal, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { LuCopy, LuDownload, LuX } from 'react-icons/lu';
import { downloadBlob, type RenderedImage } from './exportImage';
import { imageInfo } from './exportLayout';

/**
 * Share (header button). For now one section, Image: a preview of the PNG
 * (exportImage.ts) with Copy image and Download. The download is the very
 * file previewed, not a second render. Later sections slot in below it, e.g.
 * a link or embed code, or more image formats.
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
}

/** Copying an image needs the async clipboard and ClipboardItem (most modern browsers). */
const canCopyImage = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;

export function ShareModal({ opened, onClose, render }: Props) {
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
      setUrl(URL.createObjectURL(img.blob));
    } catch (e) {
      if (run !== runRef.current) return;
      setError(e instanceof Error ? e.message : 'The image could not be made.');
    } finally {
      if (run === runRef.current) setLoading(false);
    }
  }

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

  async function copy() {
    if (!image) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': image.blob })]);
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
            {image ? imageInfo(image.width, image.height, image.blob.size) : ' '}
          </Text>
          <Group gap="xs" wrap="nowrap">
            {canCopyImage && (
              <Button variant="default" size="xs" leftSection={<LuCopy size={14} />} onClick={copy} disabled={!image}>
                Copy image
              </Button>
            )}
            <Button
              size="xs"
              leftSection={<LuDownload size={14} />}
              onClick={() => image && downloadBlob(image.blob, image.fileName)}
              disabled={!image}
            >
              Download
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
