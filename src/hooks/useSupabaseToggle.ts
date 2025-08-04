import { useState, useEffect } from 'react';

// Supabase API使用の切り替えを管理するフック
export function useSupabaseToggle() {
  const [useApi, setUseApi] = useState(() => {
    // 環境変数でAPI使用を制御
    const useSupabase = import.meta.env.VITE_USE_SUPABASE === 'true';
    console.log('Supabase設定:', { useSupabase, url: import.meta.env.VITE_SUPABASE_URL });
    return useSupabase;
  });

  const [apiStatus, setApiStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');

  useEffect(() => {
    // Supabase API接続テスト
    const checkApiStatus = async () => {
      if (!useApi) {
        setApiStatus('unavailable');
        return;
      }

      try {
        // Supabaseクライアントの接続テスト
        const { supabaseApiClient } = await import('../services/supabase-api');
        await supabaseApiClient.healthCheck();
        setApiStatus('available');
      } catch (error) {
        console.warn('Supabase API not available, using mock data:', error);
        setApiStatus('unavailable');
        setUseApi(false);
      }
    };

    checkApiStatus();
  }, [useApi]);

  return {
    useApi,
    setUseApi,
    apiStatus,
    isApiAvailable: apiStatus === 'available',
    isSupabaseConnected: apiStatus === 'available',
  };
}