import React, { useEffect, useState } from 'react';
import API from '../api';
import useSettingsStore from '../store/settings';
import useUserAgentsStore from '../store/userAgents';
import useStreamProfilesStore from '../store/streamProfiles';
import {
  Accordion,
  Alert,
  Box,
  Button,
  Center,
  Flex,
  Group,
  MultiSelect,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { isNotEmpty, useForm } from '@mantine/form';
import UserAgentsTable from '../components/tables/UserAgentsTable';
import StreamProfilesTable from '../components/tables/StreamProfilesTable';
import useLocalStorage from '../hooks/useLocalStorage';
import useAuthStore from '../store/auth';
import { USER_LEVELS, NETWORK_ACCESS_OPTIONS } from '../constants';
import ConfirmationDialog from '../components/ConfirmationDialog';

const SettingsPage = () => {
  const settings = useSettingsStore((s) => s.settings);
  const userAgents = useUserAgentsStore((s) => s.userAgents);
  const streamProfiles = useStreamProfilesStore((s) => s.profiles);
  const authUser = useAuthStore((s) => s.user);

  const [accordianValue, setAccordianValue] = useState(null);
  const [networkAccessSaved, setNetworkAccessSaved] = useState(false);
  const [networkAccessConfirmOpen, setNetworkAccessConfirmOpen] =
    useState(false);
  const [netNetworkAccessConfirmCIDRs, setNetNetworkAccessConfirmCIDRs] =
    useState([]);

  // UI / local storage settings
  const [tableSize, setTableSize] = useLocalStorage('table-size', 'default');

  const regionChoices = [
    { value: 'ad', label: 'AD' },
    { value: 'ae', label: 'AE' },
    { value: 'af', label: 'AF' },
    { value: 'ag', label: 'AG' },
    { value: 'ai', label: 'AI' },
    { value: 'al', label: 'AL' },
    { value: 'am', label: 'AM' },
    { value: 'ao', label: 'AO' },
    { value: 'aq', label: 'AQ' },
    { value: 'ar', label: 'AR' },
    { value: 'as', label: 'AS' },
    { value: 'at', label: 'AT' },
    { value: 'au', label: 'AU' },
    { value: 'aw', label: 'AW' },
    { value: 'ax', label: 'AX' },
    { value: 'az', label: 'AZ' },
    { value: 'ba', label: 'BA' },
    { value: 'bb', label: 'BB' },
    { value: 'bd', label: 'BD' },
    { value: 'be', label: 'BE' },
    { value: 'bf', label: 'BF' },
    { value: 'bg', label: 'BG' },
    { value: 'bh', label: 'BH' },
    { value: 'bi', label: 'BI' },
    { value: 'bj', label: 'BJ' },
    { value: 'bl', label: 'BL' },
    { value: 'bm', label: 'BM' },
    { value: 'bn', label: 'BN' },
    { value: 'bo', label: 'BO' },
    { value: 'bq', label: 'BQ' },
    { value: 'br', label: 'BR' },
    { value: 'bs', label: 'BS' },
    { value: 'bt', label: 'BT' },
    { value: 'bv', label: 'BV' },
    { value: 'bw', label: 'BW' },
    { value: 'by', label: 'BY' },
    { value: 'bz', label: 'BZ' },
    { value: 'ca', label: 'CA' },
    { value: 'cc', label: 'CC' },
    { value: 'cd', label: 'CD' },
    { value: 'cf', label: 'CF' },
    { value: 'cg', label: 'CG' },
    { value: 'ch', label: 'CH' },
    { value: 'ci', label: 'CI' },
    { value: 'ck', label: 'CK' },
    { value: 'cl', label: 'CL' },
    { value: 'cm', label: 'CM' },
    { value: 'cn', label: 'CN' },
    { value: 'co', label: 'CO' },
    { value: 'cr', label: 'CR' },
    { value: 'cu', label: 'CU' },
    { value: 'cv', label: 'CV' },
    { value: 'cw', label: 'CW' },
    { value: 'cx', label: 'CX' },
    { value: 'cy', label: 'CY' },
    { value: 'cz', label: 'CZ' },
    { value: 'de', label: 'DE' },
    { value: 'dj', label: 'DJ' },
    { value: 'dk', label: 'DK' },
    { value: 'dm', label: 'DM' },
    { value: 'do', label: 'DO' },
    { value: 'dz', label: 'DZ' },
    { value: 'ec', label: 'EC' },
    { value: 'ee', label: 'EE' },
    { value: 'eg', label: 'EG' },
    { value: 'eh', label: 'EH' },
    { value: 'er', label: 'ER' },
    { value: 'es', label: 'ES' },
    { value: 'et', label: 'ET' },
    { value: 'fi', label: 'FI' },
    { value: 'fj', label: 'FJ' },
    { value: 'fk', label: 'FK' },
    { value: 'fm', label: 'FM' },
    { value: 'fo', label: 'FO' },
    { value: 'fr', label: 'FR' },
    { value: 'ga', label: 'GA' },
    { value: 'gb', label: 'GB' },
    { value: 'gd', label: 'GD' },
    { value: 'ge', label: 'GE' },
    { value: 'gf', label: 'GF' },
    { value: 'gg', label: 'GG' },
    { value: 'gh', label: 'GH' },
    { value: 'gi', label: 'GI' },
    { value: 'gl', label: 'GL' },
    { value: 'gm', label: 'GM' },
    { value: 'gn', label: 'GN' },
    { value: 'gp', label: 'GP' },
    { value: 'gq', label: 'GQ' },
    { value: 'gr', label: 'GR' },
    { value: 'gs', label: 'GS' },
    { value: 'gt', label: 'GT' },
    { value: 'gu', label: 'GU' },
    { value: 'gw', label: 'GW' },
    { value: 'gy', label: 'GY' },
    { value: 'hk', label: 'HK' },
    { value: 'hm', label: 'HM' },
    { value: 'hn', label: 'HN' },
    { value: 'hr', label: 'HR' },
    { value: 'ht', label: 'HT' },
    { value: 'hu', label: 'HU' },
    { value: 'id', label: 'ID' },
    { value: 'ie', label: 'IE' },
    { value: 'il', label: 'IL' },
    { value: 'im', label: 'IM' },
    { value: 'in', label: 'IN' },
    { value: 'io', label: 'IO' },
    { value: 'iq', label: 'IQ' },
    { value: 'ir', label: 'IR' },
    { value: 'is', label: 'IS' },
    { value: 'it', label: 'IT' },
    { value: 'je', label: 'JE' },
    { value: 'jm', label: 'JM' },
    { value: 'jo', label: 'JO' },
    { value: 'jp', label: 'JP' },
    { value: 'ke', label: 'KE' },
    { value: 'kg', label: 'KG' },
    { value: 'kh', label: 'KH' },
    { value: 'ki', label: 'KI' },
    { value: 'km', label: 'KM' },
    { value: 'kn', label: 'KN' },
    { value: 'kp', label: 'KP' },
    { value: 'kr', label: 'KR' },
    { value: 'kw', label: 'KW' },
    { value: 'ky', label: 'KY' },
    { value: 'kz', label: 'KZ' },
    { value: 'la', label: 'LA' },
    { value: 'lb', label: 'LB' },
    { value: 'lc', label: 'LC' },
    { value: 'li', label: 'LI' },
    { value: 'lk', label: 'LK' },
    { value: 'lr', label: 'LR' },
    { value: 'ls', label: 'LS' },
    { value: 'lt', label: 'LT' },
    { value: 'lu', label: 'LU' },
    { value: 'lv', label: 'LV' },
    { value: 'ly', label: 'LY' },
    { value: 'ma', label: 'MA' },
    { value: 'mc', label: 'MC' },
    { value: 'md', label: 'MD' },
    { value: 'me', label: 'ME' },
    { value: 'mf', label: 'MF' },
    { value: 'mg', label: 'MG' },
    { value: 'mh', label: 'MH' },
    { value: 'ml', label: 'ML' },
    { value: 'mm', label: 'MM' },
    { value: 'mn', label: 'MN' },
    { value: 'mo', label: 'MO' },
    { value: 'mp', label: 'MP' },
    { value: 'mq', label: 'MQ' },
    { value: 'mr', label: 'MR' },
    { value: 'ms', label: 'MS' },
    { value: 'mt', label: 'MT' },
    { value: 'mu', label: 'MU' },
    { value: 'mv', label: 'MV' },
    { value: 'mw', label: 'MW' },
    { value: 'mx', label: 'MX' },
    { value: 'my', label: 'MY' },
    { value: 'mz', label: 'MZ' },
    { value: 'na', label: 'NA' },
    { value: 'nc', label: 'NC' },
    { value: 'ne', label: 'NE' },
    { value: 'nf', label: 'NF' },
    { value: 'ng', label: 'NG' },
    { value: 'ni', label: 'NI' },
    { value: 'nl', label: 'NL' },
    { value: 'no', label: 'NO' },
    { value: 'np', label: 'NP' },
    { value: 'nr', label: 'NR' },
    { value: 'nu', label: 'NU' },
    { value: 'nz', label: 'NZ' },
    { value: 'om', label: 'OM' },
    { value: 'pa', label: 'PA' },
    { value: 'pe', label: 'PE' },
    { value: 'pf', label: 'PF' },
    { value: 'pg', label: 'PG' },
    { value: 'ph', label: 'PH' },
    { value: 'pk', label: 'PK' },
    { value: 'pl', label: 'PL' },
    { value: 'pm', label: 'PM' },
    { value: 'pn', label: 'PN' },
    { value: 'pr', label: 'PR' },
    { value: 'ps', label: 'PS' },
    { value: 'pt', label: 'PT' },
    { value: 'pw', label: 'PW' },
    { value: 'py', label: 'PY' },
    { value: 'qa', label: 'QA' },
    { value: 're', label: 'RE' },
    { value: 'ro', label: 'RO' },
    { value: 'rs', label: 'RS' },
    { value: 'ru', label: 'RU' },
    { value: 'rw', label: 'RW' },
    { value: 'sa', label: 'SA' },
    { value: 'sb', label: 'SB' },
    { value: 'sc', label: 'SC' },
    { value: 'sd', label: 'SD' },
    { value: 'se', label: 'SE' },
    { value: 'sg', label: 'SG' },
    { value: 'sh', label: 'SH' },
    { value: 'si', label: 'SI' },
    { value: 'sj', label: 'SJ' },
    { value: 'sk', label: 'SK' },
    { value: 'sl', label: 'SL' },
    { value: 'sm', label: 'SM' },
    { value: 'sn', label: 'SN' },
    { value: 'so', label: 'SO' },
    { value: 'sr', label: 'SR' },
    { value: 'ss', label: 'SS' },
    { value: 'st', label: 'ST' },
    { value: 'sv', label: 'SV' },
    { value: 'sx', label: 'SX' },
    { value: 'sy', label: 'SY' },
    { value: 'sz', label: 'SZ' },
    { value: 'tc', label: 'TC' },
    { value: 'td', label: 'TD' },
    { value: 'tf', label: 'TF' },
    { value: 'tg', label: 'TG' },
    { value: 'th', label: 'TH' },
    { value: 'tj', label: 'TJ' },
    { value: 'tk', label: 'TK' },
    { value: 'tl', label: 'TL' },
    { value: 'tm', label: 'TM' },
    { value: 'tn', label: 'TN' },
    { value: 'to', label: 'TO' },
    { value: 'tr', label: 'TR' },
    { value: 'tt', label: 'TT' },
    { value: 'tv', label: 'TV' },
    { value: 'tw', label: 'TW' },
    { value: 'tz', label: 'TZ' },
    { value: 'ua', label: 'UA' },
    { value: 'ug', label: 'UG' },
    { value: 'um', label: 'UM' },
    { value: 'us', label: 'US' },
    { value: 'uy', label: 'UY' },
    { value: 'uz', label: 'UZ' },
    { value: 'va', label: 'VA' },
    { value: 'vc', label: 'VC' },
    { value: 've', label: 'VE' },
    { value: 'vg', label: 'VG' },
    { value: 'vi', label: 'VI' },
    { value: 'vn', label: 'VN' },
    { value: 'vu', label: 'VU' },
    { value: 'wf', label: 'WF' },
    { value: 'ws', label: 'WS' },
    { value: 'ye', label: 'YE' },
    { value: 'yt', label: 'YT' },
    { value: 'za', label: 'ZA' },
    { value: 'zm', label: 'ZM' },
    { value: 'zw', label: 'ZW' },
  ];

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: {
      'default-user-agent': '',
      'default-stream-profile': '',
      'preferred-region': '',
      'auto-import-mapped-files': true,
      'm3u-hash-key': [],
    },

    validate: {
      'default-user-agent': isNotEmpty('Select a user agent'),
      'default-stream-profile': isNotEmpty('Select a stream profile'),
      'preferred-region': isNotEmpty('Select a region'),
    },
  });

  const networkAccessForm = useForm({
    mode: 'uncontrolled',
    initialValues: Object.keys(NETWORK_ACCESS_OPTIONS).reduce((acc, key) => {
      acc[key] = '0.0.0.0/0';
      return acc;
    }, {}),
  });

  useEffect(() => {
    if (settings) {
      const formValues = Object.entries(settings).reduce(
        (acc, [key, value]) => {
          // Modify each value based on its own properties
          switch (value.value) {
            case 'true':
              value.value = true;
              break;
            case 'false':
              value.value = false;
              break;
          }

          let val = null;
          switch (key) {
            case 'm3u-hash-key':
              val = value.value.split(',');
              break;
            default:
              val = value.value;
              break;
          }

          acc[key] = val;
          return acc;
        },
        {}
      );

      form.setValues(formValues);

      const networkAccessSettings = JSON.parse(
        settings['network-access'].value || '{}'
      );
      networkAccessForm.setValues(
        Object.keys(NETWORK_ACCESS_OPTIONS).reduce((acc, key) => {
          acc[key] = networkAccessSettings[key];
          return acc;
        }, {})
      );
    }
  }, [settings]);

  const onSubmit = async () => {
    const values = form.getValues();
    const changedSettings = {};
    for (const settingKey in values) {
      // If the user changed the setting’s value from what’s in the DB:
      if (String(values[settingKey]) !== String(settings[settingKey].value)) {
        changedSettings[settingKey] = `${values[settingKey]}`;
      }
    }

    // Update each changed setting in the backend
    for (const updatedKey in changedSettings) {
      await API.updateSetting({
        ...settings[updatedKey],
        value: changedSettings[updatedKey],
      });
    }
  };

  const onNetworkAccessSubmit = async () => {
    setNetworkAccessSaved(false);
    const check = await API.checkSetting({
      ...settings['network-access'],
      value: JSON.stringify(networkAccessForm.getValues()),
    });

    if (check.length == 0) {
      return saveNetworkAccess();
    }

    setNetNetworkAccessConfirmCIDRs(check);
    setNetworkAccessConfirmOpen(true);
  };

  const saveNetworkAccess = async () => {
    setNetworkAccessSaved(false);
    try {
      await API.updateSetting({
        ...settings['network-access'],
        value: JSON.stringify(networkAccessForm.getValues()),
      });
      setNetworkAccessSaved(true);
      setNetworkAccessConfirmOpen(false);
    } catch (e) {
      const errors = {};
      for (const key in e.body.value) {
        errors[key] = `Invalid CIDR(s): ${e.body.value[key]}`;
      }
      networkAccessForm.setErrors(errors);
    }
  };

  const onUISettingsChange = (name, value) => {
    switch (name) {
      case 'table-size':
        setTableSize(value);
        break;
    }
  };

  return (
    <Center
      style={{
        padding: 10,
      }}
    >
      <Box style={{ width: '100%', maxWidth: 800 }}>
        <Accordion
          variant="separated"
          defaultValue="ui-settings"
          onChange={setAccordianValue}
        >
          {[
            <Accordion.Item value="ui-settings">
              <Accordion.Control>UI Settings</Accordion.Control>
              <Accordion.Panel>
                <Select
                  label="Table Size"
                  value={tableSize}
                  onChange={(val) => onUISettingsChange('table-size', val)}
                  data={[
                    {
                      value: 'default',
                      label: 'Default',
                    },
                    {
                      value: 'compact',
                      label: 'Compact',
                    },
                    {
                      value: 'large',
                      label: 'Large',
                    },
                  ]}
                />
              </Accordion.Panel>
            </Accordion.Item>,
          ].concat(
            authUser.user_level == USER_LEVELS.ADMIN
              ? [
                  <Accordion.Item value="stream-settings">
                    <Accordion.Control>Stream Settings</Accordion.Control>
                    <Accordion.Panel>
                      <form onSubmit={form.onSubmit(onSubmit)}>
                        <Select
                          searchable
                          {...form.getInputProps('default-user-agent')}
                          key={form.key('default-user-agent')}
                          id={
                            settings['default-user-agent']?.id ||
                            'default-user-agent'
                          }
                          name={
                            settings['default-user-agent']?.key ||
                            'default-user-agent'
                          }
                          label={
                            settings['default-user-agent']?.name ||
                            'Default User Agent'
                          }
                          data={userAgents.map((option) => ({
                            value: `${option.id}`,
                            label: option.name,
                          }))}
                        />

                        <Select
                          searchable
                          {...form.getInputProps('default-stream-profile')}
                          key={form.key('default-stream-profile')}
                          id={
                            settings['default-stream-profile']?.id ||
                            'default-stream-profile'
                          }
                          name={
                            settings['default-stream-profile']?.key ||
                            'default-stream-profile'
                          }
                          label={
                            settings['default-stream-profile']?.name ||
                            'Default Stream Profile'
                          }
                          data={streamProfiles.map((option) => ({
                            value: `${option.id}`,
                            label: option.name,
                          }))}
                        />
                        <Select
                          searchable
                          {...form.getInputProps('preferred-region')}
                          key={form.key('preferred-region')}
                          id={
                            settings['preferred-region']?.id ||
                            'preferred-region'
                          }
                          name={
                            settings['preferred-region']?.key ||
                            'preferred-region'
                          }
                          label={
                            settings['preferred-region']?.name ||
                            'Preferred Region'
                          }
                          data={regionChoices.map((r) => ({
                            label: r.label,
                            value: `${r.value}`,
                          }))}
                        />

                        <Group
                          justify="space-between"
                          style={{ paddingTop: 5 }}
                        >
                          <Text size="sm" fw={500}>
                            Auto-Import Mapped Files
                          </Text>
                          <Switch
                            {...form.getInputProps('auto-import-mapped-files', {
                              type: 'checkbox',
                            })}
                            key={form.key('auto-import-mapped-files')}
                            id={
                              settings['auto-import-mapped-files']?.id ||
                              'auto-import-mapped-files'
                            }
                          />
                        </Group>

                        <MultiSelect
                          id="m3u-hash-key"
                          name="m3u-hash-key"
                          label="M3U Hash Key"
                          data={[
                            {
                              value: 'name',
                              label: 'Name',
                            },
                            {
                              value: 'url',
                              label: 'URL',
                            },
                            {
                              value: 'tvg_id',
                              label: 'TVG-ID',
                            },
                          ]}
                          {...form.getInputProps('m3u-hash-key')}
                          key={form.key('m3u-hash-key')}
                        />

                        <Flex
                          mih={50}
                          gap="xs"
                          justify="flex-end"
                          align="flex-end"
                        >
                          <Button
                            type="submit"
                            disabled={form.submitting}
                            variant="default"
                          >
                            Save
                          </Button>
                        </Flex>
                      </form>
                    </Accordion.Panel>
                  </Accordion.Item>,

                  <Accordion.Item value="user-agents">
                    <Accordion.Control>User-Agents</Accordion.Control>
                    <Accordion.Panel>
                      <UserAgentsTable />
                    </Accordion.Panel>
                  </Accordion.Item>,

                  <Accordion.Item value="stream-profiles">
                    <Accordion.Control>Stream Profiles</Accordion.Control>
                    <Accordion.Panel>
                      <StreamProfilesTable />
                    </Accordion.Panel>
                  </Accordion.Item>,

                  <Accordion.Item value="network-access">
                    <Accordion.Control>
                      <Box>Network Access</Box>
                      {accordianValue == 'network-access' && (
                        <Box>
                          <Text size="sm">Comma-Delimited CIDR ranges</Text>
                        </Box>
                      )}
                    </Accordion.Control>
                    <Accordion.Panel>
                      <form
                        onSubmit={networkAccessForm.onSubmit(
                          onNetworkAccessSubmit
                        )}
                      >
                        <Stack gap="sm">
                          {networkAccessSaved && (
                            <Alert
                              variant="light"
                              color="green"
                              title="Saved Successfully"
                            ></Alert>
                          )}
                          {Object.entries(NETWORK_ACCESS_OPTIONS).map(
                            ([key, config]) => {
                              return (
                                <TextInput
                                  label={config.label}
                                  {...networkAccessForm.getInputProps(key)}
                                  key={networkAccessForm.key(key)}
                                  description={config.description}
                                />
                              );
                            }
                          )}

                          <Flex
                            mih={50}
                            gap="xs"
                            justify="flex-end"
                            align="flex-end"
                          >
                            <Button
                              type="submit"
                              disabled={networkAccessForm.submitting}
                              variant="default"
                            >
                              Save
                            </Button>
                          </Flex>
                        </Stack>
                      </form>
                    </Accordion.Panel>
                  </Accordion.Item>,
                ]
              : []
          )}
        </Accordion>
      </Box>

      <ConfirmationDialog
        opened={networkAccessConfirmOpen}
        onClose={() => setNetworkAccessConfirmOpen(false)}
        onConfirm={saveNetworkAccess}
        title={`Confirm Network Access Blocks`}
        message={
          <>
            <Text>
              Your client is included in the following CIDRs and could block
              access Are you sure you want to proceed?
            </Text>

            <ul>
              {netNetworkAccessConfirmCIDRs.map((cidr) => (
                <li>{cidr}</li>
              ))}
            </ul>
          </>
        }
        confirmLabel="Save"
        cancelLabel="Cancel"
        size="md"
      />
    </Center>
  );
};

export default SettingsPage;
