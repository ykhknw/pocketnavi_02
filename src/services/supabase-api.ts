import { supabase } from '../lib/supabase'
import { Building, SearchFilters, Architect, Photo } from '../types'

export class SupabaseApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'SupabaseApiError';
  }
}

class SupabaseApiClient {
  // 建築物関連API
  async getBuildings(page: number = 1, limit: number = 10): Promise<{ buildings: Building[], total: number }> {
    const start = (page - 1) * limit;
    const end = start + limit - 1;

    const { data: buildings, error, count } = await supabase
      .from('buildings_table_2')
      .select(`
        *,
        building_architects!inner(
          architects_table(*)
        ),
        photos(*)
      `)
      .range(start, end)
      .order('completionYears', { ascending: true });

    if (error) {
      throw new SupabaseApiError(500, error.message);
    }

    // データ変換
    const transformedBuildings = buildings?.map(this.transformBuilding) || [];

    return {
      buildings: transformedBuildings,
      total: count || 0
    };
  }

  async getBuildingById(id: number): Promise<Building> {
    const { data: building, error } = await supabase
      .from('buildings_table_2')
      .select(`
        *,
        building_architects!inner(
          architects_table(*)
        ),
        photos(*)
      `)
      .eq('building_id', id)
      .single();

    if (error) {
      throw new SupabaseApiError(404, error.message);
    }

    return this.transformBuilding(building);
  }

  async searchBuildings(filters: SearchFilters): Promise<{ buildings: Building[], total: number }> {
    let query = supabase
      .from('buildings_table_2')
      .select(`
        *,
        building_architects!inner(
          architects_table(*)
        ),
        photos(*)
      `, { count: 'exact' });

    // テキスト検索
    if (filters.query.trim()) {
      query = query.or(`title.ilike.%${filters.query}%,titleEn.ilike.%${filters.query}%,location.ilike.%${filters.query}%`);
    }

    // 都道府県フィルター
    if (filters.prefectures.length > 0) {
      query = query.in('prefectures', filters.prefectures);
    }

    // 写真フィルター
    if (filters.hasPhotos) {
      query = query.not('thumbnailUrl', 'is', null);
    }

    // 動画フィルター
    if (filters.hasVideos) {
      query = query.not('youtubeUrl', 'is', null);
    }

    // 地理位置フィルター（PostGISを使用する場合）
    if (filters.currentLocation) {
      // 簡易的な距離計算（より正確にはPostGIS使用）
      const { lat, lng } = filters.currentLocation;
      const radius = filters.radius;
      
      query = query.gte('lat', lat - radius * 0.009)
               .lte('lat', lat + radius * 0.009)
               .gte('lng', lng - radius * 0.011)
               .lte('lng', lng + radius * 0.011);
    }

    const { data: buildings, error, count } = await query
      .order('completionYears', { ascending: true });

    if (error) {
      throw new SupabaseApiError(500, error.message);
    }

    const transformedBuildings = buildings?.map(this.transformBuilding) || [];

    return {
      buildings: transformedBuildings,
      total: count || 0
    };
  }

  async getNearbyBuildings(lat: number, lng: number, radius: number): Promise<Building[]> {
    // PostGISを使用した地理空間検索（Supabaseで有効化必要）
    const { data: buildings, error } = await supabase
      .rpc('nearby_buildings', {
        lat,
        lng,
        radius_km: radius
      });

    if (error) {
      // フォールバック: 簡易的な範囲検索
      return this.searchBuildings({
        query: '',
        radius,
        architects: [],
        buildingTypes: [],
        prefectures: [],
        areas: [],
        hasPhotos: false,
        hasVideos: false,
        currentLocation: { lat, lng }
      }).then(result => result.buildings);
    }

    return buildings?.map(this.transformBuilding) || [];
  }

  // いいね機能
  async likeBuilding(buildingId: number): Promise<{ likes: number }> {
    const { data, error } = await supabase
      .rpc('increment_building_likes', { building_id: buildingId });

    if (error) {
      throw new SupabaseApiError(500, error.message);
    }

    return { likes: data };
  }

  async likePhoto(photoId: number): Promise<{ likes: number }> {
    const { data, error } = await supabase
      .rpc('increment_photo_likes', { photo_id: photoId });

    if (error) {
      throw new SupabaseApiError(500, error.message);
    }

    return { likes: data };
  }

