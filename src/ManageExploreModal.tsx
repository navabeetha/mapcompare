import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  LuArrowDown,
  LuArrowLeft,
  LuArrowRight,
  LuArrowUp,
  LuCheck,
  LuCopy,
  LuEye,
  LuPencil,
  LuTrash2,
  LuUpload,
  LuX,
} from 'react-icons/lu';
import { displayTitle, type Project } from './projects';
import {
  describeChanges,
  fetchPublished,
  getToken,
  moveItem,
  publishItem,
  PublishError,
  removeItem,
  renameItem,
  REPO,
  savePublished,
  serializeComparisons,
  setToken,
  type RemoteList,
} from './publish';

/**
 * Manage Explore (author only): drafts in this browser, the published list on
 * GitHub, and the moves between them.
 *
 * Changes to the published list are collected here first and go out together
 * as ONE commit ("Publish changes"), so reordering five rows doesn't start five
 * deploys. Draft changes (rename, delete) apply at once, because they only
 * touch this browser. Changes can be lined up before connecting GitHub; only
 * "Publish changes" needs the token.
 *
 * Layout: drafts on the left, Explore on the right (arrows move between
 * them), and a fixed footer with the GitHub connection and Publish.
 */
interface Props {
  opened: boolean;
  onClose: () => void;
  drafts: Project[];
  onDraftsChange: (next: Project[]) => void;
  /** The published list this deploy was built with (or the latest publish). */
  published: Project[];
  onPublished: (next: Project[]) => void;
  /** Opens a comparison on the maps (the modal closes first). */
  onOpen: (p: Project) => void;
}

const TOKEN_HELP = 'https://github.com/settings/personal-access-tokens/new';

