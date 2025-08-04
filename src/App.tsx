import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Button } from './components/ui/button';
import { Building, SearchFilters, User, LikedBuilding, SearchHistory } from './types';
import { searchBuildings } from './utils/search';
import { useGeolocation } from './hooks/useGeolocation';
import { useLanguage } from './hooks/useLanguage';
import { useSupabaseBuildings } from './hooks/useSupabaseBuildings';
import { useSupabaseToggle } from './hooks/useSupabaseToggle';
import { Header } from './components/Header';
import { SearchForm } from './components/SearchForm';
import { BuildingCard } from './components/BuildingCard';
import { BuildingDetail } from './components/BuildingDetail';
import { Map } from './components/Map';
import { LoginModal } from './components/LoginModal';
import { AdminPanel } from './components/AdminPanel';
import { LikedBuildings } from './components/LikedBuildings';
import { SearchHistoryComponent } from './components/SearchHistory';
import { DataMigration } from './components/DataMigration';

// 建築物のslugを生成する関数
function generateSlug(building: Building): string {
  const title = building.titleEn || building.title;
  return `${building.id}-${title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .substring(0, 50)}`;
}

// slugから建築物IDを抽出する関数
function extractIdFromSlug(slug: string): number {
  const id = slug.split('-')[0];
  return parseInt(id, 10);
}

