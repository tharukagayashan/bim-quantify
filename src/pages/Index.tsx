import { useState, useCallback, useMemo } from 'react';
import { Ruler, Box, Move, Layers, Building2, Activity, Pencil, Check, X } from 'lucide-react';
import { motion } from 'framer-motion';
import StatsCard from '@/components/StatsCard';
import UploadZone from '@/components/UploadZone';
import BuildingHierarchy from '@/components/BuildingHierarchy';
import ElementList from '@/components/ElementList';
import IFCViewer from '@/components/IFCViewer';
import { parseIFCFile, extractIFCGeometry, type IFCBuildingData, type IFCMeshData } from '@/lib/ifc-parser';

const Index = () => {
  const [buildingData, setBuildingData] = useState<IFCBuildingData | null>(null);
  const [allMeshes, setAllMeshes] = useState<IFCMeshData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedStoreyID, setSelectedStoreyID] = useState<number | null>(null);
  const [areaOverrides, setAreaOverrides] = useState<Record<number, number>>({});
  const [editingStoreyID, setEditingStoreyID] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleFileSelected = useCallback(async (file: File) => {
    setIsLoading(true);
    setFileName(file.name);
    setSelectedStoreyID(null);
    try {
      const buffer = await file.arrayBuffer();
      const [data, geometry] = await Promise.all([
        parseIFCFile(buffer),
        extractIFCGeometry(buffer),
      ]);
      setBuildingData(data);
      setAllMeshes(geometry);
    } catch (error) {
      console.error('Error parsing IFC file:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Filter meshes by selected storey
  const filteredMeshes = useMemo(() => {
    if (!selectedStoreyID || !buildingData) return allMeshes;
    const storey = buildingData.storeys.find(s => s.expressID === selectedStoreyID);
    if (!storey) return allMeshes;
    const allowedIDs = new Set(storey.elementIDs);
    console.log(`[Filter] Storey "${storey.name}" has ${allowedIDs.size} element IDs, total meshes: ${allMeshes.length}`);
    // Log a sample of mesh expressIDs vs allowed IDs
    if (allMeshes.length > 0) {
      const sampleMeshIDs = allMeshes.slice(0, 5).map(m => m.expressID);
      const sampleAllowedIDs = [...allowedIDs].slice(0, 5);
      console.log(`[Filter] Sample mesh expressIDs: ${sampleMeshIDs.join(', ')}`);
      console.log(`[Filter] Sample allowed IDs: ${sampleAllowedIDs.join(', ')}`);
    }
    const result = allMeshes.filter(m => allowedIDs.has(m.expressID));
    console.log(`[Filter] Filtered to ${result.length} meshes`);
    return result;
  }, [allMeshes, selectedStoreyID, buildingData]);

  const getStoreyArea = (storeyExpressID: number): number | null => {
    if (areaOverrides[storeyExpressID] != null) return areaOverrides[storeyExpressID];
    if (!buildingData) return null;
    const space = buildingData.spaces?.find(s => s.id === storeyExpressID);
    if (!space) return null;
    return (space.maxX - space.minX) * (space.maxZ - space.minZ);
  };

  const totalOverriddenGFA = useMemo(() => {
    if (!buildingData) return null;
    let total = 0;
    for (const storey of buildingData.storeys) {
      const area = getStoreyArea(storey.expressID);
      if (area != null) total += area;
    }
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingData, areaOverrides]);

  const handleStartEdit = (storeyID: number) => {
    const current = getStoreyArea(storeyID);
    setEditValue(current != null ? current.toFixed(2) : '');
    setEditingStoreyID(storeyID);
  };

  const handleConfirmEdit = (storeyID: number) => {
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed) && parsed >= 0) {
      setAreaOverrides(prev => ({ ...prev, [storeyID]: parsed }));
    }
    setEditingStoreyID(null);
  };

  const handleCancelEdit = () => {
    setEditingStoreyID(null);
  };

  const formatValue = (val: number | null): string => {
    if (val == null) return 'N/A';
    return val.toLocaleString('en-US', { maximumFractionDigits: 2 });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 size={22} className="text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground tracking-tight">
                BIM Model Analyzer
              </h1>
              <p className="text-xs text-muted-foreground">
                IFC Quantity Takeoff & 3D Preview
              </p>
            </div>
          </div>
          {fileName && (
            <motion.div
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-sm text-secondary-foreground"
            >
              <Activity size={14} className="text-primary" />
              <span className="font-mono text-xs">{fileName}</span>
            </motion.div>
          )}
        </div>
      </header>

      <div className="flex h-[calc(100vh-65px)]">
        {/* Sidebar */}
        <aside className="w-72 border-r border-border bg-card/30 flex flex-col">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground mb-3">Upload Model</h2>
            <UploadZone onFileSelected={handleFileSelected} isLoading={isLoading} />
          </div>
          <div className="flex-1 overflow-auto">
            <div className="p-4 pb-2">
              <h2 className="text-sm font-semibold text-foreground mb-2">Building Hierarchy</h2>
            </div>
            <BuildingHierarchy
              data={buildingData}
              selectedStoreyID={selectedStoreyID}
              onSelectStorey={setSelectedStoreyID}
            />
            <div className="p-4 pb-2 border-t border-border mt-2">
              <h2 className="text-sm font-semibold text-foreground mb-2">Elements</h2>
            </div>
            <ElementList elements={buildingData?.elements ?? []} />
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4 p-6 pb-2">
            <StatsCard title="Gross Floor Area" value={formatValue(totalOverriddenGFA ?? buildingData?.grossFloorArea ?? null)} unit="m²" icon={Ruler} delay={0} />
            <StatsCard title="Total Volume" value={formatValue(buildingData?.totalVolume ?? null)} unit="m³" icon={Box} delay={0.1} />
            <StatsCard title="Building Perimeter" value={formatValue(buildingData?.perimeter ?? null)} unit="m" icon={Move} delay={0.2} />
            <StatsCard title="Total Storeys" value={buildingData?.storeyCount ?? 'N/A'} unit="floors" icon={Layers} delay={0.3} />
          </div>

          {/* Per-Storey Floor Area Breakdown */}
          {buildingData && buildingData.storeys.length > 0 && (
            <motion.div
              className="mx-6 mb-4 p-3 rounded-lg border border-border bg-card/50"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Layers size={14} className="text-primary" />
                <span className="text-xs font-semibold text-foreground">Floor Area by Storey</span>
                <span className="text-[10px] text-muted-foreground ml-1">(click pencil to edit)</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {buildingData.storeys.map((storey) => {
                  const area = getStoreyArea(storey.expressID);
                  const isEditing = editingStoreyID === storey.expressID;
                  const isOverridden = areaOverrides[storey.expressID] != null;
                  return (
                    <div
                      key={storey.expressID}
                      className={`group flex flex-col px-2.5 py-1.5 rounded-md text-xs ${isOverridden ? 'bg-primary/10 border border-primary/20' : 'bg-secondary/50'}`}
                    >
                      <span className="text-muted-foreground truncate">{storey.name}</span>
                      {isEditing ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleConfirmEdit(storey.expressID);
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                            className="w-full bg-background border border-border rounded px-1 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                            autoFocus
                          />
                          <button onClick={() => handleConfirmEdit(storey.expressID)} className="text-primary hover:text-primary/80">
                            <Check size={12} />
                          </button>
                          <button onClick={handleCancelEdit} className="text-muted-foreground hover:text-foreground">
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono font-semibold text-foreground">
                            {area != null ? formatValue(area) + ' m²' : 'N/A'}
                          </span>
                          <button
                            onClick={() => handleStartEdit(storey.expressID)}
                            className="opacity-0 group-hover:opacity-100 hover:text-primary text-muted-foreground transition-opacity"
                          >
                            <Pencil size={10} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* 3D Viewer */}
          <div className="flex-1 px-6 pb-6">
            <IFCViewer meshes={filteredMeshes} elements={buildingData?.elements} spaces={buildingData?.spaces} />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;