export function ManageExploreModal(p: Props) {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [tokenInput, setTokenInput] = useState('');
  const [remote, setRemote] = useState<RemoteList | null>(null);
  const [working, setWorking] = useState<Project[]>(p.published);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; where: 'pub' | 'draft'; value: string } | null>(null);
  const [confirming, setConfirming] = useState<{ id: string; where: 'pub' | 'draft' } | null>(null);

  const base = remote?.list ?? p.published;
  const dirty = serializeComparisons(base) !== serializeComparisons(working);

  async function load(t: string) {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchPublished(t);
      setRemote(r);
      // Edits made before connecting were made on the list this page was
      // built with. Keep them only if GitHub still has that same list;
      // otherwise start again from what's really published.
      setWorking((w) => {
        const unchanged = serializeComparisons(w) === serializeComparisons(p.published);
        const sameBase = serializeComparisons(r.list) === serializeComparisons(p.published);
        if (unchanged || !sameBase) {
          if (!unchanged) setError('Explore changed on GitHub since this page loaded, so your unpublished changes were reset.');
          return r.list;
        }
        return w;
      });
    } catch (e) {
      setRemote(null);
      setError(e instanceof PublishError ? e.message : "Couldn't reach GitHub. Check your connection.");
      // An expired or revoked token is useless; drop it so the box comes
      // back for a new one.
      if (e instanceof PublishError && e.tokenRejected) {
        setToken(null);
        setTokenState(null);
      }
    } finally {
      setLoading(false);
    }
  }

  // Each time it opens: start from the live GitHub list when connected, so
  // edits are made on top of what's really published.
  useEffect(() => {
    if (!p.opened) return;
    setRenaming(null);
    setConfirming(null);
    setWorking(p.published);
    if (token) void load(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.opened]);

  function connect() {
    const t = tokenInput.trim();
    if (!t) return;
    setToken(t);
    setTokenState(t);
    setTokenInput('');
    void load(t);
  }
  function forget() {
    setToken(null);
    setTokenState(null);
    setRemote(null);
    setWorking(p.published);
    setError(null);
  }

  async function publishChanges() {
    if (!token || !remote) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await savePublished(token, remote, working);
      setRemote(saved);
      p.onPublished(saved.list);
      notifications.show({
        title: 'Published',
        message: 'Saved to GitHub. The public site updates in about 1–2 minutes.',
        color: 'green',
      });
    } catch (e) {
      setError(e instanceof PublishError ? e.message : "Couldn't reach GitHub. Nothing was published.");
    } finally {
      setSaving(false);
    }
  }

  function copyJson() {
    navigator.clipboard
      .writeText(serializeComparisons(working))
      .then(() => notifications.show({ title: 'Copied', message: 'The published list, as JSON.', color: 'blue' }))
      .catch(() => notifications.show({ title: 'Copy failed', message: 'The browser blocked the clipboard.', color: 'red' }));
  }

  // ---------------------------------------------------------------- rows

  const publishedIds = new Set(working.map((x) => x.id));

  function titleCell(item: Project, where: 'pub' | 'draft') {
    if (renaming && renaming.id === item.id && renaming.where === where) {
      const done = () => {
        if (where === 'pub') setWorking((w) => renameItem(w, item.id, renaming.value));
        else p.onDraftsChange(renameItem(p.drafts, item.id, renaming.value));
        setRenaming(null);
      };
      return (
        <Group gap={4} wrap="nowrap" style={{ flex: 1 }}>
          <TextInput
            size="xs"
            style={{ flex: 1 }}
            value={renaming.value}
            autoFocus
            onChange={(e) => setRenaming({ ...renaming, value: e.currentTarget.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') done();
              if (e.key === 'Escape') {
                e.stopPropagation();
                setRenaming(null);
              }
            }}
          />
          <ActionIcon size="sm" variant="subtle" onClick={done} aria-label="Save name">
            <LuCheck size={14} />
          </ActionIcon>
        </Group>
      );
    }
    return (
      <Text size="sm" style={{ flex: 1 }} lineClamp={1}>
        {displayTitle(item.title)}
      </Text>
    );
  }

  function confirmDelete(item: Project, where: 'pub' | 'draft') {
    return (
      <Group gap={4} wrap="nowrap">
        <Text size="xs" c="red">
          {where === 'pub' ? 'Remove from Explore?' : 'Delete draft?'}
        </Text>
        <Button
          size="compact-xs"
          color="red"
          onClick={() => {
            if (where === 'pub') setWorking((w) => removeItem(w, item.id));
            else p.onDraftsChange(removeItem(p.drafts, item.id));
            setConfirming(null);
          }}
        >
          Yes
        </Button>
        <Button size="compact-xs" variant="default" onClick={() => setConfirming(null)}>
          No
        </Button>
      </Group>
    );
  }

  const icon = (label: string, Icon: typeof LuEye, onClick: () => void, disabled = false) => (
    <Tooltip label={label} withArrow openDelay={300}>
      <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClick} disabled={disabled} aria-label={label}>
        <Icon size={14} />
      </ActionIcon>
    </Tooltip>
  );

  const open = (item: Project) => {
    p.onClose();
    p.onOpen(item);
  };

  const changeCount = describeChanges(base, working) === 'Explore: no changes' ? 0 : describeChanges(base, working).split(', ').length;

  return (
    // Fixed title bar and footer, scrolling middle (same pattern as Welcome).
    <Modal.Root opened={p.opened} onClose={p.onClose} size={920} centered>
      <Modal.Overlay />
      <Modal.Content className="fixed-modal">
        <Modal.Header>
          <Modal.Title>
            <Text fw={700}>Manage Explore</Text>
          </Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body className="fixed-modal-body">
          {error && (
            <Alert color="red" variant="light" mb="sm" icon={<LuX size={16} />}>
              {error}
            </Alert>
          )}
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
            {/* ------------------------------------------ Drafts (left) */}
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={6}>
                Your drafts · this browser only
              </Text>
              <Stack gap={2}>
                {p.drafts.length === 0 && (
                  <Text size="sm" c="dimmed">
                    No drafts. Set up a comparison and use Menu → Save view.
                  </Text>
                )}
                {p.drafts.map((item) => (
                  <Group key={item.id} gap={4} wrap="nowrap" className="manage-row">
                    {titleCell(item, 'draft')}
                    {publishedIds.has(item.id) && (
                      <Badge size="xs" variant="light">
                        In Explore
                      </Badge>
                    )}
                    {confirming?.id === item.id && confirming.where === 'draft' ? (
                      confirmDelete(item, 'draft')
                    ) : (
                      <>
                        {icon('Open on the maps', LuEye, () => open(item))}
                        {icon('Rename', LuPencil, () => setRenaming({ id: item.id, where: 'draft', value: item.title }))}
                        {icon('Delete draft', LuTrash2, () => setConfirming({ id: item.id, where: 'draft' }))}
                        {icon(
                          publishedIds.has(item.id) ? 'Update the copy in Explore' : 'Add to Explore',
                          LuArrowRight,
                          () => setWorking((w) => publishItem(w, item)),
                          saving,
                        )}
                      </>
                    )}
                  </Group>
                ))}
              </Stack>
            </div>

            {/* ------------------------------------------ Published (right) */}
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={6}>
                In Explore · what everyone sees
              </Text>
              <Stack gap={2}>
                {working.length === 0 && (
                  <Text size="sm" c="dimmed">
                    Nothing in Explore. The public page needs at least one comparison to open on.
                  </Text>
                )}
                {working.map((item, i) => (
                  <Group key={item.id} gap={4} wrap="nowrap" className="manage-row">
                    {confirming?.id === item.id && confirming.where === 'pub' ? null : (
                      icon(
                        'Move back to drafts (takes it out of Explore)',
                        LuArrowLeft,
                        () => {
                          if (!p.drafts.some((d) => d.id === item.id)) p.onDraftsChange([item, ...p.drafts]);
                          setWorking((w) => removeItem(w, item.id));
                        },
                        saving,
                      )
                    )}
                    {titleCell(item, 'pub')}
                    {confirming?.id === item.id && confirming.where === 'pub' ? (
                      confirmDelete(item, 'pub')
                    ) : (
                      <>
                        {icon('Open on the maps', LuEye, () => open(item))}
                        {icon('Rename', LuPencil, () => setRenaming({ id: item.id, where: 'pub', value: item.title }), saving)}
                        {icon('Move up', LuArrowUp, () => setWorking((w) => moveItem(w, item.id, -1)), saving || i === 0)}
                        {icon('Move down', LuArrowDown, () => setWorking((w) => moveItem(w, item.id, 1)), saving || i === working.length - 1)}
                        {icon('Remove from Explore', LuTrash2, () => setConfirming({ id: item.id, where: 'pub' }), saving)}
                      </>
                    )}
                  </Group>
                ))}
              </Stack>
            </div>
          </SimpleGrid>
        </Modal.Body>

        {/* ------------------------------------------------ Footer */}
        <Group className="fixed-modal-footer" justify="space-between" wrap="nowrap" align="center">
          {token ? (
            <Group gap={8} wrap="nowrap">
              <Badge size="sm" color={remote ? 'green' : 'gray'} variant="dot">
                {remote ? 'GitHub connected' : loading ? 'Connecting…' : 'Not connected'}
              </Badge>
              <Button size="compact-xs" variant="subtle" color="gray" onClick={() => token && load(token)} loading={loading}>
                Reload
              </Button>
              <Tooltip label="Removes the token from this browser. Paste a new one to reconnect." withArrow>
                <Button size="compact-xs" variant="subtle" color="red" onClick={forget}>
                  Forget token
                </Button>
              </Tooltip>
              <Tooltip label="Copy the Explore list as JSON (backup)" withArrow>
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={copyJson} aria-label="Copy list as JSON">
                  <LuCopy size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          ) : (
            <Group gap={6} wrap="nowrap" style={{ flex: 1, maxWidth: 520 }}>
              {/* A plain password field with no show button: the token is never
                  shown on screen, here or after connecting. */}
              <TextInput
                type="password"
                size="xs"
                style={{ flex: 1 }}
                placeholder="Paste your GitHub token to publish"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && connect()}
                autoComplete="off"
                aria-label="GitHub token"
              />
              <Button size="xs" onClick={connect} disabled={!tokenInput.trim()}>
                Connect
              </Button>
              <Tooltip
                multiline
                w={300}
                withArrow
                label={`A one-time key from GitHub that lets this page save the Explore list to ${REPO}. Create it with Contents: read and write on that repo only. It stays in this browser.`}
              >
                <Anchor href={TOKEN_HELP} target="_blank" rel="noreferrer" size="xs">
                  Get a token
                </Anchor>
              </Tooltip>
            </Group>
          )}
          <Group gap={6} wrap="nowrap">
            {dirty && (
              <Text size="xs" c="yellow">
                {changeCount} change{changeCount === 1 ? '' : 's'} not live yet
              </Text>
            )}
            <Button size="xs" variant="default" onClick={() => setWorking(base)} disabled={!dirty || saving}>
              Discard
            </Button>
            <Tooltip label="Connect GitHub first (bottom left)" disabled={!!remote} withArrow>
              <Button
                size="xs"
                leftSection={<LuUpload size={14} />}
                onClick={publishChanges}
                loading={saving}
                disabled={!dirty || !remote || working.length === 0}
              >
                Publish changes
              </Button>
            </Tooltip>
          </Group>
        </Group>
      </Modal.Content>
    </Modal.Root>
  );
}
