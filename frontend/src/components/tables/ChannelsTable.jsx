import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table';
import useChannelsStore from '../../store/channels';
import { notifications } from '@mantine/notifications';
import {
  Add as AddIcon,
  LiveTv as LiveTvIcon,
  ContentCopy,
  IndeterminateCheckBox,
  CompareArrows,
  Code,
  AddBox,
} from '@mui/icons-material';
import API from '../../api';
import ChannelForm from '../forms/Channel';
import { TableHelper } from '../../helpers';
import utils from '../../utils';
import logo from '../../images/logo.png';
import useVideoStore from '../../store/useVideoStore';
import useSettingsStore from '../../store/settings';
import usePlaylistsStore from '../../store/playlists';
import {
  Tv2,
  ScreenShare,
  Scroll,
  SquareMinus,
  CirclePlay,
  SquarePen,
  Binary,
  ArrowDown01,
  SquarePlus,
} from 'lucide-react';
import ghostImage from '../../images/ghost.svg';
import {
  Box,
  TextInput,
  Popover,
  ActionIcon,
  Select,
  Button,
  Paper,
  Flex,
  Text,
  Tooltip,
  Grid,
  Group,
  useMantineTheme,
  Center,
  Container,
} from '@mantine/core';

const ChannelStreams = ({ channel, isExpanded }) => {
  const channelStreams = useChannelsStore(
    (state) => state.channels[channel.id]?.streams
  );
  const { playlists } = usePlaylistsStore();

  const removeStream = async (stream) => {
    const newStreamList = channelStreams.filter((s) => s.id !== stream.id);
    await API.updateChannel({
      ...channel,
      stream_ids: newStreamList.map((s) => s.id),
    });
  };

  const channelStreamsTable = useMantineReactTable({
    ...TableHelper.defaultProperties,
    data: channelStreams,
    columns: useMemo(
      () => [
        {
          header: 'Name',
          accessorKey: 'name',
        },
        {
          header: 'M3U',
          accessorFn: (row) =>
            playlists.find((playlist) => playlist.id === row.m3u_account)?.name,
        },
      ],
      [playlists]
    ),
    enableKeyboardShortcuts: false,
    enableColumnFilters: false,
    enableBottomToolbar: false,
    enableTopToolbar: false,
    columnFilterDisplayMode: 'popover',
    enablePagination: false,
    enableRowVirtualization: true,
    enableColumnHeaders: false,
    rowVirtualizerOptions: { overscan: 5 }, //optionally customize the row virtualizer
    initialState: {
      density: 'compact',
    },
    enableRowActions: true,
    enableRowOrdering: true,
    mantineRowDragHandleProps: ({ table }) => ({
      onDragEnd: async () => {
        const { draggingRow, hoveredRow } = table.getState();

        if (hoveredRow && draggingRow) {
          channelStreams.splice(
            hoveredRow.index,
            0,
            channelStreams.splice(draggingRow.index, 1)[0]
          );

          const { streams: _, ...channelUpdate } = channel;

          API.updateChannel({
            ...channelUpdate,
            stream_ids: channelStreams.map((stream) => stream.id),
          });
        }
      },
    }),
    renderRowActions: ({ row }) => (
      <Tooltip label="Remove stream">
        <ActionIcon
          size="sm"
          color="red.9"
          variant="transparent"
          onClick={() => removeStream(row.original)}
        >
          <SquareMinus size="18" fontSize="small" />
        </ActionIcon>
      </Tooltip>
    ),
  });

  if (!isExpanded) {
    return <></>;
  }

  return <MantineReactTable table={channelStreamsTable} />;
};

const m3uUrl = `${window.location.protocol}//${window.location.host}/output/m3u`;
const epgUrl = `${window.location.protocol}//${window.location.host}/output/epg`;
const hdhrUrl = `${window.location.protocol}//${window.location.host}/output/hdhr`;