function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showDataMigration, setShowDataMigration] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [likedBuildings, setLikedBuildings] = useState<LikedBuilding[]>([]);
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  const [popularSearches] = useState<SearchHistory[]>([
    { query: '安藤忠雄', searchedAt: '', count: 45 },
    { query: '美術館', searchedAt: '', count: 38 },
    { query: '東京', searchedAt: '', count: 32 },
    { query: '現代建築', searchedAt: '', count: 28 },
    { query: 'コンクリート', searchedAt: '', count: 24 },
    { query: '隈研吾', searchedAt: '', count: 22 },
    { query: '図書館', searchedAt: '', count: 19 },
    { query: '駅舎', searchedAt: '', count: 16 }
  ]);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    radius: 5,
    architects: [],
    buildingTypes: [],
    prefectures: [],
    areas: [],
    hasPhotos: false,
    hasVideos: false,
    currentLocation: null
  });

  const { location: geoLocation, error: locationError, loading: locationLoading, getCurrentLocation } = useGeolocation();
  const { language, toggleLanguage } = useLanguage();
  const { useApi, apiStatus, isApiAvailable, isSupabaseConnected } = useSupabaseToggle();
  
  // Supabase統合: 段階的にAPI化
  const { 
    buildings, 
    loading: buildingsLoading, 
    error: buildingsError, 
    total: totalBuildings,
    refetch 
  } = useSupabaseBuildings(filters, currentPage, itemsPerPage, useApi);
  
  // 検索結果のフィルタリング（モックデータ使用時）
  const [filteredBuildings, setFilteredBuildings] = useState<Building[]>([]);

  useEffect(() => {
    if (geoLocation) {
      setFilters(prev => ({ ...prev, currentLocation: geoLocation }));
    }
  }, [geoLocation]);

  useEffect(() => {
    if (useApi) {
      // API使用時は既にフィルタリング済み
      setFilteredBuildings(buildings);
    } else {
      // モックデータ使用時はクライアントサイドフィルタリング
      const results = searchBuildings(buildings, filters);
      setFilteredBuildings(results);
    }
    setCurrentPage(1); // Reset to first page when filters change
    
    // Add to search history if there's a query
    if (filters.query.trim()) {
      const existingIndex = searchHistory.findIndex(h => h.query === filters.query);
      if (existingIndex >= 0) {
        const updated = [...searchHistory];
        updated[existingIndex] = {
          ...updated[existingIndex],
          searchedAt: new Date().toISOString(),
          count: updated[existingIndex].count + 1
        };
        setSearchHistory(updated);
      } else {
        setSearchHistory(prev => [
          { query: filters.query, searchedAt: new Date().toISOString(), count: 1 },
          ...prev.slice(0, 19) // Keep only last 20 searches
        ]);
      }
    }
  }, [useApi, buildings, filters, searchHistory]);

  const handleBuildingSelect = (building: Building) => {
    const slug = generateSlug(building);
    navigate(`/building/${slug}`, { state: { building } });
  };

  const handleLike = (buildingId: number) => {
    const building = buildings.find(b => b.id === buildingId);
    if (building && !likedBuildings.find(l => l.id === buildingId)) {
      setLikedBuildings(prev => [
        {
          id: building.id,
          title: building.title,
          titleEn: building.titleEn,
          likedAt: new Date().toISOString()
        },
        ...prev
      ]);
    }
    
    // TODO: API化時はapiClient.likeBuilding(buildingId)を呼び出し
    if (!useApi) {
      // モックデータの更新（現状維持）
      setFilteredBuildings(prev => 
        prev.map(building => 
          building.id === buildingId 
            ? { ...building, likes: building.likes + 1 }
            : building
        )
      );
    }
  };

  const handlePhotoLike = (photoId: number) => {
    // TODO: API化時はapiClient.likePhoto(photoId)を呼び出し
    if (!useApi) {
      setFilteredBuildings(prev => 
        prev.map(building => ({
          ...building,
          photos: building.photos.map(photo => 
            photo.id === photoId 
              ? { ...photo, likes: photo.likes + 1 }
              : photo
          )
        }))
      );
    }
  };

  const handleLogin = (email: string, password: string) => {
    // Mock authentication
    setIsAuthenticated(true);
    setCurrentUser({
      id: 1,
      email,
      name: email.split('@')[0],
      created_at: new Date().toISOString()
    });
    setShowLoginModal(false);
  };

  const handleRegister = (email: string, password: string, name: string) => {
    // Mock registration
    setIsAuthenticated(true);
    setCurrentUser({
      id: 1,
      email,
      name,
      created_at: new Date().toISOString()
    });
    setShowLoginModal(false);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
  };

  const handleAddBuilding = (buildingData: Partial<Building>) => {
    const newBuilding: Building = {
      id: Math.max(...filteredBuildings.map(b => b.id)) + 1,
      uid: `building_${Date.now()}`,
      title: buildingData.title || '',
      titleEn: buildingData.titleEn || '',
      thumbnailUrl: buildingData.thumbnailUrl || 'https://images.pexels.com/photos/323780/pexels-photo-323780.jpeg?auto=compress&cs=tinysrgb&w=800',
      youtubeUrl: buildingData.youtubeUrl || '',
      completionYears: buildingData.completionYears || new Date().getFullYear(),
      parentBuildingTypes: buildingData.parentBuildingTypes || [],
      buildingTypes: buildingData.buildingTypes || [],
      parentStructures: buildingData.parentStructures || [],
      structures: buildingData.structures || [],
      prefectures: buildingData.prefectures || '',
      areas: buildingData.areas || '',
      location: buildingData.location || '',
      architectDetails: buildingData.architectDetails || '',
      lat: buildingData.lat || 35.6762,
      lng: buildingData.lng || 139.6503,
      architects: buildingData.architects || [],
      photos: buildingData.photos || [],
      likes: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // TODO: API化時はapiClient.createBuilding(newBuilding)を呼び出し
    if (!useApi) {
      setFilteredBuildings(prev => [...prev, newBuilding]);
    }
  };

  const handleUpdateBuilding = (id: number, buildingData: Partial<Building>) => {
    // TODO: API化時はapiClient.updateBuilding(id, buildingData)を呼び出し
    if (!useApi) {
      setFilteredBuildings(prev => 
        prev.map(building => 
          building.id === id 
            ? { ...building, ...buildingData, updated_at: new Date().toISOString() }
            : building
        )
      );
    }
  };

  const handleDeleteBuilding = (id: number) => {
    if (window.confirm('この建築物を削除しますか？')) {
      // TODO: API化時はapiClient.deleteBuilding(id)を呼び出し
      if (!useApi) {
        setFilteredBuildings(prev => prev.filter(building => building.id !== id));
      }
    }
  };

  const handleSearchFromHistory = (query: string) => {
    setFilters(prev => ({ ...prev, query }));
  };

  const handleLikedBuildingClick = (buildingId: number) => {
    const building = filteredBuildings.find(b => b.id === buildingId);
    if (building) {
      handleBuildingSelect(building);
    }
  };

  const handleSearchAround = (lat: number, lng: number) => {
    setFilters(prev => ({
      ...prev,
      currentLocation: { lat, lng },
      radius: 2,
      query: ''
    }));
    navigate('/');
  };


  const totalPages = Math.ceil((useApi ? totalBuildings : filteredBuildings.length) / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentBuildings = useApi 
    ? filteredBuildings // API使用時は既にページング済み
    : filteredBuildings.slice(startIndex, startIndex + itemsPerPage);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header
        isAuthenticated={isAuthenticated}
        currentUser={currentUser}
        onLoginClick={() => setShowLoginModal(true)}
        onLogout={handleLogout}
        onAdminClick={() => setShowAdminPanel(true)}
        language={language}
        onLanguageToggle={toggleLanguage}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* API状態表示（開発用） */}
        {import.meta.env.DEV && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-blue-700 text-sm">
                データソース: {useApi ? 'Supabase API' : 'モックデータ'} | 状態: {apiStatus}
                {isSupabaseConnected && ' ✅'}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDataMigration(true)}
              >
                データ移行
              </Button>
              {buildingsError && (
                <span className="text-red-600 text-sm">Error: {buildingsError}</span>
              )}
            </div>
          </div>
        )}

        <SearchForm
          filters={filters}
          onFiltersChange={setFilters}
          buildings={buildings}
          location={geoLocation}
          locationError={locationError}
          locationLoading={locationLoading}
          onGetCurrentLocation={getCurrentLocation}
          language={language}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            {buildingsLoading && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="mt-2 text-muted-foreground">
                  {language === 'ja' ? '読み込み中...' : 'Loading...'}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between w-full">
              <h2 className="text-2xl font-bold text-foreground flex-shrink-0" style={{ fontSize: '1.5rem' }}>
                {language === 'ja' ? '建築物一覧' : 'Buildings'} ({filteredBuildings.length}{language === 'ja' ? '件' : ' items'})
              </h2>
              {totalPages > 1 && (
                <span className="text-sm text-muted-foreground">
                  {language === 'ja' ? `${currentPage}/${totalPages}ページ` : `Page ${currentPage}/${totalPages}`}
                </span>
              )}
            </div>

            {currentBuildings.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground text-lg">
                  {language === 'ja' ? '検索条件に合う建築物が見つかりませんでした' : 'No buildings found matching your criteria'}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {currentBuildings.map((building, index) => (
                    <BuildingCard
                      key={building.id}
                      building={building}
                      onSelect={handleBuildingSelect}
                      onLike={handleLike}
                      onPhotoLike={handlePhotoLike}
                      isSelected={false}
                      index={startIndex + index}
                      language={language}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center space-x-2 mt-8 w-full">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-4 py-2 rounded-md bg-white border border-gray-300 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      {language === 'ja' ? '前へ' : 'Previous'}
                    </button>
                    
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <button
                        key={page}
                        onClick={() => handlePageChange(page)}
                        className={`px-3 py-2 rounded-md text-sm font-medium ${
                          currentPage === page
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                    
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 rounded-md bg-white border border-gray-300 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      {language === 'ja' ? '次へ' : 'Next'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-6 lg:pl-4">
            <Map
              buildings={currentBuildings}
              selectedBuilding={null}
              onBuildingSelect={handleBuildingSelect}
              currentLocation={filters.currentLocation}
              language={language}
              startIndex={startIndex}
            />
            
            <LikedBuildings
              likedBuildings={likedBuildings}
              language={language}
              onBuildingClick={handleLikedBuildingClick}
            />
            
            <SearchHistoryComponent
              recentSearches={searchHistory}
              popularSearches={popularSearches}
              language={language}
              onSearchClick={handleSearchFromHistory}
            />
          </div>
        </div>
        {/* Centered Pagination for all screen sizes */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center space-x-2 mt-12 w-full">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-md bg-white border border-gray-300 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
            >
              {language === 'ja' ? '前へ' : 'Previous'}
            </button>
            
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => handlePageChange(page)}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentPage === page
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm'
                }`}
              >
                {page}
              </button>
            ))}
            
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 rounded-md bg-white border border-gray-300 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
            >
              {language === 'ja' ? '次へ' : 'Next'}
            </button>
          </div>
        )}
      </main>

      <footer className="bg-background border-t mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center text-sm text-muted-foreground">
            &copy; 2024-{new Date().getFullYear()} {language === 'ja' ? '建築家.com - 建築作品データベース' : 'kenchikuka.com - Architectural Works Database'}
          </div>
        </div>
      </footer>


      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={handleLogin}
        onRegister={handleRegister}
        language={language}
      />

      {isAuthenticated && (
        <AdminPanel
          isOpen={showAdminPanel}
          onClose={() => setShowAdminPanel(false)}
          buildings={filteredBuildings}
          onAddBuilding={handleAddBuilding}
          onUpdateBuilding={handleUpdateBuilding}
          onDeleteBuilding={handleDeleteBuilding}
          language={language}
        />
      )}

      {showDataMigration && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold">Supabaseデータ移行</h2>
              <Button
                variant="ghost"
                onClick={() => setShowDataMigration(false)}
              >
                ×
              </Button>
            </div>
            <div className="p-6">
              <DataMigration />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BuildingDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { language } = useLanguage();
  const { useApi } = useSupabaseToggle();
  
  // 固定フィルターをuseMemoで最適化
  const detailPageFilters = React.useMemo(() => ({
    query: '',
    radius: 5,
    architects: [],
    buildingTypes: [],
    prefectures: [],
    areas: [],
    hasPhotos: false,
    hasVideos: false,
    currentLocation: null
  }), []);
  
  const { buildings } = useSupabaseBuildings(detailPageFilters, 1, 1000, useApi);

  // URLのstateから建築物データを取得、なければslugから検索
  const building = location.state?.building || 
    (slug ? buildings.find(b => b.id === extractIdFromSlug(slug)) : null);

  const handleClose = () => {
    console.log('🔍 BuildingDetailPage handleClose called');
    console.log('🔍 About to navigate to /');
    navigate('/');
    console.log('🔍 Navigate called');
  };

  const handleLike = (buildingId: number) => {
    // Like処理（実装は省略）
    console.log('Like building:', buildingId);
  };

  const handlePhotoLike = (photoId: number) => {
    // Photo like処理（実装は省略）
    console.log('Like photo:', photoId);
  };

  const handleSearchAround = (lat: number, lng: number) => {
    navigate(`/?lat=${lat}&lng=${lng}&radius=2`);
  };

  if (!building) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">建築物が見つかりません</h1>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  // 表示インデックスを計算（簡易版）
  const displayIndex = buildings.findIndex(b => b.id === building.id) + 1;

  return (
    <div className="min-h-screen bg-background">
      <Header
        isAuthenticated={false}
        currentUser={null}
        onLoginClick={() => {}}
        onLogout={() => {}}
        onAdminClick={() => {}}
        language={language}
        onLanguageToggle={() => {}}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <BuildingDetail
          building={building}
          onClose={handleClose}
          onLike={handleLike}
          onPhotoLike={handlePhotoLike}
          language={language}
          onSearchAround={handleSearchAround}
          displayIndex={displayIndex}
        />
      </main>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/building/:slug" element={<BuildingDetailPage />} />
    </Routes>
  );
}

export default App;