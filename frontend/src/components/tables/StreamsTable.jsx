import { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table';
import API from '../../api';
import { TableHelper } from '../../helpers';
import StreamForm from '../forms/Stream';
import usePlaylistsStore from '../../store/playlists';
import useChannelsStore from '../../store/channels';
import { useDebounce } from '../../utils';
import {
  SquarePlus,
  ListPlus,
  SquareMinus,
  EllipsisVertical,
} from 'lucide-react';
import {
  TextInput,
  ActionIcon,
  Select,
  Tooltip,
  Menu,
  Flex,
  Box,
  Text,
  Paper,
  Button,
  Card,
  Stack,
  Title,
  Divider,
  Center,
  Pagination,
  Group,
  NumberInput,
  NativeSelect,
  MultiSelect,
  useMantineTheme,
} from '@mantine/core';
import { IconSquarePlus } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import useSettingsStore from '../../store/settings';
import useVideoStore from '../../store/useVideoStore';
import useChannelsTableStore from '../../store/channelsTable';

const StreamsTable = ({}) => {
  const theme = useMantineTheme();

  /**
   * useState
   */
  const [rowSelection, setRowSelection] = useState([]);
  const [stream, setStream] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [groupOptions, setGroupOptions] = useState([]);
  const [initialDataCount, setInitialDataCount] = useState(null);

  const [data, setData] = useState([]); // Holds fetched data
  const [rowCount, setRowCount] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [paginationString, setPaginationString] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sorting, setSorting] = useState([{ id: 'name', desc: '' }]);
  const [selectedStreamIds, setSelectedStreamIds] = useState([]);
  // const [allRowsSelected, setAllRowsSelected] = useState(false);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 250,
  });
  const [filters, setFilters] = useState({
    name: '',
    channel_group: '',
    m3u_account: '',
  });
  const debouncedFilters = useDebounce(filters, 500);

  const navigate = useNavigate();

  /**
   * Stores
   */
  const playlists = usePlaylistsStore((s) => s.playlists);

  const channelGroups = useChannelsStore((s) => s.channelGroups);
  const selectedChannelIds = useChannelsTableStore((s) => s.selectedChannelIds);
  const fetchLogos = useChannelsStore((s) => s.fetchLogos);
  const channelSelectionStreams = useChannelsTableStore(
    (state) =>
      state.channels.find((chan) => chan.id === selectedChannelIds[0])?.streams
  );
  const env_mode = useSettingsStore((s) => s.environment.env_mode);
  const showVideo = useVideoStore((s) => s.showVideo);

  // Access the row virtualizer instance (optional)
  const rowVirtualizerInstanceRef = useRef(null);

  const handleSelectClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };

  /**
   * useMemo
   */
  const columns = useMemo(
    () => [
      {
        header: 'Name',
        accessorKey: 'name',
        Header: ({ column }) => (
          <TextInput
            name="name"
            placeholder="Name"
            value={filters.name || ''}
            onClick={(e) => e.stopPropagation()}
            onChange={handleFilterChange}
            size="xs"
            variant="unstyled"
            className="table-input-header"
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
        accessorFn: (row) =>
          channelGroups[row.channel_group]
            ? channelGroups[row.channel_group].name
            : '',
        size: 100,
        Header: ({ column }) => (
          <Box onClick={handleSelectClick} style={{ width: '100%' }}>
            <MultiSelect
              placeholder="Group"
              searchable
              size="xs"
              nothingFoundMessage="No options"
              onClick={handleSelectClick}
              onChange={handleGroupChange}
              data={groupOptions}
              variant="unstyled"
              className="table-input-header custom-multiselect"
              clearable
            />
          </Box>
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
        header: 'M3U',
        size: 75,
        accessorFn: (row) =>
          playlists.find((playlist) => playlist.id === row.m3u_account)?.name,
        Header: ({ column }) => (
          <Box onClick={handleSelectClick}>
            <Select
              placeholder="M3U"
              searchable
              size="xs"
              nothingFoundMessage="No options"
              onClick={handleSelectClick}
              onChange={handleM3UChange}
              data={playlists.map((playlist) => ({
                label: playlist.name,
                value: `${playlist.id}`,
              }))}
              variant="unstyled"
              className="table-input-header"
            />
          </Box>
        ),
      },
    ],
    [playlists, groupOptions, filters, channelGroups]
  );

  /**
   * Functions
   */
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleGroupChange = (value) => {
    setFilters((prev) => ({
      ...prev,
      channel_group: value ? value : '',
    }));
  };

  const handleM3UChange = (value) => {
    setFilters((prev) => ({
      ...prev,
      m3u_account: value ? value : '',
    }));
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);

    const params = new URLSearchParams();
    params.append('page', pagination.pageIndex + 1);
    params.append('page_size', pagination.pageSize);

    // Apply sorting
    if (sorting.length > 0) {
      const sortField = sorting[0].id;
      const sortDirection = sorting[0].desc ? '-' : '';
      params.append('ordering', `${sortDirection}${sortField}`);
    }

    // Apply debounced filters
    Object.entries(debouncedFilters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });

    try {
      const result = await API.queryStreams(params);
      setData(result.results);
      setRowCount(result.count);
      setPageCount(Math.ceil(result.count / pagination.pageSize));

      // Calculate the starting and ending item indexes
      const startItem = pagination.pageIndex * pagination.pageSize + 1; // +1 to start from 1, not 0
      const endItem = Math.min(
        (pagination.pageIndex + 1) * pagination.pageSize,
        result.count
      );

      if (initialDataCount === null) {
        setInitialDataCount(result.count);
      }

      // Generate the string
      setPaginationString(`${startItem} to ${endItem} of ${result.count}`);

      const newSelection = {};
      result.results.forEach((item, index) => {
        if (selectedStreamIds.includes(item.id)) {
          newSelection[index] = true;
        }
      });

      // ✅ Only update rowSelection if it's different
      if (JSON.stringify(newSelection) !== JSON.stringify(rowSelection)) {
        setRowSelection(newSelection);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }

    const groups = await API.getStreamGroups();
    setGroupOptions(groups);

    setIsLoading(false);
  }, [pagination, sorting, debouncedFilters]);

  // Fallback: Individual creation (optional)
  const createChannelFromStream = async (stream) => {
    await API.createChannelFromStream({
      name: stream.name,
      channel_number: null,
      stream_id: stream.id,
    });
    await API.requeryChannels();
    fetchLogos();
  };

  // Bulk creation: create channels from selected streams in one API call
  const createChannelsFromStreams = async () => {
    setIsLoading(true);
    await API.createChannelsFromStreams(
      selectedStreamIds.map((stream_id) => ({
        stream_id,
      }))
    );
    await API.requeryChannels();
    fetchLogos();
    setIsLoading(false);
  };

  const editStream = async (stream = null) => {
    setStream(stream);
    setModalOpen(true);
  };

  const deleteStream = async (id) => {
    await API.deleteStream(id);
  };

  const deleteStreams = async () => {
    setIsLoading(true);
    await API.deleteStreams(selectedStreamIds);
    setIsLoading(false);
  };

  const closeStreamForm = () => {
    setStream(null);
    setModalOpen(false);
    fetchData();
  };

  const addStreamsToChannel = async () => {
    await API.updateChannel({
      id: selectedChannelIds[0],
      stream_ids: [
        ...new Set(
          channelSelectionStreams
            .map((stream) => stream.id)
            .concat(selectedStreamIds)
        ),
      ],
    });
    await API.requeryChannels();
  };

  const addStreamToChannel = async (streamId) => {
    await API.updateChannel({
      id: selectedChannelIds[0],
      stream_ids: [
        ...new Set(
          channelSelectionStreams.map((stream) => stream.id).concat([streamId])
        ),
      ],
    });
    await API.requeryChannels();
  };

  const onRowSelectionChange = (updater) => {
    setRowSelection((prevRowSelection) => {
      const newRowSelection =
        typeof updater === 'function' ? updater(prevRowSelection) : updater;

      const updatedSelected = new Set([...selectedStreamIds]);
      table.getRowModel().rows.forEach((row) => {
        if (newRowSelection[row.id] === undefined || !newRowSelection[row.id]) {
          updatedSelected.delete(row.original.id);
        } else {
          updatedSelected.add(row.original.id);
        }
      });
      setSelectedStreamIds([...updatedSelected]);

      return newRowSelection;
    });
  };

  const onSelectAllChange = async (e) => {
    const selectAll = e.target.checked;
    if (selectAll) {
      // Get all stream IDs for current view
      const params = new URLSearchParams();
      Object.entries(debouncedFilters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      const ids = await API.getAllStreamIds(params);
      setSelectedStreamIds(ids);
    } else {
      setSelectedStreamIds([]);
    }

    const newSelection = {};
    table.getRowModel().rows.forEach((item, index) => {
      newSelection[index] = selectAll;
    });
    setRowSelection(newSelection);
  };

  const onPageSizeChange = (e) => {
    setPagination({
      ...pagination,
      pageSize: e.target.value,
    });
  };

  const onPageIndexChange = (pageIndex) => {
    if (!pageIndex || pageIndex > pageCount) {
      return;
    }

    setPagination({
      ...pagination,
      pageIndex: pageIndex - 1,
    });
  };

  const onPaginationChange = (updater) => {
    const newPagination = updater(pagination);
    if (JSON.stringify(newPagination) === JSON.stringify(pagination)) {
      // Prevent infinite re-render when there are no results
      return;
    }

    setPagination(updater);
  };

  function handleWatchStream(streamHash) {
    let vidUrl = `/proxy/ts/stream/${streamHash}`;
    if (env_mode == 'dev') {
      vidUrl = `${window.location.protocol}//${window.location.hostname}:5656${vidUrl}`;
    }
    showVideo(vidUrl);
  }

  const table = useMantineReactTable({
    ...TableHelper.defaultProperties,
    columns,
    data,
    enablePagination: true,
    manualPagination: true,
    enableTopToolbar: false,
    enableRowVirtualization: true,
    renderTopToolbar: () => null, // Removes the entire top toolbar
    renderToolbarInternalActions: () => null,
    rowVirtualizerInstanceRef,
    rowVirtualizerOptions: { overscan: 5 }, //optionally customize the row virtualizer
    enableBottomToolbar: true,
    renderBottomToolbar: ({ table }) => (
      <Group
        gap={5}
        justify="center"
        style={{ padding: 8, borderTop: '1px solid #666' }}
      >
        <Text size="xs">Page Size</Text>
        <NativeSelect
          size="xxs"
          value={pagination.pageSize}
          data={['25', '50', '100', '250', '500', '1000']}
          onChange={onPageSizeChange}
          style={{ paddingRight: 20 }}
        />
        <Pagination
          total={pageCount}
          value={pagination.pageIndex + 1}
          onChange={onPageIndexChange}
          size="xs"
          withEdges
          style={{ paddingRight: 20 }}
        />
        <Text size="xs">{paginationString}</Text>
      </Group>
    ),
    enableStickyHeader: true,
    // onPaginationChange: onPaginationChange,
    rowCount: rowCount,
    enableRowSelection: true,
    mantineSelectAllCheckboxProps: {
      checked: selectedStreamIds.length == rowCount,
      indeterminate:
        selectedStreamIds.length > 0 && selectedStreamIds.length !== rowCount,
      onChange: onSelectAllChange,
      size: 'xs',
    },
    muiPaginationProps: {
      size: 'small',
      rowsPerPageOptions: [25, 50, 100, 250, 500, 1000, 10000],
      labelRowsPerPage: 'Rows per page',
    },
    onSortingChange: setSorting,
    onRowSelectionChange: onRowSelectionChange,
    initialState: {
      density: 'compact',
    },
    state: {
      isLoading,
      sorting,
      // pagination,
      rowSelection,
    },
    enableRowActions: true,
    positionActionsColumn: 'first',

    enableHiding: false,

    // you can still use the custom toolbar callback if you like
    renderTopToolbarCustomActions: ({ table }) => {
      const selectedRowCount = table.getSelectedRowModel().rows.length;
      // optionally do something with selectedRowCount
    },

    renderRowActions: ({ row }) => (
      <>
        <Tooltip label="Add to Channel">
          <ActionIcon
            size="xs"
            color={theme.tailwind.blue[6]}
            variant="transparent"
            onClick={() => addStreamToChannel(row.original.id)}
            style={{ background: 'none' }}
            disabled={
              selectedChannelIds.length !== 1 ||
              (channelSelectionStreams &&
                channelSelectionStreams
                  .map((stream) => stream.id)
                  .includes(row.original.id))
            }
          >
            <ListPlus size="18" fontSize="small" />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Create New Channel">
          <ActionIcon
            size="xs"
            color={theme.tailwind.green[5]}
            variant="transparent"
            onClick={() => createChannelFromStream(row.original)}
          >
            <SquarePlus size="18" fontSize="small" />
          </ActionIcon>
        </Tooltip>

        <Menu>
          <Menu.Target>
            <ActionIcon variant="transparent" size="xs">
              <EllipsisVertical size="18" />
            </ActionIcon>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item
              onClick={() => editStream(row.original)}
              disabled={!row.original.is_custom}
            >
              Edit
            </Menu.Item>
            <Menu.Item
              onClick={() => deleteStream(row.original.id)}
              disabled={!row.original.is_custom}
            >
              Delete Stream
            </Menu.Item>
            <Menu.Item
              onClick={() => handleWatchStream(row.original.stream_hash)}
            >
              Preview Stream
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </>
    ),
    mantineTableContainerProps: {
      style: {
        height: 'calc(100vh - 150px)',
        overflowY: 'auto',
      },
    },
    displayColumnDefOptions: {
      'mrt-row-actions': {
        mantineTableHeadCellProps: {
          align: 'left',
          style: {
            minWidth: '65px',
            maxWidth: '65px',
            paddingLeft: 10,
            fontWeight: 'normal',
            color: 'rgb(207,207,207)',
            backgroundColor: '#3F3F46',
          },
        },
        mantineTableBodyCellProps: {
          style: {
            minWidth: '65px',
            maxWidth: '65px',
            // paddingLeft: 0,
            // paddingRight: 10,
          },
        },
      },
      'mrt-row-select': {
        size: 10,
        maxSize: 10,
        mantineTableHeadCellProps: {
          align: 'right',
          style: {
            paddding: 0,
            // paddingLeft: 7,
            width: '20px',
            minWidth: '20px',
            backgroundColor: '#3F3F46',
          },
        },
        mantineTableBodyCellProps: {
          align: 'right',
          style: {
            paddingLeft: 0,
            width: '20px',
            minWidth: '20px',
          },
        },
      },
    },
  });

  /**
   * useEffects
   */
  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  return (
    <>
      <Flex
        style={{ display: 'flex', alignItems: 'center', paddingBottom: 12 }}
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
            // color: 'gray.6', // Adjust this to match MUI's theme.palette.text.secondary
            marginBottom: 0,
          }}
        >
          Streams
        </Text>
      </Flex>

      <Paper
        style={{
          height: 'calc(100vh - 75px)',
          backgroundColor: '#27272A',
        }}
      >
        {/* Top toolbar with Remove, Assign, Auto-match, and Add buttons */}
        <Group justify="space-between" style={{ paddingLeft: 10 }}>
          <Box>
            {selectedStreamIds.length > 0 && (
              <Button
                leftSection={<IconSquarePlus size={18} />}
                variant="light"
                size="xs"
                onClick={addStreamsToChannel}
                p={5}
                color={theme.tailwind.green[5]}
                style={{
                  borderWidth: '1px',
                  borderColor: theme.tailwind.green[5],
                  color: 'white',
                }}
              >
                Add Streams to Channel
              </Button>
            )}
          </Box>

          <Box
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: 10,
            }}
          >
            <Flex gap={6}>
              <Button
                leftSection={<SquareMinus size={18} />}
                variant="default"
                size="xs"
                onClick={deleteStreams}
                disabled={selectedStreamIds.length == 0}
              >
                Remove
              </Button>

              <Button
                leftSection={<IconSquarePlus size={18} />}
                variant="default"
                size="xs"
                onClick={createChannelsFromStreams}
                p={5}
                disabled={selectedStreamIds.length == 0}
              >
                Create Channels
              </Button>

              <Button
                leftSection={<IconSquarePlus size={18} />}
                variant="light"
                size="xs"
                onClick={() => editStream()}
                p={5}
                color={theme.tailwind.green[5]}
                style={{
                  borderWidth: '1px',
                  borderColor: theme.tailwind.green[5],
                  color: 'white',
                }}
              >
                Create Stream
              </Button>
            </Flex>
          </Box>
        </Group>

        {initialDataCount === 0 && (
          <Center style={{ paddingTop: 20 }}>
            <Card
              shadow="sm"
              padding="lg"
              radius="md"
              withBorder
              style={{
                backgroundColor: '#222',
                borderColor: '#444',
                textAlign: 'center',
                width: '400px',
              }}
            >
              <Stack align="center">
                <Title order={3} style={{ color: '#d4d4d8' }}>
                  Getting started
                </Title>
                <Text size="sm" color="dimmed">
                  In order to get started, add your M3U or start <br />
                  adding custom streams.
                </Text>
                <Button
                  variant="default"
                  radius="md"
                  size="md"
                  onClick={() => navigate('/sources')}
                  style={{
                    backgroundColor: '#444',
                    color: '#d4d4d8',
                    border: '1px solid #666',
                  }}
                >
                  Add M3U
                </Button>
                <Divider label="or" labelPosition="center" color="gray" />
                <Button
                  variant="default"
                  radius="md"
                  size="md"
                  onClick={() => editStream()}
                  style={{
                    backgroundColor: '#333',
                    color: '#d4d4d8',
                    border: '1px solid #666',
                  }}
                >
                  Add Individual Stream
                </Button>
              </Stack>
            </Card>
          </Center>
        )}
        {initialDataCount > 0 && <MantineReactTable table={table} />}
      </Paper>
      <StreamForm
        stream={stream}
        isOpen={modalOpen}
        onClose={closeStreamForm}
      />
    </>
  );
};

export default StreamsTable;