const ChannelsTable = ({}) => {
  const [channel, setChannel] = useState(null);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState([]);
  const [channelGroupOptions, setChannelGroupOptions] = useState([]);

  const [textToCopy, setTextToCopy] = useState('');

  const [filterValues, setFilterValues] = useState({});

  // const theme = useTheme();
  const theme = useMantineTheme();

  const { showVideo } = useVideoStore();
  const {
    channels,
    isLoading: channelsLoading,
    fetchChannels,
    setChannelsPageSelection,
  } = useChannelsStore();

  useEffect(() => {
    setChannelGroupOptions([
      ...new Set(
        Object.values(channels).map((channel) => channel.channel_group?.name)
      ),
    ]);
  }, [channels]);

  const handleFilterChange = (columnId, value) => {
    console.log(columnId);
    console.log(value);
    setFilterValues((prev) => ({
      ...prev,
      [columnId]: value ? value.toLowerCase() : '',
    }));
  };

  const hdhrUrlRef = useRef(null);
  const m3uUrlRef = useRef(null);
  const epgUrlRef = useRef(null);

  const {
    environment: { env_mode },
  } = useSettingsStore();

  // Configure columns
  const columns = useMemo(
    () => [
      {
        header: '#',
        size: 50,
        accessorKey: 'channel_number',
      },
      {
        header: 'Name',
        accessorKey: 'channel_name',
        mantineTableHeadCellProps: {
          sx: { textAlign: 'center' },
        },
        Header: ({ column }) => (
          <TextInput
            name="name"
            placeholder="Name"
            value={filterValues[column.id]}
            onChange={(e) => {
              e.stopPropagation();
              handleFilterChange(column.id, e.target.value);
            }}
            size="xs"
          />
        ),
        Cell: ({ cell }) => (
          <div
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {cell.getValue()}
          </div>
        ),
      },
      {
        header: 'Group',
        accessorFn: (row) => row.channel_group?.name || '',
        Header: ({ column }) => (
          <Select
            placeholder="Group"
            searchable
            size="xs"
            nothingFound="No options"
            onChange={(e, value) => {
              e.stopPropagation();
              handleGroupChange(value);
            }}
            data={channelGroupOptions}
          />
        ),
      },
      {
        header: 'Logo',
        accessorKey: 'logo_url',
        enableSorting: false,
        size: 55,
        Cell: ({ cell }) => (
          <Grid
            container
            direction="row"
            sx={{
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <img src={cell.getValue() || logo} width="20" alt="channel logo" />
          </Grid>
        ),
        meta: {
          filterVariant: null,
        },
      },
    ],
    [channelGroupOptions, filterValues]
  );

  // Access the row virtualizer instance (optional)
  const rowVirtualizerInstanceRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [sorting, setSorting] = useState([]);

  const editChannel = async (ch = null) => {
    setChannel(ch);
    setChannelModalOpen(true);
  };

  const deleteChannel = async (id) => {
    await API.deleteChannel(id);
  };

  function handleWatchStream(channelNumber) {
    let vidUrl = `/output/stream/${channelNumber}/`;
    if (env_mode == 'dev') {
      vidUrl = `${window.location.protocol}//${window.location.hostname}:5656${vidUrl}`;
    }
    showVideo(vidUrl);
  }

  // (Optional) bulk delete, but your endpoint is @TODO
  const deleteChannels = async () => {
    setIsLoading(true);
    const selected = table
      .getRowModel()
      .rows.filter((row) => row.getIsSelected());
    await utils.Limiter(
      4,
      selected.map((chan) => () => deleteChannel(chan.original.id))
    );
    // If you have a real bulk-delete endpoint, call it here:
    // await API.deleteChannels(selected.map((sel) => sel.id));
    setIsLoading(false);
  };

  // ─────────────────────────────────────────────────────────
  // The "Assign Channels" button logic
  // ─────────────────────────────────────────────────────────
  const assignChannels = async () => {
    try {
      // Get row order from the table
      const rowOrder = table.getRowModel().rows.map((row) => row.original.id);

      // Call our custom API endpoint
      setIsLoading(true);
      const result = await API.assignChannelNumbers(rowOrder);
      setIsLoading(false);

      // We might get { message: "Channels have been auto-assigned!" }
      notifications.show({
        title: result.message || 'Channels assigned',
        color: 'green.5',
      });

      // Refresh the channel list
      await fetchChannels();
    } catch (err) {
      console.error(err);
      notifications.show({
        title: 'Failed to assign channels',
        color: 'red.5',
      });
    }
  };

  // ─────────────────────────────────────────────────────────
  // The new "Match EPG" button logic
  // ─────────────────────────────────────────────────────────
  const matchEpg = async () => {
    try {
      // Hit our new endpoint that triggers the fuzzy matching Celery task
      const resp = await fetch('/api/channels/channels/match-epg/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await API.getAuthToken()}`,
        },
      });

      if (resp.ok) {
        showAlert('EPG matching task started!');
      } else {
        const text = await resp.text();
        showAlert(`Failed to start EPG matching: ${text}`);
      }
    } catch (err) {
      showAlert(`Error: ${err.message}`);
    }
  };

  const closeChannelForm = () => {
    setChannel(null);
    setChannelModalOpen(false);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Scroll to the top of the table when sorting changes
    try {
      rowVirtualizerInstanceRef.current?.scrollToIndex?.(0);
    } catch (error) {
      console.error(error);
    }
  }, [sorting]);

  const handleCopy = async (textToCopy, ref) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      notifications.show({
        title: 'Copied!',
        // style: { width: '200px', left: '200px' },
      });
    } catch (err) {
      const inputElement = ref.current; // Get the actual input
      console.log(inputElement);

      if (inputElement) {
        inputElement.focus();
        inputElement.select();

        // For older browsers
        document.execCommand('copy');
        notifications.show({ title: 'Copied!' });
      }
    }
  };

  // Example copy URLs
  const copyM3UUrl = () => {
    handleCopy(
      `${window.location.protocol}//${window.location.host}/output/m3u`,
      m3uUrlRef
    );
  };
  const copyEPGUrl = () => {
    handleCopy(
      `${window.location.protocol}//${window.location.host}/output/epg`,
      epgUrlRef
    );
  };
  const copyHDHRUrl = () => {
    handleCopy(
      `${window.location.protocol}//${window.location.host}/output/hdhr`,
      hdhrUrlRef
    );
  };

  useEffect(() => {
    const selectedRows = table
      .getSelectedRowModel()
      .rows.map((row) => row.original);
    setChannelsPageSelection(selectedRows);
  }, [rowSelection]);

  const filteredData = Object.values(channels).filter((row) =>
    columns.every(({ accessorKey }) =>
      filterValues[accessorKey]
        ? row[accessorKey]?.toLowerCase().includes(filterValues[accessorKey])
        : true
    )
  );

  const table = useMantineReactTable({
    ...TableHelper.defaultProperties,
    columns,
    data: filteredData,
    enablePagination: false,
    enableColumnActions: false,
    enableRowVirtualization: true,
    enableRowSelection: true,
    renderTopToolbar: false,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    state: {
      isLoading: isLoading || channelsLoading,
      sorting,
      rowSelection,
    },
    rowVirtualizerInstanceRef,
    rowVirtualizerOptions: { overscan: 5 },
    initialState: {
      density: 'compact',
    },
    enableRowActions: true,
    enableExpandAll: false,
    displayColumnDefOptions: {
      'mrt-row-select': {
        size: 20,
      },
      'mrt-row-expand': {
        size: 10,
        header: '',
      },
      'mrt-row-actions': {
        size: 74,
      },
    },
    mantineExpandButtonProps: ({ row, table }) => ({
      onClick: () => {
        setRowSelection({ [row.index]: true });
        table.setExpanded({ [row.id]: !row.getIsExpanded() });
      },
      size: 'xs',
      style: {
        transform: row.getIsExpanded() ? 'rotate(180deg)' : 'rotate(-90deg)',
        transition: 'transform 0.2s',
      },
    }),
    renderDetailPanel: ({ row }) => (
      <ChannelStreams channel={row.original} isExpanded={row.getIsExpanded()} />
    ),
    renderRowActions: ({ row }) => (
      <Box sx={{ justifyContent: 'right' }}>
        <Center>
          <Tooltip label="Edit Channel">
            <ActionIcon
              size="sm"
              variant="transparent"
              color="yellow.5"
              onClick={() => {
                editChannel(row.original);
              }}
            >
              <SquarePen size="18" />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Delete Channel">
            <ActionIcon
              size="sm"
              variant="transparent"
              color="red.9"
              onClick={() => deleteChannel(row.original.id)}
            >
              <SquareMinus size="18" />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Preview Channel">
            <ActionIcon
              size="sm"
              variant="transparent"
              color="green.5"
              onClick={() => handleWatchStream(row.original.channel_number)}
            >
              <CirclePlay size="18" />
            </ActionIcon>
          </Tooltip>
        </Center>
      </Box>
    ),
    mantineTableContainerProps: {
      style: {
        height: 'calc(100vh - 127px)',
        overflowY: 'auto',
      },
    },
  });

  return (
    <Box>
      {/* Header Row: outside the Paper */}
      <Flex
        style={{ display: 'flex', alignItems: 'center', paddingBottom: 10 }}
        gap={15}
      >
        <Text
          w={88}
          h={24}
          style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 500,
            fontSize: '20px',
            lineHeight: 1,
            letterSpacing: '-0.3px',
            color: 'gray.6', // Adjust this to match MUI's theme.palette.text.secondary
            marginBottom: 0,
          }}
        >
          Channels
        </Text>
        <Flex
          style={{
            display: 'flex',
            alignItems: 'center',
            marginLeft: 10,
          }}
        >
          <Text
            w={37}
            h={17}
            style={{
              fontFamily: 'Inter, sans-serif',
              fontWeight: 400,
              fontSize: '14px',
              lineHeight: 1,
              letterSpacing: '-0.3px',
              color: 'gray.6', // Adjust this to match MUI's theme.palette.text.secondary
            }}
          >
            Links:
          </Text>

          <Group gap={5} style={{ paddingLeft: 10 }}>
            <Popover withArrow shadow="md">
              <Popover.Target>
                <Button
                  leftSection={<Tv2 size={18} />}
                  size="compact-sm"
                  p={5}
                  color="green"
                  variant="subtle"
                  style={{
                    borderColor: theme.palette.custom.greenMain,
                    color: theme.palette.custom.greenMain,
                  }}
                >
                  HDHR
                </Button>
              </Popover.Target>
              <Popover.Dropdown>
                <Group>
                  <TextInput ref={hdhrUrlRef} value={hdhrUrl} size="small" />
                  <ActionIcon
                    onClick={copyHDHRUrl}
                    size="sm"
                    variant="transparent"
                    color="gray.5"
                  >
                    <ContentCopy size="18" fontSize="small" />
                  </ActionIcon>
                </Group>
              </Popover.Dropdown>
            </Popover>

            <Popover withArrow shadow="md">
              <Popover.Target>
                <Button
                  leftSection={<ScreenShare size={18} />}
                  size="compact-sm"
                  p={5}
                  variant="subtle"
                  style={{
                    borderColor: theme.palette.custom.indigoMain,
                    color: theme.palette.custom.indigoMain,
                  }}
                >
                  M3U
                </Button>
              </Popover.Target>
              <Popover.Dropdown>
                <Group>
                  <TextInput ref={m3uUrlRef} value={m3uUrl} size="small" />
                  <ActionIcon
                    onClick={copyM3UUrl}
                    size="sm"
                    variant="transparent"
                    color="gray.5"
                  >
                    <ContentCopy size="18" fontSize="small" />
                  </ActionIcon>
                </Group>
              </Popover.Dropdown>
            </Popover>

            <Popover withArrow shadow="md">
              <Popover.Target>
                <Button
                  leftSection={<Scroll size={18} />}
                  size="compact-sm"
                  p={5}
                  variant="subtle"
                  color="gray.5"
                  style={{
                    borderColor: theme.palette.custom.greyBorder,
                    color: theme.palette.custom.greyBorder,
                  }}
                >
                  EPG
                </Button>
              </Popover.Target>
              <Popover.Dropdown>
                <Group>
                  <TextInput ref={epgUrlRef} value={epgUrl} size="small" />
                  <ActionIcon
                    onClick={copyEPGUrl}
                    size="sm"
                    variant="transparent"
                    color="gray.5"
                  >
                    <ContentCopy size="18" fontSize="small" />
                  </ActionIcon>
                </Group>
              </Popover.Dropdown>
            </Popover>
          </Group>
        </Flex>
      </Flex>

      {/* Paper container: contains top toolbar and table (or ghost state) */}
      <Paper
        style={{
          // bgcolor: theme.palette.background.paper,
          // borderRadius: 2,
          // overflow: 'hidden',
          // display: 'flex',
          // flexDirection: 'column',
          height: 'calc(100vh - 75px)',
        }}
      >
        {/* Top toolbar with Remove, Assign, Auto-match, and Add buttons */}
        <Box
          style={{
            display: 'flex',
            // alignItems: 'center',
            // backgroundColor: theme.palette.background.paper,
            justifyContent: 'flex-end',
            padding: 10,
            // gap: 1,
          }}
        >
          <Flex gap={6}>
            <Button
              leftSection={<SquareMinus size={18} />}
              variant="default"
              size="xs"
              onClick={deleteChannels}
            >
              Remove
            </Button>

            <Tooltip label="Assign Channel #s">
              <Button
                leftSection={<ArrowDown01 size={18} />}
                variant="default"
                size="xs"
                onClick={assignChannels}
                p={5}
              >
                Assign
              </Button>
            </Tooltip>

            <Tooltip label="Auto-Match EPG">
              <Button
                leftSection={<Binary size={18} />}
                variant="default"
                size="xs"
                onClick={matchEpg}
                p={5}
              >
                Auto-Match
              </Button>
            </Tooltip>

            <Button
              leftSection={<SquarePlus size={18} />}
              variant="light"
              size="xs"
              onClick={() => editChannel()}
              p={5}
              color="green"
              style={{
                borderWidth: '1px',
                borderColor: 'green',
                color: 'white',
              }}
            >
              Add
            </Button>
          </Flex>
        </Box>

        {/* Table or ghost empty state inside Paper */}
        <Box style={{ height: '100%', width: '100%' }}>
          {filteredData.length === 0 && (
            <Box
              style={{
                paddingTop: 20,
                bgcolor: theme.palette.background.paper,
              }}
            >
              <Center>
                <Box
                  style={{
                    textAlign: 'center',
                    width: '55%',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 400,
                      fontSize: '20px',
                      lineHeight: '28px',
                      letterSpacing: '-0.3px',
                      color: theme.palette.text.secondary,
                      mb: 1,
                    }}
                  >
                    It’s recommended to create channels after adding your M3U or
                    streams.
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 400,
                      fontSize: '16px',
                      lineHeight: '24px',
                      letterSpacing: '-0.2px',
                      color: theme.palette.text.secondary,
                      mb: 2,
                    }}
                  >
                    You can still create channels without streams if you’d like,
                    and map them later.
                  </Text>
                  <Button
                    leftSection={<SquarePlus size={18} />}
                    variant="light"
                    size="xs"
                    onClick={() => editChannel()}
                    color="gray"
                    style={{
                      marginTop: 20,
                      borderWidth: '1px',
                      borderColor: 'gray',
                      color: 'white',
                    }}
                  >
                    Create Channel
                  </Button>
                </Box>
              </Center>

              <Center>
                <Box
                  component="img"
                  src={ghostImage}
                  alt="Ghost"
                  style={{
                    paddingTop: 30,
                    width: '120px',
                    height: 'auto',
                    opacity: 0.2,
                    pointerEvents: 'none',
                  }}
                />
              </Center>
            </Box>
          )}
        </Box>
        {filteredData.length > 0 && <MantineReactTable table={table} />}
      </Paper>

      <ChannelForm
        channel={channel}
        isOpen={channelModalOpen}
        onClose={closeChannelForm}
      />
    </Box>
  );
};

export default ChannelsTable;
