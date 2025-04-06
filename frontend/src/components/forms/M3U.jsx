// Modal.js
import React, { useState, useEffect } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import API from '../../api';
import useUserAgentsStore from '../../store/userAgents';
import M3UProfiles from './M3UProfiles';
import {
  LoadingOverlay,
  TextInput,
  Button,
  Checkbox,
  Modal,
  Flex,
  Select,
  FileInput,
  useMantineTheme,
  NumberInput,
  Divider,
  Stack,
  Group,
} from '@mantine/core';
import M3UGroupFilter from './M3UGroupFilter';
import useChannelsStore from '../../store/channels';
import usePlaylistsStore from '../../store/playlists';
import { notifications } from '@mantine/notifications';

const M3U = ({ playlist = null, isOpen, onClose, playlistCreated = false }) => {
  const theme = useMantineTheme();

  const { userAgents } = useUserAgentsStore();
  const { fetchChannelGroups } = useChannelsStore();

  const [file, setFile] = useState(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [groupFilterModalOpen, setGroupFilterModalOpen] = useState(false);
  const [loadingText, setLoadingText] = useState('');

  const handleFileChange = (file) => {
    console.log(file);
    if (file) {
      setFile(file);
    }
  };

  const formik = useFormik({
    initialValues: {
      name: '',
      server_url: '',
      user_agent: `${userAgents[0].id}`,
      is_active: true,
      max_streams: 0,
      refresh_interval: 24,
    },
    validationSchema: Yup.object({
      name: Yup.string().required('Name is required'),
      user_agent: Yup.string().required('User-Agent is required'),
      max_streams: Yup.string().required('Max streams is required'),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      let newPlaylist;
      if (playlist?.id) {
        await API.updatePlaylist({
          id: playlist.id,
          ...values,
          uploaded_file: file,
        });
      } else {
        setLoadingText('Fetching groups');
        newPlaylist = await API.addPlaylist({
          ...values,
          uploaded_file: file,
        });

        notifications.show({
          title: 'Fetching M3U Groups',
          message: 'Filter out groups or refresh M3U once complete.',
          // color: 'green.5',
        });

        // Don't prompt for group filters, but keeping this here
        // in case we want to revive it
        newPlaylist = null;
      }

      resetForm();
      setFile(null);
      setSubmitting(false);
      onClose(newPlaylist);
    },
  });

  const closeGroupFilter = () => {
    setGroupFilterModalOpen(false);
    if (playlistCreated) {
      formik.resetForm();
      setFile(null);
      onClose();
    }
  };

  useEffect(() => {
    if (playlist) {
      formik.setValues({
        name: playlist.name,
        server_url: playlist.server_url,
        max_streams: playlist.max_streams,
        user_agent: playlist.user_agent,
        is_active: playlist.is_active,
        refresh_interval: playlist.refresh_interval,
      });
    } else {
      formik.resetForm();
    }
  }, [playlist]);

  useEffect(() => {
    if (playlistCreated) {
      setGroupFilterModalOpen(true);
    }
  }, [playlist, playlistCreated]);

  if (!isOpen) {
    return <></>;
  }

  return (
    <Modal size={700} opened={isOpen} onClose={onClose} title="M3U Account">
      <LoadingOverlay
        visible={formik.isSubmitting}
        overlayBlur={2}
        loaderProps={loadingText ? { children: loadingText } : {}}
      />

      <form onSubmit={formik.handleSubmit}>
        <Group justify="space-between" align="top">
          <Stack gap="5" style={{ flex: 1 }}>
            <TextInput
              fullWidth
              id="name"
              name="name"
              label="Name"
              value={formik.values.name}
              onChange={formik.handleChange}
              error={formik.touched.name && Boolean(formik.errors.name)}
              helperText={formik.touched.name && formik.errors.name}
            />

            <TextInput
              fullWidth
              id="server_url"
              name="server_url"
              label="URL"
              value={formik.values.server_url}
              onChange={formik.handleChange}
              error={
                formik.touched.server_url && Boolean(formik.errors.server_url)
              }
              helperText={formik.touched.server_url && formik.errors.server_url}
            />

            <FileInput
              id="uploaded_file"
              label="Upload files"
              placeholder="Upload files"
              value={formik.uploaded_file}
              onChange={handleFileChange}
            />
          </Stack>

          <Divider size="sm" orientation="vertical" />

          <Stack gap="5" style={{ flex: 1 }}>
            <TextInput
              fullWidth
              id="max_streams"
              name="max_streams"
              label="Max Streams"
              placeholder="0 = Unlimited"
              value={formik.values.max_streams}
              onChange={formik.handleChange}
              error={
                formik.errors.max_streams ? formik.touched.max_streams : ''
              }
            />

            <Select
              id="user_agent"
              name="user_agent"
              label="User-Agent"
              value={formik.values.user_agent}
              onChange={formik.handleChange}
              error={formik.errors.user_agent ? formik.touched.user_agent : ''}
              data={userAgents.map((ua) => ({
                label: ua.name,
                value: `${ua.id}`,
              }))}
            />

            <NumberInput
              label="Refresh Interval (hours)"
              value={formik.values.refresh_interval}
              onChange={(value) => {
                formik.setFieldValue('refresh_interval', value);
              }}
              error={
                formik.errors.refresh_interval
                  ? formik.touched.refresh_interval
                  : ''
              }
            />

            <Checkbox
              label="Is Active"
              name="is_active"
              checked={formik.values.is_active}
              onChange={(e) =>
                formik.setFieldValue('is_active', e.target.checked)
              }
            />
          </Stack>
        </Group>

        <Flex mih={50} gap="xs" justify="flex-end" align="flex-end">
          {playlist && (
            <>
              <Button
                variant="filled"
                // color={theme.custom.colors.buttonPrimary}
                size="sm"
                onClick={() => setGroupFilterModalOpen(true)}
              >
                Groups
              </Button>
              <Button
                variant="filled"
                // color={theme.custom.colors.buttonPrimary}
                size="sm"
                onClick={() => setProfileModalOpen(true)}
              >
                Profiles
              </Button>
            </>
          )}

          <Button
            type="submit"
            variant="filled"
            // color={theme.custom.colors.buttonPrimary}
            disabled={formik.isSubmitting}
            size="sm"
          >
            Save
          </Button>
        </Flex>
        {playlist && (
          <>
            <M3UProfiles
              playlist={playlist}
              isOpen={profileModalOpen}
              onClose={() => setProfileModalOpen(false)}
            />
            <M3UGroupFilter
              isOpen={groupFilterModalOpen}
              playlist={playlist}
              onClose={closeGroupFilter}
            />
          </>
        )}
      </form>
    </Modal>
  );
};

export default M3U;
