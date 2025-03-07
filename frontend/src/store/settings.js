import { create } from 'zustand';
import api from '../api';

const useSettingsStore = create((set) => ({
  settings: {},
  environment: {},
  isLoading: false,
  error: null,

  fetchSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const settings = await api.getSettings();
      const env = await api.getEnvironmentSettings();
      set({
        settings: settings.reduce((acc, setting) => {
          acc[setting.key] = setting;
          return acc;
        }, {}),
        isLoading: false,
        environment: env,
      });
    } catch (error) {
      set({ error: 'Failed to load settings.', isLoading: false });
    }
  },

  updateSetting: (setting) =>
    set((state) => ({
      settings: { ...state.settings, [setting.key]: setting },
    })),
}));

export default useSettingsStore;
