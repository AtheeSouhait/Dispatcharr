import { create } from 'zustand';
import api from '../api';
import { notifications } from '@mantine/notifications';
import API from '../api';

const useChannelsTableStore = create((set, get) => ({
  channels: [],
  pageCount: 0,
  totalCount: 0,
  sorting: [{ id: 'channel_number', desc: false }],
  pagination: {
    pageIndex: 0,
    pageSize: JSON.parse(localStorage.getItem('channel-table-prefs'))?.pageSize || 50,
  },
  selectedChannelIds: [],
  allQueryIds: [],

  queryChannels: ({ results, count }, params) => {
    set((state) => {
      return {
        channels: results,
        totalCount: count,
        pageCount: Math.ceil(count / params.get('page_size')),
      };
    });
  },

  setAllQueryIds: (allQueryIds) => {
    set((state) => ({
      allQueryIds,
    }));
  },

  setSelectedChannelIds: (selectedChannelIds) => {
    set({
      selectedChannelIds,
    });
  },

  getChannelStreams: (id) => {
    const channel = get().channels.find((c) => c.id === id);
    return channel?.streams ?? [];
  },

  setPagination: (pagination) => {
    set((state) => ({
      pagination,
    }));
  },

  setSorting: (sorting) => {
    set((state) => ({
      sorting,
    }));
  },
}));

export default useChannelsTableStore;