  // 建築家関連
  async getArchitects(): Promise<Architect[]> {
    const { data: architects, error } = await supabase
      .from('architects_table')
      .select('*')
      .order('architectJa');

    if (error) {
      throw new SupabaseApiError(500, error.message);
    }

    return architects?.map(arch => ({
      architect_id: arch.architect_id,
      architectJa: arch.architectJa,
      architectEn: arch.architectEn || arch.architectJa,
      websites: [] // TODO: architect_websites_3テーブルから取得
    })) || [];
  }

  // 建築家のウェブサイト情報を取得
  async getArchitectWebsites(architectId: number) {
    const { data: websites, error } = await supabase
      .from('architect_websites_3')
      .select('*')
      .eq('architect_id', architectId);

    if (error) {
      return [];
    }

    return websites?.map(site => ({
      website_id: site.website_id,
      url: site.url,
      title: site.title,
      invalid: site.invalid,
      architectJa: site.architectJa,
      architectEn: site.architectEn
    })) || [];
  }

  // 統計・検索候補
  async getSearchSuggestions(query: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('buildings_table_2')
      .select('title, titleEn')
      .or(`title.ilike.%${query}%,titleEn.ilike.%${query}%`)
      .limit(10);

    if (error) {
      return [];
    }

    const suggestions = new Set<string>();
    data?.forEach(item => {
      if (item.title.toLowerCase().includes(query.toLowerCase())) {
        suggestions.add(item.title);
      }
      if (item.titleEn?.toLowerCase().includes(query.toLowerCase())) {
        suggestions.add(item.titleEn);
      }
    });

    return Array.from(suggestions);
  }

  async getPopularSearches(): Promise<{ query: string; count: number }[]> {
    // 検索ログテーブルがある場合
    const { data, error } = await supabase
      .from('search_logs')
      .select('query, count')
      .order('count', { ascending: false })
      .limit(10);

    if (error) {
      // フォールバック: 固定の人気検索
      return [
        { query: '安藤忠雄', count: 45 },
        { query: '美術館', count: 38 },
        { query: '東京', count: 32 },
        { query: '現代建築', count: 28 }
      ];
    }

    return data || [];
  }

  // ヘルスチェック
  async healthCheck(): Promise<{ status: string; database: string }> {
    const { data, error } = await supabase
      .from('buildings_table_2')
      .select('count')
      .limit(1);

    if (error) {
      throw new SupabaseApiError(500, 'Database connection failed');
    }

    return {
      status: 'ok',
      database: 'supabase'
    };
  }

  // データ変換ヘルパー
  private transformBuilding(data: any): Building {
    // buildingTypesなどのカンマ区切り文字列を配列に変換
    const parseCommaSeparated = (str: string | null): string[] => {
      if (!str) return [];
      return str.split(',').map(s => s.trim()).filter(s => s.length > 0);
    };

    // completionYearsを数値に変換
    const parseYear = (year: string | null): number => {
      if (!year) return new Date().getFullYear();
      const parsed = parseInt(year, 10);
      return isNaN(parsed) ? new Date().getFullYear() : parsed;
    };

    return {
      id: data.building_id,
      uid: data.uid,
      title: data.title,
      titleEn: data.titleEn || data.title,
      thumbnailUrl: data.thumbnailUrl || '',
      youtubeUrl: data.youtubeUrl || '',
      completionYears: parseYear(data.completionYears),
      parentBuildingTypes: parseCommaSeparated(data.parentBuildingTypes),
      buildingTypes: parseCommaSeparated(data.buildingTypes),
      parentStructures: parseCommaSeparated(data.parentStructures),
      structures: parseCommaSeparated(data.structures),
      prefectures: data.prefectures,
      areas: data.areas,
      location: data.location,
      architectDetails: data.architectDetails || '',
      lat: parseFloat(data.lat) || 0,
      lng: parseFloat(data.lng) || 0,
      architects: data.building_architects?.map((ba: any) => ({
        architect_id: ba.architects_table.architect_id,
        architectJa: ba.architects_table.architectJa,
        architectEn: ba.architects_table.architectEn || ba.architects_table.architectJa,
        websites: [] // TODO: 必要に応じてarchitect_websites_3から取得
      })) || [],
      photos: [], // photosテーブルがない場合は空配列
      likes: 0, // likesカラムがない場合は0
      created_at: data.created_at || new Date().toISOString(),
      updated_at: data.updated_at || new Date().toISOString()
    };
  }
}

export const supabaseApiClient = new SupabaseApiClient();